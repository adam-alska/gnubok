-- Migration 23: Document Version Chain Hardening
-- Adds cryptographic hash chain + atomic versioning via RPC
-- Resolves: Gap 4 (no hash-chain) + Gap 5 (race condition in versioning)

-- =============================================================================
-- 1. New columns on document_attachments
-- =============================================================================

ALTER TABLE public.document_attachments
  ADD COLUMN IF NOT EXISTS prev_version_hash text,
  ADD COLUMN IF NOT EXISTS last_integrity_check_at timestamptz;

COMMENT ON COLUMN public.document_attachments.prev_version_hash IS
  'SHA-256 hash of the previous version. NULL for version 1 (genesis). Creates tamper-evident chain.';

COMMENT ON COLUMN public.document_attachments.last_integrity_check_at IS
  'Timestamp of the last batch integrity verification (set by cron job).';

-- Index for cron job: prioritize documents never checked or least recently checked
CREATE INDEX IF NOT EXISTS idx_doc_attachments_integrity_check
  ON public.document_attachments (last_integrity_check_at NULLS FIRST)
  WHERE is_current_version = true;

-- =============================================================================
-- 2. RPC: create_document_version (atomic versioning with row-level lock)
-- Pattern follows next_voucher_number() from migration 016
-- =============================================================================

CREATE OR REPLACE FUNCTION public.create_document_version(
  p_user_id uuid,
  p_original_doc_id uuid,
  p_storage_path text,
  p_file_name text,
  p_file_size_bytes bigint,
  p_mime_type text,
  p_sha256_hash text,
  p_upload_source text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_current RECORD;
  v_root_original_id uuid;
  v_new_version integer;
  v_new_id uuid;
BEGIN
  -- Lock the current version row (prevents concurrent versioning)
  SELECT id, version, sha256_hash, original_id, journal_entry_id,
         journal_entry_line_id, upload_source
  INTO v_current
  FROM public.document_attachments
  WHERE id = p_original_doc_id
    AND user_id = p_user_id
    AND is_current_version = true
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Document not found, not owned by user, or not the current version';
  END IF;

  v_root_original_id := COALESCE(v_current.original_id, v_current.id);
  v_new_version := v_current.version + 1;

  -- Insert new version with hash chain link
  INSERT INTO public.document_attachments (
    user_id,
    storage_path,
    file_name,
    file_size_bytes,
    mime_type,
    sha256_hash,
    version,
    original_id,
    is_current_version,
    uploaded_by,
    upload_source,
    digitization_date,
    journal_entry_id,
    journal_entry_line_id,
    prev_version_hash
  ) VALUES (
    p_user_id,
    p_storage_path,
    p_file_name,
    p_file_size_bytes,
    p_mime_type,
    p_sha256_hash,
    v_new_version,
    v_root_original_id,
    true,
    p_user_id,
    COALESCE(p_upload_source, v_current.upload_source),
    now(),
    v_current.journal_entry_id,
    v_current.journal_entry_line_id,
    v_current.sha256_hash  -- cryptographic link to previous version
  )
  RETURNING id INTO v_new_id;

  -- Mark old version as superseded (within same transaction = atomic)
  UPDATE public.document_attachments
  SET is_current_version = false,
      superseded_by_id = v_new_id
  WHERE id = v_current.id;

  RETURN v_new_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_document_version(uuid, uuid, text, text, bigint, text, text, text) TO authenticated;

-- =============================================================================
-- 3. RPC: validate_version_chain
-- Verifies that prev_version_hash matches sha256_hash of the preceding version
-- =============================================================================

CREATE OR REPLACE FUNCTION public.validate_version_chain(
  p_user_id uuid,
  p_original_doc_id uuid
)
RETURNS TABLE (
  doc_id uuid,
  version integer,
  sha256_hash text,
  prev_version_hash text,
  expected_prev_hash text,
  chain_valid boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  WITH chain AS (
    SELECT
      da.id,
      da.version,
      da.sha256_hash AS current_hash,
      da.prev_version_hash AS stored_prev_hash,
      LAG(da.sha256_hash) OVER (ORDER BY da.version) AS computed_prev_hash
    FROM public.document_attachments da
    WHERE da.user_id = p_user_id
      AND (da.id = p_original_doc_id OR da.original_id = p_original_doc_id)
    ORDER BY da.version
  )
  SELECT
    chain.id AS doc_id,
    chain.version,
    chain.current_hash AS sha256_hash,
    chain.stored_prev_hash AS prev_version_hash,
    chain.computed_prev_hash AS expected_prev_hash,
    CASE
      WHEN chain.version = 1 THEN (chain.stored_prev_hash IS NULL)
      ELSE (chain.stored_prev_hash IS NOT NULL AND chain.stored_prev_hash = chain.computed_prev_hash)
    END AS chain_valid
  FROM chain
  ORDER BY chain.version;
END;
$$;

GRANT EXECUTE ON FUNCTION public.validate_version_chain(uuid, uuid) TO authenticated;
