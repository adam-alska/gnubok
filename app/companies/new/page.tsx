'use client'

import { useState, useEffect, Suspense } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import Link from 'next/link'
import * as Sentry from '@sentry/nextjs'
import { createClient } from '@/lib/supabase/client'
import { switchCompany } from '@/lib/company/actions'
import { useToast } from '@/components/ui/use-toast'
import { Loader2, ArrowLeft } from 'lucide-react'
import { cn } from '@/lib/utils'
import { validatePeriodDuration } from '@/lib/bookkeeping/validate-period-duration'
import { ENABLED_EXTENSION_IDS } from '@/lib/extensions/_generated/enabled-extensions'
import type { CompanyLookupResult } from '@/lib/company-lookup/types'
import type { CompanySettings, EntityType, MomsPeriod } from '@/types'

import Step1EntityType from '@/components/onboarding/Step1EntityType'
import Step2CompanyDetails from '@/components/onboarding/Step2CompanyDetails'
import Step3TaxRegistration from '@/components/onboarding/Step3TaxRegistration'
import Step4VatAccounting from '@/components/onboarding/Step4VatAccounting'

const STEP_INFO = [
  { title: 'Nytt företag', subtitle: 'Välj företagsform för det nya företaget.', label: 'Företagsform' },
  { title: 'Företagsuppgifter', subtitle: 'Uppgifterna visas på fakturor och dokument.', label: 'Uppgifter' },
  { title: 'F-skatt & räkenskapsår', subtitle: 'Skatteregistrering och räkenskapsår.', label: 'Skatt' },
  { title: 'Moms & bokföring', subtitle: 'Momsregistrering och bokföringsmetod.', label: 'Moms' },
]

function translatePeriodError(msg: string): string {
  if (msg.includes('end must be after')) return 'Slutdatumet måste vara efter startdatumet.'
  if (msg.includes('start must be the 1st')) return 'Startdatumet måste vara den 1:a i en månad.'
  if (msg.includes('end must be the last day')) return 'Slutdatumet måste vara sista dagen i en månad.'
  if (msg.includes('exceeds maximum 18 months')) return 'Räkenskapsåret får inte överstiga 18 månader (BFL 3 kap.).'
  return 'Ogiltigt räkenskapsår. Kontrollera datumen och försök igen.'
}

export default function NewCompanyPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    }>
      <NewCompanyContent />
    </Suspense>
  )
}

const LOG = '[new-company]'

function logError(message: string, extra?: Record<string, unknown>) {
  console.error(LOG, message, extra ?? '')
  fetch('/api/log', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: `new-company: ${message}`, extra }),
  }).catch(() => {})
  Sentry.captureMessage(`new-company: ${message}`, {
    level: 'error',
    extra: { ...extra, component: 'new-company' },
  })
}

