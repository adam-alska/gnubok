import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { apiLimiter, rateLimitResponse } from '@/lib/rate-limit'
import { validateBody, UpdateReconciliationSessionSchema } from '@/lib/validation'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { success, reset } = apiLimiter.check(user.id)
  if (!success) return rateLimitResponse(reset)

  const { id } = await params

  // Fetch session
  const { data: session, error: sessionError } = await supabase
    .from('bank_reconciliation_sessions')
    .select('*')
    .eq('id', id)
    .eq('user_id', user.id)
    .single()

  if (sessionError || !session) {
    return NextResponse.json({ error: 'Session hittades inte' }, { status: 404 })
  }

  // Fetch items with transactions and matched invoices
  const { data: items, error: itemsError } = await supabase
    .from('bank_reconciliation_items')
    .select(`
      *,
      transaction:transactions(*),
      matched_invoice:invoices(*, customer:customers(*))
    `)
    .eq('session_id', id)
    .order('created_at', { ascending: true })

  if (itemsError) {
    return NextResponse.json({ error: itemsError.message }, { status: 500 })
  }

  // Compute summary stats
  const totalTransactions = items?.length || 0
  const matchedCount = items?.filter(i => i.is_reconciled).length || 0
  const unmatchedCount = totalTransactions - matchedCount
  const autoMatchedCount = items?.filter(i =>
    i.match_type === 'auto_invoice' || i.match_type === 'auto_rule'
  ).length || 0
  const manualMatchedCount = items?.filter(i => i.match_type === 'manual').length || 0
  const splitCount = items?.filter(i => i.match_type === 'split').length || 0

  const totalAmount = items?.reduce((sum, i) =>
    sum + Math.abs(i.transaction?.amount || 0), 0
  ) || 0
  const matchedAmount = items
    ?.filter(i => i.is_reconciled)
    .reduce((sum, i) => sum + Math.abs(i.transaction?.amount || 0), 0) || 0

  const summary = {
    sessionId: session.id,
    totalTransactions,
    matchedCount,
    unmatchedCount,
    autoMatchedCount,
    manualMatchedCount,
    splitCount,
    totalAmount,
    matchedAmount,
    unmatchedAmount: totalAmount - matchedAmount,
    progressPercent: totalTransactions > 0
      ? Math.round((matchedCount / totalTransactions) * 100)
      : 0,
  }

  return NextResponse.json({
    data: {
      session,
      items: items || [],
      summary,
    },
  })
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { success: rl, reset } = apiLimiter.check(user.id)
  if (!rl) return rateLimitResponse(reset)

  const { id } = await params
  const raw = await request.json()
  const validation = validateBody(UpdateReconciliationSessionSchema, raw)
  if (!validation.success) return validation.response
  const body = validation.data

  const updateData: Record<string, unknown> = {
    status: body.status,
  }

  if (body.status === 'completed') {
    updateData.completed_at = new Date().toISOString()
  }

  const { data, error } = await supabase
    .from('bank_reconciliation_sessions')
    .update(updateData)
    .eq('id', id)
    .eq('user_id', user.id)
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ data })
}
