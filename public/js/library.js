/* ═══════════════════════════════════════════════════════════════════
   STASH DESKTOP — Unified Library Manager
   ═══════════════════════════════════════════════════════════════════ */

window.BubbleLibrary = (() => {
  let draggedPlaylistId = null;
  
  async function syncFromServices() {
    let total = 0;
    // Spotify
    if (BubbleSpotify.isConnected()) {
      try {
        BubbleApp.toast('Syncing Spotify library...', 'info');
        let likedOffset = 0;
        const likedLimit = 50;
        while (true) {
          const liked = await BubbleSpotify.getLikedSongs(likedLimit, likedOffset);
          if (!liked || liked.length === 0) break;
          for (const t of liked) { t.is_liked = 1; await BubbleDB.upsertTrack(t); total++; }
          if (liked.length < likedLimit) break;
          likedOffset += likedLimit;
        }
        const playlists = await BubbleSpotify.getPlaylists();
        for (const p of playlists) {
          const savedPlaylist = await BubbleDB.upsertPlaylist(p);
          const playlistId = savedPlaylist?.id || p.id;
          const tracks = await BubbleSpotify.getPlaylistTracks(p.source_id);
          for (let i = 0; i < tracks.length; i++) {
            await BubbleDB.upsertTrack(tracks[i]);
            await BubbleDB.addTrackToPlaylist(playlistId, tracks[i].id, i);
            total++;
          }
        }
      } catch (e) { console.error('Spotify sync error:', e); }
    }
    // YouTube
    if (BubbleYouTube.isConnected()) {
      try {
        BubbleApp.toast('Syncing YouTube Music library...', 'info');
        const liked = await BubbleYouTube.getLikedMusic();
        for (const t of liked) { t.is_liked = 1; await BubbleDB.upsertTrack(t); total++; }
        const playlists = await BubbleYouTube.getPlaylists();
        for (const p of playlists) {
          const savedPlaylist = await BubbleDB.upsertPlaylist(p);
          const playlistId = savedPlaylist?.id || p.id;
          const tracks = await BubbleYouTube.getPlaylistTracks(p.source_id);
          for (let i = 0; i < tracks.length; i++) {
            await BubbleDB.upsertTrack(tracks[i]);
            await BubbleDB.addTrackToPlaylist(playlistId, tracks[i].id, i);
            total++;
          }
        }
      } catch (e) { console.error('YouTube sync error:', e); }
    }
    if (total > 0) BubbleApp.toast(`Synced ${total} tracks`, 'success');
    return total;
  }

  async function search(query) {
    return BubbleDB.getAllTracks({ search: query });
  }

  async function updateSidebarPlaylists() {
    const playlists = await BubbleDB.getAllPlaylists();
    const container = document.getElementById('playlist-list');
    if (!container) return;

    // Update liked songs count
    try {
      let likedCount = 0;
      if (BubbleAPI.isElectron) {
        const likedRow = await stash.db.get('SELECT COUNT(*) as c FROM tracks WHERE is_liked = 1');
        likedCount = likedRow?.c || 0;
      } else {
        likedCount = await BubbleAPI.liked.getCount();
      }
      const likedEl = document.getElementById('liked-count');
      if (likedEl) likedEl.textContent = likedCount > 0 ? likedCount : '';
    } catch (e) { /* ignore */ }

    // Load hidden playlist IDs and order from settings
    let hiddenIds = [];
    let order = [];
    try {
      const rawHidden = await BubbleDB.getSetting('hidden_playlists');
      hiddenIds = rawHidden ? JSON.parse(rawHidden) : [];
      const rawOrder = await BubbleDB.getSetting('playlist_order');
      order = rawOrder ? JSON.parse(rawOrder) : [];
    } catch (e) { }

    // Sort playlists based on custom order
    playlists.sort((a, b) => {
      let idxA = order.indexOf(a.id);
      let idxB = order.indexOf(b.id);
      if (idxA === -1) idxA = 999999;
      if (idxB === -1) idxB = 999999;
      return idxA - idxB;
    });

    const visible = playlists.filter(p => !hiddenIds.includes(p.id));
    const hidden = playlists.filter(p => hiddenIds.includes(p.id));

    const renderItem = (p) => `
      <div class="playlist-item" data-id="${p.id}" draggable="true" ondragstart="BubbleLibrary.onDragStart(event)" ondragover="BubbleLibrary.onDragOver(event)" ondragleave="BubbleLibrary.onDragLeave(event)" ondrop="BubbleLibrary.onDrop(event)" onclick="BubbleRouter.navigate('playlist', {id:'${p.id}'})">
        <div class="playlist-icon">
          ${p.artwork_url ? `<img src="${p.artwork_url}" alt="">` :
        `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>`}
        </div>
        <span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHtml(p.name)}</span>
        <button class="playlist-hide-btn" title="Hide playlist" onclick="event.stopPropagation();BubbleLibrary.toggleHidePlaylist('${p.id}')" style="opacity:0;font-size:12px;color:var(--text-tertiary);padding:2px 4px;border-radius:4px;transition:opacity 0.15s">✕</button>
        <button class="playlist-del-btn" title="Delete playlist" onclick="event.stopPropagation();BubbleLibrary.deletePlaylist('${p.id}')">🗑</button>
      </div>
    `;

    container.innerHTML = `
      ${visible.map(renderItem).join('')}
      ${hidden.length > 0 ? `
        <div class="sidebar-section-title" style="margin-top:var(--space-md);cursor:pointer;display:flex;align-items:center;gap:4px" onclick="BubbleLibrary.toggleHiddenSection()">
          <svg id="hidden-chevron" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="transition:transform 0.2s"><polyline points="9 18 15 12 9 6"/></svg>
          Hidden (${hidden.length})
        </div>
        <div id="hidden-playlists" style="display:none">
          ${hidden.map(renderItem).join('')}
        </div>
      ` : ''}
      ${visible.length === 0 && hidden.length === 0 ? '<div style="font-size:var(--font-xs);color:var(--text-tertiary);padding:var(--space-sm) var(--space-md)">No playlists yet</div>' : ''}
    `;
  }

  async function toggleHidePlaylist(playlistId) {
    let hiddenIds = [];
    try {
      const raw = await BubbleDB.getSetting('hidden_playlists');
      hiddenIds = raw ? JSON.parse(raw) : [];
    } catch (e) { hiddenIds = []; }

    const idx = hiddenIds.indexOf(playlistId);
    if (idx >= 0) {
      hiddenIds.splice(idx, 1);
      BubbleApp.toast('Playlist unhidden', 'info');
    } else {
      hiddenIds.push(playlistId);
      BubbleApp.toast('Playlist hidden', 'info');
    }
    await BubbleDB.setSetting('hidden_playlists', JSON.stringify(hiddenIds));
    await updateSidebarPlaylists();
  }

  async function deletePlaylist(playlistId) {
    let pl = null;
    try { pl = await BubbleDB.getPlaylist(playlistId); } catch (e) { /* ignore */ }
    const isSynced = pl && (pl.source === 'spotify' || pl.source === 'youtube') && String(pl.source_id || '').trim() !== '';
    const msg = isSynced
      ? "Hide this playlist from Bubble? It stays in your streaming account and won't be re-imported on future syncs."
      : 'Delete this playlist? This cannot be undone.';
    if (!confirm(msg)) return;
    try {
      await BubbleDB.deletePlaylist(playlistId);
      // Also drop it from the soft-collapse "hidden" list if present.
      let hiddenIds = [];
      try {
        const raw = await BubbleDB.getSetting('hidden_playlists');
        hiddenIds = raw ? JSON.parse(raw) : [];
      } catch (e) { hiddenIds = []; }
      const idx = hiddenIds.indexOf(playlistId);
      if (idx >= 0) { hiddenIds.splice(idx, 1); await BubbleDB.setSetting('hidden_playlists', JSON.stringify(hiddenIds)); }

      // If the deleted playlist is currently open, leave its page.
      const onDeleted = BubbleRouter.getCurrentRoute() === 'playlist' &&
        BubbleRouter.getCurrentParams && BubbleRouter.getCurrentParams().id === playlistId;
      if (onDeleted) {
        BubbleRouter.navigate('library', { force: true });
        await updateSidebarPlaylists();
      } else if (BubbleApp.refreshData) {
        await BubbleApp.refreshData({ sidebar: true, route: true });
      } else {
        await updateSidebarPlaylists();
      }
      BubbleApp.toast(isSynced ? 'Playlist hidden' : 'Playlist deleted', 'info');
    } catch (e) {
      BubbleApp.toast('Failed to delete: ' + e.message, 'error');
    }
  }

  function toggleHiddenSection() {
    const el = document.getElementById('hidden-playlists');
    const chevron = document.getElementById('hidden-chevron');
    if (!el) return;
    const visible = el.style.display !== 'none';
    el.style.display = visible ? 'none' : 'block';
    if (chevron) chevron.style.transform = visible ? 'rotate(0deg)' : 'rotate(90deg)';
  }

  function togglePlaylistsSection() {
    const el = document.getElementById('playlist-list');
    const chevron = document.getElementById('pl-chevron');
    if (!el) return;
    const visible = el.style.display !== 'none';
    el.style.display = visible ? 'none' : 'block';
    if (chevron) chevron.style.transform = visible ? 'rotate(0deg)' : 'rotate(90deg)';
  }

  async function createLocalPlaylist() {
    const name = prompt('Enter playlist name:');
    if (!name || !name.trim()) return;

    try {
      const playlist = await BubbleAPI.playlists.create(name.trim());
      await updateSidebarPlaylists();
      BubbleApp.toast(`Playlist "${playlist.name}" created!`, 'success');
      // Navigate to the new playlist
      if (playlist.id) {
        BubbleRouter.navigate('playlist', { id: playlist.id });
      }
    } catch (e) {
      BubbleApp.toast('Failed to create playlist: ' + e.message, 'error');
    }
  }

  function onDragStart(e) {
    draggedPlaylistId = e.currentTarget.dataset.id;
    e.dataTransfer.effectAllowed = 'move';
    e.currentTarget.classList.add('dragging');
  }

  function onDragOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    const item = e.currentTarget;
    if (item.dataset.id !== draggedPlaylistId) {
      const rect = item.getBoundingClientRect();
      const mid = rect.top + rect.height / 2;
      item.classList.remove('drag-over-top', 'drag-over-bottom');
      if (e.clientY < mid) {
        item.classList.add('drag-over-top');
      } else {
        item.classList.add('drag-over-bottom');
      }
    }
  }

  function onDragLeave(e) {
    e.currentTarget.classList.remove('drag-over-top', 'drag-over-bottom');
  }

  async function onDrop(e) {
    e.preventDefault();
    const item = e.currentTarget;
    const isTop = item.classList.contains('drag-over-top');
    const targetId = item.dataset.id;
    
    // Clean up dragging styles
    document.querySelectorAll('.playlist-item').forEach(el => el.classList.remove('dragging', 'drag-over-top', 'drag-over-bottom'));
    
    if (!draggedPlaylistId || draggedPlaylistId === targetId) return;

    const playlists = await BubbleDB.getAllPlaylists();
    let order = [];
    try {
      const rawOrder = await BubbleDB.getSetting('playlist_order');
      if (rawOrder) order = JSON.parse(rawOrder);
    } catch(e) {}
    
    // Ensure all current playlists exist in the order array
    const allIds = playlists.map(p => p.id);
    let currentOrder = order.filter(id => allIds.includes(id));
    for (let id of allIds) {
      if (!currentOrder.includes(id)) currentOrder.push(id);
    }

    const fromIdx = currentOrder.indexOf(draggedPlaylistId);
    let toIdx = currentOrder.indexOf(targetId);
    
    if (fromIdx > -1 && toIdx > -1) {
      if (!isTop) toIdx++; // Insert after if dropped on bottom half
      if (fromIdx < toIdx) toIdx--; // Adjust if moving down the list
      
      currentOrder.splice(fromIdx, 1);
      currentOrder.splice(toIdx, 0, draggedPlaylistId);
      await BubbleDB.setSetting('playlist_order', JSON.stringify(currentOrder));
      await updateSidebarPlaylists();
    }
    draggedPlaylistId = null;
  }

  return { syncFromServices, search, updateSidebarPlaylists, toggleHidePlaylist, toggleHiddenSection, deletePlaylist, togglePlaylistsSection, createLocalPlaylist, onDragStart, onDragOver, onDragLeave, onDrop };
})();

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// Encode a track for embedding inside a single-quoted inline onclick attribute.
// encodeURIComponent does NOT escape the apostrophe, so titles like
// "Don't Start Now" would otherwise break the JS string and kill the handler.
function encTrack(t) {
  return encodeURIComponent(JSON.stringify(t)).replace(/'/g, '%27');
}
