-- =============================================================================
-- Add missing DELETE RLS policies
-- =============================================================================
-- The multi-tenant migration (20260330130000) dropped all existing policies
-- but only recreated DELETE policies for company_members and api_keys.
-- This migration adds the missing DELETE policies for all tables that need them.
-- =============================================================================

-- Direct company_id tables
CREATE POLICY "customers_delete" ON public.customers
  FOR DELETE USING (company_id IN (SELECT public.user_company_ids()));

CREATE POLICY "suppliers_delete" ON public.suppliers
  FOR DELETE USING (company_id IN (SELECT public.user_company_ids()));

CREATE POLICY "invoices_delete" ON public.invoices
  FOR DELETE USING (company_id IN (SELECT public.user_company_ids()));

CREATE POLICY "invoice_reminders_delete" ON public.invoice_reminders
  FOR DELETE USING (company_id IN (SELECT public.user_company_ids()));

CREATE POLICY "invoice_payments_delete" ON public.invoice_payments
  FOR DELETE USING (company_id IN (SELECT public.user_company_ids()));

CREATE POLICY "supplier_invoices_delete" ON public.supplier_invoices
  FOR DELETE USING (company_id IN (SELECT public.user_company_ids()));

CREATE POLICY "supplier_invoice_payments_delete" ON public.supplier_invoice_payments
  FOR DELETE USING (company_id IN (SELECT public.user_company_ids()));

CREATE POLICY "transactions_delete" ON public.transactions
  FOR DELETE USING (company_id IN (SELECT public.user_company_ids()));

CREATE POLICY "bank_connections_delete" ON public.bank_connections
  FOR DELETE USING (company_id IN (SELECT public.user_company_ids()));

CREATE POLICY "bank_file_imports_delete" ON public.bank_file_imports
  FOR DELETE USING (company_id IN (SELECT public.user_company_ids()));

CREATE POLICY "receipts_delete" ON public.receipts
  FOR DELETE USING (company_id IN (SELECT public.user_company_ids()));

CREATE POLICY "company_settings_delete" ON public.company_settings
  FOR DELETE USING (company_id IN (SELECT public.user_company_ids()));

CREATE POLICY "chart_of_accounts_delete" ON public.chart_of_accounts
  FOR DELETE USING (company_id IN (SELECT public.user_company_ids()));

CREATE POLICY "fiscal_periods_delete" ON public.fiscal_periods
  FOR DELETE USING (company_id IN (SELECT public.user_company_ids()));

CREATE POLICY "journal_entries_delete" ON public.journal_entries
  FOR DELETE USING (company_id IN (SELECT public.user_company_ids()));

CREATE POLICY "mapping_rules_delete" ON public.mapping_rules
  FOR DELETE USING (company_id IN (SELECT public.user_company_ids()));

CREATE POLICY "categorization_templates_delete" ON public.categorization_templates
  FOR DELETE USING (company_id IN (SELECT public.user_company_ids()));

CREATE POLICY "deadlines_delete" ON public.deadlines
  FOR DELETE USING (company_id IN (SELECT public.user_company_ids()));

CREATE POLICY "cost_centers_delete" ON public.cost_centers
  FOR DELETE USING (company_id IN (SELECT public.user_company_ids()));

CREATE POLICY "projects_delete" ON public.projects
  FOR DELETE USING (company_id IN (SELECT public.user_company_ids()));

CREATE POLICY "calendar_feeds_delete" ON public.calendar_feeds
  FOR DELETE USING (company_id IN (SELECT public.user_company_ids()));

CREATE POLICY "extension_data_delete" ON public.extension_data
  FOR DELETE USING (company_id IN (SELECT public.user_company_ids()));

CREATE POLICY "skatteverket_tokens_delete" ON public.skatteverket_tokens
  FOR DELETE USING (company_id IN (SELECT public.user_company_ids()));

CREATE POLICY "document_attachments_delete" ON public.document_attachments
  FOR DELETE USING (company_id IN (SELECT public.user_company_ids()));

CREATE POLICY "invoice_inbox_items_delete" ON public.invoice_inbox_items
  FOR DELETE USING (company_id IN (SELECT public.user_company_ids()));

CREATE POLICY "sie_imports_delete" ON public.sie_imports
  FOR DELETE USING (company_id IN (SELECT public.user_company_ids()));

CREATE POLICY "sie_account_mappings_delete" ON public.sie_account_mappings
  FOR DELETE USING (company_id IN (SELECT public.user_company_ids()));

CREATE POLICY "chat_sessions_delete" ON public.chat_sessions
  FOR DELETE USING (company_id IN (SELECT public.user_company_ids()));

CREATE POLICY "chat_messages_delete" ON public.chat_messages
  FOR DELETE USING (company_id IN (SELECT public.user_company_ids()));

-- Conditional tables (may not exist in all environments)
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'salary_payments') THEN
    EXECUTE 'CREATE POLICY "salary_payments_delete" ON public.salary_payments FOR DELETE USING (company_id IN (SELECT public.user_company_ids()))';
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'mileage_entries') THEN
    EXECUTE 'CREATE POLICY "mileage_entries_delete" ON public.mileage_entries FOR DELETE USING (company_id IN (SELECT public.user_company_ids()))';
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'account_balances') THEN
    EXECUTE 'CREATE POLICY "account_balances_delete" ON public.account_balances FOR DELETE USING (company_id IN (SELECT public.user_company_ids()))';
  END IF;
END $$;

-- Sub-tables using parent join (same pattern as their SELECT/INSERT/UPDATE policies)
CREATE POLICY "invoice_items_delete" ON public.invoice_items
  FOR DELETE USING (
    invoice_id IN (SELECT id FROM public.invoices WHERE company_id IN (SELECT public.user_company_ids()))
  );

CREATE POLICY "journal_entry_lines_delete" ON public.journal_entry_lines
  FOR DELETE USING (
    journal_entry_id IN (SELECT id FROM public.journal_entries WHERE company_id IN (SELECT public.user_company_ids()))
  );

CREATE POLICY "receipt_line_items_delete" ON public.receipt_line_items
  FOR DELETE USING (
    receipt_id IN (SELECT id FROM public.receipts WHERE company_id IN (SELECT public.user_company_ids()))
  );

CREATE POLICY "supplier_invoice_items_delete" ON public.supplier_invoice_items
  FOR DELETE USING (
    supplier_invoice_id IN (SELECT id FROM public.supplier_invoices WHERE company_id IN (SELECT public.user_company_ids()))
  );
