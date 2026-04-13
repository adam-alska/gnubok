-- Add optional notes/comment field to journal entries.
-- Notes are internal metadata (not part of BFL verifikation content)
-- and remain editable even after posting, following the Fortnox model.
ALTER TABLE public.journal_entries ADD COLUMN notes text;

-- Update the immutability trigger to allow notes-only updates on posted entries.
-- BFL 5 kap 7§ defines verifikation content (date, description, amount, counterparty,
-- number, underlag refs). Notes are NOT in that list — they are internal metadata.
CREATE OR REPLACE FUNCTION public.enforce_journal_entry_immutability()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  -- Session variable bypass for controlled operations (e.g. delete_last_voucher RPC)
  IF current_setting('gnubok.allow_delete', true) = 'true' THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;

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

  -- Posted entries: allow notes-only updates (internal metadata, not verifikation content)
  -- BFL 5 kap 7§ mandates immutability for verifikation fields (description, date, amounts,
  -- voucher number, etc.). Notes/comments are outside this scope per Fortnox precedent.
  IF OLD.status = 'posted' AND NEW.status = 'posted' THEN
    IF NEW.description = OLD.description
       AND NEW.entry_date = OLD.entry_date
       AND NEW.fiscal_period_id = OLD.fiscal_period_id
       AND NEW.voucher_number = OLD.voucher_number
       AND NEW.voucher_series = OLD.voucher_series
       AND NEW.source_type = OLD.source_type
       AND COALESCE(NEW.source_id::text, '') = COALESCE(OLD.source_id::text, '')
       AND NEW.user_id = OLD.user_id
       AND COALESCE(NEW.reversed_by_id::text, '') = COALESCE(OLD.reversed_by_id::text, '')
       AND COALESCE(NEW.reverses_id::text, '') = COALESCE(OLD.reverses_id::text, '')
       AND COALESCE(NEW.correction_of_id::text, '') = COALESCE(OLD.correction_of_id::text, '')
       AND NEW.committed_at IS NOT DISTINCT FROM OLD.committed_at
    THEN
      RETURN NEW; -- Only notes and updated_at may differ
    END IF;
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

  -- Reversed entries can transition back to posted (when their storno is deleted)
  IF OLD.status = 'reversed' AND NEW.status = 'posted'
     AND current_setting('gnubok.allow_delete', true) = 'true' THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'Cannot modify a % journal entry (id: %). Committed entries are immutable per Bokforingslagen.',
    OLD.status, OLD.id;
END; $$;

NOTIFY pgrst, 'reload schema';
