import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { apiLimiter, rateLimitResponse } from '@/lib/rate-limit'

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

  // Fetch quote
  const { data: quote, error: quoteError } = await supabase
    .from('quotes')
    .select('*, customer:customers(email, name)')
    .eq('id', id)
    .eq('user_id', user.id)
    .single()

  if (quoteError || !quote) {
    return NextResponse.json({ error: 'Offerten hittades inte' }, { status: 404 })
  }

  if (quote.status !== 'draft') {
    return NextResponse.json({ error: 'Bara utkast kan skickas' }, { status: 400 })
  }

  const customer = quote.customer as { email: string | null; name: string }

  if (!customer?.email) {
    return NextResponse.json({ error: 'Kunden saknar e-postadress' }, { status: 400 })
  }

  // Update status to sent
  const { error: updateError } = await supabase
    .from('quotes')
    .update({ status: 'sent' })
    .eq('id', id)

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 })
  }

  // In a real implementation, this would send an email with the quote PDF.
  // For now, we just update the status.

  return NextResponse.json({
    message: `Offert ${quote.quote_number} markerad som skickad till ${customer.email}`,
  })
}
