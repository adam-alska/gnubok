-- Create gifts table for benefits/gifts module (Förmånshantering)
-- Tracks PR products, gifted collabs, and equipment that may be taxable income

CREATE TABLE IF NOT EXISTS gifts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users NOT NULL,
  date date NOT NULL,
  brand_name text NOT NULL,
  description text NOT NULL,
  estimated_value decimal(12,2) NOT NULL,

  -- Decision tree inputs
  has_motprestation boolean NOT NULL DEFAULT false,  -- Required post/video/mention?
  used_in_business boolean NOT NULL DEFAULT false,   -- Used as props/equipment?
  used_privately boolean NOT NULL DEFAULT false,     -- Personal use?
  is_simple_promo boolean DEFAULT false,             -- Pen, mug, basic merch?

  -- Classification result (computed by application)
  classification jsonb NOT NULL DEFAULT '{}',
  -- Structure: { taxable, deductibleAsExpense, bookingType, reasoning }

  -- Bookkeeping link
  journal_entry_id uuid REFERENCES journal_entries(id),

  -- Timestamps
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Add indexes for common queries
CREATE INDEX IF NOT EXISTS idx_gifts_user_id ON gifts(user_id);
CREATE INDEX IF NOT EXISTS idx_gifts_date ON gifts(date);
CREATE INDEX IF NOT EXISTS idx_gifts_user_date ON gifts(user_id, date);
CREATE INDEX IF NOT EXISTS idx_gifts_user_year ON gifts(user_id, EXTRACT(YEAR FROM date));

-- Enable RLS
ALTER TABLE gifts ENABLE ROW LEVEL SECURITY;

-- RLS policies for gifts
CREATE POLICY "Users can view their own gifts"
  ON gifts FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own gifts"
  ON gifts FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own gifts"
  ON gifts FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own gifts"
  ON gifts FOR DELETE
  USING (auth.uid() = user_id);

-- Add trigger for updated_at
CREATE OR REPLACE FUNCTION update_gifts_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_gifts_updated_at ON gifts;
CREATE TRIGGER update_gifts_updated_at
  BEFORE UPDATE ON gifts
  FOR EACH ROW
  EXECUTE PROCEDURE update_gifts_updated_at();
