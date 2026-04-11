-- =============================================================================
-- Viewer role read-only enforcement
-- =============================================================================
--
-- Activates the `viewer` role in company_members. Until now the role existed
-- in the type system (CompanyRole) but was dormant — a viewer had the same
-- write capabilities as a member. This migration makes viewers truly
-- read-only at the database level.
--
-- Mechanism:
--   1. New helper `public.current_user_can_write()` returns true only if
--      the authenticated user's role in the active company is NOT 'viewer'.
--   2. Every INSERT / UPDATE / DELETE policy on company-scoped tables is
--      recreated with an added `AND public.current_user_can_write()` clause.
--   3. SELECT policies are left untouched — viewers read everything.
--
-- After this migration, any write by a viewer is rejected with:
--   "new row violates row-level security policy" (server-side)
-- regardless of whether it originates from the UI, a browser console, or
-- an API key bound to a viewer's session.
-- =============================================================================

-- =============================================================================
-- 1. current_user_can_write() helper
-- =============================================================================
CREATE OR REPLACE FUNCTION public.current_user_can_write()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.company_members cm
    WHERE cm.user_id = auth.uid()
      AND cm.company_id = public.current_active_company_id()
      AND cm.role <> 'viewer'
  );
$$;

GRANT EXECUTE ON FUNCTION public.current_user_can_write() TO authenticated;

COMMENT ON FUNCTION public.current_user_can_write() IS
  'Returns true if auth.uid() has a non-viewer role (owner / admin / member) '
  'in the current active company. Used by RLS INSERT/UPDATE/DELETE policies '
  'to make the ''viewer'' role truly read-only. Viewers, non-members, and '
  'unauthenticated callers all get false.';

-- =============================================================================
-- 2. Standard tables — recreate INSERT / UPDATE / DELETE policies
-- =============================================================================
-- Loop over all company-scoped tables that currently have the full set of
-- insert/update/delete policies. SELECT policies are left alone (viewers
-- must be able to read everything).

DO $$
DECLARE
  t TEXT;
  standard_tables TEXT[] := ARRAY[
    'company_settings', 'chart_of_accounts', 'fiscal_periods', 'journal_entries',
    'transactions', 'bank_connections', 'bank_file_imports',
    'customers', 'invoices', 'invoice_reminders', 'invoice_payments',
    'suppliers', 'supplier_invoices', 'supplier_invoice_payments',
    'receipts', 'document_attachments', 'invoice_inbox_items',
    'categorization_templates', 'deadlines', 'cost_centers', 'projects',
    'sie_imports', 'sie_account_mappings', 'calendar_feeds',
    'chat_sessions', 'chat_messages',
    'extension_data', 'api_keys', 'skatteverket_tokens',
    'provider_consents', 'automation_webhooks', 'email_connections'
  ];
BEGIN
  FOREACH t IN ARRAY standard_tables
  LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = t
    ) THEN
      EXECUTE format('DROP POLICY IF EXISTS "%s_insert" ON public.%I', t, t);
      EXECUTE format('DROP POLICY IF EXISTS "%s_update" ON public.%I', t, t);
      EXECUTE format('DROP POLICY IF EXISTS "%s_delete" ON public.%I', t, t);

      EXECUTE format(
        'CREATE POLICY "%s_insert" ON public.%I '
        'FOR INSERT WITH CHECK ('
        'company_id = public.current_active_company_id() '
        'AND public.current_user_can_write())',
        t, t
      );
      EXECUTE format(
        'CREATE POLICY "%s_update" ON public.%I '
        'FOR UPDATE USING ('
        'company_id = public.current_active_company_id() '
        'AND public.current_user_can_write())',
        t, t
      );
      EXECUTE format(
        'CREATE POLICY "%s_delete" ON public.%I '
        'FOR DELETE USING ('
        'company_id = public.current_active_company_id() '
        'AND public.current_user_can_write())',
        t, t
      );
    END IF;
  END LOOP;
