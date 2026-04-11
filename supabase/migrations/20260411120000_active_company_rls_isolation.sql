-- =============================================================================
-- Active-company tenant isolation in RLS
-- =============================================================================
--
-- Before this migration, company-scoped RLS policies allowed access to any
-- company the user was a MEMBER of. This meant that a user with multiple
-- memberships could see cross-company data leak into dropdowns and lists
-- via direct browser-client queries (e.g. /invoices/new customer dropdown),
-- because RLS only checked membership, not which company was active.
--
-- This migration replaces `company_id IN (SELECT user_company_ids())` with
-- `company_id = current_active_company_id()` on every company-scoped policy.
-- The helper function reads `user_preferences.active_company_id` with a
-- fallback to the user's first non-archived membership. It is STABLE +
-- SECURITY DEFINER so the result is cached per query plan and it bypasses
-- RLS on the user_preferences + company_members tables it reads from.
--
-- Tables NOT updated (they stay on user_company_ids() because they must be
-- visible across all companies the user is a member of, or use a different
-- auth model entirely):
--   companies, company_members, user_preferences, profiles
--   teams, team_members, team_invitations, company_invitations
--   provider_consent_tokens, provider_otc (consent-id scoped via team_members)
--   bankid_identities (user-scoped, not company-scoped)
--   storage.objects/sie-files bucket policies (different auth surface)
--
-- =============================================================================

-- =============================================================================
-- 1. current_active_company_id() helper
-- =============================================================================
CREATE OR REPLACE FUNCTION public.current_active_company_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    -- Active preference, validated against non-archived membership
    (
      SELECT up.active_company_id
      FROM public.user_preferences up
      JOIN public.company_members cm
        ON cm.user_id = up.user_id AND cm.company_id = up.active_company_id
      JOIN public.companies c
        ON c.id = cm.company_id AND c.archived_at IS NULL
      WHERE up.user_id = auth.uid()
    ),
    -- Fallback: first non-archived membership by created_at
    (
      SELECT cm.company_id
      FROM public.company_members cm
      JOIN public.companies c
        ON c.id = cm.company_id AND c.archived_at IS NULL
      WHERE cm.user_id = auth.uid()
      ORDER BY cm.created_at ASC
      LIMIT 1
    )
  );
$$;

GRANT EXECUTE ON FUNCTION public.current_active_company_id() TO authenticated;

COMMENT ON FUNCTION public.current_active_company_id() IS
  'Returns the active company id for auth.uid(), reading user_preferences.active_company_id '
  'with validation against non-archived company_members, and falling back to the user''s '
  'first non-archived membership. Used by RLS policies to enforce single-active-company '
  'tenant isolation. STABLE so the result is cached per query plan.';

-- =============================================================================
-- 2. Drop old policies on company-scoped data tables
-- =============================================================================
-- We enumerate every company-scoped data table that currently uses
-- user_company_ids() and drop all of its policies so we can recreate them
-- below with current_active_company_id().

DO $$
DECLARE
  pol RECORD;
  affected_tables TEXT[] := ARRAY[
    'company_settings', 'chart_of_accounts', 'fiscal_periods',
    'journal_entries', 'journal_entry_lines',
    'account_balances', 'voucher_sequences',
    'transactions', 'bank_connections', 'bank_file_imports',
    'customers', 'invoices', 'invoice_items',
    'invoice_reminders', 'invoice_payments',
    'suppliers', 'supplier_invoices', 'supplier_invoice_items',
    'supplier_invoice_payments',
    'receipts', 'receipt_line_items',
    'document_attachments', 'invoice_inbox_items',
    'mapping_rules', 'categorization_templates',
    'deadlines', 'cost_centers', 'projects',
    'salary_payments', 'mileage_entries',
    'sie_imports', 'sie_account_mappings',
    'calendar_feeds', 'chat_sessions', 'chat_messages',
    'ai_usage_tracking', 'extension_data', 'api_keys',
    'skatteverket_tokens', 'pending_operations', 'payment_match_log',
    'event_log', 'notification_log', 'audit_log',
    'provider_consents', 'voucher_gap_explanations',
    'automation_webhooks', 'email_connections'
  ];
  tbl TEXT;
