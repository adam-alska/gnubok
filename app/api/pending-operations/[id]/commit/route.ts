import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { eventBus } from '@/lib/events'
import { ensureInitialized } from '@/lib/init'
import { buildMappingResultFromCategory } from '@/lib/bookkeeping/category-mapping'
import { createTransactionJournalEntry } from '@/lib/bookkeeping/transaction-entries'
import { upsertCounterpartyTemplate } from '@/lib/bookkeeping/counterparty-templates'
import { getVatRules, getAvailableVatRates } from '@/lib/invoices/vat-rules'
import { fetchExchangeRate, convertToSEK } from '@/lib/currency/riksbanken'
import { validateVatNumber } from '@/lib/vat/vies-client'
import { createLogger } from '@/lib/logger'
import type {
  Transaction,
  TransactionCategory,
  EntityType,
  VatTreatment,
  Currency,
  Invoice,
  Customer,
  PendingOperation,
} from '@/types'

const log = createLogger('pending-operations/commit')

ensureInitialized()

/**
 * Ensure a fiscal period exists for the given date, create one if needed.
 * Same logic as app/api/transactions/[id]/categorize/route.ts
 */
async function ensureFiscalPeriod(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  date: string,
  fiscalYearStartMonth: number = 1
): Promise<boolean> {
  const { data: existing } = await supabase
    .from('fiscal_periods')
    .select('id')
    .eq('user_id', userId)
    .lte('period_start', date)
    .gte('period_end', date)
    .eq('is_closed', false)
    .limit(1)

  if (existing && existing.length > 0) return true

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
    }, { onConflict: 'user_id,period_start,period_end' })

  if (error) {
    log.error('Failed to create fiscal period:', error)
    return false
  }
  return true
}

// ── Commit executors ──────────────────────────────────────────

async function commitCategorizeTransaction(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  params: Record<string, unknown>
): Promise<{ data?: Record<string, unknown>; error?: string; status?: number }> {
  const txId = params.transaction_id as string
  const category = params.category as TransactionCategory
  const vatTreatment = params.vat_treatment as VatTreatment | undefined

  // Fetch transaction — guard against double-commit
  const { data: transaction, error: fetchError } = await supabase
    .from('transactions')
    .select('*')
    .eq('id', txId)
    .eq('user_id', userId)
    .single()

  if (fetchError || !transaction) {
    return { error: 'Transaction not found — it may have been deleted.', status: 404 }
  }

  if (transaction.journal_entry_id) {
    return { error: 'Transaction already has a journal entry — it was categorized in the meantime.', status: 409 }
  }

  const isBusiness = category !== 'private'

  // Fetch company settings
  const { data: settings } = await supabase
    .from('company_settings')
    .select('entity_type, fiscal_year_start_month')
    .eq('user_id', userId)
    .single()

  const entityType: EntityType = (settings?.entity_type as EntityType) || 'enskild_firma'
  const fiscalYearStartMonth = settings?.fiscal_year_start_month ?? 1

  // Build mapping
  const mappingResult = buildMappingResultFromCategory(
    category,
    transaction as Transaction,
    isBusiness,
    entityType,
    vatTreatment
  )

  if (!mappingResult.debit_account || !mappingResult.credit_account) {
    return { error: `No account mapping for category "${category}" with entity type "${entityType}".`, status: 400 }
  }

  // Ensure fiscal period exists
  await ensureFiscalPeriod(supabase, userId, transaction.date, fiscalYearStartMonth)

  // Create journal entry
  let journalEntryId: string | null = null
  try {
    const journalEntry = await createTransactionJournalEntry(
      supabase, userId, transaction as Transaction, mappingResult
    )
    if (journalEntry) {
      journalEntryId = journalEntry.id
    }
  } catch (err) {
    log.error('Failed to create journal entry:', err)
    return { error: err instanceof Error ? err.message : 'Failed to create journal entry', status: 500 }
  }

  // Update transaction
  const { error: updateError } = await supabase
    .from('transactions')
    .update({
      is_business: isBusiness,
      category,
      journal_entry_id: journalEntryId,
    })
    .eq('id', txId)

  if (updateError) {
    log.error('Failed to update transaction:', updateError)
    return { error: 'Failed to update transaction', status: 500 }
  }

  // Upsert counterparty template (non-blocking)
  try {
    await upsertCounterpartyTemplate(
      supabase, userId, transaction as Transaction, mappingResult, 'user_approved'
    )
  } catch { /* non-critical */ }

  // Emit event
  await eventBus.emit({
    type: 'transaction.categorized',
    payload: {
      transaction: transaction as Transaction,
      account: mappingResult.debit_account,
      taxCode: mappingResult.vat_lines[0]?.account_number || '',
      userId,
    },
  })

  return { data: { journal_entry_id: journalEntryId, category } }
}

