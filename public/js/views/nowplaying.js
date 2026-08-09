/* ═══════════════════════════════════════════════════════════════════
   STASH DESKTOP — Now Playing View
   Full-screen album art, live synced lyrics, quality badge, EQ
   ═══════════════════════════════════════════════════════════════════ */

window._npLiveListenerInstalled = false;

BubbleRouter.register('nowplaying', async (container) => {
  // If already rendered (same route, called again), just refresh content in-place
  if (container.querySelector('.np-page-grid')) {
    const track = BubblePlayer.getCurrentTrack();
    if (track) updateNowPlayingPageContent(track);
    return;
  }

  // Listen for track changes to keep the page live (only once)
  if (!window._npLiveListenerInstalled) {
    window._npLiveListenerInstalled = true;
    BubblePlayer.on('trackChange', ({ track, loading }) => {
      // Only update if this view is currently the active route
      if (BubbleRouter.getCurrentRoute?.() !== 'nowplaying') return;
      if (!track) return;
      updateNowPlayingPageContent(track);
    });
  }

  const track = BubblePlayer.getCurrentTrack();
  if (!track) {
    container.innerHTML = `
      <div class="empty-state">
        <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><polygon points="5 3 19 12 5 21 5 3"/></svg>
        <div class="empty-state-title">No track currently playing</div>
        <div class="empty-state-text">Pick a song from your library or search for music to start playing.</div>
        <button class="btn btn-primary" style="margin-top:16px" onclick="BubbleRouter.navigate('library')">Open Library</button>
      </div>
    `;
    return;
  }

  container.innerHTML = buildNowPlayingPageHTML(track);
  renderPageLyrics(track);
});

function buildNowPlayingPageHTML(track) {
  const isLiked = track.is_liked === 1;
  const isLocal = track.file_path || track.is_downloaded;
  const sourceName = isLocal ? 'Local Stash Library' :
    track.source === 'arcod' ? 'ARCOD (Qobuz Hi-Res)' :
      track.source === 'itunes' ? 'Apple Music / iTunes' :
        track.source === 'spotify' ? 'Spotify Match' : 'YouTube Music Stream';

  const sourceBadgeColor = isLocal ? 'badge-green' :
    track.source === 'arcod' ? 'badge-accent' :
      track.source === 'itunes' ? 'badge-red' :
        track.source === 'spotify' ? 'badge-green' : 'badge-red';

  const qualityBadge = track.quality || (isLocal ? 'Lossless FLAC (Local)' : 'Direct Lossless Audio');

  return `
    <div class="np-page-grid" style="display:grid;grid-template-columns:1fr 1.2fr;gap:var(--space-3xl);max-width:1100px;margin:0 auto;align-items:center;min-height:70vh">
      <!-- Left Column: Artwork & Info -->
      <div style="display:flex;flex-direction:column;align-items:center;text-align:center">
        <div id="np-page-artwork" class="np-artwork" style="width:340px;height:340px;margin-bottom:var(--space-xl)">
          ${track.artwork_url ? `<img src="${track.artwork_url}" alt="" style="width:100%;height:100%;object-fit:cover">` : `<div class="artwork-placeholder"><svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg></div>`}
        </div>

        <div style="width:100%;max-width:340px">
          <div id="np-page-title" style="font-size:var(--font-xl);font-weight:700;margin-bottom:4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">
            ${escapeHtml(track.title)}
          </div>
          <div id="np-page-artist" style="font-size:var(--font-base);color:var(--text-secondary);margin-bottom:6px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">
            ${escapeHtml(track.artist)}
          </div>
          <div id="np-page-album" style="font-size:var(--font-xs);color:var(--text-tertiary);margin-bottom:12px">${track.album ? escapeHtml(track.album) : ''}</div>

          <div id="np-page-badges" style="display:flex;align-items:center;justify-content:center;gap:8px;margin-top:8px;flex-wrap:wrap">
            <span class="badge ${sourceBadgeColor}" style="padding:4px 10px;font-size:11px;display:flex;align-items:center;gap:6px;cursor:pointer" title="Click to toggle Lossless / YouTube source" onclick="BubbleApp.toggleLosslessSource()">
              <span class="source-dot ${isLocal ? 'local' : (track.source || 'youtube')}"></span>
              ${sourceName}
            </span>
            <span class="badge badge-accent" style="padding:4px 10px;font-size:11px;cursor:pointer" title="Click to toggle Lossless / YouTube source" onclick="BubbleApp.toggleLosslessSource()">${qualityBadge}</span>
          </div>

          <div id="np-page-actions" style="display:flex;justify-content:center;gap:16px;margin-top:var(--space-xl)">
            <button class="btn btn-secondary btn-sm" onclick="BubbleApp.toggleLike('${track.id}')">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="${isLiked ? 'var(--accent)' : 'none'}" stroke="currentColor" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
              ${isLiked ? 'Liked' : 'Like'}
            </button>
            ${!track.is_downloaded ? `
              <button class="btn btn-primary btn-sm" onclick="BubbleApp.downloadTrack('${track.id}')">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                Download FLAC
              </button>
            ` : `
              <span class="badge badge-green" style="padding:6px 16px;font-size:12px">✓ Saved Offline</span>
            `}
          </div>
        </div>
      </div>

      <!-- Right Column: Synced Scrolling Lyrics -->
      <div class="card" style="height:480px;display:flex;flex-direction:column;padding:var(--space-xl);background:var(--surface-glass);border:1px solid var(--surface-glass-border)">
        <div style="font-size:var(--font-xs);font-weight:700;letter-spacing:1px;text-transform:uppercase;color:var(--text-tertiary);margin-bottom:var(--space-md);display:flex;align-items:center;justify-content:space-between">
          <span>Synced Lyrics (LRCLIB)</span>
          <span style="font-size:10px;color:var(--text-tertiary)">Click any line to seek</span>
        </div>
        <div id="nowplaying-page-lyrics" style="flex:1;overflow-y:auto;text-align:center;padding:var(--space-lg) 0">
          <div class="spinner" style="margin:40px auto"></div>
        </div>
      </div>
    </div>
  `;
}

