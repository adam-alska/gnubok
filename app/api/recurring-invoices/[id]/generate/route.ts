import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { apiLimiter, rateLimitResponse } from '@/lib/rate-limit'
import { generateInvoiceFromRecurring } from '@/lib/invoices/recurring-engine'
import type { RecurringInvoice } from '@/types/invoices-enhanced'

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

  // Fetch the recurring invoice
  const { data: recurring, error } = await supabase
    .from('recurring_invoices')
    .select('*, customer:customers(*)')
    .eq('id', id)
    .eq('user_id', user.id)
    .single()

  if (error || !recurring) {
    return NextResponse.json({ error: 'Återkommande faktura hittades inte' }, { status: 404 })
  }

  if (!recurring.is_active) {
    return NextResponse.json({ error: 'Återkommande faktura är inaktiv' }, { status: 400 })
  }

  // Generate invoice from the template
  const result = await generateInvoiceFromRecurring(
    recurring as unknown as RecurringInvoice,
    supabase
  )

  if (!result) {
    return NextResponse.json({ error: 'Kunde inte generera faktura' }, { status: 500 })
  }

  return NextResponse.json({ data: result })
}