function NewCompanyContent() {
  const router = useRouter()
  const { toast } = useToast()
  const supabase = createClient()

  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [currentStep, setCurrentStep] = useState(1)
  const [settings, setSettings] = useState<Partial<CompanySettings>>({})
  const [companyId, setCompanyId] = useState<string | null>(null)
  const ticEnabled = ENABLED_EXTENSION_IDS.has('tic')
  const [ticLookup, setTicLookup] = useState<CompanyLookupResult | null>(null)

  const totalSteps = 4

  const [teamId, setTeamId] = useState<string | null>(null)

  // Verify auth and fetch team_id on mount
  useEffect(() => {
    async function checkAuth() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.push('/login')
        return
      }

      // Fetch user's team_id
      const { data: teamMembership } = await supabase
        .from('team_members')
        .select('team_id')
        .eq('user_id', user.id)
        .limit(1)
        .maybeSingle()

      if (teamMembership?.team_id) {
        setTeamId(teamMembership.team_id)
      } else {
        // Ensure user has a team (fallback)
        const { data: newTeamId } = await supabase.rpc('ensure_user_team')
        setTeamId(newTeamId)
      }

      setIsLoading(false)
    }
    checkAuth()
  }, [supabase, router])

  const saveSettings = async (updates: Partial<CompanySettings>, nextStep?: number) => {
    const targetStep = nextStep ?? currentStep
    setIsSaving(true)

    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.push('/login')
        return false
      }

      const updatedSettings = {
        ...settings,
        ...updates,
        onboarding_step: targetStep,
      }

      if (!companyId) {
        logError('save aborted: no companyId', { step: targetStep })
        return false
      }

      const {
        id: _id, user_id: _uid, company_id: _cid, created_at: _ca, updated_at: _ua,
        is_first_fiscal_year: _ify, first_year_start: _fys, first_year_end: _fye,
        ...settingsToSave
      } = updatedSettings as Record<string, unknown>

      const { error } = await supabase
        .from('company_settings')
        .upsert({ ...settingsToSave, company_id: companyId }, { onConflict: 'company_id' })

      if (error) {
        logError('save failed', { message: error.message, step: targetStep, code: error.code })
        toast({ title: 'Fel', description: error.message || 'Kunde inte spara. Försök igen.', variant: 'destructive' })
        return false
      }

      setSettings(updatedSettings)
      return true
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      logError('saveSettings threw', { message, step: targetStep })
      Sentry.captureException(err)
      toast({ title: 'Fel', description: 'Ett oväntat fel uppstod. Försök igen.', variant: 'destructive' })
      return false
    } finally {
      setIsSaving(false)
    }
  }

  const handleNext = async (stepData: Partial<CompanySettings>) => {
    if (currentStep === 1 && stepData.entity_type && stepData.entity_type !== settings.entity_type) {
      stepData = { ...stepData, org_number: '', company_name: '' }
      setTicLookup(null)
    }

    // Step 1: Create the new company
    let activeCompanyId = companyId

    if (currentStep === 1 && !activeCompanyId) {
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) {
          router.push('/login')
          return
        }

        // Atomically create company + owner membership + set active
        const { data: newCompanyId, error: companyError } = await supabase.rpc('create_company_with_owner', {
          p_name: 'Nytt företag',
          p_entity_type: stepData.entity_type,
          p_team_id: teamId,
        })

        if (companyError || !newCompanyId) {
          logError('company creation failed', { message: companyError?.message })
          toast({ title: 'Fel', description: 'Kunde inte skapa företag. Försök igen.', variant: 'destructive' })
          return
        }

        activeCompanyId = newCompanyId
        setCompanyId(activeCompanyId)
        console.log(LOG, 'created company', activeCompanyId)
      } catch (err) {
        logError('company creation threw', { error: String(err) })
        Sentry.captureException(err)
        toast({ title: 'Fel', description: 'Kunde inte skapa företag. Försök igen.', variant: 'destructive' })
        return
      }
    }

    if (!activeCompanyId) {
      logError('handleNext aborted: no companyId', { step: currentStep })
      return
    }

    const nextStep = currentStep + 1

    // Direct save for step 1 (React batching: companyId state not yet updated)
    const needsDirectSave = currentStep === 1 && !companyId
    const success = needsDirectSave
      ? await (async () => {
          setIsSaving(true)
          try {
            const updatedSettings = { ...settings, ...stepData, onboarding_step: nextStep }
            const {
              id: _id, user_id: _uid, company_id: _cid, created_at: _ca, updated_at: _ua,
              is_first_fiscal_year: _ify, first_year_start: _fys, first_year_end: _fye,
              ...settingsToSave
            } = updatedSettings as Record<string, unknown>

            const { error } = await supabase
              .from('company_settings')
              .upsert({ ...settingsToSave, company_id: activeCompanyId }, { onConflict: 'company_id' })

            if (error) {
              logError('save failed', { message: error.message, step: nextStep })
              toast({ title: 'Fel', description: error.message || 'Kunde inte spara. Försök igen.', variant: 'destructive' })
              return false
            }

            setSettings(updatedSettings)
            return true
          } catch (err) {
            logError('saveSettings threw', { message: String(err), step: nextStep })
            Sentry.captureException(err)
            return false
          } finally {
            setIsSaving(false)
          }
        })()
      : await saveSettings(stepData, nextStep)

    if (!success) return

    // Seed chart of accounts after step 1
    if (currentStep === 1 && stepData.entity_type) {
      try {
        const { error: rpcError } = await supabase.rpc('seed_chart_of_accounts', {
          p_company_id: activeCompanyId,
          p_entity_type: stepData.entity_type,
        })
        if (rpcError) {
          logError('COA seeding failed', { entity_type: stepData.entity_type, message: rpcError.message })
        }
      } catch (err) {
        logError('COA seeding threw', { error: String(err) })
        Sentry.captureException(err)
      }
    }

    // Create fiscal period after step 3
    if (currentStep === 3 && activeCompanyId) {
      try {
        const isFirstYear = stepData.is_first_fiscal_year as boolean | undefined
        const firstYearStart = stepData.first_year_start as string | undefined
        const firstYearEnd = stepData.first_year_end as string | undefined

        let startStr: string
        let endStr: string
        let periodName: string

        if (isFirstYear && firstYearStart && firstYearEnd) {
          startStr = firstYearStart
          endStr = firstYearEnd
          const startYear = new Date(firstYearStart).getFullYear()
          const endYear = new Date(firstYearEnd).getFullYear()
          periodName = startYear === endYear
            ? `Första räkenskapsåret ${startYear}`
            : `Första räkenskapsåret ${startYear}/${endYear}`
        } else {
          let startMonth = stepData.fiscal_year_start_month || settings.fiscal_year_start_month || 1
          if (settings.entity_type === 'enskild_firma') startMonth = 1

          const currentYear = new Date().getFullYear()
          startStr = `${currentYear}-${String(startMonth).padStart(2, '0')}-01`

          let endYear: number
          let endMonth: number
          if (startMonth === 1) {
            endYear = currentYear
            endMonth = 12
          } else {
            endYear = currentYear + 1
            endMonth = startMonth - 1
          }
          const lastDay = new Date(endYear, endMonth, 0).getDate()
          endStr = `${endYear}-${String(endMonth).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`

          periodName = startMonth === 1
            ? `Räkenskapsår ${currentYear}`
            : `Räkenskapsår ${currentYear}/${currentYear + 1}`
        }

        const validationError = validatePeriodDuration(startStr, endStr)
        if (validationError) {
          logError('fiscal period validation failed', { validationError, startStr, endStr })
          toast({
            title: 'Ogiltigt räkenskapsår',
            description: translatePeriodError(validationError),
            variant: 'destructive',
          })
          setCurrentStep(3)
          return
        }

        // Clean up empty fiscal periods
        const { data: existingPeriods } = await supabase
          .from('fiscal_periods')
          .select('id')
          .eq('company_id', activeCompanyId)

        if (existingPeriods && existingPeriods.length > 0) {
          for (const ep of existingPeriods) {
            const { count } = await supabase
              .from('journal_entries')
              .select('id', { count: 'exact', head: true })
              .eq('fiscal_period_id', ep.id)

            if (count === 0) {
              await supabase.from('fiscal_periods').delete().eq('id', ep.id)
            }
          }
        }

        const { error: upsertError } = await supabase.from('fiscal_periods').upsert({
          company_id: activeCompanyId,
          name: periodName,
          period_start: startStr,
          period_end: endStr,
        }, { onConflict: 'company_id,period_start,period_end' })

        if (upsertError) {
          logError('fiscal period upsert failed', { message: upsertError.message, startStr, endStr })
        }
      } catch (err) {
        logError('fiscal period creation threw', { error: String(err) })
        Sentry.captureException(err)
      }
    }

    // Final step: mark complete, switch to new company, redirect
    if (nextStep > totalSteps) {
      const finalSuccess = await saveSettings({ onboarding_complete: true }, totalSteps)
      if (!finalSuccess) {
        logError('failed to set onboarding_complete')
        return
      }

      // Update company name from settings
      if (settings.company_name || stepData.company_name) {
        await supabase
          .from('companies')
          .update({ name: settings.company_name || stepData.company_name })
          .eq('id', activeCompanyId)
      }

      // Switch active company to the new one
      await switchCompany(activeCompanyId)

      toast({
        title: 'Företag skapat!',
        description: 'Du har nu bytt till det nya företaget.',
      })
      router.push('/')
    } else {
      setCurrentStep(nextStep)
    }
  }

  const handleBack = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1)
    }
  }

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  const stepInfo = STEP_INFO[currentStep - 1]

  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* Header */}
      <header className="relative bg-[#141414] text-white overflow-hidden">
        <div className="absolute inset-0 pointer-events-none" aria-hidden>
          <div
            className="absolute inset-0"
            style={{
              background: 'radial-gradient(ellipse at 30% -20%, rgba(255,255,255,0.04) 0%, transparent 50%)',
            }}
          />
          <span className="absolute -bottom-4 right-4 md:right-10 text-[120px] md:text-[160px] font-display font-bold text-white/[0.02] leading-none select-none">
            {String(currentStep).padStart(2, '0')}
          </span>
        </div>

        <div className="relative z-10 max-w-2xl mx-auto w-full px-6 md:px-10 pt-5 pb-6 md:pt-6 md:pb-8">
          <div className="flex items-center justify-between mb-5 md:mb-6">
            <div className="flex items-center gap-2.5">
              <Link
                href="/"
                className="flex items-center gap-2 text-white/60 hover:text-white transition-colors"
              >
                <ArrowLeft className="h-4 w-4" />
              </Link>
              <Image
                src="/gnubokiceon-removebg-preview.png"
                alt="Gnubok"
                width={30}
                height={30}
                className="invert opacity-90"
              />
              <span className="font-display text-base tracking-tight">gnubok</span>
            </div>
            <div className="flex items-center gap-1.5">
              {STEP_INFO.map((_, i) => {
                const num = i + 1
                return (
                  <div
                    key={i}
                    className={cn(
                      'h-[3px] rounded-full transition-all duration-500',
                      num === currentStep && 'w-7 bg-white',
                      num < currentStep && 'w-4 bg-white/50',
                      num > currentStep && 'w-4 bg-white/[0.1]',
                    )}
                  />
                )
              })}
            </div>
            <span className="text-[10px] text-white/30 tracking-[0.15em] uppercase">
              {currentStep} / {totalSteps}
            </span>
          </div>

          <div key={`title-${currentStep}`} className="animate-fade-in">
            <h1 className="font-display text-2xl md:text-3xl font-medium tracking-tight leading-[1.1]">
              {stepInfo.title}
            </h1>
            <p className="text-white/40 mt-1.5 text-sm max-w-sm leading-relaxed">
              {stepInfo.subtitle}
            </p>
          </div>
        </div>
      </header>

      {/* Form content */}
      <main className="flex-1">
        <div className="max-w-lg mx-auto px-6 md:px-10 py-6 md:py-8">
          <div key={`step-${currentStep}`} className="animate-slide-up">
            {currentStep === 1 && (
              <Step1EntityType
                initialData={{ entity_type: settings.entity_type as EntityType }}
                onNext={(data) => handleNext(data)}
                isSaving={isSaving}
              />
            )}

            {currentStep === 2 && (
              <Step2CompanyDetails
                key={settings.entity_type}
                initialData={{
                  company_name: settings.company_name ?? undefined,
                  org_number: settings.org_number ?? undefined,
                  address_line1: settings.address_line1 ?? undefined,
                  postal_code: settings.postal_code ?? undefined,
                  city: settings.city ?? undefined,
                }}
                entityType={settings.entity_type as EntityType}
                ticEnabled={ticEnabled}
                onTicLookup={setTicLookup}
                onNext={(data) => handleNext(data)}
                onBack={handleBack}
                isSaving={isSaving}
              />
            )}

            {currentStep === 3 && (
              <Step3TaxRegistration
                initialData={{
                  f_skatt: settings.f_skatt ?? (ticLookup ? ticLookup.registration.fTax : undefined),
                  fiscal_year_start_month: settings.fiscal_year_start_month ?? undefined,
                }}
                entityType={settings.entity_type as EntityType}
                onNext={(data) => handleNext(data)}
                onBack={handleBack}
                isSaving={isSaving}
              />
            )}

            {currentStep === 4 && (
              <Step4VatAccounting
                initialData={{
                  vat_registered: settings.vat_registered ?? (ticLookup ? ticLookup.registration.vat : undefined),
                  vat_number: settings.vat_number ?? undefined,
                  moms_period: (settings.moms_period as MomsPeriod | null) ?? undefined,
                  accounting_method: (settings.accounting_method as 'accrual' | 'cash') ?? undefined,
                }}
                entityType={settings.entity_type as EntityType}
                orgNumber={settings.org_number ?? undefined}
                onNext={(data) => handleNext(data)}
                onBack={handleBack}
                isSaving={isSaving}
              />
            )}
          </div>
        </div>
      </main>
    </div>
  )
}
