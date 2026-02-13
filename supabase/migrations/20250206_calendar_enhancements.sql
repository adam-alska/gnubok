-- Calendar enhancements: Tax deadlines, status tracking, push notifications, calendar feeds
-- Migration: 20250206_calendar_enhancements.sql

-- 0. Extend company_settings for arbetsgivardeklaration
ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS pays_salaries boolean DEFAULT false;

-- 1. Extend deadlines table with tax-specific fields

-- Tax deadline type
ALTER TABLE deadlines ADD COLUMN IF NOT EXISTS tax_deadline_type text NULL CHECK (
  tax_deadline_type IS NULL OR tax_deadline_type IN (
    'moms_monthly', 'moms_quarterly', 'moms_yearly',
    'f_skatt', 'arbetsgivardeklaration',
    'inkomstdeklaration_ef', 'inkomstdeklaration_ab',
    'arsredovisning', 'periodisk_sammanstallning', 'bokslut'
  )
);

-- Tax period (e.g., "2025-Q1", "2025-01", "2025")
ALTER TABLE deadlines ADD COLUMN IF NOT EXISTS tax_period text NULL;

-- Source: system-generated or user-created
ALTER TABLE deadlines ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'user' CHECK (source IN ('system', 'user'));

-- Reminder offsets in days before deadline (e.g., {14, 7, 1, 0})
ALTER TABLE deadlines ADD COLUMN IF NOT EXISTS reminder_offsets integer[] DEFAULT '{14,7,1,0}';

-- Status workflow: upcoming → action_needed → in_progress → submitted → confirmed/overdue
ALTER TABLE deadlines ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'upcoming' CHECK (
  status IN ('upcoming', 'action_needed', 'in_progress', 'submitted', 'confirmed', 'overdue')
);

-- Track when status was last changed
ALTER TABLE deadlines ADD COLUMN IF NOT EXISTS status_changed_at timestamptz DEFAULT now();

-- Link to report type for quick navigation
ALTER TABLE deadlines ADD COLUMN IF NOT EXISTS linked_report_type text NULL;

-- Link to specific report period (e.g., {"year": 2025, "quarter": 1})
ALTER TABLE deadlines ADD COLUMN IF NOT EXISTS linked_report_period jsonb NULL;

-- Update deadline_type CHECK constraint to include new types
ALTER TABLE deadlines DROP CONSTRAINT IF EXISTS deadlines_deadline_type_check;
ALTER TABLE deadlines ADD CONSTRAINT deadlines_deadline_type_check CHECK (deadline_type IN (
  'delivery', 'invoicing', 'report', 'approval', 'other',
  'revision', 'assets', 'spark_ad', 'statistics', 'tax'
));

-- Create indexes for tax deadlines
CREATE INDEX IF NOT EXISTS idx_deadlines_tax_type ON deadlines(user_id, tax_deadline_type) WHERE tax_deadline_type IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_deadlines_status ON deadlines(user_id, status);
CREATE INDEX IF NOT EXISTS idx_deadlines_source ON deadlines(user_id, source);
CREATE INDEX IF NOT EXISTS idx_deadlines_status_date ON deadlines(user_id, status, due_date);

-- Link to campaign and deliverable if not already present
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'deadlines' AND column_name = 'campaign_id') THEN
    ALTER TABLE deadlines ADD COLUMN campaign_id uuid REFERENCES campaigns(id) ON DELETE SET NULL;
    CREATE INDEX IF NOT EXISTS idx_deadlines_campaign_id ON deadlines(campaign_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'deadlines' AND column_name = 'deliverable_id') THEN
    ALTER TABLE deadlines ADD COLUMN deliverable_id uuid REFERENCES deliverables(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'deadlines' AND column_name = 'is_auto_generated') THEN
    ALTER TABLE deadlines ADD COLUMN is_auto_generated boolean DEFAULT false;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'deadlines' AND column_name = 'date_calculation_type') THEN
    ALTER TABLE deadlines ADD COLUMN date_calculation_type text NULL CHECK (date_calculation_type IN ('absolute', 'relative'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'deadlines' AND column_name = 'reference_event') THEN
    ALTER TABLE deadlines ADD COLUMN reference_event text NULL CHECK (reference_event IN ('publication', 'delivery', 'approval', 'contract'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'deadlines' AND column_name = 'offset_days') THEN
    ALTER TABLE deadlines ADD COLUMN offset_days integer NULL;
  END IF;
END $$;

-- 2. Push subscriptions for Web Push notifications
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  endpoint text NOT NULL,
  p256dh text NOT NULL,
  auth text NOT NULL,
  user_agent text NULL,
  is_active boolean DEFAULT true,
  last_used_at timestamptz NULL,
  created_at timestamptz DEFAULT now(),
  UNIQUE(user_id, endpoint)
);

-- Index for finding active subscriptions
CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user_active ON push_subscriptions(user_id, is_active) WHERE is_active = true;

-- Enable RLS
ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;

-- RLS policies for push_subscriptions
DROP POLICY IF EXISTS "Users manage own push subscriptions" ON push_subscriptions;
CREATE POLICY "Users manage own push subscriptions" ON push_subscriptions FOR ALL USING (auth.uid() = user_id);

-- 3. Notification settings per user
CREATE TABLE IF NOT EXISTS notification_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,

  -- Category toggles
  tax_deadlines_enabled boolean DEFAULT true,
  invoice_reminders_enabled boolean DEFAULT true,
  campaign_deadlines_enabled boolean DEFAULT true,

  -- Quiet hours (no notifications during this time)
  quiet_start time DEFAULT '21:00',
  quiet_end time DEFAULT '08:00',

  -- Notification preferences
  email_enabled boolean DEFAULT true,
  push_enabled boolean DEFAULT true,

  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),

  UNIQUE(user_id)
);

