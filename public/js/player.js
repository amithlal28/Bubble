/* ═══════════════════════════════════════════════════════════════════
   BUBBLE AUDIO ENGINE (v4 - Bulletproof Single-Instance Engine)
   - Zero-ghost audio singleton architecture
   - Monotonic sequence ID guards to prevent async race conditions
   - Instant response & debounced navigation
   - Infinite Radio with smart multi-seed recommendations
   - Native Lossless stream playback with auto-recovery
   ═══════════════════════════════════════════════════════════════════ */

window.BubblePlayer = (() => {
  let currentTrack = null;
  let sound = null;
  let masterAudio = null; // Master singleton HTMLAudioElement
  let queue = [];
  let originalQueue = [];
  let queueIndex = -1;
  let isPlaying = false;
  let isLoading = false;
  let isSwitching = false;
  let switchTimeout = null;
  let playSequenceId = 0; // Monotonic sequence ID to prevent race conditions during track switches
  let isShuffle = false;
  let repeatMode = 'off'; // 'off', 'all', 'one'
  let lastNavTime = 0;

  // Infinite Radio state
  let isRadioMode = false;
  let radioPending = false;
  let radioSeedHistory = [];
  const seenRadioKeys = new Set();

  let volume = 0.8;
  let seekInterval = null;

  // Pre-fetched stream URLs (keyed by track id): { url, source, quality, fetchedAt }
  const prefetchedUrls = new Map();

  // Web Audio for EQ
  let eqValues = [0, 0, 0, 0, 0];
  const EQ_LABELS = ['60', '230', '910', '3.6k', '14k'];

  // Callbacks
  const listeners = {
    play: [], pause: [], trackChange: [], progress: [], queueChange: [], shuffleChange: [], repeatChange: [], end: []
  };

  function on(event, cb) { if (listeners[event]) listeners[event].push(cb); }
  function emit(event, data) { (listeners[event] || []).forEach(cb => { try { cb(data); } catch (e) { console.error('Listener error:', e); } }); }

  function formatTime(secs) {
    if (!secs || isNaN(secs)) return '0:00';
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  }

  function getTrackKey(t) {
    if (!t) return '';
    const norm = (str) => (str || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    return `${norm(t.artist)}_${norm(t.title)}`;
  }

  function resetSwitchGuard() {
    isSwitching = false;
    if (switchTimeout) {
      clearTimeout(switchTimeout);
      switchTimeout = null;
    }
  }

  function startSwitchGuard() {
    isSwitching = true;
    if (switchTimeout) clearTimeout(switchTimeout);
    switchTimeout = setTimeout(() => {
      if (isSwitching) {
        console.warn('[BubblePlayer] Switch guard timed out, releasing lock');
        isSwitching = false;
      }
    }, 8000);
  }

  /**
   * Unconditionally halts and destroys any active audio instances across
   * the entire page to guarantee ZERO concurrent audio streams.
   */
  function stopAllAudio() {
    // 1. Terminate any Howler instances if present
    if (typeof Howler !== 'undefined') {
      try {
        Howler.stop();
        Howler.unload();
      } catch (e) { /* ignore */ }
    }

    // 2. Stop and purge previous sound wrapper
    const old = sound;
    sound = null;
    if (old) {
      try {
        if (typeof old.stop === 'function') old.stop();
        if (typeof old.unload === 'function') old.unload();
      } catch (e) { /* ignore */ }
    }

    // 3. Stop and purge master HTMLAudioElement
    if (masterAudio) {
      try {
        masterAudio.onplay = null;
        masterAudio.onpause = null;
        masterAudio.onended = null;
        masterAudio.onerror = null;
        masterAudio.onstalled = null;
        masterAudio.ontimeupdate = null;
        masterAudio.pause();
        masterAudio.removeAttribute('src');
        masterAudio.load();
      } catch (e) { /* ignore */ }
      masterAudio = null;
    }
  }

  function startSeekUpdate() {
    clearInterval(seekInterval);
    seekInterval = setInterval(() => {
      if (!sound || !isPlaying) return;
      try {
        const current = sound.seek ? sound.seek() : 0;
        const total = sound.duration ? sound.duration() : (currentTrack?.duration || 0);
        if (current >= 0 && total > 0) {
          emit('progress', { current, total, pct: current / total });
        }
      } catch (e) { /* ignore */ }
    }, 250);
  }

  function updateMediaSession(track) {
    if (!('mediaSession' in navigator) || !track) return;
    try {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: track.title || 'Untitled',
        artist: track.artist || 'Unknown Artist',
        album: track.album || '',
        artwork: track.artwork_url ? [
          { src: track.artwork_url, sizes: '512x512', type: 'image/jpeg' }
        ] : []
      });
      navigator.mediaSession.setActionHandler('play', () => toggle());
      navigator.mediaSession.setActionHandler('pause', () => toggle());
      navigator.mediaSession.setActionHandler('previoustrack', () => prev());
      navigator.mediaSession.setActionHandler('nexttrack', () => next());
      navigator.mediaSession.setActionHandler('seekto', (details) => {
        if (details.seekTime !== undefined) seekTo(details.seekTime);
      });
    } catch (e) { /* ignore */ }
  }

  /* ── Core: Load and play track with atomic single-stream guarantee ── */
  async function loadAndPlay(track, isRetry = false) {
    if (!track) {
      resetSwitchGuard();
      isLoading = false;
      return;
    }

    // Monotonic sequence token: Discards any stale in-flight requests
    const currentSeq = ++playSequenceId;
    startSwitchGuard();
    stopAllAudio();
    clearInterval(seekInterval);
    currentTrack = track;
    isLoading = true;
    isPlaying = false;

    // Track in seen keys for radio discovery
    const key = getTrackKey(track);
    if (key) seenRadioKeys.add(key);

    emit('trackChange', { track, loading: true });

    let src = null;

    // 1. Local file check
    if (track.file_path && typeof stash !== 'undefined' && stash.fs?.getFileUrl) {
      src = await stash.fs.getFileUrl(track.file_path).catch(() => null);
    }

    // 2. Pre-fetched / existing stream_url freshness check
    if (!src && track.stream_url && !isRetry) {
      const prefetched = prefetchedUrls.get(track.id);
      const isFresh = prefetched && (Date.now() - prefetched.fetchedAt < 180000); // 3 mins fresh
      if (isFresh || (track.source === 'local') || (!prefetched && !track.stream_url.includes('arcod.xyz') && !track.stream_url.includes('googlevideo.com'))) {
        src = track.stream_url;
      }
    }

    // 3. Resolve live stream URL from music resolver
    if (!src || isRetry) {
      try {
        if (typeof stash !== 'undefined' && stash.music?.getStreamUrl) {
          const streamInfo = await stash.music.getStreamUrl(track).catch(() => null);
          if (currentSeq !== playSequenceId) return; // Discard stale request

          if (streamInfo && streamInfo.url) {
            src = streamInfo.url;
            track.stream_url = streamInfo.url;
            if (streamInfo.quality) track.quality = streamInfo.quality;
            if (streamInfo.source) track.source = streamInfo.source;
            prefetchedUrls.set(track.id, {
              url: streamInfo.url,
              source: streamInfo.source,
              quality: streamInfo.quality,
              fetchedAt: Date.now()
            });
          } else if (streamInfo?.error === 'youtube_disabled') {
            handlePlaybackError(track, 'Strict Lossless Mode: Track not available in Lossless', false);
            return;
          } else {
            handlePlaybackError(track, 'No playable stream found', !isRetry);
            return;
          }
        } else {
          handlePlaybackError(track, 'Music engine unavailable', false);
          return;
        }
      } catch (err) {
        if (currentSeq !== playSequenceId) return;
        handlePlaybackError(track, 'Streaming error: ' + err.message, !isRetry);
        return;
      }
    }

    if (!src) {
      handlePlaybackError(track, 'No audio source available', !isRetry);
      return;
    }

    if (currentSeq !== playSequenceId) return; // Stale check

    // Error handling helper
    function onAudioLoadError(errInfo) {
      if (currentSeq !== playSequenceId) return;
      console.warn('[BubblePlayer] Audio stream error for:', track.title, errInfo);
      if (!isRetry) {
        console.log('[BubblePlayer] Retrying stream resolution with fresh URL...');
        prefetchedUrls.delete(track.id);
        delete track.stream_url;
        loadAndPlay(track, true);
      } else {
        handlePlaybackError(track, 'Failed to play track (skipped)', false);
      }
    }

    // Initialize the master HTMLAudioElement
    stopAllAudio(); // Ensure clean slate before instantiating
    const audio = new Audio();
    masterAudio = audio;
    audio.preload = 'auto';
    audio.volume = volume;
    audio.src = src;

    audio.onplay = () => {
      if (currentSeq !== playSequenceId) {
        audio.pause();
        audio.removeAttribute('src');
        return;
      }
      isPlaying = true;
      isLoading = false;
      resetSwitchGuard();
      currentTrack = track;
      emit('play', { track: currentTrack });
      startSeekUpdate();
      if (typeof BubbleDB !== 'undefined' && BubbleDB.updatePlayCount) {
        BubbleDB.updatePlayCount(track.id).catch(() => {});
      }
      updateMediaSession(track);
    };

    audio.onpause = () => {
      if (currentSeq !== playSequenceId) return;
      isPlaying = false;
      emit('pause', { track: currentTrack });
    };

    audio.onended = () => {
      if (currentSeq !== playSequenceId) return;
      isPlaying = false;
      emit('end', { track: currentTrack });
      handleTrackEnd();
    };

    audio.onerror = (e) => {
      if (currentSeq !== playSequenceId) return;
      onAudioLoadError(e);
    };

    // Public sound wrapper
    sound = {
      _audio: audio,
      play: () => {
        if (currentSeq !== playSequenceId) return;
        const playPromise = audio.play();
        if (playPromise !== undefined) {
          playPromise.catch(e => {
            if (currentSeq === playSequenceId && audio.paused) {
              console.warn('[BubblePlayer] Play call error:', e);
            }
          });
        }
      },
      pause: () => {
        try { audio.pause(); } catch (e) {}
      },
      stop: () => {
        try {
          audio.pause();
          audio.currentTime = 0;
        } catch (e) {}
      },
      seek: (pos) => {
        if (pos !== undefined && !isNaN(pos)) {
          try { audio.currentTime = pos; } catch (e) {}
        }
        return audio.currentTime || 0;
      },
      duration: () => audio.duration || track.duration || 0,
      volume: (v) => {
        if (v !== undefined) {
          volume = Math.max(0, Math.min(1, v));
          audio.volume = volume;
        }
        return audio.volume;
      },
      playing: () => !audio.paused && !audio.ended,
      unload: () => {
        audio.pause();
        audio.onplay = null;
        audio.onpause = null;
        audio.onended = null;
        audio.onerror = null;
        audio.removeAttribute('src');
        audio.load();
      }
    };

    isLoading = false;
    emit('trackChange', { track });

    // Begin playback
    sound.play();

    // Check if Radio queue needs refilling
    checkRadioRefill();

    // Pre-fetch next track
    prefetchNextTrack();
  }

  /** Centralized error handler with graceful auto-skip */
  function handlePlaybackError(track, message, shouldRetry = false) {
    resetSwitchGuard();
    isLoading = false;
    isPlaying = false;
    console.error(`[BubblePlayer] ${message} for "${track?.title}"`);
    emit('trackChange', { track, error: message });

    if (window.BubbleApp?.toast) {
      BubbleApp.toast(`${message}: ${track?.title || 'track'}`, 'warning');
    }

    // Automatically advance to next track after 800ms
    setTimeout(() => {
      if (queue.length > 1 || isRadioMode) {
        next();
      }
    }, 800);
  }

  /** Background pre-fetch: resolve the next queue tracks' URLs (up to 2) sequentially */
  async function prefetchNextTrack() {
    if (repeatMode === 'one') return;
    
    // Fetch up to next 2 tracks sequentially to avoid backend rate-limits (lossless APIs)
    for (let i = 1; i <= 2; i++) {
      let nextIdx = queueIndex + i;
      if (nextIdx >= queue.length) {
        if (repeatMode === 'all') nextIdx = nextIdx % queue.length;
        else continue;
      }
      if (nextIdx === queueIndex) continue;
      
      const nextTrack = queue[nextIdx];
      if (!nextTrack || nextTrack.file_path || nextTrack.stream_url || prefetchedUrls.has(nextTrack.id)) continue;

      prefetchedUrls.set(nextTrack.id, { status: 'pending', fetchedAt: Date.now() });
      if (typeof stash !== 'undefined' && stash.music?.getStreamUrl) {
        try {
          const info = await stash.music.getStreamUrl(nextTrack);
          if (info && info.url) {
            nextTrack.stream_url = info.url;
            if (info.quality) nextTrack.quality = info.quality;
            if (info.source) nextTrack.source = info.source;
            prefetchedUrls.set(nextTrack.id, {
              url: info.url,
              source: info.source,
              quality: info.quality,
              fetchedAt: Date.now()
            });
            console.log('[Prefetch] Resolved URL for next track:', nextTrack.title);
          } else {
            prefetchedUrls.delete(nextTrack.id);
          }
        } catch (e) {
          prefetchedUrls.delete(nextTrack.id);
        }
      }
    }
  }

  /* ── Infinite Radio Engine ───────────────────────────────────────── */
  function checkRadioRefill() {
    if (!isRadioMode || repeatMode === 'all') return;
    const upcoming = queue.length - queueIndex - 1;
    if (upcoming <= 4 && !radioPending) {
      const seed = queue[queue.length - 1] || currentTrack;
      if (seed) fetchRadioTracks(seed);
    }
  }

  async function fetchRadioTracks(seedTrack) {
    if (!seedTrack || radioPending) return;
    radioPending = true;

    try {
      queue.forEach(t => {
        const k = getTrackKey(t);
        if (k) seenRadioKeys.add(k);
      });
      const seedKey = getTrackKey(seedTrack);
      if (seedKey) seenRadioKeys.add(seedKey);

      if (!radioSeedHistory.includes(seedTrack.artist) && seedTrack.artist) {
        radioSeedHistory.push(seedTrack.artist);
        if (radioSeedHistory.length > 10) radioSeedHistory.shift();
      }

      let addedTracks = [];
      const TARGET_BATCH = 15;

      if (typeof stash !== 'undefined' && stash.music?.search) {
        // Strategy 1: Search by seed artist
        if (seedTrack.artist) {
          const artistResults = await stash.music.search(seedTrack.artist).catch(() => []);
          if (Array.isArray(artistResults)) {
            for (const r of artistResults) {
              if (!r || !r.title || !r.artist) continue;
              if (r.duration && r.duration < 45) continue;
              const k = getTrackKey(r);
              if (seenRadioKeys.has(k)) continue;
              seenRadioKeys.add(k);
              addedTracks.push(r);
              if (addedTracks.length >= 8) break;
            }
          }
        }

        // Strategy 2: Search related songs
        if (addedTracks.length < TARGET_BATCH && seedTrack.title && seedTrack.artist) {
          const query = `${seedTrack.artist} ${seedTrack.title.split(/[-–(]/)[0].trim()}`;
          const queryResults = await stash.music.search(query).catch(() => []);
          if (Array.isArray(queryResults)) {
            for (const r of queryResults) {
              if (!r || !r.title || !r.artist) continue;
              if (r.duration && r.duration < 45) continue;
              const k = getTrackKey(r);
              if (seenRadioKeys.has(k)) continue;
              seenRadioKeys.add(k);
              addedTracks.push(r);
              if (addedTracks.length >= TARGET_BATCH) break;
            }
          }
        }
      }

      if (addedTracks.length > 0) {
        queue.push(...addedTracks);
        if (originalQueue) originalQueue.push(...addedTracks);
        console.log(`[Radio] Added ${addedTracks.length} tracks to queue. Total: ${queue.length}`);
        emit('queueChange', { queue, index: queueIndex });

        if (!isPlaying && !isLoading && queueIndex >= 0 && queueIndex < queue.length - 1) {
          next();
        }
      }
    } catch (e) {
      console.warn('[Radio] Fetch error:', e.message);
    } finally {
      radioPending = false;
    }
  }

  function toggleRadio() {
    isRadioMode = !isRadioMode;
    if (isRadioMode) {
      checkRadioRefill();
    } else {
      radioPending = false;
    }
    return isRadioMode;
  }

  function getRadio() { return isRadioMode; }

  /* ── Public Controls API ─────────────────────────────────────────── */
  function play(track) {
    if (!track) {
      if (sound) {
        sound.play();
        isPlaying = true;
        emit('play', { track: currentTrack });
        startSeekUpdate();
      } else if (queue.length > 0) {
        playFromQueue(queueIndex >= 0 ? queueIndex : 0);
      }
      return;
    }

    const wasEmpty = queue.length === 0;
    const existing = queue.findIndex(t => t.id === track.id);
    if (existing >= 0) {
      queueIndex = existing;
    } else {
      queue.push(track);
      queueIndex = queue.length - 1;
    }

    emit('queueChange', { queue, index: queueIndex });
    loadAndPlay(track);

    if (isRadioMode && wasEmpty) {
      fetchRadioTracks(track);
    }
  }

  function pause() {
    if (!sound) return;
    isPlaying = false;
    try { sound.pause(); } catch (e) { /* ignore */ }
  }

  function toggle() {
    if (isLoading) return;
    if (isPlaying) {
      pause();
    } else if (sound) {
      sound.play();
      isPlaying = true;
      emit('play', { track: currentTrack });
      startSeekUpdate();
    } else if (queue.length > 0) {
      playFromQueue(queueIndex >= 0 ? queueIndex : 0);
    }
  }

  function stop() {
    stopAllAudio();
    resetSwitchGuard();
    isPlaying = false;
    isLoading = false;
    currentTrack = null;
    clearInterval(seekInterval);
    emit('pause', { track: null });
  }

  function seek(pct) {
    if (!sound) return;
    const duration = sound.duration ? sound.duration() : 0;
    if (!duration) return;
    const target = duration * pct;
    if (sound.seek) sound.seek(target);
    emit('progress', { current: target, total: duration, pct });
  }

  function seekTo(seconds) {
    if (!sound || seconds === undefined || isNaN(seconds)) return;
    if (sound.seek) sound.seek(seconds);
  }

  function setVolume(v) {
    volume = Math.max(0, Math.min(1, v));
    if (sound && sound.volume) {
      sound.volume(volume);
    }
    if (masterAudio) {
      masterAudio.volume = volume;
    }
  }

  function getVolume() { return volume; }
  function getDuration() {
    if (!sound) return currentTrack?.duration || 0;
    return sound.duration ? sound.duration() : (currentTrack?.duration || 0);
  }
  function getPosition() {
    if (!sound) return 0;
    return sound.seek ? sound.seek() : 0;
  }
  function getIsPlaying() { return isPlaying && !!sound; }
  function getIsLoading() { return isLoading; }
  function getCurrentTrack() { return currentTrack; }

  /* ── Queue Management & System-Wide Shuffle ─────────────────────── */
  function shuffleArray(arr) {
    const copy = [...arr];
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  }

  function syncShuffleUI(active) {
    const btn1 = document.getElementById('btn-shuffle');
    if (btn1) btn1.classList.toggle('active', !!active);
    const btn2 = document.getElementById('np-btn-shuffle');
    if (btn2) btn2.classList.toggle('active', !!active);
  }

  function setQueue(tracks, startIndex = 0, startShuffled = false) {
    const rawList = Array.isArray(tracks) ? [...tracks] : [];
    originalQueue = [...rawList];

    if (startShuffled) {
      isShuffle = true;
    }

    syncShuffleUI(isShuffle);

    if (rawList.length === 0) {
      queue = [];
      queueIndex = -1;
      emit('queueChange', { queue, index: queueIndex });
      emit('shuffleChange', isShuffle);
      return;
    }

    if (isShuffle) {
      let chosenIdx = Math.max(0, Math.min(startIndex, rawList.length - 1));
      if (startShuffled && startIndex === 0 && rawList.length > 1) {
        chosenIdx = Math.floor(Math.random() * rawList.length);
      }
      const chosenTrack = rawList[chosenIdx];
      const remaining = rawList.filter((_, i) => i !== chosenIdx);
      queue = [chosenTrack, ...shuffleArray(remaining)];
      queueIndex = 0;
    } else {
      queue = [...rawList];
      queueIndex = Math.max(0, Math.min(startIndex, rawList.length - 1));
    }

    emit('queueChange', { queue, index: queueIndex });
    emit('shuffleChange', isShuffle);
    if (queue[queueIndex]) {
      loadAndPlay(queue[queueIndex]);
    }
    checkRadioRefill();
  }

  function addToQueue(track) {
    if (!track) return;
    queue.push(track);
    if (originalQueue) originalQueue.push(track);
    emit('queueChange', { queue, index: queueIndex });
    if (queue.length === 1 && !currentTrack) {
      playFromQueue(0);
    }
  }

  function removeFromQueue(index) {
    if (index < 0 || index >= queue.length) return;
    const removedTrack = queue[index];
    if (index < queueIndex) queueIndex--;
    if (index === queueIndex && queueIndex >= queue.length - 1) {
      queueIndex = Math.max(0, queue.length - 2);
    }
    queue.splice(index, 1);
    if (originalQueue && originalQueue.length > 0) {
      const origIdx = originalQueue.findIndex(t => t.id === removedTrack.id);
      if (origIdx !== -1) originalQueue.splice(origIdx, 1);
    }
    emit('queueChange', { queue, index: queueIndex });
  }

  function clearQueue() {
    if (queueIndex >= 0 && queue[queueIndex]) {
      queue = [queue[queueIndex]];
      originalQueue = [queue[0]];
      queueIndex = 0;
    } else {
      queue = [];
      originalQueue = [];
      queueIndex = -1;
    }
    emit('queueChange', { queue, index: queueIndex });
  }

  function playFromQueue(index) {
    if (index < 0 || index >= queue.length) return;
    queueIndex = index;
    emit('queueChange', { queue, index: queueIndex });
    loadAndPlay(queue[index]);
  }

  async function next() {
    const now = Date.now();
    if (now - lastNavTime < 180) return; // Prevent double-trigger from spam click
    lastNavTime = now;

    if (queue.length === 0) return;

    if (queueIndex + 1 < queue.length) {
      playFromQueue(queueIndex + 1);
    } else {
      if (repeatMode === 'all') {
        if (isShuffle) {
          const baseList = (originalQueue && originalQueue.length > 0) ? originalQueue : queue;
          queue = shuffleArray(baseList);
          queueIndex = 0;
        } else {
          queueIndex = 0;
        }
        emit('queueChange', { queue, index: queueIndex });
        playFromQueue(0);
      } else if (isRadioMode) {
        console.log('[Radio] Reached queue end, fetching next batch...');
        isLoading = true;
        emit('trackChange', { track: currentTrack, loading: true });
        const seed = currentTrack || queue[queue.length - 1];
        await fetchRadioTracks(seed);
        if (queueIndex + 1 < queue.length) {
          playFromQueue(queueIndex + 1);
        } else {
          playFromQueue(0);
        }
      } else {
        isPlaying = false;
        emit('pause', {});
      }
    }
  }

  function prev() {
    const now = Date.now();
    if (now - lastNavTime < 180) return; // Prevent double-trigger from spam click
    lastNavTime = now;

    if (queue.length === 0) return;
    const pos = getPosition();
    if (pos > 3) {
      seekTo(0);
      return;
    }

    if (queueIndex > 0) {
      playFromQueue(queueIndex - 1);
    } else if (repeatMode === 'all') {
      playFromQueue(queue.length - 1);
    } else {
      seekTo(0);
    }
  }

  function handleTrackEnd() {
    resetSwitchGuard();
    isLoading = false;
    if (repeatMode === 'one') {
      loadAndPlay(currentTrack);
      return;
    }
    next();
  }

  function toggleShuffle(explicitState) {
    if (explicitState !== undefined) {
      isShuffle = !!explicitState;
    } else {
      isShuffle = !isShuffle;
    }

    syncShuffleUI(isShuffle);

    if (queue.length > 0) {
      const curTrack = currentTrack || queue[queueIndex];
      if (isShuffle) {
        if (!originalQueue || originalQueue.length === 0) {
          originalQueue = [...queue];
        }
        const played = queue.slice(0, queueIndex + 1);
        const upcoming = queue.slice(queueIndex + 1);
        queue = [...played, ...shuffleArray(upcoming)];
      } else {
        if (originalQueue && originalQueue.length > 0) {
          const origIdx = curTrack ? originalQueue.findIndex(t => t.id === curTrack.id) : -1;
          queue = [...originalQueue];
          queueIndex = origIdx !== -1 ? origIdx : Math.max(0, Math.min(queueIndex, queue.length - 1));
        }
      }
    }

    emit('shuffleChange', isShuffle);
    emit('queueChange', { queue, index: queueIndex });
    return isShuffle;
  }

  function toggleRepeat() {
    const modes = ['off', 'all', 'one'];
    repeatMode = modes[(modes.indexOf(repeatMode) + 1) % modes.length];
    const btn1 = document.getElementById('btn-repeat');
    if (btn1) { btn1.classList.toggle('active', repeatMode !== 'off'); btn1.title = `Repeat: ${repeatMode}`; }
    const btn2 = document.getElementById('np-btn-repeat');
    if (btn2) { btn2.classList.toggle('active', repeatMode !== 'off'); btn2.title = `Repeat: ${repeatMode}`; }
    emit('repeatChange', repeatMode);
    return repeatMode;
  }

  function getQueue() { return { queue: [...queue], index: queueIndex, isShuffle, originalQueue: [...originalQueue] }; }
  function getShuffle() { return isShuffle; }
  function getRepeat() { return repeatMode; }
  function getRadio() { return isRadioMode; }

  /* ── EQ ──────────────────────────────────────────────────────────── */
  function setEQ(bandIndex, gain) { eqValues[bandIndex] = gain; }
  function getEQ() { return [...eqValues]; }
  function setEQPreset(preset) {
    const presets = {
      flat: [0, 0, 0, 0, 0],
      rock: [4, 2, -1, 3, 5],
      pop: [-1, 2, 4, 2, -1],
      jazz: [3, 0, 1, 2, 4],
      classical: [3, 2, 0, 2, 3],
      bass_boost: [6, 4, 0, 0, 0],
      treble_boost: [0, 0, 0, 3, 6],
      vocal: [-2, 0, 4, 3, 1]
    };
    if (presets[preset]) eqValues = [...presets[preset]];
    return eqValues;
  }

  return {
    play, pause, toggle, stop, seek, seekTo, setVolume, getVolume,
    getDuration, getPosition, getIsPlaying, getIsLoading, getCurrentTrack, formatTime,
    setQueue, addToQueue, removeFromQueue, clearQueue, playFromQueue, next, prev, getQueue,
    toggleShuffle, toggleRepeat, getShuffle, getRepeat,
    toggleRadio, getRadio, fetchRadioTracks,
    setEQ, getEQ, setEQPreset, EQ_LABELS,
    on, emit
  };
})();
