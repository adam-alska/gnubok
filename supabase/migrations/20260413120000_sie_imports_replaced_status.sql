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

-- 4. Atomic RPC to cancel entries and mark import as replaced in one transaction.
--    Prevents inconsistent state where entries are cancelled but import stays 'completed'.
CREATE OR REPLACE FUNCTION public.replace_sie_import(
  p_company_id uuid,
  p_import_id  uuid
) RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cancelled integer;
  v_fiscal_period_id uuid;
  v_opening_balance_entry_id uuid;
BEGIN
  -- Look up the import record (caller must have verified status/permissions)
  SELECT fiscal_period_id, opening_balance_entry_id
    INTO v_fiscal_period_id, v_opening_balance_entry_id
    FROM public.sie_imports
   WHERE id = p_import_id AND company_id = p_company_id AND status = 'completed';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Import % not found or not in completed status', p_import_id;
  END IF;

  -- Cancel all journal entries belonging to this import
  UPDATE public.journal_entries
     SET status = 'cancelled'
   WHERE company_id = p_company_id
     AND status = 'posted'
     AND id IN (
       -- Opening balance entry
       SELECT v_opening_balance_entry_id WHERE v_opening_balance_entry_id IS NOT NULL
       UNION ALL
       -- Imported vouchers + migration adjustment
       SELECT je.id FROM public.journal_entries je
        WHERE je.company_id = p_company_id
          AND je.fiscal_period_id = v_fiscal_period_id
          AND je.source_type = 'import'
          AND je.status = 'posted'
     );
  GET DIAGNOSTICS v_cancelled = ROW_COUNT;

  -- Mark import as replaced
  UPDATE public.sie_imports
     SET status = 'replaced', replaced_at = now()
   WHERE id = p_import_id AND company_id = p_company_id;

  RETURN v_cancelled;
END;
$$;