async function commitCreateCustomer(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  params: Record<string, unknown>
): Promise<{ data?: Record<string, unknown>; error?: string; status?: number }> {
  const { data, error } = await supabase
    .from('customers')
    .insert({
      user_id: userId,
      name: params.name as string,
      customer_type: params.customer_type as string,
      email: (params.email as string) || null,
      org_number: (params.org_number as string) || null,
      vat_number: (params.vat_number as string) || null,
      default_payment_terms: (params.payment_terms as number) || 30,
      address_line1: (params.address as string) || null,
      postal_code: (params.postal_code as string) || null,
      city: (params.city as string) || null,
      country: (params.country as string) || 'Sweden',
    })
    .select()
    .single()

  if (error) {
    return { error: error.message, status: 500 }
  }

  // Auto-validate VAT number for EU business customers (non-blocking)
  if (params.customer_type === 'eu_business' && params.vat_number) {
    try {
      const vatResult = await validateVatNumber(params.vat_number as string)
      if (vatResult.valid) {
        await supabase
          .from('customers')
          .update({
            vat_number_validated: true,
            vat_number_validated_at: new Date().toISOString(),
          })
          .eq('id', data.id)
          .eq('user_id', userId)
      }
    } catch (err) {
      log.warn('Auto-VIES validation failed:', err)
    }
  }

  await eventBus.emit({
    type: 'customer.created',
    payload: { customer: data as Customer, userId },
  })

  return { data: { customer_id: data.id } }
}

