import type { SupabaseClient } from '@supabase/supabase-js'
import { fetchAllRows } from '@/lib/supabase/fetch-all'

/**
 * Get opening balances (ingående balans) for a fiscal period.
 *
 * Uses the opening_balance_entry set by year-end closing when available
 * (O(accounts) — typically ~50 rows). Falls back to summing all entries
 * prior to the period start date via a joined query (O(all_prior_lines) —
 * expensive for companies that haven't run year-end closing).
 *
 * Returns per-account debit/credit opening balances and the OB entry ID
 * (if any) so the caller can exclude it from period queries to prevent
 * double-counting.
 *
 * NOTE: The account range filter (accountFrom/accountTo in the GL) is
 * applied post-hoc by the caller, not here. This is consistent with the
 * existing behavior and avoids complicating the queries for the common
 * unfiltered case.
 */
export async function getOpeningBalances(
  supabase: SupabaseClient,
  userId: string,
  period: { period_start: string; opening_balance_entry_id: string | null } | null
): Promise<{
  balances: Map<string, { debit: number; credit: number }>
  obEntryId: string | null
}> {
  const balances = new Map<string, { debit: number; credit: number }>()

  if (!period) {
    return { balances, obEntryId: null }
  }

  const obEntryId = period.opening_balance_entry_id

  if (obEntryId) {
    // Use the explicit opening balance entry (set by year-end closing).
    // Typically ~50 rows — one per balance sheet account. Uses fetchAllRows
    // for consistency (avoids silent truncation) and joins journal_entries
    // to enforce user_id ownership (defense in depth alongside RLS).
    const obLines = await fetchAllRows<{
      account_number: string
      debit_amount: number
      credit_amount: number
    }>(({ from, to }) =>
      supabase
        .from('journal_entry_lines')
        .select('account_number, debit_amount, credit_amount, journal_entries!inner(user_id)')
        .eq('journal_entry_id', obEntryId)
        .eq('journal_entries.user_id', userId)
        .range(from, to)
    )

    for (const line of obLines) {
      const existing = balances.get(line.account_number) || { debit: 0, credit: 0 }
      existing.debit += Number(line.debit_amount) || 0
      existing.credit += Number(line.credit_amount) || 0
      balances.set(line.account_number, existing)
    }
  } else {
    // Fallback: compute from all entries dated before this period's start.
    // This is expensive for multi-year companies that haven't run year-end
    // closing — consider prompting the user to close prior periods.
    const priorLines = await fetchAllRows<{
      account_number: string
      debit_amount: number
      credit_amount: number
    }>(({ from, to }) =>
      supabase
        .from('journal_entry_lines')
        .select('account_number, debit_amount, credit_amount, journal_entries!inner(user_id, status, entry_date)')
        .eq('journal_entries.user_id', userId)
        .in('journal_entries.status', ['posted', 'reversed'])
        .lt('journal_entries.entry_date', period.period_start)
        .range(from, to)
    )

    for (const line of priorLines) {
      const existing = balances.get(line.account_number) || { debit: 0, credit: 0 }
      existing.debit += Number(line.debit_amount) || 0
      existing.credit += Number(line.credit_amount) || 0
      balances.set(line.account_number, existing)
    }
  }

  return { balances, obEntryId }
}
