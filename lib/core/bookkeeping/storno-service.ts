import { createClient } from '@/lib/supabase/server'
import { eventBus } from '@/lib/events'
import type {
  CreateJournalEntryLineInput,
  JournalEntry,
  JournalEntryLine,
} from '@/types'
import { validateBalance, getNextVoucherNumber } from '@/lib/bookkeeping/engine'

/**
 * Storno Service - 3-step correction flow per Bokföringslagen
 *
 * Swedish bookkeeping law requires that committed entries cannot be modified.
 * To correct an error, you must:
 * 1. Create a storno (reversal) entry that nullifies the original
 * 2. Create a corrected entry with the right data
 * 3. Link all three via reverses_id, reversed_by_id, correction_of_id
 */

/**
 * Correct an existing posted journal entry using the storno method.
 *
 * Returns: { reversal, corrected } - the two new entries created
 */
export async function correctEntry(
  userId: string,
  originalEntryId: string,
  correctedLines: CreateJournalEntryLineInput[]
): Promise<{ reversal: JournalEntry; corrected: JournalEntry }> {
  // Validate the corrected lines are balanced
  const balance = validateBalance(correctedLines)
  if (!balance.valid) {
    throw new Error(
      `Corrected entry is not balanced: debits (${balance.totalDebit}) != credits (${balance.totalCredit})`
    )
  }

  const supabase = await createClient()

  // Fetch original entry with lines
  const { data: original, error: fetchError } = await supabase
    .from('journal_entries')
    .select('*, lines:journal_entry_lines(*)')
    .eq('id', originalEntryId)
    .eq('user_id', userId)
    .single()

  if (fetchError || !original) {
    throw new Error('Original journal entry not found')
  }

  if (original.status !== 'posted') {
    throw new Error('Can only correct posted entries')
  }

  const originalLines = (original.lines as JournalEntryLine[]) || []

  // ===== Step 1: Create storno (reversal) entry =====
  const reversalVoucherNumber = await getNextVoucherNumber(
    userId,
    original.fiscal_period_id,
    original.voucher_series || 'A'
  )

  const { data: reversalEntry, error: reversalError } = await supabase
    .from('journal_entries')
    .insert({
      user_id: userId,
      fiscal_period_id: original.fiscal_period_id,
      voucher_number: reversalVoucherNumber,
      voucher_series: original.voucher_series || 'A',
      entry_date: new Date().toISOString().split('T')[0],
      description: `Storno: ${original.description}`,
      source_type: 'storno',
      reverses_id: originalEntryId,
      status: 'draft',
    })
    .select()
    .single()

  if (reversalError || !reversalEntry) {
    throw new Error(`Failed to create reversal entry: ${reversalError?.message}`)
  }

  // Insert reversed lines (swap debit and credit)
  const reversalLineInserts = originalLines.map((line, index) => ({
    journal_entry_id: reversalEntry.id,
    account_number: line.account_number,
    account_id: line.account_id || null,
    debit_amount: Math.round((Number(line.credit_amount) || 0) * 100) / 100,
    credit_amount: Math.round((Number(line.debit_amount) || 0) * 100) / 100,
    currency: line.currency || 'SEK',
    amount_in_currency: line.amount_in_currency ? -Number(line.amount_in_currency) : null,
    exchange_rate: line.exchange_rate || null,
    line_description: `Storno: ${line.line_description || ''}`,
    tax_code: line.tax_code || null,
    cost_center: line.cost_center || null,
    project: line.project || null,
    sort_order: index,
  }))

  const { error: reversalLinesError } = await supabase
    .from('journal_entry_lines')
    .insert(reversalLineInserts)

  if (reversalLinesError) {
    await supabase.from('journal_entries').delete().eq('id', reversalEntry.id)
    throw new Error(`Failed to create reversal lines: ${reversalLinesError.message}`)
  }

  // Post the reversal entry
  const { error: postReversalError } = await supabase
    .from('journal_entries')
    .update({ status: 'posted' })
    .eq('id', reversalEntry.id)

  if (postReversalError) {
    throw new Error(`Failed to post reversal entry: ${postReversalError.message}`)
  }

  // Mark original as reversed
  await supabase
    .from('journal_entries')
    .update({
      status: 'reversed',
      reversed_by_id: reversalEntry.id,
    })
    .eq('id', originalEntryId)

  // ===== Step 2: Create corrected entry =====
  const correctedVoucherNumber = await getNextVoucherNumber(
    userId,
    original.fiscal_period_id,
    original.voucher_series || 'A'
  )

  // Resolve account IDs for corrected lines
  const accountNumbers = [...new Set(correctedLines.map((l) => l.account_number))]
  const { data: accounts } = await supabase
    .from('chart_of_accounts')
    .select('id, account_number')
    .eq('user_id', userId)
    .in('account_number', accountNumbers)

  const accountIdMap = new Map<string, string>()
  for (const account of accounts || []) {
    accountIdMap.set(account.account_number, account.id)
  }

  const { data: correctedEntry, error: correctedError } = await supabase
    .from('journal_entries')
    .insert({
      user_id: userId,
      fiscal_period_id: original.fiscal_period_id,
      voucher_number: correctedVoucherNumber,
      voucher_series: original.voucher_series || 'A',
      entry_date: new Date().toISOString().split('T')[0],
      description: `Rättelse: ${original.description}`,
      source_type: 'correction',
      correction_of_id: originalEntryId,
      status: 'draft',
    })
    .select()
    .single()

  if (correctedError || !correctedEntry) {
    throw new Error(`Failed to create corrected entry: ${correctedError?.message}`)
  }

  // Insert corrected lines
  const correctedLineInserts = correctedLines.map((line, index) => ({
    journal_entry_id: correctedEntry.id,
    account_number: line.account_number,
    account_id: accountIdMap.get(line.account_number) || null,
    debit_amount: Math.round((line.debit_amount || 0) * 100) / 100,
    credit_amount: Math.round((line.credit_amount || 0) * 100) / 100,
    currency: line.currency || 'SEK',
    amount_in_currency: line.amount_in_currency
      ? Math.round(line.amount_in_currency * 100) / 100
      : null,
    exchange_rate: line.exchange_rate || null,
    line_description: line.line_description || null,
    tax_code: line.tax_code || null,
    cost_center: line.cost_center || null,
    project: line.project || null,
    sort_order: index,
  }))

  const { error: correctedLinesError } = await supabase
    .from('journal_entry_lines')
    .insert(correctedLineInserts)

  if (correctedLinesError) {
    await supabase.from('journal_entries').delete().eq('id', correctedEntry.id)
    throw new Error(`Failed to create corrected lines: ${correctedLinesError.message}`)
  }

  // Post the corrected entry
  const { error: postCorrectedError } = await supabase
    .from('journal_entries')
    .update({ status: 'posted' })
    .eq('id', correctedEntry.id)

  if (postCorrectedError) {
    throw new Error(`Failed to post corrected entry: ${postCorrectedError.message}`)
  }

  // ===== Step 3: Fetch complete entries =====
  const { data: finalReversal } = await supabase
    .from('journal_entries')
    .select('*, lines:journal_entry_lines(*)')
    .eq('id', reversalEntry.id)
    .single()

  const { data: finalCorrected } = await supabase
    .from('journal_entries')
    .select('*, lines:journal_entry_lines(*)')
    .eq('id', correctedEntry.id)
    .single()

  const result = {
    reversal: finalReversal as JournalEntry,
    corrected: finalCorrected as JournalEntry,
  }

  await eventBus.emit({
    type: 'journal_entry.corrected',
    payload: {
      original: original as JournalEntry,
      storno: result.reversal,
      corrected: result.corrected,
      userId,
    },
  })

  return result
}
