import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { apiLimiter, rateLimitResponse } from '@/lib/rate-limit'
import { validateBody, CreateReconciliationSessionSchema } from '@/lib/validation'

export async function GET(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { success, reset } = apiLimiter.check(user.id)
  if (!success) return rateLimitResponse(reset)

  const { searchParams } = new URL(request.url)
  const status = searchParams.get('status')

  let query = supabase
    .from('bank_reconciliation_sessions')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })

  if (status) {
    query = query.eq('status', status)
  }

  const { data, error } = await query

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ data })
}

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { success: rl, reset } = apiLimiter.check(user.id)
  if (!rl) return rateLimitResponse(reset)

  const raw = await request.json()
  const validation = validateBody(CreateReconciliationSessionSchema, raw)
  if (!validation.success) return validation.response
  const body = validation.data

  // Create the session
  const { data: session, error: sessionError } = await supabase
    .from('bank_reconciliation_sessions')
    .insert({
      user_id: user.id,
      bank_connection_id: body.bank_connection_id || null,
      account_name: body.account_name || null,
      account_iban: body.account_iban || null,
      period_start: body.period_start,
      period_end: body.period_end,
      opening_balance: body.opening_balance || 0,
      closing_balance: body.closing_balance || 0,
      status: 'in_progress',
    })
    .select()
    .single()

  if (sessionError) {
    return NextResponse.json({ error: sessionError.message }, { status: 500 })
  }

  // Fetch transactions in the period and create reconciliation items for them
  const { data: transactions, error: txError } = await supabase
    .from('transactions')
    .select('*')
    .eq('user_id', user.id)
    .gte('date', body.period_start)
    .lte('date', body.period_end)
    .order('date', { ascending: true })

  if (txError) {
    return NextResponse.json({ error: txError.message }, { status: 500 })
  }

  if (transactions && transactions.length > 0) {
    // Filter by bank connection if specified
    let filteredTx = transactions
    if (body.bank_connection_id) {
      filteredTx = transactions.filter(
        tx => tx.bank_connection_id === body.bank_connection_id || !tx.bank_connection_id
      )
    }

    const items = filteredTx.map(tx => ({
      session_id: session.id,
      transaction_id: tx.id,
      match_type: 'unmatched',
      confidence_score: 0,
      is_reconciled: false,
    }))

    if (items.length > 0) {
      const { error: itemsError } = await supabase
        .from('bank_reconciliation_items')
        .insert(items)

      if (itemsError) {
        console.error('Failed to create reconciliation items:', itemsError)
      }
    }
  }

  return NextResponse.json({ data: session })
}
