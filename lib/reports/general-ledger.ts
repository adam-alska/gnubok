import { createClient } from '@/lib/supabase/server'
import { fetchAllRows } from '@/lib/supabase/fetch-all'

export interface GeneralLedgerLine {
  date: string
  voucher_series: string
  voucher_number: number
  description: string
  source_type: string
  debit: number
  credit: number
  balance: number
}

export interface GeneralLedgerAccount {
  account_number: string
  account_name: string
  opening_balance: number
  lines: GeneralLedgerLine[]
  closing_balance: number
  total_debit: number
  total_credit: number
}

export interface GeneralLedgerReport {
  accounts: GeneralLedgerAccount[]
  period: { start: string; end: string }
}

/**
 * Generate general ledger (huvudbok) for a fiscal period.
 * BFL 5 kap. 1 § — systematisk ordning: all transactions grouped by account.
 */
export async function generateGeneralLedger(
  userId: string,
  periodId: string,
  accountFrom?: string,
  accountTo?: string
): Promise<GeneralLedgerReport> {
  const supabase = await createClient()

  // Get fiscal period dates
  const { data: period } = await supabase
    .from('fiscal_periods')
    .select('period_start, period_end')
    .eq('id', periodId)
    .eq('user_id', userId)
    .single()

  if (!period) {
    return { accounts: [], period: { start: '', end: '' } }
  }

  // Fetch posted entries for this period
  const { data: entries } = await supabase
    .from('journal_entries')
    .select('id, entry_date, voucher_number, voucher_series, description, source_type')
    .eq('user_id', userId)
    .eq('fiscal_period_id', periodId)
    .eq('status', 'posted')

  if (!entries || entries.length === 0) {
    return { accounts: [], period: { start: period.period_start, end: period.period_end } }
  }

  const entryIds = entries.map((e) => e.id)
  const entryMap = new Map(entries.map((e) => [e.id, e]))

  // Fetch lines for these entries
  const { data: lines } = await supabase
    .from('journal_entry_lines')
    .select('account_number, debit_amount, credit_amount, journal_entry_id')
    .in('journal_entry_id', entryIds)

  if (!lines) {
    return { accounts: [], period: { start: period.period_start, end: period.period_end } }
  }

  // Fetch account names
  const accounts = await fetchAllRows<{ account_number: string; account_name: string }>(({ from, to }) =>
    supabase
      .from('chart_of_accounts')
      .select('account_number, account_name')
      .eq('user_id', userId)
      .range(from, to)
  )

  const accountNameMap = new Map<string, string>()
  for (const acc of accounts) {
    accountNameMap.set(acc.account_number, acc.account_name)
  }

  // Compute opening balances: sum all posted lines from entries before this period
  const { data: priorEntries } = await supabase
    .from('journal_entries')
    .select('id')
    .eq('user_id', userId)
    .eq('status', 'posted')
    .lt('entry_date', period.period_start)

  const openingBalances = new Map<string, number>()

  if (priorEntries && priorEntries.length > 0) {
    const priorIds = priorEntries.map((e) => e.id)
    const { data: priorLines } = await supabase
      .from('journal_entry_lines')
      .select('account_number, debit_amount, credit_amount')
      .in('journal_entry_id', priorIds)

    for (const line of priorLines || []) {
      const current = openingBalances.get(line.account_number) || 0
      openingBalances.set(
        line.account_number,
        current + (Number(line.debit_amount) || 0) - (Number(line.credit_amount) || 0)
      )
    }
  }

  // Group lines by account
  const accountLines = new Map<string, GeneralLedgerLine[]>()

  for (const line of lines) {
    const entry = entryMap.get(line.journal_entry_id)
    if (!entry) continue

    const accNum = line.account_number
    if (!accountLines.has(accNum)) {
      accountLines.set(accNum, [])
    }

    accountLines.get(accNum)!.push({
      date: entry.entry_date,
      voucher_series: entry.voucher_series || 'A',
      voucher_number: entry.voucher_number,
      description: entry.description || '',
      source_type: entry.source_type || '',
      debit: Math.round((Number(line.debit_amount) || 0) * 100) / 100,
      credit: Math.round((Number(line.credit_amount) || 0) * 100) / 100,
      balance: 0, // computed below
    })
  }

  // Build account summaries
  const result: GeneralLedgerAccount[] = []

  for (const [accNum, accLines] of accountLines) {
    // Apply optional account range filter
    if (accountFrom && accNum < accountFrom) continue
    if (accountTo && accNum > accountTo) continue

    // Sort by date, then voucher number
    accLines.sort((a, b) => {
      const dateCompare = a.date.localeCompare(b.date)
      if (dateCompare !== 0) return dateCompare
      return a.voucher_number - b.voucher_number
    })

    const opening = Math.round((openingBalances.get(accNum) || 0) * 100) / 100
    let runningBalance = opening

    for (const line of accLines) {
      runningBalance += line.debit - line.credit
      line.balance = Math.round(runningBalance * 100) / 100
    }

    const totalDebit = accLines.reduce((sum, l) => sum + l.debit, 0)
    const totalCredit = accLines.reduce((sum, l) => sum + l.credit, 0)

    result.push({
      account_number: accNum,
      account_name: accountNameMap.get(accNum) || `Konto ${accNum}`,
      opening_balance: opening,
      lines: accLines,
      closing_balance: Math.round((opening + totalDebit - totalCredit) * 100) / 100,
      total_debit: Math.round(totalDebit * 100) / 100,
      total_credit: Math.round(totalCredit * 100) / 100,
    })
  }

  // Sort by account number
  result.sort((a, b) => a.account_number.localeCompare(b.account_number))

  return {
    accounts: result,
    period: { start: period.period_start, end: period.period_end },
  }
}
