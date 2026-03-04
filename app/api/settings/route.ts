import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { didTaxFieldsChange, regenerateTaxDeadlinesForUser } from '@/lib/tax/deadline-generator'
import { validateBody } from '@/lib/api/validate'
import { UpdateSettingsSchema } from '@/lib/api/schemas'

export async function GET() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

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

  // Fetch current settings to check for tax-relevant changes
  const { data: oldSettings } = await supabase
    .from('company_settings')
    .select('entity_type, moms_period, f_skatt, vat_registered, pays_salaries, fiscal_year_start_month, onboarding_complete')
    .eq('user_id', user.id)
    .single()

  const validation = await validateBody(request, UpdateSettingsSchema)
  if (!validation.success) return validation.response
  const body = validation.data

  // Lock company_name and org_number after onboarding is complete
  if (oldSettings && (oldSettings as Record<string, unknown>).onboarding_complete === true) {
    delete (body as Record<string, unknown>).company_name
    delete (body as Record<string, unknown>).org_number
  }

  // Validate: enskild firma must use calendar year (BFL 3 kap.)
  const effectiveEntityType = body.entity_type || oldSettings?.entity_type
  const effectiveFYStartMonth = body.fiscal_year_start_month ?? oldSettings?.fiscal_year_start_month
  if (effectiveEntityType === 'enskild_firma' && effectiveFYStartMonth && effectiveFYStartMonth !== 1) {
    return NextResponse.json(
      { error: 'Enskild firma måste använda kalenderår (BFL 3 kap.)' },
      { status: 400 }
    )
  }

  const { data, error } = await supabase
    .from('company_settings')
    .update(body)
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
      console.log('Tax deadlines regenerated after settings change')
    } catch (err) {
      console.error('Failed to regenerate tax deadlines:', err)
      // Don't fail the settings update if deadline generation fails
    }
  }

  return NextResponse.json({ data })
}
