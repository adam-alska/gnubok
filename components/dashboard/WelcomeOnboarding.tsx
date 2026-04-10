'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import * as Sentry from '@sentry/nextjs'
import { createClient } from '@/lib/supabase/client'
import { createCompanyFromOnboarding } from '@/lib/company/actions'
import { computeFiscalPeriod } from '@/lib/company/compute-fiscal-period'
import { useToast } from '@/components/ui/use-toast'
import { Loader2, Building2, Plus } from 'lucide-react'
import { cn } from '@/lib/utils'
import { ENABLED_EXTENSION_IDS } from '@/lib/extensions/_generated/enabled-extensions'
import type { CompanyLookupResult, EnrichmentCompanyRole } from '@/lib/company-lookup/types'
import type { CompanySettings, EntityType, MomsPeriod } from '@/types'

import Step1EntityType from '@/components/onboarding/Step1EntityType'
import Step2CompanyDetails from '@/components/onboarding/Step2CompanyDetails'
import Step3TaxRegistration from '@/components/onboarding/Step3TaxRegistration'
import Step4VatAccounting from '@/components/onboarding/Step4VatAccounting'

const STEP_INFO = [
  { title: 'Företagsform', subtitle: 'Välj din företagsform för att komma igång.' },
  { title: 'Uppgifter', subtitle: 'Uppgifterna visas på fakturor och dokument.' },
  { title: 'F-skatt & räkenskapsår', subtitle: 'Ange din skatteregistrering och räkenskapsår.' },
  { title: 'Moms & bokföring', subtitle: 'Momsregistrering och bokföringsmetod.' },
]

/** Map TIC legalEntityType to gnubok EntityType */
function mapEntityType(ticType: string): EntityType | null {
  const lower = ticType.toLowerCase()
  if (lower === 'ab' || lower.includes('aktiebolag')) return 'aktiebolag'
  if (lower === 'ef' || lower.includes('enskild firma') || lower.includes('enskild')) return 'enskild_firma'
  return null
}

function translatePeriodError(msg: string): string {
  if (msg.includes('end must be after')) return 'Slutdatumet måste vara efter startdatumet.'
  if (msg.includes('start must be the 1st')) return 'Startdatumet måste vara den 1:a i en månad.'
  if (msg.includes('end must be the last day')) return 'Slutdatumet måste vara sista dagen i en månad.'
  if (msg.includes('exceeds maximum 18 months')) return 'Räkenskapsåret får inte överstiga 18 månader (BFL 3 kap.).'
  return 'Ogiltigt räkenskapsår. Kontrollera datumen och försök igen.'
}

const LOG = '[welcome-onboarding]'

function logError(message: string, extra?: Record<string, unknown>) {
  console.error(LOG, message, extra ?? '')
  fetch('/api/log', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: `welcome-onboarding: ${message}`, extra }),
  }).catch(() => {})
  Sentry.captureMessage(`welcome-onboarding: ${message}`, {
    level: 'error',
    extra: { ...extra, component: 'welcome-onboarding' },
  })
}

interface WelcomeOnboardingProps {
  firstName?: string | null
  teamId: string
  skipWelcome?: boolean
  hasExistingCompanies?: boolean
}

