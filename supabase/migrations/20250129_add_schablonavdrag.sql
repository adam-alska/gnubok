-- Add schablonavdrag settings to company_settings
-- hemmakontor_housing_type: 'villa' = 2000 kr/year, 'apartment' = 4000 kr/year
ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS
  schablonavdrag_settings jsonb DEFAULT '{"hemmakontor_enabled": false, "hemmakontor_housing_type": "apartment", "bil_enabled": false}';

-- Create mileage entries table for bil schablonavdrag
-- Rate: 25 kr/mil = 2.50 kr/km
CREATE TABLE IF NOT EXISTS mileage_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users NOT NULL,
  date date NOT NULL,
  distance_km decimal(10,2) NOT NULL,
  purpose text NOT NULL,
  from_location text,
  to_location text,
  rate_per_km decimal(5,2) DEFAULT 2.50,
  total_deduction decimal(10,2) GENERATED ALWAYS AS (distance_km * rate_per_km) STORED,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Add indexes
CREATE INDEX IF NOT EXISTS idx_mileage_entries_user_id ON mileage_entries(user_id);
CREATE INDEX IF NOT EXISTS idx_mileage_entries_date ON mileage_entries(date);
CREATE INDEX IF NOT EXISTS idx_mileage_entries_user_date ON mileage_entries(user_id, date);

-- Enable RLS
ALTER TABLE mileage_entries ENABLE ROW LEVEL SECURITY;

-- RLS policies for mileage_entries
CREATE POLICY "Users can view their own mileage entries"
  ON mileage_entries FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own mileage entries"
  ON mileage_entries FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own mileage entries"
  ON mileage_entries FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own mileage entries"
  ON mileage_entries FOR DELETE
  USING (auth.uid() = user_id);

-- Add trigger for updated_at
CREATE OR REPLACE FUNCTION update_mileage_entries_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_mileage_entries_updated_at ON mileage_entries;
CREATE TRIGGER update_mileage_entries_updated_at
  BEFORE UPDATE ON mileage_entries
  FOR EACH ROW
  EXECUTE PROCEDURE update_mileage_entries_updated_at();
