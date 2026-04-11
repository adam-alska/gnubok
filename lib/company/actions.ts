'use server'

import { createClient } from '@/lib/supabase/server'
import { setActiveCompany } from '@/lib/company/context'
import { revalidatePath } from 'next/cache'

export async function switchCompany(companyId: string): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return { error: 'Unauthorized' }
  }

  try {
    await setActiveCompany(supabase, user.id, companyId)
    // No revalidatePath — the client performs a hard navigation
    // (window.location.assign) after this action returns, which wipes
    // every React/router/fetch cache wholesale. revalidatePath would be a
    // no-op and would just race with the hard reload.
    return {}
  } catch {
    return { error: 'Du har inte tillgång till detta företag.' }
  }
}

/**
 * Create a company from onboarding wizard data.
 *
 * This runs on the server so that if the Next.js server is unavailable when
 * the user clicks the final "Fortsätt" button, the action never reaches
 * Supabase and no ghost company is created. All operations (company,
 * membership, chart of accounts, settings, fiscal period, active company)
 * happen sequentially; if any step after company creation fails the company
 * is rolled back to avoid partial state.
 */
export async function createCompanyFromOnboarding(params: {
  teamId: string
  settings: Record<string, unknown>
  fiscalPeriod: {
    startDate: string
    endDate: string
    name: string
  }
}): Promise<{ companyId?: string; error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return { error: 'Unauthorized' }
  }

  const entityType = params.settings.entity_type as string | undefined
  if (entityType !== 'enskild_firma' && entityType !== 'aktiebolag') {
    return { error: 'Ogiltig företagsform.' }
  }

  const companyName = (params.settings.company_name as string | undefined) || 'Mitt företag'

  // 1. Create company + owner membership atomically via RPC
  const { data: newCompanyId, error: companyError } = await supabase.rpc('create_company_with_owner', {
    p_name: companyName,
    p_entity_type: entityType,
    p_team_id: params.teamId,
  })

  if (companyError || !newCompanyId) {
    console.error('[createCompanyFromOnboarding] company creation failed', companyError)
    return { error: 'Kunde inte skapa företag. Försök igen.' }
  }

  // Helper: roll back the company if a subsequent step fails. Deletes in FK order.
  const rollback = async (reason: string, err: unknown) => {
    console.error(`[createCompanyFromOnboarding] rolling back ${newCompanyId}: ${reason}`, err)
    await supabase.from('company_settings').delete().eq('company_id', newCompanyId)
    await supabase.from('fiscal_periods').delete().eq('company_id', newCompanyId)
    await supabase.from('chart_of_accounts').delete().eq('company_id', newCompanyId)
    await supabase.from('company_members').delete().eq('company_id', newCompanyId)
    await supabase.from('companies').delete().eq('id', newCompanyId)
  }

  // 2. Seed chart of accounts
  const { error: coaError } = await supabase.rpc('seed_chart_of_accounts', {
    p_company_id: newCompanyId,
    p_entity_type: entityType,
  })
  if (coaError) {
    await rollback('COA seeding failed', coaError)
    return { error: 'Kunde inte skapa kontoplan. Försök igen.' }
  }

  // 3. Save settings (strip UI-only and managed fields)
  const {
    id: _id,
    user_id: _uid,
    company_id: _cid,
    created_at: _ca,
    updated_at: _ua,
    is_first_fiscal_year: _ify,
    first_year_start: _fys,
    first_year_end: _fye,
    ...settingsToSave
  } = params.settings

  const { error: settingsError } = await supabase
    .from('company_settings')
    .upsert(
      {
        ...settingsToSave,
        company_id: newCompanyId,
        onboarding_complete: true,
        onboarding_step: 4,
      },
      { onConflict: 'company_id' },
    )

  if (settingsError) {
    await rollback('settings upsert failed', settingsError)
    return { error: 'Kunde inte spara inställningar. Försök igen.' }
  }

  // 4. Create fiscal period
  const { error: periodError } = await supabase.from('fiscal_periods').upsert(
    {
      company_id: newCompanyId,
      name: params.fiscalPeriod.name,
      period_start: params.fiscalPeriod.startDate,
      period_end: params.fiscalPeriod.endDate,
    },
    { onConflict: 'company_id,period_start,period_end' },
  )

  if (periodError) {
    await rollback('fiscal period upsert failed', periodError)
    return { error: 'Kunde inte skapa räkenskapsår. Försök igen.' }
  }

  // 5. Set as active company
  try {
    await setActiveCompany(supabase, user.id, newCompanyId)
  } catch (err) {
    // Non-fatal: the company was created successfully; the user can switch manually
    console.error('[createCompanyFromOnboarding] setActiveCompany failed', err)
  }

  revalidatePath('/')
  return { companyId: newCompanyId }
}