export default function WelcomeOnboarding({ firstName, teamId, skipWelcome, hasExistingCompanies }: WelcomeOnboardingProps) {
  const router = useRouter()
  const { toast } = useToast()
  const supabase = createClient()

  const [started, setStarted] = useState(skipWelcome ?? false)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [currentStep, setCurrentStep] = useState(1)
  const [settings, setSettings] = useState<Partial<CompanySettings>>({})
  const ticEnabled = ENABLED_EXTENSION_IDS.has('tic')
  const [ticLookup, setTicLookup] = useState<CompanyLookupResult | null>(null)
  const [enrichmentCompanies, setEnrichmentCompanies] = useState<EnrichmentCompanyRole[]>([])
  const [orgNumberLocked, setOrgNumberLocked] = useState(false)

  const totalSteps = 4

  const hour = new Date().getHours()
  const greeting = hour < 5 ? 'God natt' : hour < 10 ? 'Godmorgon' : hour < 14 ? 'Hej' : hour < 18 ? 'God eftermiddag' : 'God kväll'

  // Load BankID enrichment data on mount
  useEffect(() => {
    async function loadEnrichment() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.push('/login')
        return
      }

      try {
        const { data: enrichmentRow } = await supabase
          .from('extension_data')
          .select('id, value')
          .eq('user_id', user.id)
          .eq('extension_id', 'tic')
          .eq('key', 'bankid_enrichment')
          .maybeSingle()

        if (enrichmentRow?.value) {
          const enrichment = enrichmentRow.value as { spar?: Record<string, string>; companyRoles?: EnrichmentCompanyRole[] }

          const activeCompanies = (enrichment.companyRoles ?? []).filter(
            (c: EnrichmentCompanyRole) => c.companyStatus === 'Aktivt' && c.positionEnd === null
          )
          if (activeCompanies.length > 0) {
            setEnrichmentCompanies(activeCompanies)
          }

          if (enrichment.spar) {
            const spar = enrichment.spar
            setSettings((prev) => ({
              ...prev,
              address_line1: spar.Folkbokforingsadress_SvenskAdress_Utdelningsadress1 || prev.address_line1,
              postal_code: spar.Folkbokforingsadress_SvenskAdress_PostNr || prev.postal_code,
              city: spar.Folkbokforingsadress_SvenskAdress_Postort || prev.city,
            }))
          }

          // Delete enrichment data (one-time use)
          await supabase
            .from('extension_data')
            .delete()
            .eq('id', enrichmentRow.id)
        }
      } catch (err) {
        console.warn(LOG, 'enrichment loading failed (non-blocking)', err)
      }

      setIsLoading(false)
    }

    loadEnrichment()
  }, [supabase, router])

  const handleNext = async (stepData: Partial<CompanySettings>) => {
    if (currentStep === 1 && stepData.entity_type && stepData.entity_type !== settings.entity_type) {
      stepData = { ...stepData, org_number: '', company_name: '' }
      setTicLookup(null)
    }

    const mergedSettings = { ...settings, ...stepData }

    // Validate fiscal period at step 3 before advancing
    if (currentStep === 3) {
      const periodResult = computeFiscalPeriod(mergedSettings)
      if (periodResult.error) {
        toast({
          title: 'Ogiltigt räkenskapsår',
          description: translatePeriodError(periodResult.error),
          variant: 'destructive',
        })
        return
      }
    }

    // Steps 1-3: collect data client-side only, advance step
    if (currentStep < totalSteps) {
      setSettings(mergedSettings)
      setCurrentStep(currentStep + 1)
      return
    }

    // Step 4 (final): create everything via server action.
    // Going through a server action ensures that if the Next.js server is
    // unreachable, nothing touches Supabase — no ghost companies.
    const periodResult = computeFiscalPeriod(mergedSettings)
    if (periodResult.error) {
      toast({
        title: 'Ogiltigt räkenskapsår',
        description: translatePeriodError(periodResult.error),
        variant: 'destructive',
      })
      return
    }

    setIsSaving(true)
    try {
      const result = await createCompanyFromOnboarding({
        teamId,
        settings: mergedSettings as Record<string, unknown>,
        fiscalPeriod: {
          startDate: periodResult.startStr,
          endDate: periodResult.endStr,
          name: periodResult.periodName,
        },
      })

      if (result.error || !result.companyId) {
        logError('create company action failed', { error: result.error })
        toast({
          title: 'Fel',
          description: result.error || 'Kunde inte skapa företag. Försök igen.',
          variant: 'destructive',
        })
        return
      }

      console.log(LOG, 'onboarding completed', result.companyId)
      toast({
        title: 'Välkommen!',
        description: 'Ditt företag är nu redo.',
      })
      router.push('/')
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      logError('create company action threw', { error: message })
      Sentry.captureException(err)
      toast({ title: 'Fel', description: 'Ett oväntat fel uppstod. Försök igen.', variant: 'destructive' })
    } finally {
      setIsSaving(false)
    }
  }

  const handleBack = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1)
    }
  }

  /** Handle selecting a company from BankID enrichment */
  const handleEnrichmentSelect = (company: EnrichmentCompanyRole) => {
    const entityType = mapEntityType(company.legalEntityType)
    if (!entityType) return

    setSettings((prev) => ({
      ...prev,
      entity_type: entityType,
      org_number: company.companyRegistrationNumber,
      company_name: company.legalName,
    }))
    setOrgNumberLocked(true)
    setEnrichmentCompanies([])
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  const stepInfo = STEP_INFO[currentStep - 1]

  // Welcome screen — show before user clicks "Lägg till ditt första företag"
  if (!started) {
    return (
      <div className="flex flex-col items-start justify-center min-h-[60vh] animate-fade-in">
        <p className="text-muted-foreground/50 text-sm mb-2">{greeting}</p>
        <h1 className="font-display text-4xl md:text-5xl font-medium tracking-tight leading-[1.05] mb-10">
          Välkommen till Gnubok
        </h1>
        <button
          onClick={() => setStarted(true)}
          className="px-5 py-2.5 rounded-lg bg-foreground text-background text-sm font-medium hover:bg-foreground/85 transition-colors duration-150 active:scale-[0.98]"
        >
          {hasExistingCompanies ? 'Lägg till ett företag' : 'Lägg till ditt första företag'}
        </button>
      </div>
    )
  }

  return (
    <div className="stagger-enter">
      {/* Greeting header */}
      <header className="mb-10">
        <h1 className="font-display text-2xl md:text-3xl font-medium tracking-tight">
          {greeting}{firstName ? `, ${firstName}` : ''}
        </h1>
        <p className="text-muted-foreground text-sm mt-1.5">
          {hasExistingCompanies ? 'Lägg till ett företag.' : 'Lägg till ditt första företag för att komma igång.'}
        </p>
      </header>

      {/* Onboarding card */}
      <div className="max-w-lg">
        <div className="rounded-xl border bg-card overflow-hidden" style={{ boxShadow: 'var(--shadow-md)' }}>
          {/* Card header with step info */}
          <div className="bg-[#141414] text-white px-6 py-5 relative overflow-hidden">
            <div className="absolute inset-0 pointer-events-none" aria-hidden>
              <div
                className="absolute inset-0"
                style={{
                  background: 'radial-gradient(ellipse at 30% -20%, rgba(255,255,255,0.04) 0%, transparent 50%)',
                }}
              />
            </div>

            <div className="relative z-10">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Building2 className="h-4 w-4 text-white/60" />
                  <span className="text-xs text-white/40 tracking-wide uppercase">Nytt företag</span>
                </div>
                <div className="flex items-center gap-1.5">
                  {STEP_INFO.map((_, i) => {
                    const num = i + 1
                    return (
                      <div
                        key={i}
                        className={cn(
                          'h-[3px] rounded-full transition-all duration-500',
                          num === currentStep && 'w-6 bg-white',
                          num < currentStep && 'w-3 bg-white/50',
                          num > currentStep && 'w-3 bg-white/[0.1]',
                        )}
                      />
                    )
                  })}
                  <span className="text-[10px] text-white/30 ml-1.5">
                    {currentStep}/{totalSteps}
                  </span>
                </div>
              </div>

              <h2 className="font-display text-lg font-medium tracking-tight leading-tight">
                {stepInfo.title}
              </h2>
              <p className="text-white/40 mt-1 text-sm">
                {stepInfo.subtitle}
              </p>
            </div>
          </div>

          {/* Form content */}
          <div className="px-6 py-6">
            <div key={`step-${currentStep}`} className="animate-slide-up">
              {currentStep === 1 && enrichmentCompanies.length > 0 && (
                <div className="mb-6 space-y-3">
                  <p className="text-sm font-medium">Vi hittade dessa företag kopplade till ditt BankID:</p>
                  {enrichmentCompanies.map((company) => {
                    const entityType = mapEntityType(company.legalEntityType)
                    return (
                      <button
                        key={company.companyRegistrationNumber}
                        onClick={() => handleEnrichmentSelect(company)}
                        className="w-full rounded-lg border bg-card p-4 text-left transition-colors hover:border-primary/50 hover:bg-primary/[0.02]"
                      >
                        <p className="font-medium text-sm">{company.legalName}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {company.companyRegistrationNumber} · {entityType === 'aktiebolag' ? 'Aktiebolag' : entityType === 'enskild_firma' ? 'Enskild firma' : company.legalEntityType}
                        </p>
                      </button>
                    )
                  })}
                  <div className="relative py-2">
                    <div className="absolute inset-0 flex items-center">
                      <div className="w-full border-t" />
                    </div>
                    <div className="relative flex justify-center text-xs uppercase">
                      <span className="bg-card px-2 text-muted-foreground">eller välj företagsform manuellt</span>
                    </div>
                  </div>
                </div>
              )}

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
                  orgNumberLocked={orgNumberLocked}
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
        </div>
      </div>
    </div>
  )
}
