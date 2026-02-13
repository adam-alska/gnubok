-- Create TikTok integration tables for influencer analytics and ROI tracking
-- This migration creates: tiktok_accounts, tiktok_daily_stats, tiktok_videos, tiktok_sync_logs

-- ============================================================
-- TABLE: tiktok_accounts
-- Stores connected TikTok accounts with encrypted tokens
-- ============================================================

CREATE TABLE IF NOT EXISTS tiktok_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users NOT NULL,

  -- TikTok user info
  tiktok_user_id text NOT NULL UNIQUE,
  username text NOT NULL,
  display_name text NULL,
  avatar_url text NULL,

  -- Encrypted tokens (AES-256-GCM, format: iv:authTag:encrypted in base64)
  access_token_encrypted text NOT NULL,
  refresh_token_encrypted text NOT NULL,

  -- Token expiration
  token_expires_at timestamptz NOT NULL,
  refresh_token_expires_at timestamptz NOT NULL,

  -- Account status
  status text NOT NULL DEFAULT 'active' CHECK (status IN (
    'active', 'expired', 'revoked', 'error'
  )),

  -- Sync tracking
  last_synced_at timestamptz NULL,
  last_stats_sync_at timestamptz NULL,
  last_video_sync_at timestamptz NULL,

  -- Error tracking
  last_error text NULL,
  error_count integer NOT NULL DEFAULT 0,

  -- Timestamps
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Indexes for tiktok_accounts
CREATE INDEX IF NOT EXISTS idx_tiktok_accounts_user_id ON tiktok_accounts(user_id);
CREATE INDEX IF NOT EXISTS idx_tiktok_accounts_status ON tiktok_accounts(status);
CREATE INDEX IF NOT EXISTS idx_tiktok_accounts_tiktok_user_id ON tiktok_accounts(tiktok_user_id);

-- Enable RLS for tiktok_accounts
ALTER TABLE tiktok_accounts ENABLE ROW LEVEL SECURITY;

-- RLS policies for tiktok_accounts
CREATE POLICY "Users can view their own TikTok accounts"
  ON tiktok_accounts FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own TikTok accounts"
  ON tiktok_accounts FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own TikTok accounts"
  ON tiktok_accounts FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own TikTok accounts"
  ON tiktok_accounts FOR DELETE
  USING (auth.uid() = user_id);

-- ============================================================
-- TABLE: tiktok_daily_stats
-- Daily snapshots of account statistics for growth tracking
-- ============================================================

CREATE TABLE IF NOT EXISTS tiktok_daily_stats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tiktok_account_id uuid REFERENCES tiktok_accounts(id) ON DELETE CASCADE NOT NULL,
  user_id uuid REFERENCES auth.users NOT NULL,

  -- Date of snapshot
  stats_date date NOT NULL,

  -- Follower metrics
  follower_count bigint NOT NULL DEFAULT 0,
  following_count bigint NOT NULL DEFAULT 0,

  -- Content metrics
  likes_count bigint NOT NULL DEFAULT 0,
  video_count integer NOT NULL DEFAULT 0,

  -- Calculated change from previous day
  follower_change integer NULL,

  -- Timestamps
  created_at timestamptz DEFAULT now(),

  -- Unique constraint to prevent duplicate entries
  UNIQUE(tiktok_account_id, stats_date)
);

-- Indexes for tiktok_daily_stats
CREATE INDEX IF NOT EXISTS idx_tiktok_daily_stats_user_id ON tiktok_daily_stats(user_id);
CREATE INDEX IF NOT EXISTS idx_tiktok_daily_stats_account_id ON tiktok_daily_stats(tiktok_account_id);
CREATE INDEX IF NOT EXISTS idx_tiktok_daily_stats_date ON tiktok_daily_stats(stats_date);
CREATE INDEX IF NOT EXISTS idx_tiktok_daily_stats_account_date ON tiktok_daily_stats(tiktok_account_id, stats_date DESC);

-- Enable RLS for tiktok_daily_stats
ALTER TABLE tiktok_daily_stats ENABLE ROW LEVEL SECURITY;

-- RLS policies for tiktok_daily_stats
CREATE POLICY "Users can view their own TikTok stats"
  ON tiktok_daily_stats FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own TikTok stats"
  ON tiktok_daily_stats FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own TikTok stats"
  ON tiktok_daily_stats FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own TikTok stats"
  ON tiktok_daily_stats FOR DELETE
  USING (auth.uid() = user_id);

-- ============================================================
-- TABLE: tiktok_videos
-- Video metadata and performance metrics
-- ============================================================

CREATE TABLE IF NOT EXISTS tiktok_videos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tiktok_account_id uuid REFERENCES tiktok_accounts(id) ON DELETE CASCADE NOT NULL,
  user_id uuid REFERENCES auth.users NOT NULL,

  -- TikTok video identification
  tiktok_video_id text NOT NULL,

  -- Video metadata
  title text NULL,
  share_url text NULL,
  cover_image_url text NULL,

  -- Performance metrics
  view_count bigint NOT NULL DEFAULT 0,
  like_count bigint NOT NULL DEFAULT 0,
  comment_count bigint NOT NULL DEFAULT 0,
  share_count bigint NOT NULL DEFAULT 0,

  -- Video duration in seconds
  duration integer NULL,

  -- Publication date
  published_at timestamptz NULL,

  -- Campaign/deliverable linking for ROI tracking
  campaign_id uuid REFERENCES campaigns(id) ON DELETE SET NULL,
  deliverable_id uuid REFERENCES deliverables(id) ON DELETE SET NULL,

  -- Timestamps
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),

  -- Unique constraint
  UNIQUE(tiktok_account_id, tiktok_video_id)
);