BEGIN
  FOREACH tbl IN ARRAY affected_tables
  LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = tbl
    ) THEN
      FOR pol IN
        SELECT policyname FROM pg_policies
        WHERE schemaname = 'public' AND tablename = tbl
      LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', pol.policyname, tbl);
      END LOOP;
    END IF;
  END LOOP;
END $$;

-- =============================================================================
-- 3. Recreate policies using current_active_company_id()
-- =============================================================================
-- Same shape as the previous user_company_ids()-based policies, just
-- swapping the membership IN clause for an equality check against the
-- single active company.

-- company_settings
CREATE POLICY "company_settings_select" ON public.company_settings
  FOR SELECT USING (company_id = public.current_active_company_id());
CREATE POLICY "company_settings_insert" ON public.company_settings
  FOR INSERT WITH CHECK (company_id = public.current_active_company_id());
CREATE POLICY "company_settings_update" ON public.company_settings
  FOR UPDATE USING (company_id = public.current_active_company_id());
CREATE POLICY "company_settings_delete" ON public.company_settings
  FOR DELETE USING (company_id = public.current_active_company_id());

-- chart_of_accounts
CREATE POLICY "chart_of_accounts_select" ON public.chart_of_accounts
  FOR SELECT USING (company_id = public.current_active_company_id());
CREATE POLICY "chart_of_accounts_insert" ON public.chart_of_accounts
  FOR INSERT WITH CHECK (company_id = public.current_active_company_id());
CREATE POLICY "chart_of_accounts_update" ON public.chart_of_accounts
  FOR UPDATE USING (company_id = public.current_active_company_id());
CREATE POLICY "chart_of_accounts_delete" ON public.chart_of_accounts
  FOR DELETE USING (company_id = public.current_active_company_id());

-- fiscal_periods
CREATE POLICY "fiscal_periods_select" ON public.fiscal_periods
  FOR SELECT USING (company_id = public.current_active_company_id());
CREATE POLICY "fiscal_periods_insert" ON public.fiscal_periods
  FOR INSERT WITH CHECK (company_id = public.current_active_company_id());
CREATE POLICY "fiscal_periods_update" ON public.fiscal_periods
  FOR UPDATE USING (company_id = public.current_active_company_id());
CREATE POLICY "fiscal_periods_delete" ON public.fiscal_periods
  FOR DELETE USING (company_id = public.current_active_company_id());

-- journal_entries
CREATE POLICY "journal_entries_select" ON public.journal_entries
  FOR SELECT USING (company_id = public.current_active_company_id());
CREATE POLICY "journal_entries_insert" ON public.journal_entries
  FOR INSERT WITH CHECK (company_id = public.current_active_company_id());
CREATE POLICY "journal_entries_update" ON public.journal_entries
  FOR UPDATE USING (company_id = public.current_active_company_id());
CREATE POLICY "journal_entries_delete" ON public.journal_entries
  FOR DELETE USING (company_id = public.current_active_company_id());

-- journal_entry_lines (child: join to parent journal_entries)
CREATE POLICY "journal_entry_lines_select" ON public.journal_entry_lines
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.journal_entries je
            WHERE je.id = journal_entry_lines.journal_entry_id
              AND je.company_id = public.current_active_company_id())
  );
CREATE POLICY "journal_entry_lines_insert" ON public.journal_entry_lines
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM public.journal_entries je
            WHERE je.id = journal_entry_lines.journal_entry_id
              AND je.company_id = public.current_active_company_id())
  );
CREATE POLICY "journal_entry_lines_update" ON public.journal_entry_lines
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM public.journal_entries je
            WHERE je.id = journal_entry_lines.journal_entry_id
              AND je.company_id = public.current_active_company_id())
  );
CREATE POLICY "journal_entry_lines_delete" ON public.journal_entry_lines
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM public.journal_entries je
            WHERE je.id = journal_entry_lines.journal_entry_id
              AND je.company_id = public.current_active_company_id())
  );

