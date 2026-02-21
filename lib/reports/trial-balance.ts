import { createClient } from '@/lib/supabase/server'
import { fetchAllRows } from '@/lib/supabase/fetch-all'
import type { TrialBalanceRow } from '@/types'

/**
 * Generate trial balance (Saldobalans) for a fiscal period
 *
 * Aggregates all posted journal entry lines grouped by account number,
 * filtered by fiscal period. Verifies total debits = total credits.
 */
export async function generateTrialBalance(
  userId: string,
  fiscalPeriodId: string
): Promise<{
  rows: TrialBalanceRow[]
  totalDebit: number
  totalCredit: number
  isBalanced: boolean
}> {
  const supabase = await createClient()

  // Get all posted journal entry lines for this period, grouped by account
  const { data, error } = await supabase.rpc('generate_trial_balance', {
    p_user_id: userId,
    p_fiscal_period_id: fiscalPeriodId,
  })

  if (error) {
    // Fallback: manual aggregation via SQL
    return generateTrialBalanceManual(userId, fiscalPeriodId)
  }

  if (data) {
    const rows = data as TrialBalanceRow[]
    const totalDebit = rows.reduce((sum, r) => sum + r.closing_debit, 0)
    const totalCredit = rows.reduce((sum, r) => sum + r.closing_credit, 0)

    return {
      rows,
      totalDebit: Math.round(totalDebit * 100) / 100,
      totalCredit: Math.round(totalCredit * 100) / 100,
      isBalanced: Math.abs(totalDebit - totalCredit) < 0.01,
    }
  }

  return generateTrialBalanceManual(userId, fiscalPeriodId)
}

/**
 * Manual trial balance generation using direct queries
 */
async function generateTrialBalanceManual(
  userId: string,
  fiscalPeriodId: string
): Promise<{
  rows: TrialBalanceRow[]
  totalDebit: number
  totalCredit: number
  isBalanced: boolean
}> {
  const supabase = await createClient()

  // Get all journal entry lines for posted entries in this period
  const { data: entries, error: entriesError } = await supabase
    .from('journal_entries')
    .select('id')
    .eq('user_id', userId)
    .eq('fiscal_period_id', fiscalPeriodId)
    .eq('status', 'posted')

  if (entriesError || !entries || entries.length === 0) {
    return { rows: [], totalDebit: 0, totalCredit: 0, isBalanced: true }
  }

  const entryIds = entries.map((e) => e.id)

  const { data: lines, error: linesError } = await supabase
    .from('journal_entry_lines')
    .select('account_number, debit_amount, credit_amount')
    .in('journal_entry_id', entryIds)

  if (linesError || !lines) {
    return { rows: [], totalDebit: 0, totalCredit: 0, isBalanced: true }
  }

  // Get account names
  const accounts = await fetchAllRows<{ account_number: string; account_name: string; account_class: number }>(({ from, to }) =>
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
  const balances = new Map<
    string,
    { debit: number; credit: number }
  >()

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

  // Sort by account number
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
