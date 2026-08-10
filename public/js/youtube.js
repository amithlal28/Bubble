/* ═══════════════════════════════════════════════════════════════════
   STASH DESKTOP — YouTube Music Integration
   Cookie-based auth, library fetch
   ═══════════════════════════════════════════════════════════════════ */

window.BubbleYouTube = (() => {
  let connected = false;

  async function checkConnection() {
    const creds = await stash.credentials.load();
    connected = !!creds.youtube_cookie;
    return connected;
  }

  async function loginInApp() {
    const result = await stash.youtube.login();
    if (result.success) {
      connected = true;
      BubbleApp.toast('YouTube Music connected!', 'success');
    }
    return result;
  }

  async function loginWithCookie(cookie) {
    if (!cookie || !cookie.trim()) { BubbleApp.toast('Please enter a valid cookie', 'error'); return false; }
    await stash.credentials.save({ youtube_cookie: cookie.trim() });
    if (stash.integrations) stash.integrations.sync();
    connected = true;
    BubbleApp.toast('YouTube Music connected!', 'success');
    return true;
  }

  async function disconnect() {
    await stash.credentials.remove('youtube_cookie');
    if (stash.integrations) stash.integrations.disconnect('youtube');
    connected = false;
    BubbleApp.toast('YouTube Music disconnected', 'info');
  }

  async function getLikedMusic() {
    try {
      const data = await stash.youtube.request('browse', {
        browseId: 'FEmusic_liked_videos'
      });
      return parseYTMusicItems(data);
    } catch { return []; }
  }

  async function getPlaylists() {
    try {
      const data = await stash.youtube.request('browse', {
        browseId: 'FEmusic_liked_playlists'
      });
      return parseYTPlaylists(data);
    } catch { return []; }
  }

  async function getPlaylistTracks(playlistId) {
    try {
      const data = await stash.youtube.request('browse', {
        browseId: playlistId
      });
      return parseYTMusicItems(data);
    } catch { return []; }
  }

  function parseYTMusicItems(data) {
    const tracks = [];
    try {
      const contents = findNestedContent(data);
      if (!contents) return tracks;

      for (const item of contents) {
        const renderer = item.musicResponsiveListItemRenderer || item.musicTwoRowItemRenderer;
        if (!renderer) continue;

        const title = extractText(renderer.flexColumns?.[0] || renderer.title);
        const artist = extractText(renderer.flexColumns?.[1] || renderer.subtitle);
        const videoId = renderer.playlistItemData?.videoId ||
                       renderer.overlay?.musicItemThumbnailOverlayRenderer?.content?.musicPlayButtonRenderer?.playNavigationEndpoint?.watchEndpoint?.videoId ||
                       renderer.navigationEndpoint?.watchEndpoint?.videoId;

        if (!title || !videoId) continue;

        const thumbnail = renderer.thumbnail?.musicThumbnailRenderer?.thumbnail?.thumbnails?.pop()?.url || '';

        const durationText = extractText(renderer.fixedColumns?.[0]) || '';
        const duration = parseDuration(durationText);

        tracks.push({
          id: `yt_${videoId}`,
          title: title,
          artist: artist || 'Unknown',
          album: '',
          duration: duration,
          artwork_url: thumbnail,
          source: 'youtube',
          source_id: videoId,
          youtube_id: videoId
        });
      }
    } catch (e) {
      console.error('YTMusic parse error:', e);
    }
    return tracks;
  }

  function parseYTPlaylists(data) {
    const playlists = [];
    try {
      const contents = findNestedContent(data);
      if (!contents) return playlists;

      for (const item of contents) {
        const renderer = item.musicTwoRowItemRenderer;
        if (!renderer) continue;

        const title = extractText(renderer.title);
        const playlistId = renderer.navigationEndpoint?.browseEndpoint?.browseId;
        const thumbnail = renderer.thumbnailRenderer?.musicThumbnailRenderer?.thumbnail?.thumbnails?.pop()?.url || '';
        const subtitle = extractText(renderer.subtitle);

        if (!title || !playlistId) continue;

        playlists.push({
          id: `yt_${playlistId}`,
          name: title,
          description: subtitle || '',
          artwork_url: thumbnail,
          source: 'youtube',
          source_id: playlistId,
          track_count: 0
        });
      }
    } catch (e) {
      console.error('YTMusic playlist parse error:', e);
    }
    return playlists;
  }

  function findNestedContent(obj) {
    if (!obj || typeof obj !== 'object') return null;
    if (Array.isArray(obj.contents)) return obj.contents;
    if (Array.isArray(obj.items)) return obj.items;

    for (const key of Object.keys(obj)) {
      const result = findNestedContent(obj[key]);
      if (result) return result;
    }
    return null;
  }

  function extractText(obj) {
    if (!obj) return '';
    if (typeof obj === 'string') return obj;
    if (obj.runs) return obj.runs.map(r => r.text).join('');
    if (obj.musicResponsiveListItemFlexColumnRenderer)
      return extractText(obj.musicResponsiveListItemFlexColumnRenderer.text);
    if (obj.simpleText) return obj.simpleText;
    return '';
  }

  function parseDuration(text) {
    if (!text) return 0;
    const parts = text.split(':').map(Number);
    if (parts.length === 2) return parts[0] * 60 + parts[1];
    if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
    return 0;
  }

  function isConnected() { return connected; }

  return {
    checkConnection, loginInApp, loginWithCookie, disconnect,
    getLikedMusic, getPlaylists, getPlaylistTracks, isConnected
  };
})();