-- Indexes for tiktok_videos
CREATE INDEX IF NOT EXISTS idx_tiktok_videos_user_id ON tiktok_videos(user_id);
CREATE INDEX IF NOT EXISTS idx_tiktok_videos_account_id ON tiktok_videos(tiktok_account_id);
CREATE INDEX IF NOT EXISTS idx_tiktok_videos_campaign_id ON tiktok_videos(campaign_id);
CREATE INDEX IF NOT EXISTS idx_tiktok_videos_deliverable_id ON tiktok_videos(deliverable_id);
CREATE INDEX IF NOT EXISTS idx_tiktok_videos_published_at ON tiktok_videos(published_at);
CREATE INDEX IF NOT EXISTS idx_tiktok_videos_tiktok_video_id ON tiktok_videos(tiktok_video_id);

-- Enable RLS for tiktok_videos
ALTER TABLE tiktok_videos ENABLE ROW LEVEL SECURITY;

-- RLS policies for tiktok_videos
CREATE POLICY "Users can view their own TikTok videos"
  ON tiktok_videos FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own TikTok videos"
  ON tiktok_videos FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own TikTok videos"
  ON tiktok_videos FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own TikTok videos"
  ON tiktok_videos FOR DELETE
  USING (auth.uid() = user_id);

-- ============================================================
-- TABLE: tiktok_sync_logs
-- Sync history for debugging and monitoring
-- ============================================================

CREATE TABLE IF NOT EXISTS tiktok_sync_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tiktok_account_id uuid REFERENCES tiktok_accounts(id) ON DELETE CASCADE NOT NULL,
  user_id uuid REFERENCES auth.users NOT NULL,

  -- Sync type
  sync_type text NOT NULL CHECK (sync_type IN (
    'stats', 'videos', 'full', 'token_refresh'
  )),

  -- Sync result
  status text NOT NULL CHECK (status IN (
    'started', 'success', 'partial', 'failed'
  )),

  -- Details
  stats_synced boolean NOT NULL DEFAULT false,
  videos_synced integer NOT NULL DEFAULT 0,
  new_videos integer NOT NULL DEFAULT 0,

  -- Error info
  error_message text NULL,
  error_code text NULL,

  -- Duration
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz NULL,

  -- Timestamps
  created_at timestamptz DEFAULT now()
);

-- Indexes for tiktok_sync_logs
CREATE INDEX IF NOT EXISTS idx_tiktok_sync_logs_user_id ON tiktok_sync_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_tiktok_sync_logs_account_id ON tiktok_sync_logs(tiktok_account_id);
CREATE INDEX IF NOT EXISTS idx_tiktok_sync_logs_created_at ON tiktok_sync_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_tiktok_sync_logs_status ON tiktok_sync_logs(status);

-- Enable RLS for tiktok_sync_logs
ALTER TABLE tiktok_sync_logs ENABLE ROW LEVEL SECURITY;

-- RLS policies for tiktok_sync_logs
CREATE POLICY "Users can view their own TikTok sync logs"
  ON tiktok_sync_logs FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own TikTok sync logs"
  ON tiktok_sync_logs FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- ============================================================
-- TRIGGERS for updated_at
-- ============================================================

-- tiktok_accounts updated_at trigger
CREATE OR REPLACE FUNCTION update_tiktok_accounts_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_tiktok_accounts_updated_at ON tiktok_accounts;
CREATE TRIGGER update_tiktok_accounts_updated_at
  BEFORE UPDATE ON tiktok_accounts
  FOR EACH ROW
  EXECUTE PROCEDURE update_tiktok_accounts_updated_at();

-- tiktok_videos updated_at trigger
CREATE OR REPLACE FUNCTION update_tiktok_videos_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_tiktok_videos_updated_at ON tiktok_videos;
CREATE TRIGGER update_tiktok_videos_updated_at
  BEFORE UPDATE ON tiktok_videos
  FOR EACH ROW
  EXECUTE PROCEDURE update_tiktok_videos_updated_at();

-- ============================================================
-- FUNCTION: Calculate follower change on insert
-- ============================================================

CREATE OR REPLACE FUNCTION calculate_follower_change()
RETURNS TRIGGER AS $$
DECLARE
  prev_count bigint;
BEGIN
  -- Get the previous day's follower count
  SELECT follower_count INTO prev_count
  FROM tiktok_daily_stats
  WHERE tiktok_account_id = NEW.tiktok_account_id
    AND stats_date = NEW.stats_date - INTERVAL '1 day';

  -- Calculate change if previous record exists
  IF prev_count IS NOT NULL THEN
    NEW.follower_change = NEW.follower_count - prev_count;
  END IF;

  RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS calculate_follower_change_trigger ON tiktok_daily_stats;
CREATE TRIGGER calculate_follower_change_trigger
  BEFORE INSERT ON tiktok_daily_stats
  FOR EACH ROW
  EXECUTE PROCEDURE calculate_follower_change();
