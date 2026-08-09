/* ═══════════════════════════════════════════════════════════════════
   STASH DESKTOP — Download Manager
   ARCOD primary → yt-dlp fallback
   ═══════════════════════════════════════════════════════════════════ */

window.BubbleDownloader = (() => {
  const activeDownloads = new Map();

  function init() {
    stash.download.onProgress((data) => {
      activeDownloads.set(data.trackId, data);
      // Refresh downloads view if active
      if (BubbleRouter.getCurrentRoute() === 'downloads') {
        const el = document.getElementById(`dl-progress-${data.trackId}`);
        if (el) {
          el.style.width = `${data.progress}%`;
          el.className = `download-progress-fill ${data.status === 'completed' ? 'completed' : data.status === 'failed' ? 'failed' : ''}`;
        }
        const statusEl = document.getElementById(`dl-status-${data.trackId}`);
        if (statusEl) {
          statusEl.textContent = data.status === 'downloading' ? `${Math.round(data.progress)}%` :
            data.status === 'completed' ? '✓ Done' : data.status === 'failed' ? '✗ Failed' : data.status;
        }
        const sourceEl = document.getElementById(`dl-source-${data.trackId}`);
        if (sourceEl && data.source) {
          sourceEl.textContent = data.source === 'arcod' ? 'ARCOD' : 'via YT';
          sourceEl.className = `badge ${data.source === 'arcod' ? 'badge-accent' : 'badge-yellow'}`;
        }
      }
    });
  }

  async function downloadTrack(track) {
    // Create download record
    await BubbleDB.createDownload(track.id);
    BubbleApp.toast(`Downloading: ${track.title}`, 'info');
    // Send to main process (ARCOD first, then yt-dlp fallback)
    const result = await stash.download.track({
      id: track.id,
      title: track.title,
      artist: track.artist,
      album: track.album || '',
      duration: track.duration || 0
    });

    if (result.success) {
      const sourceLabel = result.source === 'arcod' ? 'ARCOD (Qobuz lossless)' : 'YouTube (FLAC)';
      BubbleApp.toast(`Downloaded: ${track.title} — ${sourceLabel}`, 'success');
    } else {
      BubbleApp.toast(`Download failed: ${track.title}`, 'error');
    }
    return result;
  }

  async function downloadMultiple(tracks) {
    const concurrency = parseInt(await BubbleDB.getSetting('concurrent_downloads') || '2');
    const chunks = [];
    for (let i = 0; i < tracks.length; i += concurrency) {
      chunks.push(tracks.slice(i, i + concurrency));
    }
    for (const chunk of chunks) {
      await Promise.allSettled(chunk.map(t => downloadTrack(t)));
    }
  }

  function getActiveDownloads() { return activeDownloads; }

  return { init, downloadTrack, downloadMultiple, getActiveDownloads };
})();
