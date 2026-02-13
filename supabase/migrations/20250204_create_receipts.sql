-- ============================================================
-- Receipt Photo Capture System
-- ============================================================

-- Receipts table: stores uploaded receipt images and extraction data
CREATE TABLE IF NOT EXISTS receipts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,

  -- Image storage
  image_url TEXT NOT NULL,
  image_thumbnail_url TEXT,

  -- Extraction status
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'extracted', 'confirmed', 'error')),
  extraction_confidence DECIMAL(3,2) CHECK (extraction_confidence >= 0 AND extraction_confidence <= 1),

  -- Extracted header data
  merchant_name TEXT,
  merchant_org_number TEXT,
  merchant_vat_number TEXT,
  receipt_date DATE,
  receipt_time TIME,
  total_amount DECIMAL(12,2),
  currency TEXT DEFAULT 'SEK',
  vat_amount DECIMAL(12,2),

  -- Special flags
  is_restaurant BOOLEAN DEFAULT FALSE,
  is_systembolaget BOOLEAN DEFAULT FALSE,
  is_foreign_merchant BOOLEAN DEFAULT FALSE,

  -- Restaurant representation data
  representation_persons INTEGER,
  representation_purpose TEXT,

  -- Transaction matching
  matched_transaction_id UUID REFERENCES transactions(id) ON DELETE SET NULL,
  match_confidence DECIMAL(3,2) CHECK (match_confidence >= 0 AND match_confidence <= 1),

  -- Raw extraction data (for debugging)
  raw_extraction JSONB,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Receipt line items table
CREATE TABLE IF NOT EXISTS receipt_line_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  receipt_id UUID NOT NULL REFERENCES receipts(id) ON DELETE CASCADE,

  -- Extracted data
  description TEXT NOT NULL,
  quantity DECIMAL(10,3) DEFAULT 1,
  unit_price DECIMAL(12,2),
  line_total DECIMAL(12,2) NOT NULL,
  vat_rate DECIMAL(5,2),
  vat_amount DECIMAL(12,2),

  -- Classification
  is_business BOOLEAN, -- null = unclassified
  category TEXT, -- expense category if business
  bas_account TEXT,

  -- Confidence
  extraction_confidence DECIMAL(3,2) CHECK (extraction_confidence >= 0 AND extraction_confidence <= 1),
  suggested_category TEXT, -- AI suggestion

  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_receipts_user_id ON receipts(user_id);
CREATE INDEX IF NOT EXISTS idx_receipts_status ON receipts(status);
CREATE INDEX IF NOT EXISTS idx_receipts_matched_transaction_id ON receipts(matched_transaction_id);
CREATE INDEX IF NOT EXISTS idx_receipts_receipt_date ON receipts(receipt_date);
CREATE INDEX IF NOT EXISTS idx_receipt_line_items_receipt_id ON receipt_line_items(receipt_id);

-- Add receipt_id column to transactions for reverse lookup
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS receipt_id UUID REFERENCES receipts(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_transactions_receipt_id ON transactions(receipt_id);

-- Enable RLS
ALTER TABLE receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE receipt_line_items ENABLE ROW LEVEL SECURITY;

-- RLS policies for receipts
DROP POLICY IF EXISTS "Users can view their own receipts" ON receipts;
CREATE POLICY "Users can view their own receipts"
  ON receipts FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert their own receipts" ON receipts;
CREATE POLICY "Users can insert their own receipts"
  ON receipts FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own receipts" ON receipts;
CREATE POLICY "Users can update their own receipts"
  ON receipts FOR UPDATE
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete their own receipts" ON receipts;
CREATE POLICY "Users can delete their own receipts"
  ON receipts FOR DELETE
  USING (auth.uid() = user_id);

-- RLS policies for receipt_line_items (based on receipt ownership)
DROP POLICY IF EXISTS "Users can view their receipt line items" ON receipt_line_items;
CREATE POLICY "Users can view their receipt line items"
  ON receipt_line_items FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM receipts WHERE receipts.id = receipt_line_items.receipt_id AND receipts.user_id = auth.uid()
  ));

DROP POLICY IF EXISTS "Users can insert their receipt line items" ON receipt_line_items;
CREATE POLICY "Users can insert their receipt line items"
  ON receipt_line_items FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM receipts WHERE receipts.id = receipt_line_items.receipt_id AND receipts.user_id = auth.uid()
  ));

DROP POLICY IF EXISTS "Users can update their receipt line items" ON receipt_line_items;
CREATE POLICY "Users can update their receipt line items"
  ON receipt_line_items FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM receipts WHERE receipts.id = receipt_line_items.receipt_id AND receipts.user_id = auth.uid()
  ));

DROP POLICY IF EXISTS "Users can delete their receipt line items" ON receipt_line_items;
CREATE POLICY "Users can delete their receipt line items"
  ON receipt_line_items FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM receipts WHERE receipts.id = receipt_line_items.receipt_id AND receipts.user_id = auth.uid()
  ));

-- Trigger for updated_at (if the function exists)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'update_updated_at_column') THEN
    DROP TRIGGER IF EXISTS update_receipts_updated_at ON receipts;
    CREATE TRIGGER update_receipts_updated_at
      BEFORE UPDATE ON receipts
      FOR EACH ROW
      EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;

-- Create storage bucket for receipt images (if not exists)
INSERT INTO storage.buckets (id, name, public)
VALUES ('receipts', 'receipts', false)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for receipts bucket
DROP POLICY IF EXISTS "Users can upload receipt images" ON storage.objects;
CREATE POLICY "Users can upload receipt images"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'receipts' AND
    auth.uid()::text = (storage.foldername(name))[1]
  );

DROP POLICY IF EXISTS "Users can view their receipt images" ON storage.objects;
CREATE POLICY "Users can view their receipt images"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'receipts' AND
    auth.uid()::text = (storage.foldername(name))[1]
  );

DROP POLICY IF EXISTS "Users can delete their receipt images" ON storage.objects;
CREATE POLICY "Users can delete their receipt images"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'receipts' AND
    auth.uid()::text = (storage.foldername(name))[1]
  );
