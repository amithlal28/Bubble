/* ═══════════════════════════════════════════════════════════════════
   STASH DESKTOP — Live Sync View
   Faithful presentation of Stash's Sync Screen:
   - Live Multi-Phase Hero Progress Card
   - Interactive Phase Step Indicators
   - Real-time Track Download Pipeline & Activity Feed
   - Sync History & Connected Source Diagnostics
   ═══════════════════════════════════════════════════════════════════ */

BubbleRouter.register('sync', async (container) => {
  const syncState = BubbleSync.getState();
  const spotifyConnected = BubbleSpotify.isConnected();
  const youtubeConnected = BubbleYouTube.isConnected();
  const syncMixes = (await BubbleSettings.get('sync_mixes')) === 'true';

  container.innerHTML = `
    <div class="view-header">
      <div class="header-info">
        <h1 class="view-title">Library Synchronization</h1>
        <p class="view-subtitle">Seamlessly synchronize, match, and download your Spotify and YouTube Music libraries in bit-perfect lossless FLAC.</p>
      </div>
      <div class="header-actions">
        <button class="btn btn-secondary" onclick="BubbleRouter.navigate('settings')">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
          Configure Sources
        </button>
      </div>
    </div>

    <!-- ═══ Main Sync Hero Progress Card ═══ -->
    <div class="sync-hero-card" id="sync-hero-card">
      <div class="sync-hero-glow"></div>
      <div class="sync-hero-content">
        <div class="sync-hero-top">
          <div class="sync-status-badge ${syncState.isSyncing ? 'syncing' : syncState.phase === 'Completed' ? 'completed' : 'idle'}" id="sync-phase-badge">
            <span class="sync-status-dot"></span>
            <span id="sync-phase-name">${syncState.phase}</span>
          </div>
          <div class="sync-percentage" id="sync-percent-text">${syncState.percent}%</div>
        </div>

        <div class="sync-hero-middle">
          <h2 class="sync-main-status" id="sync-status-title">${syncState.statusText}</h2>
          <p class="sync-sub-status" id="sync-status-desc">${syncState.detailsText}</p>
        </div>

        <!-- Progress Bar -->
        <div class="sync-progress-track">
          <div class="sync-progress-fill" id="sync-hero-bar" style="width: ${syncState.percent}%"></div>
        </div>

        <!-- Active Track Processing Pill (Shows during download phase) -->
        <div class="sync-current-track ${syncState.currentTrack ? '' : 'hidden'}" id="sync-current-track-box">
          <div class="sync-track-art">
            <img id="sync-track-art-img" src="${syncState.currentTrack?.artwork_url || ''}" alt="">
          </div>
          <div class="sync-track-info">
            <div class="sync-track-title" id="sync-track-title-text">${syncState.currentTrack?.title || 'Downloading Track'}</div>
            <div class="sync-track-meta" id="sync-track-artist-text">${syncState.currentTrack?.artist || 'ARCOD Lossless Pipeline'}</div>
          </div>
          <div class="sync-track-quality">
            <span class="quality-badge flac">24-bit FLAC</span>
          </div>
        </div>

        <!-- Action Controls -->
        <div class="sync-hero-actions">
          <button class="btn btn-primary btn-lg sync-action-btn" id="btn-trigger-sync" onclick="BubbleSync.syncNow('manual')">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" class="${syncState.isSyncing ? 'spin' : ''}"><path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2"/></svg>
            <span id="btn-sync-label">${syncState.isSyncing ? 'Synchronizing Library...' : 'Sync Library Now'}</span>
          </button>
          ${!syncState.isSyncing ? `
            <button class="btn btn-secondary btn-lg" onclick="BubbleSync.syncNow('manual', {quick:true})" title="Fast refresh — syncs playlists only, skips the full Liked Songs re-fetch and mixes">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
              Quick Sync
            </button>
          ` : ''}
          ${syncState.isSyncing ? `
            <button class="btn btn-danger btn-lg" onclick="BubbleSync.cancel()">
              Cancel
            </button>
          ` : ''}
        </div>

        <!-- ═══ Sync Options ═══ -->
        <div class="sync-options" style="margin-top:18px;padding-top:16px;border-top:1px solid var(--surface-glass-border, rgba(255,255,255,0.08))">
          <div style="display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:16px">
            <div>
              <div style="font-size:var(--font-sm);font-weight:600;display:flex;align-items:center;gap:8px">
                Include Spotify Mixes
                <span class="badge ${syncMixes ? 'badge-accent' : 'badge-subtle'}" style="font-size:10px">${syncMixes ? '● ON' : '○ OFF'}</span>
              </div>
              <div style="font-size:var(--font-xs);color:var(--text-tertiary);margin-top:2px;max-width:520px">
                Also import Spotify's auto-generated mixes (Daily Mix, Discover Weekly, Release Radar…). When off, only your own playlists are synced.
              </div>
            </div>
            <label class="toggle">
              <input type="checkbox" ${syncMixes ? 'checked' : ''} onchange="BubbleSettings.set('sync_mixes', this.checked ? 'true' : 'false').then(() => { BubbleApp.toast(this.checked ? 'Spotify Mixes will import on next sync' : 'Spotify Mixes disabled — playlists only', 'info'); BubbleRouter.navigate('sync', {force:true}); })">
              <span class="toggle-slider"></span>
            </label>
          </div>
        </div>
      </div>
    </div>

    <!-- ═══ Multi-Phase Stepper ═══ -->
    <div class="sync-stepper-grid">
      <div class="sync-step-item" id="step-auth">
        <div class="step-icon">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
        </div>
        <div class="step-info">
          <div class="step-name">1. Authentication</div>
          <div class="step-desc">Spotify / YT Music</div>
        </div>
      </div>

      <div class="sync-step-item" id="step-fetch">
        <div class="step-icon">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
        </div>
        <div class="step-info">
          <div class="step-name">2. Fetch Catalog</div>
          <div class="step-desc">Playlists & Liked</div>
        </div>
      </div>

      <div class="sync-step-item" id="step-diff">
        <div class="step-icon">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="16 3 21 3 21 8"/><line x1="4" y1="20" x2="21" y2="3"/><polyline points="21 16 21 21 16 21"/><line x1="15" y1="15" x2="21" y2="21"/><line x1="4" y1="4" x2="9" y2="9"/></svg>
        </div>
        <div class="step-info">
          <div class="step-name">3. Reconcile / Diff</div>
          <div class="step-desc">Find missing tracks</div>
        </div>
      </div>

      <div class="sync-step-item" id="step-download">
        <div class="step-icon">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>
        </div>
        <div class="step-info">
          <div class="step-name">4. ARCOD Lossless</div>
          <div class="step-desc">Direct 24-bit FLAC</div>
        </div>
      </div>

      <div class="sync-step-item" id="step-finalize">
        <div class="step-icon">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>
        </div>
        <div class="step-info">
          <div class="step-name">5. Complete</div>
          <div class="step-desc">Tagged & Saved</div>
        </div>
      </div>
    </div>

    <!-- ═══ Two Column Split: Live Feed & History ═══ -->
    <div class="sync-details-layout">
      <!-- Left Column: Live Activity Feed -->
      <div class="sync-section">
        <div class="section-header-clean">
          <div class="section-title-sm">Live Activity Feed</div>
          <span class="live-pulse-tag"><span class="pulse-dot"></span> LIVE</span>
        </div>
        <div class="sync-activity-terminal" id="sync-activity-feed">
          ${renderActivityLogs(syncState.activityLogs)}
        </div>
      </div>

      <!-- Right Column: Sync History -->
      <div class="sync-section">
        <div class="section-header-clean">
          <div class="section-title-sm">Sync History</div>
        </div>
        <div class="sync-history-table-box" id="sync-history-container">
          ${renderSyncHistory(syncState.history)}
        </div>
      </div>
    </div>
  `;

  // Attach live update listener for this view
  const updateHandler = (st) => {
    const badge = document.getElementById('sync-phase-badge');
    const phaseName = document.getElementById('sync-phase-name');
    const percentText = document.getElementById('sync-percent-text');
    const statusTitle = document.getElementById('sync-status-title');
    const statusDesc = document.getElementById('sync-status-desc');
    const heroBar = document.getElementById('sync-hero-bar');
    const trackBox = document.getElementById('sync-current-track-box');
    const trackArt = document.getElementById('sync-track-art-img');
    const trackTitle = document.getElementById('sync-track-title-text');
    const trackArtist = document.getElementById('sync-track-artist-text');
    const feed = document.getElementById('sync-activity-feed');
    const historyContainer = document.getElementById('sync-history-container');
    const btnLabel = document.getElementById('btn-sync-label');

    if (badge) {
      badge.className = `sync-status-badge ${st.isSyncing ? 'syncing' : st.phase === 'Completed' ? 'completed' : 'idle'}`;
    }
    if (phaseName) phaseName.textContent = st.phase;
    if (percentText) percentText.textContent = `${st.percent}%`;
    if (statusTitle) statusTitle.textContent = st.statusText;
    if (statusDesc) statusDesc.textContent = st.detailsText;
    if (heroBar) heroBar.style.width = `${st.percent}%`;
    if (btnLabel) btnLabel.textContent = st.isSyncing ? 'Synchronizing Library...' : 'Sync Library Now';

    // Update Stepper
    updateStepperHighlight(st.phase);

    if (trackBox) {
      if (st.currentTrack && st.phase === 'Downloading') {
        trackBox.classList.remove('hidden');
        if (trackArt) trackArt.src = st.currentTrack.artwork_url || '';
        if (trackTitle) trackTitle.textContent = st.currentTrack.title || 'Downloading Track';
        if (trackArtist) trackArtist.textContent = `${st.currentTrack.artist || ''} · ARCOD Lossless FLAC`;
      } else {
        trackBox.classList.add('hidden');
      }
    }

    if (feed) {
      feed.innerHTML = renderActivityLogs(st.activityLogs);
    }
    if (historyContainer) {
      historyContainer.innerHTML = renderSyncHistory(st.history);
    }
  };

  BubbleSync.on('update', updateHandler);
  updateStepperHighlight(syncState.phase);
});

