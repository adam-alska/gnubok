import { createClient } from '@/lib/supabase/server'
import { fetchAllRows } from '@/lib/supabase/fetch-all'

export interface JournalRegisterLine {
  account_number: string
  account_name: string
  debit: number
  credit: number
}

export interface JournalRegisterEntry {
  voucher_series: string
  voucher_number: number
  date: string
  description: string
  source_type: string
  status: string
  lines: JournalRegisterLine[]
  total_debit: number
  total_credit: number
}

export interface JournalRegisterReport {
  entries: JournalRegisterEntry[]
  total_entries: number
  total_debit: number
  total_credit: number
  period: { start: string; end: string }
}

/**
 * Generate journal register (grundbok) for a fiscal period.
 * BFL 5 kap. 1 § — registreringsordning: all vouchers in chronological registration order.
 */
export async function generateJournalRegister(
  userId: string,
  periodId: string
): Promise<JournalRegisterReport> {
  const supabase = await createClient()

  // Get fiscal period dates
  const { data: period } = await supabase
    .from('fiscal_periods')
    .select('period_start, period_end')
    .eq('id', periodId)
    .eq('user_id', userId)
    .single()

  if (!period) {
    return { entries: [], total_entries: 0, total_debit: 0, total_credit: 0, period: { start: '', end: '' } }
  }

  // Fetch posted/reversed entries ordered by voucher series then number (registration order)
  const { data: entries } = await supabase
    .from('journal_entries')
    .select('id, entry_date, voucher_number, voucher_series, description, source_type, status')
    .eq('user_id', userId)
    .eq('fiscal_period_id', periodId)
    .in('status', ['posted', 'reversed'])
    .order('voucher_series', { ascending: true })
    .order('voucher_number', { ascending: true })

  if (!entries || entries.length === 0) {
    return { entries: [], total_entries: 0, total_debit: 0, total_credit: 0, period: { start: period.period_start, end: period.period_end } }
  }

  const entryIds = entries.map((e) => e.id)

  // Fetch lines for these entries
  const { data: lines } = await supabase
    .from('journal_entry_lines')
    .select('account_number, debit_amount, credit_amount, journal_entry_id')
    .in('journal_entry_id', entryIds)

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

  // Group lines by entry
  const linesByEntry = new Map<string, JournalRegisterLine[]>()
  for (const line of lines || []) {
    if (!linesByEntry.has(line.journal_entry_id)) {
      linesByEntry.set(line.journal_entry_id, [])
    }
    linesByEntry.get(line.journal_entry_id)!.push({
      account_number: line.account_number,
      account_name: accountNameMap.get(line.account_number) || `Konto ${line.account_number}`,
      debit: Math.round((Number(line.debit_amount) || 0) * 100) / 100,
      credit: Math.round((Number(line.credit_amount) || 0) * 100) / 100,
    })
  }

  // Build result
  const result: JournalRegisterEntry[] = entries.map((entry) => {
    const entryLines = linesByEntry.get(entry.id) || []
    // Sort lines by account number within each entry
    entryLines.sort((a, b) => a.account_number.localeCompare(b.account_number))

    const totalDebit = entryLines.reduce((sum, l) => sum + l.debit, 0)
    const totalCredit = entryLines.reduce((sum, l) => sum + l.credit, 0)

    return {
      voucher_series: entry.voucher_series || 'A',
      voucher_number: entry.voucher_number,
      date: entry.entry_date,
      description: entry.description || '',
      source_type: entry.source_type || '',
      status: entry.status,
      lines: entryLines,
      total_debit: Math.round(totalDebit * 100) / 100,
      total_credit: Math.round(totalCredit * 100) / 100,
    }
  })

  const grandTotalDebit = result.reduce((sum, e) => sum + e.total_debit, 0)
  const grandTotalCredit = result.reduce((sum, e) => sum + e.total_credit, 0)

  return {
    entries: result,
    total_entries: result.length,
    total_debit: Math.round(grandTotalDebit * 100) / 100,
    total_credit: Math.round(grandTotalCredit * 100) / 100,
    period: { start: period.period_start, end: period.period_end },
  }
}
