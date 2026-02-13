-- Create campaigns and related tables for influencer contract/campaign management
-- This migration creates: campaigns, deliverables, exclusivities, contracts
-- and extends: customers, invoices, deadlines

-- ============================================================
-- ENUMS (using CHECK constraints for compatibility)
-- ============================================================

-- Campaign status enum values:
-- negotiation: Under negotiation/discussion
-- contracted: Contract signed, not yet started
-- active: Currently running
-- delivered: All deliverables completed
-- invoiced: Invoice sent
-- completed: Fully paid and closed
-- cancelled: Cancelled/terminated

-- Campaign type enum values:
-- influencer: Standard influencer campaign
-- ugc: User-generated content only
-- ambassador: Long-term ambassador deal

-- Deliverable type enum values:
-- video: Video content (YouTube, TikTok video)
-- image: Static image/photo
-- story: Instagram/TikTok story
-- reel: Instagram/TikTok reel
-- post: Feed post
-- raw_material: Raw content files for brand use

-- Deliverable status enum values:
-- pending: Not started
-- in_progress: Being worked on
-- submitted: Submitted for review
-- revision: Needs revisions
-- approved: Approved by brand
-- published: Published/live

-- Platform type enum values:
-- instagram, tiktok, youtube, blog, podcast, other

-- ============================================================
-- NEW TABLE: campaigns
-- ============================================================

CREATE TABLE IF NOT EXISTS campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users NOT NULL,

  -- Customer relationships
  customer_id uuid REFERENCES customers(id) ON DELETE SET NULL,
  end_customer_id uuid REFERENCES customers(id) ON DELETE SET NULL, -- For agency-brand relationships

  -- Basic info
  name text NOT NULL,
  description text NULL,

  -- Status and type
  status text NOT NULL DEFAULT 'negotiation' CHECK (status IN (
    'negotiation', 'contracted', 'active', 'delivered', 'invoiced', 'completed', 'cancelled'
  )),
  campaign_type text NOT NULL DEFAULT 'influencer' CHECK (campaign_type IN (
    'influencer', 'ugc', 'ambassador'
  )),

  -- Financial
  total_value decimal(12,2) NULL,
  currency text NOT NULL DEFAULT 'SEK',
  vat_included boolean NOT NULL DEFAULT false,
  payment_terms integer NULL, -- Days
  billing_frequency text NULL CHECK (billing_frequency IS NULL OR billing_frequency IN (
    'upfront', 'on_delivery', 'monthly', 'split'
  )),

  -- Dates
  start_date date NULL,
  end_date date NULL,
  contract_signed_at timestamptz NULL,

  -- Notes
  notes text NULL,

  -- Timestamps
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Indexes for campaigns
CREATE INDEX IF NOT EXISTS idx_campaigns_user_id ON campaigns(user_id);
CREATE INDEX IF NOT EXISTS idx_campaigns_customer_id ON campaigns(customer_id);
CREATE INDEX IF NOT EXISTS idx_campaigns_status ON campaigns(status);
CREATE INDEX IF NOT EXISTS idx_campaigns_dates ON campaigns(start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_campaigns_user_status ON campaigns(user_id, status);

-- Enable RLS for campaigns
ALTER TABLE campaigns ENABLE ROW LEVEL SECURITY;

-- RLS policies for campaigns
CREATE POLICY "Users can view their own campaigns"
  ON campaigns FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own campaigns"
  ON campaigns FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own campaigns"
  ON campaigns FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own campaigns"
  ON campaigns FOR DELETE
  USING (auth.uid() = user_id);

-- ============================================================
-- NEW TABLE: deliverables
-- ============================================================

CREATE TABLE IF NOT EXISTS deliverables (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid REFERENCES campaigns(id) ON DELETE CASCADE NOT NULL,
  user_id uuid REFERENCES auth.users NOT NULL,

  -- Content details
  title text NOT NULL,
  deliverable_type text NOT NULL CHECK (deliverable_type IN (
    'video', 'image', 'story', 'reel', 'post', 'raw_material'
  )),
  platform text NOT NULL CHECK (platform IN (
    'instagram', 'tiktok', 'youtube', 'blog', 'podcast', 'other'
  )),
  account_handle text NULL, -- @handle or channel name

  -- Quantity and description
  quantity integer NOT NULL DEFAULT 1,
  description text NULL,
  specifications jsonb NULL DEFAULT '{}', -- Custom specs like length, format, etc.

  -- Dates
  due_date date NULL,

  -- Status tracking
  status text NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending', 'in_progress', 'submitted', 'revision', 'approved', 'published'
  )),
  submitted_at timestamptz NULL,
  approved_at timestamptz NULL,
  published_at timestamptz NULL,

  -- Notes
  notes text NULL,

  -- Timestamps
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Indexes for deliverables
CREATE INDEX IF NOT EXISTS idx_deliverables_user_id ON deliverables(user_id);
CREATE INDEX IF NOT EXISTS idx_deliverables_campaign_id ON deliverables(campaign_id);
CREATE INDEX IF NOT EXISTS idx_deliverables_status ON deliverables(status);
CREATE INDEX IF NOT EXISTS idx_deliverables_due_date ON deliverables(due_date);
CREATE INDEX IF NOT EXISTS idx_deliverables_user_due_date ON deliverables(user_id, due_date);

