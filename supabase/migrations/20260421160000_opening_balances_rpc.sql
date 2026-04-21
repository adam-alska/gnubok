-- compute_prior_opening_balances(company_id, period_start)
--
-- Server-side aggregate for the opening-balances fallback used when a fiscal
-- period has no opening_balance_entry_id set (i.e. year-end closing never ran
-- for the prior period). Returns one row per balance-sheet account
-- (class 1-2) with the summed debit and credit of every posted/reversed
-- journal line dated before the period start.
--
-- Replaces a paginated PostgREST scan that fetched every prior line via
-- journal_entry_lines with an !inner join on journal_entries. At ~8k lines
-- that scan would tip over the 8s statement_timeout on the authenticated
-- role because the RLS EXISTS subquery on journal_entry_lines re-evaluates
-- user_company_ids() per row on every .range() page. This RPC pushes the
-- filter + SUM into the planner and returns ~50 rows in a single round trip.
--
-- Class 3-8 accounts are intentionally excluded: their balances reset at
-- each year transition and are absorbed into equity via the closing entry;
-- carrying them forward as IB would violate BFNAR 2013:2.

CREATE OR REPLACE FUNCTION compute_prior_opening_balances(
  p_company_id uuid,
  p_period_start date
)
RETURNS TABLE (account_number text, debit numeric, credit numeric)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT
    jel.account_number,
    SUM(jel.debit_amount)::numeric AS debit,
    SUM(jel.credit_amount)::numeric AS credit
  FROM journal_entry_lines jel
  JOIN journal_entries je ON je.id = jel.journal_entry_id
  WHERE je.company_id = p_company_id
    AND je.status IN ('posted', 'reversed')
    AND je.entry_date < p_period_start
    AND substr(jel.account_number, 1, 1) BETWEEN '1' AND '2'
  GROUP BY jel.account_number;
$$;

GRANT EXECUTE ON FUNCTION compute_prior_opening_balances(uuid, date) TO authenticated;

NOTIFY pgrst, 'reload schema';
