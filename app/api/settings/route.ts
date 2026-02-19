import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { didTaxFieldsChange, regenerateTaxDeadlinesForUser } from '@/lib/tax/deadline-generator'
import { logger } from '@/lib/logger'
import { validateBody, UpdateSettingsInputSchema } from '@/lib/validation'
import { apiLimiter, rateLimitResponse } from '@/lib/rate-limit'

export async function GET() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { success, remaining, reset } = apiLimiter.check(user.id)
  if (!success) return rateLimitResponse(reset)

  const { data, error } = await supabase
    .from('company_settings')
    .select('*')
    .eq('user_id', user.id)
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ data })
}

export async function PUT(request: Request) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { success: putRl, remaining: putRem, reset: putReset } = apiLimiter.check(user.id)
  if (!putRl) return rateLimitResponse(putReset)

  // Fetch current settings to check for tax-relevant changes
  const { data: oldSettings } = await supabase
    .from('company_settings')
    .select('entity_type, moms_period, f_skatt, vat_registered, pays_salaries, fiscal_year_start_month')
    .eq('user_id', user.id)
    .single()

  const raw = await request.json()
  const validation = validateBody(UpdateSettingsInputSchema, raw)
  if (!validation.success) return validation.response
  const body = validation.data

  const { data, error } = await supabase
    .from('company_settings')
    .update(body as Record<string, unknown>)
    .eq('user_id', user.id)
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Check if tax-relevant fields changed and regenerate deadlines
  if (oldSettings && didTaxFieldsChange(oldSettings, data)) {
    try {
      await regenerateTaxDeadlinesForUser(supabase, user.id, {
        entity_type: data.entity_type,
        moms_period: data.moms_period,
        f_skatt: data.f_skatt,
        vat_registered: data.vat_registered,
        pays_salaries: data.pays_salaries ?? false,
        fiscal_year_start_month: data.fiscal_year_start_month,
      })
      logger.info('settings', 'Tax deadlines regenerated after settings change')
    } catch (err) {
      logger.error('settings', 'Failed to regenerate tax deadlines', { error: err instanceof Error ? err.message : String(err) })
      // Don't fail the settings update if deadline generation fails
    }
  }

  return NextResponse.json({ data })
}
