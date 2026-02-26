/**
 * SIE Import Engine
 *
 * Executes the actual import of SIE data into the database.
 * Creates fiscal periods, opening balance entries, and journal entries.
 * All operations are wrapped to ensure atomic behavior.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { createJournalEntry } from '@/lib/bookkeeping/engine'
import type {
  ParsedSIEFile,
  AccountMapping,
  ImportResult,
  ImportPreview,
  SIEImport,
} from './types'
import type { CreateJournalEntryLineInput } from '@/types'
import { mappingsToMap, getMappingStats } from './account-mapper'
import { calculateFileHash } from './sie-parser'

/**
 * Format a date to ISO date string (YYYY-MM-DD)
 */
function formatDate(date: Date): string {
  return date.toISOString().split('T')[0]
}

/**
 * Generate a preview of what will be imported
 */
export function generateImportPreview(
  parsed: ParsedSIEFile,
  mappings: AccountMapping[]
): ImportPreview {
  // Calculate opening balance totals
  const currentYearBalances = parsed.openingBalances.filter((b) => b.yearIndex === 0)
  let totalDebit = 0
  let totalCredit = 0

  for (const balance of currentYearBalances) {
    if (balance.amount > 0) {
      totalDebit += balance.amount
    } else {
      totalCredit += Math.abs(balance.amount)
    }
  }

  const mappingStats = getMappingStats(mappings)

  return {
    companyName: parsed.header.companyName,
    orgNumber: parsed.header.orgNumber,
    fiscalYearStart: parsed.stats.fiscalYearStart,
    fiscalYearEnd: parsed.stats.fiscalYearEnd,
    accountCount: parsed.stats.totalAccounts,
    voucherCount: parsed.stats.totalVouchers,
    transactionLineCount: parsed.stats.totalTransactionLines,
    openingBalanceTotal: totalDebit,
    trialBalance: {
      totalDebit,
      totalCredit,
      isBalanced: Math.abs(totalDebit - totalCredit) < 0.01,
    },
    mappingStatus: {
      total: mappingStats.total,
      mapped: mappingStats.mapped,
      unmapped: mappingStats.unmapped,
      lowConfidence: mappingStats.lowConfidence,
    },
    issues: parsed.issues,
  }
}

/**
 * Check if a file has already been imported
 */
export async function checkDuplicateImport(
  supabase: SupabaseClient,
  userId: string,
  fileContent: string
): Promise<SIEImport | null> {
  const fileHash = await calculateFileHash(fileContent)

  const { data } = await supabase
    .from('sie_imports')
    .select('*')
    .eq('user_id', userId)
    .eq('file_hash', fileHash)
    .single()

  return data as SIEImport | null
}

/**
 * Create a fiscal period if one doesn't exist for the date range
 */
async function ensureFiscalPeriod(
  supabase: SupabaseClient,
  userId: string,
  startDate: Date,
  endDate: Date
): Promise<string> {
  // Check for an existing period that contains the SIE date range
  const { data: containing } = await supabase
    .from('fiscal_periods')
    .select('id')
    .eq('user_id', userId)
    .lte('period_start', formatDate(startDate))
    .gte('period_end', formatDate(endDate))
    .single()

  if (containing) {
    return containing.id
  }

  // Check for any overlapping period (DB exclusion constraint would reject
  // a new insert that overlaps). Use the overlapping period instead.
  const { data: overlapping } = await supabase
    .from('fiscal_periods')
    .select('id')
    .eq('user_id', userId)
    .lte('period_start', formatDate(endDate))
    .gte('period_end', formatDate(startDate))
    .order('period_start', { ascending: false })
    .limit(1)

  if (overlapping && overlapping.length > 0) {
    return overlapping[0].id
  }

  // Create new fiscal period
  const startYear = startDate.getFullYear()
  const endYear = endDate.getFullYear()
  const name = startYear === endYear
    ? `Räkenskapsår ${startYear}`
    : `Räkenskapsår ${startYear}/${endYear}`

  const { data: newPeriod, error } = await supabase
    .from('fiscal_periods')
    .insert({
      user_id: userId,
      name,
      period_start: formatDate(startDate),
      period_end: formatDate(endDate),
      is_closed: false,
      opening_balances_set: false,
    })
    .select()
    .single()

  if (error || !newPeriod) {
    throw new Error(`Failed to create fiscal period: ${error?.message}`)
  }

  return newPeriod.id
}

