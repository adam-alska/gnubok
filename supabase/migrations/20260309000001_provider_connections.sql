-- Provider connections for accounting system integrations
-- (Fortnox, Visma, Briox, Bokio, Björn Lundén)

-- 1. Main connections table
CREATE TABLE provider_connections (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users ON DELETE CASCADE NOT NULL,
  provider TEXT NOT NULL CHECK (provider IN ('fortnox', 'visma', 'briox', 'bokio', 'bjorn_lunden')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'expired', 'error', 'revoked')),
  provider_company_name TEXT,
  error_message TEXT,
  connected_at TIMESTAMPTZ,
  last_synced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Only one active/pending/expired/error connection per provider per user
CREATE UNIQUE INDEX idx_provider_connections_active
  ON provider_connections (user_id, provider)
  WHERE status != 'revoked';

ALTER TABLE provider_connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own connections"
  ON provider_connections FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own connections"
  ON provider_connections FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own connections"
  ON provider_connections FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own connections"
  ON provider_connections FOR DELETE
  USING (auth.uid() = user_id);

CREATE TRIGGER set_provider_connections_updated_at
  BEFORE UPDATE ON provider_connections
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 2. Token storage (service role only — never exposed to client)
CREATE TABLE provider_connection_tokens (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  connection_id UUID REFERENCES provider_connections ON DELETE CASCADE NOT NULL,
  access_token TEXT NOT NULL,
  refresh_token TEXT,
  token_expires_at TIMESTAMPTZ,
  provider_company_id TEXT,
  extra_data JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX idx_provider_connection_tokens_connection
  ON provider_connection_tokens (connection_id);

-- RLS disabled — only accessed server-side via service role client
-- The anon key has no reason to query these tables, and the service client
-- inherits the user JWT from cookies which conflicts with RLS policies.

CREATE TRIGGER set_provider_connection_tokens_updated_at
  BEFORE UPDATE ON provider_connection_tokens
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 3. OAuth state for CSRF protection
CREATE TABLE provider_oauth_states (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users ON DELETE CASCADE NOT NULL,
  provider TEXT NOT NULL CHECK (provider IN ('fortnox', 'visma')),
  csrf_token TEXT NOT NULL,
  connection_id UUID REFERENCES provider_connections ON DELETE CASCADE NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '10 minutes'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RLS disabled — only accessed server-side via service role client
