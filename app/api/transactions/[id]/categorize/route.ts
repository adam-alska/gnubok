import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { buildMappingResultFromCategory } from '@/lib/bookkeeping/category-mapping'
import { createTransactionJournalEntry } from '@/lib/bookkeeping/transaction-entries'
import { saveUserMappingRule } from '@/lib/bookkeeping/mapping-engine'
import type { Transaction, TransactionCategory, EntityType } from '@/types'
import { validateBody, CategorizeTransactionInputSchema } from '@/lib/validation'
import { apiLimiter, rateLimitResponse } from '@/lib/rate-limit'

interface CategorizeRequest {
  is_business: boolean
  category?: TransactionCategory
}

/**
 * Ensure a fiscal period exists for the given date, create one if needed
 */
async function ensureFiscalPeriod(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  date: string
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

  // No fiscal period exists - create one for the year of the transaction
  const transactionDate = new Date(date)
  const year = transactionDate.getFullYear()

  const periodStart = `${year}-01-01`
  const periodEnd = `${year}-12-31`

  const { error } = await supabase
    .from('fiscal_periods')
    .upsert({
      user_id: userId,
      name: `Räkenskapsår ${year}`,
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

  const { success, remaining, reset } = apiLimiter.check(user.id)
  if (!success) return rateLimitResponse(reset)

  // Parse and validate request body
  const raw = await request.json()
  const validation = validateBody(CategorizeTransactionInputSchema, raw)
  if (!validation.success) return validation.response
  const { is_business, category } = validation.data

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

  // Fetch company settings to get entity type
  const { data: settings } = await supabase
    .from('company_settings')
    .select('entity_type')
    .eq('user_id', user.id)
    .single()

  const entityType: EntityType = (settings?.entity_type as EntityType) || 'enskild_firma'

  // Determine the category to use
  const finalCategory: TransactionCategory = is_business
    ? (category || 'uncategorized')
    : 'private'

  // Build mapping result from category
  const mappingResult = buildMappingResultFromCategory(
    finalCategory,
    transaction as Transaction,
    is_business,
    entityType
  )

  // Ensure fiscal period exists for the transaction date
  await ensureFiscalPeriod(supabase, user.id, transaction.date)

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

  return NextResponse.json({
    success: true,
    journal_entry_created: journalEntryCreated,
    journal_entry_id: journalEntryId,
    journal_entry_error: journalEntryError,
    category: finalCategory,
  })
}