/**
 * Create opening balance journal entry from IB amounts
 */
async function createOpeningBalanceEntry(
  supabase: SupabaseClient,
  userId: string,
  fiscalPeriodId: string,
  parsed: ParsedSIEFile,
  accountMap: Map<string, string>
): Promise<string | null> {
  const currentYearBalances = parsed.openingBalances.filter((b) => b.yearIndex === 0)

  if (currentYearBalances.length === 0) {
    return null
  }

  // Build journal entry lines
  const lines: CreateJournalEntryLineInput[] = []

  for (const balance of currentYearBalances) {
    const targetAccount = accountMap.get(balance.account)
    if (!targetAccount) {
      continue // Skip unmapped accounts
    }

    // Opening balances: positive = debit, negative = credit
    if (balance.amount > 0) {
      lines.push({
        account_number: targetAccount,
        debit_amount: balance.amount,
        credit_amount: 0,
        line_description: `IB ${balance.account}`,
      })
    } else if (balance.amount < 0) {
      lines.push({
        account_number: targetAccount,
        debit_amount: 0,
        credit_amount: Math.abs(balance.amount),
        line_description: `IB ${balance.account}`,
      })
    }
  }

  if (lines.length === 0) {
    return null
  }

  // Check if balanced
  const totalDebit = lines.reduce((sum, l) => sum + l.debit_amount, 0)
  const totalCredit = lines.reduce((sum, l) => sum + l.credit_amount, 0)
  const diff = Math.abs(totalDebit - totalCredit)

  // If not balanced, add an adjustment line to equity
  if (diff > 0.01) {
    const adjustment = totalDebit - totalCredit
    if (adjustment > 0) {
      lines.push({
        account_number: '2099', // Årets resultat (or similar equity account)
        debit_amount: 0,
        credit_amount: adjustment,
        line_description: 'Balanseringsdifferens',
      })
    } else {
      lines.push({
        account_number: '2099',
        debit_amount: Math.abs(adjustment),
        credit_amount: 0,
        line_description: 'Balanseringsdifferens',
      })
    }
  }

  const fiscalYearStart = parsed.stats.fiscalYearStart
  const entryDate = fiscalYearStart ? formatDate(fiscalYearStart) : formatDate(new Date())

  const entry = await createJournalEntry(supabase, userId, {
    fiscal_period_id: fiscalPeriodId,
    entry_date: entryDate,
    description: 'Ingående balanser från SIE-import',
    source_type: 'opening_balance',
    voucher_series: 'A',
    lines,
  })

  return entry.id
}

/**
 * Create journal entries from vouchers using batch insert for performance
 */
