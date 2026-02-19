import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { apiLimiter, rateLimitResponse } from '@/lib/rate-limit'
import { buildPaymentFileInput, generateBankgiroPaymentFile } from '@/lib/suppliers/payment-file-generator'

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

  // Fetch payment with items and invoices
  const { data: payment, error: paymentError } = await supabase
    .from('supplier_payments')
    .select(`
      *,
      items:supplier_payment_items(
        *,
        supplier_invoice:supplier_invoices(
          id, invoice_number, total, ocr_number, payment_reference,
          supplier:suppliers(id, name, bankgiro, plusgiro)
        )
      )
    `)
    .eq('id', id)
    .eq('user_id', user.id)
    .single()

  if (paymentError || !payment) {
    return NextResponse.json({ error: 'Betalning hittades inte' }, { status: 404 })
  }

  // Check that payment is in approved status
  if (!['draft', 'approved'].includes(payment.status)) {
    return NextResponse.json(
      { error: 'Betalfil kan bara genereras för utkast eller godkända betalningar' },
      { status: 400 }
    )
  }

  // Get company settings for sender bankgiro
  const { data: settings, error: settingsError } = await supabase
    .from('company_settings')
    .select('bankgiro, company_name')
    .eq('user_id', user.id)
    .single()

  if (settingsError || !settings?.bankgiro) {
    return NextResponse.json(
      { error: 'Bankgironummer saknas i företagsinställningar. Ange bankgiro under Inställningar.' },
      { status: 400 }
    )
  }

  // Build invoices array for payment file generation
  const invoices = (payment.items || [])
    .filter((item: { supplier_invoice: unknown }) => item.supplier_invoice)
    .map((item: {
      amount: number
      supplier_invoice: {
        total: number
        supplier: { name: string; bankgiro: string | null; plusgiro: string | null } | null
        ocr_number: string | null
        payment_reference: string | null
        invoice_number: string
      }
    }) => ({
      total: item.amount || item.supplier_invoice.total,
      supplier: item.supplier_invoice.supplier,
      ocr_number: item.supplier_invoice.ocr_number,
      payment_reference: item.supplier_invoice.payment_reference,
      invoice_number: item.supplier_invoice.invoice_number,
    }))

  if (invoices.length === 0) {
    return NextResponse.json(
      { error: 'Betalningen innehåller inga fakturor' },
      { status: 400 }
    )
  }

  // Generate Bankgiro payment file
  const input = buildPaymentFileInput(settings.bankgiro, payment.payment_date, invoices)
  const result = generateBankgiroPaymentFile(input)

  // Store file content on the payment
  const { error: updateError } = await supabase
    .from('supplier_payments')
    .update({
      file_content: result.content,
      total_amount: result.totalAmount,
      payment_count: result.paymentCount,
    })
    .eq('id', id)
    .eq('user_id', user.id)

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 })
  }

  return NextResponse.json({
    data: {
      file_content: result.content,
      total_amount: result.totalAmount,
      payment_count: result.paymentCount,
      filename: `LB_${payment.payment_date.replace(/-/g, '')}_${id.slice(0, 8)}.txt`,
    },
  })
}