function updateStepperHighlight(phase) {
  const steps = {
    'Authenticating': 'step-auth',
    'FetchingPlaylists': 'step-fetch',
    'Diffing': 'step-diff',
    'Downloading': 'step-download',
    'Finalizing': 'step-finalize',
    'Completed': 'step-finalize'
  };

  ['step-auth', 'step-fetch', 'step-diff', 'step-download', 'step-finalize'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.classList.remove('active', 'done');
  });

  const activeId = steps[phase];
  if (activeId) {
    const el = document.getElementById(activeId);
    if (el) el.classList.add('active');
  }
}

function renderActivityLogs(logs) {
  if (!logs || logs.length === 0) {
    return `<div class="sync-empty-log">Sync activity stream will appear here in real time.</div>`;
  }

  return logs.map(l => `
    <div class="log-entry">
      <span class="log-time">${l.time}</span>
      <span class="log-tag tag-${l.type.toLowerCase()}">${l.type}</span>
      <span class="log-msg">${escapeHtml(l.message)}</span>
    </div>
  `).join('');
}

function renderSyncHistory(history) {
  if (!history || history.length === 0) {
    return `<div class="sync-empty-history">No previous sync records found. Click "Sync Library Now" to start your first sync.</div>`;
  }

  return `
    <table class="sync-history-table">
      <thead>
        <tr>
          <th>Time</th>
          <th>Status</th>
          <th>Downloaded</th>
          <th>Duration</th>
        </tr>
      </thead>
      <tbody>
        ${history.map(h => `
          <tr>
            <td><div class="hist-time">${h.dateFormatted || h.timestamp}</div></td>
            <td><span class="hist-badge ${h.status.toLowerCase()}">${h.status}</span></td>
            <td><span class="hist-stat">${h.downloaded || 0} FLAC tracks</span></td>
            <td><span class="hist-duration">${h.duration || '—'}</span></td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
}