-- Enable RLS for deliverables
ALTER TABLE deliverables ENABLE ROW LEVEL SECURITY;

-- RLS policies for deliverables
CREATE POLICY "Users can view their own deliverables"
  ON deliverables FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own deliverables"
  ON deliverables FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own deliverables"
  ON deliverables FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own deliverables"
  ON deliverables FOR DELETE
  USING (auth.uid() = user_id);

-- ============================================================
-- NEW TABLE: exclusivities
-- ============================================================

CREATE TABLE IF NOT EXISTS exclusivities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid REFERENCES campaigns(id) ON DELETE CASCADE NOT NULL,
  user_id uuid REFERENCES auth.users NOT NULL,

  -- What is excluded
  categories text[] NOT NULL DEFAULT '{}', -- Product/industry categories
  excluded_brands text[] NULL DEFAULT '{}', -- Specific brand names

  -- Time period - absolute dates
  start_date date NOT NULL,
  end_date date NOT NULL,

  -- Date calculation metadata (for future relative date support)
  start_calculation_type text NOT NULL DEFAULT 'absolute' CHECK (start_calculation_type IN (
    'absolute', 'relative'
  )),
  end_calculation_type text NOT NULL DEFAULT 'absolute' CHECK (end_calculation_type IN (
    'absolute', 'relative'
  )),
  start_reference text NULL CHECK (start_reference IS NULL OR start_reference IN (
    'publication', 'delivery', 'approval', 'contract'
  )),
  end_reference text NULL CHECK (end_reference IS NULL OR end_reference IN (
    'publication', 'delivery', 'approval', 'contract'
  )),
  start_offset_days integer NULL,
  end_offset_days integer NULL,

  -- Notes
  notes text NULL,

  -- Timestamps
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Indexes for exclusivities
CREATE INDEX IF NOT EXISTS idx_exclusivities_user_id ON exclusivities(user_id);
CREATE INDEX IF NOT EXISTS idx_exclusivities_campaign_id ON exclusivities(campaign_id);
CREATE INDEX IF NOT EXISTS idx_exclusivities_dates ON exclusivities(start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_exclusivities_user_dates ON exclusivities(user_id, start_date, end_date);

-- Enable RLS for exclusivities
ALTER TABLE exclusivities ENABLE ROW LEVEL SECURITY;

-- RLS policies for exclusivities
CREATE POLICY "Users can view their own exclusivities"
  ON exclusivities FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own exclusivities"
  ON exclusivities FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own exclusivities"
  ON exclusivities FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own exclusivities"
  ON exclusivities FOR DELETE
  USING (auth.uid() = user_id);

-- ============================================================
-- NEW TABLE: contracts
-- ============================================================

CREATE TABLE IF NOT EXISTS contracts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid REFERENCES campaigns(id) ON DELETE CASCADE NULL, -- Nullable for import workflow
  user_id uuid REFERENCES auth.users NOT NULL,

  -- File info
  filename text NOT NULL,
  file_path text NOT NULL, -- Supabase Storage path
  file_size integer NULL, -- bytes
  mime_type text NULL,

  -- AI extraction (for future use)
  extracted_data jsonb NULL DEFAULT '{}',
  extraction_status text NOT NULL DEFAULT 'pending' CHECK (extraction_status IN (
    'pending', 'processing', 'completed', 'failed', 'skipped'
  )),

  -- Contract details
  signing_date date NULL,
  is_primary boolean NOT NULL DEFAULT false, -- Main contract vs amendments

  -- Notes
  notes text NULL,

  -- Timestamps
  uploaded_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Indexes for contracts
CREATE INDEX IF NOT EXISTS idx_contracts_user_id ON contracts(user_id);
CREATE INDEX IF NOT EXISTS idx_contracts_campaign_id ON contracts(campaign_id);

-- Enable RLS for contracts
ALTER TABLE contracts ENABLE ROW LEVEL SECURITY;

-- RLS policies for contracts
CREATE POLICY "Users can view their own contracts"
  ON contracts FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own contracts"
  ON contracts FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own contracts"
  ON contracts FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own contracts"
  ON contracts FOR DELETE
  USING (auth.uid() = user_id);

-- ============================================================
-- EXTEND TABLE: customers
-- ============================================================

-- Add customer_category column
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'customers' AND column_name = 'customer_category'
  ) THEN
    ALTER TABLE customers ADD COLUMN customer_category text NULL CHECK (
      customer_category IS NULL OR customer_category IN ('brand', 'agency', 'platform')
    );
  END IF;
