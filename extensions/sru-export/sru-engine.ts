import { createClient } from '@/lib/supabase/server'
import { fetchAllRows } from '@/lib/supabase/fetch-all'
import type { JournalEntry, JournalEntryLine } from '@/types'

/**
 * SRU aggregation engine
 *
 * Fetches posted journal entries for a fiscal period, computes net balance
 * per account, and groups by sru_code from chart_of_accounts.
 */

export interface SRUBalance {
  sruCode: string
  amount: number
  accounts: Array<{
    accountNumber: string
    accountName: string
    amount: number
  }>
}

export interface SRUCoverageStats {
  totalAccounts: number
  accountsWithSRU: number
  accountsWithoutSRU: number
  coveragePercent: number
  missingAccounts: Array<{
    accountNumber: string
    accountName: string
  }>
}

/**
 * Aggregate account balances by SRU code for a given fiscal period.
 * Returns a Map of sru_code → summed amount, plus per-account detail.
 */
export async function aggregateBalancesBySRU(
  userId: string,
  fiscalPeriodId: string
): Promise<Map<string, SRUBalance>> {
  const supabase = await createClient()

  // Fetch all posted journal entries with lines for this period
  const { data: entries, error: entriesError } = await supabase
    .from('journal_entries')
    .select('*, lines:journal_entry_lines(*)')
    .eq('user_id', userId)
    .eq('fiscal_period_id', fiscalPeriodId)
    .eq('status', 'posted')

  if (entriesError) {
    throw new Error(`Failed to fetch journal entries: ${entriesError.message}`)
  }

  // Fetch chart of accounts with SRU codes
  const accounts = await fetchAllRows<{ account_number: string; account_name: string; sru_code: string | null; normal_balance: string }>(({ from, to }) =>
    supabase
      .from('chart_of_accounts')
      .select('account_number, account_name, sru_code, normal_balance')
      .eq('user_id', userId)
      .eq('is_active', true)
      .range(from, to)
  )

  // Build lookup maps
  const accountSRUMap = new Map<string, string>()
  const accountNameMap = new Map<string, string>()
  for (const acc of accounts) {
    if (acc.sru_code) {
      accountSRUMap.set(acc.account_number, acc.sru_code)
    }
    accountNameMap.set(acc.account_number, acc.account_name)
  }

  // Calculate net balances per account (debit - credit)
  const accountBalances = new Map<string, number>()
  for (const entry of (entries as JournalEntry[]) || []) {
    const lines = (entry.lines as JournalEntryLine[]) || []
    for (const line of lines) {
      const current = accountBalances.get(line.account_number) || 0
      const netAmount = (Number(line.debit_amount) || 0) - (Number(line.credit_amount) || 0)
      accountBalances.set(line.account_number, current + netAmount)
    }
  }

  // Group balances by SRU code
  const sruBalances = new Map<string, SRUBalance>()

  for (const [accountNumber, balance] of accountBalances) {
    if (Math.abs(balance) < 0.01) continue

    const sruCode = accountSRUMap.get(accountNumber)
    if (!sruCode) continue

    let entry = sruBalances.get(sruCode)
    if (!entry) {
      entry = { sruCode, amount: 0, accounts: [] }
      sruBalances.set(sruCode, entry)
    }

    entry.amount += balance
    entry.accounts.push({
      accountNumber,
      accountName: accountNameMap.get(accountNumber) || `Konto ${accountNumber}`,
      amount: Math.round(balance),
    })
  }

  // Round totals
  for (const entry of sruBalances.values()) {
    entry.amount = Math.round(entry.amount)
  }

  return sruBalances
}

/**
 * Get SRU code coverage stats for a user's chart of accounts.
 * Returns how many accounts have vs lack SRU codes.
 */
export async function getSRUCoverage(userId: string): Promise<SRUCoverageStats> {
  const supabase = await createClient()

  const accounts = await fetchAllRows<{ account_number: string; account_name: string; sru_code: string | null }>(({ from, to }) =>
    supabase
      .from('chart_of_accounts')
      .select('account_number, account_name, sru_code')
      .eq('user_id', userId)
      .eq('is_active', true)
      .order('account_number')
      .range(from, to)
  )

  const withSRU = accounts.filter((a) => a.sru_code)
  const withoutSRU = accounts.filter((a) => !a.sru_code)

  return {
    totalAccounts: accounts.length,
    accountsWithSRU: withSRU.length,
    accountsWithoutSRU: withoutSRU.length,
    coveragePercent: accounts.length > 0
      ? Math.round((withSRU.length / accounts.length) * 100)
      : 0,
    missingAccounts: withoutSRU.map((a) => ({
      accountNumber: a.account_number,
      accountName: a.account_name,
    })),
  }
}
