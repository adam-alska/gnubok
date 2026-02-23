import { createClient } from '@/lib/supabase/server'
import { fetchAllRows } from '@/lib/supabase/fetch-all'
import type { SIEExportOptions, JournalEntry, JournalEntryLine, BASAccount } from '@/types'

/**
 * Generate SIE4 export file
 *
 * SIE (Standard Import Export) is the Swedish standard format for
 * transferring accounting data between systems.
 *
 * Format: CP437 encoded text file (we'll use UTF-8 as modern systems accept it)
 * Line format: #TAG field1 field2 ...
 */
export async function generateSIEExport(
  userId: string,
  options: SIEExportOptions
): Promise<string> {
  const supabase = await createClient()

  // Fetch fiscal period
  const { data: period } = await supabase
    .from('fiscal_periods')
    .select('*')
    .eq('id', options.fiscal_period_id)
    .eq('user_id', userId)
    .single()

  if (!period) {
    throw new Error('Fiscal period not found')
  }

  // Fetch all accounts
  const accounts = await fetchAllRows(({ from, to }) =>
    supabase
      .from('chart_of_accounts')
      .select('*')
      .eq('user_id', userId)
      .eq('is_active', true)
      .order('account_number')
      .range(from, to)
  )

  // Fetch all posted journal entries with lines
  const { data: entries } = await supabase
    .from('journal_entries')
    .select('*, lines:journal_entry_lines(*)')
    .eq('user_id', userId)
    .eq('fiscal_period_id', options.fiscal_period_id)
    .eq('status', 'posted')
    .order('voucher_number')

  // Fetch cost centers and projects for dimension records
  const { data: costCenters } = await supabase
    .from('cost_centers')
    .select('*')
    .eq('user_id', userId)
    .eq('is_active', true)
    .order('code')

  const { data: projects } = await supabase
    .from('projects')
    .select('*')
    .eq('user_id', userId)
    .eq('is_active', true)
    .order('code')

  const lines: string[] = []
  const now = new Date()

  // === Header ===
  lines.push('#FLAGGA 0')
  lines.push('#FORMAT PC8')
  lines.push('#SIETYP 4')
  lines.push(`#PROGRAM "${options.program_name || 'ERPBase'}" "1.0"`)
  lines.push(`#GEN ${formatSIEDate(now)}`)

  if (options.org_number) {
    lines.push(`#ORGNR ${options.org_number}`)
  }

  lines.push(`#FNAMN "${escapeQuotes(options.company_name)}"`)

  // === Fiscal year ===
  // #RAR 0 start end (current year)
  // Use date strings directly to avoid timezone conversion issues
  lines.push(`#RAR 0 ${dateStringToSIE(period.period_start)} ${dateStringToSIE(period.period_end)}`)

  // === Dimension definitions ===
  // SIE standard: dimension 1 = kostnadsställe, dimension 6 = projekt
  const hasCostCenters = costCenters && costCenters.length > 0
  const hasProjects = projects && projects.length > 0

  if (hasCostCenters) {
    lines.push('#DIM 1 "Kostnadsställe"')
  }
  if (hasProjects) {
    lines.push('#DIM 6 "Projekt"')
  }

  // === Dimension objects (#OBJEKT) ===
  for (const cc of costCenters || []) {
    lines.push(`#OBJEKT 1 "${escapeQuotes(cc.code)}" "${escapeQuotes(cc.name)}"`)
  }
  for (const proj of projects || []) {
    lines.push(`#OBJEKT 6 "${escapeQuotes(proj.code)}" "${escapeQuotes(proj.name)}"`)
  }

  // === Chart of accounts ===
  for (const account of (accounts as BASAccount[]) || []) {
    lines.push(`#KONTO ${account.account_number} "${escapeQuotes(account.account_name)}"`)

    // #SRU records from chart_of_accounts.sru_code
    if (account.sru_code) {
      lines.push(`#SRU ${account.account_number} ${account.sru_code}`)
    }
  }

  // === Opening balances (IB) ===
  // For now, all zeros unless we have data from previous periods
  // #IB 0 accountNumber amount

  // === Journal entries (VER + TRANS) ===
  for (const entry of (entries as JournalEntry[]) || []) {
    const entryLines = (entry.lines as JournalEntryLine[]) || []
    const entryDate = dateStringToSIE(entry.entry_date)
    const series = entry.voucher_series || 'A'
    const description = escapeQuotes(entry.description)

    lines.push(`#VER "${series}" ${entry.voucher_number} ${entryDate} "${description}"`)
    lines.push('{')

    for (const line of entryLines) {
      const amount =
        line.debit_amount > 0
          ? line.debit_amount
          : -line.credit_amount

      const lineDesc = line.line_description
        ? ` "${escapeQuotes(line.line_description)}"`
        : ''

      // Build dimension object list for #TRANS line
      const dimParts: string[] = []
      if (line.cost_center) {
        dimParts.push(`1 "${escapeQuotes(line.cost_center)}"`)
      }
      if (line.project) {
        dimParts.push(`6 "${escapeQuotes(line.project)}"`)
      }
      const objList = dimParts.length > 0 ? `{${dimParts.join(' ')}}` : '{}'

      lines.push(`\t#TRANS ${line.account_number} ${objList} ${formatAmount(amount)} ${entryDate}${lineDesc}`)
    }

    lines.push('}')
  }

  // === Closing balances (UB for balance sheet, RES for income statement) ===
  // Calculate balances from journal entries
  const accountBalances = calculateBalances(entries as JournalEntry[])

  for (const [accountNumber, balance] of accountBalances) {
    const accountClass = parseInt(accountNumber[0])
    if (accountClass <= 2) {
      // Balance sheet account: #UB
      lines.push(`#UB 0 ${accountNumber} ${formatAmount(balance)}`)
    } else {
      // Income statement account: #RES
      lines.push(`#RES 0 ${accountNumber} ${formatAmount(balance)}`)
    }
  }

  return lines.join('\r\n') + '\r\n'
}

/**
 * Format a Date object for SIE: YYYYMMDD
 */
function formatSIEDate(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}${m}${d}`
}

/**
 * Convert a "YYYY-MM-DD" date string to SIE format "YYYYMMDD"
 * without going through Date object (avoids timezone issues)
 */
function dateStringToSIE(dateStr: string): string {
  return dateStr.replace(/-/g, '')
}

/**
 * Format amount for SIE (no thousands separator, . as decimal)
 */
function formatAmount(amount: number): string {
  const rounded = Math.round(amount * 100) / 100
  return rounded.toFixed(2)
}

/**
 * Escape double quotes in SIE strings
 */
function escapeQuotes(str: string): string {
  return str.replace(/"/g, '\\"')
}

/**
 * Calculate net balances per account from journal entries
 */
function calculateBalances(
  entries: JournalEntry[]
): Map<string, number> {
  const balances = new Map<string, number>()

  for (const entry of entries || []) {
    const lines = (entry.lines as JournalEntryLine[]) || []
    for (const line of lines) {
      const current = balances.get(line.account_number) || 0
      const netAmount = (Number(line.debit_amount) || 0) - (Number(line.credit_amount) || 0)
      balances.set(line.account_number, Math.round((current + netAmount) * 100) / 100)
    }
  }

  return balances
}
