/* ═══════════════════════════════════════════════════════════════════
   STASH DESKTOP — Database Module
   Client-side wrapper for SQLite via IPC
   ═══════════════════════════════════════════════════════════════════ */

window.BubbleDB = {
  /* ── Web session track cache ───────────────────────────────────
     Web has no global `tracks` table (only Supabase liked + playlist
     tracks). This in-memory cache is seeded by every read path so that
     ID-only callers (getTrack, playTrack('id'), downloadTrack) resolve
     the tracks currently on screen. Electron ignores this entirely. */
  _trackCache: new Map(),
  _seedCache(tracks) {
    if (!Array.isArray(tracks)) return;
    for (const t of tracks) {
      if (t && t.id) this._trackCache.set(t.id, t);
    }
  },

  /* ── Tracks ────────────────────────────────────────────────── */
  async getAllTracks(options = {}) {
    if (!BubbleAPI.isElectron) {
      const result = await BubbleAPI.tracks.getAll(options);
      const tracks = result.tracks || [];
      this._seedCache(tracks);
      return tracks;
    }
    let sql = 'SELECT * FROM tracks';
    const conditions = [];
    const params = [];

    if (options.source) { conditions.push('source = ?'); params.push(options.source); }
    if (options.liked) { conditions.push('is_liked = 1'); }
    if (options.downloaded) { conditions.push('is_downloaded = 1'); }
    if (options.search) {
      conditions.push("(title LIKE ? OR artist LIKE ? OR album LIKE ?)");
      const term = `%${options.search}%`;
      params.push(term, term, term);
    }

    if (conditions.length) sql += ' WHERE ' + conditions.join(' AND ');

    const orderMap = {
      'title': 'title ASC', 'artist': 'artist ASC', 'album': 'album ASC',
      'added': 'added_at DESC', 'played': 'played_at DESC', 'duration': 'duration ASC'
    };
    sql += ' ORDER BY ' + (orderMap[options.sort] || 'added_at DESC');
    if (options.limit) { sql += ' LIMIT ?'; params.push(options.limit); }
    if (options.offset) { sql += ' OFFSET ?'; params.push(options.offset); }

    return stash.db.getAll(sql, params);
  },

  /** Aggregate stats (count + summed duration) for the current filter. */
  async getTrackStats(options = {}) {
    if (!BubbleAPI.isElectron) {
      return BubbleAPI.tracks.getStats(options);
    }
    const conditions = [];
    const params = [];
    if (options.source) { conditions.push('source = ?'); params.push(options.source); }
    if (options.liked) { conditions.push('is_liked = 1'); }
    if (options.downloaded) { conditions.push('is_downloaded = 1'); }
    const where = conditions.length ? ' WHERE ' + conditions.join(' AND ') : '';
    const row = await stash.db.get(`SELECT COUNT(*) as total, SUM(duration) as duration FROM tracks${where}`, params);
    return { total: row ? (row.total || 0) : 0, duration: row ? (row.duration || 0) : 0 };
  },

  async getTrack(id) {
    if (!BubbleAPI.isElectron) {
      return this._trackCache.get(id) || null;
    }
    return stash.db.get('SELECT * FROM tracks WHERE id = ?', [id]);
  },

  async upsertTrack(track) {
    if (!BubbleAPI.isElectron) {
      // No global tracks table on web — cache for this session only.
      if (track && track.id) this._trackCache.set(track.id, track);
      return { changes: 0 };
    }
    // Preserve is_liked and is_downloaded if the incoming track doesn't specify them
    const existing = await this.getTrack(track.id);
    const isLiked = track.is_liked !== undefined ? track.is_liked : (existing ? existing.is_liked : 0);
    const isDownloaded = track.is_downloaded !== undefined ? track.is_downloaded : (existing ? existing.is_downloaded : 0);
    const filePath = track.file_path || (existing ? existing.file_path : '');

    return stash.db.run(`
      INSERT OR REPLACE INTO tracks (id, title, artist, album, duration, artwork_url, source, source_id, file_path, is_downloaded, is_liked, arcod_id, youtube_id, quality)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [track.id, track.title, track.artist, track.album || '', track.duration || 0,
    track.artwork_url || '', track.source || 'spotify', track.source_id || '',
      filePath, isDownloaded, isLiked,
    track.arcod_id || '', track.youtube_id || '', track.quality || 'flac']);
  },

  async toggleLike(trackId, trackObj = null) {
    if (!BubbleAPI.isElectron && BubbleAPI.auth.isSignedIn()) {
      const track = trackObj || this._trackCache.get(trackId) || await this.getTrack(trackId);
      if (!track) return;
      if (track.id == null) track.id = trackId;
      const newVal = await BubbleAPI.liked.toggle(track);
      // Keep the cache's like state in sync so re-renders reflect it.
      const cached = this._trackCache.get(trackId);
      if (cached) cached.is_liked = newVal;
      return newVal;
    }
    // Electron: DB is the source of truth for the current like state.
    const track = await this.getTrack(trackId);
    if (!track) return;
    const newVal = track.is_liked ? 0 : 1;
    await stash.db.run('UPDATE tracks SET is_liked = ? WHERE id = ?', [newVal, trackId]);
    return newVal;
  },

  async setLiked(trackId, isLiked, trackObj = null) {
    if (!BubbleAPI.isElectron && BubbleAPI.auth.isSignedIn()) {
      if (isLiked) {
        const track = trackObj || this._trackCache.get(trackId) || await this.getTrack(trackId);
        // Can't create a liked row without title/artist — skip rather than mis-unlike.
        if (!track) return;
        if (track.id == null) track.id = trackId;
        return BubbleAPI.liked.like(track);
      }
      return BubbleAPI.liked.unlike(trackId);
    }
    return stash.db.run('UPDATE tracks SET is_liked = ? WHERE id = ?', [isLiked ? 1 : 0, trackId]);
  },

  async updatePlayCount(trackId) {
    if (!BubbleAPI.isElectron) return { changes: 0 }; // no play tracking on web
    return stash.db.run("UPDATE tracks SET play_count = play_count + 1, played_at = datetime('now') WHERE id = ?", [trackId]);
  },

  async getTrackCount() {
    if (!BubbleAPI.isElectron) {
      const stats = await BubbleAPI.tracks.getStats();
      return stats.total || 0;
    }
    const row = await stash.db.get('SELECT COUNT(*) as count FROM tracks');
    return row ? row.count : 0;
  },

  /* ── Playlists ─────────────────────────────────────────────── */
  /* ── Playlists ─────────────────────────────────────────────── */
  async getAllPlaylists() {
    if (!BubbleAPI.isElectron) {
      return BubbleAPI.playlists.getAll();
    }
    return stash.db.getAll('SELECT * FROM playlists ORDER BY updated_at DESC');
  },

  async getPlaylist(id) {
    if (!BubbleAPI.isElectron) {
      return BubbleAPI.playlists.get(id);
    }
    return stash.db.get('SELECT * FROM playlists WHERE id = ?', [id]);
  },

  async upsertPlaylist(playlist) {
    if (!BubbleAPI.isElectron) {
      return BubbleAPI.playlists.create(
        playlist.name,
        playlist.description,
        playlist.artwork_url,
        playlist.source_id || '',
        playlist.source || 'bubble',
        playlist.track_count || 0
      );
    }
    return stash.db.run(`
      INSERT OR REPLACE INTO playlists (id, name, description, artwork_url, source, source_id, track_count, is_synced, sync_mode, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `, [playlist.id, playlist.name, playlist.description || '', playlist.artwork_url || '',
    playlist.source || 'spotify', playlist.source_id || '', playlist.track_count || 0,
    playlist.is_synced !== undefined ? playlist.is_synced : 1,
    playlist.sync_mode || 'refresh']);
  },

  async getPlaylistTracks(playlistId) {
    if (!BubbleAPI.isElectron) {
      const tracks = await BubbleAPI.playlists.getTracks(playlistId);
      const mapped = (tracks || []).map(t => ({ ...t, id: t.track_id || t.id }));
      this._seedCache(mapped);
      return mapped;
    }
    return stash.db.getAll(`
      SELECT t.* FROM tracks t
      INNER JOIN playlist_tracks pt ON t.id = pt.track_id
      WHERE pt.playlist_id = ?
      ORDER BY pt.position ASC
    `, [playlistId]);
  },

  async addTrackToPlaylist(playlistId, trackId, position) {
    if (!BubbleAPI.isElectron) {
      if (Array.isArray(trackId)) {
        return BubbleAPI.playlists.addTrack(playlistId, trackId);
      }
      const track = (typeof trackId === 'object') ? trackId : (await this.getTrack(trackId) || { id: trackId, title: 'Unknown', artist: 'Unknown' });
      return BubbleAPI.playlists.addTrack(playlistId, { ...track, position });
    }
    return stash.db.run('INSERT OR IGNORE INTO playlist_tracks (playlist_id, track_id, position) VALUES (?, ?, ?)',
      [playlistId, trackId, position || 0]);
  },

  async removeTrackFromPlaylist(playlistId, trackId) {
    if (!BubbleAPI.isElectron) {
      return BubbleAPI.playlists.removeTrack(playlistId, trackId);
    }
    return stash.db.run('DELETE FROM playlist_tracks WHERE playlist_id = ? AND track_id = ?', [playlistId, trackId]);
  },

  async deletePlaylist(playlistId) {
    if (!BubbleAPI.isElectron) {
      return BubbleAPI.playlists.delete(playlistId);
    }
    await stash.db.run('DELETE FROM playlist_tracks WHERE playlist_id = ?', [playlistId]);
    return stash.db.run('DELETE FROM playlists WHERE id = ?', [playlistId]);
  },

  /* ── Downloads ─────────────────────────────────────────────── */
  async getDownloads(status) {
    if (!BubbleAPI.isElectron) {
      try {
        const list = JSON.parse(localStorage.getItem('bubble_downloads') || '[]');
        if (status) return list.filter(d => d.status === status);
        return list;
      } catch (e) { return []; }
    }
    if (status) return stash.db.getAll('SELECT d.*, t.title, t.artist, t.artwork_url FROM downloads d JOIN tracks t ON d.track_id = t.id WHERE d.status = ? ORDER BY d.id DESC', [status]);
    return stash.db.getAll('SELECT d.*, t.title, t.artist, t.artwork_url FROM downloads d JOIN tracks t ON d.track_id = t.id ORDER BY d.id DESC');
  },

  async createDownload(trackId, trackInfo = null) {
    if (!BubbleAPI.isElectron) {
      try {
        const list = JSON.parse(localStorage.getItem('bubble_downloads') || '[]');
        const track = trackInfo || (await this.getTrack(trackId)) || {};
        const newDl = {
          id: Date.now(),
          track_id: trackId,
          title: track.title || 'Track',
          artist: track.artist || 'Artist',
          artwork_url: track.artwork_url || '',
          source: track.source || 'arcod',
          status: 'completed',
          file_size: track.duration ? track.duration * 128000 : 25000000,
          created_at: new Date().toISOString(),
        };
        list.unshift(newDl);
        localStorage.setItem('bubble_downloads', JSON.stringify(list.slice(0, 100)));
        return newDl;
      } catch (e) { return null; }
    }
    return stash.db.run("INSERT INTO downloads (track_id, status) VALUES (?, 'pending')", [trackId]);
  },

  async getDownloadStats() {
    if (!BubbleAPI.isElectron) {
      const list = await this.getDownloads();
      return {
        total: list.length,
        completed: list.filter(d => d.status === 'completed').length,
        pending: list.filter(d => d.status === 'pending' || d.status === 'downloading').length,
        failed: list.filter(d => d.status === 'failed').length,
      };
    }
    const total = await stash.db.get('SELECT COUNT(*) as c FROM downloads');
    const completed = await stash.db.get("SELECT COUNT(*) as c FROM downloads WHERE status = 'completed'");
    const pending = await stash.db.get("SELECT COUNT(*) as c FROM downloads WHERE status IN ('pending', 'downloading')");
    const failed = await stash.db.get("SELECT COUNT(*) as c FROM downloads WHERE status = 'failed'");
    return {
      total: total?.c || 0,
      completed: completed?.c || 0,
      pending: pending?.c || 0,
      failed: failed?.c || 0
    };
  },

  /* ── Settings ──────────────────────────────────────────────── */
  async getSetting(key) { return stash.settings.get(key); },
  async setSetting(key, value) { return stash.settings.set(key, value); },
  async getAllSettings() { return stash.settings.getAll(); }
};
