-- Enforce document metadata immutability for documents linked to committed entries
-- BFL 7 kap requires verifikation underlag to be immutable once committed.
-- Existing triggers only block DELETE — this blocks metadata UPDATE.

CREATE OR REPLACE FUNCTION public.enforce_document_metadata_immutability()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_entry_status text;
BEGIN
  -- Only enforce on documents already linked to a journal entry
  IF OLD.journal_entry_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT status INTO v_entry_status
  FROM public.journal_entries
  WHERE id = OLD.journal_entry_id;

  -- Only enforce for committed (posted/reversed) entries
  IF v_entry_status IS NULL OR v_entry_status NOT IN ('posted', 'reversed') THEN
    RETURN NEW;
  END IF;

  -- Block changes to immutable fields
  -- Allowed: last_integrity_check_at (cron), updated_at (auto-trigger),
  --          superseded_by_id (versioning), prev_version_hash (versioning),
  --          journal_entry_id/journal_entry_line_id (linking)
  IF NEW.file_name IS DISTINCT FROM OLD.file_name
     OR NEW.storage_path IS DISTINCT FROM OLD.storage_path
     OR NEW.file_size_bytes IS DISTINCT FROM OLD.file_size_bytes
     OR NEW.mime_type IS DISTINCT FROM OLD.mime_type
     OR NEW.sha256_hash IS DISTINCT FROM OLD.sha256_hash
     OR NEW.upload_source IS DISTINCT FROM OLD.upload_source
     OR NEW.digitization_date IS DISTINCT FROM OLD.digitization_date
     OR NEW.uploaded_by IS DISTINCT FROM OLD.uploaded_by
     OR NEW.version IS DISTINCT FROM OLD.version
     OR NEW.original_id IS DISTINCT FROM OLD.original_id
  THEN
    -- Log the blocked attempt
    INSERT INTO public.audit_log (user_id, company_id, action, table_name, record_id, description)
    VALUES (OLD.user_id, OLD.company_id, 'SECURITY_EVENT', 'document_attachments', OLD.id,
      'Blocked metadata modification of document linked to ' || v_entry_status || ' entry ' || OLD.journal_entry_id);

    RAISE EXCEPTION 'Cannot modify metadata of document linked to a % journal entry (BFL 7 kap)', v_entry_status;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER enforce_document_metadata_immutability
  BEFORE UPDATE ON public.document_attachments
  FOR EACH ROW EXECUTE FUNCTION public.enforce_document_metadata_immutability();
