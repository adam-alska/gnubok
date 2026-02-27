import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import {
  createInvoicePaymentJournalEntry,
  createInvoiceCashEntry,
} from '@/lib/bookkeeping/invoice-entries'
import { MarkInvoicePaidSchema } from '@/lib/api/schemas'
import type { EntityType, Invoice } from '@/types'

/**
 * POST /api/invoices/[id]/mark-paid
 *
 * Manually marks an invoice as paid (for payments received outside bank sync).
 *
 * Faktureringsmetoden (accrual):
 *   Creates payment clearing entry: Debit 1930, Credit 1510
 *
 * Kontantmetoden (cash):
 *   Creates combined revenue entry: Debit 1930, Credit 30xx, Credit 26xx
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Fetch invoice
  const { data: invoice, error: invoiceError } = await supabase
    .from('invoices')
    .select('*, customer:customers(*), items:invoice_items(*)')
    .eq('id', id)
    .eq('user_id', user.id)
    .single()

  if (invoiceError || !invoice) {
    return NextResponse.json({ error: 'Fakturan hittades inte' }, { status: 404 })
  }

  if (invoice.status !== 'sent' && invoice.status !== 'overdue') {
    return NextResponse.json(
      { error: 'Fakturan kan inte markeras som betald i nuvarande status' },
      { status: 400 }
    )
  }

  // Parse optional body (backward compatible — body may be empty)
  let exchangeRateDifference: number | undefined
  let bodyPaymentDate: string | undefined
  try {
    const text = await request.text()
    if (text) {
      const parsed = MarkInvoicePaidSchema.safeParse(JSON.parse(text))
      if (parsed.success) {
        exchangeRateDifference = parsed.data.exchange_rate_difference
        bodyPaymentDate = parsed.data.payment_date
      }
    }
  } catch {
    // No body or invalid JSON — use defaults
  }

  const now = new Date().toISOString()
  const paymentDate = bodyPaymentDate || now.split('T')[0]

  // Update status to paid
  const { error: updateError } = await supabase
    .from('invoices')
    .update({
      status: 'paid',
      paid_at: now,
      paid_amount: invoice.total,
    })
    .eq('id', id)
    .eq('user_id', user.id)

  if (updateError) {
    return NextResponse.json({ error: 'Kunde inte uppdatera status' }, { status: 500 })
  }

  // Fetch accounting method
  const { data: settings } = await supabase
    .from('company_settings')
    .select('accounting_method, entity_type')
    .eq('user_id', user.id)
    .single()

  const accountingMethod = settings?.accounting_method || 'accrual'
  const entityType = (settings?.entity_type as EntityType) || 'enskild_firma'

  // Only create journal entries for real invoices (not proformas or delivery notes)
  const isRealInvoice = !invoice.document_type || invoice.document_type === 'invoice'
  let journalEntryId: string | null = null

  if (isRealInvoice) {
    try {
      if (accountingMethod === 'accrual') {
        // Faktureringsmetoden: clear receivable (Debit 1930, Credit 1510)
        const journalEntry = await createInvoicePaymentJournalEntry(
          supabase,
          user.id,
          invoice as Invoice,
          paymentDate,
          exchangeRateDifference
        )
        journalEntryId = journalEntry?.id ?? null
      } else {
        // Kontantmetoden: combined revenue entry (Debit 1930, Credit 30xx, Credit 26xx)
        const journalEntry = await createInvoiceCashEntry(
          supabase,
          user.id,
          invoice as Invoice,
          paymentDate,
          entityType
        )
        journalEntryId = journalEntry?.id ?? null
      }
    } catch (err) {
      console.error('Failed to create payment journal entry on mark-paid:', err)
    }
  }

  return NextResponse.json({
    success: true,
    status: 'paid',
    paid_at: now,
    paid_amount: invoice.total,
    journal_entry_id: journalEntryId,
  })
}