END $$;

-- Add average_payment_days column
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'customers' AND column_name = 'average_payment_days'
  ) THEN
    ALTER TABLE customers ADD COLUMN average_payment_days integer NULL;
  END IF;
END $$;

-- ============================================================
-- EXTEND TABLE: invoices
-- ============================================================

-- Add campaign_id column
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'invoices' AND column_name = 'campaign_id'
  ) THEN
    ALTER TABLE invoices ADD COLUMN campaign_id uuid REFERENCES campaigns(id) ON DELETE SET NULL;
    CREATE INDEX IF NOT EXISTS idx_invoices_campaign_id ON invoices(campaign_id);
  END IF;
END $$;

-- Add payment_status column
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'invoices' AND column_name = 'payment_status'
  ) THEN
    ALTER TABLE invoices ADD COLUMN payment_status text NULL CHECK (
      payment_status IS NULL OR payment_status IN ('pending', 'paid', 'overdue', 'partial')
    );
  END IF;
END $$;

-- Add expected_payment_date column
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'invoices' AND column_name = 'expected_payment_date'
  ) THEN
    ALTER TABLE invoices ADD COLUMN expected_payment_date date NULL;
  END IF;
END $$;

-- Add actual_payment_date column
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'invoices' AND column_name = 'actual_payment_date'
  ) THEN
    ALTER TABLE invoices ADD COLUMN actual_payment_date date NULL;
  END IF;
END $$;

-- ============================================================
-- EXTEND TABLE: deadlines
-- ============================================================

-- Add campaign_id column
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'deadlines' AND column_name = 'campaign_id'
  ) THEN
    ALTER TABLE deadlines ADD COLUMN campaign_id uuid REFERENCES campaigns(id) ON DELETE SET NULL;
    CREATE INDEX IF NOT EXISTS idx_deadlines_campaign_id ON deadlines(campaign_id);
  END IF;
