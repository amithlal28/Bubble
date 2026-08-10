/* ═══════════════════════════════════════════════════════════════════
   STASH DESKTOP — Universal Search View v3
   Tabs: Tracks | Albums | Artists — all via ARCOD Qobuz
   Falls back to grouping ARCOD track results when Qobuz direct unavailable
   ═══════════════════════════════════════════════════════════════════ */

window._bubbleSearchCache = { query: '', results: {}, tab: 'tracks', lastTab: '' };

BubbleRouter.register('search', async (container, params) => {
  const query = (params.q !== undefined ? params.q : window._bubbleSearchCache.query) || '';
  const currentTab = params.tab || window._bubbleSearchCache.tab || 'tracks';
  const tabChanged = currentTab !== window._bubbleSearchCache.lastTab;
  window._bubbleSearchCache.tab = currentTab;

  const input = document.getElementById('search-input-field');
  if (input && container.querySelector('.search-wrapper')) {
    updateTabButtons(container, currentTab);
    // Re-search if query changed OR tab changed (different result type needed)
    if (query.trim() && (query.trim() !== window._bubbleSearchCache.query || tabChanged)) {
      await doSearch(query.trim(), currentTab);
    } else if (query.trim()) {
      renderResults(window._bubbleSearchCache.results, currentTab, document.getElementById('search-content'));
    } else {
      const ca = document.getElementById('search-content');
      if (ca) ca.innerHTML = '';
    }
    return;
  }

  container.innerHTML = buildSearchPageHTML(query, currentTab);
  setupSearchEvents(currentTab);
  if (query.trim()) await doSearch(query.trim(), currentTab);
});

function buildSearchPageHTML(query, currentTab) {
  const tabs = [
    { id: 'tracks', label: 'Tracks', icon: '<polygon points="5 3 19 12 5 21 5 3"/>' },
    { id: 'albums', label: 'Albums', icon: '<rect x="2" y="2" width="20" height="20" rx="2"/><circle cx="12" cy="12" r="5"/>' },
    { id: 'artists', label: 'Artists', icon: '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="10" r="3"/><path d="M12 16c-3 0-6 2-6 4h12c0-2-3-4-6-4z"/>' }
  ];

  return `
    <div class="view-header">
      <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:16px">
        <div>
          <h1 class="view-title">Search & Discover</h1>
          <p class="view-subtitle">Search millions of tracks, albums & artists in Lossless FLAC via ARCOD Qobuz</p>
        </div>
        <div class="badge badge-accent" style="padding:6px 12px;font-size:12px">↳ ARCOD Qobuz FLAC</div>
      </div>

      <div class="search-wrapper" style="margin-top:var(--space-xl);position:relative">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="position:absolute;left:18px;top:50%;transform:translateY(-50%);color:var(--text-secondary);pointer-events:none"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
        <input type="text" id="search-input-field" class="search-input" style="padding-left:46px;padding-right:40px;width:100%" placeholder="Search ${currentTab} in Lossless FLAC..." value="${escapeHtml(query)}" autofocus>
        <button id="search-clear-btn" style="position:absolute;right:16px;top:50%;transform:translateY(-50%);background:none;border:none;color:var(--text-secondary);cursor:pointer;font-size:16px;display:${query ? 'block' : 'none'}">✕</button>
      </div>

      <div style="display:flex;gap:8px;margin-top:var(--space-md)">
        ${tabs.map(t => {
    const active = currentTab === t.id;
    return `<button class="btn btn-secondary search-filter-btn${active ? ' active' : ''}" data-filter="${t.id}" style="${active ? 'background:var(--accent);color:#000;font-weight:600' : ''};display:flex;align-items:center;gap:5px" onclick="BubbleRouter.navigate('search',{q:(document.getElementById('search-input-field')||{}).value||'',tab:'${t.id}',force:true})">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">${t.icon}</svg> ${t.label}
          </button>`;
  }).join('')}
      </div>
    </div>

    <div id="search-results-area">
      <div id="search-loading" style="display:none;text-align:center;padding:var(--space-3xl)">
        <div class="spinner" style="width:32px;height:32px;margin:0 auto var(--space-md);border-width:3px"></div>
        <div id="search-loading-text" style="color:var(--text-secondary);font-size:var(--font-sm)">Searching...</div>
      </div>
      <div id="search-content"></div>
    </div>
  `;
}

function updateTabButtons(container, currentTab) {
  container.querySelectorAll('.search-filter-btn').forEach(btn => {
    const active = btn.dataset.filter === currentTab;
    btn.classList.toggle('active', active);
    btn.style.background = active ? 'var(--accent)' : '';
    btn.style.color = active ? '#000' : '';
    btn.style.fontWeight = active ? '600' : '';
  });
}

