/* ═══════════════════════════════════════════════════════════════════
   STASH DESKTOP — Library View (with pagination & Liked Playlist)
   ═══════════════════════════════════════════════════════════════════ */
BubbleRouter.register('library', async (container, params) => {
  let filter = params.filter || 'all';
  let sort = params.sort || 'added';
  let offset = parseInt(params.offset) || 0;
  const PAGE_SIZE = 100;

  // source filters (actual track sources) vs special filters (liked, downloaded, bubble)
  const sourceFilters = ['spotify', 'youtube', 'arcod', 'itunes', 'local'];
  const isBubble = filter === 'bubble'; // Bubble Playlists — a playlist-only view
  const sourceVal = sourceFilters.includes(filter) ? filter : undefined;
  const likedVal = filter === 'liked' ? true : undefined;
  const downloadedVal = filter === 'downloaded' ? true : undefined;

  // Track stats + page of tracks (skipped for the Bubble Playlists view)
  let totalCount = 0;
  let totalDuration = 0;
  let tracks = [];
  if (!isBubble) {
    try {
      const stats = await BubbleDB.getTrackStats({
        source: sourceVal,
        liked: likedVal,
        downloaded: downloadedVal
      });
      totalCount = stats.total || 0;
      totalDuration = stats.duration || 0;
    } catch (e) { totalCount = 0; totalDuration = 0; }

    tracks = await BubbleDB.getAllTracks({
      source: sourceVal,
      liked: likedVal,
      downloaded: downloadedVal,
      sort,
      limit: PAGE_SIZE,
      offset: offset
    });
  }

  const hasMore = (offset + tracks.length) < totalCount;
  const showing = offset + tracks.length;

  // Playlists to surface as cards: Spotify tab → Spotify playlists;
  // Bubble tab → the user's own Bubble (local) playlists.
  let sourcePlaylists = [];
  if (filter === 'spotify' || isBubble) {
    try {
      const allPls = await BubbleDB.getAllPlaylists();
      sourcePlaylists = (allPls || []).filter(p => isBubble
        ? (p.source !== 'spotify' && p.source !== 'youtube')
        : (p.source || '') === 'spotify');
    } catch (e) { sourcePlaylists = []; }
  }

  if (filter === 'liked') {
    // Dedicated Liked Songs Playlist View
    container.innerHTML = `
      <div class="playlist-header">
        <div class="liked-cover">
          <svg width="80" height="80" viewBox="0 0 24 24" fill="white">
            <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
          </svg>
        </div>
        <div class="playlist-meta">
          <div class="playlist-type">PLAYLIST</div>
          <h1 class="playlist-name">Liked Songs</h1>
          <p class="playlist-desc">Your personal collection of saved favorite tracks from Spotify and your library.</p>
          <div class="playlist-stats">
            <span>${totalCount} tracks</span>
            ${totalDuration ? `<span>•</span><span>${BubblePlayer.formatTime(totalDuration)}</span>` : ''}
          </div>
          <div class="playlist-actions">
            <button class="btn btn-primary" onclick="BubbleApp.playLikedSongs(0, false)">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21"/></svg> Play
            </button>
            <button class="btn btn-secondary" onclick="BubbleApp.shuffleLikedSongs()">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 3 21 3 21 8"/><line x1="4" y1="20" x2="21" y2="3"/><polyline points="21 16 21 21 16 21"/><line x1="15" y1="15" x2="21" y2="21"/><line x1="4" y1="4" x2="9" y2="9"/></svg> Shuffle
            </button>
            <button class="btn btn-secondary" onclick="BubbleApp.downloadLikedSongs()">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg> Download All
            </button>
          </div>
        </div>
      </div>
      <div class="library-toolbar">
        <div class="library-filters">
          ${['all', 'spotify', 'bubble', 'liked', 'downloaded'].map(f => `
            <button class="filter-chip ${filter === f ? 'active' : ''}" onclick="BubbleRouter.navigate('library',{filter:'${f}',sort:'${sort}',force:true})">${f === 'all' ? 'All' : f === 'spotify' ? 'Spotify' : f === 'bubble' ? 'Bubble' : f.charAt(0).toUpperCase() + f.slice(1)}</button>
          `).join('')}
        </div>
        <div style="display:flex;align-items:center;gap:var(--space-sm)">
          <select class="select-field" onchange="BubbleRouter.navigate('library',{filter:'${filter}',sort:this.value,force:true})">
            <option value="added" ${sort === 'added' ? 'selected' : ''}>Date Added</option>
            <option value="title" ${sort === 'title' ? 'selected' : ''}>Title</option>
            <option value="artist" ${sort === 'artist' ? 'selected' : ''}>Artist</option>
            <option value="duration" ${sort === 'duration' ? 'selected' : ''}>Duration</option>
          </select>
        </div>
      </div>
      ${tracks.length > 0 ? `
        <div class="track-list">
          <div class="track-list-header">
            <span>#</span><span>Title</span><span>Album</span><span>Duration</span><span></span>
          </div>
          ${tracks.map((t, i) => trackRow(t, offset + i, filter, sort)).join('')}
        </div>
        ${hasMore ? `
          <div style="text-align:center;padding:var(--space-xl)">
            <button class="btn btn-secondary" onclick="BubbleRouter.navigate('library',{filter:'${filter}',sort:'${sort}',offset:${offset + PAGE_SIZE},force:true})">
              Load More (${totalCount - showing} remaining)
            </button>
          </div>
        ` : ''}
      ` : `
        <div class="empty-state">
          <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
          <div class="empty-state-title">No liked songs yet</div>
          <div class="empty-state-text">Sync your Spotify Liked Songs or click the heart icon on any track to add it here.</div>
          <button class="btn btn-primary" style="margin-top:16px" onclick="BubbleRouter.navigate('sync')">Go to Sync</button>
        </div>
      `}
    `;
  } else if (isBubble) {
    // Bubble Playlists View — the user's own playlists only
    container.innerHTML = `
      <div class="view-header">
        <h1 class="view-title">Bubbles</h1>
        <p class="view-subtitle">${sourcePlaylists.length} playlist${sourcePlaylists.length === 1 ? '' : 's'} created in Bubble</p>
      </div>
      <div class="library-toolbar">
        <div class="library-filters">
          ${['all', 'spotify', 'bubble', 'liked', 'downloaded'].map(f => `
            <button class="filter-chip ${filter === f ? 'active' : ''}" onclick="BubbleRouter.navigate('library',{filter:'${f}',sort:'${sort}',force:true})">${f === 'all' ? 'All' : f === 'spotify' ? 'Spotify' : f === 'bubble' ? 'Bubble' : f.charAt(0).toUpperCase() + f.slice(1)}</button>
          `).join('')}
        </div>
        <button class="btn btn-primary btn-sm" onclick="BubbleApp.showCreatePlaylistModal()">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg> New Playlist
        </button>
      </div>
      ${sourcePlaylists.length > 0 ? renderLibraryPlaylists(sourcePlaylists, 'Bubbles') : `
        <div class="empty-state">
          <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>
          <div class="empty-state-title">No Bubbles yet</div>
          <div class="empty-state-text">Create one with the button above (or the + in the sidebar), or use "Add to Bubbles" on any track.</div>
          <button class="btn btn-primary" style="margin-top:16px" onclick="BubbleApp.showCreatePlaylistModal()">Create Playlist</button>
        </div>
      `}
    `;
  } else {
    // Standard Library View with Play & Shuffle Toolbar Action Buttons
    container.innerHTML = `
      <div class="view-header" style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:var(--space-md)">
        <div>
          <h1 class="view-title">Library</h1>
          <p class="view-subtitle">${showing} of ${totalCount} tracks</p>
        </div>
        ${tracks.length > 0 ? `
          <div style="display:flex;align-items:center;gap:var(--space-sm)">
            <button class="btn btn-primary btn-sm" onclick="BubbleApp.playCurrentLibrary('${filter}','${sort}',0,false)">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21"/></svg> Play All
            </button>
            <button class="btn btn-secondary btn-sm" onclick="BubbleApp.shuffleCurrentLibrary('${filter}','${sort}')">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 3 21 3 21 8"/><line x1="4" y1="20" x2="21" y2="3"/><polyline points="21 16 21 21 16 21"/><line x1="15" y1="15" x2="21" y2="21"/><line x1="4" y1="4" x2="9" y2="9"/></svg> Shuffle
            </button>
          </div>
        ` : ''}
      </div>
      <div class="library-toolbar">
        <div class="library-filters">
          ${['all', 'spotify', 'bubble', 'liked', 'downloaded'].map(f => `
            <button class="filter-chip ${filter === f ? 'active' : ''}" onclick="BubbleRouter.navigate('library',{filter:'${f}',sort:'${sort}',force:true})">${f === 'all' ? 'All' : f === 'spotify' ? 'Spotify' : f === 'bubble' ? 'Bubble' : f.charAt(0).toUpperCase() + f.slice(1)}</button>
          `).join('')}
        </div>
        <div style="display:flex;align-items:center;gap:var(--space-sm)">
          <select class="select-field" onchange="BubbleRouter.navigate('library',{filter:'${filter}',sort:this.value,force:true})">
            <option value="added" ${sort === 'added' ? 'selected' : ''}>Date Added</option>
            <option value="title" ${sort === 'title' ? 'selected' : ''}>Title</option>
            <option value="artist" ${sort === 'artist' ? 'selected' : ''}>Artist</option>
            <option value="duration" ${sort === 'duration' ? 'selected' : ''}>Duration</option>
          </select>
        </div>
      </div>
      ${sourcePlaylists.length > 0 ? renderLibraryPlaylists(sourcePlaylists, 'Spotify Playlists') : ''}
      ${tracks.length > 0 ? `
        ${sourcePlaylists.length > 0 ? '<div class="section-header" style="margin-top:var(--space-lg)"><h2 class="section-title">Songs</h2></div>' : ''}
        <div class="track-list">
          <div class="track-list-header">
            <span>#</span><span>Title</span><span>Album</span><span>Duration</span><span></span>
          </div>
          ${tracks.map((t, i) => trackRow(t, offset + i, filter, sort)).join('')}
        </div>
        ${hasMore ? `
          <div style="text-align:center;padding:var(--space-xl)">
            <button class="btn btn-secondary" onclick="BubbleRouter.navigate('library',{filter:'${filter}',sort:'${sort}',offset:${offset + PAGE_SIZE},force:true})">
              Load More (${totalCount - showing} remaining)
            </button>
          </div>
        ` : ''}
      ` : (sourcePlaylists.length > 0 ? '' : `
        <div class="empty-state">
          <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>
          <div class="empty-state-title">Your library is empty</div>
          <div class="empty-state-text">Connect Spotify or YouTube Music in Settings, then sync your library.</div>
          <button class="btn btn-primary" style="margin-top:16px" onclick="BubbleRouter.navigate('settings')">Connect Services</button>
        </div>
      `)}
    `;
  }
});