/** Update the now-playing page content in-place when track changes */
function updateNowPlayingPageContent(track) {
  if (!track) return;

  // Artwork
  const artworkEl = document.getElementById('np-page-artwork');
  if (artworkEl) {
    artworkEl.innerHTML = track.artwork_url
      ? `<img src="${track.artwork_url}" alt="" style="width:100%;height:100%;object-fit:cover">`
      : `<div class="artwork-placeholder"><svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg></div>`;
  }

  // Title, artist, album
  const titleEl = document.getElementById('np-page-title');
  const artistEl = document.getElementById('np-page-artist');
  const albumEl = document.getElementById('np-page-album');
  if (titleEl) titleEl.textContent = track.title || '—';
  if (artistEl) artistEl.textContent = track.artist || '—';
  if (albumEl) albumEl.textContent = track.album || '';

  // Source badges
  const badgesEl = document.getElementById('np-page-badges');
  if (badgesEl) {
    const isLocal = track.file_path || track.is_downloaded;
    const src = isLocal ? 'local' : (track.source || 'youtube');
    const srcLabel = isLocal ? 'Local Stash Library' :
      track.source === 'arcod' ? 'ARCOD (Qobuz Hi-Res)' :
        track.source === 'itunes' ? 'Apple Music / iTunes' :
          track.source === 'spotify' ? 'Spotify Match' : 'YouTube Music Stream';
    const badgeCls = isLocal ? 'badge-green' :
      track.source === 'arcod' ? 'badge-accent' :
        track.source === 'itunes' ? 'badge-red' :
          track.source === 'spotify' ? 'badge-green' : 'badge-red';
    const quality = track.quality || (isLocal ? 'Lossless FLAC (Local)' : 'Direct Lossless Audio');
    badgesEl.innerHTML = `
      <span class="badge ${badgeCls}" style="padding:4px 10px;font-size:11px;display:flex;align-items:center;gap:6px;cursor:pointer" title="Click to toggle Lossless / YouTube source" onclick="BubbleApp.toggleLosslessSource()">
        <span class="source-dot ${src}"></span>${srcLabel}
      </span>
      <span class="badge badge-accent" style="padding:4px 10px;font-size:11px;cursor:pointer" title="Click to toggle Lossless / YouTube source" onclick="BubbleApp.toggleLosslessSource()">${quality}</span>
    `;
  }

  // Like button
  const actionsEl = document.getElementById('np-page-actions');
  if (actionsEl) {
    const isLiked = track.is_liked === 1;
    const downloaded = track.file_path || track.is_downloaded;
    actionsEl.innerHTML = `
      <button class="btn btn-secondary btn-sm" onclick="BubbleApp.toggleLike('${track.id}')">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="${isLiked ? 'var(--accent)' : 'none'}" stroke="currentColor" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
        ${isLiked ? 'Liked' : 'Like'}
      </button>
      ${!downloaded ? `
        <button class="btn btn-primary btn-sm" onclick="BubbleApp.downloadTrack('${track.id}')">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
          Download FLAC
        </button>
      ` : `<span class="badge badge-green" style="padding:6px 16px;font-size:12px">✓ Saved Offline</span>`}
    `;
  }

  // Refresh lyrics
  renderPageLyrics(track);
}

async function renderPageLyrics(track) {
  const container = document.getElementById('nowplaying-page-lyrics');
  if (!container) return;
  const lyrics = await BubbleLyrics.fetchForTrack(track);
  const synced = BubbleLyrics.getSyncedLines();

  if (synced && synced.length > 0) {
    container.innerHTML = synced.map((line, i) => `
      <div class="lyrics-line" data-index="${i}" data-time="${line.time}" onclick="BubblePlayer.seekTo(${line.time})">
        ${escapeHtml(line.text || '♪')}
      </div>
    `).join('');
  } else if (lyrics && lyrics.plain) {
    container.innerHTML = lyrics.plain.split('\n').map(l => `
      <div class="lyrics-line">${escapeHtml(l || '')}</div>
    `).join('');
  } else {
    container.innerHTML = `<div class="np-lyrics-placeholder" style="color:var(--text-tertiary);font-size:var(--font-sm);margin-top:60px">No lyrics found for this track.</div>`;
  }
}
