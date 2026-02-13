-- Create invoice_reminders table for tracking payment reminders
-- Part of the email invoicing and automated payment reminders feature

CREATE TABLE IF NOT EXISTS invoice_reminders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid REFERENCES invoices(id) ON DELETE CASCADE NOT NULL,
  user_id uuid REFERENCES auth.users NOT NULL,

  -- Reminder level (1 = 15 days, 2 = 30 days, 3 = 45 days)
  reminder_level integer NOT NULL CHECK (reminder_level IN (1, 2, 3)),

  -- When and where sent
  sent_at timestamptz NOT NULL DEFAULT now(),
  email_to text NOT NULL,

  -- Customer response tracking
  response_type text NULL CHECK (response_type IS NULL OR response_type IN ('marked_paid', 'disputed')),
  response_at timestamptz NULL,

  -- Action token for customer links (allows marking as paid without auth)
  action_token uuid UNIQUE DEFAULT gen_random_uuid(),
  action_token_used boolean DEFAULT false,

  -- Timestamps
  created_at timestamptz DEFAULT now()
);

-- Indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_invoice_reminders_invoice_id ON invoice_reminders(invoice_id);
CREATE INDEX IF NOT EXISTS idx_invoice_reminders_user_id ON invoice_reminders(user_id);
CREATE INDEX IF NOT EXISTS idx_invoice_reminders_action_token ON invoice_reminders(action_token);
CREATE INDEX IF NOT EXISTS idx_invoice_reminders_user_sent ON invoice_reminders(user_id, sent_at DESC);

-- Enable RLS
ALTER TABLE invoice_reminders ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Users can view own reminders"
  ON invoice_reminders FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own reminders"
  ON invoice_reminders FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own reminders"
  ON invoice_reminders FOR UPDATE
  USING (auth.uid() = user_id);

-- Allow public access for action token validation (customer response)
CREATE POLICY "Anyone can view reminder by action token"
  ON invoice_reminders FOR SELECT
  USING (action_token IS NOT NULL);

-- Add sent_at column to invoices table for tracking when invoice was emailed
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'invoices' AND column_name = 'sent_at'
  ) THEN
    ALTER TABLE invoices ADD COLUMN sent_at timestamptz NULL;
  END IF;
END $$;

-- Add email column to company_settings for reply-to address
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'company_settings' AND column_name = 'email'
  ) THEN
    ALTER TABLE company_settings ADD COLUMN email text NULL;
  END IF;
END $$;