async function importVouchers(
  supabase: SupabaseClient,
  userId: string,
  fiscalPeriodId: string,
  parsed: ParsedSIEFile,
  accountMap: Map<string, string>,
  voucherSeries: string
): Promise<{ created: number; ids: string[]; errors: string[] }> {
  const results = {
    created: 0,
    ids: [] as string[],
    errors: [] as string[],
  }

  // Pre-filter and prepare all valid vouchers
  interface PreparedVoucher {
    date: string
    description: string
    lines: { account_number: string; debit_amount: number; credit_amount: number; line_description: string | null }[]
  }

  const preparedVouchers: PreparedVoucher[] = []

  for (const voucher of parsed.vouchers) {
    const lines: PreparedVoucher['lines'] = []
    let hasUnmappedAccount = false

    for (const line of voucher.lines) {
      const targetAccount = accountMap.get(line.account)

      if (!targetAccount) {
        hasUnmappedAccount = true
        results.errors.push(
          `Voucher ${voucher.series}${voucher.number}: Unmapped account ${line.account}`
        )
        continue
      }

      // In SIE, amount is positive for debit, negative for credit
      if (line.amount > 0) {
        lines.push({
          account_number: targetAccount,
          debit_amount: Math.round(line.amount * 100) / 100,
          credit_amount: 0,
          line_description: line.description || null,
        })
      } else if (line.amount < 0) {
        lines.push({
          account_number: targetAccount,
          debit_amount: 0,
          credit_amount: Math.round(Math.abs(line.amount) * 100) / 100,
          line_description: line.description || null,
        })
      }
    }

    // Skip vouchers with unmapped accounts or too few lines
    if (hasUnmappedAccount || lines.length < 2) {
      continue
    }

    // Validate balance
    const totalDebit = lines.reduce((sum, l) => sum + l.debit_amount, 0)
    const totalCredit = lines.reduce((sum, l) => sum + l.credit_amount, 0)
    if (Math.abs(totalDebit - totalCredit) > 0.01) {
      results.errors.push(
        `Voucher ${voucher.series}${voucher.number}: Not balanced (debit: ${totalDebit}, credit: ${totalCredit})`
      )
      continue
    }

    preparedVouchers.push({
      date: formatDate(voucher.date),
      description: voucher.description || `Import: ${voucher.series}${voucher.number}`,
      lines,
    })
  }

  if (preparedVouchers.length === 0) {
    return results
  }

  // Get all unique account numbers used
  const allAccountNumbers = new Set<string>()
  for (const v of preparedVouchers) {
    for (const l of v.lines) {
      allAccountNumbers.add(l.account_number)
    }
  }

  // Resolve all account IDs in one query
  const { data: accounts } = await supabase
    .from('chart_of_accounts')
    .select('id, account_number')
    .eq('user_id', userId)
    .in('account_number', [...allAccountNumbers])

  const accountIdMap = new Map<string, string>()
  for (const acc of accounts || []) {
    accountIdMap.set(acc.account_number, acc.id)
  }

  // Get starting voucher number
  const { data: startNumber } = await supabase.rpc('next_voucher_number', {
    p_user_id: userId,
    p_fiscal_period_id: fiscalPeriodId,
    p_series: voucherSeries,
  })

  let currentVoucherNumber = (startNumber as number) || 1

  // Batch insert journal entries (in chunks of 100)
  const BATCH_SIZE = 100

  for (let batchStart = 0; batchStart < preparedVouchers.length; batchStart += BATCH_SIZE) {
    const batch = preparedVouchers.slice(batchStart, batchStart + BATCH_SIZE)

    // Prepare journal entry headers
    const entryInserts = batch.map((v, i) => ({
      user_id: userId,
      fiscal_period_id: fiscalPeriodId,
      voucher_number: currentVoucherNumber + batchStart + i,
      voucher_series: voucherSeries,
      entry_date: v.date,
      description: v.description,
      source_type: 'import',
      status: 'posted',
      committed_at: new Date().toISOString(),
    }))

    // Insert headers
    const { data: entries, error: entryError } = await supabase
      .from('journal_entries')
      .insert(entryInserts)
      .select('id')

    if (entryError || !entries) {
      results.errors.push(`Batch ${Math.floor(batchStart / BATCH_SIZE) + 1}: ${entryError?.message || 'Failed to insert entries'}`)
      continue
    }

    // Prepare all lines for this batch
    const allLines: {
      journal_entry_id: string
      account_number: string
      account_id: string | null
      debit_amount: number
      credit_amount: number
      currency: string
      line_description: string | null
      sort_order: number
    }[] = []

    for (let i = 0; i < batch.length; i++) {
      const entryId = entries[i]?.id
      if (!entryId) continue

      const voucher = batch[i]
      voucher.lines.forEach((line, lineIndex) => {
        allLines.push({
          journal_entry_id: entryId,
          account_number: line.account_number,
          account_id: accountIdMap.get(line.account_number) || null,
          debit_amount: line.debit_amount,
          credit_amount: line.credit_amount,
          currency: 'SEK',
          line_description: line.line_description,
          sort_order: lineIndex,
        })
      })

      results.ids.push(entryId)
      results.created++
    }

    // Insert all lines for this batch
    if (allLines.length > 0) {
      const { error: linesError } = await supabase
        .from('journal_entry_lines')
        .insert(allLines)

      if (linesError) {
        results.errors.push(`Batch ${Math.floor(batchStart / BATCH_SIZE) + 1} lines: ${linesError.message}`)
      }
    }
  }

  return results
}

