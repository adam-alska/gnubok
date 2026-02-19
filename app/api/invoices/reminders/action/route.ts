import { createServerClient } from '@supabase/ssr'
import { NextResponse } from 'next/server'
import { logger } from '@/lib/logger'
import { validateBody, ReminderActionInputSchema } from '@/lib/validation'

// Create a service client (no auth needed - public endpoint with token validation)
function createServiceClient() {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      cookies: {
        getAll() { return [] },
        setAll() { }
      }
    }
  )
}

export async function POST(request: Request) {
  try {
    const raw = await request.json()
    const validation = validateBody(ReminderActionInputSchema, raw)
    if (!validation.success) return validation.response
    const { token, action } = validation.data

    const supabase = createServiceClient()

    // Find the reminder by action token
    const { data: reminder, error: findError } = await supabase
      .from('invoice_reminders')
      .select(`
        *,
        invoice:invoices(
          id,
          invoice_number,
          status,
          user_id
        )
      `)
      .eq('action_token', token)
      .single()

    if (findError || !reminder) {
      return NextResponse.json(
        { error: 'Ogiltig eller utgången länk' },
        { status: 404 }
      )
    }

    // Check if token was already used
    if (reminder.action_token_used) {
      return NextResponse.json(
        { error: 'Denna länk har redan använts' },
        { status: 400 }
      )
    }

    // Update the reminder with the response
    const { error: updateError } = await supabase
      .from('invoice_reminders')
      .update({
        response_type: action,
        response_at: new Date().toISOString(),
        action_token_used: true
      })
      .eq('id', reminder.id)

    if (updateError) {
      logger.error('reminder-action', 'Failed to update reminder', { error: updateError.message })
      return NextResponse.json(
        { error: 'Kunde inte spara ditt svar' },
        { status: 500 }
      )
    }

    // If customer marked as paid, we could optionally notify the business owner
    // For now, we just log it - the business owner will see it in the UI
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const invoiceData = reminder.invoice as any
    const invoice = Array.isArray(invoiceData) ? invoiceData[0] : invoiceData
    logger.info('reminder-action', `Customer responded to invoice`, { invoiceNumber: invoice?.invoice_number, action })

    return NextResponse.json({
      success: true,
      message: action === 'marked_paid'
        ? 'Tack! Vi har noterat att du har betalat fakturan.'
        : 'Tack! Vi har noterat din invändning och kommer att kontakta dig.'
    })
  } catch (error) {
    logger.error('reminder-action', 'Action handler error', { error: error instanceof Error ? error.message : String(error) })
    return NextResponse.json(
      { error: 'Ett fel uppstod' },
      { status: 500 }
    )
  }
}

// GET endpoint to fetch reminder/invoice info by token (for the public page)
export async function GET(request: Request) {
  const url = new URL(request.url)
  const token = url.searchParams.get('token')

  if (!token) {
    return NextResponse.json({ error: 'Token saknas' }, { status: 400 })
  }

  const supabase = createServiceClient()

  // Find the reminder by action token
  const { data: reminder, error: findError } = await supabase
    .from('invoice_reminders')
    .select(`
      id,
      reminder_level,
      sent_at,
      response_type,
      action_token_used,
      invoice:invoices(
        id,
        invoice_number,
        invoice_date,
        due_date,
        total,
        currency,
        status,
        customer:customers(
          name
        )
      )
    `)
    .eq('action_token', token)
    .single()

  if (findError || !reminder) {
    return NextResponse.json(
      { error: 'Ogiltig eller utgången länk' },
      { status: 404 }
    )
  }

  // Don't expose sensitive data, just what's needed for the public page
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const invoiceData = reminder.invoice as any
  const invoice = Array.isArray(invoiceData) ? invoiceData[0] : invoiceData

  if (!invoice) {
    return NextResponse.json(
      { error: 'Faktura hittades inte' },
      { status: 404 }
    )
  }

  // Handle nested customer which may also be an array
  const customerData = invoice.customer
  const customer = Array.isArray(customerData) ? customerData[0] : customerData

  return NextResponse.json({
    invoiceNumber: invoice.invoice_number,
    invoiceDate: invoice.invoice_date,
    dueDate: invoice.due_date,
    total: invoice.total,
    currency: invoice.currency,
    customerName: customer?.name,
    reminderLevel: reminder.reminder_level,
    alreadyResponded: reminder.action_token_used,
    previousResponse: reminder.response_type
  })
}
