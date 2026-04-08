-- Migration: Create 'sie-files' storage bucket for SIE file archival
-- The SIE import flow archives imported files to Supabase Storage for
-- BFL 7 kap 1-2§ retention compliance, but the bucket was never created.
-- Path convention: {company_id}/{import_id}.se

-- =============================================================================
-- 1. Create the 'sie-files' bucket (private, 10MB limit, text only)
-- =============================================================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'sie-files',
  'sie-files',
  false,
  52428800, -- 50 MB, matches MAX_FILE_SIZE in the parse route
  ARRAY['text/plain']
)
ON CONFLICT (id) DO NOTHING;
ON CONFLICT (id) DO NOTHING;

-- =============================================================================
-- 2. INSERT policy: Users can upload to companies they belong to
-- =============================================================================

CREATE POLICY "sie_files_insert"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'sie-files'
    AND (storage.foldername(name))[1]::uuid IN (SELECT public.user_company_ids())
  );

-- =============================================================================
-- 3. SELECT policy: Users can read files from companies they belong to
-- =============================================================================

CREATE POLICY "sie_files_select"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'sie-files'
    AND (storage.foldername(name))[1]::uuid IN (SELECT public.user_company_ids())
  );

-- =============================================================================
-- No UPDATE or DELETE policies — WORM compliance for BFL retention
-- Service role bypasses RLS for admin/cron access
-- =============================================================================
