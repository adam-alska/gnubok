import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { renderToBuffer } from '@react-pdf/renderer'
import { InvoicePDF } from '@/lib/invoice/pdf-template'
import { getVatRules } from '@/lib/invoice/vat-rules'
import type { Invoice, InvoiceItem, Customer, CompanySettings, InvoiceDocumentType } from '@/types'

/**
 * POST /api/invoices/preview-pdf
 *
 * Generates a preview PDF from form data without creating an invoice.
 * Returns the PDF as an inline blob for display in a new browser tab.
 */
export async function POST(request: Request) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const { customer_id, invoice_date, due_date, currency, items, your_reference, our_reference, notes, document_type } = body

  if (!customer_id || !items || items.length === 0) {
    return NextResponse.json({ error: 'Kunduppgifter och rader krävs' }, { status: 400 })
  }

  // Fetch customer
  const { data: customer, error: customerError } = await supabase
    .from('customers')
    .select('*')
    .eq('id', customer_id)
    .eq('user_id', user.id)
    .single()

  if (customerError || !customer) {
    return NextResponse.json({ error: 'Kunden hittades inte' }, { status: 404 })
  }

  // Fetch company settings
  const { data: company, error: companyError } = await supabase
    .from('company_settings')
    .select('*')
    .eq('user_id', user.id)
    .single()

  if (companyError || !company) {
    return NextResponse.json({ error: 'Företagsinställningar saknas' }, { status: 404 })
  }

  const vatRules = getVatRules(customer.customer_type, customer.vat_number_validated)

  const docType: InvoiceDocumentType = document_type || 'invoice'
  const isDeliveryNote = docType === 'delivery_note'

  // Build items with line totals
  const invoiceItems: InvoiceItem[] = items.map((item: { description: string; quantity: number; unit: string; unit_price: number; vat_rate?: number }, index: number) => ({
    id: `preview-${index}`,
    invoice_id: 'preview',
    sort_order: index,
    description: item.description,
    quantity: item.quantity,
    unit: item.unit,
    unit_price: item.unit_price,
    line_total: Math.round(item.quantity * item.unit_price * 100) / 100,
    vat_rate: item.vat_rate ?? vatRules.rate,
    vat_amount: 0,
    created_at: new Date().toISOString(),
  }))

  const subtotal = invoiceItems.reduce((sum, item) => sum + item.line_total, 0)
  const vatAmount = isDeliveryNote ? 0 : Math.round(subtotal * (vatRules.rate / 100) * 100) / 100
  const total = isDeliveryNote ? 0 : subtotal + vatAmount

  // Construct a temporary Invoice-like object
  const previewInvoice = {
    id: 'preview',
    user_id: user.id,
    customer_id,
    invoice_number: 'FÖRHANDSGRANSKNING',
    invoice_date: invoice_date || new Date().toISOString().split('T')[0],
    due_date: due_date || new Date().toISOString().split('T')[0],
    status: 'draft',
    currency: currency || 'SEK',
    exchange_rate: null,
    exchange_rate_date: null,
    subtotal: isDeliveryNote ? 0 : subtotal,
    subtotal_sek: null,
    vat_amount: vatAmount,
    vat_amount_sek: null,
    total,
    total_sek: null,
    vat_treatment: vatRules.treatment,
    vat_rate: isDeliveryNote ? 0 : vatRules.rate,
    moms_ruta: vatRules.momsRuta,
    your_reference: your_reference || null,
    our_reference: our_reference || null,
    notes: notes || null,
    reverse_charge_text: vatRules.reverseChargeText || null,
    credited_invoice_id: null,
    document_type: docType,
    converted_from_id: null,
    paid_at: null,
    paid_amount: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  } as Invoice

  try {
    const pdfBuffer = await renderToBuffer(
      InvoicePDF({
        invoice: previewInvoice,
        customer: customer as Customer,
        items: invoiceItems,
        company: company as CompanySettings,
      })
    )

    return new Response(new Uint8Array(pdfBuffer), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': 'inline; filename="forhandsvisning.pdf"',
      },
    })
  } catch (error) {
    console.error('Preview PDF generation error:', error)
    return NextResponse.json(
      { error: 'Kunde inte generera PDF-förhandsgranskning' },
      { status: 500 }
    )
  }
}
