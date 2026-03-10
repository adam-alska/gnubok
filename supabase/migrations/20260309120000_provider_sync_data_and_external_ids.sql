-- Provider sync data storage and external ID columns for Fortnox multi-resource sync

-- 1. New table: provider_sync_data (stores raw JSON for unmapped Fortnox resources)
CREATE TABLE provider_sync_data (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users ON DELETE CASCADE NOT NULL,
  connection_id UUID REFERENCES provider_connections ON DELETE CASCADE NOT NULL,
  resource_type TEXT NOT NULL,
  provider TEXT NOT NULL CHECK (provider IN ('fortnox', 'visma', 'briox', 'bokio', 'bjorn_lunden')),
  data JSONB NOT NULL DEFAULT '[]',
  record_count INTEGER NOT NULL DEFAULT 0,
  synced_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Upsert-friendly unique index: one row per user+connection+resource_type
CREATE UNIQUE INDEX idx_provider_sync_data_upsert
  ON provider_sync_data (user_id, connection_id, resource_type);

ALTER TABLE provider_sync_data ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own sync data"
  ON provider_sync_data FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own sync data"
  ON provider_sync_data FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own sync data"
  ON provider_sync_data FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own sync data"
  ON provider_sync_data FOR DELETE
  USING (auth.uid() = user_id);

CREATE TRIGGER set_provider_sync_data_updated_at
  BEFORE UPDATE ON provider_sync_data
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 2. Add granted_scopes to provider_connection_tokens
ALTER TABLE provider_connection_tokens
  ADD COLUMN granted_scopes TEXT[] DEFAULT '{}';

-- 3. Add external_id + external_provider to customers
ALTER TABLE customers
  ADD COLUMN external_id TEXT,
  ADD COLUMN external_provider TEXT;

CREATE INDEX idx_customers_external
  ON customers (user_id, external_provider, external_id)
  WHERE external_id IS NOT NULL;

-- 4. Add external_id + external_provider to suppliers
ALTER TABLE suppliers
  ADD COLUMN external_id TEXT,
  ADD COLUMN external_provider TEXT;

CREATE INDEX idx_suppliers_external
  ON suppliers (user_id, external_provider, external_id)
  WHERE external_id IS NOT NULL;

-- 5. Add external_id + external_provider to invoices
ALTER TABLE invoices
  ADD COLUMN external_id TEXT,
  ADD COLUMN external_provider TEXT;

CREATE INDEX idx_invoices_external
  ON invoices (user_id, external_provider, external_id)
  WHERE external_id IS NOT NULL;

-- 6. Add external_id + external_provider to supplier_invoices
ALTER TABLE supplier_invoices
  ADD COLUMN external_id TEXT,
  ADD COLUMN external_provider TEXT;

CREATE INDEX idx_supplier_invoices_external
  ON supplier_invoices (user_id, external_provider, external_id)
  WHERE external_id IS NOT NULL;
