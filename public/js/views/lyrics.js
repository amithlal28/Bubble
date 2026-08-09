/* ═══════════════════════════════════════════════════════════════════
   BUBBLE — Dedicated Full-Screen Lyrics View
   Live synchronized LRCLIB lyrics, click-to-seek, artwork backdrop
   ═══════════════════════════════════════════════════════════════════ */

window._lyricsLiveListenerInstalled = false;

BubbleRouter.register('lyrics', async (container) => {
  renderLyricsView(container);

  if (!window._lyricsLiveListenerInstalled) {
    window._lyricsLiveListenerInstalled = true;
    BubblePlayer.on('trackChange', ({ track, loading }) => {
      if (BubbleRouter.getCurrentRoute?.() === 'lyrics') {
        const cont = document.getElementById('view-container');
        if (cont) renderLyricsView(cont);
      }
    });

    BubblePlayer.on('progress', ({ current }) => {
      if (BubbleRouter.getCurrentRoute?.() === 'lyrics') {
        updateLyricsProgress(current);
      }
    });
  }
});

async function renderLyricsView(container) {
  const track = BubblePlayer.getCurrentTrack();

  if (!track) {
    container.innerHTML = `
      <div class="empty-state" style="padding:var(--space-3xl) 0">
        <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="opacity:0.4"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>
        <div class="empty-state-title" style="margin-top:16px">No track currently playing</div>
        <div class="empty-state-text" style="max-width:360px;margin:8px auto">Start playback from your library, playlists, or search to see live lyrics.</div>
        <button class="btn btn-primary" style="margin-top:16px" onclick="BubbleRouter.navigate('library')">Open Library</button>
      </div>
    `;
    return;
  }

  const isLiked = track.is_liked === 1;
  const isLocal = track.file_path || track.is_downloaded;
  const srcName = isLocal ? 'Local FLAC' : (track.source === 'arcod' ? 'ARCOD (Qobuz Hi-Res)' : track.source === 'itunes' ? 'Apple Music' : track.source === 'spotify' ? 'Spotify' : 'Lossless Audio');

  container.innerHTML = `
    <div class="lyrics-view-container" style="max-width:960px;margin:0 auto;display:flex;flex-direction:column;height:calc(100vh - 170px)">
      <!-- Header bar -->
      <div style="display:flex;align-items:center;justify-content:space-between;padding-bottom:var(--space-md);border-bottom:1px solid var(--surface-glass-border);margin-bottom:var(--space-lg);flex-wrap:wrap;gap:12px">
        <div style="display:flex;align-items:center;gap:14px">
          <div style="width:48px;height:48px;border-radius:var(--radius-md);overflow:hidden;background:var(--bg-elevated);flex-shrink:0;box-shadow:0 4px 14px rgba(0,0,0,0.3)">
            ${track.artwork_url ? `<img src="${track.artwork_url}" alt="" style="width:100%;height:100%;object-fit:cover">` : `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg></div>`}
          </div>
          <div>
            <div style="font-size:var(--font-base);font-weight:700;color:var(--text-primary);line-height:1.3">${escapeHtml(track.title || 'Untitled')}</div>
            <div style="font-size:var(--font-xs);color:var(--text-secondary)">${escapeHtml(track.artist || 'Unknown')} • ${escapeHtml(srcName)}</div>
          </div>
        </div>
        <div style="display:flex;align-items:center;gap:10px">
          <button class="btn btn-secondary btn-sm" onclick="BubbleRouter.navigate('queue')" title="View Play Queue">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right:6px"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>
            Queue
          </button>
          <button class="btn btn-secondary btn-sm" onclick="BubbleRouter.navigate('nowplaying')" title="Full Now Playing Page">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right:6px"><polygon points="5 3 19 12 5 21 5 3"/></svg>
            Now Playing
          </button>
        </div>
      </div>

      <!-- Lyrics Scrolling Container -->
      <div id="lyrics-fullscreen-scroll" style="flex:1;overflow-y:auto;text-align:center;padding:var(--space-2xl) var(--space-md);scroll-behavior:smooth">
        <div class="spinner" style="margin:60px auto"></div>
      </div>
    </div>
  `;

  loadLyricsContent(track);
}

async function loadLyricsContent(track) {
  const container = document.getElementById('lyrics-fullscreen-scroll');
  if (!container) return;

  const lyrics = await BubbleLyrics.fetchForTrack(track);
  const synced = BubbleLyrics.getSyncedLines();

  if (synced && synced.length > 0) {
    container.innerHTML = synced.map((line, i) => `
      <div class="dedicated-lyric-line" data-time="${line.time}" data-idx="${i}" onclick="BubblePlayer.seekTo(${line.time})" style="padding:12px 16px;font-size:22px;font-weight:600;color:var(--text-tertiary);cursor:pointer;border-radius:8px;transition:all 0.25s ease;max-width:700px;margin:4px auto;line-height:1.4">
        ${escapeHtml(line.text || '♪')}
      </div>
    `).join('');
    updateLyricsProgress(BubblePlayer.getPosition ? BubblePlayer.getPosition() : 0);
  } else if (lyrics && lyrics.plain) {
    container.innerHTML = lyrics.plain.split('\n').map(l => `
      <div class="dedicated-lyric-line" style="padding:8px 16px;font-size:18px;color:var(--text-secondary);max-width:700px;margin:2px auto;line-height:1.6">
        ${escapeHtml(l || '')}
      </div>
    `).join('');
  } else {
    container.innerHTML = `
      <div style="color:var(--text-tertiary);font-size:var(--font-base);margin-top:80px">
        No lyrics found for "${escapeHtml(track.title)}" on LRCLIB.
      </div>
    `;
  }
}

function updateLyricsProgress(currentTime) {
  const container = document.getElementById('lyrics-fullscreen-scroll');
  if (!container) return;

  const synced = BubbleLyrics.getSyncedLines();
  if (!synced || synced.length === 0) return;

  let activeIdx = -1;
  for (let i = synced.length - 1; i >= 0; i--) {
    if (currentTime >= synced[i].time) {
      activeIdx = i;
      break;
    }
  }

  const lines = container.querySelectorAll('.dedicated-lyric-line');
  lines.forEach((el, i) => {
    if (i === activeIdx) {
      el.style.color = 'var(--text-primary)';
      el.style.fontSize = '26px';
      el.style.fontWeight = '800';
      el.style.textShadow = '0 0 20px rgba(255,255,255,0.4)';
      el.style.transform = 'scale(1.04)';
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } else if (i < activeIdx) {
      el.style.color = 'rgba(255,255,255,0.35)';
      el.style.fontSize = '20px';
      el.style.fontWeight = '500';
      el.style.textShadow = 'none';
      el.style.transform = 'none';
    } else {
      el.style.color = 'rgba(255,255,255,0.2)';
      el.style.fontSize = '20px';
      el.style.fontWeight = '500';
      el.style.textShadow = 'none';
      el.style.transform = 'none';
    }
  });
}
