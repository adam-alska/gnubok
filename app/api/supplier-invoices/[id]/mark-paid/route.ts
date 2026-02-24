import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import {
  createSupplierInvoicePaymentEntry,
  createSupplierInvoiceCashEntry,
} from '@/lib/bookkeeping/supplier-invoice-entries'
import { validateBody } from '@/lib/api/validate'
import { MarkSupplierInvoicePaidSchema } from '@/lib/api/schemas'
import type { SupplierInvoice, SupplierInvoiceItem } from '@/types'

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

  const validation = await validateBody(request, MarkSupplierInvoicePaidSchema)
  if (!validation.success) return validation.response
  const body = validation.data

  // Fetch invoice with supplier and items
  const { data: invoice, error: fetchError } = await supabase
    .from('supplier_invoices')
    .select('*, supplier:suppliers(*), items:supplier_invoice_items(*)')
    .eq('id', id)
    .eq('user_id', user.id)
    .single()

  if (fetchError || !invoice) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  if (!['registered', 'approved', 'partially_paid', 'overdue'].includes(invoice.status)) {
    return NextResponse.json(
      { error: 'Fakturan kan inte markeras som betald i nuvarande status' },
      { status: 400 }
    )
  }

  const paymentDate = body.payment_date || new Date().toISOString().split('T')[0]
  const paymentAmount = body.amount || invoice.remaining_amount
  const now = new Date().toISOString()

  // Fetch accounting method
  const { data: settings } = await supabase
    .from('company_settings')
    .select('accounting_method')
    .eq('user_id', user.id)
    .single()

  const accountingMethod = settings?.accounting_method || 'accrual'

  // Create journal entry
  let journalEntryId: string | null = null

  try {
    if (accountingMethod === 'cash') {
      const journalEntry = await createSupplierInvoiceCashEntry(
        user.id,
        invoice as SupplierInvoice,
        (invoice.items || []) as SupplierInvoiceItem[],
        paymentDate,
        invoice.supplier?.supplier_type || 'swedish_business'
      )
      if (journalEntry) journalEntryId = journalEntry.id
    } else {
      const journalEntry = await createSupplierInvoicePaymentEntry(
        user.id,
        invoice as SupplierInvoice,
        paymentAmount,
        paymentDate,
        body.exchange_rate_difference
      )
      if (journalEntry) journalEntryId = journalEntry.id
    }
  } catch (err) {
    console.error('Failed to create payment journal entry:', err)
  }

  // Calculate new remaining amount
  const newRemaining = Math.round((invoice.remaining_amount - paymentAmount) * 100) / 100
  const newPaidAmount = Math.round((invoice.paid_amount + paymentAmount) * 100) / 100
  const isFullyPaid = newRemaining <= 0
  const newStatus = isFullyPaid ? 'paid' : 'partially_paid'

  // Update invoice
  const { error: updateError } = await supabase
    .from('supplier_invoices')
    .update({
      status: newStatus,
      remaining_amount: Math.max(0, newRemaining),
      paid_amount: newPaidAmount,
      paid_at: isFullyPaid ? now : null,
      payment_journal_entry_id: journalEntryId,
    })
    .eq('id', id)

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 })
  }

  // Record payment
  const { error: paymentError } = await supabase
    .from('supplier_invoice_payments')
    .insert({
      supplier_invoice_id: id,
      payment_date: paymentDate,
      amount: paymentAmount,
      currency: invoice.currency,
      exchange_rate_difference: body.exchange_rate_difference || 0,
      journal_entry_id: journalEntryId,
      notes: body.notes || null,
    })

  if (paymentError) {
    console.error('Failed to record payment:', paymentError)
  }

  return NextResponse.json({
    success: true,
    status: newStatus,
    paid_amount: newPaidAmount,
    remaining_amount: Math.max(0, newRemaining),
    journal_entry_id: journalEntryId,
  })
}
