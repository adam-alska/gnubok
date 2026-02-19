import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { validateBody, ConvertQuoteInputSchema } from '@/lib/validation'
import { apiLimiter, rateLimitResponse } from '@/lib/rate-limit'
import { convertQuoteToOrder, convertQuoteToInvoice } from '@/lib/invoices/conversion-engine'

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

  const { success, reset } = apiLimiter.check(user.id)
  if (!success) return rateLimitResponse(reset)

  const body = await request.json()
  const validation = validateBody(ConvertQuoteInputSchema, body)
  if (!validation.success) return validation.response
  const { target } = validation.data

  if (target === 'order') {
    const result = await convertQuoteToOrder(id, user.id, supabase)
    if (result.error) {
      return NextResponse.json({ error: result.error }, { status: 400 })
    }
    return NextResponse.json({ data: result.data, type: 'order' })
  }

  if (target === 'invoice') {
    const result = await convertQuoteToInvoice(id, user.id, supabase)
    if (result.error) {
      return NextResponse.json({ error: result.error }, { status: 400 })
    }
    return NextResponse.json({ data: result.data, type: 'invoice' })
  }

  return NextResponse.json({ error: 'Ogiltig konverteringstyp' }, { status: 400 })
}