END $$;

-- =============================================================================
-- 3. voucher_sequences (INSERT + UPDATE only, no DELETE policy)
-- =============================================================================
DROP POLICY IF EXISTS "voucher_sequences_insert" ON public.voucher_sequences;
DROP POLICY IF EXISTS "voucher_sequences_update" ON public.voucher_sequences;
CREATE POLICY "voucher_sequences_insert" ON public.voucher_sequences
  FOR INSERT WITH CHECK (
    company_id = public.current_active_company_id()
    AND public.current_user_can_write()
  );
CREATE POLICY "voucher_sequences_update" ON public.voucher_sequences
  FOR UPDATE USING (
    company_id = public.current_active_company_id()
    AND public.current_user_can_write()
  );

-- =============================================================================
-- 4. mapping_rules (standard, but with OR company_id IS NULL on SELECT only)
-- =============================================================================
-- The SELECT policy keeps its OR company_id IS NULL exception for system
-- rules — viewers can still read them. Writes drop the NULL branch because
-- viewers never create rules (and non-viewers only create company-scoped
-- rules, not system rules).
DROP POLICY IF EXISTS "mapping_rules_insert" ON public.mapping_rules;
DROP POLICY IF EXISTS "mapping_rules_update" ON public.mapping_rules;
DROP POLICY IF EXISTS "mapping_rules_delete" ON public.mapping_rules;
CREATE POLICY "mapping_rules_insert" ON public.mapping_rules
  FOR INSERT WITH CHECK (
    company_id = public.current_active_company_id()
    AND public.current_user_can_write()
  );
CREATE POLICY "mapping_rules_update" ON public.mapping_rules
  FOR UPDATE USING (
    company_id = public.current_active_company_id()
    AND public.current_user_can_write()
  );
CREATE POLICY "mapping_rules_delete" ON public.mapping_rules
  FOR DELETE USING (
    company_id = public.current_active_company_id()
    AND public.current_user_can_write()
  );

-- =============================================================================
-- 5. ai_usage_tracking (INSERT only)
-- =============================================================================
DROP POLICY IF EXISTS "ai_usage_tracking_insert" ON public.ai_usage_tracking;
CREATE POLICY "ai_usage_tracking_insert" ON public.ai_usage_tracking
  FOR INSERT WITH CHECK (
    company_id = public.current_active_company_id()
    AND public.current_user_can_write()
  );

-- =============================================================================
-- 6. pending_operations (UPDATE only — inserts via service role)
-- =============================================================================
DROP POLICY IF EXISTS "pending_operations_update" ON public.pending_operations;
CREATE POLICY "pending_operations_update" ON public.pending_operations
  FOR UPDATE USING (
    company_id = public.current_active_company_id()
    AND public.current_user_can_write()
  );

-- =============================================================================
-- 7. payment_match_log (INSERT only, nullable company_id)
-- =============================================================================
DROP POLICY IF EXISTS "payment_match_log_insert" ON public.payment_match_log;
CREATE POLICY "payment_match_log_insert" ON public.payment_match_log
  FOR INSERT WITH CHECK (
    (company_id = public.current_active_company_id() OR company_id IS NULL)
    AND public.current_user_can_write()
  );

-- =============================================================================
-- 8. Child tables — join to parent via EXISTS
-- =============================================================================
-- journal_entry_lines
DROP POLICY IF EXISTS "journal_entry_lines_insert" ON public.journal_entry_lines;
DROP POLICY IF EXISTS "journal_entry_lines_update" ON public.journal_entry_lines;
DROP POLICY IF EXISTS "journal_entry_lines_delete" ON public.journal_entry_lines;
CREATE POLICY "journal_entry_lines_insert" ON public.journal_entry_lines
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM public.journal_entries je
            WHERE je.id = journal_entry_lines.journal_entry_id
              AND je.company_id = public.current_active_company_id())
    AND public.current_user_can_write()
  );
