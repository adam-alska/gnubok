-- Fix: add posted → cancelled transition for orphaned entry cleanup.
-- The live trigger is missing this transition due to migration 20260319000001
-- being edited after it was applied. engine.ts reverseEntry and storno-service
-- need posted → cancelled for CAS guard cleanup of orphaned concurrent reversals.

CREATE OR REPLACE FUNCTION public.enforce_journal_entry_immutability()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    -- No exemption for drafts: varaktighet applies from insertion.
    -- Application code uses status='cancelled' instead of DELETE.
    RAISE EXCEPTION 'Cannot delete journal entries (id: %, status: %). Use cancelled status instead.',
      OLD.id, OLD.status;
  END IF;

  -- Draft can transition to draft (update fields), posted, or cancelled
  IF OLD.status = 'draft' AND NEW.status IN ('draft', 'posted', 'cancelled') THEN
    RETURN NEW;
  END IF;

  -- Posted can transition to reversed (storno) or cancelled (orphaned cleanup)
  IF OLD.status = 'posted' AND NEW.status IN ('reversed', 'cancelled') THEN
    IF NEW.status = 'reversed' THEN
      IF NEW.description != OLD.description OR NEW.entry_date != OLD.entry_date
         OR NEW.fiscal_period_id != OLD.fiscal_period_id
         OR NEW.voucher_number != OLD.voucher_number THEN
        RAISE EXCEPTION 'Cannot modify fields of a posted entry during reversal (id: %)', OLD.id;
      END IF;
    END IF;
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'Cannot modify a % journal entry (id: %). Committed entries are immutable per Bokforingslagen.',
    OLD.status, OLD.id;
END; $$;
