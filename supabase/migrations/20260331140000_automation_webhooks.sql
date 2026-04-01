-- Automation webhook subscriptions
-- Links gnubok events to Activepieces flow webhook URLs.
-- One subscription per company per event type.

CREATE TABLE automation_webhooks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE NOT NULL,
  event_type TEXT NOT NULL,
  webhook_url TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (company_id, event_type)
);

-- RLS
ALTER TABLE automation_webhooks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view company webhooks"
  ON automation_webhooks FOR SELECT
  USING (company_id IN (
    SELECT company_id FROM company_members WHERE user_id = auth.uid()
  ));

CREATE POLICY "Members can insert company webhooks"
  ON automation_webhooks FOR INSERT
  WITH CHECK (company_id IN (
    SELECT company_id FROM company_members WHERE user_id = auth.uid()
  ));

CREATE POLICY "Members can update company webhooks"
  ON automation_webhooks FOR UPDATE
  USING (company_id IN (
    SELECT company_id FROM company_members WHERE user_id = auth.uid()
  ));

CREATE POLICY "Members can delete company webhooks"
  ON automation_webhooks FOR DELETE
  USING (company_id IN (
    SELECT company_id FROM company_members WHERE user_id = auth.uid()
  ));

-- updated_at trigger
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON automation_webhooks
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Index for event forwarding lookups
CREATE INDEX idx_automation_webhooks_company_event
  ON automation_webhooks (company_id, event_type)
  WHERE active = true;