-- Enable RLS
ALTER TABLE notification_settings ENABLE ROW LEVEL SECURITY;

-- RLS policies for notification_settings
DROP POLICY IF EXISTS "Users manage own notification settings" ON notification_settings;
CREATE POLICY "Users manage own notification settings" ON notification_settings FOR ALL USING (auth.uid() = user_id);

-- Add trigger for updated_at
CREATE OR REPLACE FUNCTION update_notification_settings_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_notification_settings_updated_at ON notification_settings;
CREATE TRIGGER update_notification_settings_updated_at
  BEFORE UPDATE ON notification_settings
  FOR EACH ROW
  EXECUTE PROCEDURE update_notification_settings_updated_at();

-- 4. Calendar feeds for Apple Calendar / Google Calendar sync
CREATE TABLE IF NOT EXISTS calendar_feeds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,

  -- Unique token for feed URL (acts as authentication)
  feed_token uuid DEFAULT gen_random_uuid() UNIQUE,

  -- Feed status
  is_active boolean DEFAULT true,

  -- What to include in the feed
  include_tax_deadlines boolean DEFAULT true,
  include_invoices boolean DEFAULT true,
  include_campaigns boolean DEFAULT true,
  include_exclusivity boolean DEFAULT false, -- Avstängt som standard

  -- Tracking
  last_accessed_at timestamptz,
  access_count integer DEFAULT 0,

  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),

  UNIQUE(user_id)
);

-- Index for token lookup (no RLS, token is the auth mechanism)
CREATE INDEX IF NOT EXISTS idx_calendar_feeds_token ON calendar_feeds(feed_token) WHERE is_active = true;

-- NO RLS on calendar_feeds - the feed_token acts as authentication
-- This allows unauthenticated access via the token

-- Add trigger for updated_at
CREATE OR REPLACE FUNCTION update_calendar_feeds_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_calendar_feeds_updated_at ON calendar_feeds;
CREATE TRIGGER update_calendar_feeds_updated_at
  BEFORE UPDATE ON calendar_feeds
  FOR EACH ROW
  EXECUTE PROCEDURE update_calendar_feeds_updated_at();

-- 5. Notification log for tracking sent notifications (prevents duplicates)
CREATE TABLE IF NOT EXISTS notification_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,

  -- What triggered the notification
  notification_type text NOT NULL CHECK (notification_type IN (
    'tax_deadline', 'invoice_due', 'invoice_overdue', 'campaign_deadline'
  )),

  -- Reference to the source (deadline_id, invoice_id, etc.)
  reference_id uuid NOT NULL,

  -- Days before deadline when sent (for deduplication)
  days_before integer NOT NULL,

  -- Status
  sent_at timestamptz DEFAULT now(),
  delivery_status text DEFAULT 'sent' CHECK (delivery_status IN ('sent', 'delivered', 'failed')),

  -- Prevent duplicate notifications
  UNIQUE(user_id, notification_type, reference_id, days_before)
);

-- Index for checking recent notifications
CREATE INDEX IF NOT EXISTS idx_notification_log_user_type ON notification_log(user_id, notification_type, sent_at);

-- Enable RLS
ALTER TABLE notification_log ENABLE ROW LEVEL SECURITY;

-- RLS policy
DROP POLICY IF EXISTS "Users can view own notification log" ON notification_log;
CREATE POLICY "Users can view own notification log" ON notification_log FOR SELECT USING (auth.uid() = user_id);
