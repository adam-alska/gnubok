import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import type { CreateInvoiceInput, Invoice } from '@/types'
import { getVatRules, calculateVat, calculateTotal } from '@/lib/invoice/vat-rules'
import { fetchExchangeRate, convertToSEK } from '@/lib/currency/riksbanken'
import {
  createInvoiceJournalEntry,
  createCreditNoteJournalEntry,
} from '@/lib/bookkeeping/invoice-entries'
import { validateBody, CreateInvoiceInputSchema, CreateCreditNoteInputSchema } from '@/lib/validation'
import { apiLimiter, rateLimitResponse } from '@/lib/rate-limit'

interface CreateCreditNoteInput {
  credited_invoice_id: string
  reason?: string
}

function getPaginationParams(searchParams: URLSearchParams) {
  const page = Math.max(1, parseInt(searchParams.get('page') || '1'))
  const per_page = Math.min(100, Math.max(1, parseInt(searchParams.get('per_page') || '50')))
  const from = (page - 1) * per_page
  const to = from + per_page - 1
  return { page, per_page, from, to }
}

export async function GET(request: Request) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { success, remaining, reset } = apiLimiter.check(user.id)
  if (!success) return rateLimitResponse(reset)

  const { searchParams } = new URL(request.url)
  const { page, per_page, from, to } = getPaginationParams(searchParams)
  const status = searchParams.get('status')

  let query = supabase
    .from('invoices')
    .select('*, customer:customers(*)', { count: 'exact' })
    .eq('user_id', user.id)
    .order('invoice_date', { ascending: false })
    .range(from, to)

  if (status) {
    query = query.eq('status', status)
  }

  const { data, error, count } = await query

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const total = count ?? 0

  return NextResponse.json({
    data,
    pagination: {
      page,
      per_page,
      total,
      total_pages: Math.ceil(total / per_page),
    },
  })
}

export async function POST(request: Request) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { success: postRl, remaining: postRem, reset: postReset } = apiLimiter.check(user.id)
  if (!postRl) return rateLimitResponse(postReset)

  const body = await request.json()

  // Check if this is a credit note creation request
  if (body.credited_invoice_id) {
    const validation = validateBody(CreateCreditNoteInputSchema, body)
    if (!validation.success) return validation.response
    return createCreditNote(supabase, user.id, validation.data)
  }

  const validation = validateBody(CreateInvoiceInputSchema, body)
  if (!validation.success) return validation.response
  const invoiceInput = validation.data

  // Get customer for VAT calculation
  const { data: customer, error: customerError } = await supabase
    .from('customers')
    .select('*')
    .eq('id', invoiceInput.customer_id)
    .eq('user_id', user.id)
    .single()

  if (customerError || !customer) {
    return NextResponse.json({ error: 'Customer not found' }, { status: 404 })
  }

  // Calculate VAT rules
  const vatRules = getVatRules(customer.customer_type, customer.vat_number_validated)

  // Calculate subtotal from items
  const subtotal = invoiceInput.items.reduce((sum, item) => {
    return sum + item.quantity * item.unit_price
  }, 0)

  const vatAmount = calculateVat(subtotal, vatRules.rate)
  const total = subtotal + vatAmount

  // Handle currency conversion
  let exchangeRate: number | null = null
  let exchangeRateDate: string | null = null
  let subtotalSek: number | null = null
  let vatAmountSek: number | null = null
  let totalSek: number | null = null

  if (invoiceInput.currency !== 'SEK') {
    const rateData = await fetchExchangeRate(invoiceInput.currency)
    if (rateData) {
      exchangeRate = rateData.rate
      exchangeRateDate = rateData.date
      subtotalSek = convertToSEK(subtotal, exchangeRate)
      vatAmountSek = convertToSEK(vatAmount, exchangeRate)
      totalSek = convertToSEK(total, exchangeRate)
    }
  }

  // Prepare invoice data for atomic RPC call
  const invoiceData = {
    user_id: user.id,
    customer_id: invoiceInput.customer_id,
    invoice_date: invoiceInput.invoice_date,
    due_date: invoiceInput.due_date,
    currency: invoiceInput.currency,
    exchange_rate: exchangeRate,
    exchange_rate_date: exchangeRateDate,
    subtotal,
    subtotal_sek: subtotalSek,
    vat_amount: vatAmount,
    vat_amount_sek: vatAmountSek,
    total,
    total_sek: totalSek,
    vat_treatment: vatRules.treatment,
    vat_rate: vatRules.rate,
    moms_ruta: vatRules.momsRuta,
    reverse_charge_text: vatRules.reverseChargeText || null,
    your_reference: invoiceInput.your_reference || null,
    our_reference: invoiceInput.our_reference || null,
    notes: invoiceInput.notes || null,
  }

  // Prepare items data for atomic RPC call
  const itemsData = invoiceInput.items.map((item, index) => ({
    sort_order: index,
    description: item.description,
    quantity: item.quantity,
    unit: item.unit,
    unit_price: item.unit_price,
    line_total: item.quantity * item.unit_price,
  }))

  // Atomically create invoice and items in a single transaction via RPC
  const { data: invoiceResult, error: rpcError } = await supabase.rpc('create_invoice_with_items', {
    p_invoice: invoiceData,
    p_items: itemsData,
  })

  if (rpcError) {
    return NextResponse.json({ error: rpcError.message }, { status: 500 })
  }

  // Fetch the full invoice with all relations for the journal entry and response
  const { data: completeInvoice } = await supabase
    .from('invoices')
    .select('*, customer:customers(*), items:invoice_items(*)')
    .eq('id', invoiceResult.id)
    .single()

  // Create journal entry for the invoice (non-blocking)
  if (completeInvoice) {
    try {
      const journalEntry = await createInvoiceJournalEntry(
        user.id,
        completeInvoice as Invoice
      )
      if (journalEntry) {
        await supabase
          .from('invoices')
          .update({ journal_entry_id: journalEntry.id })
          .eq('id', completeInvoice.id)
      }
    } catch (err) {
      console.error('Failed to create invoice journal entry:', err)
      // Don't fail the invoice creation
    }
  }

  return NextResponse.json({ data: completeInvoice })
}

