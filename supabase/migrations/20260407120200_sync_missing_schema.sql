-- Sync schema: add all columns and tables that were applied directly to production
-- but never captured in migration files. Uses IF NOT EXISTS throughout for idempotency.

-- =============================================================================
-- Missing columns on existing tables
-- =============================================================================

ALTER TABLE public.calendar_feeds
  ADD COLUMN IF NOT EXISTS token_version integer DEFAULT 1;

ALTER TABLE public.cost_centers
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS manager_name text,
  ADD COLUMN IF NOT EXISTS parent_id uuid,
  ADD COLUMN IF NOT EXISTS sort_order integer DEFAULT 0;

ALTER TABLE public.invoice_inbox_items
  ADD COLUMN IF NOT EXISTS raw_llm_response jsonb;

ALTER TABLE public.invoice_items
  ADD COLUMN IF NOT EXISTS vat_amount numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS vat_rate numeric NOT NULL DEFAULT 25;

ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS bankgiro_number text,
  ADD COLUMN IF NOT EXISTS is_recurring boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS ocr_number text,
  ADD COLUMN IF NOT EXISTS payment_type text,
  ADD COLUMN IF NOT EXISTS plusgiro_number text,
  ADD COLUMN IF NOT EXISTS recurring_invoice_id uuid;

ALTER TABLE public.journal_entry_lines
  ADD COLUMN IF NOT EXISTS cost_center_id uuid,
  ADD COLUMN IF NOT EXISTS project_id uuid;

ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS budget_amount numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS customer_id uuid,
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS project_number text,
  ADD COLUMN IF NOT EXISTS status text DEFAULT 'planning';

ALTER TABLE public.receipts
  ADD COLUMN IF NOT EXISTS email_from text,
  ADD COLUMN IF NOT EXISTS representation_business_connection text,
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'upload';

-- =============================================================================
-- Missing tables
-- =============================================================================

