import { createClient } from '@/lib/supabase/server'
import type {
  CreateJournalEntryInput,
  CreateJournalEntryLineInput,
  JournalEntry,
  JournalEntryLine,
} from '@/types'

/**
 * Validate that a set of journal entry lines is balanced (debits = credits)
 */
export function validateBalance(lines: CreateJournalEntryLineInput[]): {
  valid: boolean
  totalDebit: number
  totalCredit: number
} {
  const totalDebit = lines.reduce((sum, l) => sum + (l.debit_amount || 0), 0)
  const totalCredit = lines.reduce((sum, l) => sum + (l.credit_amount || 0), 0)

  // Round to avoid floating point issues (2 decimal places for SEK)
  const roundedDebit = Math.round(totalDebit * 100) / 100
  const roundedCredit = Math.round(totalCredit * 100) / 100

  return {
    valid: roundedDebit === roundedCredit && roundedDebit > 0,
    totalDebit: roundedDebit,
    totalCredit: roundedCredit,
  }
}

/**
 * Get the next voucher number for a user/period/series
 */
export async function getNextVoucherNumber(
  userId: string,
  fiscalPeriodId: string,
  series: string = 'A'
): Promise<number> {
  const supabase = await createClient()

  const { data, error } = await supabase.rpc('next_voucher_number', {
    p_user_id: userId,
    p_fiscal_period_id: fiscalPeriodId,
    p_series: series,
  })

  if (error) {
    throw new Error(`Failed to get next voucher number: ${error.message}`)
  }

  return data as number
}

/**
 * Resolve account IDs from account numbers for a user
 */
async function resolveAccountIds(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  lines: CreateJournalEntryLineInput[]
): Promise<Map<string, string>> {
  const accountNumbers = [...new Set(lines.map((l) => l.account_number))]

  const { data: accounts, error } = await supabase
    .from('chart_of_accounts')
    .select('id, account_number')
    .eq('user_id', userId)
    .in('account_number', accountNumbers)

  if (error) {
    throw new Error(`Failed to resolve account IDs: ${error.message}`)
  }

  const map = new Map<string, string>()
  for (const account of accounts || []) {
    map.set(account.account_number, account.id)
  }

  return map
}

/**
 * Find the fiscal period for a given date
 */
export async function findFiscalPeriod(
  userId: string,
  date: string
): Promise<string | null> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('fiscal_periods')
    .select('id')
    .eq('user_id', userId)
    .lte('period_start', date)
    .gte('period_end', date)
    .eq('is_closed', false)
    .single()

  if (error || !data) {
    return null
  }

  return data.id
}

/**
 * Create a journal entry with lines (verifikation)
 * Validates balance, resolves account IDs, assigns voucher number, inserts atomically
 */
export async function createJournalEntry(
  userId: string,
  input: CreateJournalEntryInput
): Promise<JournalEntry> {
  // Validate balance
  const balance = validateBalance(input.lines)
  if (!balance.valid) {
    throw new Error(
      `Journal entry is not balanced: debits (${balance.totalDebit}) != credits (${balance.totalCredit})`
    )
  }

  const supabase = await createClient()

  // Resolve account IDs
  const accountIdMap = await resolveAccountIds(supabase, userId, input.lines)

  // Get next voucher number
  const voucherNumber = await getNextVoucherNumber(
    userId,
    input.fiscal_period_id,
    input.voucher_series || 'A'
  )

  // Insert journal entry header
  const { data: entry, error: entryError } = await supabase
    .from('journal_entries')
    .insert({
      user_id: userId,
      fiscal_period_id: input.fiscal_period_id,
      voucher_number: voucherNumber,
      voucher_series: input.voucher_series || 'A',
      entry_date: input.entry_date,
      description: input.description,
      source_type: input.source_type,
      source_id: input.source_id || null,
      status: 'draft',
    })
    .select()
    .single()

  if (entryError || !entry) {
    throw new Error(`Failed to create journal entry: ${entryError?.message}`)
  }

  // Insert journal entry lines (round amounts to 2 decimal places to avoid floating point issues)
  const lineInserts = input.lines.map((line, index) => ({
    journal_entry_id: entry.id,
    account_number: line.account_number,
    account_id: accountIdMap.get(line.account_number) || null,
    debit_amount: Math.round((line.debit_amount || 0) * 100) / 100,
    credit_amount: Math.round((line.credit_amount || 0) * 100) / 100,
    currency: line.currency || 'SEK',
    amount_in_currency: line.amount_in_currency ? Math.round(line.amount_in_currency * 100) / 100 : null,
    exchange_rate: line.exchange_rate || null,
    line_description: line.line_description || null,
    sort_order: index,
  }))

  const { error: linesError } = await supabase
    .from('journal_entry_lines')
    .insert(lineInserts)

  if (linesError) {
    // Rollback entry
    await supabase.from('journal_entries').delete().eq('id', entry.id)
    throw new Error(`Failed to create journal entry lines: ${linesError.message}`)
  }

  // Post the entry (triggers balance validation in DB)
  const { data: postedEntry, error: postError } = await supabase
    .from('journal_entries')
    .update({ status: 'posted' })
    .eq('id', entry.id)
    .select()
    .single()

  if (postError) {
    // Rollback
    await supabase.from('journal_entry_lines').delete().eq('journal_entry_id', entry.id)
    await supabase.from('journal_entries').delete().eq('id', entry.id)
    throw new Error(`Failed to post journal entry: ${postError.message}`)
  }

  // Fetch complete entry with lines
  const { data: completeEntry } = await supabase
    .from('journal_entries')
    .select('*, lines:journal_entry_lines(*)')
    .eq('id', entry.id)
    .single()

  return completeEntry as JournalEntry
}

/**
 * Create a reversal entry for an existing journal entry
 */
export async function reverseEntry(
  userId: string,
  entryId: string
): Promise<JournalEntry> {
  const supabase = await createClient()

  // Fetch original entry with lines
  const { data: original, error } = await supabase
    .from('journal_entries')
    .select('*, lines:journal_entry_lines(*)')
    .eq('id', entryId)
    .eq('user_id', userId)
    .single()

  if (error || !original) {
    throw new Error('Journal entry not found')
  }

  if (original.status !== 'posted') {
    throw new Error('Can only reverse posted entries')
  }

  const lines = (original.lines as JournalEntryLine[]) || []

  // Create reversed lines (swap debit and credit)
  const reversedLines: CreateJournalEntryLineInput[] = lines.map((line) => ({
    account_number: line.account_number,
    debit_amount: line.credit_amount,
    credit_amount: line.debit_amount,
    line_description: `Reversal: ${line.line_description || ''}`,
    currency: line.currency,
    amount_in_currency: line.amount_in_currency
      ? -line.amount_in_currency
      : undefined,
    exchange_rate: line.exchange_rate || undefined,
  }))

  // Create reversal entry
  const reversalEntry = await createJournalEntry(userId, {
    fiscal_period_id: original.fiscal_period_id,
    entry_date: new Date().toISOString().split('T')[0],
    description: `Makulering: ${original.description}`,
    source_type: original.source_type,
    source_id: original.source_id,
    voucher_series: original.voucher_series,
    lines: reversedLines,
  })

  // Mark original as reversed
  await supabase
    .from('journal_entries')
    .update({ status: 'reversed' })
    .eq('id', entryId)

  return reversalEntry
}
