import type { SupabaseClient } from '@supabase/supabase-js'
import { fetchAllRows } from '@/lib/supabase/fetch-all'
import type { TrialBalanceRow } from '@/types'

/**
 * Generate trial balance (Saldobalans) for a fiscal period.
 *
 * Uses a single joined query (journal_entry_lines → journal_entries)
 * with pagination to handle any number of entries. Avoids the broken
 * .in(entryIds) pattern that silently truncated at 1000 rows.
 */
export async function generateTrialBalance(
  supabase: SupabaseClient,
  userId: string,
  fiscalPeriodId: string
): Promise<{
  rows: TrialBalanceRow[]
  totalDebit: number
  totalCredit: number
  isBalanced: boolean
}> {

  // Single joined query — no entry ID array, no URL length limit
  const lines = await fetchAllRows<{
    account_number: string
    debit_amount: number
    credit_amount: number
  }>(({ from, to }) =>
    supabase
      .from('journal_entry_lines')
      .select('account_number, debit_amount, credit_amount, journal_entries!inner()')
      .eq('journal_entries.user_id', userId)
      .eq('journal_entries.fiscal_period_id', fiscalPeriodId)
      .in('journal_entries.status', ['posted', 'reversed'])
      .range(from, to)
  )

  if (lines.length === 0) {
    return { rows: [], totalDebit: 0, totalCredit: 0, isBalanced: true }
  }

  // Get account names
  const accounts = await fetchAllRows<{
    account_number: string
    account_name: string
    account_class: number
  }>(({ from, to }) =>
    supabase
      .from('chart_of_accounts')
      .select('account_number, account_name, account_class')
      .eq('user_id', userId)
      .range(from, to)
  )

  const accountMap = new Map<string, { name: string; class: number }>()
  for (const acc of accounts) {
    accountMap.set(acc.account_number, {
      name: acc.account_name,
      class: acc.account_class,
    })
  }

  // Aggregate by account
  const balances = new Map<string, { debit: number; credit: number }>()

  for (const line of lines) {
    const existing = balances.get(line.account_number) || { debit: 0, credit: 0 }
    existing.debit += Number(line.debit_amount) || 0
    existing.credit += Number(line.credit_amount) || 0
    balances.set(line.account_number, existing)
  }

  // Build rows
  const rows: TrialBalanceRow[] = []
  for (const [accountNumber, balance] of balances) {
    const accountInfo = accountMap.get(accountNumber) || {
      name: `Konto ${accountNumber}`,
      class: parseInt(accountNumber[0]) || 0,
    }

    rows.push({
      account_number: accountNumber,
      account_name: accountInfo.name,
      account_class: accountInfo.class,
      opening_debit: 0,
      opening_credit: 0,
      period_debit: Math.round(balance.debit * 100) / 100,
      period_credit: Math.round(balance.credit * 100) / 100,
      closing_debit: Math.round(balance.debit * 100) / 100,
      closing_credit: Math.round(balance.credit * 100) / 100,
    })
  }

  rows.sort((a, b) => a.account_number.localeCompare(b.account_number))

  const totalDebit = Math.round(rows.reduce((sum, r) => sum + r.closing_debit, 0) * 100) / 100
  const totalCredit = Math.round(rows.reduce((sum, r) => sum + r.closing_credit, 0) * 100) / 100

  return {
    rows,
    totalDebit,
    totalCredit,
    isBalanced: Math.abs(totalDebit - totalCredit) < 0.01,
  }
}
