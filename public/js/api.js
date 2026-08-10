/* ═══════════════════════════════════════════════════════════════════
   BUBBLE — Shared API Abstraction Layer
   Detects Electron vs Web and routes calls accordingly.
   - Electron: uses stash IPC (local SQLite / file system)
   - Web: uses fetch() to REST API (Supabase-backed)
   ═══════════════════════════════════════════════════════════════════ */

window.BubbleAPI = (() => {
    const isElectron = typeof stash !== 'undefined' &&
        typeof stash.db !== 'undefined' &&
        !stash._isPolyfill;  // Polyfill sets this flag on web
    const API_BASE = '/api';

    /* ── HTTP helpers (Web only) ──────────────────────────────────── */
    async function fetchJSON(url, opts = {}) {
        const config = {
            headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) },
            ...opts,
        };
        if (config.body && typeof config.body === 'object') {
            config.body = JSON.stringify(config.body);
        }
        const res = await fetch(url, config);
        const data = await res.json();
        if (!res.ok) {
            throw new Error(data.error || `Request failed (${res.status})`);
        }
        return data;
    }

    async function fetchMaybe(url, opts = {}) {
        try {
            return await fetchJSON(url, opts);
        } catch (e) {
            console.warn('[BubbleAPI] Request failed:', url, e.message);
            return null;
        }
    }

    /* ── Get current user (Web only) ──────────────────────────────── */
    function getWebUser() {
        return window.__bubbleUser || null;
    }

    function getSupabase() {
        return window.__bubbleSupabase || null;
    }

    /* ═══════════════════════════════════════════════════════════════
       PLAYLISTS (Local — created by user, saved to account)
       ═══════════════════════════════════════════════════════════════ */
    const playlists = {
        /** List all user playlists */
        async getAll() {
            if (isElectron) return BubbleDB.getAllPlaylists();
            const user = getWebUser();
            if (!user) return [];
            return (await fetchMaybe(`${API_BASE}/playlists`)) || [];
        },

        /** Get a single playlist with its tracks */
        async get(id) {
            if (isElectron) {
                const playlist = await BubbleDB.getPlaylist(id);
                if (!playlist) return null;
                const tracks = await BubbleDB.getPlaylistTracks(id);
                return { ...playlist, tracks };
            }
            return fetchMaybe(`${API_BASE}/playlists/${id}`);
        },

        /** Create/upsert a playlist */
        async create(name, description = '', artworkUrl = '', sourceId = '', source = 'local', trackCount = 0) {
            if (isElectron) {
                const id = 'local_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
                const playlist = { id, name, description, artwork_url: artworkUrl, source: 'local', source_id: '', track_count: 0, is_synced: 0, sync_mode: 'manual' };
                await BubbleDB.upsertPlaylist(playlist);
                return playlist;
            }
            const user = getWebUser();
            if (!user) throw new Error('Must be signed in to create playlists');
            return fetchJSON(`${API_BASE}/playlists`, {
                method: 'POST',
                body: { name, description, artwork_url: artworkUrl, source_id: sourceId, source, track_count: trackCount }
            });
        },

        /** Update playlist metadata */
        async update(id, data) {
            if (isElectron) {
                const existing = await BubbleDB.getPlaylist(id);
                if (!existing) throw new Error('Playlist not found');
                await BubbleDB.upsertPlaylist({ ...existing, ...data, id });
                return { ...existing, ...data };
            }
            return fetchJSON(`${API_BASE}/playlists/${id}`, { method: 'PUT', body: data });
        },

        /** Delete a playlist */
        async delete(id) {
            if (isElectron) return BubbleDB.deletePlaylist(id);
            return fetchJSON(`${API_BASE}/playlists/${id}`, { method: 'DELETE' });
        },

        /** Add track(s) to a playlist */
        async addTrack(playlistId, track, position) {
            if (isElectron) return BubbleDB.addTrackToPlaylist(playlistId, track, position);
            if (Array.isArray(track)) {
                return fetchJSON(`${API_BASE}/playlists/${playlistId}/tracks`, {
                    method: 'POST',
                    body: { tracks: track }
                });
            }
            return fetchJSON(`${API_BASE}/playlists/${playlistId}/tracks`, {
                method: 'POST',
                body: {
                    track_id: track.id,
                    title: track.title,
                    artist: track.artist,
                    album: track.album || '',
                    duration: track.duration || 0,
                    artwork_url: track.artwork_url || '',
                    source: track.source || 'local',
                    source_id: track.source_id || '',
                    arcod_id: track.arcod_id || '',
                    youtube_id: track.youtube_id || '',
                    quality: track.quality || 'flac',
                    position: position || 0,
                }
            });
        },

        /** Remove a track from a playlist */
        async removeTrack(playlistId, trackId) {
            if (isElectron) return BubbleDB.removeTrackFromPlaylist(playlistId, trackId);
            return fetchJSON(`${API_BASE}/playlists/${playlistId}/tracks?track_id=${encodeURIComponent(trackId)}`, {
                method: 'DELETE'
            });
        },

        /** Get tracks for a playlist */
        async getTracks(playlistId) {
            if (isElectron) return BubbleDB.getPlaylistTracks(playlistId);
            const playlist = await fetchMaybe(`${API_BASE}/playlists/${playlistId}`);
            return playlist ? playlist.tracks || [] : [];
        },
    };

    /* ═══════════════════════════════════════════════════════════════
       LIKED TRACKS (saved to user account)
       ═══════════════════════════════════════════════════════════════ */
    const liked = {
        /** Get all liked tracks */
        async getAll(limit = 100, offset = 0) {
            if (isElectron) return BubbleDB.getAllTracks({ liked: true, limit, offset });
            const user = getWebUser();
            if (!user) return [];
            const result = await fetchMaybe(
                `${API_BASE}/liked?limit=${limit}&offset=${offset}`
            );
            if (!result) return [];
            // Map to match Electron track format
            return (result.tracks || []).map(t => ({
                ...t,
                id: t.track_id,
                is_liked: 1,
            }));
        },

        /** Toggle like on a track (returns new liked state: 1 or 0) */
        async toggle(track) {
            const isLiked = await this.isLiked(track.id);
            if (isLiked) {
                await this.unlike(track.id);
                return 0;
            } else {
                await this.like(track);
                return 1;
            }
        },

        /** Like a track */
        async like(track) {
            if (isElectron) return BubbleDB.setLiked(track.id, 1);
            const user = getWebUser();
            if (!user) throw new Error('Must be signed in to like tracks');
            return fetchJSON(`${API_BASE}/liked`, {
                method: 'POST',
                body: {
                    track_id: track.id,
                    title: track.title,
                    artist: track.artist,
                    album: track.album || '',
                    duration: track.duration || 0,
                    artwork_url: track.artwork_url || '',
                    source: track.source || 'local',
                    source_id: track.source_id || '',
                    arcod_id: track.arcod_id || '',
                    youtube_id: track.youtube_id || '',
                    quality: track.quality || 'flac',
                }
            });
        },

        /** Like many tracks in one request (used by sync for speed). */
        async likeBatch(tracks) {
            if (isElectron) return BubbleDB.batchSaveTracks(tracks);
            return fetchJSON(`${API_BASE}/liked`, {
                method: 'POST',
                body: { tracks: tracks.map(t => ({ ...t, track_id: t.track_id || t.id })) }
            });
        },

        /** Unlike a track */
        async unlike(trackId) {
            if (isElectron) return BubbleDB.setLiked(trackId, 0);
            return fetchJSON(`${API_BASE}/liked?track_id=${encodeURIComponent(trackId)}`, {
                method: 'DELETE'
            });
        },

        /** Check if a track is liked */
        async isLiked(trackId) {
            if (isElectron) {
                const track = await BubbleDB.getTrack(trackId);
                return track ? !!track.is_liked : false;
            }
            const user = getWebUser();
            if (!user) return false;
            const result = await fetchMaybe(`${API_BASE}/liked/check?track_id=${encodeURIComponent(trackId)}`);
            return result ? result.liked : false;
        },

        /** Get liked tracks count */
        async getCount() {
            if (isElectron) {
                const row = await stash.db.get('SELECT COUNT(*) as c FROM tracks WHERE is_liked = 1');
                return row ? row.c : 0;
            }
            const result = await fetchMaybe(`${API_BASE}/liked?limit=1`);
            return result ? result.total || 0 : 0;
        },
    };

    /* ═══════════════════════════════════════════════════════════════
       TRACKS (Web only — unified read of liked ∪ playlist tracks)
       Electron reads tracks straight from SQLite via BubbleDB.
       ═══════════════════════════════════════════════════════════════ */
    const tracks = {
        /** Fetch the user's unified track set (deduped server-side). */
        async getAll(options = {}) {
            const user = getWebUser();
            if (!user) return { tracks: [], total: 0, duration: 0 };
            const qs = new URLSearchParams();
            if (options.source) qs.set('source', options.source);
            if (options.liked) qs.set('liked', '1');
            if (options.downloaded) qs.set('downloaded', '1');
            if (options.search) qs.set('search', options.search);
            if (options.sort) qs.set('sort', options.sort);
            if (options.limit != null) qs.set('limit', String(options.limit));
            if (options.offset != null) qs.set('offset', String(options.offset));
            const result = await fetchMaybe(`${API_BASE}/tracks?${qs.toString()}`);
            return result || { tracks: [], total: 0, duration: 0 };
        },

        /** Aggregate stats (total count + summed duration) for a filter. */
        async getStats(options = {}) {
            const user = getWebUser();
            if (!user) return { total: 0, duration: 0 };
            const qs = new URLSearchParams({ count: '1' });
            if (options.source) qs.set('source', options.source);
            if (options.liked) qs.set('liked', '1');
            if (options.downloaded) qs.set('downloaded', '1');
            if (options.search) qs.set('search', options.search);
            const result = await fetchMaybe(`${API_BASE}/tracks?${qs.toString()}`);
            return result ? { total: result.total || 0, duration: result.duration || 0 } : { total: 0, duration: 0 };
        },
    };

    /* ═══════════════════════════════════════════════════════════════
       AUTH (Web only — Electron has no user accounts)
       ═══════════════════════════════════════════════════════════════ */
    const auth = {
        /** Check if user is signed in */
        isSignedIn() {
            if (isElectron) return false; // Electron has no user accounts (yet)
            return !!getWebUser();
        },

        /** Get current user info */
        getUser() {
            if (isElectron) return null;
            return getWebUser();
        },

        /** Sign out */
        async signOut() {
            if (isElectron) return;
            const supabase = getSupabase();
            if (supabase) await supabase.auth.signOut();
        },

        /** Get auth token (for authenticated API calls) */
        async getToken() {
            if (isElectron) return null;
            const supabase = getSupabase();
            if (!supabase) return null;
            const { data: { session } } = await supabase.auth.getSession();
            return session?.access_token || null;
        },
    };

    /* ═══════════════════════════════════════════════════════════════
       INIT — Set up auth listener
       ═══════════════════════════════════════════════════════════════ */
    function init() {
        if (!isElectron) {
            // Listen for auth state changes from Next.js wrapper
            window.addEventListener('bubble:authReady', function (e) {
                var user = (e).detail.user;
                window.__bubbleUser = user;
                // Refresh sidebar playlists when auth changes
                if (user) {
                    setTimeout(function () {
                        if (typeof BubbleLibrary !== 'undefined' && BubbleLibrary.updateSidebarPlaylists) {
                            BubbleLibrary.updateSidebarPlaylists();
                        }
                    }, 500);
                }
            });

            // The Next.js wrapper fires this after it hydrates creds_* from the
            // server (initial load AND every Supabase Realtime change). Refresh the
            // in-memory connection flags so a connect/disconnect on another device
            // is reflected here without a manual reload.
            window.addEventListener('bubble:integrationsChanged', function () {
                Promise.resolve()
                    .then(function () { return typeof BubbleSpotify !== 'undefined' && BubbleSpotify.checkConnection ? BubbleSpotify.checkConnection() : null; })
                    .then(function () { return typeof BubbleYouTube !== 'undefined' && BubbleYouTube.checkConnection ? BubbleYouTube.checkConnection() : null; })
                    .catch(function () { })
                    .finally(function () {
                        // Re-render Settings only if it's the current view, so the
                        // account badges update live without yanking the user around.
                        var view = (location.hash || '').replace(/^#/, '').split('?')[0];
                        if (view === 'settings' && typeof BubbleRouter !== 'undefined' && BubbleRouter.navigate) {
                            BubbleRouter.navigate('settings', { force: true });
                        }
                    });
            });
        }
    }

    // Auto-init
    if (typeof window !== 'undefined') {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', init);
        } else {
            init();
        }
    }

    return { playlists, liked, tracks, auth, isElectron };
})();
