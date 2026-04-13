-- Delete last voucher per series (Fortnox model).
-- Allows deleting the highest-numbered posted voucher in a series,
-- maintaining an unbroken voucher number sequence per BFL 5 kap 7§.
--
-- Safeguards:
-- 1. Only the LAST voucher in its (company, fiscal_period, series) can be deleted
-- 2. Fiscal period must not be closed or locked
-- 3. No other entries may reference it (reverses_id, correction_of_id)
-- 4. Calling user must be company owner or admin
-- 5. Full audit trail via write_audit_log() trigger (BFNAR 2013:2 behandlingshistorik)

-- 1. Update line immutability trigger to respect session variable bypass
CREATE OR REPLACE FUNCTION public.enforce_journal_entry_line_immutability()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE v_status text;
BEGIN
  -- Session variable bypass for controlled operations (delete_last_voucher RPC)
  IF current_setting('gnubok.allow_delete', true) = 'true' THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;

  SELECT status INTO v_status FROM public.journal_entries
  WHERE id = COALESCE(OLD.journal_entry_id, NEW.journal_entry_id);

  -- Draft entries: all operations allowed
  IF v_status = 'draft' THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;

  -- Cancelled entries: only DELETE for cleanup
  IF v_status = 'cancelled' THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RAISE EXCEPTION 'Cannot % lines of a cancelled journal entry.', TG_OP;
  END IF;

  RAISE EXCEPTION 'Cannot % lines of a % journal entry.', TG_OP, v_status;
END; $$;

-- 2. Update retention trigger to respect session variable bypass
CREATE OR REPLACE FUNCTION public.enforce_retention_journal_entries()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_retention_expires date;
BEGIN
  -- Session variable bypass for controlled operations (delete_last_voucher RPC)
  IF current_setting('gnubok.allow_delete', true) = 'true' THEN
    RETURN OLD;
  END IF;

  SELECT fp.retention_expires_at INTO v_retention_expires
  FROM public.fiscal_periods fp
  WHERE fp.id = OLD.fiscal_period_id;

  IF v_retention_expires IS NOT NULL AND v_retention_expires > CURRENT_DATE THEN
    INSERT INTO public.audit_log (user_id, action, table_name, record_id, description)
    VALUES (OLD.user_id, 'RETENTION_BLOCK', 'journal_entries', OLD.id,
      'Attempted deletion within retention period (expires ' || v_retention_expires || ')');

    RAISE EXCEPTION 'Cannot delete journal entry within 7-year retention period (expires %)',
      v_retention_expires;
  END IF;

  RETURN OLD;
END; $$;