-- account_balances (may not exist on fresh DBs)
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'account_balances'
  ) THEN
    EXECUTE 'CREATE POLICY "account_balances_select" ON public.account_balances FOR SELECT USING (company_id = public.current_active_company_id())';
    EXECUTE 'CREATE POLICY "account_balances_insert" ON public.account_balances FOR INSERT WITH CHECK (company_id = public.current_active_company_id())';
    EXECUTE 'CREATE POLICY "account_balances_update" ON public.account_balances FOR UPDATE USING (company_id = public.current_active_company_id())';
    EXECUTE 'CREATE POLICY "account_balances_delete" ON public.account_balances FOR DELETE USING (company_id = public.current_active_company_id())';
  END IF;
END $$;

-- voucher_sequences
CREATE POLICY "voucher_sequences_select" ON public.voucher_sequences
  FOR SELECT USING (company_id = public.current_active_company_id());
CREATE POLICY "voucher_sequences_insert" ON public.voucher_sequences
  FOR INSERT WITH CHECK (company_id = public.current_active_company_id());
CREATE POLICY "voucher_sequences_update" ON public.voucher_sequences
  FOR UPDATE USING (company_id = public.current_active_company_id());

-- transactions
CREATE POLICY "transactions_select" ON public.transactions
  FOR SELECT USING (company_id = public.current_active_company_id());
CREATE POLICY "transactions_insert" ON public.transactions
  FOR INSERT WITH CHECK (company_id = public.current_active_company_id());
CREATE POLICY "transactions_update" ON public.transactions
  FOR UPDATE USING (company_id = public.current_active_company_id());
CREATE POLICY "transactions_delete" ON public.transactions
  FOR DELETE USING (company_id = public.current_active_company_id());

-- bank_connections
CREATE POLICY "bank_connections_select" ON public.bank_connections
  FOR SELECT USING (company_id = public.current_active_company_id());
CREATE POLICY "bank_connections_insert" ON public.bank_connections
  FOR INSERT WITH CHECK (company_id = public.current_active_company_id());
CREATE POLICY "bank_connections_update" ON public.bank_connections
  FOR UPDATE USING (company_id = public.current_active_company_id());
CREATE POLICY "bank_connections_delete" ON public.bank_connections
  FOR DELETE USING (company_id = public.current_active_company_id());

-- bank_file_imports
CREATE POLICY "bank_file_imports_select" ON public.bank_file_imports
  FOR SELECT USING (company_id = public.current_active_company_id());
CREATE POLICY "bank_file_imports_insert" ON public.bank_file_imports
  FOR INSERT WITH CHECK (company_id = public.current_active_company_id());
CREATE POLICY "bank_file_imports_update" ON public.bank_file_imports
  FOR UPDATE USING (company_id = public.current_active_company_id());
CREATE POLICY "bank_file_imports_delete" ON public.bank_file_imports
  FOR DELETE USING (company_id = public.current_active_company_id());

-- customers
CREATE POLICY "customers_select" ON public.customers
  FOR SELECT USING (company_id = public.current_active_company_id());
CREATE POLICY "customers_insert" ON public.customers
  FOR INSERT WITH CHECK (company_id = public.current_active_company_id());
CREATE POLICY "customers_update" ON public.customers
  FOR UPDATE USING (company_id = public.current_active_company_id());
CREATE POLICY "customers_delete" ON public.customers
  FOR DELETE USING (company_id = public.current_active_company_id());

-- invoices
CREATE POLICY "invoices_select" ON public.invoices
  FOR SELECT USING (company_id = public.current_active_company_id());
CREATE POLICY "invoices_insert" ON public.invoices
  FOR INSERT WITH CHECK (company_id = public.current_active_company_id());
CREATE POLICY "invoices_update" ON public.invoices
  FOR UPDATE USING (company_id = public.current_active_company_id());
CREATE POLICY "invoices_delete" ON public.invoices
  FOR DELETE USING (company_id = public.current_active_company_id());

-- invoice_items (child: join to parent invoices)
CREATE POLICY "invoice_items_select" ON public.invoice_items
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.invoices i
            WHERE i.id = invoice_items.invoice_id
              AND i.company_id = public.current_active_company_id())
  );
CREATE POLICY "invoice_items_insert" ON public.invoice_items
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM public.invoices i
            WHERE i.id = invoice_items.invoice_id
              AND i.company_id = public.current_active_company_id())
  );
