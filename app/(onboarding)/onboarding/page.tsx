'use client'

import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Progress } from '@/components/ui/progress'
import { useToast } from '@/components/ui/use-toast'
import { Loader2 } from 'lucide-react'
import type { CompanySettings, EntityType, MomsPeriod } from '@/types'

import Step1EntityType from '@/components/onboarding/Step1EntityType'
import Step2CompanyDetails from '@/components/onboarding/Step2CompanyDetails'
import Step3TaxRegistration from '@/components/onboarding/Step3TaxRegistration'
import Step4PreliminaryTax from '@/components/onboarding/Step4PreliminaryTax'
import Step5ConnectBank from '@/components/onboarding/Step6ConnectBank'
import Step6SectorSelection from '@/components/onboarding/Step2SectorSelection'
import Step7ExtensionSuggestions from '@/components/onboarding/Step3ExtensionSuggestions'

const STEP_TITLES = [
  'Verksamhetsform',
  'Företagsuppgifter',
  'Skatteregistrering',
  'F-skatt',
  'Anslut bank',
  'Bransch',
  'Tillägg',
]

export default function OnboardingPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center h-64"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>}>
      <OnboardingPageContent />
    </Suspense>
  )
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
  const [sectorSlug, setSectorSlug] = useState<string | null>(null)

  const totalSteps = 7
  const stepTitles = STEP_TITLES

  // Load existing settings on mount
  useEffect(() => {
    async function loadSettings() {
      const { data: { user } } = await supabase.auth.getUser()

      if (!user) {
        router.push('/login')
        return
      }

      const { data, error } = await supabase
        .from('company_settings')
        .select('*')
        .eq('user_id', user.id)
        .single()

      if (data) {
        setSettings(data)
        setCurrentStep(data.onboarding_step || 1)
        if ((data as Record<string, unknown>).sector_slug) {
          setSectorSlug((data as Record<string, unknown>).sector_slug as string)
        }
      }

      setIsLoading(false)
    }

    loadSettings()
  }, [supabase, router, toast])

  // Handle bank_connected callback from PSD2 flow
  useEffect(() => {
    if (searchParams.get('bank_connected') === 'true') {
      toast({
        title: 'Bank ansluten!',
        description: 'Din bank har kopplats.',
      })
      saveSettings({}, 6).then((success) => {
        if (success) {
          setCurrentStep(6)
        }
      })
    }
  }, [searchParams])

  const saveSettings = async (updates: Partial<CompanySettings>, nextStep?: number) => {
    setIsSaving(true)

    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      router.push('/login')
      return false
    }

    const updatedSettings = {
      ...settings,
      ...updates,
      onboarding_step: nextStep || currentStep,
    }

    // Remove read-only fields before updating
    const { id: _id, user_id: _uid, created_at: _ca, updated_at: _ua, ...settingsToSave } = updatedSettings as Record<string, unknown>

    const { error } = await supabase
      .from('company_settings')
      .upsert({ ...settingsToSave, user_id: user.id }, { onConflict: 'user_id' })

    if (error) {
      console.error('Error saving settings:', JSON.stringify(error), 'code:', error.code, 'message:', error.message, 'details:', error.details)
      console.error('Payload was:', JSON.stringify({ ...settingsToSave, user_id: user.id }))
      toast({
        title: 'Fel',
        description: error.message || 'Kunde inte spara. Försök igen.',
        variant: 'destructive',
      })
      setIsSaving(false)
      return false
    }

    setSettings(updatedSettings)
    setIsSaving(false)
    return true
  }

  const handleNext = async (stepData: Partial<CompanySettings>) => {
    const nextStep = currentStep + 1
    const success = await saveSettings(stepData, nextStep)

    if (success) {
      // After step 1 (entity type selection): seed chart of accounts
      if (currentStep === 1 && stepData.entity_type) {
        try {
          const { data: { user } } = await supabase.auth.getUser()
          if (user) {
            await supabase.rpc('seed_chart_of_accounts', {
              p_user_id: user.id,
              p_entity_type: stepData.entity_type,
            })
          }
        } catch (err) {
          console.error('Failed to seed chart of accounts:', err)
        }
      }

      // After step 3 (tax registration): create initial fiscal period
      if (currentStep === 3) {
        try {
          const { data: { user } } = await supabase.auth.getUser()
          if (user) {
            const startMonth = stepData.fiscal_year_start_month || settings.fiscal_year_start_month || 1
            const currentYear = new Date().getFullYear()

            const startStr = `${currentYear}-${String(startMonth).padStart(2, '0')}-01`
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
            const endStr = `${endYear}-${String(endMonth).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`

            await supabase.from('fiscal_periods').upsert({
              user_id: user.id,
              name: `Räkenskapsår ${currentYear}`,
              period_start: startStr,
              period_end: endStr,
            }, {
              onConflict: 'user_id,period_start,period_end',
            })
          }
        } catch (err) {
          console.error('Failed to create fiscal period:', err)
        }
      }

      if (nextStep > totalSteps) {
        await saveSettings({ onboarding_complete: true }, totalSteps)
        router.push('/')
      } else {
        setCurrentStep(nextStep)
      }
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

    if (success) {
      setCurrentStep(nextStep)
    }
  }

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  const progressPercent = ((currentStep - 1) / (totalSteps - 1)) * 100

  const handleSectorNext = async (data: { sector_slug: string | null }) => {
    setSectorSlug(data.sector_slug)
    const nextStep = currentStep + 1
    const settingsUpdate: Partial<CompanySettings> = {}
    if (data.sector_slug) {
      ;(settingsUpdate as Record<string, unknown>).sector_slug = data.sector_slug
    }
    const success = await saveSettings(settingsUpdate, nextStep)
    if (success) {
      setCurrentStep(nextStep)
    }
  }

  const handleExtensionsNext = async (data: { enabled_extensions: { sector_slug: string; extension_slug: string }[] }) => {
    // Insert extension toggles if any were selected
    if (data.enabled_extensions.length > 0) {
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (user) {
          const rows = data.enabled_extensions.map(ext => ({
            user_id: user.id,
            sector_slug: ext.sector_slug,
            extension_slug: ext.extension_slug,
            enabled: true,
          }))
          await supabase.from('extension_toggles').upsert(rows, {
            onConflict: 'user_id,sector_slug,extension_slug',
          })
        }
      } catch (err) {
        console.error('Failed to save extension toggles:', err)
      }
    }
  }

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
            moms_period: settings.moms_period as MomsPeriod | undefined,
          }}
          onNext={(data) => handleNext(data)}
          onBack={handleBack}
          isSaving={isSaving}
        />
      )}

      {currentStep === 4 && (
        <Step4PreliminaryTax
          initialData={{
            preliminary_tax_monthly: settings.preliminary_tax_monthly ?? undefined,
          }}
          onNext={(data) => handleNext(data)}
          onBack={handleBack}
          onSkip={handleSkip}
          isSaving={isSaving}
        />
      )}

      {currentStep === 5 && (
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
              await saveSettings(data, 6)
            }
            setCurrentStep(6)
          }}
          onBack={handleBack}
          onSkip={() => setCurrentStep(6)}
          isSaving={isSaving}
        />
      )}

      {currentStep === 6 && (
        <Step6SectorSelection
          onNext={handleSectorNext}
          onBack={handleBack}
          isSaving={isSaving}
        />
      )}

      {currentStep === 7 && (
        <Step7ExtensionSuggestions
          sectorSlug={sectorSlug}
          onNext={async (data) => {
            await handleExtensionsNext(data)
            await saveSettings({ onboarding_complete: true }, totalSteps)
            toast({
              title: 'Välkommen!',
              description: 'Din profil är nu redo.',
            })
            router.push('/')
          }}
          onBack={handleBack}
          isSaving={isSaving}
        />
      )}
    </>
  )

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/5 via-background to-primary/10">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-background/80 backdrop-blur-sm border-b">
        <div className="max-w-2xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-muted-foreground">
              Steg {currentStep} av {totalSteps}
            </span>
            <span className="text-sm font-medium">
              {stepTitles[currentStep - 1]}
            </span>
          </div>
          <Progress value={progressPercent} className="h-2" />
        </div>
      </div>

      {/* Content */}
      <div className="max-w-2xl mx-auto px-4 py-8">
        {renderSteps()}
      </div>
    </div>
  )
}
