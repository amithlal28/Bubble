/* ═══════════════════════════════════════════════════════════════════
   STASH DESKTOP — Spotify Integration
   Cookie-based auth, library fetch
   ═══════════════════════════════════════════════════════════════════ */

window.BubbleSpotify = (() => {
  let connected = false;

  async function checkConnection() {
    const creds = await stash.credentials.load();
    connected = !!(creds.spotify_cookie || creds.spotify_token);
    return connected;
  }

  async function loginInApp() {
    const result = await stash.spotify.login();
    if (result && result.success) {
      connected = true;
      BubbleApp.toast('Spotify connected!', 'success');
    }
    return result;
  }

  async function loginWithCookie(cookie) {
    if (!cookie || !cookie.trim()) { BubbleApp.toast('Please enter a valid cookie', 'error'); return false; }
    await stash.credentials.save({ spotify_cookie: cookie.trim() });
    try {
      const profile = await stash.spotify.getProfile();
      if (profile && profile.id) {
        connected = true;
        // Only push once the cookie is validated — an invalid one is removed below.
        if (stash.integrations) stash.integrations.sync();
        BubbleApp.toast('Spotify connected!', 'success');
        return true;
      }
      throw new Error('Invalid cookie');
    } catch (e) {
      await stash.credentials.remove('spotify_cookie');
      connected = false;
      BubbleApp.toast('Invalid cookie. Please try again.', 'error');
      return false;
    }
  }

  async function disconnect() {
    await stash.credentials.remove('spotify_cookie');
    await stash.credentials.remove('spotify_token');
    await stash.credentials.remove('spotify_refresh_token');
    await stash.credentials.remove('spotify_token_expiry');
    if (stash.spotify && stash.spotify.disconnect) {
      await stash.spotify.disconnect();
    }
    connected = false;
    BubbleApp.toast('Spotify disconnected', 'info');
  }

  async function getProfile() {
    try {
      return await stash.spotify.getProfile();
    } catch { return null; }
  }

  async function getLikedSongs(limit = 50, offset = 0) {
    try {
      const tracks = await stash.spotify.getLikedSongs(limit, offset);
      return Array.isArray(tracks) ? tracks : [];
    } catch { return []; }
  }

  async function getPlaylists(limit = 50, offset = 0) {
    try {
      const playlists = await stash.spotify.getPlaylists(limit, offset);
      if (!Array.isArray(playlists)) return [];
      return playlists.map(p => ({
        id: p.id || `sp_${p.source_id}`,
        name: p.name,
        description: p.description || '',
        artwork_url: p.artwork_url || '',
        source: 'spotify',
        source_id: p.source_id || String(p.id || '').replace('sp_', ''),
        track_count: p.track_count || 0
      }));
    } catch { return []; }
  }

  async function getPlaylistTracks(playlistId, limit = 100) {
    try {
      const tracks = await stash.spotify.getPlaylistTracks(playlistId);
      return Array.isArray(tracks) ? tracks : [];
    } catch { return []; }
  }

  /** Fetches the user's Spotify mixes (Daily Mixes, Discover Weekly, etc.). */
  async function getMixes() {
    try {
      const mixes = await stash.spotify.getMixes();
      if (!Array.isArray(mixes)) return [];
      return mixes.map(p => ({
        id: p.id || `sp_${p.source_id}`,
        name: p.name,
        description: p.description || '',
        artwork_url: p.artwork_url || '',
        source: 'spotify',
        source_id: p.source_id || String(p.id || '').replace('sp_', ''),
        track_count: p.track_count || 0,
        is_mix: true
      }));
    } catch { return []; }
  }

  async function getRecentlyPlayed(limit = 20) {
    try {
      const data = await stash.spotify.request(`me/player/recently-played?limit=${limit}`);
      if (!data || data.error || !Array.isArray(data.items)) return [];
      return data.items.map(item => mapTrack(item.track, 'recent'));
    } catch { return []; }
  }

  /** Mirrors a like/unlike back to the user's Spotify library (heart button). */
  async function setLibrary(uris, add) {
    try {
      return await stash.spotify.setLibrary(uris, add);
    } catch { return false; }
  }

  /** Search Spotify's full catalog for albums, artists, playlists, and tracks. */
  async function searchCatalog(query, types, limit) {
    try {
      return await stash.spotify.searchCatalog(query, types || ['album', 'artist', 'playlist', 'track'], limit || 20);
    } catch { return { error: 'search_failed' }; }
  }

  /** Save a Spotify album to user's library. */
  async function saveAlbum(albumId) {
    try {
      return await stash.spotify.saveAlbum(albumId);
    } catch { return { error: 'save_failed' }; }
  }

  /** Follow a Spotify playlist. */
  async function followPlaylist(playlistId) {
    try {
      return await stash.spotify.followPlaylist(playlistId);
    } catch { return { error: 'follow_failed' }; }
  }

  /** Get all tracks from a Spotify album. */
  async function getAlbumTracks(albumId) {
    try {
      return await stash.spotify.getAlbumTracks(albumId);
    } catch { return []; }
  }

  function mapTrack(t, context) {
    return {
      id: `sp_${t.id}`,
      title: t.name,
      artist: t.artists?.map(a => a.name).join(', ') || 'Unknown',
      album: t.album?.name || '',
      duration: Math.round((t.duration_ms || 0) / 1000),
      artwork_url: t.album?.images?.[0]?.url || '',
      source: 'spotify',
      source_id: t.id,
      is_liked: context === 'liked' ? 1 : 0
    };
  }

  function isConnected() { return connected; }

  return {
    checkConnection, loginInApp, loginWithCookie, disconnect,
    getProfile, getLikedSongs, getPlaylists, getPlaylistTracks,
    getRecentlyPlayed, getMixes, setLibrary,
    searchCatalog, saveAlbum, followPlaylist, getAlbumTracks,
    isConnected
  };
})();