CREATE POLICY "invoice_items_update" ON public.invoice_items
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM public.invoices i
            WHERE i.id = invoice_items.invoice_id
              AND i.company_id = public.current_active_company_id())
  );
CREATE POLICY "invoice_items_delete" ON public.invoice_items
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM public.invoices i
            WHERE i.id = invoice_items.invoice_id
              AND i.company_id = public.current_active_company_id())
  );

-- invoice_reminders
CREATE POLICY "invoice_reminders_select" ON public.invoice_reminders
  FOR SELECT USING (company_id = public.current_active_company_id());
CREATE POLICY "invoice_reminders_insert" ON public.invoice_reminders
  FOR INSERT WITH CHECK (company_id = public.current_active_company_id());
CREATE POLICY "invoice_reminders_update" ON public.invoice_reminders
  FOR UPDATE USING (company_id = public.current_active_company_id());
CREATE POLICY "invoice_reminders_delete" ON public.invoice_reminders
  FOR DELETE USING (company_id = public.current_active_company_id());

-- invoice_payments
CREATE POLICY "invoice_payments_select" ON public.invoice_payments
  FOR SELECT USING (company_id = public.current_active_company_id());
CREATE POLICY "invoice_payments_insert" ON public.invoice_payments
  FOR INSERT WITH CHECK (company_id = public.current_active_company_id());
CREATE POLICY "invoice_payments_update" ON public.invoice_payments
  FOR UPDATE USING (company_id = public.current_active_company_id());
CREATE POLICY "invoice_payments_delete" ON public.invoice_payments
  FOR DELETE USING (company_id = public.current_active_company_id());

-- suppliers
CREATE POLICY "suppliers_select" ON public.suppliers
  FOR SELECT USING (company_id = public.current_active_company_id());
CREATE POLICY "suppliers_insert" ON public.suppliers
  FOR INSERT WITH CHECK (company_id = public.current_active_company_id());
CREATE POLICY "suppliers_update" ON public.suppliers
  FOR UPDATE USING (company_id = public.current_active_company_id());
CREATE POLICY "suppliers_delete" ON public.suppliers
  FOR DELETE USING (company_id = public.current_active_company_id());

-- supplier_invoices
CREATE POLICY "supplier_invoices_select" ON public.supplier_invoices
  FOR SELECT USING (company_id = public.current_active_company_id());
CREATE POLICY "supplier_invoices_insert" ON public.supplier_invoices
  FOR INSERT WITH CHECK (company_id = public.current_active_company_id());
CREATE POLICY "supplier_invoices_update" ON public.supplier_invoices
  FOR UPDATE USING (company_id = public.current_active_company_id());
CREATE POLICY "supplier_invoices_delete" ON public.supplier_invoices
  FOR DELETE USING (company_id = public.current_active_company_id());

-- supplier_invoice_items (child: join to parent supplier_invoices)
CREATE POLICY "supplier_invoice_items_select" ON public.supplier_invoice_items
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.supplier_invoices si
            WHERE si.id = supplier_invoice_items.supplier_invoice_id
              AND si.company_id = public.current_active_company_id())
  );
CREATE POLICY "supplier_invoice_items_insert" ON public.supplier_invoice_items
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM public.supplier_invoices si
            WHERE si.id = supplier_invoice_items.supplier_invoice_id
              AND si.company_id = public.current_active_company_id())
  );
CREATE POLICY "supplier_invoice_items_update" ON public.supplier_invoice_items
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM public.supplier_invoices si
            WHERE si.id = supplier_invoice_items.supplier_invoice_id
              AND si.company_id = public.current_active_company_id())
  );
CREATE POLICY "supplier_invoice_items_delete" ON public.supplier_invoice_items
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM public.supplier_invoices si
            WHERE si.id = supplier_invoice_items.supplier_invoice_id
              AND si.company_id = public.current_active_company_id())
  );

-- supplier_invoice_payments
CREATE POLICY "supplier_invoice_payments_select" ON public.supplier_invoice_payments
  FOR SELECT USING (company_id = public.current_active_company_id());
CREATE POLICY "supplier_invoice_payments_insert" ON public.supplier_invoice_payments
  FOR INSERT WITH CHECK (company_id = public.current_active_company_id());
