-- SIE Import Tracking
-- Stores metadata about SIE file imports for audit trail and duplicate detection

CREATE TABLE sie_imports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,

  -- File info
  filename TEXT NOT NULL,
  file_hash TEXT NOT NULL,  -- SHA-256 hash for duplicate detection

  -- Company info from SIE file
  org_number TEXT,
  company_name TEXT,

  -- SIE metadata
  sie_type INTEGER NOT NULL,  -- 1, 2, 3, or 4
  fiscal_year_start DATE,
  fiscal_year_end DATE,

  -- Import statistics
  accounts_count INTEGER DEFAULT 0,
  transactions_count INTEGER DEFAULT 0,
  opening_balance_total DECIMAL(15,2),

  -- Status tracking
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'mapped', 'completed', 'failed')),
  error_message TEXT,

  -- Import result references
  fiscal_period_id UUID REFERENCES fiscal_periods(id),
  opening_balance_entry_id UUID REFERENCES journal_entries(id),

  -- Timestamps
  imported_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for duplicate detection
CREATE INDEX idx_sie_imports_user_hash ON sie_imports(user_id, file_hash);
CREATE INDEX idx_sie_imports_user_status ON sie_imports(user_id, status);

-- Row Level Security
ALTER TABLE sie_imports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own imports"
  ON sie_imports FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own imports"
  ON sie_imports FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own imports"
  ON sie_imports FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own imports"
  ON sie_imports FOR DELETE
  USING (auth.uid() = user_id);

-- Trigger for updated_at
CREATE TRIGGER update_sie_imports_updated_at
  BEFORE UPDATE ON sie_imports
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();


-- Account Mappings
-- Stores user overrides for account mapping during SIE import

CREATE TABLE sie_account_mappings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,

  -- Source account (from SIE file)
  source_account TEXT NOT NULL,
  source_name TEXT,

  -- Target account (in our system)
  target_account TEXT NOT NULL,

  -- Mapping quality
  confidence DECIMAL(3,2) DEFAULT 1.0 CHECK (confidence >= 0 AND confidence <= 1),
  match_type TEXT DEFAULT 'manual' CHECK (match_type IN ('exact', 'name', 'class', 'manual')),

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- One mapping per source account per user
  UNIQUE(user_id, source_account)
);

-- Index for lookups
CREATE INDEX idx_sie_account_mappings_user ON sie_account_mappings(user_id);

-- Row Level Security
ALTER TABLE sie_account_mappings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own mappings"
  ON sie_account_mappings FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own mappings"
  ON sie_account_mappings FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own mappings"
  ON sie_account_mappings FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own mappings"
  ON sie_account_mappings FOR DELETE
  USING (auth.uid() = user_id);

-- Trigger for updated_at
CREATE TRIGGER update_sie_account_mappings_updated_at
  BEFORE UPDATE ON sie_account_mappings
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
