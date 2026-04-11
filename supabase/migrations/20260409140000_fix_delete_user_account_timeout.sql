-- Fix delete_user_account: timeout + cascade blockers.
--
-- Problem 1: ALTER TABLE DDL requires ACCESS EXCLUSIVE locks. With the
-- authenticated role's 8s statement_timeout, any concurrent read causes
-- error 57014. Fixed via function-level SET statement_timeout = '60s'.
--
-- Problem 2: Several NO ACTION FKs block the CASCADE chain from
-- auth.users → companies → children:
--   audit_log.company_id               → companies      (NO ACTION)
--   fiscal_periods.previous_period_id  → fiscal_periods  (NO ACTION, self-ref)
--   fiscal_periods.closing_entry_id    → journal_entries  (NO ACTION)
--   fiscal_periods.opening_balance_entry_id → journal_entries (NO ACTION)
-- Fixed by explicitly clearing these before the CASCADE fires.

CREATE OR REPLACE FUNCTION public.delete_user_account(target_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET statement_timeout = '60s'
SET lock_timeout = '10s'
AS $$
DECLARE
  v_company_ids uuid[];
BEGIN
  -- Only allow users to delete their own account
  IF auth.uid() IS DISTINCT FROM target_user_id THEN
    RAISE EXCEPTION 'Can only delete your own account';
  END IF;

  -- Collect companies owned by this user (CASCADE will delete these)
  SELECT array_agg(id) INTO v_company_ids
  FROM public.companies
  WHERE created_by = target_user_id;

  -- Clear active_company_id to avoid FK conflicts during CASCADE
  DELETE FROM public.user_preferences WHERE user_id = target_user_id;

  -- Explicitly delete from extension_data (missing DELETE RLS policy
  -- causes CASCADE from auth.users to fail even with ON DELETE CASCADE)
  DELETE FROM public.extension_data WHERE user_id = target_user_id;

  -- Disable BEFORE DELETE triggers that block deletion
  ALTER TABLE audit_log DISABLE TRIGGER audit_log_no_delete;
  ALTER TABLE payment_match_log DISABLE TRIGGER payment_match_log_no_delete;
  ALTER TABLE document_attachments DISABLE TRIGGER block_document_deletion;
  ALTER TABLE journal_entries DISABLE TRIGGER enforce_journal_entry_immutability;
  ALTER TABLE journal_entries DISABLE TRIGGER enforce_retention_journal_entries;
  ALTER TABLE journal_entry_lines DISABLE TRIGGER enforce_journal_entry_line_immutability;

  -- Disable AFTER DELETE audit triggers (they INSERT into audit_log during
  -- CASCADE, which would create orphaned rows after the user is gone)
  ALTER TABLE api_keys DISABLE TRIGGER audit_api_keys;
  ALTER TABLE chart_of_accounts DISABLE TRIGGER audit_chart_of_accounts;
  ALTER TABLE company_settings DISABLE TRIGGER audit_company_settings;
  ALTER TABLE document_attachments DISABLE TRIGGER audit_document_attachments;
  ALTER TABLE extension_data DISABLE TRIGGER audit_extension_data;
  ALTER TABLE fiscal_periods DISABLE TRIGGER audit_fiscal_periods;
  ALTER TABLE journal_entries DISABLE TRIGGER audit_journal_entries;
  ALTER TABLE supplier_invoices DISABLE TRIGGER audit_supplier_invoices;

  -- Clear NO ACTION FK references that block the CASCADE chain
  IF v_company_ids IS NOT NULL THEN
    -- audit_log.company_id → companies (NO ACTION)
    DELETE FROM public.audit_log
    WHERE company_id = ANY(v_company_ids);

    -- fiscal_periods self-ref and cross-refs to journal_entries (NO ACTION)
    UPDATE public.fiscal_periods
    SET previous_period_id = NULL,
        closing_entry_id = NULL,
        opening_balance_entry_id = NULL
    WHERE company_id = ANY(v_company_ids);
  END IF;

  -- Delete from auth.users — ON DELETE CASCADE handles all public tables
  DELETE FROM auth.users WHERE id = target_user_id;

  -- Re-enable all triggers
  ALTER TABLE audit_log ENABLE TRIGGER audit_log_no_delete;
  ALTER TABLE payment_match_log ENABLE TRIGGER payment_match_log_no_delete;
  ALTER TABLE document_attachments ENABLE TRIGGER block_document_deletion;
  ALTER TABLE journal_entries ENABLE TRIGGER enforce_journal_entry_immutability;
  ALTER TABLE journal_entries ENABLE TRIGGER enforce_retention_journal_entries;
  ALTER TABLE journal_entry_lines ENABLE TRIGGER enforce_journal_entry_line_immutability;
  ALTER TABLE api_keys ENABLE TRIGGER audit_api_keys;
  ALTER TABLE chart_of_accounts ENABLE TRIGGER audit_chart_of_accounts;
  ALTER TABLE company_settings ENABLE TRIGGER audit_company_settings;
  ALTER TABLE document_attachments ENABLE TRIGGER audit_document_attachments;
  ALTER TABLE extension_data ENABLE TRIGGER audit_extension_data;
  ALTER TABLE fiscal_periods ENABLE TRIGGER audit_fiscal_periods;
  ALTER TABLE journal_entries ENABLE TRIGGER audit_journal_entries;
  ALTER TABLE supplier_invoices ENABLE TRIGGER audit_supplier_invoices;

EXCEPTION WHEN OTHERS THEN
  -- PostgreSQL transactional DDL already rolls back the DISABLE TRIGGER
  -- statements if the function aborts, but re-enable explicitly as a
  -- defensive guard against sub-transaction edge cases so enforcement
  -- triggers are never left disabled on the live tables.
  BEGIN ALTER TABLE audit_log ENABLE TRIGGER audit_log_no_delete; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN ALTER TABLE payment_match_log ENABLE TRIGGER payment_match_log_no_delete; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN ALTER TABLE document_attachments ENABLE TRIGGER block_document_deletion; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN ALTER TABLE journal_entries ENABLE TRIGGER enforce_journal_entry_immutability; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN ALTER TABLE journal_entries ENABLE TRIGGER enforce_retention_journal_entries; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN ALTER TABLE journal_entry_lines ENABLE TRIGGER enforce_journal_entry_line_immutability; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN ALTER TABLE api_keys ENABLE TRIGGER audit_api_keys; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN ALTER TABLE chart_of_accounts ENABLE TRIGGER audit_chart_of_accounts; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN ALTER TABLE company_settings ENABLE TRIGGER audit_company_settings; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN ALTER TABLE document_attachments ENABLE TRIGGER audit_document_attachments; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN ALTER TABLE extension_data ENABLE TRIGGER audit_extension_data; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN ALTER TABLE fiscal_periods ENABLE TRIGGER audit_fiscal_periods; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN ALTER TABLE journal_entries ENABLE TRIGGER audit_journal_entries; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN ALTER TABLE supplier_invoices ENABLE TRIGGER audit_supplier_invoices; EXCEPTION WHEN OTHERS THEN NULL; END;
  RAISE;
END;
$$;