async function doSearch(query, tab) {
  const loadingArea = document.getElementById('search-loading');
  const contentArea = document.getElementById('search-content');
  if (loadingArea) loadingArea.style.display = 'block';
  if (contentArea) contentArea.innerHTML = '';

  window._bubbleSearchCache.query = query;
  window._bubbleSearchCache.lastTab = tab;

  try {
    if (tab === 'tracks') {
      const results = (typeof stash !== 'undefined') ? await stash.music.search(query).catch(() => []) : [];
      window._bubbleSearchCache.results = { tracks: results || [] };
    } else if (tab === 'albums') {
      // Primary: ARCOD get-music endpoint returns full album data (no auth needed)
      let albums = [];
      try { albums = (typeof stash !== 'undefined') ? await stash.arcod.searchAlbums(query, 30).catch(() => []) : []; } catch (e) { /* fallback */ }
      // Fallback: Group ARCOD track results by album name
      if (!albums || albums.length === 0) {
        const tracks = (typeof stash !== 'undefined') ? await stash.music.search(query).catch(() => []) : [];
        albums = groupTracksIntoAlbums(tracks || []);
      }
      window._bubbleSearchCache.results = { albums: albums };
    } else if (tab === 'artists') {
      // Primary: ARCOD track search grouped by artist
      const tracks = (typeof stash !== 'undefined') ? await stash.music.search(query).catch(() => []) : [];
      const artists = groupTracksIntoArtists(tracks || []);
      window._bubbleSearchCache.results = { artists: artists };
    }
  } catch (err) {
    window._bubbleSearchCache.results = { error: err.message };
  }

  if (loadingArea) loadingArea.style.display = 'none';
  renderResults(window._bubbleSearchCache.results, tab, contentArea);
}

/** Group ARCOD track results into unique albums. */
function groupTracksIntoAlbums(tracks) {
  const albumMap = new Map();
  for (const t of tracks) {
    if (!t.album) continue;
    const key = (t.album || '').toLowerCase().trim() + '_' + (t.artist || '').toLowerCase().trim();
    if (!albumMap.has(key)) {
      albumMap.set(key, {
        id: 'arcod_album_' + (t.album_id || key.replace(/[^a-z0-9]/g, '')),
        source_id: t.album_id || key,
        name: t.album,
        artist: t.artist,
        artwork_url: t.artwork_url || '',
        type: 'album',
        source: 'arcod',
        total_tracks: 0,
        _searchArtist: t.artist,
        _searchAlbum: t.album
      });
    }
  }
  return Array.from(albumMap.values());
}

/** Group ARCOD track results into unique artists. */
function groupTracksIntoArtists(tracks) {
  const artistMap = new Map();
  for (const t of tracks) {
    if (!t.artist) continue;
    const key = (t.artist || '').toLowerCase().trim();
    if (!artistMap.has(key)) {
      artistMap.set(key, {
        id: 'arcod_artist_' + (t.artist_id || key.replace(/[^a-z0-9]/g, '')),
        source_id: t.artist_id || key,
        name: t.artist,
        artwork_url: t.artwork_url || '',
        type: 'artist',
        source: 'arcod',
        _searchName: t.artist
      });
    }
  }
  return Array.from(artistMap.values());
}

function renderResults(results, tab, container) {
  if (!container) return;
  if (results.error) {
    container.innerHTML = `<div class="empty-state"><div class="empty-state-title">Search Error</div><div class="empty-state-text">${escapeHtml(results.error)}</div></div>`;
    return;
  }

  switch (tab) {
    case 'tracks': renderTrackResults(results.tracks || [], container); break;
    case 'albums': renderAlbumResults(results.albums || [], container); break;
    case 'artists': renderArtistResults(results.artists || [], container); break;
  }
}

/* ── Track Results (existing ARCOD + multi-source) ─────────── */
function renderTrackResults(tracks, container) {
  if (tracks.length === 0) {
    container.innerHTML = `<div class="empty-state"><svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg><div class="empty-state-title">No tracks found</div><div class="empty-state-text">Try a different search term or switch to Albums/Artists tabs.</div></div>`;
    return;
  }

  container.innerHTML = `
    <div class="section-header" style="margin-top:var(--space-md)">
      <h2 class="section-title">Tracks (${tracks.length})</h2>
      <div style="font-size:var(--font-xs);color:var(--text-secondary)">Click to stream · Download for Bit-Perfect FLAC</div>
    </div>
    <div class="track-list">
      <div class="track-list-header"><span>#</span><span>Title</span><span>Album / Quality</span><span>Duration</span><span>Actions</span></div>
      ${tracks.map((t, i) => renderSearchTrackRow(t, i)).join('')}
    </div>
  `;
}

