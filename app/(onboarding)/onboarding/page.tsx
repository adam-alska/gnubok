'use client'

import { useState, useEffect, Suspense } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import * as Sentry from '@sentry/nextjs'
import { createClient } from '@/lib/supabase/client'
import { useToast } from '@/components/ui/use-toast'
import { Loader2, ArrowRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { validatePeriodDuration } from '@/lib/bookkeeping/validate-period-duration'
import { ENABLED_EXTENSION_IDS } from '@/lib/extensions/_generated/enabled-extensions'
import type { CompanyLookupResult } from '@/lib/company-lookup/types'
import type { CompanySettings, EntityType, MomsPeriod } from '@/types'

import Step0RoleChoice from '@/components/onboarding/Step0RoleChoice'
import Step1EntityType from '@/components/onboarding/Step1EntityType'
import Step2CompanyDetails from '@/components/onboarding/Step2CompanyDetails'
import Step3TaxRegistration from '@/components/onboarding/Step3TaxRegistration'
import Step4VatAccounting from '@/components/onboarding/Step4VatAccounting'

type OnboardingMode = 'choice' | 'self' | 'consultant'

const STEP_INFO = [
  { title: 'Välkommen', subtitle: 'Välj din företagsform för att komma igång.', label: 'Företagsform' },
  { title: 'Ditt företag', subtitle: 'Uppgifterna visas på fakturor och dokument.', label: 'Uppgifter' },
  { title: 'F-skatt & räkenskapsår', subtitle: 'Ange din skatteregistrering och räkenskapsår.', label: 'Skatt' },
  { title: 'Moms & bokföring', subtitle: 'Momsregistrering och bokföringsmetod.', label: 'Moms' },
]

const STEP_INFO_CONSULTANT = [
  { title: 'Kundföretag', subtitle: 'Välj din kunds företagsform.', label: 'Företagsform' },
  { title: 'Kundföretag', subtitle: 'Uppgifterna visas på fakturor och dokument.', label: 'Uppgifter' },
  { title: 'F-skatt & räkenskapsår', subtitle: 'Din kunds skatteregistrering och räkenskapsår.', label: 'Skatt' },
  { title: 'Moms & bokföring', subtitle: 'Din kunds momsregistrering och bokföringsmetod.', label: 'Moms' },
]

function translatePeriodError(msg: string): string {
  if (msg.includes('end must be after')) return 'Slutdatumet måste vara efter startdatumet.'
  if (msg.includes('start must be the 1st')) return 'Startdatumet måste vara den 1:a i en månad.'
  if (msg.includes('end must be the last day')) return 'Slutdatumet måste vara sista dagen i en månad.'
  if (msg.includes('exceeds maximum 18 months')) return 'Räkenskapsåret får inte överstiga 18 månader (BFL 3 kap.).'
  return 'Ogiltigt räkenskapsår. Kontrollera datumen och försök igen.'
}

export default function OnboardingPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    }>
      <OnboardingPageContent />
    </Suspense>
  )
}

const LOG = '[onboarding]'

/** Log to browser console, Vercel server logs (via API), and Sentry. */
function logError(message: string, extra?: Record<string, unknown>) {
  console.error(LOG, message, extra ?? '')

  // Send to server so it appears in Vercel Logs
  fetch('/api/log', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, extra }),
  }).catch(() => {}) // fire-and-forget, never block the UI

  Sentry.captureMessage(`onboarding: ${message}`, {
    level: 'error',
    extra: { ...extra, component: 'onboarding' },
  })
}

