-- Allow completed SIE imports to be marked as 'replaced' when a user wants to
-- re-import corrected data for the same fiscal period.
--
-- Compliance: replaced imports and their cancelled journal entries remain in the
-- database as audit trail per BFL 5 kap 5§ (rättelse) and BFNAR 2013:2 kap 8
-- (behandlingshistorik). Nothing is deleted.

-- 1. Expand status CHECK to include 'replaced'
ALTER TABLE public.sie_imports
  DROP CONSTRAINT IF EXISTS sie_imports_status_check;
ALTER TABLE public.sie_imports
  ADD CONSTRAINT sie_imports_status_check
  CHECK (status IN ('pending', 'mapped', 'completed', 'failed', 'replaced'));

-- 2. Add audit column for tracking when the import was replaced
ALTER TABLE public.sie_imports
  ADD COLUMN IF NOT EXISTS replaced_at timestamptz;

-- 3. Convert UNIQUE (company_id, file_hash) to a partial unique index that
--    excludes replaced/failed imports. This allows re-importing the same file
--    after a previous import has been replaced.
ALTER TABLE public.sie_imports
  DROP CONSTRAINT IF EXISTS sie_imports_company_id_file_hash_key;

CREATE UNIQUE INDEX IF NOT EXISTS sie_imports_company_id_file_hash_active_idx
  ON public.sie_imports (company_id, file_hash)
  WHERE status NOT IN ('replaced', 'failed');
