import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { evaluateMappingRules } from '@/lib/bookkeeping/mapping-engine'
import type { Transaction } from '@/types'
import { apiLimiter, rateLimitResponse } from '@/lib/rate-limit'
import { validateBody, EvaluateMappingRuleInputSchema } from '@/lib/validation'

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { success, remaining, reset } = apiLimiter.check(user.id)
  if (!success) return rateLimitResponse(reset)

  const raw = await request.json()
  const validation = validateBody(EvaluateMappingRuleInputSchema, raw)
  if (!validation.success) return validation.response
  const body = validation.data

  // Accept either a transaction ID or raw transaction data
  let transaction: Transaction

  if (body.transaction_id) {
    const { data, error } = await supabase
      .from('transactions')
      .select('*')
      .eq('id', body.transaction_id)
      .eq('user_id', user.id)
      .single()

    if (error || !data) {
      return NextResponse.json({ error: 'Transaction not found' }, { status: 404 })
    }

    transaction = data as Transaction
  } else {
    transaction = body as Transaction
  }

  try {
    const result = await evaluateMappingRules(user.id, transaction)
    return NextResponse.json({ data: result })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Evaluation failed' },
      { status: 500 }
    )
  }
}
