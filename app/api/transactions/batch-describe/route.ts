import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { eventBus } from '@/lib/events'
import { ensureInitialized } from '@/lib/init'
import { validateBody } from '@/lib/api/validate'
import { BatchDescribeSchema } from '@/lib/api/schemas'
import { getTemplateById, buildMappingResultFromTemplate } from '@/lib/bookkeeping/booking-templates'
import { createTransactionJournalEntry } from '@/lib/bookkeeping/transaction-entries'
import { saveUserMappingRule } from '@/lib/bookkeeping/mapping-engine'
import type { Transaction, EntityType, TransactionCategory } from '@/types'

ensureInitialized()

export async function POST(request: Request) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const validation = await validateBody(request, BatchDescribeSchema)
  if (!validation.success) return validation.response
  const { merchant_name, template_id, is_business, user_description } = validation.data

  // Look up the template
  const template = getTemplateById(template_id)
  if (!template) {
    return NextResponse.json({ error: 'Invalid template_id' }, { status: 400 })
  }

  // Fetch entity type and fiscal year start
  const { data: settings } = await supabase
    .from('company_settings')
    .select('entity_type, fiscal_year_start_month')
    .eq('user_id', user.id)
    .single()

  const entityType: EntityType = (settings?.entity_type as EntityType) || 'enskild_firma'
  const fiscalYearStartMonth: number = settings?.fiscal_year_start_month ?? 1

  // Fetch all uncategorized transactions from the specified merchant (limit 50)
  const { data: transactions, error: fetchError } = await supabase
    .from('transactions')
    .select('*')
    .eq('user_id', user.id)
    .eq('merchant_name', merchant_name)
    .is('journal_entry_id', null)
    .order('date', { ascending: true })
    .limit(50)

  if (fetchError || !transactions || transactions.length === 0) {
    return NextResponse.json({
      data: { applied: 0, errors: [] },
    })
  }

  const finalCategory: TransactionCategory = is_business
    ? template.fallback_category
    : 'private'

  let applied = 0
  const errors: string[] = []

  for (const tx of transactions) {
    try {
      const mappingResult = buildMappingResultFromTemplate(
        template,
        tx as Transaction,
        entityType
      )

      // Ensure fiscal period exists
      const txDate = new Date(tx.date)
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
      const endYear = fiscalYearStartMonth === 1 ? periodStartYear : periodStartYear + 1
      const endMonth = fiscalYearStartMonth === 1 ? 12 : fiscalYearStartMonth - 1
      const lastDay = new Date(endYear, endMonth, 0).getDate()
      const periodEnd = `${endYear}-${String(endMonth).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`
      const periodName = fiscalYearStartMonth === 1
        ? `Räkenskapsår ${periodStartYear}`
        : `Räkenskapsår ${periodStartYear}/${endYear}`

      await supabase
        .from('fiscal_periods')
        .upsert({
          user_id: user.id,
          name: periodName,
          period_start: periodStart,
          period_end: periodEnd,
        }, { onConflict: 'user_id,period_start,period_end' })

      // Create journal entry
      let journalEntryId: string | null = null
      try {
        const journalEntry = await createTransactionJournalEntry(
          supabase,
          user.id,
          tx as Transaction,
          mappingResult
        )
        if (journalEntry) {
          journalEntryId = journalEntry.id
        }
      } catch (err) {
        console.error(`[batch-describe] Journal entry failed for ${tx.id}:`, err)
      }

      // Update the transaction
      await supabase
        .from('transactions')
        .update({
          is_business,
          category: finalCategory,
          journal_entry_id: journalEntryId,
        })
        .eq('id', tx.id)

      await eventBus.emit({
        type: 'transaction.categorized',
        payload: {
          transaction: tx as Transaction,
          account: mappingResult.debit_account,
          taxCode: mappingResult.vat_lines[0]?.account_number || '',
          userId: user.id,
        },
      })

      applied++
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error'
      errors.push(`${tx.id}: ${msg}`)
    }
  }

  // Save a mapping rule for future auto-categorization
  if (applied > 0) {
    try {
      const sampleTx = transactions[0] as Transaction
      const sampleResult = buildMappingResultFromTemplate(template, sampleTx, entityType)
      await saveUserMappingRule(
        supabase,
        user.id,
        merchant_name,
        sampleResult.debit_account,
        sampleResult.credit_account,
        !is_business,
        user_description,
        template_id
      )
    } catch {
      // Non-critical
    }
  }

  return NextResponse.json({
    data: { applied, errors },
  })
}
