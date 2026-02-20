import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { createInvoiceJournalEntry } from '@/lib/bookkeeping/invoice-entries'
import type { Invoice } from '@/types'

/**
 * POST /api/invoices/[id]/mark-sent
 *
 * Manually marks a draft invoice as sent (for invoices delivered outside the system).
 * Under faktureringsmetoden (accrual): creates the journal entry (Debit 1510, Credit 30xx/26xx).
 * Under kontantmetoden (cash): no journal entry — booking happens at payment.
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

  if (invoice.status !== 'draft') {
    return NextResponse.json(
      { error: 'Endast utkast kan markeras som skickade' },
      { status: 400 }
    )
  }

  // Update status to sent
  const { error: updateError } = await supabase
    .from('invoices')
    .update({
      status: 'sent',
      sent_at: new Date().toISOString(),
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

  // Faktureringsmetoden: book at send
  let journalEntryId: string | null = null
  if (accountingMethod === 'accrual') {
    try {
      const journalEntry = await createInvoiceJournalEntry(
        user.id,
        invoice as Invoice
      )
      if (journalEntry) {
        journalEntryId = journalEntry.id
        await supabase
          .from('invoices')
          .update({ journal_entry_id: journalEntry.id })
          .eq('id', id)
      }
    } catch (err) {
      console.error('Failed to create invoice journal entry on mark-sent:', err)
    }
  }

  return NextResponse.json({
    success: true,
    status: 'sent',
    journal_entry_id: journalEntryId,
  })
}