function renderSearchTrackRow(t, i) {
  const current = BubblePlayer.getCurrentTrack();
  const isPlaying = current && (current.id === t.id || (current.title === t.title && current.artist === t.artist));
  const encoded = encTrack(t);

  return `
    <div class="track-row ${isPlaying ? 'playing' : ''}" style="cursor:pointer" onclick="BubbleApp.playTrack('${t.id}', JSON.parse(decodeURIComponent('${encoded}')))">
      <div class="track-number">
        <span class="num-text">${isPlaying ? '<svg width="14" height="14" viewBox="0 0 24 24" fill="var(--accent)"><rect x="4" y="4" width="3" height="16" rx="1"><animate attributeName="height" values="16;6;16" dur="0.9s" repeatCount="indefinite"/></rect><rect x="10" y="4" width="3" height="16" rx="1"><animate attributeName="height" values="10;18;10" dur="0.7s" repeatCount="indefinite"/></rect><rect x="16" y="4" width="3" height="16" rx="1"><animate attributeName="height" values="14;8;14" dur="0.8s" repeatCount="indefinite"/></rect></svg>' : (i + 1)}</span>
        <span class="play-icon"><svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21"/></svg></span>
      </div>
      <div class="track-info">
        <div class="track-thumb">${t.artwork_url ? `<img src="${t.artwork_url}" alt="" loading="lazy">` : `<div class="artwork-placeholder"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18V5l12-2v13"/></svg></div>`}</div>
        <div class="track-details">
          <div class="track-name">${escapeHtml(t.title)}</div>
          <div class="track-artist-name"><span class="source-dot ${t.source || 'arcod'}"></span>${escapeHtml(t.artist)}</div>
        </div>
      </div>
      <div class="track-album" style="display:flex;flex-direction:column;gap:2px">
        <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHtml(t.album || 'Single')}</span>
        <span class="badge ${t.source === 'arcod' ? 'badge-accent' : 'badge-source'}" style="font-size:10px;align-self:flex-start;padding:2px 6px">${escapeHtml(t.quality || 'FLAC')}</span>
      </div>
      <div class="track-duration">${BubblePlayer.formatTime(t.duration)}</div>
      <div class="track-actions" onclick="event.stopPropagation()">
        <button class="track-action-btn" title="Add to Bubble Playlist" onclick="BubbleApp.showAddToPlaylistModal(JSON.parse(decodeURIComponent('${encoded}')))"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg></button>
        <button class="track-action-btn" title="Download Lossless FLAC" onclick="BubbleApp.downloadTrack('${t.id}', JSON.parse(decodeURIComponent('${encoded}')))"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg></button>
        <button class="track-action-btn ${t.is_liked ? 'liked' : ''}" title="Like" onclick="BubbleApp.toggleLike('${t.id}', JSON.parse(decodeURIComponent('${encoded}')))"><svg width="14" height="14" viewBox="0 0 24 24" fill="${t.is_liked ? 'var(--accent)' : 'none'}" stroke="currentColor" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg></button>
      </div>
    </div>
  `;
}

/* ── Album Results ────────────────────────────────────────── */
function renderAlbumResults(albums, container) {
  if (albums.length === 0) {
    container.innerHTML = `<div class="empty-state"><svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="2" y="2" width="20" height="20" rx="2"/><circle cx="12" cy="12" r="5"/></svg><div class="empty-state-title">No albums found</div><div class="empty-state-text">Try a different search term. Results are sourced from ARCOD Qobuz catalog.</div></div>`;
    return;
  }

  container.innerHTML = `
    <div class="section-header" style="margin-top:var(--space-md)">
      <h2 class="section-title">Albums (${albums.length})</h2>
      <div style="font-size:var(--font-xs);color:var(--text-secondary)">Click to search & play tracks from this album</div>
    </div>
    <div class="card-grid" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:var(--space-lg)">
      ${albums.map(a => renderAlbumCard(a)).join('')}
    </div>
  `;
}

function renderAlbumCard(a) {
  return `
    <div class="card card-hover" style="padding:0;overflow:hidden;cursor:pointer" onclick="BubbleRouter.navigate('album',{name:'${escapeHtml(a._searchAlbum || a.name)}',artist:'${escapeHtml(a._searchArtist || a.artist)}',artwork:'${escapeHtml(a.artwork_url || '')}'})">
      <div style="aspect-ratio:1;background:var(--bg-elevated);overflow:hidden">
        ${a.artwork_url ? `<img src="${a.artwork_url}" alt="" style="width:100%;height:100%;object-fit:cover" loading="lazy">` : `<div class="artwork-placeholder" style="width:100%;height:100%"><svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="2" y="2" width="20" height="20" rx="2"/></svg></div>`}
      </div>
      <div style="padding:var(--space-md)">
        <div style="font-size:var(--font-sm);font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escapeHtml(a.name)}</div>
        <div style="font-size:var(--font-xs);color:var(--text-secondary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-top:2px">${escapeHtml(a.artist || 'Various Artists')}</div>
        <div style="display:flex;align-items:center;justify-content:space-between;margin-top:8px">
          <span style="font-size:10px;color:var(--text-tertiary)">${a.total_tracks ? a.total_tracks + ' tracks' : 'Qobuz FLAC'}</span>
          <span class="badge badge-accent" style="font-size:9px;padding:2px 6px">FLAC</span>
        </div>
      </div>
    </div>
  `;
}

/* ── Artist Results ───────────────────────────────────────── */
function renderArtistResults(artists, container) {
  if (artists.length === 0) {
    container.innerHTML = `<div class="empty-state"><svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="10" r="3"/><path d="M12 16c-3 0-6 2-6 4h12c0-2-3-4-6-4z"/></svg><div class="empty-state-title">No artists found</div><div class="empty-state-text">Try a different search term.</div></div>`;
    return;
  }

  container.innerHTML = `
    <div class="section-header" style="margin-top:var(--space-md)">
      <h2 class="section-title">Artists (${artists.length})</h2>
      <div style="font-size:var(--font-xs);color:var(--text-secondary)">Click to play top tracks from this artist</div>
    </div>
    <div class="card-grid" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:var(--space-lg)">
      ${artists.map(a => renderArtistCard(a)).join('')}
    </div>
  `;
}

function renderArtistCard(a) {
  return `
    <div class="card card-hover" style="padding:var(--space-lg);text-align:center;cursor:pointer" onclick="BubbleRouter.navigate('artist',{name:'${escapeHtml(a._searchName || a.name)}',artwork:'${escapeHtml(a.artwork_url || '')}'})">
      <div style="width:100px;height:100px;border-radius:50%;overflow:hidden;margin:0 auto var(--space-md);background:var(--bg-elevated)">
        ${a.artwork_url ? `<img src="${a.artwork_url}" alt="" style="width:100%;height:100%;object-fit:cover" loading="lazy">` : `<div class="artwork-placeholder" style="width:100%;height:100%"><svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="10" r="3"/><path d="M12 16c-3 0-6 2-6 4h12c0-2-3-4-6-4z"/></svg></div>`}
      </div>
      <div style="font-size:var(--font-sm);font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escapeHtml(a.name)}</div>
      <div style="font-size:var(--font-xs);color:var(--text-tertiary);margin-top:4px">${a.albums_count ? a.albums_count + ' albums' : 'Qobuz Artist'}</div>
    </div>
  `;
}

/* ── Search Event Wiring ──────────────────────────────────── */
function setupSearchEvents(currentTab) {
  const input = document.getElementById('search-input-field');
  const clearBtn = document.getElementById('search-clear-btn');
  if (!input) return;

  // Update the address bar WITHOUT a hash navigation. A real navigation makes
  // the router wipe #view-container to a spinner and rebuild the <input>,
  // which drops/reorders in-flight keystrokes — the search glitch. replaceState
  // keeps deep-linking/refresh working without touching the DOM.
  function syncUrl(q) {
    const hash = q
      ? `search?q=${encodeURIComponent(q)}&tab=${encodeURIComponent(currentTab)}`
      : 'search';
    try { history.replaceState(null, '', '#' + hash); } catch (_) { }
  }

  function clearContent() {
    window._bubbleSearchCache.query = '';
    window._bubbleSearchCache.results = {};
    const ca = document.getElementById('search-content');
    if (ca) ca.innerHTML = '';
  }

  if (clearBtn) {
    clearBtn.onclick = () => {
      input.value = '';
      clearBtn.style.display = 'none';
      clearContent();
      syncUrl('');
      input.focus();
    };
  }

  let debounceTimer;
  input.oninput = (e) => {
    const value = e.target.value;
    if (clearBtn) clearBtn.style.display = value ? 'block' : 'none';
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      const q = value.trim();
      syncUrl(q);
      // Update ONLY the results container — never re-render the whole view.
      if (q) doSearch(q, currentTab);
      else clearContent();
    }, 350);
  };

  input.focus();
  input.setSelectionRange(input.value.length, input.value.length);
}
