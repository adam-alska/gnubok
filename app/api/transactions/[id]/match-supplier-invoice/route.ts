import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import {
  createSupplierInvoicePaymentEntry,
  createSupplierInvoiceCashEntry,
} from '@/lib/bookkeeping/supplier-invoice-entries'
import { validateBody } from '@/lib/api/validate'
import { MatchSupplierInvoiceSchema } from '@/lib/api/schemas'
import type { SupplierInvoice, SupplierInvoiceItem } from '@/types'

/**
 * POST /api/transactions/[id]/match-supplier-invoice
 *
 * Match a negative transaction (expense) to a supplier invoice.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  const { id: transactionId } = await params

  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const validation = await validateBody(request, MatchSupplierInvoiceSchema)
  if (!validation.success) return validation.response
  const { supplier_invoice_id } = validation.data

  // Fetch the transaction
  const { data: transaction, error: fetchTxError } = await supabase
    .from('transactions')
    .select('*')
    .eq('id', transactionId)
    .eq('user_id', user.id)
    .single()

  if (fetchTxError || !transaction) {
    return NextResponse.json({ error: 'Transaction not found' }, { status: 404 })
  }

  // Verify transaction is an expense (amount < 0)
  if (transaction.amount >= 0) {
    return NextResponse.json(
      { error: 'Bara utgiftstransaktioner kan matchas mot leverantörsfakturor' },
      { status: 400 }
    )
  }

  if (transaction.supplier_invoice_id) {
    return NextResponse.json(
      { error: 'Transaktionen är redan kopplad till en leverantörsfaktura' },
      { status: 400 }
    )
  }

  // Fetch the invoice with supplier and items
  const { data: invoice, error: fetchInvError } = await supabase
    .from('supplier_invoices')
    .select('*, supplier:suppliers(*), items:supplier_invoice_items(*)')
    .eq('id', supplier_invoice_id)
    .eq('user_id', user.id)
    .single()

  if (fetchInvError || !invoice) {
    return NextResponse.json({ error: 'Supplier invoice not found' }, { status: 404 })
  }

  if (invoice.status === 'paid' || invoice.status === 'credited') {
    return NextResponse.json(
      { error: 'Leverantörsfakturan är redan betald' },
      { status: 400 }
    )
  }

  const paymentAmount = Math.abs(transaction.amount)
  const now = new Date().toISOString()

  // Get accounting method
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
        supabase,
        user.id,
        invoice as SupplierInvoice,
        (invoice.items || []) as SupplierInvoiceItem[],
        transaction.date,
        invoice.supplier?.supplier_type || 'swedish_business'
      )
      if (journalEntry) journalEntryId = journalEntry.id
    } else {
      const journalEntry = await createSupplierInvoicePaymentEntry(
        supabase,
        user.id,
        invoice as SupplierInvoice,
        paymentAmount,
        transaction.date
      )
      if (journalEntry) journalEntryId = journalEntry.id
    }
  } catch (err) {
    console.error('Failed to create payment journal entry:', err)
  }

  // Update supplier invoice
  const newRemaining = Math.max(0, Math.round((invoice.remaining_amount - paymentAmount) * 100) / 100)
  const newPaidAmount = Math.round((invoice.paid_amount + paymentAmount) * 100) / 100
  const isFullyPaid = newRemaining <= 0
  const newStatus = isFullyPaid ? 'paid' : 'partially_paid'

  const { error: updateInvError } = await supabase
    .from('supplier_invoices')
    .update({
      status: newStatus,
      remaining_amount: newRemaining,
      paid_amount: newPaidAmount,
      paid_at: isFullyPaid ? now : null,
      payment_journal_entry_id: journalEntryId,
      transaction_id: transactionId,
    })
    .eq('id', supplier_invoice_id)

  if (updateInvError) {
    return NextResponse.json({ error: 'Failed to update supplier invoice' }, { status: 500 })
  }

  // Record payment
  await supabase.from('supplier_invoice_payments').insert({
    supplier_invoice_id,
    payment_date: transaction.date,
    amount: paymentAmount,
    currency: invoice.currency,
    journal_entry_id: journalEntryId,
    transaction_id: transactionId,
  })

  // Update transaction
  const { error: updateTxError } = await supabase
    .from('transactions')
    .update({
      supplier_invoice_id,
      journal_entry_id: journalEntryId,
      is_business: true,
    })
    .eq('id', transactionId)

  if (updateTxError) {
    return NextResponse.json({ error: 'Failed to link transaction' }, { status: 500 })
  }

  return NextResponse.json({
    success: true,
    invoice_status: newStatus,
    paid_amount: newPaidAmount,
    remaining_amount: newRemaining,
    journal_entry_id: journalEntryId,
  })
}