/**
 * Record the import in the database
 */
async function recordImport(
  supabase: SupabaseClient,
  userId: string,
  parsed: ParsedSIEFile,
  fileContent: string,
  filename: string,
  result: ImportResult
): Promise<string> {
  const fileHash = await calculateFileHash(fileContent)

  const { data, error } = await supabase
    .from('sie_imports')
    .insert({
      user_id: userId,
      filename,
      file_hash: fileHash,
      org_number: parsed.header.orgNumber,
      company_name: parsed.header.companyName,
      sie_type: parsed.header.sieType,
      fiscal_year_start: parsed.stats.fiscalYearStart
        ? formatDate(parsed.stats.fiscalYearStart)
        : null,
      fiscal_year_end: parsed.stats.fiscalYearEnd
        ? formatDate(parsed.stats.fiscalYearEnd)
        : null,
      accounts_count: parsed.stats.totalAccounts,
      transactions_count: result.journalEntriesCreated,
      status: result.success ? 'completed' : 'failed',
      error_message: result.errors.length > 0 ? result.errors.join('; ') : null,
      fiscal_period_id: result.fiscalPeriodId,
      opening_balance_entry_id: result.openingBalanceEntryId,
      imported_at: new Date().toISOString(),
    })
    .select('id')
    .single()

  if (error || !data) {
    throw new Error(`Failed to record import: ${error?.message}`)
  }

  return data.id
}

/**
 * Save account mappings to the database for future use
 */
export async function saveMappings(
  supabase: SupabaseClient,
  userId: string,
  mappings: AccountMapping[]
): Promise<void> {
  // Filter to only mapped accounts
  const mappingsToSave = mappings
    .filter((m) => m.targetAccount)
    .map((m) => ({
      user_id: userId,
      source_account: m.sourceAccount,
      source_name: m.sourceName,
      target_account: m.targetAccount,
      confidence: m.confidence,
      match_type: m.matchType,
    }))

  if (mappingsToSave.length === 0) return

  // Batch upsert in chunks of 100
  const BATCH_SIZE = 100
  for (let i = 0; i < mappingsToSave.length; i += BATCH_SIZE) {
    const batch = mappingsToSave.slice(i, i + BATCH_SIZE)
    await supabase
      .from('sie_account_mappings')
      .upsert(batch, {
        onConflict: 'user_id,source_account',
      })
  }
}

/**
 * Load existing account mappings for a user
 */
export async function loadMappings(supabase: SupabaseClient, userId: string): Promise<Map<string, AccountMapping>> {
  const { data } = await supabase
    .from('sie_account_mappings')
    .select('*')
    .eq('user_id', userId)

  const map = new Map<string, AccountMapping>()

  for (const record of data || []) {
    map.set(record.source_account, {
      sourceAccount: record.source_account,
      sourceName: record.source_name || '',
      targetAccount: record.target_account,
      targetName: '', // Will be filled in by the mapper
      confidence: record.confidence,
      matchType: record.match_type,
      isOverride: true,
    })
  }

  return map
}

/**
 * Execute the full SIE import
 */
