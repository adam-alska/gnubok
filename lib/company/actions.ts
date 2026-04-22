'use server'

import { createClient } from '@/lib/supabase/server'
import { setActiveCompany } from '@/lib/company/context'
import { revalidatePath } from 'next/cache'
import { computeFiscalPeriod } from '@/lib/company/compute-fiscal-period'
import { mapEntityType } from '@/lib/company-lookup/entity-type-map'
import type { CompanyLookupResult } from '@/lib/company-lookup/types'

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

/**
 * One-click company setup from a TIC/Bolagsverket company role.
 *
 * The picker page at /select-company passes a `CompanyLookupResult` already
 * fetched from `/api/extensions/ext/tic/lookup`, plus the `EnrichmentCompanyRole`
 * minimums (org number, legal name, legal entity type). This action derives
 * sensible defaults (accrual, quarterly moms for VAT-registered, Jan-Dec
 * fiscal year), reads SPAR address from `extension_data` as a fallback, and
 * then delegates to `createCompanyFromOnboarding` so the provisioning path is
 * identical to the manual wizard. On success it clears the enrichment row
 * consumed by this path — the manual wizard leaves it intact so a returning
 * BankID user can still reach `/select-company` and pick another directorship.
 *
 * Requires `lookup` to be non-null: if TIC `/lookup` is unreachable, the client
 * must route to the manual wizard instead. Silently defaulting `vat_registered`
 * to false for a momsregistrerat bolag would violate ML 17 kap (invoices
 * without moms), so we refuse to guess.
 */
export async function createCompanyFromTicRole(params: {
  teamId: string
  orgNumber: string
  legalName: string
  legalEntityType: string
  lookup: CompanyLookupResult | null
}): Promise<{ companyId?: string; error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return { error: 'Unauthorized' }
  }

  const entityType = mapEntityType(params.legalEntityType)
  if (!entityType) {
    return { error: 'Den här företagsformen måste sättas upp manuellt.' }
  }

  // If the TIC lookup failed we don't know the company's VAT/F-skatt status.
  // Refuse to silently guess — the caller routes to the manual wizard so the
  // user can confirm these fields themselves.
  if (!params.lookup) {
    return { error: 'lookup_missing' }
  }

  // SPAR address fallback if the TIC lookup didn't include one.
  const { data: enrichmentRow } = await supabase
    .from('extension_data')
    .select('id, value')
    .eq('user_id', user.id)
    .eq('extension_id', 'tic')
    .eq('key', 'bankid_enrichment')
    .maybeSingle()

  const spar = (enrichmentRow?.value as { spar?: Record<string, string | undefined> } | null)?.spar
  const sparStreet = spar?.Folkbokforingsadress_SvenskAdress_Utdelningsadress1
  const sparPostal = spar?.Folkbokforingsadress_SvenskAdress_PostNr
  const sparCity = spar?.Folkbokforingsadress_SvenskAdress_Postort

  const addressStreet = params.lookup.address?.street ?? sparStreet ?? null
  const addressPostal = params.lookup.address?.postalCode ?? sparPostal ?? null
  const addressCity = params.lookup.address?.city ?? sparCity ?? null

  const fTax = params.lookup.registration.fTax
  const vatRegistered = params.lookup.registration.vat

  // moms_period: Skatteverket assigns the actual reporting period from
  // annual beskattningsunderlag (≤1 MSEK → yearly, ≤40 MSEK → quarterly,
  // >40 MSEK → monthly). TIC /lookup doesn't expose turnover, so we pick the
  // middle-tier default. The user must verify it matches their Skatteverket
  // assignment in /settings/tax — a mismatch causes late-filing penalties
  // under SFL.
  const momsPeriod = vatRegistered ? 'quarterly' : null

  // EF ≤3 MSEK may use kontantmetoden under K1/BFNAR 2013:2; above that
  // threshold, BFNAR 2017:3 requires bokföringsmässiga grunder. We default
  // to cash because the vast majority of EF users are small; users above
  // the threshold can switch in /settings/bookkeeping. Aktiebolag must use
  // accrual under K2/K3.
  const accountingMethod = entityType === 'enskild_firma' ? 'cash' : 'accrual'

  const settings: Record<string, unknown> = {
    entity_type: entityType,
    company_name: params.legalName,
    org_number: params.orgNumber.replace(/[\s-]/g, ''),
    f_skatt: fTax,
    vat_registered: vatRegistered,
    moms_period: momsPeriod,
    accounting_method: accountingMethod,
    fiscal_year_start_month: 1,
    address_line1: addressStreet,
    postal_code: addressPostal,
    city: addressCity,
  }

  const periodResult = computeFiscalPeriod(settings)
  if (periodResult.error) {
    return { error: 'Kunde inte beräkna räkenskapsår.' }
  }

  const result = await createCompanyFromOnboarding({
    teamId: params.teamId,
    settings,
    fiscalPeriod: {
      startDate: periodResult.startStr,
      endDate: periodResult.endStr,
      name: periodResult.periodName,
    },
  })

  if (result.error || !result.companyId) {
    return { error: result.error ?? 'Kunde inte skapa företag. Försök igen.' }
  }

  // One-time use: drop the enrichment row now that the user has committed to
  // a TIC-suggested company. The manual wizard intentionally does NOT do this
  // so a user with multiple directorships can still reach /select-company
  // afterwards and provision another one.
  if (enrichmentRow?.id) {
    await supabase.from('extension_data').delete().eq('id', enrichmentRow.id)
  }

  return { companyId: result.companyId }
}
