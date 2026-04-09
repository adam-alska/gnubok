-- Audit all document deletions, including unlinked documents
-- Previously, block_document_deletion() only logged linked document deletion attempts.
-- Unlinked documents were deleted without any trace in the audit log.

CREATE OR REPLACE FUNCTION public.block_document_deletion()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_entry_status text;
  v_retention_expires date;
BEGIN
  -- Always log document deletion attempts (linked and unlinked)
  IF OLD.journal_entry_id IS NULL THEN
    INSERT INTO public.audit_log (user_id, company_id, action, table_name, record_id, description, old_state)
    VALUES (
      OLD.user_id, OLD.company_id, 'DELETE', 'document_attachments', OLD.id,
      'Deleted unlinked document "' || OLD.file_name || '"',
      to_jsonb(OLD)
    );
    -- Allow deletion of unlinked documents
    RETURN OLD;
  END IF;

  -- Check if linked to a committed journal entry
  SELECT je.status INTO v_entry_status
  FROM public.journal_entries je
  WHERE je.id = OLD.journal_entry_id;

  IF v_entry_status IN ('posted', 'reversed') THEN
    -- Log the blocked attempt
    INSERT INTO public.audit_log (user_id, company_id, action, table_name, record_id, description)
    VALUES (OLD.user_id, OLD.company_id, 'DOCUMENT_DELETE_BLOCKED', 'document_attachments', OLD.id,
      'Attempted deletion of document linked to ' || v_entry_status || ' journal entry ' || OLD.journal_entry_id);

    RAISE EXCEPTION 'Cannot delete document linked to a % journal entry (Bokforingslagen)',
      v_entry_status;
  END IF;

  -- Check retention window
  SELECT fp.retention_expires_at INTO v_retention_expires
  FROM public.journal_entries je
  JOIN public.fiscal_periods fp ON fp.id = je.fiscal_period_id
  WHERE je.id = OLD.journal_entry_id;

  IF v_retention_expires IS NOT NULL AND v_retention_expires > CURRENT_DATE THEN
    INSERT INTO public.audit_log (user_id, company_id, action, table_name, record_id, description)
    VALUES (OLD.user_id, OLD.company_id, 'RETENTION_BLOCK', 'document_attachments', OLD.id,
      'Attempted deletion within retention period (expires ' || v_retention_expires || ')');

    RAISE EXCEPTION 'Cannot delete document within 7-year retention period (expires %)',
      v_retention_expires;
  END IF;

  -- Log deletion of linked-but-not-committed documents
  INSERT INTO public.audit_log (user_id, company_id, action, table_name, record_id, description, old_state)
  VALUES (
    OLD.user_id, OLD.company_id, 'DELETE', 'document_attachments', OLD.id,
    'Deleted document "' || OLD.file_name || '" linked to draft entry ' || OLD.journal_entry_id,
    to_jsonb(OLD)
  );

  RETURN OLD;
END;
$$;
