import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { eventBus } from '@/lib/events'
import { ensureInitialized } from '@/lib/init'
import { buildMappingResultFromCategory } from '@/lib/bookkeeping/category-mapping'
import { createTransactionJournalEntry } from '@/lib/bookkeeping/transaction-entries'
import { saveUserMappingRule } from '@/lib/bookkeeping/mapping-engine'
import type { Transaction, TransactionCategory, EntityType, VatTreatment } from '@/types'

ensureInitialized()

interface CategorizeRequest {
  is_business: boolean
  category?: TransactionCategory
  vat_treatment?: VatTreatment
}

/**
 * Ensure a fiscal period exists for the given date, create one if needed
 */
async function ensureFiscalPeriod(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  date: string,
  fiscalYearStartMonth: number = 1
): Promise<boolean> {
  // Check if a fiscal period already covers this date
  const { data: existing } = await supabase
    .from('fiscal_periods')
    .select('id')
    .eq('user_id', userId)
    .lte('period_start', date)
    .gte('period_end', date)
    .eq('is_closed', false)
    .single()

  if (existing) {
    return true
  }

  // Compute fiscal year period based on start month
  const txDate = new Date(date)
  const txMonth = txDate.getMonth() + 1
  const txYear = txDate.getFullYear()

  let periodStartYear: number
  if (fiscalYearStartMonth === 1) {
    periodStartYear = txYear
  } else if (txMonth >= fiscalYearStartMonth) {
    periodStartYear = txYear
  } else {
    periodStartYear = txYear - 1
  }

  const startMonth = String(fiscalYearStartMonth).padStart(2, '0')
  const periodStart = `${periodStartYear}-${startMonth}-01`

  // Period ends the day before the next fiscal year starts
  const endYear = fiscalYearStartMonth === 1 ? periodStartYear : periodStartYear + 1
  const endMonth = fiscalYearStartMonth === 1 ? 12 : fiscalYearStartMonth - 1
  const lastDay = new Date(endYear, endMonth, 0).getDate()
  const periodEnd = `${endYear}-${String(endMonth).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`

  const periodName = fiscalYearStartMonth === 1
    ? `Räkenskapsår ${periodStartYear}`
    : `Räkenskapsår ${periodStartYear}/${endYear}`

  const { error } = await supabase
    .from('fiscal_periods')
    .upsert({
      user_id: userId,
      name: periodName,
      period_start: periodStart,
      period_end: periodEnd,
    }, {
      onConflict: 'user_id,period_start,period_end',
    })

  if (error) {
    console.error('Failed to create fiscal period:', error)
    return false
  }

  return true
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  const { id } = await params

  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Parse request body
  const body: CategorizeRequest = await request.json()
  const { is_business, category } = body

  // Fetch the transaction (validates ownership)
  const { data: transaction, error: fetchError } = await supabase
    .from('transactions')
    .select('*')
    .eq('id', id)
    .eq('user_id', user.id)
    .single()

  if (fetchError || !transaction) {
    return NextResponse.json({ error: 'Transaction not found' }, { status: 404 })
  }

  // If already has a journal entry, just update category and is_business (skip journal entry creation)
  if (transaction.journal_entry_id) {
    const finalCat: TransactionCategory = is_business
      ? (category || 'uncategorized')
      : 'private'

    const { error: updateErr } = await supabase
      .from('transactions')
      .update({
        is_business,
        category: finalCat,
      })
      .eq('id', id)

    if (updateErr) {
      return NextResponse.json(
        { error: 'Failed to update transaction' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      journal_entry_created: false,
      journal_entry_id: transaction.journal_entry_id,
      journal_entry_error: null,
      category: finalCat,
      already_had_journal_entry: true,
    })
  }

  // Fetch company settings to get entity type and fiscal year start
  const { data: settings } = await supabase
    .from('company_settings')
    .select('entity_type, fiscal_year_start_month')
    .eq('user_id', user.id)
    .single()

  const entityType: EntityType = (settings?.entity_type as EntityType) || 'enskild_firma'
  const fiscalYearStartMonth: number = settings?.fiscal_year_start_month ?? 1

  // Determine the category to use
  const finalCategory: TransactionCategory = is_business
    ? (category || 'uncategorized')
    : 'private'

  // Build mapping result from category
  const mappingResult = buildMappingResultFromCategory(
    finalCategory,
    transaction as Transaction,
    is_business,
    entityType,
    body.vat_treatment
  )

  // Ensure fiscal period exists for the transaction date
  await ensureFiscalPeriod(supabase, user.id, transaction.date, fiscalYearStartMonth)

  // Try to create journal entry
  let journalEntryCreated = false
  let journalEntryId: string | null = null
  let journalEntryError: string | null = null

  try {
    const journalEntry = await createTransactionJournalEntry(
      user.id,
      transaction as Transaction,
      mappingResult
    )

    if (journalEntry) {
      journalEntryCreated = true
      journalEntryId = journalEntry.id
    }
  } catch (err) {
    console.error('Failed to create journal entry:', err)
    journalEntryError = err instanceof Error ? err.message : 'Unknown error'
    // Continue - we still want to save the categorization
  }

  // Save mapping rule for future auto-categorization (only for business expenses with merchant)
  if (is_business && transaction.merchant_name) {
    try {
      await saveUserMappingRule(
        user.id,
        transaction.merchant_name,
        mappingResult.debit_account,
        mappingResult.credit_account,
        !is_business
      )
    } catch (err) {
      console.error('Failed to save mapping rule:', err)
      // Non-critical, continue
    }
  }

  // Link receipt document to journal entry if both exist
  if (journalEntryId && transaction.receipt_id) {
    try {
      const { data: receipt } = await supabase
        .from('receipts')
        .select('document_id')
        .eq('id', transaction.receipt_id)
        .single()

      if (receipt?.document_id) {
        await supabase
          .from('document_attachments')
          .update({ journal_entry_id: journalEntryId })
          .eq('id', receipt.document_id)
          .eq('user_id', user.id)
      }
    } catch (linkErr) {
      console.error('[categorize] Failed to link receipt document:', linkErr)
    }
  }

  // Update the transaction
  const { error: updateError } = await supabase
    .from('transactions')
    .update({
      is_business,
      category: finalCategory,
      journal_entry_id: journalEntryId,
    })
    .eq('id', id)

  if (updateError) {
    console.error('Failed to update transaction:', updateError)
    return NextResponse.json(
      { error: 'Failed to update transaction' },
      { status: 500 }
    )
  }

  await eventBus.emit({
    type: 'transaction.categorized',
    payload: {
      transaction: transaction as Transaction,
      account: mappingResult.debit_account,
      taxCode: mappingResult.vat_lines[0]?.account_number || '',
      userId: user.id,
    },
  })

  return NextResponse.json({
    success: true,
    journal_entry_created: journalEntryCreated,
    journal_entry_id: journalEntryId,
    journal_entry_error: journalEntryError,
    category: finalCategory,
  })
}