CREATE POLICY "supplier_invoice_payments_update" ON public.supplier_invoice_payments
  FOR UPDATE USING (company_id = public.current_active_company_id());
CREATE POLICY "supplier_invoice_payments_delete" ON public.supplier_invoice_payments
  FOR DELETE USING (company_id = public.current_active_company_id());

-- receipts
CREATE POLICY "receipts_select" ON public.receipts
  FOR SELECT USING (company_id = public.current_active_company_id());
CREATE POLICY "receipts_insert" ON public.receipts
  FOR INSERT WITH CHECK (company_id = public.current_active_company_id());
CREATE POLICY "receipts_update" ON public.receipts
  FOR UPDATE USING (company_id = public.current_active_company_id());
CREATE POLICY "receipts_delete" ON public.receipts
  FOR DELETE USING (company_id = public.current_active_company_id());

-- receipt_line_items (child: join to parent receipts)
CREATE POLICY "receipt_line_items_select" ON public.receipt_line_items
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.receipts r
            WHERE r.id = receipt_line_items.receipt_id
              AND r.company_id = public.current_active_company_id())
  );
CREATE POLICY "receipt_line_items_insert" ON public.receipt_line_items
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM public.receipts r
            WHERE r.id = receipt_line_items.receipt_id
              AND r.company_id = public.current_active_company_id())
  );
CREATE POLICY "receipt_line_items_update" ON public.receipt_line_items
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM public.receipts r
            WHERE r.id = receipt_line_items.receipt_id
              AND r.company_id = public.current_active_company_id())
  );
CREATE POLICY "receipt_line_items_delete" ON public.receipt_line_items
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM public.receipts r
            WHERE r.id = receipt_line_items.receipt_id
              AND r.company_id = public.current_active_company_id())
  );

-- document_attachments (DELETE is blocked by block_document_deletion trigger
-- but we still add a policy for completeness — the trigger runs after RLS)
CREATE POLICY "document_attachments_select" ON public.document_attachments
  FOR SELECT USING (company_id = public.current_active_company_id());
CREATE POLICY "document_attachments_insert" ON public.document_attachments
  FOR INSERT WITH CHECK (company_id = public.current_active_company_id());
CREATE POLICY "document_attachments_update" ON public.document_attachments
  FOR UPDATE USING (company_id = public.current_active_company_id());
CREATE POLICY "document_attachments_delete" ON public.document_attachments
  FOR DELETE USING (company_id = public.current_active_company_id());

-- invoice_inbox_items
CREATE POLICY "invoice_inbox_items_select" ON public.invoice_inbox_items
  FOR SELECT USING (company_id = public.current_active_company_id());
CREATE POLICY "invoice_inbox_items_insert" ON public.invoice_inbox_items
  FOR INSERT WITH CHECK (company_id = public.current_active_company_id());
CREATE POLICY "invoice_inbox_items_update" ON public.invoice_inbox_items
  FOR UPDATE USING (company_id = public.current_active_company_id());
CREATE POLICY "invoice_inbox_items_delete" ON public.invoice_inbox_items
  FOR DELETE USING (company_id = public.current_active_company_id());

-- mapping_rules (system rules have company_id IS NULL)
CREATE POLICY "mapping_rules_select" ON public.mapping_rules
  FOR SELECT USING (company_id = public.current_active_company_id() OR company_id IS NULL);
CREATE POLICY "mapping_rules_insert" ON public.mapping_rules
  FOR INSERT WITH CHECK (company_id = public.current_active_company_id());
CREATE POLICY "mapping_rules_update" ON public.mapping_rules
  FOR UPDATE USING (company_id = public.current_active_company_id());
CREATE POLICY "mapping_rules_delete" ON public.mapping_rules
  FOR DELETE USING (company_id = public.current_active_company_id());

-- categorization_templates
CREATE POLICY "categorization_templates_select" ON public.categorization_templates
  FOR SELECT USING (company_id = public.current_active_company_id());
CREATE POLICY "categorization_templates_insert" ON public.categorization_templates
  FOR INSERT WITH CHECK (company_id = public.current_active_company_id());
CREATE POLICY "categorization_templates_update" ON public.categorization_templates
  FOR UPDATE USING (company_id = public.current_active_company_id());
