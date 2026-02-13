-- Create briefings table for storing campaign briefing materials
-- Supports three types: PDF files, links (Canva, Google Docs, etc.), and raw text

-- ============================================================
-- NEW TABLE: briefings
-- ============================================================

CREATE TABLE IF NOT EXISTS briefings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid REFERENCES campaigns(id) ON DELETE CASCADE NOT NULL,
  user_id uuid REFERENCES auth.users NOT NULL,

  -- Type of briefing material
  briefing_type text NOT NULL CHECK (briefing_type IN ('pdf', 'link', 'text')),

  -- Title/name
  title text NOT NULL,

  -- Content based on type:
  -- For 'pdf': file path in Supabase Storage
  -- For 'link': URL to external resource
  -- For 'text': NULL (use text_content instead)
  content text NULL,

  -- For 'text' type: the actual text content
  text_content text NULL,

  -- PDF metadata (only for 'pdf' type)
  filename text NULL,
  file_size integer NULL, -- bytes
  mime_type text NULL,

  -- Optional notes
  notes text NULL,

  -- Timestamps
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Indexes for briefings
CREATE INDEX IF NOT EXISTS idx_briefings_user_id ON briefings(user_id);
CREATE INDEX IF NOT EXISTS idx_briefings_campaign_id ON briefings(campaign_id);
CREATE INDEX IF NOT EXISTS idx_briefings_type ON briefings(briefing_type);
CREATE INDEX IF NOT EXISTS idx_briefings_user_campaign ON briefings(user_id, campaign_id);

-- Enable RLS for briefings
ALTER TABLE briefings ENABLE ROW LEVEL SECURITY;

-- RLS policies for briefings
CREATE POLICY "Users can view their own briefings"
  ON briefings FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own briefings"
  ON briefings FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own briefings"
  ON briefings FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own briefings"
  ON briefings FOR DELETE
  USING (auth.uid() = user_id);

-- ============================================================
-- TRIGGER for updated_at
-- ============================================================

CREATE OR REPLACE FUNCTION update_briefings_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_briefings_updated_at ON briefings;
CREATE TRIGGER update_briefings_updated_at
  BEFORE UPDATE ON briefings
  FOR EACH ROW
  EXECUTE PROCEDURE update_briefings_updated_at();
