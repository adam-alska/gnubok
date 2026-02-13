-- Create deadlines table for calendar/planner module
-- Tracks deliveries, invoicing deadlines, reports, and other important dates

CREATE TABLE IF NOT EXISTS deadlines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users NOT NULL,

  -- Core fields
  title text NOT NULL,
  due_date date NOT NULL,
  due_time time NULL,

  -- Type and priority
  deadline_type text NOT NULL CHECK (deadline_type IN (
    'delivery', 'invoicing', 'report', 'approval', 'other'
  )),
  priority text NOT NULL DEFAULT 'normal' CHECK (priority IN (
    'critical', 'important', 'normal'
  )),

  -- Completion status
  is_completed boolean NOT NULL DEFAULT false,
  completed_at timestamptz NULL,

  -- Optional customer link
  customer_id uuid REFERENCES customers(id) ON DELETE SET NULL,

  -- Notes
  notes text NULL,

  -- Timestamps
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Add indexes for common queries
CREATE INDEX IF NOT EXISTS idx_deadlines_user_id ON deadlines(user_id);
CREATE INDEX IF NOT EXISTS idx_deadlines_due_date ON deadlines(due_date);
CREATE INDEX IF NOT EXISTS idx_deadlines_user_due_date ON deadlines(user_id, due_date);
CREATE INDEX IF NOT EXISTS idx_deadlines_user_completed ON deadlines(user_id, is_completed);
CREATE INDEX IF NOT EXISTS idx_deadlines_customer_id ON deadlines(customer_id);

-- Enable RLS
ALTER TABLE deadlines ENABLE ROW LEVEL SECURITY;

-- RLS policies for deadlines
CREATE POLICY "Users can view their own deadlines"
  ON deadlines FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own deadlines"
  ON deadlines FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own deadlines"
  ON deadlines FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own deadlines"
  ON deadlines FOR DELETE
  USING (auth.uid() = user_id);

-- Add trigger for updated_at
CREATE OR REPLACE FUNCTION update_deadlines_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_deadlines_updated_at ON deadlines;
CREATE TRIGGER update_deadlines_updated_at
  BEFORE UPDATE ON deadlines
  FOR EACH ROW
  EXECUTE PROCEDURE update_deadlines_updated_at();