CREATE POLICY "categorization_templates_delete" ON public.categorization_templates
  FOR DELETE USING (company_id = public.current_active_company_id());

-- deadlines
CREATE POLICY "deadlines_select" ON public.deadlines
  FOR SELECT USING (company_id = public.current_active_company_id());
CREATE POLICY "deadlines_insert" ON public.deadlines
  FOR INSERT WITH CHECK (company_id = public.current_active_company_id());
CREATE POLICY "deadlines_update" ON public.deadlines
  FOR UPDATE USING (company_id = public.current_active_company_id());
CREATE POLICY "deadlines_delete" ON public.deadlines
  FOR DELETE USING (company_id = public.current_active_company_id());

-- cost_centers
CREATE POLICY "cost_centers_select" ON public.cost_centers
  FOR SELECT USING (company_id = public.current_active_company_id());
CREATE POLICY "cost_centers_insert" ON public.cost_centers
  FOR INSERT WITH CHECK (company_id = public.current_active_company_id());
CREATE POLICY "cost_centers_update" ON public.cost_centers
  FOR UPDATE USING (company_id = public.current_active_company_id());
CREATE POLICY "cost_centers_delete" ON public.cost_centers
  FOR DELETE USING (company_id = public.current_active_company_id());

-- projects
CREATE POLICY "projects_select" ON public.projects
  FOR SELECT USING (company_id = public.current_active_company_id());
CREATE POLICY "projects_insert" ON public.projects
  FOR INSERT WITH CHECK (company_id = public.current_active_company_id());
CREATE POLICY "projects_update" ON public.projects
  FOR UPDATE USING (company_id = public.current_active_company_id());
CREATE POLICY "projects_delete" ON public.projects
  FOR DELETE USING (company_id = public.current_active_company_id());

-- salary_payments (may not exist on fresh DBs)
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'salary_payments'
  ) THEN
    EXECUTE 'CREATE POLICY "salary_payments_select" ON public.salary_payments FOR SELECT USING (company_id = public.current_active_company_id())';
    EXECUTE 'CREATE POLICY "salary_payments_insert" ON public.salary_payments FOR INSERT WITH CHECK (company_id = public.current_active_company_id())';
    EXECUTE 'CREATE POLICY "salary_payments_update" ON public.salary_payments FOR UPDATE USING (company_id = public.current_active_company_id())';
    EXECUTE 'CREATE POLICY "salary_payments_delete" ON public.salary_payments FOR DELETE USING (company_id = public.current_active_company_id())';
  END IF;
END $$;

-- mileage_entries (may not exist on fresh DBs)
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'mileage_entries'
  ) THEN
    EXECUTE 'CREATE POLICY "mileage_entries_select" ON public.mileage_entries FOR SELECT USING (company_id = public.current_active_company_id())';
    EXECUTE 'CREATE POLICY "mileage_entries_insert" ON public.mileage_entries FOR INSERT WITH CHECK (company_id = public.current_active_company_id())';
    EXECUTE 'CREATE POLICY "mileage_entries_update" ON public.mileage_entries FOR UPDATE USING (company_id = public.current_active_company_id())';
    EXECUTE 'CREATE POLICY "mileage_entries_delete" ON public.mileage_entries FOR DELETE USING (company_id = public.current_active_company_id())';
  END IF;
END $$;

-- sie_imports
CREATE POLICY "sie_imports_select" ON public.sie_imports
  FOR SELECT USING (company_id = public.current_active_company_id());
CREATE POLICY "sie_imports_insert" ON public.sie_imports
  FOR INSERT WITH CHECK (company_id = public.current_active_company_id());
CREATE POLICY "sie_imports_update" ON public.sie_imports
  FOR UPDATE USING (company_id = public.current_active_company_id());
CREATE POLICY "sie_imports_delete" ON public.sie_imports
  FOR DELETE USING (company_id = public.current_active_company_id());

-- sie_account_mappings
CREATE POLICY "sie_account_mappings_select" ON public.sie_account_mappings
  FOR SELECT USING (company_id = public.current_active_company_id());
CREATE POLICY "sie_account_mappings_insert" ON public.sie_account_mappings
  FOR INSERT WITH CHECK (company_id = public.current_active_company_id());
