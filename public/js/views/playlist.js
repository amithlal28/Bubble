/* ═══════════════════════════════════════════════════════════════════
   BUBBLE — Playlist View
   ═══════════════════════════════════════════════════════════════════ */
BubbleRouter.register('playlist', async (container, params) => {
  if (!params.id) { BubbleRouter.navigate('library'); return; }
  const playlist = await BubbleDB.getPlaylist(params.id);
  if (!playlist) { container.innerHTML = '<div class="empty-state"><div class="empty-state-title">Playlist not found</div></div>'; return; }
  const tracks = await BubbleDB.getPlaylistTracks(params.id);

  // Expose tracks so individual row clicks can set the full playlist queue
  window.__playlistTracks = tracks;
  window.__playlistId = params.id;

  container.innerHTML = `
    <div class="playlist-header">
      <div class="playlist-cover">
        ${playlist.artwork_url ? `<img src="${playlist.artwork_url}" alt="">` : `<div class="artwork-placeholder" style="width:220px;height:220px"><svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg></div>`}
      </div>
      <div class="playlist-meta">
        <div class="playlist-type"><span class="source-dot ${playlist.source || 'bubble'}"></span> ${(playlist.source || 'Bubble').toUpperCase()} Playlist</div>
        <h1 class="playlist-name">${escapeHtml(playlist.name)}</h1>
        ${playlist.description ? `<p class="playlist-desc">${escapeHtml(playlist.description)}</p>` : ''}
        <div class="playlist-stats">
          <span>${tracks.length} tracks</span>
          <span>•</span>
          <span>${BubblePlayer.formatTime(tracks.reduce((s, t) => s + (t.duration || 0), 0))}</span>
        </div>
        <div class="playlist-actions" style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">
          <button class="btn btn-primary" onclick="BubbleApp.playPlaylist('${playlist.id}')">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21"/></svg> Play
          </button>
          <button class="btn btn-secondary" onclick="BubbleApp.shufflePlaylist('${playlist.id}')">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 3 21 3 21 8"/><line x1="4" y1="20" x2="21" y2="3"/><polyline points="21 16 21 21 16 21"/><line x1="15" y1="15" x2="21" y2="21"/><line x1="4" y1="4" x2="9" y2="9"/></svg> Shuffle
          </button>
          <button class="btn btn-secondary" onclick="BubbleApp.copyPlaylistToBubble('${playlist.id}')" title="Save this entire playlist into a new Bubble Playlist">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg> Save to Bubble
          </button>
          <button class="btn btn-secondary" onclick="BubbleApp.downloadPlaylist('${playlist.id}')" title="Download all tracks as Lossless FLAC">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg> Download All
          </button>
        </div>
      </div>
    </div>
    ${tracks.length > 0 ? `
      <div class="track-list">
        <div class="track-list-header"><span>#</span><span>Title</span><span>Album</span><span>Duration</span><span></span></div>
        ${tracks.map((t, i) => renderPlaylistTrackRow(t, i, params.id)).join('')}
      </div>
    ` : '<div class="empty-state"><div class="empty-state-title">No tracks in this playlist</div></div>'}
  `;
});

function renderPlaylistTrackRow(t, i, playlistId) {
  const current = BubblePlayer.getCurrentTrack();
  const isPlaying = current && current.id === t.id;
  const trackEncoded = encTrack(t);
  return `
    <div class="track-row ${isPlaying ? 'playing' : ''}" style="cursor:pointer" onclick="if(window.__playlistTracks){BubblePlayer.setQueue(window.__playlistTracks,${i})}">
      <div class="track-number">
        <span class="num-text">${isPlaying ? '<svg width="14" height="14" viewBox="0 0 24 24" fill="var(--accent)"><rect x="4" y="4" width="4" height="16" rx="1"><animate attributeName="height" values="16;8;16" dur="0.8s" repeatCount="indefinite"/><animate attributeName="y" values="4;8;4" dur="0.8s" repeatCount="indefinite"/></rect><rect x="10" y="4" width="4" height="16" rx="1"><animate attributeName="height" values="12;16;12" dur="0.6s" repeatCount="indefinite"/><animate attributeName="y" values="6;4;6" dur="0.6s" repeatCount="indefinite"/></rect><rect x="16" y="4" width="4" height="16" rx="1"><animate attributeName="height" values="16;10;16" dur="0.7s" repeatCount="indefinite"/><animate attributeName="y" values="4;7;4" dur="0.7s" repeatCount="indefinite"/></rect></svg>' : (i + 1)}</span>
        <span class="play-icon"><svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21"/></svg></span>
      </div>
      <div class="track-info">
        <div class="track-thumb">
          ${t.artwork_url ? `<img src="${t.artwork_url}" alt="" loading="lazy">` : `<div class="artwork-placeholder"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18V5l12-2v13"/></svg></div>`}
        </div>
        <div class="track-details">
          <div class="track-name">${escapeHtml(t.title)}</div>
          <div class="track-artist-name"><span class="source-dot ${t.source}"></span>${escapeHtml(t.artist)}</div>
        </div>
      </div>
      <div class="track-album">${escapeHtml(t.album || '')}</div>
      <div class="track-duration">${BubblePlayer.formatTime(t.duration)}</div>
      <div class="track-actions" onclick="event.stopPropagation()">
        <button class="track-action-btn" title="Add to Bubble Playlist" onclick="BubbleApp.showAddToPlaylistModal(JSON.parse(decodeURIComponent('${trackEncoded}')))"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg></button>
        ${!t.is_downloaded ? `<button class="track-action-btn" title="Download Lossless FLAC" onclick="BubbleApp.downloadTrack('${t.id}', JSON.parse(decodeURIComponent('${trackEncoded}')))"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg></button>` : `<span class="badge badge-green" style="font-size:10px">✓</span>`}
        <button class="track-action-btn ${t.is_liked ? 'liked' : ''}" title="Like" onclick="BubbleApp.toggleLike('${t.id}', JSON.parse(decodeURIComponent('${trackEncoded}')))"><svg width="14" height="24" viewBox="0 0 24 24" fill="${t.is_liked ? 'var(--accent)' : 'none'}" stroke="currentColor" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg></button>
      </div>
    </div>
  `;
}
