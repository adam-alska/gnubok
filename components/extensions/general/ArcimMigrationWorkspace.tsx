'use client'

import { useState, useCallback, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { useToast } from '@/components/ui/use-toast'
import { cn } from '@/lib/utils'
import { ConfirmationDialog } from '@/components/ui/confirmation-dialog'
import Link from 'next/link'
import {
  ArrowLeft,
  ArrowRight,
  Loader2,
  AlertCircle,
  CheckCircle,
  Building2,
  Users,
  Truck,
  FileText,
  Database,
  ExternalLink,
  Info,
  RotateCcw,
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Calendar,
  XCircle,
  BookOpen,
} from 'lucide-react'
import type { WorkspaceComponentProps } from '@/lib/extensions/workspace-registry'

type ArcimProvider = 'fortnox' | 'visma' | 'briox' | 'bokio' | 'bjornlunden'

const ARCIM_PROVIDERS: { id: ArcimProvider; name: string; authType: 'oauth' | 'token' }[] = [
  { id: 'fortnox', name: 'Fortnox', authType: 'oauth' },
  { id: 'visma', name: 'Visma eEkonomi', authType: 'oauth' },
  { id: 'bokio', name: 'Bokio', authType: 'token' },
  { id: 'bjornlunden', name: 'Björn Lundén', authType: 'token' },
  { id: 'briox', name: 'Briox', authType: 'token' },
]

interface MigrationResults {
  companyInfo?: { imported: boolean }
  customers?: { total: number; imported: number; skipped: number }
  suppliers?: { total: number; imported: number; skipped: number }
  salesInvoices?: { total: number; imported: number; skipped: number }
  supplierInvoices?: { total: number; imported: number; skipped: number }
}
import AccountMappingStep from '@/components/import/AccountMappingStep'
import type { AccountMapping, ImportResult, ParsedSIEFile } from '@/lib/import/types'
import type { BASAccount } from '@/types'

// ── Types ────────────────────────────────────────────────────────

type WizardStep = 'provider' | 'connect' | 'preview' | 'mapping' | 'options' | 'migrating' | 'result'

const STEPS: WizardStep[] = ['provider', 'connect', 'preview', 'mapping', 'options', 'migrating', 'result']

const STEP_LABELS: Record<WizardStep, string> = {
  provider: 'Välj system',
  connect: 'Anslut',
  preview: 'Förhandsgranskning',
  mapping: 'Kontomappning',
  options: 'Alternativ',
  migrating: 'Migrerar',
  result: 'Resultat',
}

const MONTH_NAMES = [
  'Januari', 'Februari', 'Mars', 'April', 'Maj', 'Juni',
  'Juli', 'Augusti', 'September', 'Oktober', 'November', 'December',
]

interface MigrationOptions {
  importCompanyInfo: boolean
  importSIEData: boolean
  importCustomers: boolean
  importSuppliers: boolean
  importSalesInvoices: boolean
  importSupplierInvoices: boolean
  voucherSeries: string
}

const DEFAULT_OPTIONS: MigrationOptions = {
  importCompanyInfo: true,
  importSIEData: true,
  importCustomers: true,
  importSuppliers: true,
  importSalesInvoices: true,
  importSupplierInvoices: true,
  voucherSeries: 'B',
}

interface PreviewData {
  consent: {
    id: string
    provider: ArcimProvider
    status: number
    companyName?: string
  }
  companyInfo: {
    company_name: string | null
    org_number: string | null
    vat_number: string | null
    fiscal_year_start_month: number
    address_line1: string | null
    postal_code: string | null
    city: string | null
    phone: string | null
    email: string | null
  } | null
  sieAvailable: boolean
  sieStats: {
    accountCount: number
    transactionCount: number
    fiscalYears: number[]
  } | null
}

interface SIEData {
  parsed: ParsedSIEFile
  mappings: AccountMapping[]
  mappingStats: { total: number; mapped: number; unmapped: number }
  rawContent: string[]
  basAccounts: BASAccount[]
}

// ── Provider selection step ──────────────────────────────────────

const COMING_SOON_PROVIDERS = new Set<ArcimProvider>(['visma', 'bjornlunden', 'briox'])

const PROVIDER_LOGOS: Record<ArcimProvider, string> = {
  fortnox: '/logos/fortnox.svg',
  visma: '/logos/visma.jpeg',
  bokio: '/logos/bokio.png',
  bjornlunden: '/logos/bjornlunden.png',
  briox: '/logos/Briox_logo.png',
}

function ProviderStep({ onSelect }: { onSelect: (provider: ArcimProvider) => void }) {
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Välj ditt nuvarande bokföringssystem</CardTitle>
          <CardDescription>
            Vi hämtar bokföringsdata via SIE och kunder, leverantörer och fakturor via API:et.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-2">
            {ARCIM_PROVIDERS.map((provider) => {
              const comingSoon = COMING_SOON_PROVIDERS.has(provider.id)
              return (
                <button
                  key={provider.id}
                  disabled={comingSoon}
                  className={`relative flex items-center gap-4 rounded-lg border p-4 text-left transition-all ${
                    comingSoon
                      ? 'cursor-not-allowed border-border/50 opacity-60'
                      : 'border-border hover:border-primary/50 hover:bg-accent/50 active:scale-[0.98]'
                  }`}
                  onClick={() => !comingSoon && onSelect(provider.id)}
                >
                  <img
                    src={PROVIDER_LOGOS[provider.id]}
                    alt={provider.name}
                    className="h-10 w-10 shrink-0 rounded-lg object-contain"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="font-medium">{provider.name}</p>
                      {comingSoon && (
                        <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                          Kommer snart
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {provider.authType === 'oauth' ? 'Anslut via inloggning' : 'Anslut med API-nyckel'}
                    </p>
                  </div>
                </button>
              )
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

// ── Connect step (OAuth redirect or token input) ────────────────

function ConnectStep({
  provider,
  authType,
  isLoading,
  error,
  authUrl,
  consentId,
  onTokenSubmit,
  onBack,
}: {
  provider: ArcimProvider
  authType: 'oauth' | 'token' | null
  isLoading: boolean
  error: string | null
  authUrl: string | null
  consentId: string | null
  onTokenSubmit: (apiToken: string, companyId: string) => void
  onBack: () => void
}) {
  const providerName = ARCIM_PROVIDERS.find(p => p.id === provider)?.name ?? provider
  const [apiToken, setApiToken] = useState('')
  const [companyId, setCompanyId] = useState('')

  // BL uses server-side client credentials — only needs company ID, no API key
  const isClientCredentials = provider === 'bjornlunden'
  const needsApiToken = !isClientCredentials
  const needsCompanyId = provider === 'bokio' || provider === 'bjornlunden'

  const tokenDescription = isClientCredentials
    ? `Ange ditt företags-ID (GUID) från Björn Lundén. gnubok ansluter automatiskt via sin integrationspartner-åtkomst.`
    : `Ange din API-nyckel från ${providerName} för att ge gnubok tillgång att läsa din bokföringsdata.`

  const tokenHelpText = isClientCredentials
    ? `Hittas i Björn Lundén under Inställningar \u2192 Företagsinformation (GUID-format).`
    : provider === 'bokio'
      ? `Du hittar din API-nyckel i ${providerName} under Inställningar \u2192 Integrationer \u2192 API. Ditt företags-ID är det GUID som syns i URL:en när du är inloggad, t.ex. https://app.bokio.se/ditt-företags-id/settings-r/private-integrations.`
      : `Du hittar din applikationstoken i ${providerName} under Administration \u2192 Integrationer.`

  const canSubmit = isClientCredentials
    ? !!companyId
    : !!(apiToken && (!needsCompanyId || companyId))

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Anslut till {providerName}</CardTitle>
          <CardDescription>
            {authType === 'token'
              ? tokenDescription
              : `Logga in i ${providerName} för att ge gnubok tillgång att läsa din bokföringsdata.`
            }
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {isLoading && (
            <div className="flex items-center gap-3 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
              <p>Förbereder anslutning...</p>
            </div>
          )}

          {error && (
            <div className="flex gap-3 rounded-lg border border-destructive/20 bg-destructive/10 p-4">
              <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
              <div>
                <p className="font-medium text-destructive">Anslutning misslyckades</p>
                <p className="text-sm text-muted-foreground">{error}</p>
                {provider === 'fortnox' && (
                  <p className="mt-1 text-sm text-muted-foreground">
                    Obs: Fortnox kräver ett aktivt integrationstillägg (tillkostnadsbelagd tilläggstjänst) för att kunna använda integrationer. Kontrollera att detta är aktiverat i ditt Fortnox-konto.
                  </p>
                )}
              </div>
            </div>
          )}

          {/* OAuth flow */}
          {authType === 'oauth' && authUrl && !isLoading && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Klicka nedan för att logga in i {providerName} i ett nytt fönster.
                När du är klar skickas du tillbaka hit automatiskt.
              </p>
              <Button asChild className="min-h-11">
                <a href={authUrl} target="_blank" rel="noopener noreferrer">
                  Logga in i {providerName}
                  <ExternalLink className="ml-2 h-4 w-4" />
                </a>
              </Button>
            </div>
          )}

          {/* Token-based flow */}
          {authType === 'token' && consentId && !isLoading && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                {tokenHelpText}
              </p>
              <div className="space-y-3">
                {needsApiToken && (
                  <div>
                    <label htmlFor="apiToken" className="text-sm font-medium">
                      {provider === 'briox' ? 'Applikationstoken' : 'API-nyckel'}
                    </label>
                    <Input
                      id="apiToken"
                      type="password"
                      placeholder={provider === 'briox' ? 'Klistra in din applikationstoken' : 'Klistra in din API-nyckel'}
                      value={apiToken}
                      onChange={(e) => setApiToken(e.target.value)}
                    />
                  </div>
                )}
                {needsCompanyId && (
                  <div>
                    <label htmlFor="companyId" className="text-sm font-medium">
                      Företags-ID
                    </label>
                    <Input
                      id="companyId"
                      placeholder={isClientCredentials ? 'GUID från företagsinställningar' : 'GUID från URL:en, t.ex. 14ccad83-67f6-49bd-...'}
                      value={companyId}
                      onChange={(e) => setCompanyId(e.target.value)}
                    />
                  </div>
                )}
                <Button
                  className="min-h-11"
                  onClick={() => onTokenSubmit(apiToken, companyId)}
                  disabled={!canSubmit}
                >
                  Anslut
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex">
        <Button variant="outline" className="min-h-11" onClick={onBack}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Tillbaka
        </Button>
      </div>
    </div>
  )
}

// ── Preview step ────────────────────────────────────────────────

function PreviewStep({
  preview,
  isLoading,
  error,
  onContinue,
  onBack,
}: {
  preview: PreviewData | null
  isLoading: boolean
  error: string | null
  onContinue: () => void
  onBack: () => void
}) {
  const providerName = preview
    ? ARCIM_PROVIDERS.find(p => p.id === preview.consent.provider)?.name ?? preview.consent.provider
    : ''

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Anslutet till {providerName}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {isLoading && (
            <div className="flex items-center gap-3 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
              <p>Hämtar bokföringsdata...</p>
            </div>
          )}

          {error && (
            <div className="flex gap-3 rounded-lg border border-destructive/20 bg-destructive/10 p-4">
              <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
              <p className="text-sm text-muted-foreground">{error}</p>
            </div>
          )}

          {/* SIE stats summary */}
          {preview?.sieAvailable && preview.sieStats && (
            <div className="flex gap-3 rounded-lg border border-primary/20 bg-primary/5 p-4">
              <Database className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
              <div>
                <p className="text-sm font-medium">
                  Hittade {preview.sieStats.accountCount} konton och {preview.sieStats.transactionCount} verifikationer
                </p>
                <p className="text-xs text-muted-foreground">
                  {preview.sieStats.fiscalYears.length === 1
                    ? `Räkenskapsår ${preview.sieStats.fiscalYears[0]}`
                    : `${preview.sieStats.fiscalYears.length} räkenskapsår: ${preview.sieStats.fiscalYears.join(', ')}`
                  }
                </p>
              </div>
            </div>
          )}

          {preview && !preview.sieAvailable && !isLoading && (
            <div className="flex gap-3 rounded-lg border border-warning/30 bg-warning/10 p-4">
              <Info className="mt-0.5 h-5 w-5 shrink-0 text-warning-foreground" />
              <div>
                <p className="text-sm font-medium text-warning-foreground">SIE-hämtning inte tillgänglig</p>
                <p className="text-xs text-muted-foreground">
                  SIE-hämtning är inte tillgänglig för denna leverantör ännu. Du kan importera SIE-filen manuellt via SIE-importen.
                </p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-between">
        <Button variant="outline" className="min-h-11" onClick={onBack}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Tillbaka
        </Button>
        <Button className="min-h-11" onClick={onContinue} disabled={isLoading}>
          Fortsätt
          <ArrowRight className="ml-2 h-4 w-4" />
        </Button>
      </div>
    </div>
  )
}

function InfoItem({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-sm font-medium">{value || '—'}</p>
    </div>
  )
}

// ── Mapping step (wraps AccountMappingStep) ─────────────────────

function MappingStep({
  sieData,
  isLoading,
  error,
  onMappingChange,
  onContinue,
  onBack,
}: {
  sieData: SIEData | null
  isLoading: boolean
  error: string | null
  onMappingChange: (sourceAccount: string, targetAccount: string, targetName: string) => void
  onContinue: () => void
  onBack: () => void
}) {
  if (isLoading) {
    return (
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center gap-3 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
            <p>Analyserar bokföringsdata och förbereder kontomappning...</p>
          </div>
        </CardContent>
      </Card>
    )
  }

  if (error) {
    return (
      <div className="space-y-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex gap-3 rounded-lg border border-destructive/20 bg-destructive/10 p-4">
              <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
              <div>
                <p className="font-medium text-destructive">Kunde inte ladda SIE-data</p>
                <p className="text-sm text-muted-foreground">{error}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Button variant="outline" className="min-h-11" onClick={onBack}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Tillbaka
        </Button>
      </div>
    )
  }

  if (!sieData) return null

  return (
    <AccountMappingStep
      mappings={sieData.mappings}
      basAccounts={sieData.basAccounts}
      onMappingChange={onMappingChange}
      onContinue={onContinue}
      onBack={onBack}
    />
  )
}

// ── Options step ────────────────────────────────────────────────

function OptionsStep({
  options,
  sieAvailable,
  onChange,
  onStart,
  onBack,
}: {
  options: MigrationOptions
  sieAvailable: boolean
  onChange: (options: MigrationOptions) => void
  onStart: () => void
  onBack: () => void
}) {
  const [showConfirm, setShowConfirm] = useState(false)

  const toggleOption = (key: keyof MigrationOptions) => {
    onChange({ ...options, [key]: !options[key] })
  }

  const selectedItems: string[] = []
  if (options.importCompanyInfo) selectedItems.push('Företagsinformation')
  if (sieAvailable && options.importSIEData) selectedItems.push('Bokföringsdata (SIE)')
  if (options.importCustomers) selectedItems.push('Kunder')
  if (options.importSuppliers) selectedItems.push('Leverantörer')
  if (options.importSalesInvoices) selectedItems.push('Kundfakturor')
  if (options.importSupplierInvoices) selectedItems.push('Leverantörsfakturor')

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Vad vill du importera?</CardTitle>
          <CardDescription>
            Bokföringsdata importeras via SIE-fil. Kunder, leverantörer och fakturor hämtas via API:et.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <OptionRow
            icon={<Building2 className="h-4 w-4" />}
            label="Företagsinformation"
            description="Namn, organisationsnummer, adress"
            checked={options.importCompanyInfo}
            onChange={() => toggleOption('importCompanyInfo')}
          />

          {sieAvailable && (
            <>
              <OptionRow
                icon={<Database className="h-4 w-4" />}
                label="Bokföringsdata (SIE)"
                description="Kontoplan, ingående balanser och verifikationer"
                checked={options.importSIEData}
                onChange={() => toggleOption('importSIEData')}
              />
              {options.importSIEData && (
                <div className="flex items-center gap-3 rounded-lg border border-border p-3 ml-4">
                  <div className="text-muted-foreground">
                    <FileText className="h-4 w-4" />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-medium">Verifikationsserie</p>
                    <p className="text-xs text-muted-foreground">Serie för importerade verifikationer</p>
                  </div>
                  <Input
                    className="w-16 text-center"
                    value={options.voucherSeries}
                    onChange={(e) => onChange({ ...options, voucherSeries: e.target.value.toUpperCase() || 'B' })}
                    maxLength={2}
                  />
                </div>
              )}
            </>
          )}

          <OptionRow
            icon={<Users className="h-4 w-4" />}
            label="Kunder"
            description="Kund-register med kontaktuppgifter"
            checked={options.importCustomers}
            onChange={() => toggleOption('importCustomers')}
          />
          <OptionRow
            icon={<Truck className="h-4 w-4" />}
            label="Leverantörer"
            description="Leverantör-register med bankuppgifter"
            checked={options.importSuppliers}
            onChange={() => toggleOption('importSuppliers')}
          />
          <OptionRow
            icon={<FileText className="h-4 w-4" />}
            label="Kundfakturor (öppna)"
            description="Obetalda kundfakturor"
            checked={options.importSalesInvoices}
            onChange={() => toggleOption('importSalesInvoices')}
          />
          <OptionRow
            icon={<FileText className="h-4 w-4" />}
            label="Leverantörsfakturor (öppna)"
            description="Obetalda leverantörsfakturor"
            checked={options.importSupplierInvoices}
            onChange={() => toggleOption('importSupplierInvoices')}
          />
        </CardContent>
      </Card>

      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-between">
        <Button variant="outline" className="min-h-11" onClick={onBack}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Tillbaka
        </Button>
        <Button className="min-h-11" onClick={() => setShowConfirm(true)} disabled={selectedItems.length === 0}>
          Starta migrering
          <ArrowRight className="ml-2 h-4 w-4" />
        </Button>
      </div>

      <ConfirmationDialog
        open={showConfirm}
        onOpenChange={setShowConfirm}
        onConfirm={() => {
          setShowConfirm(false)
          onStart()
        }}
        isSubmitting={false}
        title="Starta migrering"
        warningText="Bokföringsdata, kunder, leverantörer och fakturor importeras till gnubok. Se till att ingen annan import pågår."
        confirmLabel="Starta migrering"
      >
        <div className="space-y-2">
          <p className="text-sm font-medium">Följande importeras:</p>
          <ul className="space-y-1">
            {selectedItems.map((item) => (
              <li key={item} className="flex items-center gap-2 text-sm text-muted-foreground">
                <CheckCircle className="h-3.5 w-3.5 text-primary" />
                {item}
              </li>
            ))}
          </ul>
        </div>
      </ConfirmationDialog>
    </div>
  )
}

function OptionRow({
  icon,
  label,
  description,
  checked,
  onChange,
}: {
  icon: React.ReactNode
  label: string
  description: string
  checked: boolean
  onChange: () => void
}) {
  return (
    <div
      className="flex cursor-pointer items-center gap-3 rounded-lg border border-border p-3 transition-colors hover:bg-accent/50"
      onClick={onChange}
    >
      <div className="text-muted-foreground">{icon}</div>
      <div className="flex-1">
        <p className="text-sm font-medium">{label}</p>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      <Switch
        checked={checked}
        onCheckedChange={onChange}
        onClick={(e) => e.stopPropagation()}
      />
    </div>
  )
}

// ── Migrating step (progress) ───────────────────────────────────

function MigratingStep({ currentStep, progress }: { currentStep: string; progress: number }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Migrering pågår</CardTitle>
        <CardDescription>
          Vänta medan vi hämtar och importerar din bokföringsdata. Det kan ta några minuter.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-1">
          <div className="flex justify-end">
            <span className="text-xs text-muted-foreground">{progress}%</span>
          </div>
          <Progress value={progress} className="h-3" />
        </div>
        <div className="flex items-center gap-3 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
          <p className="text-sm">{currentStep}</p>
        </div>
      </CardContent>
    </Card>
  )
}

// ── Result step ─────────────────────────────────────────────────

/** Format a fiscal year label from ISO dates, e.g. "2024-01-01" → "2024" or "2024/2025" */
function formatFiscalYearLabel(start: string, end: string): string {
  const startYear = start.slice(0, 4)
  const endYear = end.slice(0, 4)
  return startYear === endYear ? startYear : `${startYear}/${endYear}`
}

/** Determine the overall status icon and color for a single FY import */
function getFYStatus(r: ImportResult): { icon: 'success' | 'warning' | 'error'; label: string } {
  if (r.errors.length > 0 && r.journalEntriesCreated === 0) {
    return { icon: 'error', label: 'Misslyckades' }
  }
  if (r.errors.length > 0 || (r.details?.skippedVouchers && r.details.skippedVouchers.total > 0)) {
    return { icon: 'warning', label: 'Delvis importerad' }
  }
  return { icon: 'success', label: 'Importerad' }
}

const StatusIcon = ({ status }: { status: 'success' | 'warning' | 'error' }) => {
  if (status === 'error') return <XCircle className="h-4 w-4 text-destructive" />
  if (status === 'warning') return <AlertTriangle className="h-4 w-4 text-amber-500" />
  return <CheckCircle className="h-4 w-4 text-green-600" />
}

/** Expandable per-fiscal-year detail card */
function FiscalYearResult({ result, index }: { result: ImportResult; index: number }) {
  const [expanded, setExpanded] = useState(false)
  const status = getFYStatus(result)
  const d = result.details
  const fyLabel = d?.fiscalYear
    ? formatFiscalYearLabel(d.fiscalYear.start, d.fiscalYear.end)
    : `Räkenskapsår ${index + 1}`

  return (
    <div className="rounded-lg border border-border">
      {/* Header — always visible */}
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-3 p-4 text-left transition-colors hover:bg-accent/50"
      >
        <StatusIcon status={status.icon} />
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-2">
            <span className="font-medium">{fyLabel}</span>
            <span className={`text-sm ${
              status.icon === 'error' ? 'text-destructive' :
              status.icon === 'warning' ? 'text-amber-600' :
              'text-muted-foreground'
            }`}>
              {status.label}
            </span>
          </div>
          <p className="text-sm text-muted-foreground tabular-nums">
            {result.journalEntriesCreated.toLocaleString('sv-SE')} verifikationer importerade
            {d?.skippedVouchers && d.skippedVouchers.total > 0 && (
              <span className="text-amber-600">
                {' · '}{d.skippedVouchers.total} hoppade över
              </span>
            )}
          </p>
        </div>
        {expanded
          ? <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
          : <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
        }
      </button>

      {/* Expanded details */}
      {expanded && (
        <div className="border-t border-border px-4 pb-4 pt-3 space-y-3">
          {/* Errors — shown prominently */}
          {result.errors.length > 0 && (
            <div className="rounded-md border border-destructive/20 bg-destructive/5 p-3">
              <div className="flex items-start gap-2">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                <div className="space-y-1.5">
                  <p className="text-sm font-medium text-destructive">
                    {result.errors.length === 1 ? '1 fel vid import' : `${result.errors.length} fel vid import`}
                  </p>
                  {result.errors.map((e, i) => (
                    <p key={i} className="text-sm text-muted-foreground">{e}</p>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Opening balance adjustment */}
          {d?.openingBalance && (
            <div className="rounded-md border border-border bg-muted/30 p-3">
              <div className="flex items-start gap-2">
                <BookOpen className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                <div>
                  <p className="text-sm font-medium">Ingående balanser justerade</p>
                  <p className="text-sm text-muted-foreground">
                    {d.openingBalance.explanation === 'unallocated_result' && (
                      <>
                        Differens på <span className="tabular-nums font-medium">{Math.abs(d.openingBalance.imbalance).toLocaleString('sv-SE', { minimumFractionDigits: 2 })} SEK</span> bokförd
                        på konto {d.openingBalance.bookedToAccount}. Detta beror troligen på att föregående
                        års resultat inte allokerats till eget kapital i källsystemet — vanligt vid byte
                        av bokföringsprogram.
                      </>
                    )}
                    {d.openingBalance.explanation === 'excluded_accounts' && (
                      <>
                        Exkluderade systemkonton (t.ex. Fortnox 0099) hade ingående saldon. Differensen
                        (<span className="tabular-nums font-medium">{Math.abs(d.openingBalance.imbalance).toLocaleString('sv-SE', { minimumFractionDigits: 2 })} SEK</span>)
                        bokförd på konto {d.openingBalance.bookedToAccount}.
                      </>
                    )}
                    {d.openingBalance.explanation === 'rounding' && (
                      <>
                        Avrundningsdifferens (<span className="tabular-nums font-medium">{Math.abs(d.openingBalance.imbalance).toLocaleString('sv-SE', { minimumFractionDigits: 2 })} SEK</span>)
                        bokförd på konto {d.openingBalance.bookedToAccount}.
                      </>
                    )}
                    {!d.openingBalance.explanation && (
                      <>
                        Differens på <span className="tabular-nums font-medium">{Math.abs(d.openingBalance.imbalance).toLocaleString('sv-SE', { minimumFractionDigits: 2 })} SEK</span> bokförd
                        på konto {d.openingBalance.bookedToAccount}.
                      </>
                    )}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Skipped vouchers breakdown */}
          {d?.skippedVouchers && d.skippedVouchers.total > 0 && (
            <div className="rounded-md border border-amber-200 bg-amber-50/50 p-3 dark:border-amber-900/30 dark:bg-amber-950/20">
              <div className="flex items-start gap-2">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
                <div>
                  <p className="text-sm font-medium text-amber-700 dark:text-amber-400">
                    {d.skippedVouchers.total} verifikationer hoppades över
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Ofullständiga verifikationer i källsystemet som inte kan importeras.
                    Saldon har justerats automatiskt via omföringsverifikation.
                  </p>
                  <div className="mt-2 grid grid-cols-2 gap-x-6 gap-y-1 text-sm text-muted-foreground tabular-nums">
                    {d.skippedVouchers.unbalanced > 0 && (
                      <div className="flex justify-between">
                        <span>Obalanserade</span>
                        <span className="font-medium">{d.skippedVouchers.unbalanced}</span>
                      </div>
                    )}
                    {d.skippedVouchers.unmapped > 0 && (
                      <div className="flex justify-between">
                        <span>Ej mappade konton</span>
                        <span className="font-medium">{d.skippedVouchers.unmapped}</span>
                      </div>
                    )}
                    {d.skippedVouchers.singleLine > 0 && (
                      <div className="flex justify-between">
                        <span>Enradsverifikationer</span>
                        <span className="font-medium">{d.skippedVouchers.singleLine}</span>
                      </div>
                    )}
                    {d.skippedVouchers.empty > 0 && (
                      <div className="flex justify-between">
                        <span>Tomma</span>
                        <span className="font-medium">{d.skippedVouchers.empty}</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Migration adjustment info */}
          {d?.migrationAdjustment?.created && (
            <div className="rounded-md border border-border bg-muted/30 p-3">
              <div className="flex items-start gap-2">
                <Info className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                <div>
                  <p className="text-sm font-medium">Omföringsverifikation skapad</p>
                  <p className="text-sm text-muted-foreground">
                    {d.migrationAdjustment.accountsAdjusted} konton justerade för att saldon ska matcha
                    källsystemet. Verifikationen kompenserar för hoppade verifikationer så att dina
                    balansräkning och resultaträkning stämmer.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Retry info (only shown if retries happened) */}
          {d && d.retriedBatches > 0 && (
            <p className="text-xs text-muted-foreground">
              {d.retriedBatches} {d.retriedBatches === 1 ? 'batch' : 'batcher'} behövde omförsök
              {d.failedBatches > 0 && (
                <span className="text-destructive">
                  {' · '}{d.failedBatches} misslyckades trots omförsök
                </span>
              )}
            </p>
          )}
        </div>
      )}
    </div>
  )
}

function ResultStep({
  results,
  sieResults,
  error,
  onDone,
  onRetry,
}: {
  results: MigrationResults | null
  sieResults: ImportResult[]
  error: string | null
  onDone: () => void
  onRetry: () => void
}) {
  if (error) {
    return (
      <div className="space-y-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex gap-3 rounded-lg border border-destructive/20 bg-destructive/10 p-4">
              <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
              <div>
                <p className="text-base font-medium text-destructive">Migreringen misslyckades</p>
                <p className="mt-1 text-sm text-muted-foreground">{error}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-between">
          <Button variant="outline" className="min-h-11" onClick={onDone}>Klar</Button>
          <Button className="min-h-11" onClick={onRetry}>
            <RotateCcw className="mr-2 h-4 w-4" />
            Försök igen
          </Button>
        </div>
      </div>
    )
  }

  const hasResults = results || sieResults.length > 0
  if (!hasResults) return null

  // Compute combined SIE stats
  const totalJournalEntries = sieResults.reduce((sum, r) => sum + r.journalEntriesCreated, 0)
  const totalErrors = sieResults.reduce((sum, r) => sum + r.errors.length, 0)
  const totalSkipped = sieResults.reduce((sum, r) => (r.details?.skippedVouchers?.total || 0) + sum, 0)
  const allSieSucceeded = sieResults.length > 0 && sieResults.every(r => r.success)
  const anySieFailed = sieResults.some(r => r.errors.length > 0 && r.journalEntriesCreated === 0)

  // Overall status
  const overallIcon = anySieFailed ? 'error' as const :
    (!allSieSucceeded || totalErrors > 0) ? 'warning' as const : 'success' as const

  return (
    <div className="space-y-4">
      {/* ── Header card with overall summary ── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2.5">
            <StatusIcon status={overallIcon} />
            {anySieFailed ? 'Migrering delvis genomförd' :
             !allSieSucceeded ? 'Migrering klar med anmärkningar' :
             'Migrering klar'}
          </CardTitle>
          <CardDescription className="text-sm">
            {totalJournalEntries > 0 && (
              <>
                <span className="tabular-nums font-medium text-foreground">
                  {totalJournalEntries.toLocaleString('sv-SE')}
                </span>
                {' verifikationer importerade'}
                {sieResults.length > 1 && ` över ${sieResults.length} räkenskapsår`}
                {totalSkipped > 0 && (
                  <span className="text-amber-600">
                    {' · '}{totalSkipped} hoppade över
                  </span>
                )}
              </>
            )}
          </CardDescription>
        </CardHeader>
      </Card>

      {/* ── Per-fiscal-year SIE breakdown ── */}
      {sieResults.length > 0 && (
        <div className="space-y-2">
          <h3 className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <Database className="h-4 w-4" />
            Bokföringsdata (SIE)
          </h3>
          <div className="space-y-2">
            {sieResults.map((r, i) => (
              <FiscalYearResult key={i} result={r} index={i} />
            ))}
          </div>
        </div>
      )}

      {/* ── API import results (company info, customers, etc.) ── */}
      {results && (
        <div className="space-y-2">
          <h3 className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <FileText className="h-4 w-4" />
            Övriga data
          </h3>
          <div className="grid gap-2 sm:grid-cols-2">
            {results.companyInfo && (
              <EntityResultRow
                icon={<Building2 className="h-4 w-4" />}
                label="Företagsinformation"
                status={results.companyInfo.imported ? 'success' : 'skipped'}
                statusText={results.companyInfo.imported ? 'Importerad' : 'Hoppades över'}
              />
            )}
            {results.customers && (
              <EntityResultRow
                icon={<Users className="h-4 w-4" />}
                label="Kunder"
                status="success"
                statusText={`${results.customers.imported} importerade`}
                detail={results.customers.skipped > 0 ? `${results.customers.skipped} fanns redan` : undefined}
              />
            )}
            {results.suppliers && (
              <EntityResultRow
                icon={<Truck className="h-4 w-4" />}
                label="Leverantörer"
                status="success"
                statusText={`${results.suppliers.imported} importerade`}
                detail={results.suppliers.skipped > 0 ? `${results.suppliers.skipped} fanns redan` : undefined}
              />
            )}
            {results.salesInvoices && (
              <EntityResultRow
                icon={<FileText className="h-4 w-4" />}
                label="Kundfakturor"
                status="success"
                statusText={`${results.salesInvoices.imported} importerade`}
                detail={results.salesInvoices.skipped > 0 ? `${results.salesInvoices.skipped} hoppades över` : undefined}
              />
            )}
            {results.supplierInvoices && (
              <EntityResultRow
                icon={<FileText className="h-4 w-4" />}
                label="Leverantörsfakturor"
                status="success"
                statusText={`${results.supplierInvoices.imported} importerade`}
                detail={results.supplierInvoices.skipped > 0 ? `${results.supplierInvoices.skipped} hoppades över` : undefined}
              />
            )}
          </div>
        </div>
      )}

      {/* ── Next steps ── */}
      <Card className="bg-muted/50">
        <CardHeader>
          <CardTitle className="text-base">Nästa steg</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-start gap-3">
            <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-medium text-primary-foreground">
              1
            </div>
            <div>
              <p className="font-medium">Granska importerade verifikationer</p>
              <p className="text-sm text-muted-foreground">Kontrollera att bokföringen ser korrekt ut i huvudboken</p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-medium text-primary-foreground">
              2
            </div>
            <div>
              <p className="font-medium">Stäm av balansräkningen</p>
              <p className="text-sm text-muted-foreground">Jämför ingående balanser och saldon mot ditt tidigare system</p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-medium text-primary-foreground">
              3
            </div>
            <div>
              <p className="font-medium">Kontrollera kunder och leverantörer</p>
              <p className="text-sm text-muted-foreground">Verifiera kontaktuppgifter, organisationsnummer och bankinfo</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-between">
        <Button variant="outline" className="min-h-11" onClick={onDone}>
          <RotateCcw className="mr-2 h-4 w-4" />
          Ny migrering
        </Button>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button variant="outline" className="min-h-11" asChild>
            <Link href="/customers">
              Visa kunder
              <ExternalLink className="ml-2 h-4 w-4" />
            </Link>
          </Button>
          <Button className="min-h-11" asChild>
            <Link href="/bookkeeping">
              Visa bokföring
              <ExternalLink className="ml-2 h-4 w-4" />
            </Link>
          </Button>
        </div>
      </div>
    </div>
  )
}

/** Simple row for non-SIE entity results (customers, invoices, etc.) */
function EntityResultRow({
  icon,
  label,
  status,
  statusText,
  detail,
}: {
  icon: React.ReactNode
  label: string
  status: 'success' | 'skipped'
  statusText: string
  detail?: string
}) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-border p-3">
      <div className="text-muted-foreground">{icon}</div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium">{label}</p>
        <p className="text-sm text-muted-foreground">{statusText}</p>
        {detail && <p className="text-sm text-muted-foreground/70">{detail}</p>}
      </div>
      <StatusIcon status={status === 'success' ? 'success' : 'warning'} />
    </div>
  )
}

// ── Main wizard ─────────────────────────────────────────────────

export default function ArcimMigrationWorkspace(_props: WorkspaceComponentProps) {
  const { toast } = useToast()

  const [step, setStep] = useState<WizardStep>('provider')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Connection state
  const [selectedProvider, setSelectedProvider] = useState<ArcimProvider | null>(null)
  const [consentId, setConsentId] = useState<string | null>(null)
  const [authUrl, setAuthUrl] = useState<string | null>(null)
  const [authType, setAuthType] = useState<'oauth' | 'token' | null>(null)

  // Preview state
  const [preview, setPreview] = useState<PreviewData | null>(null)

  // SIE data state (held between mapping and execution steps)
  const [sieData, setSieData] = useState<SIEData | null>(null)

  // Options state
  const [migrationOptions, setMigrationOptions] = useState<MigrationOptions>(DEFAULT_OPTIONS)

  // Migration state
  const [migrationStep, setMigrationStep] = useState('')
  const [migrationProgress, setMigrationProgress] = useState(0)
  const [migrationResults, setMigrationResults] = useState<MigrationResults | null>(null)
  const [sieImportResults, setSieImportResults] = useState<ImportResult[]>([])

  // Wizard progress — only user-interactive steps
  const userSteps = STEPS.filter(s => {
    if (s === 'migrating' || s === 'result') return false
    if (s === 'mapping' && !preview?.sieAvailable) return false
    return true
  })
  const currentUserStepIndex = userSteps.indexOf(step)
  const isInteractiveStep = currentUserStepIndex !== -1
  const progressPercent = isInteractiveStep
    ? ((currentUserStepIndex + 1) / userSteps.length) * 100
    : 100

  // ── Step handlers ──────────────────────────────────────────────

  const loadPreview = useCallback(async (cId: string) => {
    setStep('preview')
    setIsLoading(true)
    setError(null)

    try {
      const res = await fetch(`/api/extensions/ext/arcim-migration/preview?consentId=${cId}`)
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || `HTTP ${res.status}`)
      }

      const data = await res.json()
      setPreview(data)
      setConsentId(cId)

      // If SIE is not available, disable SIE import by default
      if (!data.sieAvailable) {
        setMigrationOptions(prev => ({ ...prev, importSIEData: false }))
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Kunde inte hämta förhandsgranskning')
    } finally {
      setIsLoading(false)
    }
  }, [])

  const handleSelectProvider = useCallback(async (provider: ArcimProvider) => {
    setSelectedProvider(provider)
    setStep('connect')
    setIsLoading(true)
    setError(null)

    try {
      const res = await fetch('/api/extensions/ext/arcim-migration/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider }),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || `HTTP ${res.status}`)
      }

      const data = await res.json()
      setConsentId(data.consentId)
      setAuthType(data.authType)

      if (data.authType === 'oauth' && data.authUrl) {
        setAuthUrl(data.authUrl)
      }
      // Token-based providers stay on connect step for credential input
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Anslutning misslyckades')
    } finally {
      setIsLoading(false)
    }
  }, [])

  // Handle token submission for token-based providers (Bokio, etc.)
  const handleTokenSubmit = useCallback(async (apiToken: string, companyId: string) => {
    if (!consentId || !selectedProvider) return

    setIsLoading(true)
    setError(null)

    try {
      const res = await fetch('/api/extensions/ext/arcim-migration/submit-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          consentId,
          provider: selectedProvider,
          apiToken,
          companyId: companyId || undefined,
        }),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || `HTTP ${res.status}`)
      }

      // Token stored — consent is now accepted, proceed to preview
      await loadPreview(consentId)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Kunde inte ansluta')
    } finally {
      setIsLoading(false)
    }
  }, [consentId, selectedProvider, loadPreview])

  // Handle OAuth callback via URL params
  const handleOAuthReturn = useCallback(async () => {
    // Check URL for migration callback params
    const url = new URL(window.location.href)
    const migrationStatus = url.searchParams.get('migration')
    const callbackConsentId = url.searchParams.get('consentId')

    if (migrationStatus === 'connected' && callbackConsentId) {
      // Clean URL
      url.searchParams.delete('migration')
      url.searchParams.delete('consentId')
      window.history.replaceState({}, '', url.pathname)

      await loadPreview(callbackConsentId)
    } else if (migrationStatus === 'error') {
      const callbackProvider = url.searchParams.get('provider') as ArcimProvider | null
      url.searchParams.delete('migration')
      url.searchParams.delete('provider')
      window.history.replaceState({}, '', url.pathname)
      setError('OAuth-anslutningen misslyckades. Försök igen.')
      if (callbackProvider) {
        setSelectedProvider(callbackProvider)
        setStep('connect')
      } else {
        setStep('provider')
      }
    }
  }, [loadPreview])

  // Check for OAuth callback on mount
  useEffect(() => {
    handleOAuthReturn()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Load SIE data when entering mapping step
  const loadSIEData = useCallback(async () => {
    if (!consentId) return

    setStep('mapping')
    setIsLoading(true)
    setError(null)

    try {
      const res = await fetch(`/api/extensions/ext/arcim-migration/sie-data?consentId=${consentId}`)
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || `HTTP ${res.status}`)
      }

      const data = await res.json()
      setSieData(data)

      // Auto-skip mapping step if all accounts are mapped
      if (data.mappingStats.unmapped === 0) {
        setStep('options')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Kunde inte hämta SIE-data')
    } finally {
      setIsLoading(false)
    }
  }, [consentId])

  const handlePreviewContinue = useCallback(() => {
    if (preview?.sieAvailable) {
      // Load SIE data for mapping step
      loadSIEData()
    } else {
      // Skip mapping step — no SIE available
      setStep('options')
    }
  }, [preview, loadSIEData])

  const handleMappingChange = useCallback((sourceAccount: string, targetAccount: string, targetName: string) => {
    if (!sieData) return

    const updatedMappings = sieData.mappings.map(m =>
      m.sourceAccount === sourceAccount
        ? { ...m, targetAccount, targetName, isOverride: true, matchType: 'manual' as const, confidence: 1 }
        : m
    )
    setSieData(prev => prev ? {
      ...prev,
      mappings: updatedMappings,
      mappingStats: {
        ...prev.mappingStats,
        unmapped: updatedMappings.filter(m => !m.targetAccount).length,
        mapped: updatedMappings.filter(m => m.targetAccount).length,
      },
    } : null)
  }, [sieData])

  const handleStartMigration = useCallback(async () => {
    if (!consentId) return

    setStep('migrating')
    setMigrationStep('Startar migrering...')
    setMigrationProgress(5)
    setError(null)

    try {
      // ── Phase 1: SIE import ──────────────────────────────────
      if (migrationOptions.importSIEData && sieData && sieData.rawContent.length > 0) {
        setMigrationStep('Importerar bokföringsdata (SIE)...')
        setMigrationProgress(10)
        setSieImportResults([])

        // Import all fiscal years' SIE content
        for (let i = 0; i < sieData.rawContent.length; i++) {
          const progress = 10 + Math.round((i / sieData.rawContent.length) * 40)
          setMigrationProgress(progress)
          setMigrationStep(`Importerar bokföringsdata (SIE) — fil ${i + 1} av ${sieData.rawContent.length}...`)

          const res = await fetch('/api/extensions/ext/arcim-migration/import-sie', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              rawContent: sieData.rawContent[i],
              mappings: sieData.mappings,
              options: {
                createFiscalPeriod: true,
                importOpeningBalances: true,
                importTransactions: true,
                voucherSeries: migrationOptions.voucherSeries,
              },
            }),
          })

          if (!res.ok) {
            const data = await res.json().catch(() => ({}))
            throw new Error(data.error || `SIE import HTTP ${res.status}`)
          }

          const result = await res.json() as ImportResult
          setSieImportResults(prev => [...prev, result])

          if (!result.success && result.errors.length > 0) {
            // Log but don't fail — continue with API import
            // Non-critical — continue with API import
          }
        }
      }

      // ── Phase 2: API import (customers, suppliers, invoices) ──
      const hasApiImport = migrationOptions.importCompanyInfo ||
        migrationOptions.importCustomers ||
        migrationOptions.importSuppliers ||
        migrationOptions.importSalesInvoices ||
        migrationOptions.importSupplierInvoices

      if (hasApiImport) {
        setMigrationStep('Importerar kunder, leverantörer och fakturor...')
        setMigrationProgress(55)

        const res = await fetch('/api/extensions/ext/arcim-migration/migrate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            consentId,
            importCompanyInfo: migrationOptions.importCompanyInfo,
            importCustomers: migrationOptions.importCustomers,
            importSuppliers: migrationOptions.importSuppliers,
            importSalesInvoices: migrationOptions.importSalesInvoices,
            importSupplierInvoices: migrationOptions.importSupplierInvoices,
          }),
        })

        if (!res.ok) {
          const data = await res.json().catch(() => ({}))
          throw new Error(data.error || `HTTP ${res.status}`)
        }

        const data = await res.json()
        setMigrationResults(data.results)
      }

      setMigrationProgress(100)
      setStep('result')

      toast({
        title: 'Migrering klar',
        description: 'Din bokföringsdata har importerats.',
      })
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Migrering misslyckades'
      setError(msg)
      setStep('result')
    }
  }, [consentId, migrationOptions, sieData, toast])

  const handleDone = useCallback(() => {
    // Reset wizard
    setStep('provider')
    setSelectedProvider(null)
    setConsentId(null)
    setAuthUrl(null)
    setAuthType(null)
    setPreview(null)
    setSieData(null)
    setMigrationOptions(DEFAULT_OPTIONS)
    setMigrationResults(null)
    setSieImportResults([])
    setError(null)
  }, [])

  // ── Render ─────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Progress bar — only during interactive steps */}
      {step !== 'provider' && isInteractiveStep && (
        <Card>
          <CardContent className="pt-6">
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="sm:hidden text-primary font-medium">
                  Steg {currentUserStepIndex + 1}/{userSteps.length}: {STEP_LABELS[step]}
                </span>
                {userSteps.map((s) => (
                  <span
                    key={s}
                    className={cn(
                      'hidden sm:inline',
                      userSteps.indexOf(s) <= currentUserStepIndex ? 'font-medium text-primary' : 'text-muted-foreground'
                    )}
                  >
                    {STEP_LABELS[s]}
                  </span>
                ))}
              </div>
              <Progress value={progressPercent} className="h-2" />
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step content */}
      {step === 'provider' && (
        <ProviderStep onSelect={handleSelectProvider} />
      )}

      {step === 'connect' && selectedProvider && (
        <ConnectStep
          provider={selectedProvider}
          authType={authType}
          isLoading={isLoading}
          error={error}
          authUrl={authUrl}
          consentId={consentId}
          onTokenSubmit={handleTokenSubmit}
          onBack={() => {
            setStep('provider')
            setError(null)
          }}
        />
      )}

      {step === 'preview' && (
        <PreviewStep
          preview={preview}
          isLoading={isLoading}
          error={error}
          onContinue={handlePreviewContinue}
          onBack={() => setStep('provider')}
        />
      )}

      {step === 'mapping' && (
        <MappingStep
          sieData={sieData}
          isLoading={isLoading}
          error={error}
          onMappingChange={handleMappingChange}
          onContinue={() => setStep('options')}
          onBack={() => setStep('preview')}
        />
      )}

      {step === 'options' && (
        <OptionsStep
          options={migrationOptions}
          sieAvailable={preview?.sieAvailable ?? false}
          onChange={setMigrationOptions}
          onStart={handleStartMigration}
          onBack={() => preview?.sieAvailable ? setStep('mapping') : setStep('preview')}
        />
      )}

      {step === 'migrating' && (
        <MigratingStep currentStep={migrationStep} progress={migrationProgress} />
      )}

      {step === 'result' && (
        <ResultStep
          results={migrationResults}
          sieResults={sieImportResults}
          error={error}
          onDone={handleDone}
          onRetry={() => {
            setError(null)
            setStep('options')
          }}
        />
      )}
    </div>
  )
}