CREATE POLICY "sie_account_mappings_update" ON public.sie_account_mappings
  FOR UPDATE USING (company_id = public.current_active_company_id());
CREATE POLICY "sie_account_mappings_delete" ON public.sie_account_mappings
  FOR DELETE USING (company_id = public.current_active_company_id());

-- calendar_feeds
CREATE POLICY "calendar_feeds_select" ON public.calendar_feeds
  FOR SELECT USING (company_id = public.current_active_company_id());
CREATE POLICY "calendar_feeds_insert" ON public.calendar_feeds
  FOR INSERT WITH CHECK (company_id = public.current_active_company_id());
CREATE POLICY "calendar_feeds_update" ON public.calendar_feeds
  FOR UPDATE USING (company_id = public.current_active_company_id());
CREATE POLICY "calendar_feeds_delete" ON public.calendar_feeds
  FOR DELETE USING (company_id = public.current_active_company_id());

-- chat_sessions
CREATE POLICY "chat_sessions_select" ON public.chat_sessions
  FOR SELECT USING (company_id = public.current_active_company_id());
CREATE POLICY "chat_sessions_insert" ON public.chat_sessions
  FOR INSERT WITH CHECK (company_id = public.current_active_company_id());
CREATE POLICY "chat_sessions_update" ON public.chat_sessions
  FOR UPDATE USING (company_id = public.current_active_company_id());
CREATE POLICY "chat_sessions_delete" ON public.chat_sessions
  FOR DELETE USING (company_id = public.current_active_company_id());

-- chat_messages
CREATE POLICY "chat_messages_select" ON public.chat_messages
  FOR SELECT USING (company_id = public.current_active_company_id());
CREATE POLICY "chat_messages_insert" ON public.chat_messages
  FOR INSERT WITH CHECK (company_id = public.current_active_company_id());
CREATE POLICY "chat_messages_update" ON public.chat_messages
  FOR UPDATE USING (company_id = public.current_active_company_id());
CREATE POLICY "chat_messages_delete" ON public.chat_messages
  FOR DELETE USING (company_id = public.current_active_company_id());

-- ai_usage_tracking (SELECT + INSERT only — no UPDATE/DELETE policy)
CREATE POLICY "ai_usage_tracking_select" ON public.ai_usage_tracking
  FOR SELECT USING (company_id = public.current_active_company_id());
CREATE POLICY "ai_usage_tracking_insert" ON public.ai_usage_tracking
  FOR INSERT WITH CHECK (company_id = public.current_active_company_id());

-- extension_data
CREATE POLICY "extension_data_select" ON public.extension_data
  FOR SELECT USING (company_id = public.current_active_company_id());
CREATE POLICY "extension_data_insert" ON public.extension_data
  FOR INSERT WITH CHECK (company_id = public.current_active_company_id());
CREATE POLICY "extension_data_update" ON public.extension_data
  FOR UPDATE USING (company_id = public.current_active_company_id());
CREATE POLICY "extension_data_delete" ON public.extension_data
  FOR DELETE USING (company_id = public.current_active_company_id());

-- api_keys
CREATE POLICY "api_keys_select" ON public.api_keys
  FOR SELECT USING (company_id = public.current_active_company_id());
CREATE POLICY "api_keys_insert" ON public.api_keys
  FOR INSERT WITH CHECK (company_id = public.current_active_company_id());
CREATE POLICY "api_keys_update" ON public.api_keys
  FOR UPDATE USING (company_id = public.current_active_company_id());
CREATE POLICY "api_keys_delete" ON public.api_keys
  FOR DELETE USING (company_id = public.current_active_company_id());

-- skatteverket_tokens
CREATE POLICY "skatteverket_tokens_select" ON public.skatteverket_tokens
  FOR SELECT USING (company_id = public.current_active_company_id());
CREATE POLICY "skatteverket_tokens_insert" ON public.skatteverket_tokens
  FOR INSERT WITH CHECK (company_id = public.current_active_company_id());
CREATE POLICY "skatteverket_tokens_update" ON public.skatteverket_tokens
  FOR UPDATE USING (company_id = public.current_active_company_id());
CREATE POLICY "skatteverket_tokens_delete" ON public.skatteverket_tokens
  FOR DELETE USING (company_id = public.current_active_company_id());