function OnboardingPageContent() {
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
  const [mode, setMode] = useState<OnboardingMode>('choice')
  const [consultantLanding, setConsultantLanding] = useState(false)
  const [teamName, setTeamName] = useState('')

  const totalSteps = 4

  // Detect stuck state: onboarding marked complete but still on this page
  useEffect(() => {
    if (settings.onboarding_complete && !isLoading) {
      const timeout = setTimeout(() => {
        logError('still on onboarding page after onboarding_complete=true — redirect may have failed')
      }, 3000)
      return () => clearTimeout(timeout)
    }
  }, [settings.onboarding_complete, isLoading])

  // Load existing settings on mount
  useEffect(() => {
    async function loadSettings() {
      const { data: { user }, error: authError } = await supabase.auth.getUser()

      if (authError) {
        logError('auth.getUser() failed on mount', { message: authError.message })
      }

      if (!user) {
        logError('no authenticated user on mount, redirecting to login')
        router.push('/login')
        return
      }

      // Check for unprocessed invite token (fallback if auth callback didn't process it)
      const cookieMatch = document.cookie.match(/gnubok-invite-token=([^;]+)/)
      const inviteToken = cookieMatch?.[1]

      if (inviteToken) {
        try {
          const res = await fetch('/api/team/accept', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token: inviteToken }),
          })

          if (res.ok) {
            // Clear the cookie
            document.cookie = 'gnubok-invite-token=; path=/; max-age=0'
            console.log(LOG, 'invite accepted via fallback — redirecting to dashboard')
            router.push('/')
            return
          }

          // Log the failure to help diagnose
          const errBody = await res.json().catch(() => ({}))
          console.error(LOG, 'fallback invite acceptance returned non-ok', {
            status: res.status,
            error: errBody.error,
          })
        } catch (err) {
          console.error(LOG, 'fallback invite acceptance failed:', err)
        }
        // Clear cookie regardless to avoid retry loops
        document.cookie = 'gnubok-invite-token=; path=/; max-age=0'
      }

      // Check if user is already in a team (consultant) — skip onboarding
      const { data: teamMember } = await supabase
        .from('team_members')
        .select('id')
        .eq('user_id', user.id)
        .limit(1)
        .maybeSingle()

      if (teamMember) {
        console.log(LOG, 'user already in a team — redirecting to dashboard')
        window.location.href = '/'
        return
      }

      // Check if user already has a company via company_members
      const { data: membership } = await supabase
        .from('company_members')
        .select('company_id')
        .eq('user_id', user.id)
        .order('created_at', { ascending: true })
        .limit(1)
        .single()

      if (membership?.company_id) {
        const { data, error } = await supabase
          .from('company_settings')
          .select('*')
          .eq('company_id', membership.company_id)
          .single()

        if (error && error.code !== 'PGRST116') {
          logError('failed to load settings', { message: error.message, code: error.code })
        }

        // If this company is already onboarded (invited user joining existing company),
        // skip onboarding entirely and go to dashboard
        if (data?.onboarding_complete) {
          console.log(LOG, 'company already onboarded — redirecting to dashboard')
          router.push('/')
          return
        }

        setCompanyId(membership.company_id)
        setMode('self') // Resuming — skip role choice

        if (data) {
          const step = data.onboarding_step || 1
          const clampedStep = step > totalSteps ? totalSteps : step
          if (step > totalSteps) {
            logError('onboarding_step exceeds totalSteps — clamped', { step, totalSteps })
          }
          // Important milestone: where we resume
          console.log(LOG, 'resuming at step', clampedStep, { entity_type: data.entity_type })
          setSettings(data)
          setCurrentStep(clampedStep)
        }
      }

      setIsLoading(false)
    }

    loadSettings()
  }, [supabase, router, toast])

  const saveSettings = async (updates: Partial<CompanySettings>, nextStep?: number) => {
    const targetStep = nextStep ?? currentStep
    setIsSaving(true)

    try {
      const { data: { user }, error: authError } = await supabase.auth.getUser()

      if (authError) {
        logError('auth.getUser() failed during save', { message: authError.message, step: targetStep })
      }

      if (!user) {
        logError('save aborted: no authenticated user', { step: targetStep })
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

      // Remove read-only and transient fields before updating
      const {
        id: _id, user_id: _uid, company_id: _cid, created_at: _ca, updated_at: _ua,
        is_first_fiscal_year: _ify, first_year_start: _fys, first_year_end: _fye,
        ...settingsToSave
      } = updatedSettings as Record<string, unknown>

      const { error } = await supabase
        .from('company_settings')
        .upsert({ ...settingsToSave, company_id: companyId }, { onConflict: 'company_id' })

      if (error) {
        logError('save failed', { message: error.message, step: targetStep, code: error.code, details: error.details })
        toast({
          title: 'Fel',
          description: error.message || 'Kunde inte spara. Försök igen.',
          variant: 'destructive',
        })
        return false
      }

      setSettings(updatedSettings)
      return true
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      logError('saveSettings threw unexpectedly', { message, step: targetStep })
      Sentry.captureException(err)
      toast({
        title: 'Fel',
        description: 'Ett oväntat fel uppstod. Försök igen.',
        variant: 'destructive',
      })
      return false
    } finally {
      setIsSaving(false)
    }
  }

  const handleNext = async (stepData: Partial<CompanySettings>) => {
    // Fix org number bug: clear dependent fields when entity type changes
    if (currentStep === 1 && stepData.entity_type && stepData.entity_type !== settings.entity_type) {
      console.warn(LOG, 'entity type changed from', settings.entity_type, 'to', stepData.entity_type, '— clearing dependent fields')
      stepData = { ...stepData, org_number: '', company_name: '' }
      setTicLookup(null)
    }

    // Step 1: Create company + membership + user_preferences if no companyId yet
    let activeCompanyId = companyId

    if (currentStep === 1 && !activeCompanyId) {
      try {
        const { data: { user }, error: authError } = await supabase.auth.getUser()
        if (authError) {
          logError('auth.getUser() failed before company creation', { message: authError.message })
        }
        if (!user) {
          logError('company creation skipped: no user')
          router.push('/login')
          return
        }

        // Atomically create company + owner membership + set active
        const { data: newCompanyId, error: rpcError } = await supabase.rpc('create_company_with_owner', {
          p_name: 'Mitt företag',
          p_entity_type: stepData.entity_type,
        })

        if (rpcError || !newCompanyId) {
          logError('company creation failed', { message: rpcError?.message, code: rpcError?.code })
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

    // For step 1, companyId state may not be updated yet (React batching).
    // Save settings directly with activeCompanyId to avoid the race condition.
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
              logError('save failed', { message: error.message, step: nextStep, code: error.code })
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

    if (!success) {
      logError('handleNext aborted: saveSettings failed', { step: currentStep })
      return
    }

    // After step 2 (company details): sync company name to companies table
    if (currentStep === 2 && stepData.company_name && activeCompanyId) {
      const { error: nameError } = await supabase
        .from('companies')
        .update({ name: stepData.company_name })
        .eq('id', activeCompanyId)

      if (nameError) {
        logError('failed to sync company name to companies table', {
          message: nameError.message,
          code: nameError.code,
        })
      }
    }

    // After step 1 (entity type selection): seed chart of accounts
    if (currentStep === 1 && stepData.entity_type) {
      try {
        const { error: rpcError } = await supabase.rpc('seed_chart_of_accounts', {
          p_company_id: activeCompanyId,
          p_entity_type: stepData.entity_type,
        })
        if (rpcError) {
          logError('chart of accounts seeding failed', {
            entity_type: stepData.entity_type,
            message: rpcError.message,
            code: rpcError.code,
            details: rpcError.details,
          })
        }
      } catch (err) {
        logError('chart of accounts seeding threw', { error: String(err) })
        Sentry.captureException(err)
      }
    }

    // After step 3 (tax registration): create initial fiscal period
    if (currentStep === 3 && companyId) {
      try {
          const isFirstYear = stepData.is_first_fiscal_year as boolean | undefined
          const firstYearStart = stepData.first_year_start as string | undefined
          const firstYearEnd = stepData.first_year_end as string | undefined

          let startStr: string
          let endStr: string
          let periodName: string

          if (isFirstYear && firstYearStart && firstYearEnd) {
            // First fiscal year: use exact dates provided
            startStr = firstYearStart
            endStr = firstYearEnd

            const startYear = new Date(firstYearStart).getFullYear()
            const endYear = new Date(firstYearEnd).getFullYear()
            periodName = startYear === endYear
              ? `Första räkenskapsåret ${startYear}`
              : `Första räkenskapsåret ${startYear}/${endYear}`
          } else {
            // Ongoing: compute 12-month period from fiscal_year_start_month
            let startMonth = stepData.fiscal_year_start_month || settings.fiscal_year_start_month || 1

            // For enskild firma: force calendar year
            if (settings.entity_type === 'enskild_firma') {
              startMonth = 1
            }

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

          // Validate period duration
          const validationError = validatePeriodDuration(startStr, endStr)
          if (validationError) {
            logError('fiscal period validation failed', {
              validationError, startStr, endStr, isFirstYear, entity_type: settings.entity_type,
            })
            toast({
              title: 'Ogiltigt räkenskapsår',
              description: translatePeriodError(validationError),
              variant: 'destructive',
            })
            setCurrentStep(3)
            return
          }

          // Delete any existing fiscal periods that have no journal entries,
          // so re-running onboarding with different dates doesn't create
          // overlapping periods (DB exclusion constraint would reject it).
          const { data: existingPeriods, error: fetchPeriodsError } = await supabase
            .from('fiscal_periods')
            .select('id')
            .eq('company_id', companyId)

          if (fetchPeriodsError) {
            logError('failed to fetch existing fiscal periods', {
              message: fetchPeriodsError.message, code: fetchPeriodsError.code,
            })
          }

          if (existingPeriods && existingPeriods.length > 0) {
            for (const ep of existingPeriods) {
              const { count, error: countError } = await supabase
                .from('journal_entries')
                .select('id', { count: 'exact', head: true })
                .eq('fiscal_period_id', ep.id)

              if (countError) {
                logError('failed to count journal entries for period', { periodId: ep.id, message: countError.message })
                continue
              }

              if (count === 0) {
                const { error: deleteError } = await supabase
                  .from('fiscal_periods')
                  .delete()
                  .eq('id', ep.id)

                if (deleteError) {
                  logError('failed to delete empty fiscal period', { periodId: ep.id, message: deleteError.message })
                }
              }
            }
          }

          const { error: upsertError } = await supabase.from('fiscal_periods').upsert({
            company_id: companyId,
            name: periodName,
            period_start: startStr,
            period_end: endStr,
          }, {
            onConflict: 'company_id,period_start,period_end',
          })

          if (upsertError) {
            logError('fiscal period upsert failed', {
              message: upsertError.message, startStr, endStr, code: upsertError.code, details: upsertError.details,
            })
          }
      } catch (err) {
        logError('fiscal period creation threw', { error: String(err) })
        Sentry.captureException(err)
        toast({
          title: 'Kunde inte skapa räkenskapsår',
          description: 'Ett fel uppstod när räkenskapsåret skulle skapas. Försök igen.',
          variant: 'destructive',
        })
      }
    }

    if (nextStep > totalSteps) {
      const finalSuccess = await saveSettings({ onboarding_complete: true }, totalSteps)
      if (!finalSuccess) {
        logError('failed to set onboarding_complete after all steps')
        return
      }
      // Important milestone
      console.log(LOG, 'onboarding completed')
      toast({
        title: 'Välkommen!',
        description: 'Din profil är nu redo.',
      })
      router.push('/')
    } else {
      setCurrentStep(nextStep)
    }
  }

  const handleBack = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1)
    } else if (isConsultant) {
      setConsultantLanding(true)
    }
  }

  const handleSkip = async () => {
    const nextStep = currentStep + 1
    const success = await saveSettings({}, nextStep)

    if (!success) {
      logError('skip failed: saveSettings returned false', { step: currentStep })
      return
    }
    setCurrentStep(nextStep)
  }

  const handleConsultantCreateTeam = async () => {
    if (!teamName.trim()) {
      toast({ title: 'Ange ett namn', description: 'Ditt team behöver ett namn.', variant: 'destructive' })
      return
    }

    setIsSaving(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.push('/login')
        return
      }

      const { data: newTeamId, error: teamError } = await supabase.rpc('create_team_with_owner', {
        p_name: teamName.trim(),
      })

      if (teamError || !newTeamId) {
        logError('consultant team creation failed', { message: teamError?.message })
        toast({ title: 'Fel', description: 'Kunde inte skapa team. Försök igen.', variant: 'destructive' })
        return
      }

      console.log(LOG, 'created team', newTeamId)
      toast({
        title: 'Välkommen!',
        description: 'Lägg till ditt första kundföretag för att komma igång.',
      })
      // Hard navigation to exit the (onboarding) route group and trigger middleware
      window.location.href = '/'
    } catch (err) {
      logError('consultant team creation threw', { error: String(err) })
      Sentry.captureException(err)
      toast({ title: 'Fel', description: 'Ett oväntat fel uppstod. Försök igen.', variant: 'destructive' })
    } finally {
      setIsSaving(false)
    }
  }

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  const isConsultant = mode === 'consultant'
  const stepInfoArr = isConsultant ? STEP_INFO_CONSULTANT : STEP_INFO
  const stepInfo = stepInfoArr[currentStep - 1]
  const showRoleChoice = mode === 'choice'
  const showConsultantLanding = isConsultant && consultantLanding

  const renderSteps = () => (
    <>
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
    </>
  )

  // ── Role Choice Screen (Step 0) ──
  if (showRoleChoice) {
    return (
      <div className="min-h-screen flex flex-col bg-background">
        <header className="relative bg-[#141414] text-white overflow-hidden">
          <div className="absolute inset-0 pointer-events-none" aria-hidden>
            <div
              className="absolute inset-0"
              style={{
                background: 'radial-gradient(ellipse at 30% -20%, rgba(255,255,255,0.04) 0%, transparent 50%)',
              }}
            />
          </div>
          <div className="relative z-10 max-w-2xl mx-auto w-full px-6 md:px-10 pt-5 pb-6 md:pt-6 md:pb-8">
            <div className="flex items-center gap-2.5 mb-5 md:mb-6">
              <Image
                src="/gnubokiceon-removebg-preview.png"
                alt="Gnubok"
                width={30}
                height={30}
                className="invert opacity-90"
              />
              <span className="font-display text-base tracking-tight">gnubok</span>
            </div>
            <div className="animate-fade-in">
              <h1 className="font-display text-2xl md:text-3xl font-medium tracking-tight leading-[1.1]">
                Välkommen till gnubok
              </h1>
              <p className="text-white/40 mt-1.5 text-sm max-w-sm leading-relaxed">
                Hur vill du använda gnubok?
              </p>
            </div>
          </div>
        </header>
        <main className="flex-1">
          <div className="max-w-lg mx-auto px-6 md:px-10 py-6 md:py-8">
            <div className="animate-slide-up">
              <Step0RoleChoice
                onChooseSelf={() => setMode('self')}
                onChooseConsultant={() => {
                  setMode('consultant')
                  setConsultantLanding(true)
                }}
              />
            </div>
          </div>
        </main>
      </div>
    )
  }

  // ── Consultant Landing Screen ──
  if (showConsultantLanding) {
    return (
      <div className="min-h-screen flex flex-col bg-background">
        <header className="relative bg-[#141414] text-white overflow-hidden">
          <div className="absolute inset-0 pointer-events-none" aria-hidden>
            <div
              className="absolute inset-0"
              style={{
                background: 'radial-gradient(ellipse at 30% -20%, rgba(255,255,255,0.04) 0%, transparent 50%)',
              }}
            />
          </div>
          <div className="relative z-10 max-w-2xl mx-auto w-full px-6 md:px-10 pt-5 pb-6 md:pt-6 md:pb-8">
            <div className="flex items-center gap-2.5 mb-5 md:mb-6">
              <Image
                src="/gnubokiceon-removebg-preview.png"
                alt="Gnubok"
                width={30}
                height={30}
                className="invert opacity-90"
              />
              <span className="font-display text-base tracking-tight">gnubok</span>
            </div>
            <div className="animate-fade-in">
              <h1 className="font-display text-2xl md:text-3xl font-medium tracking-tight leading-[1.1]">
                Namnge ditt team
              </h1>
              <p className="text-white/40 mt-1.5 text-sm max-w-sm leading-relaxed">
                Skapa ett team som samlar dig och dina kollegor.
              </p>
            </div>
          </div>
        </header>
        <main className="flex-1">
          <div className="max-w-lg mx-auto px-6 md:px-10 py-6 md:py-8">
            <div className="animate-slide-up space-y-5">
              <div className="rounded-xl border bg-card p-6 space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="team-name">Teamnamn</Label>
                  <Input
                    id="team-name"
                    placeholder="T.ex. Redovisningsbyrån AB"
                    value={teamName}
                    onChange={(e) => setTeamName(e.target.value)}
                    disabled={isSaving}
                    className="h-11"
                    autoFocus
                  />
                  <p className="text-xs text-muted-foreground">
                    Du kan ändra namnet senare i inställningar.
                  </p>
                </div>
              </div>

              <Button
                size="lg"
                className="w-full"
                onClick={handleConsultantCreateTeam}
                disabled={isSaving || !teamName.trim()}
              >
                {isSaving ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Skapar team...
                  </>
                ) : (
                  <>
                    Skapa team
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </>
                )}
              </Button>
              <button
                onClick={() => {
                  setMode('choice')
                  setConsultantLanding(false)
                }}
                className="block mx-auto text-xs text-muted-foreground/60 hover:text-muted-foreground transition-colors"
              >
                Tillbaka
              </button>
            </div>
          </div>
        </main>
      </div>
    )
  }

  // ── Steps 1–4 (self or consultant adding company) ──
  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* ── Branded Header ── */}
      <header className="relative bg-[#141414] text-white overflow-hidden">
        {/* Decorative elements */}
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
          {/* Top row: Logo + step indicator + counter */}
          <div className="flex items-center justify-between mb-5 md:mb-6">
            <div className="flex items-center gap-2.5">
              <Image
                src="/gnubokiceon-removebg-preview.png"
                alt="Gnubok"
                width={30}
                height={30}
                className="invert opacity-90"
              />
              <span className="font-display text-base tracking-tight">gnubok</span>
            </div>
            {/* Step indicator — inline with logo row */}
            <div className="flex items-center gap-1.5">
              {stepInfoArr.map((_, i) => {
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

          {/* Step title — compact */}
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

      {/* ── Form Content ── */}
      <main className="flex-1">
        <div className="max-w-lg mx-auto px-6 md:px-10 py-6 md:py-8">
          <div key={`step-${currentStep}`} className="animate-slide-up">
            {renderSteps()}
          </div>
        </div>
      </main>
    </div>
  )
}
