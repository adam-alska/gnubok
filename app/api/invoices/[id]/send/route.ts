import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { renderToBuffer } from '@react-pdf/renderer'
import { InvoicePDF } from '@/lib/invoice/pdf-template'
import { sendEmail, isResendConfigured } from '@/lib/email/resend'
import {
  generateInvoiceEmailHtml,
  generateInvoiceEmailText,
  generateInvoiceEmailSubject
} from '@/lib/email/invoice-templates'
import type { Invoice, InvoiceItem, Customer, CompanySettings } from '@/types'

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

  // Check if Resend is configured
  if (!isResendConfigured()) {
    return NextResponse.json(
      { error: 'E-posttjänsten är inte konfigurerad. Kontakta support.' },
      { status: 503 }
    )
  }

  // Fetch invoice with customer and items
  const { data: invoice, error: invoiceError } = await supabase
    .from('invoices')
    .select(`
      *,
      customer:customers(*),
      items:invoice_items(*)
    `)
    .eq('id', id)
    .eq('user_id', user.id)
    .single()

  if (invoiceError || !invoice) {
    return NextResponse.json({ error: 'Fakturan hittades inte' }, { status: 404 })
  }

  // Verify customer has email
  const customer = invoice.customer as Customer
  if (!customer.email) {
    return NextResponse.json(
      { error: 'Kunden saknar e-postadress. Uppdatera kunduppgifterna först.' },
      { status: 400 }
    )
  }

  // Fetch company settings
  const { data: company, error: companyError } = await supabase
    .from('company_settings')
    .select('*')
    .eq('user_id', user.id)
    .single()

  if (companyError || !company) {
    return NextResponse.json(
      { error: 'Företagsinställningar saknas' },
      { status: 404 }
    )
  }

  // Sort items by sort_order
  const items = (invoice.items as InvoiceItem[]).sort(
    (a, b) => a.sort_order - b.sort_order
  )

  // If this is a credit note, fetch the original invoice number
  let originalInvoiceNumber: string | undefined
  if (invoice.credited_invoice_id) {
    const { data: originalInvoice } = await supabase
      .from('invoices')
      .select('invoice_number')
      .eq('id', invoice.credited_invoice_id)
      .single()

    if (originalInvoice) {
      originalInvoiceNumber = originalInvoice.invoice_number
    }
  }

  try {
    // Generate PDF
    const pdfBuffer = await renderToBuffer(
      InvoicePDF({
        invoice: invoice as Invoice,
        customer,
        items,
        company: company as CompanySettings,
        originalInvoiceNumber,
      })
    )

    // Prepare email data
    const emailData = {
      invoice: invoice as Invoice,
      customer,
      company: company as CompanySettings
    }

    // Determine filename
    const isCreditNote = !!invoice.credited_invoice_id
    const filename = isCreditNote
      ? `kreditfaktura-${invoice.invoice_number}.pdf`
      : `faktura-${invoice.invoice_number}.pdf`

    // Send email
    const result = await sendEmail({
      to: customer.email,
      subject: generateInvoiceEmailSubject(emailData),
      html: generateInvoiceEmailHtml(emailData),
      text: generateInvoiceEmailText(emailData),
      replyTo: (company as CompanySettings & { email?: string }).email || undefined,
      fromName: company.company_name,
      attachments: [
        {
          filename,
          content: pdfBuffer,
          contentType: 'application/pdf'
        }
      ]
    })

    if (!result.success) {
      console.error('Failed to send invoice email:', result.error)
      return NextResponse.json(
        { error: `Kunde inte skicka e-post: ${result.error}` },
        { status: 500 }
      )
    }

    // Update invoice status to "sent" and set sent_at timestamp
    const { error: updateError } = await supabase
      .from('invoices')
      .update({
        status: 'sent',
        sent_at: new Date().toISOString()
      })
      .eq('id', id)
      .eq('user_id', user.id)

    if (updateError) {
      console.error('Failed to update invoice status:', updateError)
      // Don't fail the request - the email was sent successfully
    }

    return NextResponse.json({
      success: true,
      message: `Fakturan har skickats till ${customer.email}`,
      messageId: result.messageId
    })
  } catch (error) {
    console.error('Send invoice error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Kunde inte skicka fakturan' },
      { status: 500 }
    )
  }
}
