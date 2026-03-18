'use client'

import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Image from 'next/image'
import * as Sentry from '@sentry/nextjs'
import { createClient } from '@/lib/supabase/client'
import { useToast } from '@/components/ui/use-toast'
import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { validatePeriodDuration } from '@/lib/bookkeeping/validate-period-duration'
import type { CompanySettings, EntityType, MomsPeriod } from '@/types'

import Step1EntityType from '@/components/onboarding/Step1EntityType'
import Step2CompanyDetails from '@/components/onboarding/Step2CompanyDetails'
import Step3TaxRegistration from '@/components/onboarding/Step3TaxRegistration'
import Step5ConnectBank from '@/components/onboarding/Step6ConnectBank'

const STEP_INFO = [
  { title: 'Välkommen', subtitle: 'Välj din företagsform för att komma igång.', label: 'Företagsform' },
  { title: 'Ditt företag', subtitle: 'Uppgifterna visas på fakturor och dokument.', label: 'Uppgifter' },
  { title: 'Skatt & bokföring', subtitle: 'F-skatt, räkenskapsår och momsregistrering.', label: 'Skatt' },
  { title: 'Bankuppgifter', subtitle: 'Dessa visas på dina fakturor.', label: 'Bank' },
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
  const searchParams = useSearchParams()
  const { toast } = useToast()
  const supabase = createClient()

  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [currentStep, setCurrentStep] = useState(1)
  const [settings, setSettings] = useState<Partial<CompanySettings>>({})

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

      const { data, error } = await supabase
        .from('company_settings')
        .select('*')
        .eq('user_id', user.id)
        .single()

      if (error && error.code !== 'PGRST116') {
        logError('failed to load settings', { message: error.message, code: error.code })
      }

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

      // Remove read-only and transient fields before updating
      const {
        id: _id, user_id: _uid, created_at: _ca, updated_at: _ua,
        is_first_fiscal_year: _ify, first_year_start: _fys, first_year_end: _fye,
        ...settingsToSave
      } = updatedSettings as Record<string, unknown>

      const { error } = await supabase
        .from('company_settings')
        .upsert({ ...settingsToSave, user_id: user.id }, { onConflict: 'user_id' })

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

  // Handle bank_connected callback from PSD2 flow
  useEffect(() => {
    if (searchParams.get('bank_connected') === 'true') {
      toast({
        title: 'Bank ansluten!',
        description: 'Din bank har kopplats.',
      })
      // Complete onboarding after bank connection
      saveSettings({ onboarding_complete: true }, totalSteps).then((success) => {
        if (!success) {
          logError('failed to complete onboarding after bank_connected callback')
        } else {
          toast({
            title: 'Välkommen!',
            description: 'Din profil är nu redo.',
          })
          router.push('/')
        }
      })
    }
  }, [searchParams])

  const handleNext = async (stepData: Partial<CompanySettings>) => {
    // Fix org number bug: clear dependent fields when entity type changes
    if (currentStep === 1 && stepData.entity_type && stepData.entity_type !== settings.entity_type) {
      console.warn(LOG, 'entity type changed from', settings.entity_type, 'to', stepData.entity_type, '— clearing dependent fields')
      stepData = { ...stepData, org_number: '', company_name: '' }
    }

    const nextStep = currentStep + 1
    const success = await saveSettings(stepData, nextStep)

    if (!success) {
      logError('handleNext aborted: saveSettings failed', { step: currentStep })
      return
    }

    // After step 1 (entity type selection): seed chart of accounts
    if (currentStep === 1 && stepData.entity_type) {
      try {
        const { data: { user }, error: authError } = await supabase.auth.getUser()
        if (authError) {
          logError('auth.getUser() failed before seeding chart of accounts', { message: authError.message })
        }
        if (user) {
          const { error: rpcError } = await supabase.rpc('seed_chart_of_accounts', {
            p_user_id: user.id,
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
        } else {
          logError('chart of accounts seeding skipped: no user')
        }
      } catch (err) {
        logError('chart of accounts seeding threw', { error: String(err) })
        Sentry.captureException(err)
      }
    }

    // After step 3 (tax registration): create initial fiscal period
    if (currentStep === 3) {
      try {
        const { data: { user }, error: authError } = await supabase.auth.getUser()
        if (authError) {
          logError('auth.getUser() failed before fiscal period creation', { message: authError.message })
        }
        if (!user) {
          logError('fiscal period creation skipped: no user')
        } else {
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
            .eq('user_id', user.id)

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
            user_id: user.id,
            name: periodName,
            period_start: startStr,
            period_end: endStr,
          }, {
            onConflict: 'user_id,period_start,period_end',
          })

          if (upsertError) {
            logError('fiscal period upsert failed', {
              message: upsertError.message, startStr, endStr, code: upsertError.code, details: upsertError.details,
            })
          }
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

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  const stepInfo = STEP_INFO[currentStep - 1]

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
          onNext={(data) => handleNext(data)}
          onBack={handleBack}
          isSaving={isSaving}
        />
      )}

      {currentStep === 3 && (
        <Step3TaxRegistration
          initialData={{
            f_skatt: settings.f_skatt ?? undefined,
            fiscal_year_start_month: settings.fiscal_year_start_month ?? undefined,
            vat_registered: settings.vat_registered ?? undefined,
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

      {currentStep === 4 && (
        <Step5ConnectBank
          initialData={{
            bank_name: settings.bank_name ?? undefined,
            clearing_number: settings.clearing_number ?? undefined,
            account_number: settings.account_number ?? undefined,
            iban: settings.iban ?? undefined,
            bic: settings.bic ?? undefined,
          }}
          onComplete={async (data) => {
            if (data) {
              const bankSaved = await saveSettings(data, totalSteps)
              if (!bankSaved) {
                logError('failed to save bank details at step 5')
                return
              }
            }
            const finalSuccess = await saveSettings({ onboarding_complete: true }, totalSteps)
            if (!finalSuccess) {
              logError('failed to set onboarding_complete at step 5')
              return
            }
            console.log(LOG, 'onboarding completed')
            toast({
              title: 'Välkommen!',
              description: 'Din profil är nu redo.',
            })
            router.push('/')
          }}
          onBack={handleBack}
          onSkip={async () => {
            const finalSuccess = await saveSettings({ onboarding_complete: true }, totalSteps)
            if (!finalSuccess) {
              logError('failed to set onboarding_complete when skipping step 5')
              return
            }
            console.log(LOG, 'onboarding completed')
            toast({
              title: 'Välkommen!',
              description: 'Din profil är nu redo.',
            })
            router.push('/')
          }}
          isSaving={isSaving}
        />
      )}
    </>
  )

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
