import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { apiLimiter, rateLimitResponse } from '@/lib/rate-limit'
import { validateBody, CreateMappingRuleInputSchema } from '@/lib/validation'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { success, remaining, reset } = apiLimiter.check(user.id)
  if (!success) return rateLimitResponse(reset)

  const { data, error } = await supabase
    .from('mapping_rules')
    .select('*')
    .or(`user_id.eq.${user.id},user_id.is.null`)
    .eq('is_active', true)
    .order('priority')

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

  const { success: postRl, remaining: postRem, reset: postReset } = apiLimiter.check(user.id)
  if (!postRl) return rateLimitResponse(postReset)

  const raw = await request.json()
  const validation = validateBody(CreateMappingRuleInputSchema, raw)
  if (!validation.success) return validation.response
  const body = validation.data

  const { data, error } = await supabase
    .from('mapping_rules')
    .insert({
      user_id: user.id,
      rule_name: body.rule_name,
      rule_type: body.rule_type,
      priority: body.priority || 10,
      mcc_codes: body.mcc_codes || null,
      merchant_pattern: body.merchant_pattern || null,
      description_pattern: body.description_pattern || null,
      amount_min: body.amount_min || null,
      amount_max: body.amount_max || null,
      debit_account: body.debit_account,
      credit_account: body.credit_account,
      vat_treatment: body.vat_treatment || null,
      risk_level: body.risk_level || 'NONE',
      default_private: body.default_private || false,
      requires_review: body.requires_review || false,
      confidence_score: body.confidence_score || 0.9,
    })
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ data })
}