CREATE POLICY "journal_entry_lines_update" ON public.journal_entry_lines
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM public.journal_entries je
            WHERE je.id = journal_entry_lines.journal_entry_id
              AND je.company_id = public.current_active_company_id())
    AND public.current_user_can_write()
  );
CREATE POLICY "journal_entry_lines_delete" ON public.journal_entry_lines
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM public.journal_entries je
            WHERE je.id = journal_entry_lines.journal_entry_id
              AND je.company_id = public.current_active_company_id())
    AND public.current_user_can_write()
  );

-- invoice_items
DROP POLICY IF EXISTS "invoice_items_insert" ON public.invoice_items;
DROP POLICY IF EXISTS "invoice_items_update" ON public.invoice_items;
DROP POLICY IF EXISTS "invoice_items_delete" ON public.invoice_items;
CREATE POLICY "invoice_items_insert" ON public.invoice_items
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM public.invoices i
            WHERE i.id = invoice_items.invoice_id
              AND i.company_id = public.current_active_company_id())
    AND public.current_user_can_write()
  );
CREATE POLICY "invoice_items_update" ON public.invoice_items
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM public.invoices i
            WHERE i.id = invoice_items.invoice_id
              AND i.company_id = public.current_active_company_id())
    AND public.current_user_can_write()
  );
CREATE POLICY "invoice_items_delete" ON public.invoice_items
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM public.invoices i
            WHERE i.id = invoice_items.invoice_id
              AND i.company_id = public.current_active_company_id())
    AND public.current_user_can_write()
  );

-- supplier_invoice_items
DROP POLICY IF EXISTS "supplier_invoice_items_insert" ON public.supplier_invoice_items;
DROP POLICY IF EXISTS "supplier_invoice_items_update" ON public.supplier_invoice_items;
DROP POLICY IF EXISTS "supplier_invoice_items_delete" ON public.supplier_invoice_items;
CREATE POLICY "supplier_invoice_items_insert" ON public.supplier_invoice_items
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM public.supplier_invoices si
            WHERE si.id = supplier_invoice_items.supplier_invoice_id
              AND si.company_id = public.current_active_company_id())
    AND public.current_user_can_write()
  );
CREATE POLICY "supplier_invoice_items_update" ON public.supplier_invoice_items
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM public.supplier_invoices si
            WHERE si.id = supplier_invoice_items.supplier_invoice_id
              AND si.company_id = public.current_active_company_id())
    AND public.current_user_can_write()
  );
CREATE POLICY "supplier_invoice_items_delete" ON public.supplier_invoice_items
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM public.supplier_invoices si
            WHERE si.id = supplier_invoice_items.supplier_invoice_id
              AND si.company_id = public.current_active_company_id())
    AND public.current_user_can_write()
  );

-- receipt_line_items
DROP POLICY IF EXISTS "receipt_line_items_insert" ON public.receipt_line_items;
DROP POLICY IF EXISTS "receipt_line_items_update" ON public.receipt_line_items;
DROP POLICY IF EXISTS "receipt_line_items_delete" ON public.receipt_line_items;
CREATE POLICY "receipt_line_items_insert" ON public.receipt_line_items
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM public.receipts r
            WHERE r.id = receipt_line_items.receipt_id
              AND r.company_id = public.current_active_company_id())
    AND public.current_user_can_write()
  );
CREATE POLICY "receipt_line_items_update" ON public.receipt_line_items
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM public.receipts r
            WHERE r.id = receipt_line_items.receipt_id
              AND r.company_id = public.current_active_company_id())
    AND public.current_user_can_write()
  );
CREATE POLICY "receipt_line_items_delete" ON public.receipt_line_items
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM public.receipts r
            WHERE r.id = receipt_line_items.receipt_id
              AND r.company_id = public.current_active_company_id())
    AND public.current_user_can_write()
  );