-- pending_operations (SELECT + UPDATE only — inserts via service role)
CREATE POLICY "pending_operations_select" ON public.pending_operations
  FOR SELECT USING (company_id = public.current_active_company_id());
CREATE POLICY "pending_operations_update" ON public.pending_operations
  FOR UPDATE USING (company_id = public.current_active_company_id());

-- payment_match_log (nullable company_id)
CREATE POLICY "payment_match_log_select" ON public.payment_match_log
  FOR SELECT USING (company_id = public.current_active_company_id());
CREATE POLICY "payment_match_log_insert" ON public.payment_match_log
  FOR INSERT WITH CHECK (company_id = public.current_active_company_id() OR company_id IS NULL);

-- event_log (SELECT only for users — writes via handler in service role)
CREATE POLICY "event_log_select" ON public.event_log
  FOR SELECT USING (company_id = public.current_active_company_id());

-- notification_log (nullable company_id for system-wide notifications)
CREATE POLICY "notification_log_select" ON public.notification_log
  FOR SELECT USING (company_id = public.current_active_company_id() OR company_id IS NULL);

-- audit_log (SELECT only for users — writes via SECURITY DEFINER triggers)
CREATE POLICY "audit_log_select" ON public.audit_log
  FOR SELECT USING (company_id = public.current_active_company_id());

-- provider_consents
CREATE POLICY "provider_consents_select" ON public.provider_consents
  FOR SELECT USING (company_id = public.current_active_company_id());
CREATE POLICY "provider_consents_insert" ON public.provider_consents
  FOR INSERT WITH CHECK (company_id = public.current_active_company_id());
CREATE POLICY "provider_consents_update" ON public.provider_consents
  FOR UPDATE USING (company_id = public.current_active_company_id());
CREATE POLICY "provider_consents_delete" ON public.provider_consents
  FOR DELETE USING (company_id = public.current_active_company_id());

-- voucher_gap_explanations (preserves the owner/admin team_members check)
CREATE POLICY "voucher_gap_explanations_select" ON public.voucher_gap_explanations
  FOR SELECT USING (company_id = public.current_active_company_id());
CREATE POLICY "voucher_gap_explanations_insert" ON public.voucher_gap_explanations
  FOR INSERT WITH CHECK (
    company_id = public.current_active_company_id()
    AND EXISTS (
      SELECT 1 FROM public.team_members tm
      JOIN public.companies c ON c.team_id = tm.team_id
      WHERE c.id = company_id
        AND tm.user_id = auth.uid()
        AND tm.role IN ('owner', 'admin')
    )
  );
CREATE POLICY "voucher_gap_explanations_update" ON public.voucher_gap_explanations
  FOR UPDATE USING (
    company_id = public.current_active_company_id()
    AND EXISTS (
      SELECT 1 FROM public.team_members tm
      JOIN public.companies c ON c.team_id = tm.team_id
      WHERE c.id = company_id
        AND tm.user_id = auth.uid()
        AND tm.role IN ('owner', 'admin')
    )
  );

-- automation_webhooks
CREATE POLICY "automation_webhooks_select" ON public.automation_webhooks
  FOR SELECT USING (company_id = public.current_active_company_id());
CREATE POLICY "automation_webhooks_insert" ON public.automation_webhooks
  FOR INSERT WITH CHECK (company_id = public.current_active_company_id());
CREATE POLICY "automation_webhooks_update" ON public.automation_webhooks
  FOR UPDATE USING (company_id = public.current_active_company_id());
CREATE POLICY "automation_webhooks_delete" ON public.automation_webhooks
  FOR DELETE USING (company_id = public.current_active_company_id());

-- email_connections
CREATE POLICY "email_connections_select" ON public.email_connections
  FOR SELECT USING (company_id = public.current_active_company_id());
CREATE POLICY "email_connections_insert" ON public.email_connections
  FOR INSERT WITH CHECK (company_id = public.current_active_company_id());
CREATE POLICY "email_connections_update" ON public.email_connections
  FOR UPDATE USING (company_id = public.current_active_company_id());
CREATE POLICY "email_connections_delete" ON public.email_connections
  FOR DELETE USING (company_id = public.current_active_company_id());
