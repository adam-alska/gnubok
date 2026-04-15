import type { SupabaseClient } from '@supabase/supabase-js'
import { eventBus } from '@/lib/events'
import type {
  CreateJournalEntryLineInput,
  JournalEntry,
  JournalEntryLine,
} from '@/types'
import { validateBalance, getNextVoucherNumber, getSwedishLocalDate } from '@/lib/bookkeeping/engine'

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
 * Cancel a journal entry and delete its lines.
 * Uses status='cancelled' instead of DELETE (DB trigger blocks all DELETEs).
 * Works for both draft→cancelled and posted→cancelled transitions.
 */
async function cancelEntry(supabase: SupabaseClient, entryId: string): Promise<void> {
  const { error: statusErr } = await supabase
    .from('journal_entries')
    .update({ status: 'cancelled' })
    .eq('id', entryId)
  if (statusErr) {
    console.error(`[storno] cancelEntry: failed to cancel ${entryId}:`, statusErr.message)
  }
  const { error: linesErr } = await supabase
    .from('journal_entry_lines')
    .delete()
    .eq('journal_entry_id', entryId)
  if (linesErr) {
    console.error(`[storno] cancelEntry: failed to delete lines for ${entryId}:`, linesErr.message)
  }
}

/**
 * Correct an existing posted journal entry using the storno method.
 *
 * Returns: { reversal, corrected } - the two new entries created
 */
export async function correctEntry(
  supabase: SupabaseClient,
  companyId: string,
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

  // Fetch original entry with lines
  const { data: original, error: fetchError } = await supabase
    .from('journal_entries')
    .select('*, lines:journal_entry_lines(*)')
    .eq('id', originalEntryId)
    .eq('company_id', companyId)
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
    supabase,
    companyId,
    original.fiscal_period_id,
    original.voucher_series || 'A'
  )

  const { data: reversalEntry, error: reversalError } = await supabase
    .from('journal_entries')
    .insert({
      company_id: companyId,
      user_id: userId,
      fiscal_period_id: original.fiscal_period_id,
      voucher_number: reversalVoucherNumber,
      voucher_series: original.voucher_series || 'A',
      entry_date: getSwedishLocalDate(),
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
    await cancelEntry(supabase, reversalEntry.id)
    throw new Error(`Failed to create reversal lines: ${reversalLinesError.message}`)
  }

  // Post the reversal entry
  const { error: postReversalError } = await supabase
    .from('journal_entries')
    .update({ status: 'posted' })
    .eq('id', reversalEntry.id)

  if (postReversalError) {
    await cancelEntry(supabase, reversalEntry.id)
    throw new Error(`Failed to post reversal entry: ${postReversalError.message}`)
  }

  // NOTE: Original entry is NOT marked as 'reversed' here. We defer that
  // until both the reversal and corrected entries are successfully posted.
  // This avoids the impossible reversed→posted rollback if step 2 fails.

  // ===== Step 2: Create corrected entry =====
  // If anything in this step fails, cancel the reversal entry.
  // The original entry was never modified, so no rollback needed.

  let correctedEntry: typeof reversalEntry

  try {
    const correctedVoucherNumber = await getNextVoucherNumber(
      supabase,
      companyId,
      original.fiscal_period_id,
      original.voucher_series || 'A'
    )

    // Resolve account IDs for corrected lines
    const accountNumbers = [...new Set(correctedLines.map((l) => l.account_number))]
    const { data: accounts } = await supabase
      .from('chart_of_accounts')
      .select('id, account_number')
      .eq('company_id', companyId)
      .in('account_number', accountNumbers)

    const accountIdMap = new Map<string, string>()
    for (const account of accounts || []) {
      accountIdMap.set(account.account_number, account.id)
    }

    // Validate all account numbers resolved to IDs
    const missingAccounts = accountNumbers.filter(num => !accountIdMap.has(num))
    if (missingAccounts.length > 0) {
      throw new Error(
        `Account(s) not found in chart of accounts: ${missingAccounts.join(', ')}`
      )
    }

    const { data: newEntry, error: correctedError } = await supabase
      .from('journal_entries')
      .insert({
        company_id: companyId,
        user_id: userId,
        fiscal_period_id: original.fiscal_period_id,
        voucher_number: correctedVoucherNumber,
        voucher_series: original.voucher_series || 'A',
        entry_date: getSwedishLocalDate(),
        description: `Rättelse: ${original.description}`,
        source_type: 'correction',
        correction_of_id: originalEntryId,
        status: 'draft',
      })
      .select()
      .single()

    if (correctedError || !newEntry) {
      throw new Error(`Failed to create corrected entry: ${correctedError?.message}`)
    }

    correctedEntry = newEntry

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
      await cancelEntry(supabase, correctedEntry.id)
      throw new Error(`Failed to create corrected lines: ${correctedLinesError.message}`)
    }

    // Post the corrected entry
    const { error: postCorrectedError } = await supabase
      .from('journal_entries')
      .update({ status: 'posted' })
      .eq('id', correctedEntry.id)

    if (postCorrectedError) {
      await cancelEntry(supabase, correctedEntry.id)
      throw new Error(`Failed to post corrected entry: ${postCorrectedError.message}`)
    }
  } catch (err) {
    // Cancel the reversal entry (posted → cancelled). Original was never
    // modified so no rollback needed — it's still 'posted'.
    await cancelEntry(supabase, reversalEntry.id)
    throw err
  }

  // ===== Mark original as reversed (CAS guard: only if still 'posted') =====
  const { data: updatedOriginal, error: casError } = await supabase
    .from('journal_entries')
    .update({
      status: 'reversed',
      reversed_by_id: reversalEntry.id,
    })
    .eq('id', originalEntryId)
    .eq('status', 'posted')
    .select('id')

  if (casError || !updatedOriginal || updatedOriginal.length === 0) {
    // Concurrent reversal beat us — cancel both our entries
    await cancelEntry(supabase, reversalEntry.id)
    await cancelEntry(supabase, correctedEntry!.id)
    throw new Error('Entry was already reversed by a concurrent operation')
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
      companyId,
      userId,
    },
  })

  return result
}
