/* ═══════════════════════════════════════════════════════════════════
   STASH DESKTOP — Live Multi-Phase Sync Engine
   Faithfully implementing Stash Original Architecture:
   Authenticating → FetchingPlaylists → Diffing → Downloading → Finalizing → Completed
   ═══════════════════════════════════════════════════════════════════ */

window.BubbleSync = (() => {
  // Sync Phase definition
  const PHASES = {
    IDLE: 'Idle',
    AUTHENTICATING: 'Authenticating',
    FETCHING: 'FetchingPlaylists',
    DIFFING: 'Diffing',
    DOWNLOADING: 'Downloading',
    FINALIZING: 'Finalizing',
    COMPLETED: 'Completed',
    ERROR: 'Error'
  };

  let state = {
    phase: PHASES.IDLE,
    progress: 0, // 0.0 to 1.0
    percent: 0,
    statusText: 'Ready to sync',
    detailsText: 'Sync your Spotify & YouTube Music library in bit-perfect FLAC',
    isSyncing: false,
    startedAt: null,
    currentTrack: null,
    totalToDownload: 0,
    downloadedCount: 0,
    currentSpeed: '',
    activityLogs: [],
    history: []
  };

  const listeners = {
    update: [],
    complete: [],
    error: []
  };

  let isCancelled = false;
  let syncIntervalTimer = null;

  function on(event, cb) {
    if (listeners[event]) listeners[event].push(cb);
  }

  function emit(event, data) {
    (listeners[event] || []).forEach(cb => {
      try { cb(data); } catch (e) { console.error('Sync listener error:', e); }
    });
  }

  function logActivity(type, message) {
    const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const entry = { time, type, message };
    state.activityLogs.unshift(entry);
    if (state.activityLogs.length > 50) state.activityLogs.pop();
    emit('update', state);
  }

  function updatePhase(phase, progress, statusText, detailsText = '') {
    state.phase = phase;
    state.progress = Math.max(0, Math.min(1, progress));
    state.percent = Math.round(state.progress * 100);
    if (statusText) state.statusText = statusText;
    if (detailsText) state.detailsText = detailsText;
    state.isSyncing = (phase !== PHASES.IDLE && phase !== PHASES.COMPLETED && phase !== PHASES.ERROR);
    emit('update', state);
  }

  async function loadHistory() {
    try {
      const rows = await BubbleDB.getAllTracks();
      const raw = await BubbleDB.getSetting('stash_sync_history');
      if (raw) {
        state.history = JSON.parse(raw);
      }
    } catch {
      state.history = [];
    }
  }

  async function recordHistory(item) {
    state.history.unshift(item);
    if (state.history.length > 20) state.history.pop();
    await BubbleDB.setSetting('stash_sync_history', JSON.stringify(state.history));
  }

  /* ── Main Orchestrated Sync Routine ── */
  async function syncNow(trigger = 'manual', opts = {}) {
    if (state.isSyncing) {
      BubbleApp.toast('Sync is already in progress', 'info');
      return;
    }
    // Quick sync: playlists only — skip the (slow) full Liked Songs re-fetch
    // and Spotify Mixes. Great for a fast refresh after adding a playlist.
    const quick = !!opts.quick;

    isCancelled = false;
    state.startedAt = Date.now();
    state.activityLogs = [];
    state.downloadedCount = 0;
    state.totalToDownload = 0;
    state.currentTrack = null;

    logActivity('INFO', 'Initiating unified library synchronization...');
    updatePhase(PHASES.AUTHENTICATING, 0.05, 'Authenticating Services...', 'Verifying Spotify & YouTube Music connections');

    const startTime = Date.now();
    let newTracksDiscovered = 0;
    const allDiscoveredTracks = [];
    const seenIds = new Set();
    const likedBatch = []; // web: liked tracks to persist in one request

    try {
      // ═══ Phase 1: Authentication ═══
      await new Promise(r => setTimeout(r, 400));
      if (isCancelled) return cancelCleanup();

      const spotifyConnected = BubbleSpotify.isConnected();
      const youtubeConnected = BubbleYouTube.isConnected();

      if (!spotifyConnected && !youtubeConnected) {
        logActivity('AUTH', 'No external services connected. Scanning local Stash files...');
      } else {
        if (spotifyConnected) logActivity('AUTH', 'Spotify session authenticated.');
        if (youtubeConnected) logActivity('AUTH', 'YouTube Music session authenticated.');
      }

      // ═══ Phase 2: Fetching Playlists & Tracks ═══
      updatePhase(PHASES.FETCHING, 0.12, 'Fetching Playlists & Saved Tracks...', 'Reading user library from connected sources');
      logActivity('FETCH', 'Fetching remote library catalogues...');

      // 1. Spotify Sync
      if (spotifyConnected) {
        try {
          if (quick) {
            logActivity('FETCH', 'Quick sync: skipping Liked Songs re-fetch (playlists only).');
          } else {
            logActivity('FETCH', 'Retrieving Spotify Liked Songs...');
            let likedOffset = 0;
            const likedLimit = 50;
            let likedTotal = 0;
            while (true) {
              const liked = await BubbleSpotify.getLikedSongs(likedLimit, likedOffset);
              if (!liked || liked.length === 0) break;
              liked.forEach(t => { t.is_liked = 1; allDiscoveredTracks.push(t); });
              likedTotal += liked.length;
              if (liked.length < likedLimit) break;
              likedOffset += likedLimit;
            }
            logActivity('FETCH', `Found ${likedTotal} Liked Songs on Spotify.`);
          }

          logActivity('FETCH', 'Retrieving Spotify Playlists & Mixes...');
          const playlists = await BubbleSpotify.getPlaylists(20);
          for (const p of playlists) {
            if (isCancelled) return cancelCleanup();
            const saved = await BubbleDB.upsertPlaylist(p);
            // Respect delete=hide: a dismissed playlist must not be re-imported.
            if (saved && (saved.skipped || saved.dismissed)) {
              logActivity('FETCH', `Skipped hidden playlist "${p.name}".`);
              continue;
            }
            const plId = saved?.id || p.id;
            const tracks = await BubbleSpotify.getPlaylistTracks(p.source_id, 50);
            allDiscoveredTracks.push(...tracks);
            // Batch insert all tracks at once
            if (tracks.length > 0) {
              await BubbleDB.addTrackToPlaylist(plId, tracks, 0).catch(() => { });
            }
            logActivity('FETCH', `Fetched playlist "${p.name}" (${tracks.length} tracks).`);
          }

          // Spotify Mixes (Daily Mixes, Discover Weekly, ...) are OPT-IN.
          // Default off — most users only want their own playlists imported.
          const syncMixes = !quick && (await BubbleDB.getSetting('sync_mixes')) === 'true';
          if (syncMixes) {
            logActivity('FETCH', 'Retrieving Spotify Mixes (Daily Mixes, Discover Weekly, ...)');
            const mixes = await BubbleSpotify.getMixes();
            for (const m of mixes) {
              if (isCancelled) return cancelCleanup();
              const saved = await BubbleDB.upsertPlaylist(m);
              if (saved && (saved.skipped || saved.dismissed)) {
                logActivity('FETCH', `Skipped hidden mix "${m.name}".`);
                continue;
              }
              const plId = saved?.id || m.id;
              const tracks = await BubbleSpotify.getPlaylistTracks(m.source_id, 100);
              allDiscoveredTracks.push(...tracks);
              if (tracks.length > 0) {
                await BubbleDB.addTrackToPlaylist(plId, tracks, 0).catch(() => { });
              }
              logActivity('FETCH', `Fetched mix "${m.name}" (${tracks.length} tracks).`);
            }
          } else {
            logActivity('FETCH', 'Spotify Mixes sync is off — importing playlists only.');
          }
        } catch (err) {
          logActivity('WARN', `Spotify fetch notice: ${err.message || 'Continuing'}`);
        }
      }

      // 2. YouTube Music Sync
      if (youtubeConnected) {
        try {
          logActivity('FETCH', 'Retrieving YouTube Music Liked Songs...');
          const ytLiked = await BubbleYouTube.getLikedMusic();
          logActivity('FETCH', `Found ${ytLiked.length} Liked tracks on YouTube Music.`);
          ytLiked.forEach(t => { t.is_liked = 1; allDiscoveredTracks.push(t); });

          const ytPlaylists = await BubbleYouTube.getPlaylists();
          for (const p of ytPlaylists) {
            if (isCancelled) return cancelCleanup();
            const saved = await BubbleDB.upsertPlaylist(p);
            if (saved && (saved.skipped || saved.dismissed)) {
              logActivity('FETCH', `Skipped hidden playlist "${p.name}".`);
              continue;
            }
            const plId = saved?.id || p.id;
            const tracks = await BubbleYouTube.getPlaylistTracks(p.source_id);
            allDiscoveredTracks.push(...tracks);
            if (tracks.length > 0) {
              await BubbleDB.addTrackToPlaylist(plId, tracks, 0).catch(() => { });
            }
            logActivity('FETCH', `Fetched YouTube playlist "${p.name}" (${tracks.length} tracks).`);
          }
        } catch (err) {
          logActivity('WARN', `YouTube fetch notice: ${err.message || 'Continuing'}`);
        }
      }

      // ═══ Phase 3: Diffing & Reconciling ═══
      updatePhase(PHASES.DIFFING, 0.22, 'Reconciling Tracks with Stash...', 'Comparing remote tracks with local lossless library');
      logActivity('DIFF', `Reconciling ${allDiscoveredTracks.length} catalog tracks against local database...`);

      for (const t of allDiscoveredTracks) {
        if (!t || !t.id) continue;

        const isFirstEncounter = !seenIds.has(t.id);
        seenIds.add(t.id);

        if (!BubbleAPI.isElectron) {
          // Web: playlist tracks already persisted via addTrackToPlaylist.
          // Liked songs are collected and written in ONE batch below (fast).
          if (t.is_liked) {
            likedBatch.push(t);
          } else {
            BubbleDB.upsertTrack(t); // seed session cache for immediate playback
          }
          if (isFirstEncounter) newTracksDiscovered++;
          continue;
        }

        const existing = await BubbleDB.getTrack(t.id);
        if (!existing) {
          await BubbleDB.upsertTrack(t);
          if (isFirstEncounter) newTracksDiscovered++;
        } else if (t.is_liked && !existing.is_liked) {
          await BubbleDB.setLiked(t.id, 1);
        }
      }

      // Web: persist all Liked Songs in one request instead of N.
      if (!BubbleAPI.isElectron && likedBatch.length > 0) {
        logActivity('DIFF', `Saving ${likedBatch.length} Liked Songs in one batch...`);
        await BubbleAPI.liked.likeBatch(likedBatch).catch(() => { });
      }

      logActivity('DIFF', `Found ${newTracksDiscovered} new tracks. Saved to library (streaming-ready).`);

      // ═══ Phase 4: Finalizing ═══
      state.downloadedCount = 0;
      state.totalToDownload = 0;

      updatePhase(PHASES.FINALIZING, 0.90, 'Finalizing Stash Library...', 'Updating sidebar playlists and library');
      logActivity('FINALIZE', 'Writing updated database indices and sidebar playlists...');

      if (typeof BubbleApp !== 'undefined' && BubbleApp.refreshData) {
        await BubbleApp.refreshData({ sidebar: true, route: true });
      } else {
        await BubbleLibrary.updateSidebarPlaylists();
      }
      await new Promise(r => setTimeout(r, 400));

      // ═══ Phase 6: Completed ═══
      const durationSec = Math.round((Date.now() - startTime) / 1000);
      updatePhase(
        PHASES.COMPLETED,
        1.0,
        'Sync Complete',
        `Synced ${allDiscoveredTracks.length} tracks in ${durationSec}s — streaming-ready, download manually when needed`
      );

      logActivity('DONE', `✨ Sync completed in ${durationSec}s (${newTracksDiscovered} new tracks added). Downloads are manual only.`);
      BubbleApp.toast(`Sync Complete! ${newTracksDiscovered} new tracks added to library.`, 'success');

      // Record to history
      await recordHistory({
        id: Date.now(),
        timestamp: new Date().toISOString(),
        dateFormatted: new Date().toLocaleString(),
        trigger,
        status: 'Completed',
        newTracks: newTracksDiscovered,
        downloaded: 0,
        failed: 0,
        duration: `${durationSec}s`
      });

      emit('complete', state);

      // Transition to IDLE after 8s of showing complete status
      setTimeout(() => {
        if (state.phase === PHASES.COMPLETED) {
          state.phase = PHASES.IDLE;
          state.isSyncing = false;
          state.progress = 0;
          state.percent = 0;
          state.statusText = 'Ready to sync';
          state.detailsText = 'All tracks and playlists up to date';
          emit('update', state);
        }
      }, 8000);

    } catch (err) {
      console.error('Sync error:', err);
      updatePhase(PHASES.ERROR, 0, 'Sync Failed', err.message || 'An unexpected error occurred during sync');
      logActivity('ERROR', `Fatal sync error: ${err.message}`);
      BubbleApp.toast(`Sync error: ${err.message}`, 'error');
      emit('error', err);
    }
  }

  function cancel() {
    if (state.isSyncing) {
      isCancelled = true;
      logActivity('WARN', 'Cancelling sync by user request...');
    }
  }

  function cancelCleanup() {
    updatePhase(PHASES.IDLE, 0, 'Sync Cancelled', 'Sync was stopped by user');
    logActivity('INFO', 'Sync process stopped.');
    BubbleApp.toast('Sync cancelled', 'info');
  }

  function getState() {
    return state;
  }

  async function startScheduled() {
    loadHistory();
    const interval = parseInt(await BubbleDB.getSetting('sync_interval') || '60', 10);
    if (syncIntervalTimer) clearInterval(syncIntervalTimer);
    syncIntervalTimer = setInterval(() => {
      syncNow('scheduled');
    }, interval * 60 * 1000);
  }

  function stopScheduled() {
    if (syncIntervalTimer) {
      clearInterval(syncIntervalTimer);
      syncIntervalTimer = null;
    }
  }

  return {
    PHASES,
    syncNow,
    cancel,
    getState,
    on,
    startScheduled,
    stopScheduled,
    loadHistory
  };
})();
