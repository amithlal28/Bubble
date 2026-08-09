/* ═══════════════════════════════════════════════════════════════════
   STASH DESKTOP — Main Application Controller
   Initializes UI, player bar controls, hotkeys, tray, and data
   ═══════════════════════════════════════════════════════════════════ */

window.deferredPrompt = null;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  window.deferredPrompt = e;
  // Show install button if it exists
  const installBtn = document.getElementById('btn-pwa-install');
  if (installBtn) installBtn.style.display = 'inline-flex';
});

window.installPWA = async () => {
  if (window.deferredPrompt) {
    window.deferredPrompt.prompt();
    const { outcome } = await window.deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      window.deferredPrompt = null;
      const installBtn = document.getElementById('btn-pwa-install');
      if (installBtn) installBtn.style.display = 'none';
    }
  } else {
    BubbleApp.toast("Web app is already installed or installation is not supported by your browser.", "info");
  }
};

window.BubbleApp = (() => {
  const isElectron = typeof stash !== 'undefined' && !stash._isPolyfill;

  async function init() {
    // 1. Setup Titlebar Controls (Electron only)
    if (isElectron) setupTitlebar();

    // 2. Setup Player Bar Controls
    setupPlayerBar();

    // 3. Setup Tray Controls (Electron only)
    if (isElectron) setupTray();

    // 4. Setup Global Keyboard Shortcuts
    setupKeyboardShortcuts();

    // 5. Initialize Modules
    try { await BubbleSettings.load(); } catch (e) { console.warn('[BubbleApp] Settings load failed:', e); }
    try { await BubbleSpotify.checkConnection(); } catch (e) { /* web: no Spotify */ }
    try { await BubbleYouTube.checkConnection(); } catch (e) { /* web: no YouTube */ }
    try { BubbleDownloader.init(); } catch (e) { console.warn('[BubbleApp] Downloader init failed:', e); }
    try { await BubbleLibrary.updateSidebarPlaylists(); } catch (e) { console.warn('[BubbleApp] Sidebar update failed:', e); }
    if (isElectron) { try { BubbleSync.startScheduled(); } catch (e) { /* ignore */ } }

    // 6. Connect Player Events to UI
    try { setupPlayerEvents(); } catch (e) { console.warn('[BubbleApp] Player events setup failed:', e); }

    // 7. Start Router — THIS MUST ALWAYS RUN
    try {
      if (typeof BubbleRouter !== 'undefined' && BubbleRouter.init) {
        BubbleRouter.init();
      } else {
        console.error('[BubbleApp] BubbleRouter not available — views cannot render');
      }
    } catch (e) {
      console.error('[BubbleApp] Router init failed:', e);
    }
  }

  /* ── Titlebar Window Controls ──────────────────────────────────── */
  function setupTitlebar() {
    document.getElementById('btn-minimize')?.addEventListener('click', () => stash.window.minimize());
    document.getElementById('btn-maximize')?.addEventListener('click', () => stash.window.maximize());
    document.getElementById('btn-close')?.addEventListener('click', () => stash.window.close());
  }

  /* ── Player Bar Controls ───────────────────────────────────────── */
  function setupPlayerBar() {
    const btnPlay = document.getElementById('btn-play');
    const btnNext = document.getElementById('btn-next');
    const btnPrev = document.getElementById('btn-prev');
    const btnShuffle = document.getElementById('btn-shuffle');
    const btnRepeat = document.getElementById('btn-repeat');
    const btnRadio = document.getElementById('btn-radio');
    const btnLike = document.getElementById('btn-like');
    const btnAddPlaylist = document.getElementById('btn-add-playlist');
    const progressBar = document.getElementById('progress-bar');
    const volumeBar = document.getElementById('volume-bar');
    const btnVolume = document.getElementById('btn-volume');
    const btnQueue = document.getElementById('btn-queue');
    const btnNowPlaying = document.getElementById('btn-nowplaying');
    const btnCloseNp = document.getElementById('btn-close-np');
    const playerArtwork = document.getElementById('player-artwork');
    const playerTitle = document.getElementById('player-title');

    // Play/Pause
    btnPlay?.addEventListener('click', (e) => {
      e.currentTarget?.blur?.();
      BubblePlayer.toggle();
    });

    // Next/Prev
    btnNext?.addEventListener('click', (e) => {
      e.currentTarget?.blur?.();
      BubblePlayer.next();
    });
    btnPrev?.addEventListener('click', (e) => {
      e.currentTarget?.blur?.();
      BubblePlayer.prev();
    });

    // Shuffle/Repeat
    btnShuffle?.addEventListener('click', () => {
      BubblePlayer.toggleShuffle();
    });

    btnRepeat?.addEventListener('click', () => {
      BubblePlayer.toggleRepeat();
    });

    // Radio (auto-queue similar tracks)
    btnRadio?.addEventListener('click', () => {
      const active = BubblePlayer.toggleRadio();
      btnRadio.classList.toggle('active', active);
      if (active) {
        toast('Radio mode ON — similar songs will play next', 'info');
        // Fetch radio tracks for the current song immediately
        const track = BubblePlayer.getCurrentTrack();
        if (track) BubblePlayer.fetchRadioTracks?.(track);
      } else {
        toast('Radio mode OFF', 'info');
      }
    });

    // Like
    btnLike?.addEventListener('click', async () => {
      const track = BubblePlayer.getCurrentTrack();
      if (track) await toggleLike(track.id);
    });

    // Add to Playlist
    btnAddPlaylist?.addEventListener('click', () => {
      const track = BubblePlayer.getCurrentTrack();
      if (track) showAddToPlaylistModal(track);
    });

    // Progress Bar Seeking
    let isSeeking = false;
    progressBar?.addEventListener('mousedown', (e) => {
      isSeeking = true;
      handleSeek(e);
      const onMouseMove = (ev) => { if (isSeeking) handleSeek(ev); };
      const onMouseUp = () => {
        isSeeking = false;
        window.removeEventListener('mousemove', onMouseMove);
        window.removeEventListener('mouseup', onMouseUp);
      };
      window.addEventListener('mousemove', onMouseMove);
      window.addEventListener('mouseup', onMouseUp);
    });

    function handleSeek(e) {
      const rect = progressBar.getBoundingClientRect();
      const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      BubblePlayer.seek(pct);
    }

    // Volume Bar Adjust
    let isAdjustingVolume = false;
    volumeBar?.addEventListener('mousedown', (e) => {
      isAdjustingVolume = true;
      handleVolume(e);
      const onMouseMove = (ev) => { if (isAdjustingVolume) handleVolume(ev); };
      const onMouseUp = () => {
        isAdjustingVolume = false;
        window.removeEventListener('mousemove', onMouseMove);
        window.removeEventListener('mouseup', onMouseUp);
      };
      window.addEventListener('mousemove', onMouseMove);
      window.addEventListener('mouseup', onMouseUp);
    });

    function handleVolume(e) {
      const rect = volumeBar.getBoundingClientRect();
      const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      BubblePlayer.setVolume(pct);
      updateVolumeUI(pct);
    }

    let lastVolume = 0.8;
    btnVolume?.addEventListener('click', () => {
      if (BubblePlayer.getVolume() > 0) {
        lastVolume = BubblePlayer.getVolume();
        BubblePlayer.setVolume(0);
        updateVolumeUI(0);
      } else {
        BubblePlayer.setVolume(lastVolume || 0.8);
        updateVolumeUI(lastVolume || 0.8);
      }
    });

    // Now Playing / Lyrics Overlay
    const toggleOverlay = (scrollTo) => {
      const overlay = document.getElementById('nowplaying-overlay');
      if (!overlay) return;
      overlay.classList.toggle('hidden');
      if (!overlay.classList.contains('hidden') && scrollTo) {
        const el = document.getElementById(scrollTo);
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
      // When opening, refresh with current track data
      if (!overlay.classList.contains('hidden')) {
        const track = BubblePlayer.getCurrentTrack();
        if (track) updateNowPlayingOverlay(track, false);
        renderOverlayQueue();
      }
    };

    btnQueue?.addEventListener('click', () => toggleOverlay('np-queue-list'));
    playerArtwork?.addEventListener('click', () => toggleOverlay('np-artwork-large'));
    playerTitle?.addEventListener('click', () => toggleOverlay('np-artwork-large'));
    btnNowPlaying?.addEventListener('click', () => BubbleRouter.navigate('nowplaying'));
    btnCloseNp?.addEventListener('click', () => {
      document.getElementById('nowplaying-overlay')?.classList.add('hidden');
    });
  }

  function updateVolumeUI(pct) {
    const fill = document.getElementById('volume-fill');
    const handle = document.getElementById('volume-handle');
    const icon = document.getElementById('icon-volume');
    if (fill) fill.style.width = `${pct * 100}%`;
    if (handle) handle.style.left = `${pct * 100}%`;
    if (icon) {
      icon.innerHTML = pct === 0 ?
        '<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/>' :
        pct < 0.5 ?
          '<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/>' :
          '<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/>';
    }
  }

  /* ── Player Event Bindings ─────────────────────────────────────── */
  function setupPlayerEvents() {
    const iconPlay = document.getElementById('icon-play');
    const iconPause = document.getElementById('icon-pause');
    const playerTitle = document.getElementById('player-title');
    const playerArtist = document.getElementById('player-artist');
    const playerArtwork = document.getElementById('player-artwork');
    const playerLike = document.getElementById('btn-like');
    const progressFill = document.getElementById('progress-fill');
    const progressHandle = document.getElementById('progress-handle');
    const timeCurrent = document.getElementById('player-time-current');
    const timeTotal = document.getElementById('player-time-total');

    BubblePlayer.on('play', () => {
      if (iconPlay) iconPlay.style.display = 'none';
      if (iconPause) iconPause.style.display = 'block';
    });

    BubblePlayer.on('pause', () => {
      if (iconPlay) iconPlay.style.display = 'block';
      if (iconPause) iconPause.style.display = 'none';
    });

    function updatePlayerTitle(title) {
      if (!playerTitle) return;
      const text = title || 'No track playing';
      const escaped = escapeHtml(text);

      playerTitle.classList.remove('marquee-active');
      playerTitle.innerHTML = `<span class="player-title-inner"><span class="player-title-text">${escaped}</span></span>`;

      requestAnimationFrame(() => {
        const textSpan = playerTitle.querySelector('.player-title-text');
        const inner = playerTitle.querySelector('.player-title-inner');
        if (!textSpan || !inner) return;

        const containerWidth = playerTitle.clientWidth || 180;
        const textWidth = textSpan.getBoundingClientRect().width;

        if (textWidth > containerWidth) {
          const gap = 36;
          const totalUnitWidth = textWidth + gap;
          const duration = Math.max(6, Math.round(totalUnitWidth / 26));

          inner.innerHTML = `
            <span class="player-title-text">${escaped}</span>
            <span class="player-title-spacer" style="display:inline-block;width:${gap}px;flex-shrink:0;"></span>
            <span class="player-title-text">${escaped}</span>
            <span class="player-title-spacer" style="display:inline-block;width:${gap}px;flex-shrink:0;"></span>
          `;

          inner.style.setProperty('--marquee-duration', `${duration}s`);
          inner.style.setProperty('--marquee-translate', `-${totalUnitWidth}px`);
          playerTitle.classList.add('marquee-active');
        }
      });
    }

    window.addEventListener('resize', () => {
      const cur = BubblePlayer.getCurrentTrack();
      if (cur) updatePlayerTitle(cur.title);
    });

    BubblePlayer.on('trackChange', ({ track, error, loading }) => {
      if (error) {
        toast(error, 'error');
        return;
      }
      if (!track) return;

      updatePlayerTitle(track.title);
      if (playerArtist) playerArtist.textContent = track.artist;
      if (playerArtwork) {
        playerArtwork.innerHTML = track.artwork_url ?
          `<img src="${track.artwork_url}" alt="">` :
          `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.3"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>`;
      }
      if (playerLike) {
        playerLike.classList.toggle('liked', track.is_liked === 1);
      }

      // Update Source & Quality Pill in Player Bar
      const sourceBadge = document.getElementById('player-source-badge');
      const sourceDot = document.getElementById('player-source-dot');
      const sourceLabel = document.getElementById('player-source-label');
      const qualityPill = document.getElementById('player-quality-pill');

      if (sourceBadge && sourceDot && sourceLabel && qualityPill) {
        // Show a resolving state while a lossless URL is being fetched (ARCOD
        // renders FLAC server-side and can take a few seconds).
        if (loading) {
          sourceBadge.style.display = 'inline-flex';
          sourceDot.className = 'source-dot resolving';
          sourceLabel.textContent = 'Resolving Lossless Stream…';
          qualityPill.textContent = 'FLAC';
          sourceBadge.title = 'Contacting Qobuz/ARCOD for a lossless FLAC stream…';
          const npQualityLoading = document.getElementById('np-quality');
          if (npQualityLoading) npQualityLoading.textContent = 'Resolving Lossless Stream…';
        } else {
          sourceBadge.style.display = 'inline-flex';

          let sourceClass = 'youtube';
          let sourceName = 'YouTube Stream';
          let qualityText = track.quality || 'Lossless Stream';

          if (track.file_path || track.is_downloaded) {
            sourceClass = 'local';
            sourceName = 'Local Stash';
            qualityText = 'Offline FLAC';
          } else if (track.source === 'qobuz') {
            sourceClass = 'qobuz';
            sourceName = 'Qobuz (Direct)';
            qualityText = 'Lossless FLAC';
          } else if (track.source === 'arcod') {
            sourceClass = 'arcod';
            sourceName = 'ARCOD (Qobuz)';
            qualityText = '24-Bit FLAC';
          } else if (track.source === 'itunes') {
            sourceClass = 'itunes';
            sourceName = 'Apple Music';
            qualityText = 'AAC 256kbps';
          } else if (track.source === 'spotify') {
            sourceClass = 'spotify';
            sourceName = 'Spotify Stream';
            qualityText = 'High Quality';
          } else {
            sourceClass = 'youtube';
            sourceName = 'YouTube Music';
            qualityText = 'Direct Stream';
          }

          sourceDot.className = `source-dot ${sourceClass}`;
          sourceLabel.textContent = sourceName;
          qualityPill.textContent = qualityText;
          sourceBadge.style.cursor = 'pointer';
          sourceBadge.title = `Playing via ${sourceName} (${qualityText}) — Click to toggle Lossless / YouTube`;
          sourceBadge.onclick = (e) => {
            e.stopPropagation();
            BubbleApp.toggleLosslessSource();
          };
        }
      }

      // Update Fullscreen Now Playing Overlay
      updateNowPlayingOverlay(track, loading);

      // Also refresh the overlay queue to highlight the new current track
      renderOverlayQueue();
    });

    BubblePlayer.on('progress', ({ current, total, pct }) => {
      if (progressFill) progressFill.style.width = `${pct * 100}%`;
      if (progressHandle) progressHandle.style.left = `${pct * 100}%`;
      if (timeCurrent) timeCurrent.textContent = BubblePlayer.formatTime(current);
      if (timeTotal) timeTotal.textContent = BubblePlayer.formatTime(total);

      // Update overlay progress
      const npFill = document.getElementById('np-progress-fill');
      const npHandle = document.getElementById('np-progress-handle');
      const npCur = document.getElementById('np-time-current');
      const npTot = document.getElementById('np-time-total');
      if (npFill) npFill.style.width = `${pct * 100}%`;
      if (npHandle) npHandle.style.left = `${pct * 100}%`;
      if (npCur) npCur.textContent = BubblePlayer.formatTime(current);
      if (npTot) npTot.textContent = BubblePlayer.formatTime(total);

      // Sync active lyric line
      BubbleLyrics.updateActiveLine(current);
    });

    // Queue & Shuffle changes update the overlay and indicators
    BubblePlayer.on('queueChange', () => {
      renderOverlayQueue();
    });

    BubblePlayer.on('shuffleChange', (active) => {
      document.getElementById('btn-shuffle')?.classList.toggle('active', !!active);
      document.getElementById('np-btn-shuffle')?.classList.toggle('active', !!active);
      renderOverlayQueue();
    });

    BubblePlayer.on('repeatChange', (mode) => {
      const b1 = document.getElementById('btn-repeat');
      if (b1) { b1.classList.toggle('active', mode !== 'off'); b1.title = `Repeat: ${mode}`; }
      const b2 = document.getElementById('np-btn-repeat');
      if (b2) { b2.classList.toggle('active', mode !== 'off'); b2.title = `Repeat: ${mode}`; }
    });

    // Wire overlay controls
    wireOverlayControls();
  }

  let overlayVisible = () => !document.getElementById('nowplaying-overlay')?.classList.contains('hidden');

  function updateNowPlayingOverlay(track, loading) {
    const npTitle = document.getElementById('np-track-title');
    const npArtist = document.getElementById('np-track-artist');
    const npAlbum = document.getElementById('np-track-album');
    const npArtwork = document.getElementById('np-artwork-large');
    const npShadow = document.getElementById('np-artwork-shadow');
    const npBadges = document.getElementById('np-badges');
    const npLike = document.getElementById('np-btn-like');
    const npDl = document.getElementById('np-btn-download');

    if (!npTitle) return; // overlay not in DOM (only when hidden via display:none? no — always present)

    if (npTitle) npTitle.textContent = track.title || '—';
    if (npArtist) npArtist.textContent = track.artist || '—';
    if (npAlbum) npAlbum.textContent = track.album || '';
    if (npArtwork) {
      npArtwork.innerHTML = track.artwork_url
        ? `<img src="${track.artwork_url}" alt="" style="width:100%;height:100%;object-fit:cover">`
        : `<svg width="80" height="80" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" opacity="0.2"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>`;
    }
    if (npShadow && track.artwork_url) npShadow.innerHTML = `<img src="${track.artwork_url}" alt="">`;

    if (npBadges) {
      const src = track.file_path ? 'local' : (track.source || 'youtube');
      const srcLabel = track.file_path ? 'Local FLAC' :
        track.source === 'qobuz' ? 'Qobuz Direct' :
          track.source === 'arcod' ? 'ARCOD Qobuz' :
            track.source === 'spotify' ? 'Spotify' : 'YouTube';
      npBadges.innerHTML = `
        <span class="np-badge"><span class="source-dot ${src}"></span> ${srcLabel}</span>
        <span class="np-badge quality">${loading ? 'Resolving Lossless…' : (track.quality || 'Lossless Audio')}</span>
      `;
    }
    if (npLike) npLike.classList.toggle('liked', track.is_liked === 1);
    if (npDl) { npDl.style.display = (track.file_path || track.is_downloaded) ? 'none' : ''; npDl.onclick = () => { BubbleApp.downloadTrack(track.id, track); }; }

    // Update lyrics and queue (best-effort, don't block the UI)
    renderOverlayLyrics(track).catch(() => { });
  }

  async function renderOverlayLyrics(track) {
    const container = document.getElementById('np-lyrics-scroll');
    if (!container) return;
    container.innerHTML = '<div class="np-lyrics-placeholder">Loading lyrics…</div>';
    const lyrics = await BubbleLyrics.fetchForTrack(track);
    const current = BubblePlayer.getCurrentTrack();
    if (current && current.id !== track.id) return;
    const synced = BubbleLyrics.getSyncedLines();
    if (synced && synced.length > 0) {
      container.innerHTML = synced.map((l, i) => `<div class="np-lyric-line" data-time="${l.time}" data-idx="${i}" onclick="BubblePlayer.seekTo(${l.time})">${escapeHtml(l.text || '♪')}</div>`).join('');
    } else if (lyrics?.plain) {
      container.innerHTML = lyrics.plain.split('\n').map(l => `<div class="np-lyric-line">${escapeHtml(l || '')}</div>`).join('');
    } else {
      container.innerHTML = '<div class="np-lyrics-placeholder">No lyrics available</div>';
    }
  }

  function renderOverlayQueue() {
    const list = document.getElementById('np-queue-list');
    if (!list) return;
    const { queue, index, isShuffle } = BubblePlayer.getQueue();
    const queueHeader = document.querySelector('.np-queue-header span');
    if (queueHeader) {
      queueHeader.innerHTML = isShuffle
        ? `Up Next <span class="badge badge-accent" style="font-size:10px;padding:2px 8px;margin-left:6px;border-radius:10px">🔀 Shuffled (${queue.length})</span>`
        : `Up Next (${queue.length})`;
    }
    if (!queue || queue.length === 0) {
      list.innerHTML = '<div class="np-queue-empty">Queue is empty — play a playlist or album</div>';
      return;
    }
    list.innerHTML = queue.map((t, i) => {
      const isCurrent = i === index;
      const srcLabel = t.file_path ? 'Local FLAC' : (t.source === 'arcod' ? 'ARCOD FLAC' : t.source === 'qobuz' ? 'Qobuz FLAC' : t.quality || 'FLAC');
      return `<div class="np-queue-item${isCurrent ? ' current' : ''}" onclick="${isCurrent ? '' : `BubblePlayer.playFromQueue(${i})`}">
        <span class="np-queue-idx">${isCurrent ? '♪' : i + 1}</span>
        <span class="np-queue-info">
          <span class="np-queue-title">${escapeHtml(t.title || 'Untitled')}</span>
          <span class="np-queue-artist">${escapeHtml(t.artist || '')}</span>
        </span>
        <span class="np-queue-quality">${escapeHtml(srcLabel)}</span>
        <span class="np-queue-time">${BubblePlayer.formatTime(t.duration || 0)}</span>
      </div>`;
    }).join('');
  }

  function wireOverlayControls() {
    const btnPlay = document.getElementById('np-btn-play');
    btnPlay?.addEventListener('click', (e) => {
      e.currentTarget?.blur?.();
      BubblePlayer.toggle();
      updateOverlayPlayIcon();
    });

    document.getElementById('np-btn-next')?.addEventListener('click', (e) => {
      e.currentTarget?.blur?.();
      BubblePlayer.next();
    });
    document.getElementById('np-btn-prev')?.addEventListener('click', (e) => {
      e.currentTarget?.blur?.();
      BubblePlayer.prev();
    });

    document.getElementById('np-btn-shuffle')?.addEventListener('click', () => {
      BubblePlayer.toggleShuffle();
    });

    document.getElementById('np-btn-repeat')?.addEventListener('click', () => {
      BubblePlayer.toggleRepeat();
    });

    document.getElementById('np-btn-like')?.addEventListener('click', () => {
      const track = BubblePlayer.getCurrentTrack();
      if (track) BubbleApp.toggleLike(track.id, track);
    });

    // Volume
    const volBar = document.getElementById('np-volume-bar');
    volBar?.addEventListener('mousedown', (e) => {
      const rect = volBar.getBoundingClientRect();
      const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      BubblePlayer.setVolume(pct);
      const vf = document.getElementById('np-volume-fill');
      if (vf) vf.style.width = `${pct * 100}%`;
    });

    // Progress bar
    const npProg = document.getElementById('np-progress-bar');
    npProg?.addEventListener('mousedown', (e) => {
      const rect = npProg.getBoundingClientRect();
      const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      BubblePlayer.seek(pct);
    });

    // Listen for play/pause to update icon
    BubblePlayer.on('play', updateOverlayPlayIcon);
    BubblePlayer.on('pause', updateOverlayPlayIcon);

    // Clear queue
    document.getElementById('np-btn-clear-queue')?.addEventListener('click', () => {
      BubblePlayer.clearQueue();
      renderOverlayQueue();
    });
  }

  function updateOverlayPlayIcon() {
    const playIcon = document.getElementById('np-icon-play');
    const pauseIcon = document.getElementById('np-icon-pause');
    if (!playIcon || !pauseIcon) return;
    const isPlaying = BubblePlayer.getIsPlaying();
    playIcon.style.display = isPlaying ? 'none' : 'block';
    pauseIcon.style.display = isPlaying ? 'block' : 'none';
  }

  /* ── Tray Controls ─────────────────────────────────────────────── */
  function setupTray() {
    stash.tray.onPlayPause(() => BubblePlayer.toggle());
    stash.tray.onNext(() => BubblePlayer.next());
    stash.tray.onPrevious(() => BubblePlayer.prev());
  }

  /* ── Global Keyboard Shortcuts ─────────────────────────────────── */
  function setupKeyboardShortcuts() {
    window.addEventListener('keydown', (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable) return;
      if (e.code === 'Space') {
        e.preventDefault();
        if (document.activeElement && document.activeElement !== document.body) {
          document.activeElement.blur?.();
        }
        BubblePlayer.toggle();
      } else if (e.code === 'ArrowRight' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        BubblePlayer.next();
      } else if (e.code === 'ArrowLeft' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        BubblePlayer.prev();
      } else if (e.key === 'l' || e.key === 'L') {
        const track = BubblePlayer.getCurrentTrack();
        if (track) toggleLike(track.id);
      }
    });
  }

  /* ── Global Helper Actions ─────────────────────────────────────── */
  async function playTrack(trackId, trackObj = null) {
    let track = trackObj || await BubbleDB.getTrack(trackId);
    if (!track && trackObj) {
      await BubbleDB.upsertTrack(trackObj);
      track = trackObj;
    }
    if (!track) return;

    toast(`Playing "${track.title}" — ${track.artist}`, 'info');
    BubblePlayer.play(track);
  }

  async function playLikedSongs(startIndex = 0, shuffle = false) {
    const tracks = await BubbleDB.getAllTracks({ liked: true });
    if (!tracks || tracks.length === 0) {
      toast('No liked songs found. Like some tracks or sync from Spotify!', 'warning');
      return;
    }
    BubblePlayer.setQueue(tracks, startIndex, shuffle);
    toast(`${shuffle ? 'Shuffling' : 'Playing'} Liked Songs (${tracks.length} tracks)`, 'success');
  }

  async function shuffleLikedSongs() {
    return playLikedSongs(0, true);
  }

  async function downloadLikedSongs() {
    const tracks = await BubbleDB.getAllTracks({ liked: true });
    if (!tracks || tracks.length === 0) {
      toast('No liked songs to download', 'warning');
      return;
    }
    toast(`Queueing ${tracks.length} liked tracks for download...`, 'info');
    BubbleDownloader.downloadMultiple(tracks);
  }

  async function playCurrentLibrary(filter = 'all', sort = 'added', startIndex = 0, shuffle = false) {
    const sourceFilters = ['spotify', 'youtube', 'arcod', 'itunes', 'local'];
    const sourceVal = sourceFilters.includes(filter) ? filter : undefined;
    const likedVal = filter === 'liked' ? true : undefined;
    const downloadedVal = filter === 'downloaded' ? true : undefined;

    const tracks = await BubbleDB.getAllTracks({
      source: sourceVal,
      liked: likedVal,
      downloaded: downloadedVal,
      sort
    });

    if (!tracks || tracks.length === 0) {
      toast('No tracks found in current view', 'warning');
      return;
    }

    BubblePlayer.setQueue(tracks, startIndex, shuffle);
    const label = filter === 'liked' ? 'Liked Songs' : filter === 'all' ? 'Library' : `${filter} tracks`;
    toast(`${shuffle ? 'Shuffling' : 'Playing'} ${label} (${tracks.length} tracks)`, 'success');
  }

  async function shuffleCurrentLibrary(filter = 'all', sort = 'added') {
    return playCurrentLibrary(filter, sort, 0, true);
  }

  async function playTrackInLibraryContext(trackId, filter = 'all', sort = 'added', index = 0, trackObj = null) {
    if (trackObj) {
      await BubbleDB.upsertTrack(trackObj);
    }
    const sourceFilters = ['spotify', 'youtube', 'arcod', 'itunes', 'local'];
    const sourceVal = sourceFilters.includes(filter) ? filter : undefined;
    const likedVal = filter === 'liked' ? true : undefined;
    const downloadedVal = filter === 'downloaded' ? true : undefined;

    const tracks = await BubbleDB.getAllTracks({
      source: sourceVal,
      liked: likedVal,
      downloaded: downloadedVal,
      sort
    });

    const targetIdx = tracks.findIndex(t => t.id === trackId);
    if (targetIdx !== -1) {
      BubblePlayer.setQueue(tracks, targetIdx);
    } else {
      playTrack(trackId, trackObj);
    }
  }

  async function playTrackInContext(trackId, trackObj = null) {
    if (trackObj) {
      await BubbleDB.upsertTrack(trackObj);
    }
    const tracks = await BubbleDB.getAllTracks();
    const idx = tracks.findIndex(t => t.id === trackId);
    if (idx !== -1) {
      BubblePlayer.setQueue(tracks, idx);
    } else {
      playTrack(trackId, trackObj);
    }
  }

  async function playPlaylist(playlistId) {
    const tracks = await BubbleDB.getPlaylistTracks(playlistId);
    if (tracks.length > 0) {
      BubblePlayer.setQueue(tracks, 0, false);
      toast(`Playing playlist (${tracks.length} tracks)`, 'success');
    } else {
      toast('Playlist has no tracks', 'warning');
    }
  }

  async function shufflePlaylist(playlistId) {
    const tracks = await BubbleDB.getPlaylistTracks(playlistId);
    if (tracks.length === 0) { toast('Playlist has no tracks', 'warning'); return; }
    BubblePlayer.setQueue(tracks, 0, true);
    toast(`Shuffling playlist (${tracks.length} tracks)`, 'success');
  }

  async function downloadTrack(trackId, trackObj = null) {
    let track = trackObj || await BubbleDB.getTrack(trackId);
    if (!track && BubblePlayer.getCurrentTrack()?.id === trackId) {
      track = BubblePlayer.getCurrentTrack();
    }
    if (!track && trackObj) {
      await BubbleDB.upsertTrack(trackObj);
      track = trackObj;
    }
    if (!track) {
      toast('Could not find track details for download', 'error');
      return;
    }
    return BubbleDownloader.downloadTrack(track);
  }

  async function downloadPlaylist(playlistId) {
    const tracks = await BubbleDB.getPlaylistTracks(playlistId);
    if (tracks.length === 0) { toast('No tracks to download', 'warning'); return; }
    toast(`Queueing ${tracks.length} tracks for download...`, 'info');
    BubbleDownloader.downloadMultiple(tracks);
  }

  async function toggleLike(trackId, trackObj = null) {
    // Signed-out web users have nowhere to persist likes.
    if (!BubbleAPI.isElectron && !BubbleAPI.auth.isSignedIn()) {
      toast('Sign in to save Liked Songs', 'warning');
      return;
    }

    // Electron: the track must exist locally before we flip its is_liked flag.
    if (BubbleAPI.isElectron && trackObj) {
      const existing = await BubbleDB.getTrack(trackId);
      if (!existing) await BubbleDB.upsertTrack(trackObj);
    }

    // Web persists to Supabase (user_liked_tracks); Electron flips the SQLite flag.
    const isLiked = await BubbleDB.toggleLike(trackId, trackObj);
    if (isLiked === undefined) {
      toast('Could not update Liked Songs', 'error');
      return;
    }

    const btn = document.getElementById('btn-like');
    const npBtn = document.getElementById('np-btn-like');
    const current = BubblePlayer.getCurrentTrack();
    if (current && current.id === trackId) {
      if (btn) btn.classList.toggle('liked', isLiked === 1);
      if (npBtn) npBtn.classList.toggle('liked', isLiked === 1);
    }

    // Update any dynamically rendered like buttons
    document.querySelectorAll(`[data-track-like-btn="${trackId}"]`).forEach(b => {
      b.style.color = isLiked ? 'var(--accent)' : 'var(--text-secondary)';
      const svg = b.querySelector('svg');
      if (svg) svg.setAttribute('fill', isLiked ? 'currentColor' : 'none');
    });

    toast(isLiked ? 'Added to Liked Songs' : 'Removed from Liked Songs', 'info');
    mirrorLike(trackObj || await BubbleDB.getTrack(trackId), isLiked === 1);
    // Keep the sidebar liked-count in sync (sidebar-only avoids closing modals).
    refreshData({ sidebar: true });
    return isLiked;
  }

  // Mirror like/unlike back to the connected streaming account (best-effort).
  function mirrorLike(track, liked) {
    if (!track) return;
    if (track.source === 'spotify' || String(track.id || '').startsWith('sp_')) {
      const uri = track.source_id || String(track.id).replace('sp_', '');
      if (uri) {
        BubbleSpotify.setLibrary([uri], liked).then(ok => {
          if (!ok) console.warn('Spotify like mirror failed for', uri);
        });
      }
    }
  }

  async function setMode(mode) {
    await BubbleSettings.set('mode', mode);
    toast(`Switched to ${mode.toUpperCase()} mode`, 'info');
    BubbleRouter.navigate(BubbleRouter.getCurrentRoute(), { force: true });
  }

  async function syncNow() {
    BubbleRouter.navigate('sync');
    await BubbleSync.syncNow('manual');
  }

  // Monitor sync progress across the app to update the sidebar badge
  BubbleSync.on('update', (st) => {
    const navSync = document.getElementById('nav-sync');
    if (!navSync) return;
    let badge = navSync.querySelector('.nav-badge-syncing');
    if (st.isSyncing) {
      if (!badge) {
        badge = document.createElement('span');
        badge.className = 'nav-badge-syncing';
        navSync.appendChild(badge);
      }
      badge.textContent = `${st.percent}%`;
    } else if (badge) {
      badge.remove();
    }
  });

  /* ── Toast Notifications ───────────────────────────────────────── */
  function toast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;
    const el = document.createElement('div');
    el.className = `toast toast-${type}`;
    el.innerHTML = `
      <div style="flex:1">${escapeHtml(message)}</div>
      <button style="opacity:0.6;font-size:12px" onclick="this.parentElement.remove()">✕</button>
    `;
    container.appendChild(el);
    setTimeout(() => {
      el.classList.add('toast-out');
      setTimeout(() => el.remove(), 250);
    }, 4000);
  }

  /* ── Spotify Catalog Actions ─────────────────────────────────── */
  async function browseSpotifyAlbum(albumId, albumObj) {
    toast('Loading album tracks...', 'info');
    try {
      const tracks = await BubbleSpotify.getAlbumTracks(albumId);
      if (!tracks || tracks.length === 0) {
        toast('No tracks found for this album', 'warning');
        return;
      }
      // Save tracks to DB and queue them
      for (const t of tracks) {
        await BubbleDB.upsertTrack(t);
      }
      BubblePlayer.setQueue(tracks, 0);
      toast(`Playing album: ${albumObj?.name || 'Album'} (${tracks.length} tracks)`, 'success');
    } catch (err) {
      toast('Failed to load album tracks: ' + err.message, 'error');
    }
  }

  async function saveSpotifyAlbum(albumId) {
    try {
      const result = await BubbleSpotify.saveAlbum(albumId);
      if (result.success) {
        toast('Album saved to your Spotify Library!', 'success');
      } else {
        toast('Failed to save album: ' + (result.error || 'Unknown error'), 'error');
      }
    } catch (err) {
      toast('Error saving album: ' + err.message, 'error');
    }
  }

  async function followSpotifyPlaylist(playlistId) {
    try {
      const result = await BubbleSpotify.followPlaylist(playlistId);
      if (result.success) {
        toast('Playlist followed! Check your Spotify Library.', 'success');
      } else {
        toast('Failed to follow playlist: ' + (result.error || 'Unknown error'), 'error');
      }
    } catch (err) {
      toast('Error following playlist: ' + err.message, 'error');
    }
  }

  async function browseSpotifyPlaylist(playlistId, playlistObj) {
    toast('Loading playlist tracks...', 'info');
    try {
      const tracks = await BubbleSpotify.getPlaylistTracks(playlistId);
      if (!tracks || tracks.length === 0) {
        toast('No tracks found for this playlist', 'warning');
        return;
      }
      for (const t of tracks) {
        await BubbleDB.upsertTrack(t);
      }
      BubblePlayer.setQueue(tracks, 0);
      toast(`Playing playlist: ${playlistObj?.name || 'Playlist'} (${tracks.length} tracks)`, 'success');
    } catch (err) {
      toast('Failed to load playlist tracks: ' + err.message, 'error');
    }
  }

  async function searchArtistTopTracks(artistId, artistObj) {
    toast('Loading top tracks...', 'info');
    try {
      // Use Spotify's artist top tracks endpoint (requires market)
      const tracks = await BubbleSpotify.searchCatalog(artistObj?.name || '', ['track'], 10);
      const trackList = tracks?.tracks || [];
      if (trackList.length === 0) {
        toast('No tracks found for this artist', 'warning');
        return;
      }
      for (const t of trackList) {
        await BubbleDB.upsertTrack(t);
      }
      BubblePlayer.setQueue(trackList, 0);
      toast(`Playing ${artistObj?.name || 'artist'} top tracks (${trackList.length})`, 'success');
    } catch (err) {
      toast('Error loading artist tracks: ' + err.message, 'error');
    }
  }

  /* ── ARCOD/Qobuz Album & Artist Actions ──────────────────── */
  async function searchAndPlayAlbum(albumName, artistName) {
    toast('Searching album tracks...', 'info');
    try {
      const query = artistName ? artistName + ' ' + albumName : albumName;
      const results = await stash.music.search(query);
      // Filter tracks matching this album
      const albumTracks = (results || []).filter(t =>
        t.album && t.album.toLowerCase() === (albumName || '').toLowerCase()
      );
      if (albumTracks.length === 0) {
        // Fallback: just play all search results
        if (results && results.length > 0) {
          for (const t of results) await BubbleDB.upsertTrack(t);
          BubblePlayer.setQueue(results, 0);
          toast('Playing search results for album (no exact album match)', 'info');
        } else {
          toast('No tracks found for this album', 'warning');
        }
        return;
      }
      for (const t of albumTracks) await BubbleDB.upsertTrack(t);
      BubblePlayer.setQueue(albumTracks, 0);
      toast('Playing album: ' + albumName + ' (' + albumTracks.length + ' tracks)', 'success');
    } catch (err) {
      toast('Error: ' + err.message, 'error');
    }
  }

  async function searchAndPlayArtist(artistName) {
    toast('Searching artist tracks...', 'info');
    try {
      const results = await stash.music.search(artistName);
      if (!results || results.length === 0) {
        toast('No tracks found for this artist', 'warning');
        return;
      }
      for (const t of results) await BubbleDB.upsertTrack(t);
      BubblePlayer.setQueue(results, 0);
      toast('Playing ' + artistName + ' top tracks (' + results.length + ')', 'success');
    } catch (err) {
      toast('Error: ' + err.message, 'error');
    }
  }

  /** Save an album as a local playlist (persists across Spotify syncs). */
  async function saveAlbumToLibrary(albumName, artistName, artworkUrl) {
    const playlistId = 'local_album_' + Date.now();
    await BubbleDB.upsertPlaylist({
      id: playlistId, name: albumName, description: artistName || '',
      artwork_url: artworkUrl, source: 'local', source_id: playlistId,
      track_count: window.__albumTracks ? window.__albumTracks.length : 0,
      is_synced: 0, sync_mode: 'manual'
    });
    if (window.__albumTracks) {
      for (let i = 0; i < window.__albumTracks.length; i++) {
        await BubbleDB.upsertTrack(window.__albumTracks[i]);
        await BubbleDB.addTrackToPlaylist(playlistId, window.__albumTracks[i].id, i);
      }
    }
    await BubbleLibrary.updateSidebarPlaylists();
    const btn = document.getElementById('btn-save-album');
    if (btn) { btn.textContent = '✓ Saved'; btn.disabled = true; btn.style.opacity = '0.6'; }
    toast('Album saved to Library!', 'success');
  }

  /** Save an artist as a local playlist (persists across Spotify syncs). */
  async function saveArtistToLibrary(artistName, artworkUrl) {
    const playlistId = 'local_artist_' + Date.now();
    await BubbleDB.upsertPlaylist({
      id: playlistId, name: artistName, description: 'Artist • ' + artistName,
      artwork_url: artworkUrl, source: 'local', source_id: playlistId,
      track_count: window.__artistTracks ? window.__artistTracks.length : 0,
      is_synced: 0, sync_mode: 'manual'
    });
    if (window.__artistTracks) {
      for (let i = 0; i < window.__artistTracks.length; i++) {
        await BubbleDB.upsertTrack(window.__artistTracks[i]);
        await BubbleDB.addTrackToPlaylist(playlistId, window.__artistTracks[i].id, i);
      }
    }
    await BubbleLibrary.updateSidebarPlaylists();
    const btn = document.getElementById('btn-save-artist');
    if (btn) { btn.textContent = '✓ Saved'; btn.disabled = true; btn.style.opacity = '0.6'; }
    toast('Artist saved to Library!', 'success');
  }

  /* ── Native Bubble Playlists & Modals ──────────────────────── */
  function showCreatePlaylistModal(initialTracks = null, defaultName = '', defaultDesc = '') {
    const existing = document.getElementById('bubble-playlist-modal');
    if (existing) existing.remove();

    const trackCount = Array.isArray(initialTracks) ? initialTracks.length : (initialTracks ? 1 : 0);
    const countText = trackCount > 0 ? ` (${trackCount} track${trackCount === 1 ? '' : 's'})` : '';

    const modal = document.createElement('div');
    modal.id = 'bubble-playlist-modal';
    modal.style.cssText = `
      position: fixed; inset: 0; z-index: 10000;
      display: flex; align-items: center; justify-content: center;
      background: rgba(0, 0, 0, 0.75); backdrop-filter: blur(12px);
    `;

    modal.innerHTML = `
      <div style="width: 440px; max-width: 92vw; background: #121218; border: 1px solid rgba(255,255,255,0.14); border-radius: 16px; padding: 24px; box-shadow: 0 24px 60px rgba(0,0,0,0.8); color: #fff; font-family: inherit;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
          <div style="display: flex; align-items: center; gap: 10px;">
            <div style="width: 32px; height: 32px; border-radius: 8px; background: linear-gradient(135deg, #a855f7, #6366f1); display: flex; align-items: center; justify-content: center;">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            </div>
            <h2 style="margin: 0; font-size: 18px; font-weight: 700; color: #fff;">New Bubble Playlist</h2>
          </div>
          <button id="modal-close-btn" style="background: none; border: none; color: #a1a1aa; font-size: 20px; cursor: pointer; padding: 4px;">✕</button>
        </div>

        <div style="margin-bottom: 16px;">
          <label style="display: block; font-size: 12px; font-weight: 600; color: #a1a1aa; margin-bottom: 6px; text-transform: uppercase; letter-spacing: 0.5px;">Playlist Name</label>
          <input type="text" id="pl-name-input" placeholder="e.g. Midnight Lossless Vibes" value="${escapeHtml(defaultName)}" style="width: 100%; box-sizing: border-box; background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.15); border-radius: 8px; padding: 10px 14px; color: #fff; font-size: 14px; outline: none; transition: border 0.2s;">
        </div>

        <div style="margin-bottom: 24px;">
          <label style="display: block; font-size: 12px; font-weight: 600; color: #a1a1aa; margin-bottom: 6px; text-transform: uppercase; letter-spacing: 0.5px;">Description (Optional)</label>
          <textarea id="pl-desc-input" rows="2" placeholder="Give your playlist a mood or description..." style="width: 100%; box-sizing: border-box; background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.15); border-radius: 8px; padding: 10px 14px; color: #fff; font-size: 13px; outline: none; resize: none; transition: border 0.2s;">${escapeHtml(defaultDesc)}</textarea>
        </div>

        <div style="display: flex; justify-content: flex-end; gap: 10px;">
          <button id="modal-cancel-btn" class="btn btn-secondary" style="padding: 8px 16px; border-radius: 8px; font-size: 14px;">Cancel</button>
          <button id="modal-submit-btn" class="btn btn-primary" style="padding: 8px 20px; border-radius: 8px; font-size: 14px; background: linear-gradient(135deg, #a855f7, #6366f1); border: none; font-weight: 600;">Create Playlist${countText}</button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    const nameInput = modal.querySelector('#pl-name-input');
    const descInput = modal.querySelector('#pl-desc-input');
    nameInput.focus();
    if (defaultName) nameInput.select();

    const closeModal = () => modal.remove();
    modal.querySelector('#modal-close-btn').onclick = closeModal;
    modal.querySelector('#modal-cancel-btn').onclick = closeModal;
    modal.onclick = (e) => { if (e.target === modal) closeModal(); };

    modal.querySelector('#modal-submit-btn').onclick = async () => {
      const name = nameInput.value.trim();
      if (!name) {
        nameInput.style.borderColor = '#ef4444';
        nameInput.focus();
        return;
      }
      const desc = descInput.value.trim();
      const submitBtn = modal.querySelector('#modal-submit-btn');
      submitBtn.disabled = true;
      submitBtn.textContent = 'Creating...';

      try {
        const pl = await BubbleDB.upsertPlaylist({
          name,
          description: desc,
          source: 'bubble',
          artwork_url: Array.isArray(initialTracks) && initialTracks[0]?.artwork_url ? initialTracks[0].artwork_url : (initialTracks?.artwork_url || ''),
        });

        if (initialTracks) {
          const tracksToAdd = Array.isArray(initialTracks) ? initialTracks : [initialTracks];
          await BubbleDB.addTrackToPlaylist(pl.id, tracksToAdd);
        }

        toast(`Created playlist "${name}"`, 'success');
        closeModal();
        await refreshData({ sidebar: true });
        BubbleRouter.navigate('playlist', { id: pl.id, force: true });
      } catch (err) {
        console.error('[Create Playlist Error]', err);
        toast('Failed to create playlist: ' + err.message, 'error');
        submitBtn.disabled = false;
        submitBtn.textContent = 'Create Playlist';
      }
    };
  }

  async function showAddToPlaylistModal(trackOrTracks) {
    if (!trackOrTracks) return;
    const existing = document.getElementById('bubble-add-playlist-modal');
    if (existing) existing.remove();

    const isBatch = Array.isArray(trackOrTracks);
    const subText = isBatch ? `${trackOrTracks.length} songs selected` : `${trackOrTracks.artist || 'Unknown Artist'} — ${trackOrTracks.title || 'Track'}`;

    const modal = document.createElement('div');
    modal.id = 'bubble-add-playlist-modal';
    modal.style.cssText = `
      position: fixed; inset: 0; z-index: 10000;
      display: flex; align-items: center; justify-content: center;
      background: rgba(0, 0, 0, 0.75); backdrop-filter: blur(12px);
    `;

    modal.innerHTML = `
      <div style="width: 460px; max-width: 92vw; max-height: 85vh; display: flex; flex-direction: column; background: #121218; border: 1px solid rgba(255,255,255,0.14); border-radius: 16px; padding: 24px; box-shadow: 0 24px 60px rgba(0,0,0,0.8); color: #fff; font-family: inherit;">
        <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 16px;">
          <div>
            <h2 style="margin: 0 0 4px 0; font-size: 18px; font-weight: 700; color: #fff;">Add to Bubble Playlist</h2>
            <div style="font-size: 13px; color: var(--text-secondary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 360px;">${escapeHtml(subText)}</div>
          </div>
          <button id="modal-close-btn" style="background: none; border: none; color: #a1a1aa; font-size: 20px; cursor: pointer; padding: 4px;">✕</button>
        </div>

        <button id="btn-modal-create-new" style="display: flex; align-items: center; gap: 12px; padding: 12px 14px; background: rgba(168, 85, 247, 0.12); border: 1px dashed rgba(168, 85, 247, 0.4); border-radius: 10px; color: #d8b4fe; font-size: 14px; font-weight: 600; cursor: pointer; margin-bottom: 14px; transition: all 0.2s;">
          <div style="width: 28px; height: 28px; border-radius: 6px; background: #a855f7; display: flex; align-items: center; justify-content: center; color: #fff; font-size: 18px; font-weight: bold;">+</div>
          <span>Create New Playlist</span>
        </button>

        <div style="font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.8px; color: var(--text-tertiary); margin-bottom: 8px;">Select Existing Playlist</div>

        <div id="modal-playlist-list" style="flex: 1; overflow-y: auto; display: flex; flex-direction: column; gap: 6px; padding-right: 4px; max-height: 280px;">
          <div style="text-align: center; color: var(--text-tertiary); padding: 20px;">Loading playlists...</div>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    const closeModal = () => modal.remove();
    modal.querySelector('#modal-close-btn').onclick = closeModal;
    modal.onclick = (e) => { if (e.target === modal) closeModal(); };

    modal.querySelector('#btn-modal-create-new').onclick = () => {
      closeModal();
      showCreatePlaylistModal(trackOrTracks);
    };

    try {
      const playlists = await BubbleDB.getAllPlaylists();
      const listEl = modal.querySelector('#modal-playlist-list');
      if (!listEl) return;

      if (!playlists || playlists.length === 0) {
        listEl.innerHTML = `
          <div style="text-align: center; color: var(--text-tertiary); padding: 24px 10px; font-size: 13px;">
            No playlists found yet. Click <strong>Create New Playlist</strong> above!
          </div>
        `;
        return;
      }

      listEl.innerHTML = playlists.map(p => `
        <div class="playlist-row-select" data-id="${p.id}" style="display: flex; align-items: center; gap: 12px; padding: 8px 10px; border-radius: 8px; cursor: pointer; transition: background 0.15s; background: rgba(255,255,255,0.03);">
          <div style="width: 38px; height: 38px; border-radius: 6px; overflow: hidden; background: #27272a; flex-shrink: 0; display: flex; align-items: center; justify-content: center;">
            ${p.artwork_url ? `<img src="${p.artwork_url}" style="width: 100%; height: 100%; object-fit: cover;">` : `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>`}
          </div>
          <div style="flex: 1; min-width: 0;">
            <div style="font-size: 14px; font-weight: 600; color: #fff; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${escapeHtml(p.name)}</div>
            <div style="font-size: 12px; color: var(--text-secondary);">${p.track_count || 0} tracks ${p.source ? `• <span style="text-transform: capitalize;">${p.source}</span>` : ''}</div>
          </div>
          <button style="padding: 4px 10px; border-radius: 6px; font-size: 12px; font-weight: 600; background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.12); color: #fff; cursor: pointer;">Add</button>
        </div>
      `).join('');

      listEl.querySelectorAll('.playlist-row-select').forEach(row => {
        row.onclick = async () => {
          const playlistId = row.dataset.id;
          const targetPl = playlists.find(p => p.id === playlistId);
          row.style.opacity = '0.5';
          row.style.pointerEvents = 'none';

          try {
            const tracksToAdd = Array.isArray(trackOrTracks) ? trackOrTracks : [trackOrTracks];
            await BubbleDB.addTrackToPlaylist(playlistId, tracksToAdd);
            toast(`Added to "${targetPl?.name || 'Playlist'}"!`, 'success');
            closeModal();
            await refreshData({ sidebar: true, route: true });
          } catch (err) {
            toast('Failed to add track: ' + err.message, 'error');
            row.style.opacity = '1';
            row.style.pointerEvents = 'auto';
          }
        };
      });
    } catch (e) {
      console.error('[Load Playlists Error]', e);
    }
  }

  async function saveQueueToPlaylist() {
    const queueData = BubblePlayer.getQueue ? BubblePlayer.getQueue() : { queue: [] };
    const queue = queueData.queue || [];
    const current = BubblePlayer.getCurrentTrack();

    const allTracks = [];
    if (current) allTracks.push(current);
    for (const t of queue) {
      if (!allTracks.some(x => x.id === t.id)) {
        allTracks.push(t);
      }
    }

    if (allTracks.length === 0) {
      toast('Your play queue is empty!', 'warning');
      return;
    }

    const defaultTitle = current ? `${current.title} & Radio Mix` : `Queue Mix (${new Date().toLocaleDateString()})`;
    showCreatePlaylistModal(allTracks, defaultTitle, `Saved from Bubble play queue (${allTracks.length} tracks)`);
  }

  async function copyPlaylistToBubble(playlistId) {
    if (!playlistId) return;
    toast('Preparing playlist tracks...', 'info');
    try {
      const playlist = await BubbleDB.getPlaylist(playlistId);
      const tracks = await BubbleDB.getPlaylistTracks(playlistId);
      if (!tracks || tracks.length === 0) {
        toast('Playlist has no tracks to copy', 'warning');
        return;
      }
      showCreatePlaylistModal(tracks, `${playlist?.name || 'Playlist'} (Bubble Copy)`, playlist?.description || '');
    } catch (e) {
      toast('Failed to copy playlist: ' + e.message, 'error');
    }
  }

  async function removeDownload(trackId) {
    await stash.db.run("DELETE FROM downloads WHERE track_id = ?", [trackId]);
    toast('Removed from download list', 'info');
    BubbleRouter.navigate('downloads', { force: true });
  }

  async function toggleLosslessSource() {
    try {
      const cur = await BubbleSettings.get('disable_lossless');
      const newState = cur === 'true' ? 'false' : 'true';
      await BubbleSettings.set('disable_lossless', newState);
      const isLossless = newState === 'false';
      toast(isLossless ? '✨ Audio Source: Lossless FLAC (ARCOD)' : '📺 Audio Source: YouTube Music', 'info');

      // Update player badge immediately
      const sourceBadge = document.getElementById('player-source-badge');
      const sourceLabel = document.getElementById('player-source-label');
      const sourceDot = document.getElementById('player-source-dot');
      const qualityPill = document.getElementById('player-quality-pill');
      if (sourceLabel) sourceLabel.textContent = isLossless ? 'Lossless FLAC' : 'YouTube Music';
      if (sourceDot) sourceDot.className = `source-dot ${isLossless ? 'arcod' : 'youtube'}`;
      if (qualityPill) qualityPill.textContent = isLossless ? 'FLAC' : 'YT STREAM';

      // If active route is settings, refresh view
      if (typeof BubbleRouter !== 'undefined' && BubbleRouter.getCurrentRoute?.() === 'settings') {
        BubbleRouter.navigate('settings', { force: true });
      }

      // If a track is playing and not local, reload stream
      const curTrack = BubblePlayer.getCurrentTrack();
      if (curTrack && !curTrack.file_path && !curTrack.is_downloaded) {
        curTrack.forceRefresh = true;
        const curPos = BubblePlayer.getCurrentTime ? BubblePlayer.getCurrentTime() : 0;
        await BubblePlayer.playTrack(curTrack);
        if (curPos > 0) {
          setTimeout(() => BubblePlayer.seekTo(curPos), 400);
        }
      }
    } catch (e) {
      console.warn('toggleLosslessSource error:', e);
    }
  }

  /* ── Centralized refresh after data mutations ──────────────────
     Keeps every surface (sidebar + the active data view) consistent
     after a like, playlist create/delete, add-to-playlist, or sync.
     - sidebar: re-render the playlist list + liked count
     - route:   re-render the current view if it shows track/playlist data */
  async function refreshData({ sidebar = true, route = false } = {}) {
    try {
      if (sidebar && typeof BubbleLibrary !== 'undefined' && BubbleLibrary.updateSidebarPlaylists) {
        await BubbleLibrary.updateSidebarPlaylists();
      }
    } catch (e) { console.warn('[refreshData] sidebar:', e); }

    if (route) {
      try {
        const current = BubbleRouter.getCurrentRoute();
        if (['home', 'library', 'playlist'].includes(current)) {
          const params = BubbleRouter.getCurrentParams ? BubbleRouter.getCurrentParams() : {};
          BubbleRouter.navigate(current, { ...params, force: true });
        }
      } catch (e) { console.warn('[refreshData] route:', e); }
    }
  }

  return {
    init, playTrack, playTrackInContext, playTrackInLibraryContext,
    playLikedSongs, shuffleLikedSongs, downloadLikedSongs,
    playCurrentLibrary, shuffleCurrentLibrary,
    playPlaylist, shufflePlaylist,
    downloadTrack, downloadPlaylist, toggleLike, setMode, syncNow, toast,
    browseSpotifyAlbum, saveSpotifyAlbum, followSpotifyPlaylist,
    browseSpotifyPlaylist, searchArtistTopTracks,
    searchAndPlayAlbum, searchAndPlayArtist,
    saveAlbumToLibrary, saveArtistToLibrary, removeDownload,
    showCreatePlaylistModal, showAddToPlaylistModal, saveQueueToPlaylist, copyPlaylistToBubble,
    toggleLosslessSource, refreshData
  };
})();

// Start App when DOM is loaded (Electron only; web starts via page.tsx)
if (typeof stash !== 'undefined' && !stash._isPolyfill) {
  window.addEventListener('DOMContentLoaded', () => BubbleApp.init());
}
// In web mode, BubbleApp.init() is called manually from page.tsx after React hydration