-- voucher_gap_explanations (BFNAR 2013:2 compliance)
CREATE TABLE IF NOT EXISTS public.voucher_gap_explanations (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id uuid NOT NULL REFERENCES public.companies ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  fiscal_period_id uuid NOT NULL REFERENCES public.fiscal_periods ON DELETE CASCADE,
  voucher_series text NOT NULL DEFAULT 'A',
  gap_start integer NOT NULL,
  gap_end integer NOT NULL,
  explanation text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.voucher_gap_explanations ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "voucher_gap_explanations_select" ON public.voucher_gap_explanations
    FOR SELECT USING (company_id IN (SELECT user_company_ids()));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE POLICY "voucher_gap_explanations_insert" ON public.voucher_gap_explanations
    FOR INSERT WITH CHECK (company_id IN (SELECT user_company_ids()));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE POLICY "voucher_gap_explanations_update" ON public.voucher_gap_explanations
    FOR UPDATE USING (company_id IN (SELECT user_company_ids()));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE POLICY "voucher_gap_explanations_delete" ON public.voucher_gap_explanations
    FOR DELETE USING (company_id IN (SELECT user_company_ids()));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DROP TRIGGER IF EXISTS voucher_gap_explanations_updated_at ON public.voucher_gap_explanations;
CREATE TRIGGER voucher_gap_explanations_updated_at
  BEFORE UPDATE ON public.voucher_gap_explanations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- automation_webhooks
CREATE TABLE IF NOT EXISTS public.automation_webhooks (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id uuid NOT NULL REFERENCES public.companies ON DELETE CASCADE,
  event_type text NOT NULL,
  webhook_url text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.automation_webhooks ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "automation_webhooks_select" ON public.automation_webhooks
    FOR SELECT USING (company_id IN (SELECT user_company_ids()));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE POLICY "automation_webhooks_insert" ON public.automation_webhooks
    FOR INSERT WITH CHECK (company_id IN (SELECT user_company_ids()));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE POLICY "automation_webhooks_update" ON public.automation_webhooks
    FOR UPDATE USING (company_id IN (SELECT user_company_ids()));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE POLICY "automation_webhooks_delete" ON public.automation_webhooks
    FOR DELETE USING (company_id IN (SELECT user_company_ids()));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DROP TRIGGER IF EXISTS automation_webhooks_updated_at ON public.automation_webhooks;
CREATE TRIGGER automation_webhooks_updated_at
  BEFORE UPDATE ON public.automation_webhooks
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- bankid_identities
CREATE TABLE IF NOT EXISTS public.bankid_identities (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  personal_number_hash text NOT NULL,
  personal_number_enc bytea NOT NULL,
  given_name text,
  surname text,
  linked_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.bankid_identities ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "bankid_identities_select" ON public.bankid_identities
    FOR SELECT USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE POLICY "bankid_identities_insert" ON public.bankid_identities
    FOR INSERT WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE POLICY "bankid_identities_update" ON public.bankid_identities
    FOR UPDATE USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DROP TRIGGER IF EXISTS bankid_identities_updated_at ON public.bankid_identities;
CREATE TRIGGER bankid_identities_updated_at
  BEFORE UPDATE ON public.bankid_identities
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- provider_connections
CREATE TABLE IF NOT EXISTS public.provider_connections (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  provider text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  provider_company_name text,
  error_message text,
  connected_at timestamptz,
  last_synced_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.provider_connections ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "provider_connections_select" ON public.provider_connections
    FOR SELECT USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE POLICY "provider_connections_insert" ON public.provider_connections
    FOR INSERT WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE POLICY "provider_connections_update" ON public.provider_connections
    FOR UPDATE USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE POLICY "provider_connections_delete" ON public.provider_connections
    FOR DELETE USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DROP TRIGGER IF EXISTS provider_connections_updated_at ON public.provider_connections;
CREATE TRIGGER provider_connections_updated_at
  BEFORE UPDATE ON public.provider_connections
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- provider_connection_tokens
CREATE TABLE IF NOT EXISTS public.provider_connection_tokens (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  connection_id uuid NOT NULL REFERENCES public.provider_connections ON DELETE CASCADE,
  access_token text NOT NULL,
  refresh_token text,
  token_expires_at timestamptz,
  provider_company_id text,
  extra_data jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.provider_connection_tokens ENABLE ROW LEVEL SECURITY;
DROP TRIGGER IF EXISTS provider_connection_tokens_updated_at ON public.provider_connection_tokens;
CREATE TRIGGER provider_connection_tokens_updated_at
  BEFORE UPDATE ON public.provider_connection_tokens
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- provider_oauth_states
CREATE TABLE IF NOT EXISTS public.provider_oauth_states (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  provider text NOT NULL,
  csrf_token text NOT NULL,
  connection_id uuid NOT NULL REFERENCES public.provider_connections ON DELETE CASCADE,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '10 minutes'),
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.provider_oauth_states ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "provider_oauth_states_select" ON public.provider_oauth_states
    FOR SELECT USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE POLICY "provider_oauth_states_insert" ON public.provider_oauth_states
    FOR INSERT WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE POLICY "provider_oauth_states_delete" ON public.provider_oauth_states
    FOR DELETE USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- provider_sync_data
CREATE TABLE IF NOT EXISTS public.provider_sync_data (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  connection_id uuid NOT NULL REFERENCES public.provider_connections ON DELETE CASCADE,
  provider text NOT NULL,
  resource_type text NOT NULL,
  data jsonb NOT NULL DEFAULT '[]'::jsonb,
  record_count integer NOT NULL DEFAULT 0,
  synced_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.provider_sync_data ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "provider_sync_data_select" ON public.provider_sync_data
    FOR SELECT USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE POLICY "provider_sync_data_insert" ON public.provider_sync_data
    FOR INSERT WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE POLICY "provider_sync_data_update" ON public.provider_sync_data
    FOR UPDATE USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DROP TRIGGER IF EXISTS provider_sync_data_updated_at ON public.provider_sync_data;
CREATE TRIGGER provider_sync_data_updated_at
  BEFORE UPDATE ON public.provider_sync_data
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- email_connections
CREATE TABLE IF NOT EXISTS public.email_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  provider text NOT NULL DEFAULT 'gmail',
  email_address text NOT NULL,
  encrypted_token text NOT NULL,
  last_sync_at timestamptz,
  gmail_label_id text,
  status text NOT NULL DEFAULT 'active',
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.email_connections ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "email_connections_select" ON public.email_connections
    FOR SELECT USING (company_id IN (SELECT user_company_ids()));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE POLICY "email_connections_insert" ON public.email_connections
    FOR INSERT WITH CHECK (company_id IN (SELECT user_company_ids()));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE POLICY "email_connections_update" ON public.email_connections
    FOR UPDATE USING (company_id IN (SELECT user_company_ids()));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE POLICY "email_connections_delete" ON public.email_connections
    FOR DELETE USING (company_id IN (SELECT user_company_ids()));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DROP TRIGGER IF EXISTS email_connections_updated_at ON public.email_connections;
CREATE TRIGGER email_connections_updated_at
  BEFORE UPDATE ON public.email_connections
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =============================================================================
-- Missing functions
-- =============================================================================

-- commit_journal_entry — atomic voucher assignment (critical for bookkeeping)
CREATE OR REPLACE FUNCTION public.commit_journal_entry(p_company_id uuid, p_entry_id uuid)
 RETURNS TABLE(voucher_number integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_next integer;
  v_fiscal_period_id uuid;
  v_series text;
BEGIN
  SELECT je.fiscal_period_id, COALESCE(je.voucher_series, 'A')
  INTO v_fiscal_period_id, v_series
  FROM public.journal_entries je
  WHERE je.id = p_entry_id
    AND je.company_id = p_company_id
    AND je.status = 'draft'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Draft journal entry not found: %', p_entry_id;
  END IF;

  INSERT INTO public.voucher_sequences (company_id, user_id, fiscal_period_id, voucher_series, last_number)
  VALUES (p_company_id, auth.uid(), v_fiscal_period_id, v_series, 1)
  ON CONFLICT (company_id, fiscal_period_id, voucher_series)
  DO UPDATE SET
    last_number = public.voucher_sequences.last_number + 1,
    updated_at = now()
  RETURNING last_number INTO v_next;

  UPDATE public.journal_entries
  SET voucher_number = v_next,
      status = 'posted'
  WHERE id = p_entry_id
    AND company_id = p_company_id;

  RETURN QUERY SELECT v_next;
END;
$function$;

-- release_voucher_range
CREATE OR REPLACE FUNCTION public.release_voucher_range(p_company_id uuid, p_fiscal_period_id uuid, p_series text, p_actual_last integer, p_reserved_highest integer)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  UPDATE public.voucher_sequences
  SET last_number = p_actual_last,
      updated_at = now()
  WHERE company_id = p_company_id
    AND fiscal_period_id = p_fiscal_period_id
    AND voucher_series = p_series
    AND last_number > p_actual_last
    AND last_number <= p_reserved_highest;
END;
$function$;

-- create_invoice_with_items
CREATE OR REPLACE FUNCTION public.create_invoice_with_items(p_invoice jsonb, p_items jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_invoice_id uuid;
  v_invoice_number integer;
  v_result jsonb;
BEGIN
  SELECT COALESCE(MAX(invoice_number::integer), 0) + 1
  INTO v_invoice_number
  FROM invoices
  WHERE user_id = (p_invoice->>'user_id')::uuid;

  INSERT INTO invoices (
    user_id, customer_id, invoice_number, invoice_date, due_date,
    status, currency, exchange_rate, exchange_rate_date,
    subtotal, vat_amount, total,
    subtotal_sek, vat_amount_sek, total_sek,
    vat_treatment, vat_rate, moms_ruta,
    your_reference, our_reference, notes,
    reverse_charge_text
  ) VALUES (
    (p_invoice->>'user_id')::uuid,
    (p_invoice->>'customer_id')::uuid,
    v_invoice_number::text,
    (p_invoice->>'invoice_date')::date,
    (p_invoice->>'due_date')::date,
    COALESCE(p_invoice->>'status', 'draft'),
    COALESCE(p_invoice->>'currency', 'SEK'),
    (p_invoice->>'exchange_rate')::numeric,
    (p_invoice->>'exchange_rate_date')::date,
    (p_invoice->>'subtotal')::numeric,
    (p_invoice->>'vat_amount')::numeric,
    (p_invoice->>'total')::numeric,
    (p_invoice->>'subtotal_sek')::numeric,
    (p_invoice->>'vat_amount_sek')::numeric,
    (p_invoice->>'total_sek')::numeric,
    p_invoice->>'vat_treatment',
    (p_invoice->>'vat_rate')::numeric,
    p_invoice->>'moms_ruta',
    p_invoice->>'your_reference',
    p_invoice->>'our_reference',
    p_invoice->>'notes',
    p_invoice->>'reverse_charge_text'
  ) RETURNING id INTO v_invoice_id;

  INSERT INTO invoice_items (invoice_id, sort_order, description, quantity, unit, unit_price, line_total)
  SELECT
    v_invoice_id,
    (item->>'sort_order')::integer,
    item->>'description',
    (item->>'quantity')::numeric,
    item->>'unit',
    (item->>'unit_price')::numeric,
    (item->>'line_total')::numeric
  FROM jsonb_array_elements(p_items) AS item;

  SELECT jsonb_build_object(
    'id', i.id,
    'invoice_number', i.invoice_number,
    'invoice_date', i.invoice_date,
    'due_date', i.due_date,
    'status', i.status,
    'currency', i.currency,
    'exchange_rate', i.exchange_rate,
    'subtotal', i.subtotal,
    'vat_amount', i.vat_amount,
    'total', i.total,
    'subtotal_sek', i.subtotal_sek,
    'vat_amount_sek', i.vat_amount_sek,
    'total_sek', i.total_sek,
    'vat_treatment', i.vat_treatment,
    'vat_rate', i.vat_rate,
    'moms_ruta', i.moms_ruta,
    'your_reference', i.your_reference,
    'our_reference', i.our_reference,
    'notes', i.notes,
    'reverse_charge_text', i.reverse_charge_text,
    'customer', jsonb_build_object('id', c.id, 'name', c.name),
    'items', (
      SELECT jsonb_agg(jsonb_build_object(
        'id', ii.id,
        'sort_order', ii.sort_order,
        'description', ii.description,
        'quantity', ii.quantity,
        'unit', ii.unit,
        'unit_price', ii.unit_price,
        'line_total', ii.line_total
      ) ORDER BY ii.sort_order)
      FROM invoice_items ii WHERE ii.invoice_id = v_invoice_id
    )
  )
  INTO v_result
  FROM invoices i
  LEFT JOIN customers c ON c.id = i.customer_id
  WHERE i.id = v_invoice_id;

  RETURN v_result;
END;
$function$;

-- seed_asset_categories
CREATE OR REPLACE FUNCTION public.seed_asset_categories(p_user_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if exists (select 1 from public.asset_categories where user_id = p_user_id) then
    return;
  end if;

  insert into public.asset_categories (user_id, code, name, asset_account, depreciation_account, expense_account, default_useful_life_months, default_depreciation_method, is_system)
  values
    (p_user_id, 'BYGGNADER',      'Byggnader',                '1110', '1119', '7820', 600, 'straight_line', true),
    (p_user_id, 'MASKINER',       'Maskiner och tekniska anläggningar', '1210', '1219', '7831', 60,  'straight_line', true),
    (p_user_id, 'INVENTARIER',    'Inventarier',              '1220', '1229', '7832', 60,  'straight_line', true),
    (p_user_id, 'FORDON',         'Fordon',                   '1240', '1249', '7834', 60,  'straight_line', true),
    (p_user_id, 'DATORER',        'Datorer och IT-utrustning','1250', '1259', '7833', 36,  'straight_line', true),
    (p_user_id, 'IMMATERIELLA',   'Immateriella tillgångar',  '1010', '1019', '7810', 60,  'straight_line', true);
end;
$function$;

-- update_reconciliation_session_counts (trigger function)
CREATE OR REPLACE FUNCTION public.update_reconciliation_session_counts()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  update public.bank_reconciliation_sessions
  set
    matched_count = (
      select count(*) from public.bank_reconciliation_items
      where session_id = coalesce(new.session_id, old.session_id)
        and is_reconciled = true
    ),
    unmatched_count = (
      select count(*) from public.bank_reconciliation_items
      where session_id = coalesce(new.session_id, old.session_id)
        and is_reconciled = false
    ),
    total_transactions = (
      select count(*) from public.bank_reconciliation_items
      where session_id = coalesce(new.session_id, old.session_id)
    )
  where id = coalesce(new.session_id, old.session_id);

  return coalesce(new, old);
end;
$function$;
