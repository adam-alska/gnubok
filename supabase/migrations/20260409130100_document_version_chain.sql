-- Document version chain: prev_version_hash column + create_document_version RPC
-- Fixes the non-functional document versioning (migration 023 was a placeholder).
-- The createNewVersion() in lib/core/documents/document-service.ts calls this RPC.

-- 1. Add prev_version_hash column for cryptographic version chain
ALTER TABLE public.document_attachments
  ADD COLUMN IF NOT EXISTS prev_version_hash text;

-- 2. Atomic version creation RPC
-- Row-locks the current version, inserts a new version with hash chain,
-- and marks the old version as superseded — all in one transaction.
CREATE OR REPLACE FUNCTION public.create_document_version(
  p_user_id uuid,
  p_original_doc_id uuid,
  p_storage_path text,
  p_file_name text,
  p_file_size_bytes bigint,
  p_mime_type text,
  p_sha256_hash text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current document_attachments%ROWTYPE;
  v_new_id uuid;
  v_root_id uuid;
  v_next_version integer;
BEGIN
  -- Lock the current version row to prevent concurrent versioning
  SELECT * INTO v_current
  FROM public.document_attachments
  WHERE id = p_original_doc_id
    AND is_current_version = true
  FOR UPDATE;

  IF v_current IS NULL THEN
    RAISE EXCEPTION 'Document % not found or is not the current version', p_original_doc_id;
  END IF;

  -- Determine root document and next version number
  v_root_id := COALESCE(v_current.original_id, v_current.id);
  v_next_version := v_current.version + 1;

  -- Insert new version with hash chain link
  INSERT INTO public.document_attachments (
    user_id, company_id, storage_path, file_name, file_size_bytes,
    mime_type, sha256_hash, version, original_id, is_current_version,
    uploaded_by, upload_source, digitization_date,
    journal_entry_id, journal_entry_line_id, prev_version_hash
  ) VALUES (
    p_user_id, v_current.company_id, p_storage_path, p_file_name,
    p_file_size_bytes, p_mime_type, p_sha256_hash, v_next_version,
    v_root_id, true, p_user_id, v_current.upload_source, now(),
    v_current.journal_entry_id, v_current.journal_entry_line_id,
    v_current.sha256_hash  -- cryptographic link to previous version
  )
  RETURNING id INTO v_new_id;

  -- Mark old version as superseded
  UPDATE public.document_attachments
  SET is_current_version = false,
      superseded_by_id = v_new_id
  WHERE id = p_original_doc_id;

  RETURN v_new_id;
END;
$$;

-- 3. Version chain validation function
-- Walks the version chain from newest to oldest and verifies each
-- prev_version_hash matches the prior version's sha256_hash.
CREATE OR REPLACE FUNCTION public.validate_version_chain(p_document_id uuid)
RETURNS TABLE(version integer, document_id uuid, hash_valid boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_root_id uuid;
BEGIN
  -- Find root document
  SELECT COALESCE(da.original_id, da.id) INTO v_root_id
  FROM public.document_attachments da
  WHERE da.id = p_document_id;

  IF v_root_id IS NULL THEN
    RAISE EXCEPTION 'Document % not found', p_document_id;
  END IF;

  -- Walk chain and verify hashes
  RETURN QUERY
  WITH chain AS (
    SELECT
      da.id AS doc_id,
      da.version AS ver,
      da.sha256_hash,
      da.prev_version_hash,
      LAG(da.sha256_hash) OVER (ORDER BY da.version) AS expected_prev_hash
    FROM public.document_attachments da
    WHERE da.id = v_root_id OR da.original_id = v_root_id
    ORDER BY da.version
  )
  SELECT
    chain.ver,
    chain.doc_id,
    CASE
      WHEN chain.ver = 1 THEN chain.prev_version_hash IS NULL
      ELSE chain.prev_version_hash IS NOT DISTINCT FROM chain.expected_prev_hash
    END AS hash_valid
  FROM chain
  ORDER BY chain.ver;
END;
$$;
