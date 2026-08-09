/* ═══════════════════════════════════════════════════════════════════
   STASH DESKTOP — Downloads View
   Active and completed FLAC/lossless downloads with ARCOD / YT badge
   ═══════════════════════════════════════════════════════════════════ */

BubbleRouter.register('downloads', async (container) => {
  const downloads = await BubbleDB.getDownloads();
  const stats = await BubbleDB.getDownloadStats();
  const downloadDir = await BubbleDB.getSetting('download_dir') || 'Default Music Folder';

  container.innerHTML = `
    <div class="view-header">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:var(--space-md)">
        <div>
          <h1 class="view-title">Downloads</h1>
          <p class="view-subtitle">Lossless FLAC library stored locally on your PC</p>
        </div>
        <div style="display:flex;gap:var(--space-sm)">
          <button class="btn btn-secondary btn-sm" onclick="stash.fs.openFolder('${downloadDir.replace(/\\/g, '\\\\')}')">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
            Open Downloads Folder
          </button>
        </div>
      </div>
    </div>

    <!-- Routing Banner showing ARCOD / Qobuz status -->
    <div class="card" style="margin-bottom:var(--space-xl);padding:var(--space-lg) var(--space-xl);background:linear-gradient(135deg, rgba(34,197,94,0.07), rgba(0,0,0,0.7));border:1px solid rgba(34,197,94,0.18)">
      <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:var(--space-md)">
        <div>
          <div style="font-size:var(--font-xs);font-weight:700;letter-spacing:1px;color:var(--text-tertiary);text-transform:uppercase;margin-bottom:4px">
            LOSSLESS ROUTING ENGINE
          </div>
          <div style="font-size:var(--font-sm);color:var(--text-secondary)">
            ↳ <strong>Qobuz (via ARCOD)</strong>: Primary source for bit-perfect FLAC. Falls back to YouTube (<span style="color:var(--yellow)">via YT</span>) if unavailable.
          </div>
        </div>
        <div style="display:flex;align-items:center;gap:8px">
          <span class="badge badge-accent" style="display:flex;align-items:center;gap:6px;padding:4px 12px">
            <span class="status-dot connected" style="background:#00e676;box-shadow:0 0 8px #00e676"></span>
            ARCOD Active
          </span>
        </div>
      </div>
    </div>

    <!-- Stats -->
    <div class="stats-grid" style="margin-bottom:var(--space-xl)">
      <div class="stat-card">
        <div class="stat-value">${stats.completed}</div>
        <div class="stat-label">Downloaded Files</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${stats.pending}</div>
        <div class="stat-label">In Queue / Downloading</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${stats.failed}</div>
        <div class="stat-label">Failed</div>
      </div>
    </div>

    ${downloads.length > 0 ? `
      <div class="settings-group" style="padding:var(--space-xs)">
        <div class="track-list-header" style="grid-template-columns: 50px 2fr 120px 140px 100px 80px;padding:var(--space-md) var(--space-lg)">
          <span>#</span>
          <span>Track</span>
          <span>Source</span>
          <span>Progress</span>
          <span>Size</span>
          <span>Actions</span>
        </div>
        ${downloads.map((d, index) => renderDownloadRow(d, index)).join('')}
      </div>
    ` : `
      <div class="empty-state">
        <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
        <div class="empty-state-title">No downloads yet</div>
        <div class="empty-state-text">You can download individual tracks or entire playlists as lossless FLAC files.</div>
        <button class="btn btn-primary" style="margin-top:16px" onclick="BubbleRouter.navigate('library')">Browse Library</button>
      </div>
    `}
  `;
});

function renderDownloadRow(d, index) {
  const isCompleted = d.status === 'completed';
  const isFailed = d.status === 'failed';
  const isDownloading = d.status === 'downloading';
  const fileSizeMb = d.file_size ? (d.file_size / (1024 * 1024)).toFixed(1) + ' MB' : '—';
  const isArcod = d.source === 'arcod';

  return `
    <div class="track-row" style="grid-template-columns: 50px 2fr 120px 140px 100px 80px;padding:var(--space-md) var(--space-lg);border-bottom:1px solid rgba(255,255,255,0.03)">
      <div class="track-number" style="font-size:var(--font-xs)">${index + 1}</div>
      <div class="track-info">
        <div class="track-thumb" style="width:36px;height:36px">
          ${d.artwork_url ? `<img src="${d.artwork_url}" alt="" loading="lazy">` : `<div class="artwork-placeholder"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18V5l12-2v13"/></svg></div>`}
        </div>
        <div class="track-details">
          <div class="track-name" title="${escapeHtml(d.title || '')}">${escapeHtml(d.title || 'Unknown Track')}</div>
          <div class="track-artist-name">${escapeHtml(d.artist || 'Unknown Artist')}</div>
        </div>
      </div>
      <div>
        <span id="dl-source-${d.track_id}" class="badge ${isArcod ? 'badge-accent' : 'badge-yellow'}" style="font-size:10px">
          ${isArcod ? 'ARCOD (Qobuz)' : 'via YT'}
        </span>
      </div>
      <div>
        <div style="display:flex;align-items:center;gap:8px">
          <div class="download-progress-bar" style="max-width:80px;height:6px">
            <div id="dl-progress-${d.track_id}" class="download-progress-fill ${isCompleted ? 'completed' : isFailed ? 'failed' : ''}" style="width:${isCompleted ? 100 : (d.progress || 0)}%"></div>
          </div>
          <span id="dl-status-${d.track_id}" style="font-size:11px;color:var(--text-tertiary);min-width:38px">
            ${isCompleted ? '✓ Done' : isFailed ? '✗ Err' : isDownloading ? `${Math.round(d.progress || 0)}%` : 'Queued'}
          </span>
        </div>
      </div>
      <div class="download-size">${fileSizeMb}</div>
      <div class="track-actions" style="opacity:1;display:flex;gap:4px">
        ${isCompleted ? `
          <button class="track-action-btn" title="Play Local File" onclick="BubbleApp.playTrack('${d.track_id}')">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21"/></svg>
          </button>
        ` : isDownloading ? `
          <button class="track-action-btn" title="Cancel" onclick="BubbleDownloader.cancel('${d.track_id}')">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        ` : `
          <button class="track-action-btn" title="Retry" onclick="BubbleApp.downloadTrack('${d.track_id}')">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
          </button>
        `}
        ${(isCompleted || isFailed) ? `
          <button class="track-action-btn" title="Remove from list" onclick="BubbleApp.removeDownload('${d.track_id}')" style="color:var(--text-tertiary)">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
          </button>
        ` : ''}
      </div>
    </div>
  `;
}