END $$;

-- Add deliverable_id column
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'deadlines' AND column_name = 'deliverable_id'
  ) THEN
    ALTER TABLE deadlines ADD COLUMN deliverable_id uuid REFERENCES deliverables(id) ON DELETE SET NULL;
    CREATE INDEX IF NOT EXISTS idx_deadlines_deliverable_id ON deadlines(deliverable_id);
  END IF;
END $$;

-- Add is_auto_generated column
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'deadlines' AND column_name = 'is_auto_generated'
  ) THEN
    ALTER TABLE deadlines ADD COLUMN is_auto_generated boolean NOT NULL DEFAULT false;
  END IF;
END $$;

-- Add date_calculation_type column
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'deadlines' AND column_name = 'date_calculation_type'
  ) THEN
    ALTER TABLE deadlines ADD COLUMN date_calculation_type text NULL CHECK (
      date_calculation_type IS NULL OR date_calculation_type IN ('absolute', 'relative')
    );
  END IF;
END $$;

-- Add reference_event column
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'deadlines' AND column_name = 'reference_event'
  ) THEN
    ALTER TABLE deadlines ADD COLUMN reference_event text NULL CHECK (
      reference_event IS NULL OR reference_event IN ('publication', 'delivery', 'approval', 'contract')
    );
  END IF;
END $$;

-- Add offset_days column
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'deadlines' AND column_name = 'offset_days'
  ) THEN
    ALTER TABLE deadlines ADD COLUMN offset_days integer NULL;
  END IF;
END $$;

-- Update deadline_type CHECK constraint to include new types
-- First, drop the old constraint and add new one
DO $$
BEGIN
  -- Drop old constraint if exists (ignore error if not exists)
  BEGIN
    ALTER TABLE deadlines DROP CONSTRAINT IF EXISTS deadlines_deadline_type_check;
  EXCEPTION WHEN OTHERS THEN
    -- Constraint might not exist or have different name
    NULL;
  END;

  -- Add new constraint with all types
  ALTER TABLE deadlines ADD CONSTRAINT deadlines_deadline_type_check CHECK (deadline_type IN (
    'delivery', 'approval', 'invoicing', 'report', 'revision', 'assets', 'spark_ad', 'statistics', 'other'
  ));
EXCEPTION WHEN OTHERS THEN
  -- If constraint already exists with correct values, ignore
  NULL;
END $$;

-- ============================================================
-- TRIGGERS for updated_at
-- ============================================================

-- Campaigns updated_at trigger
CREATE OR REPLACE FUNCTION update_campaigns_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_campaigns_updated_at ON campaigns;
CREATE TRIGGER update_campaigns_updated_at
  BEFORE UPDATE ON campaigns
  FOR EACH ROW
  EXECUTE PROCEDURE update_campaigns_updated_at();

-- Deliverables updated_at trigger
CREATE OR REPLACE FUNCTION update_deliverables_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_deliverables_updated_at ON deliverables;
CREATE TRIGGER update_deliverables_updated_at
  BEFORE UPDATE ON deliverables
  FOR EACH ROW
  EXECUTE PROCEDURE update_deliverables_updated_at();

-- Exclusivities updated_at trigger
CREATE OR REPLACE FUNCTION update_exclusivities_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_exclusivities_updated_at ON exclusivities;
CREATE TRIGGER update_exclusivities_updated_at
  BEFORE UPDATE ON exclusivities
  FOR EACH ROW
  EXECUTE PROCEDURE update_exclusivities_updated_at();

-- Contracts updated_at trigger
CREATE OR REPLACE FUNCTION update_contracts_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_contracts_updated_at ON contracts;
CREATE TRIGGER update_contracts_updated_at
  BEFORE UPDATE ON contracts
  FOR EACH ROW
  EXECUTE PROCEDURE update_contracts_updated_at();