function renderLibraryPlaylists(playlists, title) {
  if (!playlists || playlists.length === 0) return '';
  return `
    <div class="section-header" style="margin-top:var(--space-md)">
      <h2 class="section-title">${title} (${playlists.length})</h2>
    </div>
    <div class="card-grid">
      ${playlists.map(p => `
        <div class="card" onclick="BubbleRouter.navigate('playlist',{id:'${p.id}'})">
          <div class="card-artwork">
            ${p.artwork_url ? `<img src="${p.artwork_url}" alt="${escapeHtml(p.name)}" loading="lazy">` :
      `<div class="artwork-placeholder"><svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg></div>`}
            <button class="card-play-btn" onclick="event.stopPropagation();BubbleApp.playPlaylist('${p.id}')">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21"/></svg>
            </button>
          </div>
          <div class="card-title">${escapeHtml(p.name)}</div>
          <div class="card-subtitle"><span class="source-dot ${p.source}"></span>${p.track_count || 0} tracks</div>
        </div>
      `).join('')}
    </div>
  `;
}

function trackRow(t, i, filter = 'all', sort = 'added') {
  const current = BubblePlayer.getCurrentTrack();
  const isPlaying = current && current.id === t.id;
  return `
    <div class="track-row ${isPlaying ? 'playing' : ''}" style="cursor:pointer" onclick="BubbleApp.playTrackInLibraryContext('${t.id}','${filter}','${sort}',${i})">
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
        <button class="track-action-btn" title="Add to Bubbles" onclick="BubbleApp.showAddToPlaylistModal(JSON.parse(decodeURIComponent('${encTrack(t)}')))"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg></button>
        ${!t.is_downloaded ? `<button class="track-action-btn" title="Download Lossless FLAC" onclick="BubbleApp.downloadTrack('${t.id}', JSON.parse(decodeURIComponent('${encTrack(t)}')))"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg></button>` : `<span class="badge badge-green" style="font-size:10px">✓</span>`}
        <button class="track-action-btn ${t.is_liked ? 'liked' : ''}" title="Like" onclick="BubbleApp.toggleLike('${t.id}', JSON.parse(decodeURIComponent('${encTrack(t)}')))"><svg width="14" height="14" viewBox="0 0 24 24" fill="${t.is_liked ? 'var(--accent)' : 'none'}" stroke="currentColor" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg></button>
      </div>
    </div>
  `;
}