async function commitCreateInvoice(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  params: Record<string, unknown>
): Promise<{ data?: Record<string, unknown>; error?: string; status?: number }> {
  const customerId = params.customer_id as string
  const items = params.items as Array<{
    description: string
    quantity: number
    unit: string
    unit_price: number
    vat_rate?: number
  }>

  // Fetch customer
  const { data: customer, error: customerError } = await supabase
    .from('customers')
    .select('*')
    .eq('id', customerId)
    .eq('user_id', userId)
    .single()

  if (customerError || !customer) {
    return { error: 'Customer not found — they may have been deleted.', status: 404 }
  }

  // Calculate VAT
  const vatRules = getVatRules(customer.customer_type, customer.vat_number_validated)
  const availableRates = getAvailableVatRates(customer.customer_type, customer.vat_number_validated)
  const allowedRates = new Set(availableRates.map((r) => r.rate))

  const subtotal = items.reduce((sum, item) => sum + item.quantity * item.unit_price, 0)

  let vatAmount = 0
  for (const item of items) {
    const itemRate = item.vat_rate !== undefined ? item.vat_rate : vatRules.rate
    if (!allowedRates.has(itemRate)) {
      return { error: `Momssats ${itemRate}% är inte tillåten för denna kundtyp`, status: 400 }
    }
    const lineTotal = item.quantity * item.unit_price
    vatAmount += Math.round(lineTotal * itemRate / 100 * 100) / 100
  }

  const total = subtotal + vatAmount
  const currency = ((params.currency as string) || 'SEK') as Currency

  // Exchange rate
  let exchangeRate: number | null = null
  let exchangeRateDate: string | null = null
  let subtotalSek: number | null = null
  let vatAmountSek: number | null = null
  let totalSek: number | null = null

  if (currency !== 'SEK') {
    const rateData = await fetchExchangeRate(currency)
    if (rateData) {
      exchangeRate = rateData.rate
      exchangeRateDate = rateData.date
      subtotalSek = convertToSEK(subtotal, exchangeRate)
      vatAmountSek = convertToSEK(vatAmount, exchangeRate)
      totalSek = convertToSEK(total, exchangeRate)
    }
  }

  // Mixed-rate detection
  const uniqueRates = new Set(items.map((item) => item.vat_rate ?? vatRules.rate))
  const isMixedRate = uniqueRates.size > 1

  // Generate invoice number
  const { data: invoiceNumber } = await supabase.rpc('generate_invoice_number', {
    p_user_id: userId,
  })

  // Create invoice
  const { data: invoice, error: invoiceError } = await supabase
    .from('invoices')
    .insert({
      user_id: userId,
      customer_id: customerId,
      invoice_number: invoiceNumber,
      invoice_date: (params.invoice_date as string) || new Date().toISOString().split('T')[0],
      due_date: (params.due_date as string) || null,
      currency,
      exchange_rate: exchangeRate,
      exchange_rate_date: exchangeRateDate,
      subtotal,
      subtotal_sek: subtotalSek,
      vat_amount: vatAmount,
      vat_amount_sek: vatAmountSek,
      total,
      total_sek: totalSek,
      vat_treatment: vatRules.treatment,
      vat_rate: isMixedRate ? null : (uniqueRates.values().next().value ?? vatRules.rate),
      moms_ruta: vatRules.momsRuta,
      reverse_charge_text: vatRules.reverseChargeText || null,
      our_reference: (params.our_reference as string) || null,
      your_reference: (params.your_reference as string) || null,
      notes: (params.notes as string) || null,
    })
    .select()
    .single()

  if (invoiceError) {
    return { error: invoiceError.message, status: 500 }
  }

  // Create invoice items
  const invoiceItems = items.map((item, index) => {
    const itemRate = item.vat_rate !== undefined ? item.vat_rate : vatRules.rate
    const lineTotal = item.quantity * item.unit_price
    const itemVat = Math.round(lineTotal * itemRate / 100 * 100) / 100
    return {
      invoice_id: invoice.id,
      sort_order: index,
      description: item.description,
      quantity: item.quantity,
      unit: item.unit,
      unit_price: item.unit_price,
      line_total: lineTotal,
      vat_rate: itemRate,
      vat_amount: itemVat,
    }
  })

  const { error: itemsError } = await supabase
    .from('invoice_items')
    .insert(invoiceItems)

  if (itemsError) {
    // Rollback invoice
    await supabase.from('invoices').delete().eq('id', invoice.id)
    return { error: itemsError.message, status: 500 }
  }

  // Fetch complete invoice
  const { data: completeInvoice } = await supabase
    .from('invoices')
    .select('*, customer:customers(*), items:invoice_items(*)')
    .eq('id', invoice.id)
    .single()

  if (completeInvoice) {
    await eventBus.emit({
      type: 'invoice.created',
      payload: { invoice: completeInvoice as Invoice, userId },
    })
  }

  return { data: { invoice_id: invoice.id, invoice_number: invoiceNumber } }
}

// ── Route handler ─────────────────────────────────────────────

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

  // Fetch the pending operation
  const { data: op, error: fetchError } = await supabase
    .from('pending_operations')
    .select('*')
    .eq('id', id)
    .eq('user_id', user.id)
    .single()

  if (fetchError || !op) {
    return NextResponse.json({ error: 'Pending operation not found' }, { status: 404 })
  }

  const pendingOp = op as PendingOperation

  if (pendingOp.status !== 'pending') {
    return NextResponse.json(
      { error: `Operation already ${pendingOp.status}` },
      { status: 409 }
    )
  }

  // Execute based on operation type
  let result: { data?: Record<string, unknown>; error?: string; status?: number }

  switch (pendingOp.operation_type) {
    case 'categorize_transaction':
      result = await commitCategorizeTransaction(supabase, user.id, pendingOp.params)
      break
    case 'create_customer':
      result = await commitCreateCustomer(supabase, user.id, pendingOp.params)
      break
    case 'create_invoice':
      result = await commitCreateInvoice(supabase, user.id, pendingOp.params)
      break
    default:
      return NextResponse.json({ error: 'Unknown operation type' }, { status: 400 })
  }

  if (result.error) {
    // Auto-reject if the operation can never succeed (404, 409)
    if (result.status === 404 || result.status === 409) {
      await supabase
        .from('pending_operations')
        .update({
          status: 'rejected',
          resolved_at: new Date().toISOString(),
          result_data: { auto_rejected: true, reason: result.error },
        })
        .eq('id', id)
    }

    return NextResponse.json({ error: result.error }, { status: result.status || 500 })
  }

  // Mark as committed
  await supabase
    .from('pending_operations')
    .update({
      status: 'committed',
      resolved_at: new Date().toISOString(),
      result_data: result.data || {},
    })
    .eq('id', id)

  return NextResponse.json({ data: result.data })
}