// Create a credit note for an existing invoice
async function createCreditNote(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  input: CreateCreditNoteInput
) {
  // Fetch the original invoice with items
  const { data: originalInvoice, error: originalError } = await supabase
    .from('invoices')
    .select('*, items:invoice_items(*)')
    .eq('id', input.credited_invoice_id)
    .eq('user_id', userId)
    .single()

  if (originalError || !originalInvoice) {
    return NextResponse.json({ error: 'Original invoice not found' }, { status: 404 })
  }

  // Check if invoice is already credited
  if (originalInvoice.status === 'credited') {
    return NextResponse.json({ error: 'Invoice has already been credited' }, { status: 400 })
  }

  // Check if invoice can be credited (only sent, paid, or overdue invoices can be credited)
  if (!['sent', 'paid', 'overdue'].includes(originalInvoice.status)) {
    return NextResponse.json(
      { error: 'Only sent, paid, or overdue invoices can be credited' },
      { status: 400 }
    )
  }

  // Generate credit note number
  const creditNoteNumber = `KR-${originalInvoice.invoice_number}`

  // Create the credit note with negated amounts
  const { data: creditNote, error: creditNoteError } = await supabase
    .from('invoices')
    .insert({
      user_id: userId,
      customer_id: originalInvoice.customer_id,
      invoice_number: creditNoteNumber,
      invoice_date: new Date().toISOString().split('T')[0],
      due_date: new Date().toISOString().split('T')[0],
      currency: originalInvoice.currency,
      exchange_rate: originalInvoice.exchange_rate,
      exchange_rate_date: originalInvoice.exchange_rate_date,
      // Negate all amounts
      subtotal: -Math.abs(originalInvoice.subtotal),
      subtotal_sek: originalInvoice.subtotal_sek ? -Math.abs(originalInvoice.subtotal_sek) : null,
      vat_amount: -Math.abs(originalInvoice.vat_amount),
      vat_amount_sek: originalInvoice.vat_amount_sek ? -Math.abs(originalInvoice.vat_amount_sek) : null,
      total: -Math.abs(originalInvoice.total),
      total_sek: originalInvoice.total_sek ? -Math.abs(originalInvoice.total_sek) : null,
      // Same VAT treatment as original
      vat_treatment: originalInvoice.vat_treatment,
      vat_rate: originalInvoice.vat_rate,
      moms_ruta: originalInvoice.moms_ruta,
      reverse_charge_text: originalInvoice.reverse_charge_text,
      // References
      your_reference: originalInvoice.your_reference,
      our_reference: originalInvoice.our_reference,
      notes: input.reason || `Krediterar faktura ${originalInvoice.invoice_number}`,
      credited_invoice_id: input.credited_invoice_id,
      status: 'sent', // Credit notes are immediately "sent"
    })
    .select()
    .single()

  if (creditNoteError) {
    return NextResponse.json({ error: creditNoteError.message }, { status: 500 })
  }

  // Create credit note items (negated from original)
  const creditNoteItems = (originalInvoice.items || []).map((item: { sort_order: number; description: string; quantity: number; unit: string; unit_price: number; line_total: number }, index: number) => ({
    invoice_id: creditNote.id,
    sort_order: item.sort_order,
    description: item.description,
    quantity: -Math.abs(item.quantity),
    unit: item.unit,
    unit_price: item.unit_price,
    line_total: -Math.abs(item.line_total),
  }))

  const { error: itemsError } = await supabase
    .from('invoice_items')
    .insert(creditNoteItems)

  if (itemsError) {
    // Rollback credit note creation
    await supabase.from('invoices').delete().eq('id', creditNote.id)
    return NextResponse.json({ error: itemsError.message }, { status: 500 })
  }

  // Update original invoice status to 'credited'
  await supabase
    .from('invoices')
    .update({ status: 'credited' })
    .eq('id', input.credited_invoice_id)

  // Fetch complete credit note with items
  const { data: completeCreditNote } = await supabase
    .from('invoices')
    .select('*, customer:customers(*), items:invoice_items(*)')
    .eq('id', creditNote.id)
    .single()

  // Create journal entry for the credit note (non-blocking)
  if (completeCreditNote) {
    try {
      const journalEntry = await createCreditNoteJournalEntry(
        userId,
        completeCreditNote as Invoice
      )
      if (journalEntry) {
        await supabase
          .from('invoices')
          .update({ journal_entry_id: journalEntry.id })
          .eq('id', creditNote.id)
      }
    } catch (err) {
      console.error('Failed to create credit note journal entry:', err)
    }
  }

  return NextResponse.json({ data: completeCreditNote })
}
