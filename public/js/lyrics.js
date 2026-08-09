/* ═══════════════════════════════════════════════════════════════════
   STASH DESKTOP — Synced Lyrics (LRCLIB)
   ═══════════════════════════════════════════════════════════════════ */

window.BubbleLyrics = (() => {
  let currentLyrics = null;
  let syncedLines = [];
  let fetchId = 0; // version counter — only the latest fetch wins

  async function fetchForTrack(track) {
    const myId = ++fetchId;
    currentLyrics = null;
    syncedLines = [];

    // Check cache
    const cached = await BubbleDB.getTrack(track.id);
    if (myId !== fetchId) return null; // superseded
    if (cached && cached.lyrics_synced) {
      currentLyrics = { synced: cached.lyrics_synced, plain: cached.lyrics_plain };
      syncedLines = parseLRC(cached.lyrics_synced);
      updateNPLyrics();
      return currentLyrics;
    }

    // Fetch from LRCLIB
    const result = await stash.lyrics.fetch(track.title, track.artist, track.album, track.duration);
    if (myId !== fetchId) return null; // superseded
    if (result) {
      currentLyrics = result;
      if (result.synced) syncedLines = parseLRC(result.synced);
      await stash.db.run('UPDATE tracks SET lyrics_synced = ?, lyrics_plain = ? WHERE id = ?',
        [result.synced || '', result.plain || '', track.id]);
    }
    updateNPLyrics();
    return currentLyrics;
  }

  function parseLRC(lrc) {
    if (!lrc) return [];
    return lrc.split('\n')
      .map(line => {
        const match = line.match(/\[(\d+):(\d+\.\d+)\]\s*(.*)/);
        if (!match) return null;
        return {
          time: parseInt(match[1]) * 60 + parseFloat(match[2]),
          text: match[3]
        };
      })
      .filter(Boolean)
      .sort((a, b) => a.time - b.time);
  }

  function updateNPLyrics() {
    // Target the new overlay lyrics container
    const container = document.getElementById('np-lyrics-scroll');
    if (!container) return;

    if (!currentLyrics || (!currentLyrics.synced && !currentLyrics.plain)) {
      container.innerHTML = '<div class="np-lyrics-placeholder">No lyrics available</div>';
      return;
    }

    if (syncedLines.length > 0) {
      container.innerHTML = syncedLines.map((line, i) =>
        `<div class="np-lyric-line" data-time="${line.time}" onclick="BubblePlayer.seekTo(${line.time})">${escapeHtml(line.text || '♪')}</div>`
      ).join('');
    } else if (currentLyrics.plain) {
      container.innerHTML = currentLyrics.plain.split('\n').map(line =>
        `<div class="np-lyric-line">${escapeHtml(line || '')}</div>`
      ).join('');
    }
  }

  function updateActiveLine(currentTime) {
    if (syncedLines.length === 0) return;
    const container = document.getElementById('np-lyrics-scroll') || document.getElementById('np-lyrics');
    if (!container) return;

    let activeIndex = -1;
    for (let i = syncedLines.length - 1; i >= 0; i--) {
      if (currentTime >= syncedLines[i].time) {
        activeIndex = i;
        break;
      }
    }

    const lines = container.querySelectorAll('.np-lyric-line, .lyrics-line');
    lines.forEach((el, i) => {
      el.classList.remove('active', 'past');
      if (i === activeIndex) {
        el.classList.add('active');
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      } else if (i < activeIndex) {
        el.classList.add('past');
      }
    });
  }

  function getCurrent() { return currentLyrics; }
  function getSyncedLines() { return syncedLines; }

  return { fetchForTrack, updateActiveLine, getCurrent, getSyncedLines, updateNPLyrics };
})();
