-- ═══════════════════════════════════════════════════════════════════
-- BUBBLE WEB — Supabase Database Schema
-- Run this in your Supabase SQL Editor after creating the project.
-- ═══════════════════════════════════════════════════════════════════

-- ── Profiles (extends auth.users) ────────────────────────────────
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── User Playlists (local playlists created in-app) ─────────────
CREATE TABLE IF NOT EXISTS user_playlists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  artwork_url TEXT DEFAULT '',
  source TEXT DEFAULT 'local',
  source_id TEXT,
  track_count INTEGER DEFAULT 0,
  is_public BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, source_id)
);

-- ── Tracks in User Playlists ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS user_playlist_tracks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  playlist_id UUID NOT NULL REFERENCES user_playlists(id) ON DELETE CASCADE,
  track_id TEXT NOT NULL,
  title TEXT NOT NULL,
  artist TEXT NOT NULL,
  album TEXT DEFAULT '',
  duration INTEGER DEFAULT 0,
  artwork_url TEXT DEFAULT '',
  source TEXT DEFAULT 'local',
  source_id TEXT DEFAULT '',
  arcod_id TEXT DEFAULT '',
  youtube_id TEXT DEFAULT '',
  quality TEXT DEFAULT 'flac',
  position INTEGER DEFAULT 0,
  added_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(playlist_id, track_id)
);

-- ── Liked Tracks per User ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS user_liked_tracks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  track_id TEXT NOT NULL,
  title TEXT NOT NULL,
  artist TEXT NOT NULL,
  album TEXT DEFAULT '',
  duration INTEGER DEFAULT 0,
  artwork_url TEXT DEFAULT '',
  source TEXT DEFAULT 'local',
  source_id TEXT DEFAULT '',
  arcod_id TEXT DEFAULT '',
  youtube_id TEXT DEFAULT '',
  quality TEXT DEFAULT 'flac',
  liked_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, track_id)
);

-- ── Indexes (use IF NOT EXISTS for idempotency) ──────────────────
CREATE INDEX IF NOT EXISTS idx_playlists_user ON user_playlists(user_id);
CREATE INDEX IF NOT EXISTS idx_playlist_tracks_playlist ON user_playlist_tracks(playlist_id);
CREATE INDEX IF NOT EXISTS idx_liked_tracks_user ON user_liked_tracks(user_id);

-- ── Auto-create profile on signup (fault-tolerant) ──────────────
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  BEGIN
    INSERT INTO profiles (id, display_name, avatar_url)
    VALUES (
      NEW.id,
      COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', NEW.email),
      NEW.raw_user_meta_data->>'avatar_url'
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'Failed to create profile: %', SQLERRM;
  END;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ── RLS (Row Level Security) ─────────────────────────────────────
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_playlists ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_playlist_tracks ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_liked_tracks ENABLE ROW LEVEL SECURITY;

-- Profiles: anyone can view, only owner can update
DROP POLICY IF EXISTS "Public profiles are viewable by everyone" ON profiles;
CREATE POLICY "Public profiles are viewable by everyone" ON profiles
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
CREATE POLICY "Users can update own profile" ON profiles
  FOR UPDATE USING (auth.uid() = id);

-- Playlists: owner-only access
DROP POLICY IF EXISTS "Users can CRUD own playlists" ON user_playlists;
CREATE POLICY "Users can CRUD own playlists" ON user_playlists
  FOR ALL USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Playlist tracks: access through playlist ownership
DROP POLICY IF EXISTS "Users can CRUD tracks in own playlists" ON user_playlist_tracks;
CREATE POLICY "Users can CRUD tracks in own playlists" ON user_playlist_tracks
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM user_playlists
      WHERE user_playlists.id = user_playlist_tracks.playlist_id
      AND user_playlists.user_id = auth.uid()
    )
  );

-- Liked tracks: owner-only access
DROP POLICY IF EXISTS "Users can CRUD own liked tracks" ON user_liked_tracks;
CREATE POLICY "Users can CRUD own liked tracks" ON user_liked_tracks
  FOR ALL USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ═══════════════════════════════════════════════════════════════════
-- CENTRALIZATION MIGRATION (Playlists + Liked Songs)
-- Safe to run multiple times (idempotent). Run after the tables above.
-- ═══════════════════════════════════════════════════════════════════

-- ── 1. Tombstone flag: hide a synced (Spotify/YouTube) playlist ──────
-- Deleting a synced playlist in Bubble sets dismissed = true so it is
-- filtered out of the sidebar AND skipped on future syncs — without ever
-- touching the user's real Spotify/YouTube account.
ALTER TABLE user_playlists ADD COLUMN IF NOT EXISTS dismissed BOOLEAN DEFAULT false;

