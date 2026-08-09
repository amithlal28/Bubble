/* ═══════════════════════════════════════════════════════════════════
   STASH DESKTOP — Home View
   ═══════════════════════════════════════════════════════════════════ */
BubbleRouter.register('home', async (container) => {
  let trackCount = await BubbleDB.getTrackCount();
  let dlStats = await BubbleDB.getDownloadStats();
  let playlists = await BubbleDB.getAllPlaylists();
  let recentTracks = await BubbleDB.getAllTracks({ sort: 'played', limit: 10 });
  let likedTracks = await BubbleDB.getAllTracks({ liked: true, limit: 10 });
  const spConnected = BubbleSpotify.isConnected();
  const ytConnected = BubbleYouTube.isConnected();

  if (!BubbleAPI.isElectron && spConnected) {
    try {
      const spPlaylists = await BubbleSpotify.getPlaylists();
      const existingIds = new Set(playlists.map(p => p.id));
      for (const sp of spPlaylists) {
        if (!existingIds.has(sp.id) && !existingIds.has(sp.source_id)) {
          playlists.push(sp);
        }
      }
      if (likedTracks.length === 0) {
        const spLiked = await BubbleSpotify.getLikedSongs(10, 0);
        likedTracks = spLiked.map(t => ({ ...t, is_liked: 1 }));
      }
    } catch(e) {}
  }

  container.innerHTML = `
    <div class="view-header">
      <h1 class="view-title">Make your Bubble</h1>
      <p class="view-subtitle">Your music, your way. No ads. No analytics.</p>
    </div>

    <!-- Stats -->
    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-value">${trackCount}</div>
        <div class="stat-label">Tracks</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${playlists.length}</div>
        <div class="stat-label">Playlists</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${dlStats.completed}</div>
        <div class="stat-label">Downloaded</div>
      </div>
      <div class="stat-card">
        <div class="stat-value" style="display:flex;align-items:center;gap:8px">
          ${spConnected ? '<span class="source-dot spotify"></span>' : ''}
          ${ytConnected ? '<span class="source-dot youtube"></span>' : ''}
          ${!spConnected && !ytConnected ? '0' : (spConnected && ytConnected ? '2' : '1')}
        </div>
        <div class="stat-label">Connected</div>
      </div>
    </div>

    ${!spConnected && !ytConnected ? `
      <div class="card" style="margin-bottom:var(--space-2xl);text-align:center;padding:var(--space-3xl)">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" stroke-width="1.5" style="margin-bottom:16px"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>
        <h3 style="margin-bottom:8px">Connect your music</h3>
        <p style="color:var(--text-secondary);font-size:var(--font-sm);margin-bottom:20px;max-width:400px;margin-left:auto;margin-right:auto">
          Connect your Spotify or YouTube Music account to import your library, playlists, and daily mixes.
        </p>
        <button class="btn btn-primary" onclick="BubbleRouter.navigate('settings')">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
          Go to Settings
        </button>
      </div>
    ` : `
      <div style="display:flex;gap:var(--space-md);margin-bottom:var(--space-2xl);flex-wrap:wrap">
        <button class="btn btn-primary" id="btn-sync-now" onclick="BubbleApp.syncNow()">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>
          Sync Now
        </button>

      </div>
    `}

    ${recentTracks.length > 0 ? `
      <div class="section-header">
        <h2 class="section-title">Recently Played</h2>
        <button class="section-link" onclick="BubbleRouter.navigate('library')">See all</button>
      </div>
      <div class="scroll-row">
        ${recentTracks.map(t => trackCard(t)).join('')}
      </div>
    ` : ''}

    ${likedTracks.length > 0 ? `
      <div class="section-header" style="margin-top:var(--space-2xl)">
        <h2 class="section-title">Liked Songs</h2>
      </div>
      <div class="scroll-row">
        ${likedTracks.map(t => trackCard(t)).join('')}
      </div>
    ` : ''}

    ${playlists.length > 0 ? `
      <div class="section-header" style="margin-top:var(--space-2xl)">
        <h2 class="section-title">Your Playlists</h2>
      </div>
      <div class="card-grid">
        ${playlists.slice(0, 8).map(p => `
          <div class="card" onclick="BubbleRouter.navigate('playlist',{id:'${p.id}'})">
            <div class="card-artwork">
              ${p.artwork_url ? `<img src="${p.artwork_url}" alt="${escapeHtml(p.name)}" loading="lazy">` :
                `<div class="artwork-placeholder"><svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg></div>`}
              <button class="card-play-btn" onclick="event.stopPropagation();BubbleApp.playPlaylist('${p.id}')">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21"/></svg>
              </button>
            </div>
            <div class="card-title">${escapeHtml(p.name)}</div>
            <div class="card-subtitle"><span class="source-dot ${p.source}"></span>${p.track_count} tracks</div>
          </div>
        `).join('')}
      </div>
    ` : ''}
  `;
});

function trackCard(t) {
  return `
    <div class="card" onclick="BubbleApp.playTrack('${t.id}')">
      <div class="card-artwork">
        ${t.artwork_url ? `<img src="${t.artwork_url}" alt="" loading="lazy">` :
          `<div class="artwork-placeholder"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg></div>`}
        <button class="card-play-btn" onclick="event.stopPropagation();BubbleApp.playTrack('${t.id}')">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21"/></svg>
        </button>
      </div>
      <div class="card-title">${escapeHtml(t.title)}</div>
      <div class="card-subtitle">${escapeHtml(t.artist)}</div>
    </div>
  `;
}
