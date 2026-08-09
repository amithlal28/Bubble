/* ═══════════════════════════════════════════════════════════════════
   STASH DESKTOP — Album Detail View
   Shows album tracks with Play button
   ═══════════════════════════════════════════════════════════════════ */

BubbleRouter.register('album', async (container, params) => {
    const albumName = params.name || '';
    const artistName = params.artist || '';
    const artworkUrl = params.artwork || '';

    if (!albumName) {
        container.innerHTML = '<div class="empty-state"><div class="empty-state-title">No album specified</div></div>';
        return;
    }

    // Show loading
    container.innerHTML = `
    <div style="text-align:center;padding:var(--space-3xl)">
      <div class="spinner" style="width:32px;height:32px;margin:0 auto var(--space-md);border-width:3px"></div>
      <div style="color:var(--text-secondary)">Loading album tracks...</div>
    </div>
  `;

    // Search ARCOD for this album's tracks
    const query = artistName ? `${artistName} ${albumName}` : albumName;
    let tracks = [];
    try {
        const results = await stash.music.search(query);
        tracks = (results || []).filter(t =>
            t.album && t.album.toLowerCase() === albumName.toLowerCase()
        );
        // Fallback: if no exact album match, use all results
        if (tracks.length === 0 && results && results.length > 0) {
            tracks = results;
        }
    } catch (e) {
        tracks = [];
    }

    // Save tracks to DB for playback
    for (const t of tracks) {
        await BubbleDB.upsertTrack(t).catch(() => { });
    }
    window.__albumTracks = tracks;

    const totalDuration = tracks.reduce((s, t) => s + (t.duration || 0), 0);

    container.innerHTML = `
    <div style="display:flex;gap:var(--space-2xl);align-items:flex-start;flex-wrap:wrap;padding-bottom:var(--space-2xl)">
      <!-- Album Artwork -->
      <div style="flex-shrink:0">
        <div style="width:240px;height:240px;border-radius:var(--radius-lg);overflow:hidden;background:var(--bg-elevated);box-shadow:0 8px 40px rgba(0,0,0,0.5)">
          ${artworkUrl
            ? `<img src="${artworkUrl}" alt="" style="width:100%;height:100%;object-fit:cover">`
            : `<div class="artwork-placeholder" style="width:100%;height:100%;display:flex;align-items:center;justify-content:center"><svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="2" y="2" width="20" height="20" rx="2"/><circle cx="12" cy="12" r="5"/></svg></div>`
        }
        </div>
      </div>

      <!-- Album Info -->
      <div style="flex:1;min-width:280px">
        <div style="font-size:var(--font-xs);font-weight:700;letter-spacing:1px;text-transform:uppercase;color:var(--text-tertiary);margin-bottom:8px">Album</div>
        <h1 style="font-size:var(--font-2xl);font-weight:800;margin-bottom:4px">${escapeHtml(albumName)}</h1>
        <div style="font-size:var(--font-md);color:var(--text-secondary);margin-bottom:var(--space-lg)">${escapeHtml(artistName || 'Various Artists')}</div>

        <div style="display:flex;align-items:center;gap:var(--space-md);margin-bottom:var(--space-xl);color:var(--text-tertiary);font-size:var(--font-sm)">
          <span>${tracks.length} tracks</span>
          <span>•</span>
          <span>${BubblePlayer.formatTime(totalDuration)}</span>
          <span class="badge badge-accent" style="font-size:10px;padding:2px 8px">ARCOD FLAC</span>
        </div>

        <div style="display:flex;gap:var(--space-md);flex-wrap:wrap">
          <button class="btn btn-primary" style="padding:10px 28px;font-size:var(--font-base)" onclick="if(window.__albumTracks){BubblePlayer.setQueue(window.__albumTracks,0)}">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21"/></svg> Play Album
          </button>
          <button class="btn btn-secondary" style="padding:10px 20px" onclick="if(window.__albumTracks){BubblePlayer.setQueue(window.__albumTracks,0,true)}">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="16 3 21 3 21 8"/><line x1="4" y1="20" x2="21" y2="3"/></svg> Shuffle
          </button>
          <button class="btn btn-secondary" style="padding:10px 20px" onclick="if(window.__albumTracks && window.__albumTracks.length){BubbleApp.showCreatePlaylistModal(window.__albumTracks, '${escapeHtml(albumName)}', 'Album by ${escapeHtml(artistName)}')}">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg> Save as Playlist
          </button>
          <button class="btn btn-secondary" style="padding:10px 20px" id="btn-save-album" onclick="BubbleApp.saveAlbumToLibrary('${escapeHtml(albumName)}','${escapeHtml(artistName)}','${escapeHtml(artworkUrl)}')">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg> Save to Library
          </button>
        </div>
      </div>
    </div>

    ${tracks.length > 0 ? `
      <div class="track-list">
        <div class="track-list-header"><span>#</span><span>Title</span><span>Artist</span><span>Duration</span><span></span></div>
        ${tracks.map((t, i) => renderAlbumTrackRow(t, i)).join('')}
      </div>
    ` : `
      <div class="empty-state">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
        <div class="empty-state-title">No tracks found</div>
        <div class="empty-state-text">No tracks were found for this album. Try searching directly.</div>
      </div>
    `}
  `;
});

function renderAlbumTrackRow(t, i) {
    const current = BubblePlayer.getCurrentTrack();
    const isPlaying = current && current.id === t.id;
    const encoded = encTrack(t);
    return `
    <div class="track-row ${isPlaying ? 'playing' : ''}" style="cursor:pointer" onclick="if(window.__albumTracks){BubblePlayer.setQueue(window.__albumTracks,${i})}">
      <div class="track-number">
        <span class="num-text">${isPlaying ? '<svg width="14" height="14" viewBox="0 0 24 24" fill="var(--accent)"><rect x="4" y="4" width="3" height="16" rx="1"><animate attributeName="height" values="16;6;16" dur="0.9s" repeatCount="indefinite"/></rect></svg>' : (i + 1)}</span>
        <span class="play-icon"><svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21"/></svg></span>
      </div>
      <div class="track-info">
        <div class="track-details">
          <div class="track-name">${escapeHtml(t.title)}</div>
          <div class="track-artist-name">${escapeHtml(t.artist)}</div>
        </div>
      </div>
      <div class="track-album">${escapeHtml(t.artist || '')}</div>
      <div class="track-duration">${BubblePlayer.formatTime(t.duration)}</div>
      <div class="track-actions" onclick="event.stopPropagation()">
        <button class="track-action-btn" title="Add to Bubble Playlist" onclick="BubbleApp.showAddToPlaylistModal(JSON.parse(decodeURIComponent('${encoded}')))"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg></button>
        <button class="track-action-btn" title="Download Lossless FLAC" onclick="BubbleApp.downloadTrack('${t.id}', JSON.parse(decodeURIComponent('${encoded}')))"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg></button>
        <button class="track-action-btn ${t.is_liked ? 'liked' : ''}" title="Like" onclick="BubbleApp.toggleLike('${t.id}', JSON.parse(decodeURIComponent('${encoded}')))"><svg width="14" height="24" viewBox="0 0 24 24" fill="${t.is_liked ? 'var(--accent)' : 'none'}" stroke="currentColor" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg></button>
      </div>
    </div>
  `;
}
