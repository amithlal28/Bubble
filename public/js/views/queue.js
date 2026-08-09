/* ═══════════════════════════════════════════════════════════════════
   BUBBLE — Dedicated Play Queue View
   Live queue management, reordering, history, and now-playing banner
   ═══════════════════════════════════════════════════════════════════ */

window._queueLiveListenerInstalled = false;

BubbleRouter.register('queue', async (container) => {
  renderQueueView(container);

  if (!window._queueLiveListenerInstalled) {
    window._queueLiveListenerInstalled = true;
    BubblePlayer.on('queueChange', () => {
      if (BubbleRouter.getCurrentRoute?.() === 'queue') {
        const cont = document.getElementById('view-container');
        if (cont) renderQueueView(cont);
      }
    });
    BubblePlayer.on('trackChange', () => {
      if (BubbleRouter.getCurrentRoute?.() === 'queue') {
        const cont = document.getElementById('view-container');
        if (cont) renderQueueView(cont);
      }
    });
  }
});

function renderQueueView(container) {
  const currentTrack = BubblePlayer.getCurrentTrack();
  const queueData = BubblePlayer.getQueue ? BubblePlayer.getQueue() : { queue: [], index: -1, isShuffle: false };
  const queue = queueData.queue || [];
  const currentIndex = queueData.index >= 0 ? queueData.index : 0;
  const isShuffle = queueData.isShuffle;

  const upNext = queue.slice(currentIndex + 1);

  let html = `
    <div class="view-header" style="display:flex;align-items:center;justify-content:space-between;margin-bottom:var(--space-2xl);flex-wrap:wrap;gap:16px">
      <div>
        <h1 class="view-title" style="margin-bottom:4px">Play Queue</h1>
        <div style="color:var(--text-secondary);font-size:var(--font-sm)">
          ${queue.length > 0 ? `${queue.length} track${queue.length === 1 ? '' : 's'} in queue` : 'No upcoming tracks'}
        </div>
      </div>
      <div style="display:flex;gap:10px;align-items:center">
        <button class="btn btn-primary btn-sm" onclick="BubbleApp.saveQueueToPlaylist()" title="Save all songs in Queue as a new Bubble Playlist" style="background:linear-gradient(135deg,#a855f7,#6366f1);border:none;font-weight:600;display:flex;align-items:center">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="margin-right:6px">
            <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
          Save as Playlist
        </button>
        <button class="btn btn-secondary btn-sm" onclick="BubblePlayer.toggleShuffle()" title="Toggle Shuffle">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right:6px">
            <polyline points="16 3 21 3 21 8"/><line x1="4" y1="20" x2="21" y2="3"/>
            <polyline points="21 16 21 21 16 21"/><line x1="15" y1="15" x2="21" y2="21"/>
            <line x1="4" y1="4" x2="9" y2="9"/>
          </svg>
          ${isShuffle ? 'Shuffled ON' : 'Shuffle'}
        </button>
        ${queue.length > 0 ? `
          <button class="btn btn-secondary btn-sm" onclick="BubblePlayer.clearQueue(); BubbleRouter.navigate('queue', { force: true });" title="Clear upcoming tracks">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right:6px">
              <polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
            </svg>
            Clear Queue
          </button>
        ` : ''}
        <button class="btn btn-secondary btn-sm" onclick="BubbleRouter.navigate('lyrics')" title="Open Synced Lyrics">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right:6px">
            <path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>
          </svg>
          Lyrics View
        </button>
      </div>
    </div>
  `;

  // ── Now Playing Hero ──
  if (currentTrack) {
    const isLiked = currentTrack.is_liked === 1;
    const isLocal = currentTrack.file_path || currentTrack.is_downloaded;
    const srcName = isLocal ? 'Local FLAC' : (currentTrack.source === 'arcod' ? 'ARCOD (Qobuz Hi-Res)' : currentTrack.source === 'itunes' ? 'Apple Music / iTunes' : currentTrack.source === 'spotify' ? 'Spotify Match' : 'YouTube Audio');
    const badgeColor = isLocal ? 'badge-green' : currentTrack.source === 'arcod' ? 'badge-accent' : currentTrack.source === 'itunes' ? 'badge-red' : 'badge-green';

    html += `
      <div style="margin-bottom:var(--space-2xl)">
        <div style="font-size:var(--font-xs);font-weight:700;letter-spacing:1px;text-transform:uppercase;color:var(--text-tertiary);margin-bottom:var(--space-sm)">Now Playing</div>
        <div class="queue-np-card" style="display:flex;align-items:center;gap:var(--space-lg);padding:var(--space-lg);background:var(--surface-glass);border:1px solid var(--surface-glass-border);border-radius:var(--radius-lg);backdrop-filter:blur(16px)">
          <div style="width:72px;height:72px;border-radius:var(--radius-md);overflow:hidden;background:var(--bg-elevated);flex-shrink:0;box-shadow:0 8px 24px rgba(0,0,0,0.4)">
            ${currentTrack.artwork_url ? `<img src="${currentTrack.artwork_url}" alt="" style="width:100%;height:100%;object-fit:cover">` : `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center"><svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg></div>`}
          </div>
          <div class="queue-np-info" style="flex:1;min-width:0">
            <div style="font-size:var(--font-lg);font-weight:700;color:var(--text-primary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-bottom:4px">
              ${escapeHtml(currentTrack.title || 'Untitled')}
            </div>
            <div style="font-size:var(--font-sm);color:var(--text-secondary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-bottom:8px">
              ${escapeHtml(currentTrack.artist || 'Unknown Artist')} ${currentTrack.album ? `• ${escapeHtml(currentTrack.album)}` : ''}
            </div>
            <div class="queue-np-badges" style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
              <span class="badge ${badgeColor}" style="padding:2px 8px;font-size:10px">${escapeHtml(srcName)}</span>
              <span class="badge badge-accent" style="padding:2px 8px;font-size:10px">${escapeHtml(currentTrack.quality || 'Lossless FLAC')}</span>
            </div>
          </div>
          <div class="queue-np-actions" style="display:flex;align-items:center;gap:8px">
            <button class="btn-icon" onclick="BubbleApp.showAddToPlaylistModal(BubblePlayer.getCurrentTrack())" title="Add to Bubble Playlist" style="background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.1);padding:8px;border-radius:8px;color:#fff;cursor:pointer">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            </button>
            <button class="btn-icon" onclick="BubbleApp.downloadTrack('${currentTrack.id}', BubblePlayer.getCurrentTrack())" title="Download Lossless FLAC to Desktop" style="background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.1);padding:8px;border-radius:8px;color:#fff;cursor:pointer">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            </button>
            <button class="btn-icon" data-track-like-btn="${currentTrack.id}" onclick="BubbleApp.toggleLike('${currentTrack.id}')" title="Like" style="background:transparent;border:none;color:${isLiked ? 'var(--accent)' : 'var(--text-secondary)'};cursor:pointer;padding:8px">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="${isLiked ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
            </button>
            <button class="player-btn-play" onclick="BubblePlayer.toggle()" style="width:44px;height:44px;border-radius:50%;background:var(--accent);color:#000;border:none;display:flex;align-items:center;justify-content:center;cursor:pointer">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                ${BubblePlayer.getIsPlaying() ? '<rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/>' : '<polygon points="5 3 19 12 5 21"/>'}
              </svg>
            </button>
          </div>
        </div>
      </div>
    `;
  }

  // ── Up Next Section ──
  html += `
    <div>
      <div style="font-size:var(--font-xs);font-weight:700;letter-spacing:1px;text-transform:uppercase;color:var(--text-tertiary);margin-bottom:var(--space-md);display:flex;align-items:center;justify-content:space-between">
        <span>Up Next (${upNext.length})</span>
        <span style="font-size:11px;color:var(--text-tertiary);text-transform:none">Click any track to jump</span>
      </div>
  `;

  if (upNext.length === 0) {
    html += `
      <div class="empty-state" style="padding:var(--space-3xl) 0;background:var(--surface-glass);border:1px dashed var(--surface-glass-border);border-radius:var(--radius-lg)">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="opacity:0.4"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>
        <div class="empty-state-title" style="margin-top:12px">No tracks in queue</div>
        <div class="empty-state-text" style="max-width:360px;margin:8px auto">Add songs by playing a playlist, album, or enabling Infinite Radio.</div>
        <div style="display:flex;gap:10px;justify-content:center;margin-top:16px">
          <button class="btn btn-primary btn-sm" onclick="BubbleRouter.navigate('library')">Explore Library</button>
          <button class="btn btn-secondary btn-sm" onclick="BubbleRouter.navigate('search')">Search Music</button>
        </div>
      </div>
    `;
  } else {
    html += `<div class="queue-track-list" style="display:flex;flex-direction:column;gap:6px">`;
    upNext.forEach((track, offset) => {
      const realIndex = currentIndex + 1 + offset;
      const durationStr = BubblePlayer.formatTime ? BubblePlayer.formatTime(track.duration || 0) : '—';
      const isLocal = track.file_path || track.is_downloaded;
      const srcBadge = isLocal ? 'Local' : (track.source === 'arcod' ? 'ARCOD' : track.source === 'itunes' ? 'Apple' : track.source === 'spotify' ? 'Spotify' : 'Web');
      const trackPayload = JSON.stringify(track).replace(/"/g, '&quot;');

      html += `
        <div class="track-row queue-item queue-item-row" style="display:flex;align-items:center;gap:14px;padding:10px 14px;background:var(--surface-glass);border:1px solid var(--surface-glass-border);border-radius:var(--radius-md);cursor:pointer;transition:all var(--transition-fast)" onclick="BubblePlayer.playFromQueue(${realIndex})">
          <span class="queue-item-index" style="width:24px;text-align:center;font-size:12px;color:var(--text-tertiary);font-weight:600">${offset + 1}</span>
          <div style="width:42px;height:42px;border-radius:6px;overflow:hidden;background:var(--bg-elevated);flex-shrink:0">
            ${track.artwork_url ? `<img src="${track.artwork_url}" alt="" style="width:100%;height:100%;object-fit:cover">` : `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg></div>`}
          </div>
          <div class="queue-item-info" style="flex:1;min-width:0">
            <div class="queue-item-title" style="font-size:var(--font-sm);font-weight:600;color:var(--text-primary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">
              ${escapeHtml(track.title || 'Untitled')}
            </div>
            <div class="queue-item-artist" style="font-size:var(--font-xs);color:var(--text-secondary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">
              ${escapeHtml(track.artist || '')} ${track.album ? `• ${escapeHtml(track.album)}` : ''}
            </div>
          </div>
          <span class="badge badge-secondary queue-item-badge" style="padding:2px 8px;font-size:10px">${escapeHtml(srcBadge)}</span>
          <span class="queue-item-duration" style="font-size:12px;color:var(--text-tertiary);font-variant-numeric:tabular-nums;min-width:42px;text-align:right">${durationStr}</span>
          <div class="queue-item-actions" style="display:flex;align-items:center;gap:4px">
            <button class="btn-icon" style="background:transparent;border:none;color:var(--text-tertiary);cursor:pointer;padding:4px;border-radius:4px" title="Add to Playlist" onclick="event.stopPropagation(); BubbleApp.showAddToPlaylistModal(${trackPayload})">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            </button>
            <button class="btn-icon" style="background:transparent;border:none;color:var(--text-tertiary);cursor:pointer;padding:4px;border-radius:4px" title="Download Lossless FLAC" onclick="event.stopPropagation(); BubbleApp.downloadTrack('${track.id}', ${trackPayload})">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            </button>
            <button class="btn-icon" style="background:transparent;border:none;color:var(--text-tertiary);cursor:pointer;padding:4px;border-radius:4px" title="Remove from queue" onclick="event.stopPropagation(); BubblePlayer.removeFromQueue(${realIndex}); BubbleRouter.navigate('queue', { force: true });">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>
        </div>
      `;
    });
    html += `</div>`;
  }

  html += `</div>`;
  container.innerHTML = html;
}