export async function executeSIEImport(
  supabase: SupabaseClient,
  userId: string,
  parsed: ParsedSIEFile,
  mappings: AccountMapping[],
  options: {
    filename: string
    fileContent: string
    createFiscalPeriod: boolean
    importOpeningBalances: boolean
    importTransactions: boolean
    voucherSeries?: string
  }
): Promise<ImportResult> {
  const result: ImportResult = {
    success: false,
    importId: null,
    fiscalPeriodId: null,
    openingBalanceEntryId: null,
    journalEntriesCreated: 0,
    journalEntryIds: [],
    errors: [],
    warnings: [],
  }

  try {
    // Validate all accounts are mapped
    const unmapped = mappings.filter((m) => !m.targetAccount)
    if (unmapped.length > 0) {
      result.errors.push(
        `${unmapped.length} accounts are not mapped: ${unmapped.map((m) => m.sourceAccount).join(', ')}`
      )
      return result
    }

    // Check for duplicate import
    const duplicate = await checkDuplicateImport(supabase, userId, options.fileContent)
    if (duplicate) {
      result.errors.push(
        `This file has already been imported on ${new Date(duplicate.imported_at!).toLocaleDateString('sv-SE')}`
      )
      return result
    }

    // Build account mapping lookup
    const accountMap = mappingsToMap(mappings)

    // Create or find fiscal period
    const fiscalYearStart = parsed.stats.fiscalYearStart
    const fiscalYearEnd = parsed.stats.fiscalYearEnd

    if (!fiscalYearStart || !fiscalYearEnd) {
      result.errors.push('No fiscal year defined in the SIE file')
      return result
    }

    if (options.createFiscalPeriod) {
      result.fiscalPeriodId = await ensureFiscalPeriod(
        supabase,
        userId,
        fiscalYearStart,
        fiscalYearEnd
      )
    } else {
      // Find existing fiscal period
      const { data: existing } = await supabase
        .from('fiscal_periods')
        .select('id')
        .eq('user_id', userId)
        .lte('period_start', formatDate(fiscalYearStart))
        .gte('period_end', formatDate(fiscalYearEnd))
        .single()

      if (!existing) {
        result.errors.push('No matching fiscal period found. Enable "Create fiscal period" option.')
        return result
      }

      result.fiscalPeriodId = existing.id
    }

    // Import opening balances
    if (options.importOpeningBalances && parsed.openingBalances.length > 0 && result.fiscalPeriodId) {
      result.openingBalanceEntryId = await createOpeningBalanceEntry(
        supabase,
        userId,
        result.fiscalPeriodId,
        parsed,
        accountMap
      )

      if (result.openingBalanceEntryId) {
        result.journalEntriesCreated++
        result.journalEntryIds.push(result.openingBalanceEntryId)
      }
    }

    // Import transactions (SIE4 only)
    if (options.importTransactions && parsed.vouchers.length > 0 && result.fiscalPeriodId) {
      const voucherResults = await importVouchers(
        supabase,
        userId,
        result.fiscalPeriodId,
        parsed,
        accountMap,
        options.voucherSeries || 'B'
      )

      result.journalEntriesCreated += voucherResults.created
      result.journalEntryIds.push(...voucherResults.ids)
      result.errors.push(...voucherResults.errors)
    }

    // Save account mappings for future use
    await saveMappings(supabase, userId, mappings)

    // Record the import
    result.importId = await recordImport(
      supabase,
      userId,
      parsed,
      options.fileContent,
      options.filename,
      result
    )

    result.success = result.errors.length === 0

    // Add warnings for any issues
    for (const issue of parsed.issues) {
      if (issue.severity === 'warning') {
        result.warnings.push(`Line ${issue.line}: ${issue.message}`)
      }
    }

  } catch (error) {
    result.errors.push(
      `Import failed: ${error instanceof Error ? error.message : 'Unknown error'}`
    )
  }

  return result
}