-- =============================================================================
-- 9. voucher_gap_explanations (preserves owner/admin team_members check)
-- =============================================================================
-- The existing policy already blocks non-(owner|admin) via team_members, so
-- viewers are de facto blocked. We add current_user_can_write() as a
-- defensive second layer so a future refactor of team_members can't
-- accidentally re-open viewer writes.
DROP POLICY IF EXISTS "voucher_gap_explanations_insert" ON public.voucher_gap_explanations;
DROP POLICY IF EXISTS "voucher_gap_explanations_update" ON public.voucher_gap_explanations;
CREATE POLICY "voucher_gap_explanations_insert" ON public.voucher_gap_explanations
  FOR INSERT WITH CHECK (
    company_id = public.current_active_company_id()
    AND public.current_user_can_write()
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
    AND public.current_user_can_write()
    AND EXISTS (
      SELECT 1 FROM public.team_members tm
      JOIN public.companies c ON c.team_id = tm.team_id
      WHERE c.id = company_id
        AND tm.user_id = auth.uid()
        AND tm.role IN ('owner', 'admin')
    )
  );

-- =============================================================================
-- 10. Conditional tables (may not exist on fresh DBs)
-- =============================================================================
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'account_balances'
  ) THEN
    EXECUTE 'DROP POLICY IF EXISTS "account_balances_insert" ON public.account_balances';
    EXECUTE 'DROP POLICY IF EXISTS "account_balances_update" ON public.account_balances';
    EXECUTE 'DROP POLICY IF EXISTS "account_balances_delete" ON public.account_balances';
    EXECUTE 'CREATE POLICY "account_balances_insert" ON public.account_balances FOR INSERT WITH CHECK (company_id = public.current_active_company_id() AND public.current_user_can_write())';
    EXECUTE 'CREATE POLICY "account_balances_update" ON public.account_balances FOR UPDATE USING (company_id = public.current_active_company_id() AND public.current_user_can_write())';
    EXECUTE 'CREATE POLICY "account_balances_delete" ON public.account_balances FOR DELETE USING (company_id = public.current_active_company_id() AND public.current_user_can_write())';
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'salary_payments'
  ) THEN
    EXECUTE 'DROP POLICY IF EXISTS "salary_payments_insert" ON public.salary_payments';
    EXECUTE 'DROP POLICY IF EXISTS "salary_payments_update" ON public.salary_payments';
    EXECUTE 'DROP POLICY IF EXISTS "salary_payments_delete" ON public.salary_payments';
    EXECUTE 'CREATE POLICY "salary_payments_insert" ON public.salary_payments FOR INSERT WITH CHECK (company_id = public.current_active_company_id() AND public.current_user_can_write())';
    EXECUTE 'CREATE POLICY "salary_payments_update" ON public.salary_payments FOR UPDATE USING (company_id = public.current_active_company_id() AND public.current_user_can_write())';
    EXECUTE 'CREATE POLICY "salary_payments_delete" ON public.salary_payments FOR DELETE USING (company_id = public.current_active_company_id() AND public.current_user_can_write())';
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'mileage_entries'
  ) THEN
    EXECUTE 'DROP POLICY IF EXISTS "mileage_entries_insert" ON public.mileage_entries';
    EXECUTE 'DROP POLICY IF EXISTS "mileage_entries_update" ON public.mileage_entries';
    EXECUTE 'DROP POLICY IF EXISTS "mileage_entries_delete" ON public.mileage_entries';
    EXECUTE 'CREATE POLICY "mileage_entries_insert" ON public.mileage_entries FOR INSERT WITH CHECK (company_id = public.current_active_company_id() AND public.current_user_can_write())';
    EXECUTE 'CREATE POLICY "mileage_entries_update" ON public.mileage_entries FOR UPDATE USING (company_id = public.current_active_company_id() AND public.current_user_can_write())';
    EXECUTE 'CREATE POLICY "mileage_entries_delete" ON public.mileage_entries FOR DELETE USING (company_id = public.current_active_company_id() AND public.current_user_can_write())';
  END IF;
END $$;
