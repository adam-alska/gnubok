import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import {
  createInvoicePaymentJournalEntry,
  createInvoiceCashEntry,
} from '@/lib/bookkeeping/invoice-entries'
import { validateBody } from '@/lib/api/validate'
import { MatchInvoiceSchema } from '@/lib/api/schemas'
import type { EntityType, Invoice } from '@/types'

/**
 * POST /api/transactions/[id]/match-invoice
 *
 * Confirms an invoice match for a transaction:
 * 1. Links transaction to invoice (sets invoice_id)
 * 2. Updates invoice status to 'paid'
 * 3. Sets paid_at and paid_amount on invoice
 * 4. Creates journal entry for payment receipt
 *    - Debit 1930 Företagskonto (Bank)
 *    - Credit 1510 Kundfordringar (Accounts Receivable)
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

  // Parse and validate request body
  const validation = await validateBody(request, MatchInvoiceSchema)
  if (!validation.success) return validation.response
  const { invoice_id } = validation.data

  // Fetch the transaction (validates ownership)
  const { data: transaction, error: fetchTxError } = await supabase
    .from('transactions')
    .select('*')
    .eq('id', transactionId)
    .eq('user_id', user.id)
    .single()

  if (fetchTxError || !transaction) {
    return NextResponse.json({ error: 'Transaction not found' }, { status: 404 })
  }

  // Verify transaction is income (amount > 0)
  if (transaction.amount <= 0) {
    return NextResponse.json(
      { error: 'Only income transactions can be matched to invoices' },
      { status: 400 }
    )
  }

  // Check if transaction is already linked to an invoice
  if (transaction.invoice_id) {
    return NextResponse.json(
      { error: 'Transaction is already linked to an invoice' },
      { status: 400 }
    )
  }

  // Fetch the invoice with items (validates ownership, items needed for per-line VAT)
  const { data: invoice, error: fetchInvError } = await supabase
    .from('invoices')
    .select('*, customer:customers(*), items:invoice_items(*)')
    .eq('id', invoice_id)
    .eq('user_id', user.id)
    .single()

  if (fetchInvError || !invoice) {
    return NextResponse.json({ error: 'Invoice not found' }, { status: 404 })
  }

  // Verify invoice is unpaid
  if (invoice.status !== 'sent' && invoice.status !== 'overdue') {
    return NextResponse.json(
      { error: 'Invoice is not in an unpaid state' },
      { status: 400 }
    )
  }

  const now = new Date().toISOString()
  const paidAmount = transaction.amount

  // Fetch accounting method
  const { data: settings } = await supabase
    .from('company_settings')
    .select('accounting_method, entity_type')
    .eq('user_id', user.id)
    .single()

  const accountingMethod = settings?.accounting_method || 'accrual'
  const entityType = (settings?.entity_type as EntityType) || 'enskild_firma'

  // Create journal entry for payment receipt (method-aware)
  let journalEntryId: string | null = null
  let journalEntryError: string | null = null

  try {
    if (accountingMethod === 'cash') {
      // Kontantmetoden: combined revenue entry with per-line VAT rates
      const journalEntry = await createInvoiceCashEntry(
        supabase,
        user.id,
        invoice as Invoice,
        transaction.date,
        entityType
      )
      journalEntryId = journalEntry?.id ?? null
    } else {
      // Faktureringsmetoden: clear receivable (Debit 1930, Credit 1510)
      const journalEntry = await createInvoicePaymentJournalEntry(
        supabase,
        user.id,
        invoice as Invoice,
        transaction.date
      )
      journalEntryId = journalEntry?.id ?? null
    }
  } catch (err) {
    console.error('Failed to create payment journal entry:', err)
    journalEntryError = err instanceof Error ? err.message : 'Unknown error'
    // Continue - we still want to update the invoice and transaction
  }

  // Update invoice to paid status
  const { error: updateInvError } = await supabase
    .from('invoices')
    .update({
      status: 'paid',
      paid_at: now,
      paid_amount: paidAmount,
    })
    .eq('id', invoice_id)

  if (updateInvError) {
    console.error('Failed to update invoice:', updateInvError)
    return NextResponse.json(
      { error: 'Failed to update invoice status' },
      { status: 500 }
    )
  }

  // Update transaction to link to invoice and clear potential match
  const { error: updateTxError } = await supabase
    .from('transactions')
    .update({
      invoice_id: invoice_id,
      potential_invoice_id: null,
      journal_entry_id: journalEntryId,
      is_business: true,
      category: 'income_services', // Default to services income
    })
    .eq('id', transactionId)

  if (updateTxError) {
    console.error('Failed to update transaction:', updateTxError)
    return NextResponse.json(
      { error: 'Failed to link transaction to invoice' },
      { status: 500 }
    )
  }

  return NextResponse.json({
    success: true,
    invoice_status: 'paid',
    paid_at: now,
    paid_amount: paidAmount,
    journal_entry_id: journalEntryId,
    journal_entry_error: journalEntryError,
  })
}
