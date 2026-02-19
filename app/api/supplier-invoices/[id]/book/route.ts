import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { apiLimiter, rateLimitResponse } from '@/lib/rate-limit'
import { createSupplierInvoiceJournalEntry } from '@/lib/suppliers/supplier-invoice-booking'
import type { SupplierInvoice, SupplierInvoiceItem } from '@/types/suppliers'

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

  // Fetch invoice with items and supplier
  const { data: invoice, error: invoiceError } = await supabase
    .from('supplier_invoices')
    .select(`
      *,
      supplier:suppliers(*),
      items:supplier_invoice_items(*)
    `)
    .eq('id', id)
    .eq('user_id', user.id)
    .single()

  if (invoiceError || !invoice) {
    return NextResponse.json({ error: 'Leverantörsfaktura hittades inte' }, { status: 404 })
  }

  // Check that invoice is in approved or attested status
  if (!['attested', 'approved'].includes(invoice.status)) {
    return NextResponse.json(
      { error: 'Fakturan måste vara attesterad eller godkänd för att bokföras' },
      { status: 400 }
    )
  }

  // Check that invoice doesn't already have a journal entry
  if (invoice.journal_entry_id) {
    return NextResponse.json(
      { error: 'Fakturan är redan bokförd' },
      { status: 400 }
    )
  }

  // Create journal entry
  try {
    const journalEntry = await createSupplierInvoiceJournalEntry(
      user.id,
      invoice as SupplierInvoice,
      (invoice.items || []) as SupplierInvoiceItem[]
    )

    if (!journalEntry) {
      return NextResponse.json(
        { error: 'Kunde inte skapa verifikation. Kontrollera att det finns en öppen räkenskapsperiod.' },
        { status: 400 }
      )
    }

    // Update invoice with journal entry reference and set status to approved
    const { data: updatedInvoice, error: updateError } = await supabase
      .from('supplier_invoices')
      .update({
        journal_entry_id: journalEntry.id,
        status: 'approved',
      })
      .eq('id', id)
      .eq('user_id', user.id)
      .select('*, supplier:suppliers(*), items:supplier_invoice_items(*)')
      .single()

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 })
    }

    return NextResponse.json({
      data: {
        invoice: updatedInvoice,
        journal_entry: journalEntry,
      },
    })
  } catch (err) {
    console.error('Failed to book supplier invoice:', err)
    return NextResponse.json(
      { error: 'Kunde inte bokföra leverantörsfakturan' },
      { status: 500 }
    )
  }
}
