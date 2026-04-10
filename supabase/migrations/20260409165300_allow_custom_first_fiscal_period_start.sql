-- Allow the first fiscal period of a company to start on any day of the month,
-- per BFL 3 kap. (the first fiscal year starts on the company registration date).
-- Subsequent periods must still start on the 1st of a month.

-- Drop the unconditional CHECK constraint that enforces day-1 starts
ALTER TABLE public.fiscal_periods
  DROP CONSTRAINT IF EXISTS fiscal_period_start_first_of_month;

-- Replace with a trigger that only enforces day-1 for non-first periods
CREATE OR REPLACE FUNCTION enforce_first_of_month_for_subsequent_periods()
RETURNS trigger AS $$
BEGIN
  -- If this period starts on the 1st, no check needed
  IF EXTRACT(DAY FROM NEW.period_start) = 1 THEN
    RETURN NEW;
  END IF;

  -- Allow any start day only if this is the first fiscal period for the company
  IF EXISTS (
    SELECT 1 FROM public.fiscal_periods
    WHERE company_id = NEW.company_id
      AND id IS DISTINCT FROM NEW.id
  ) THEN
    RAISE EXCEPTION 'Non-first fiscal period must start on the 1st of a month';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER enforce_period_start_day
  BEFORE INSERT OR UPDATE ON public.fiscal_periods
  FOR EACH ROW
  EXECUTE FUNCTION enforce_first_of_month_for_subsequent_periods();
