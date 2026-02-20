import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import {
  createInvoicePaymentJournalEntry,
  createInvoiceCashEntry,
} from '@/lib/bookkeeping/invoice-entries'
import type { Invoice } from '@/types'

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

  const now = new Date().toISOString()
  const paymentDate = now.split('T')[0]

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
    .select('accounting_method')
    .eq('user_id', user.id)
    .single()

  const accountingMethod = settings?.accounting_method || 'accrual'

  let journalEntryId: string | null = null

  try {
    if (accountingMethod === 'accrual') {
      // Faktureringsmetoden: clear receivable (Debit 1930, Credit 1510)
      const journalEntry = await createInvoicePaymentJournalEntry(
        user.id,
        invoice as Invoice,
        paymentDate
      )
      journalEntryId = journalEntry?.id ?? null
    } else {
      // Kontantmetoden: combined revenue entry (Debit 1930, Credit 30xx, Credit 26xx)
      const journalEntry = await createInvoiceCashEntry(
        user.id,
        invoice as Invoice,
        paymentDate
      )
      journalEntryId = journalEntry?.id ?? null
    }
  } catch (err) {
    console.error('Failed to create payment journal entry on mark-paid:', err)
  }

  return NextResponse.json({
    success: true,
    status: 'paid',
    paid_at: now,
    paid_amount: invoice.total,
    journal_entry_id: journalEntryId,
  })
}