-- 3. Create the delete_last_voucher RPC
CREATE OR REPLACE FUNCTION public.delete_last_voucher(
  p_company_id uuid,
  p_entry_id   uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_entry            record;
  v_period           record;
  v_max_voucher      integer;
  v_ref_count        integer;
  v_caller_role      text;
  v_snapshot         jsonb;
  v_lines_snapshot   jsonb;
BEGIN
  -- 1. Verify calling user is company owner or admin
  SELECT cm.role INTO v_caller_role
  FROM company_members cm
  WHERE cm.company_id = p_company_id
    AND cm.user_id = auth.uid();

  IF v_caller_role IS NULL OR v_caller_role NOT IN ('owner', 'admin') THEN
    RAISE EXCEPTION 'Only company owners and admins can delete vouchers';
  END IF;

  -- 2. Lock and fetch the target entry
  SELECT * INTO v_entry
  FROM journal_entries
  WHERE id = p_entry_id
    AND company_id = p_company_id
  FOR UPDATE;

  IF v_entry IS NULL THEN
    RAISE EXCEPTION 'Journal entry not found';
  END IF;

  IF v_entry.status != 'posted' THEN
    RAISE EXCEPTION 'Only posted entries can be deleted (current status: %)', v_entry.status;
  END IF;

  -- 3. Verify fiscal period is open
  SELECT * INTO v_period
  FROM fiscal_periods
  WHERE id = v_entry.fiscal_period_id
  FOR UPDATE;

  IF v_period.is_closed THEN
    RAISE EXCEPTION 'Cannot delete voucher in a closed fiscal period';
  END IF;

  IF v_period.locked_at IS NOT NULL THEN
    RAISE EXCEPTION 'Cannot delete voucher in a locked fiscal period';
  END IF;

  -- 4. Lock voucher_sequences row to serialise against concurrent commit_journal_entry.
  --    Without this, a concurrent commit could assign a new voucher number between
  --    our MAX check and the DELETE, producing a gap (violating BFL 5 kap 7§).
  PERFORM 1 FROM voucher_sequences
  WHERE company_id = p_company_id
    AND fiscal_period_id = v_entry.fiscal_period_id
    AND voucher_series = v_entry.voucher_series
  FOR UPDATE;

  -- Verify it is the LAST voucher in its series
  SELECT MAX(voucher_number) INTO v_max_voucher
  FROM journal_entries
  WHERE company_id = p_company_id
    AND fiscal_period_id = v_entry.fiscal_period_id
    AND voucher_series = v_entry.voucher_series
    AND status NOT IN ('cancelled', 'draft');

  IF v_entry.voucher_number != v_max_voucher THEN
    RAISE EXCEPTION 'Kan bara radera det sista verifikatet i serien. % har nummer % men senaste är %',
      v_entry.voucher_series, v_entry.voucher_number, v_max_voucher;
  END IF;

  -- 5. Verify no other entries reference this one
  SELECT COUNT(*) INTO v_ref_count
  FROM journal_entries
  WHERE company_id = p_company_id
    AND status != 'cancelled'
    AND (reverses_id = p_entry_id OR correction_of_id = p_entry_id);

  IF v_ref_count > 0 THEN
    RAISE EXCEPTION 'Cannot delete: other entries reference this voucher (% references)',
      v_ref_count;
  END IF;

  -- 6. Capture snapshot for audit trail (BFNAR 2013:2 behandlingshistorik)
  --    The write_audit_log() AFTER trigger also captures old_state, but we
  --    include lines here for complete traceability.
  SELECT jsonb_agg(to_jsonb(l)) INTO v_lines_snapshot
  FROM journal_entry_lines l
  WHERE l.journal_entry_id = p_entry_id;

  v_snapshot := to_jsonb(v_entry) || jsonb_build_object('lines', COALESCE(v_lines_snapshot, '[]'::jsonb));

  -- 7. If this entry is a storno (reverses another entry), restore the original
  IF v_entry.reverses_id IS NOT NULL THEN
    -- Use session variable to allow reversed → posted transition
    PERFORM set_config('gnubok.allow_delete', 'true', true);
    UPDATE journal_entries
    SET status = 'posted', reversed_by_id = NULL
    WHERE id = v_entry.reverses_id
      AND company_id = p_company_id;
  END IF;

  -- 8. Enable session variable bypass for deletion triggers
  PERFORM set_config('gnubok.allow_delete', 'true', true);

  -- 9. Unlink document attachments (FK is RESTRICT, must clear before delete)
  UPDATE document_attachments
  SET journal_entry_id = NULL
  WHERE journal_entry_id = p_entry_id;

  -- 10. Delete the journal entry
  --     journal_entry_lines: ON DELETE CASCADE (auto-deleted)
  --     transactions: ON DELETE SET NULL (auto-nullified)
  --     supplier_invoices: ON DELETE SET NULL (auto-nullified)
  --     supplier_invoice_payments: ON DELETE SET NULL (auto-nullified)
  --     invoice_payments: ON DELETE SET NULL (auto-nullified)
  DELETE FROM journal_entries WHERE id = p_entry_id;

  -- 11. Decrement voucher sequence
  UPDATE voucher_sequences
  SET last_number = GREATEST(last_number - 1, 0)
  WHERE company_id = p_company_id
    AND fiscal_period_id = v_entry.fiscal_period_id
    AND voucher_series = v_entry.voucher_series;

  -- 12. Insert explicit audit entry with full snapshot including lines
  INSERT INTO audit_log (user_id, action, table_name, record_id, actor_id, old_state, description)
  VALUES (
    v_entry.user_id,
    'DELETE',
    'journal_entries',
    p_entry_id,
    auth.uid(),
    v_snapshot,
    'Deleted voucher ' || v_entry.voucher_series || v_entry.voucher_number ||
    ' (delete_last_voucher RPC, caller: ' || auth.uid() || ')'
  );

  RETURN jsonb_build_object(
    'deleted', true,
    'voucher_series', v_entry.voucher_series,
    'voucher_number', v_entry.voucher_number
  );
END;
$$;

NOTIFY pgrst, 'reload schema';