-- ── 2. One-time cleanup of duplicate synced playlists ────────────────
-- Historic bug inserted a fresh row on every sync (empty source_id is
-- distinct under UNIQUE in Postgres). Collapse duplicates that share a
-- real (user_id, source_id): keep the row with the most tracks, re-point
-- that group's tracks onto it, then drop the extras. Idempotent.
DO $$
BEGIN
  -- Re-point tracks from duplicate playlists onto the survivor (most tracks).
  WITH ranked AS (
    SELECT id, user_id, source_id,
           ROW_NUMBER() OVER (
             PARTITION BY user_id, source_id
             ORDER BY track_count DESC, updated_at DESC
           ) AS rn,
           FIRST_VALUE(id) OVER (
             PARTITION BY user_id, source_id
             ORDER BY track_count DESC, updated_at DESC
           ) AS keep_id
    FROM user_playlists
    WHERE COALESCE(source_id, '') <> ''
  ),
  dupes AS (SELECT id, keep_id FROM ranked WHERE rn > 1)
  UPDATE user_playlist_tracks upt
     SET playlist_id = d.keep_id
    FROM dupes d
   WHERE upt.playlist_id = d.id
     -- Avoid violating UNIQUE(playlist_id, track_id) if survivor already has it
     AND NOT EXISTS (
       SELECT 1 FROM user_playlist_tracks x
        WHERE x.playlist_id = d.keep_id AND x.track_id = upt.track_id
     );

  -- Delete the now-empty duplicate playlist rows.
  WITH ranked AS (
    SELECT id,
           ROW_NUMBER() OVER (
             PARTITION BY user_id, source_id
             ORDER BY track_count DESC, updated_at DESC
           ) AS rn
    FROM user_playlists
    WHERE COALESCE(source_id, '') <> ''
  )
  DELETE FROM user_playlists
   WHERE id IN (SELECT id FROM ranked WHERE rn > 1);

  -- Recompute track_count for every playlist from actual rows.
  UPDATE user_playlists p
     SET track_count = (
       SELECT COUNT(*) FROM user_playlist_tracks t WHERE t.playlist_id = p.id
     );
END $$;

-- ── 3. Unified track view (single source of truth for reads) ─────────
-- The web build has no global "tracks" table; a user's tracks live in
-- user_liked_tracks + user_playlist_tracks. This view unions both and
-- dedupes by track_id (liked row wins so is_liked is accurate).
-- security_invoker = on → RLS on the base tables still applies per user.
CREATE OR REPLACE VIEW user_all_tracks
WITH (security_invoker = on) AS
SELECT DISTINCT ON (user_id, track_id)
  user_id,
  track_id,
  title,
  artist,
  album,
  duration,
  artwork_url,
  source,
  source_id,
  arcod_id,
  youtube_id,
  quality,
  is_liked,
  added_ts
FROM (
  SELECT
    user_id, track_id, title, artist, album, duration, artwork_url,
    source, source_id, arcod_id, youtube_id, quality,
    1 AS is_liked,
    liked_at AS added_ts
  FROM user_liked_tracks

  UNION ALL

  SELECT
    pl.user_id, t.track_id, t.title, t.artist, t.album, t.duration, t.artwork_url,
    t.source, t.source_id, t.arcod_id, t.youtube_id, t.quality,
    0 AS is_liked,
    t.added_at AS added_ts
  FROM user_playlist_tracks t
  JOIN user_playlists pl ON pl.id = t.playlist_id
  WHERE COALESCE(pl.dismissed, false) = false
) unified
ORDER BY user_id, track_id, is_liked DESC, added_ts DESC;

-- ── User Integrations (Sync Tokens Across Devices) ───────────────
CREATE TABLE IF NOT EXISTS user_integrations (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  spotify_access_token TEXT,
  spotify_refresh_token TEXT,
  spotify_token_expiry BIGINT,
  spotify_client_id TEXT,
  spotify_client_secret TEXT,
  spotify_cookie TEXT,
  arcod_token TEXT,
  arcod_refresh_token TEXT,
  arcod_token_expiry BIGINT,
  arcod_stashkey TEXT,
  youtube_token TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Idempotent column adds for existing deployments (safe to re-run).
ALTER TABLE user_integrations ADD COLUMN IF NOT EXISTS spotify_cookie TEXT;
ALTER TABLE user_integrations ADD COLUMN IF NOT EXISTS arcod_refresh_token TEXT;
ALTER TABLE user_integrations ADD COLUMN IF NOT EXISTS arcod_token_expiry BIGINT;
ALTER TABLE user_integrations ADD COLUMN IF NOT EXISTS arcod_stashkey TEXT;

ALTER TABLE user_integrations ENABLE ROW LEVEL SECURITY;

-- Realtime: broadcast row changes so connect/disconnect propagates across devices.
ALTER TABLE user_integrations REPLICA IDENTITY FULL;

DROP POLICY IF EXISTS "Users can CRUD own integrations" ON user_integrations;
CREATE POLICY "Users can CRUD own integrations" ON user_integrations
  FOR ALL USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
