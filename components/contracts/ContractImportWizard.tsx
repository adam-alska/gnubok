'use client'

import { useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useToast } from '@/components/ui/use-toast'
import { ConfidenceIndicator, ConfidenceField } from './ConfidenceIndicator'
import { ExtractionStatusBadge } from './ExtractionStatusBadge'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'
import type {
  ContractExtractionResult,
  CustomerMatchResult,
  Customer,
  ExtractionStatus,
  ConfidenceLevel,
  ExclusivityConflict,
} from '@/types'
import {
  Upload,
  FileText,
  ArrowRight,
  ArrowLeft,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  Users,
  Package,
  Shield,
  Check,
  Plus,
  X,
  Building2,
} from 'lucide-react'

// Step indicators
const STEPS = [
  { id: 1, title: 'Uppladdning', icon: Upload },
  { id: 2, title: 'Granska data', icon: FileText },
  { id: 3, title: 'Kund', icon: Users },
  { id: 4, title: 'Innehåll', icon: Package },
  { id: 5, title: 'Exklusivitet', icon: Shield },
  { id: 6, title: 'Bekräfta', icon: Check },
]

interface ContractImportWizardProps {
  customers: Customer[]
}

export function ContractImportWizard({ customers }: ContractImportWizardProps) {
  const router = useRouter()
  const { toast } = useToast()
  const supabase = createClient()

  // Wizard state
  const [step, setStep] = useState(1)
  const [isLoading, setIsLoading] = useState(false)

  // Upload state
  const [uploadedFile, setUploadedFile] = useState<File | null>(null)
  const [contractId, setContractId] = useState<string | null>(null)
  const [extractionStatus, setExtractionStatus] = useState<ExtractionStatus>('pending')

  // Extraction state
  const [extraction, setExtraction] = useState<ContractExtractionResult | null>(null)
  const [brandMatch, setBrandMatch] = useState<CustomerMatchResult | null>(null)
  const [agencyMatch, setAgencyMatch] = useState<CustomerMatchResult | null>(null)

  // Form state (editable)
  const [editedExtraction, setEditedExtraction] = useState<Partial<ContractExtractionResult>>({})
  const [selectedBrandId, setSelectedBrandId] = useState<string | null>(null)
  const [selectedAgencyId, setSelectedAgencyId] = useState<string | null>(null)
  const [createNewBrand, setCreateNewBrand] = useState(false)
  const [createNewAgency, setCreateNewAgency] = useState(false)
  const [newBrandName, setNewBrandName] = useState('')
  const [newAgencyName, setNewAgencyName] = useState('')

  // Conflict state
  const [exclusivityConflicts, setExclusivityConflicts] = useState<ExclusivityConflict[]>([])

  // Get merged extraction (original + edits)
  const mergedExtraction = extraction ? { ...extraction, ...editedExtraction } : null

  // Handle file upload
  const handleFileUpload = useCallback(async (file: File) => {
    if (!file.type.includes('pdf')) {
      toast({
        title: 'Fel',
        description: 'Endast PDF-filer stöds',
        variant: 'destructive',
      })
      return
    }

    setUploadedFile(file)
    setIsLoading(true)
    setExtractionStatus('processing')

    try {
      // Upload to Supabase Storage
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Not authenticated')

      const filePath = `${user.id}/${Date.now()}-${file.name}`
      const { error: uploadError } = await supabase.storage
        .from('contracts')
        .upload(filePath, file)

      if (uploadError) throw uploadError

      // Create contract record (without campaign for now)
      const { data: contract, error: contractError } = await supabase
        .from('contracts')
        .insert({
          user_id: user.id,
          filename: file.name,
          file_path: filePath,
          file_size: file.size,
          mime_type: file.type,
          extraction_status: 'processing',
        })
        .select()
        .single()

      if (contractError) throw contractError

      setContractId(contract.id)

      // Trigger extraction
      const response = await fetch(`/api/contracts/${contract.id}/extract`, {
        method: 'POST',
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || 'Extraction failed')
      }

      setExtraction(result.data.extraction)
      setBrandMatch(result.data.customerMatches.brandMatch)
      setAgencyMatch(result.data.customerMatches.agencyMatch)
      setExtractionStatus('completed')

      // Pre-fill customer selections based on matches
      if (result.data.customerMatches.brandMatch?.matchType === 'exact') {
        setSelectedBrandId(result.data.customerMatches.brandMatch.customer.id)
      }
      if (result.data.customerMatches.agencyMatch?.matchType === 'exact') {
        setSelectedAgencyId(result.data.customerMatches.agencyMatch.customer.id)
      }

      // Pre-fill new customer names from extraction
      if (result.data.extraction.parties.brand) {
        setNewBrandName(result.data.extraction.parties.brand.name)
      }
      if (result.data.extraction.parties.agency) {
        setNewAgencyName(result.data.extraction.parties.agency.name)
      }

      toast({
        title: 'Analys klar',
        description: 'Avtalet har analyserats. Granska och bekräfta uppgifterna.',
      })

      // Auto-advance to step 2
      setStep(2)
    } catch (error) {
      setExtractionStatus('failed')
      toast({
        title: 'Fel vid analys',
        description: error instanceof Error ? error.message : 'Kunde inte analysera avtalet',
        variant: 'destructive',
      })
    } finally {
      setIsLoading(false)
    }
  }, [supabase, toast])

  // Handle file drop
  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    const file = e.dataTransfer.files[0]
    if (file) handleFileUpload(file)
  }, [handleFileUpload])

  // Handle file input change
  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) handleFileUpload(file)
  }, [handleFileUpload])

  // Update extraction field
  const updateField = (path: string, value: unknown) => {
    setEditedExtraction(prev => {
      const updated = { ...prev }
      const keys = path.split('.')
      let current: Record<string, unknown> = updated

      for (let i = 0; i < keys.length - 1; i++) {
        if (!current[keys[i]]) current[keys[i]] = {}
        current = current[keys[i]] as Record<string, unknown>
      }

      current[keys[keys.length - 1]] = value
      return updated
    })
  }

  // Create campaign from extraction
  const handleCreateCampaign = async () => {
    if (!contractId || !mergedExtraction) return

    setIsLoading(true)

    try {
      const payload: Record<string, unknown> = {
        contractId,
        extraction: mergedExtraction,
        brandName: newBrandName || mergedExtraction.parties.brand?.name || null,
        customerId: selectedAgencyId,
        endCustomerId: null,
      }

      // Add new customer data if creating agency as new customer
      if (createNewAgency && newAgencyName) {
        payload.createNewCustomer = {
          name: newAgencyName,
          org_number: mergedExtraction.parties.agency?.orgNumber,
          email: mergedExtraction.parties.agency?.email,
          customer_type: 'swedish_business',
        }
        payload.customerId = null
      }

      const response = await fetch('/api/campaigns/from-contract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || 'Failed to create campaign')
      }

      if (result.data.exclusivityConflicts?.length > 0) {
        setExclusivityConflicts(result.data.exclusivityConflicts)
      }

      toast({
        title: 'Samarbete skapat!',
        description: `${result.data.deliverablesCreated} innehåll och ${result.data.deadlinesCreated} deadlines skapades.`,
      })

      // Navigate to campaign
      router.push(`/campaigns/${result.data.campaign.id}`)
    } catch (error) {
      toast({
        title: 'Fel',
        description: error instanceof Error ? error.message : 'Kunde inte skapa samarbete',
        variant: 'destructive',
      })
    } finally {
      setIsLoading(false)
    }
  }

  // Render step content
  const renderStepContent = () => {
    switch (step) {
      case 1:
        return <Step1Upload
          uploadedFile={uploadedFile}
          extractionStatus={extractionStatus}
          isLoading={isLoading}
          onDrop={handleDrop}
          onFileChange={handleFileChange}
        />

      case 2:
        return <Step2ReviewData
          extraction={mergedExtraction}
          onUpdateField={updateField}
        />

      case 3:
        return <Step3CustomerMatch
          brandMatch={brandMatch}
          agencyMatch={agencyMatch}
          customers={customers}
          selectedBrandId={selectedBrandId}
          selectedAgencyId={selectedAgencyId}
          createNewBrand={createNewBrand}
          createNewAgency={createNewAgency}
          newBrandName={newBrandName}
          newAgencyName={newAgencyName}
          onSelectBrand={setSelectedBrandId}
          onSelectAgency={setSelectedAgencyId}
          onToggleCreateBrand={setCreateNewBrand}
          onToggleCreateAgency={setCreateNewAgency}
          onNewBrandNameChange={setNewBrandName}
          onNewAgencyNameChange={setNewAgencyName}
          extraction={mergedExtraction}
        />

      case 4:
        return <Step4Deliverables
          extraction={mergedExtraction}
          onUpdateField={updateField}
        />

      case 5:
        return <Step5Exclusivity
          extraction={mergedExtraction}
          onUpdateField={updateField}
          conflicts={exclusivityConflicts}
        />

      case 6:
        return <Step6Confirm
          extraction={mergedExtraction}
          selectedAgencyId={selectedAgencyId}
          createNewAgency={createNewAgency}
          newBrandName={newBrandName}
          newAgencyName={newAgencyName}
          customers={customers}
        />

      default:
        return null
    }
  }

  return (
    <div className="max-w-4xl mx-auto">
      {/* Step indicators */}
      <nav className="mb-8">
        <ol className="flex items-center justify-between">
          {STEPS.map((s, index) => {
            const Icon = s.icon
            const isActive = s.id === step
            const isCompleted = s.id < step

            return (
              <li key={s.id} className="flex items-center">
                <button
                  onClick={() => s.id < step && setStep(s.id)}
                  disabled={s.id > step}
                  className={cn(
                    'flex flex-col items-center',
                    s.id <= step ? 'cursor-pointer' : 'cursor-not-allowed opacity-50'
                  )}
                >
                  <div
                    className={cn(
                      'flex items-center justify-center w-10 h-10 rounded-full border-2 transition-colors',
                      isActive && 'border-primary bg-primary text-primary-foreground',
                      isCompleted && 'border-green-500 bg-green-500 text-white',
                      !isActive && !isCompleted && 'border-muted-foreground/30'
                    )}
                  >
                    {isCompleted ? (
                      <CheckCircle2 className="h-5 w-5" />
                    ) : (
                      <Icon className="h-5 w-5" />
                    )}
                  </div>
                  <span className={cn(
                    'mt-2 text-xs font-medium',
                    isActive ? 'text-primary' : 'text-muted-foreground'
                  )}>
                    {s.title}
                  </span>
                </button>

                {index < STEPS.length - 1 && (
                  <div
                    className={cn(
                      'flex-1 h-0.5 mx-4',
                      isCompleted ? 'bg-green-500' : 'bg-muted-foreground/20'
                    )}
                  />
                )}
              </li>
            )
          })}
        </ol>
      </nav>

      {/* Step content */}
      <div className="bg-card rounded-lg border p-6 min-h-[400px]">
        {renderStepContent()}
      </div>

      {/* Navigation buttons */}
      <div className="flex justify-between mt-6">
        <Button
          variant="outline"
          onClick={() => setStep(s => s - 1)}
          disabled={step === 1 || isLoading}
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Tillbaka
        </Button>

        {step < 6 ? (
          <Button
            onClick={() => setStep(s => s + 1)}
            disabled={step === 1 && !extraction || isLoading}
          >
            Nästa
            <ArrowRight className="h-4 w-4 ml-2" />
          </Button>
        ) : (
          <Button
            onClick={handleCreateCampaign}
            disabled={isLoading}
          >
            {isLoading ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Skapar...
              </>
            ) : (
              <>
                <Check className="h-4 w-4 mr-2" />
                Skapa samarbete
              </>
            )}
          </Button>
        )}
      </div>
    </div>
  )
}

// Step 1: Upload
function Step1Upload({
  uploadedFile,
  extractionStatus,
  isLoading,
  onDrop,
  onFileChange,
}: {
  uploadedFile: File | null
  extractionStatus: ExtractionStatus
  isLoading: boolean
  onDrop: (e: React.DragEvent) => void
  onFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void
}) {
  return (
    <div className="flex flex-col items-center justify-center h-full py-12">
      <h2 className="text-xl font-semibold mb-2">Ladda upp avtal</h2>
      <p className="text-muted-foreground mb-8 text-center">
        Ladda upp en PDF-fil så analyserar vi innehållet automatiskt med AI
      </p>

      {!uploadedFile ? (
        <div
          onDrop={onDrop}
          onDragOver={(e) => e.preventDefault()}
          className="border-2 border-dashed rounded-lg p-12 text-center hover:border-primary transition-colors cursor-pointer w-full max-w-md"
        >
          <input
            type="file"
            accept="application/pdf"
            onChange={onFileChange}
            className="hidden"
            id="file-upload"
          />
          <label htmlFor="file-upload" className="cursor-pointer">
            <Upload className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
            <p className="font-medium mb-1">Dra och släpp PDF-fil här</p>
            <p className="text-sm text-muted-foreground">eller klicka för att välja fil</p>
          </label>
        </div>
      ) : (
        <div className="text-center">
          <div className="flex items-center gap-3 p-4 border rounded-lg mb-4">
            <FileText className="h-8 w-8 text-primary" />
            <div className="text-left">
              <p className="font-medium">{uploadedFile.name}</p>
              <p className="text-sm text-muted-foreground">
                {(uploadedFile.size / 1024).toFixed(1)} KB
              </p>
            </div>
            <ExtractionStatusBadge status={extractionStatus} />
          </div>

          {isLoading && (
            <div className="flex items-center justify-center gap-2 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>Analyserar avtal med AI...</span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// Step 2: Review extracted data
function Step2ReviewData({
  extraction,
  onUpdateField,
}: {
  extraction: ContractExtractionResult | null
  onUpdateField: (path: string, value: unknown) => void
}) {
  if (!extraction) return null

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold mb-1">Granska extraherad data</h2>
        <p className="text-muted-foreground text-sm">
          Verifiera och justera informationen som extraherats från avtalet
        </p>
      </div>

      {/* Campaign name */}
      <ConfidenceField
        label="Namn på samarbete"
        confidence={extraction.confidence.parties as ConfidenceLevel || 'medium'}
      >
        <Input
          value={extraction.campaignName || ''}
          onChange={(e) => onUpdateField('campaignName', e.target.value)}
          placeholder="Ange namn på samarbetet"
        />
      </ConfidenceField>

      {/* Financials */}
      <div className="grid grid-cols-2 gap-4">
        <ConfidenceField
          label="Belopp"
          confidence={extraction.confidence.financials as ConfidenceLevel}
        >
          <Input
            type="number"
            value={extraction.financials.amount || ''}
            onChange={(e) => onUpdateField('financials.amount', parseFloat(e.target.value))}
            placeholder="0"
          />
        </ConfidenceField>

        <ConfidenceField
          label="Valuta"
          confidence={extraction.confidence.financials as ConfidenceLevel}
        >
          <Select
            value={extraction.financials.currency}
            onValueChange={(v) => onUpdateField('financials.currency', v)}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="SEK">SEK</SelectItem>
              <SelectItem value="EUR">EUR</SelectItem>
              <SelectItem value="USD">USD</SelectItem>
            </SelectContent>
          </Select>
        </ConfidenceField>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <ConfidenceField
          label="Moms inkluderad"
          confidence={extraction.confidence.financials as ConfidenceLevel}
        >
          <Select
            value={extraction.financials.vatIncluded === true ? 'true' : extraction.financials.vatIncluded === false ? 'false' : ''}
            onValueChange={(v) => onUpdateField('financials.vatIncluded', v === 'true')}
          >
            <SelectTrigger>
              <SelectValue placeholder="Välj..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="true">Ja</SelectItem>
              <SelectItem value="false">Nej</SelectItem>
            </SelectContent>
          </Select>
        </ConfidenceField>

        <ConfidenceField
          label="Betalningsvillkor (dagar)"
          confidence={extraction.confidence.financials as ConfidenceLevel}
        >
          <Input
            type="number"
            value={extraction.financials.paymentTerms || ''}
            onChange={(e) => onUpdateField('financials.paymentTerms', parseInt(e.target.value))}
            placeholder="30"
          />
        </ConfidenceField>
      </div>

      {/* Period */}
      <div className="grid grid-cols-2 gap-4">
        <ConfidenceField
          label="Publiceringsdatum"
          confidence={extraction.confidence.period as ConfidenceLevel}
        >
          <Input
            type="date"
            value={extraction.period.publicationDate || ''}
            onChange={(e) => onUpdateField('period.publicationDate', e.target.value)}
          />
        </ConfidenceField>

        <ConfidenceField
          label="Utkastdeadline"
          confidence={extraction.confidence.period as ConfidenceLevel}
        >
          <Input
            type="date"
            value={extraction.period.draftDeadline || ''}
            onChange={(e) => onUpdateField('period.draftDeadline', e.target.value)}
          />
        </ConfidenceField>
      </div>

      {/* Usage rights */}
      <div className="grid grid-cols-3 gap-4">
        <ConfidenceField
          label="Användningsrätt"
          confidence={extraction.confidence.rights as ConfidenceLevel}
        >
          <Select
            value={extraction.rights.usageType || ''}
            onValueChange={(v) => onUpdateField('rights.usageType', v)}
          >
            <SelectTrigger>
              <SelectValue placeholder="Välj..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="organic">Organiskt</SelectItem>
              <SelectItem value="paid">Betald annonsering</SelectItem>
              <SelectItem value="both">Båda</SelectItem>
            </SelectContent>
          </Select>
        </ConfidenceField>

        <ConfidenceField
          label="Användningstid (månader)"
          confidence={extraction.confidence.rights as ConfidenceLevel}
        >
          <Input
            type="number"
            value={extraction.rights.usagePeriodMonths || ''}
            onChange={(e) => onUpdateField('rights.usagePeriodMonths', parseInt(e.target.value))}
            placeholder="12"
          />
        </ConfidenceField>

        <ConfidenceField
          label="Äganderätt"
          confidence={extraction.confidence.rights as ConfidenceLevel}
        >
          <Select
            value={extraction.rights.ownership || ''}
            onValueChange={(v) => onUpdateField('rights.ownership', v)}
          >
            <SelectTrigger>
              <SelectValue placeholder="Välj..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="influencer">Influencer</SelectItem>
              <SelectItem value="client">Kund</SelectItem>
            </SelectContent>
          </Select>
        </ConfidenceField>
      </div>
    </div>
  )
}

// Step 3: Customer matching
function Step3CustomerMatch({
  brandMatch,
  agencyMatch,
  customers,
  selectedBrandId,
  selectedAgencyId,
  createNewBrand,
  createNewAgency,
  newBrandName,
  newAgencyName,
  onSelectBrand,
  onSelectAgency,
  onToggleCreateBrand,
  onToggleCreateAgency,
  onNewBrandNameChange,
  onNewAgencyNameChange,
  extraction,
}: {
  brandMatch: CustomerMatchResult | null
  agencyMatch: CustomerMatchResult | null
  customers: Customer[]
  selectedBrandId: string | null
  selectedAgencyId: string | null
  createNewBrand: boolean
  createNewAgency: boolean
  newBrandName: string
  newAgencyName: string
  onSelectBrand: (id: string | null) => void
  onSelectAgency: (id: string | null) => void
  onToggleCreateBrand: (v: boolean) => void
  onToggleCreateAgency: (v: boolean) => void
  onNewBrandNameChange: (v: string) => void
  onNewAgencyNameChange: (v: string) => void
  extraction: ContractExtractionResult | null
}) {
  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-xl font-semibold mb-1">Varumärke & Byrå</h2>
        <p className="text-muted-foreground text-sm">
          Ange varumärket du skapar innehåll för och byrån/uppdragsgivaren som faktureras
        </p>
      </div>

      {/* Brand - free text field */}
      <div className="space-y-4">
        <h3 className="font-medium flex items-center gap-2">
          Varumärke
        </h3>
        <p className="text-sm text-muted-foreground">
          Varumärket som samarbetet gäller (den du skapar innehåll för)
        </p>

        {brandMatch && (
          <CustomerMatchCard
            match={brandMatch}
            extractedParty={extraction?.parties.brand}
          />
        )}

        <div className="space-y-2">
          <Label>Varumärkesnamn</Label>
          <Input
            value={newBrandName}
            onChange={(e) => onNewBrandNameChange(e.target.value)}
            placeholder="T.ex. Nike, Adidas..."
          />
        </div>
      </div>

      {/* Agency / Customer - the one who pays */}
      <div className="space-y-4 pt-4 border-t">
        <h3 className="font-medium flex items-center gap-2">
          <Building2 className="h-4 w-4" />
          Byrå / Uppdragsgivare
        </h3>
        <p className="text-sm text-muted-foreground">
          Den som faktureras (byrå eller direktkund)
        </p>

        {agencyMatch && (
          <CustomerMatchCard
            match={agencyMatch}
            extractedParty={extraction?.parties.agency}
          />
        )}

        {!createNewAgency ? (
          <div className="space-y-2">
            <Label>Välj befintlig kund</Label>
            <Select
              value={selectedAgencyId || ''}
              onValueChange={(v) => onSelectAgency(v || null)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Välj kund..." />
              </SelectTrigger>
              <SelectContent>
                {customers.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name} {c.org_number && `(${c.org_number})`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Button
              variant="outline"
              size="sm"
              onClick={() => onToggleCreateAgency(true)}
            >
              <Plus className="h-4 w-4 mr-1" />
              Lägg till som ny kund
            </Button>
          </div>
        ) : (
          <div className="space-y-2 p-4 border rounded-lg bg-muted/30">
            <div className="flex items-center justify-between">
              <Label>Ny kund</Label>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onToggleCreateAgency(false)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
            <Input
              value={newAgencyName}
              onChange={(e) => onNewAgencyNameChange(e.target.value)}
              placeholder="Företagsnamn"
            />
          </div>
        )}
      </div>
    </div>
  )
}

// Customer match card
function CustomerMatchCard({
  match,
  extractedParty,
}: {
  match: CustomerMatchResult
  extractedParty: { name: string; orgNumber: string | null; email: string | null } | null | undefined
}) {
  if (!extractedParty) return null

  const getBadgeColor = () => {
    if (match.matchType === 'exact') return 'bg-green-100 text-green-700'
    if (match.matchType === 'probable') return 'bg-yellow-100 text-yellow-700'
    return 'bg-gray-100 text-gray-700'
  }

  const getBadgeText = () => {
    if (match.matchType === 'exact') return 'Exakt matchning'
    if (match.matchType === 'probable') return `Trolig matchning (${Math.round(match.confidence * 100)}%)`
    return 'Ingen matchning'
  }

  return (
    <div className="p-4 border rounded-lg bg-muted/20">
      <div className="flex items-start justify-between">
        <div>
          <p className="font-medium">{extractedParty.name}</p>
          {extractedParty.orgNumber && (
            <p className="text-sm text-muted-foreground">Org.nr: {extractedParty.orgNumber}</p>
          )}
          {extractedParty.email && (
            <p className="text-sm text-muted-foreground">{extractedParty.email}</p>
          )}
        </div>
        <span className={cn('px-2 py-1 rounded text-xs font-medium', getBadgeColor())}>
          {getBadgeText()}
        </span>
      </div>

      {match.matchType !== 'none' && match.customer && (
        <div className="mt-3 pt-3 border-t">
          <p className="text-sm text-muted-foreground">Matchad med:</p>
          <p className="font-medium">{match.customer.name}</p>
          <p className="text-xs text-muted-foreground">
            Matchad på: {match.matchedOn.join(', ')}
          </p>
        </div>
      )}
    </div>
  )
}

// Step 4: Deliverables
function Step4Deliverables({
  extraction,
  onUpdateField,
}: {
  extraction: ContractExtractionResult | null
  onUpdateField: (path: string, value: unknown) => void
}) {
  if (!extraction) return null

  const deliverables = extraction.deliverables || []

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold mb-1">Innehåll & Deadlines</h2>
        <p className="text-muted-foreground text-sm">
          Granska och justera innehåll som hittades i avtalet
        </p>
      </div>

      <div className="flex items-center gap-2 mb-4">
        <ConfidenceIndicator level={extraction.confidence.deliverables as ConfidenceLevel} showLabel />
        <span className="text-sm text-muted-foreground">
          {deliverables.length} innehåll hittade
        </span>
      </div>

      {deliverables.length > 0 ? (
        <div className="space-y-4">
          {deliverables.map((del, index) => (
            <div key={index} className="p-4 border rounded-lg space-y-3">
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <Label className="text-xs text-muted-foreground">Typ</Label>
                  <Select
                    value={del.type}
                    onValueChange={(v) => {
                      const updated = [...deliverables]
                      updated[index] = { ...updated[index], type: v as typeof del.type }
                      onUpdateField('deliverables', updated)
                    }}
                  >
                    <SelectTrigger className="h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="video">Video</SelectItem>
                      <SelectItem value="image">Bild</SelectItem>
                      <SelectItem value="story">Story</SelectItem>
                      <SelectItem value="reel">Reel</SelectItem>
                      <SelectItem value="post">Inlägg</SelectItem>
                      <SelectItem value="raw_material">Råmaterial</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label className="text-xs text-muted-foreground">Plattform</Label>
                  <Select
                    value={del.platform || ''}
                    onValueChange={(v) => {
                      const updated = [...deliverables]
                      updated[index] = { ...updated[index], platform: v as typeof del.platform }
                      onUpdateField('deliverables', updated)
                    }}
                  >
                    <SelectTrigger className="h-9">
                      <SelectValue placeholder="Välj..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="instagram">Instagram</SelectItem>
                      <SelectItem value="tiktok">TikTok</SelectItem>
                      <SelectItem value="youtube">YouTube</SelectItem>
                      <SelectItem value="blog">Blogg</SelectItem>
                      <SelectItem value="podcast">Podcast</SelectItem>
                      <SelectItem value="other">Övrigt</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label className="text-xs text-muted-foreground">Antal</Label>
                  <Input
                    type="number"
                    min="1"
                    className="h-9"
                    value={del.quantity}
                    onChange={(e) => {
                      const updated = [...deliverables]
                      updated[index] = { ...updated[index], quantity: parseInt(e.target.value) || 1 }
                      onUpdateField('deliverables', updated)
                    }}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs text-muted-foreground">Konto</Label>
                  <Input
                    className="h-9"
                    value={del.account || ''}
                    onChange={(e) => {
                      const updated = [...deliverables]
                      updated[index] = { ...updated[index], account: e.target.value }
                      onUpdateField('deliverables', updated)
                    }}
                    placeholder="@användarnamn"
                  />
                </div>

                <div>
                  <Label className="text-xs text-muted-foreground">Deadline</Label>
                  <Input
                    type="date"
                    className="h-9"
                    value={del.dueDate || ''}
                    onChange={(e) => {
                      const updated = [...deliverables]
                      updated[index] = { ...updated[index], dueDate: e.target.value }
                      onUpdateField('deliverables', updated)
                    }}
                  />
                </div>
              </div>

              <Button
                variant="ghost"
                size="sm"
                className="text-destructive"
                onClick={() => {
                  const updated = deliverables.filter((_, i) => i !== index)
                  onUpdateField('deliverables', updated)
                }}
              >
                <X className="h-4 w-4 mr-1" />
                Ta bort
              </Button>
            </div>
          ))}

          <Button
            variant="outline"
            onClick={() => {
              const updated = [...deliverables, {
                type: 'post' as const,
                quantity: 1,
                platform: 'instagram' as const,
                account: null,
                dueDate: null,
                description: null,
              }]
              onUpdateField('deliverables', updated)
            }}
          >
            <Plus className="h-4 w-4 mr-1" />
            Lägg till innehåll
          </Button>
        </div>
      ) : (
        <div className="text-center py-8 text-muted-foreground">
          <Package className="h-12 w-12 mx-auto mb-2 opacity-50" />
          <p>Inget innehåll hittades i avtalet</p>
          <Button
            variant="outline"
            className="mt-4"
            onClick={() => {
              onUpdateField('deliverables', [{
                type: 'post' as const,
                quantity: 1,
                platform: 'instagram' as const,
                account: null,
                dueDate: null,
                description: null,
              }])
            }}
          >
            <Plus className="h-4 w-4 mr-1" />
            Lägg till innehåll
          </Button>
        </div>
      )}

      {/* Deadlines preview */}
      {extraction.deadlines.length > 0 && (
        <div className="pt-6 border-t">
          <h3 className="font-medium mb-3">Deadlines från avtalet</h3>
          <div className="space-y-2">
            {extraction.deadlines.map((deadline, index) => (
              <div key={index} className="flex items-center justify-between p-3 bg-muted/30 rounded-lg text-sm">
                <span>{deadline.description}</span>
                <span className="text-muted-foreground">
                  {deadline.absoluteDate || (deadline.isRelative ? `${deadline.offsetDays} dagar efter ${deadline.referenceEvent}` : 'Ej angivet')}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// Step 5: Exclusivity
function Step5Exclusivity({
  extraction,
  onUpdateField,
  conflicts,
}: {
  extraction: ContractExtractionResult | null
  onUpdateField: (path: string, value: unknown) => void
  conflicts: ExclusivityConflict[]
}) {
  if (!extraction) return null

  const hasExclusivity = extraction.exclusivity?.categories?.length > 0

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold mb-1">Exklusivitet</h2>
        <p className="text-muted-foreground text-sm">
          Granska exklusivitetsvillkor från avtalet
        </p>
      </div>

      {conflicts.length > 0 && (
        <div className="p-4 border border-yellow-500 bg-yellow-50 rounded-lg">
          <div className="flex items-start gap-2">
            <AlertTriangle className="h-5 w-5 text-yellow-600 mt-0.5" />
            <div>
              <p className="font-medium text-yellow-800">Potentiell konflikt upptäckt</p>
              <p className="text-sm text-yellow-700 mt-1">
                Exklusiviteten överlappar med {conflicts.length} befintliga avtal.
                Du kan ändå fortsätta, men bör granska konflikterna.
              </p>
            </div>
          </div>
        </div>
      )}

      <div className="flex items-center gap-2 mb-4">
        <ConfidenceIndicator level={extraction.confidence.exclusivity as ConfidenceLevel} showLabel />
      </div>

      {hasExclusivity ? (
        <div className="space-y-4">
          <div>
            <Label className="mb-2 block">Kategorier</Label>
            <div className="flex flex-wrap gap-2">
              {extraction.exclusivity.categories.map((cat, index) => (
                <span
                  key={index}
                  className="inline-flex items-center gap-1 px-3 py-1 bg-primary/10 text-primary rounded-full text-sm"
                >
                  {cat}
                  <button
                    onClick={() => {
                      const updated = extraction.exclusivity.categories.filter((_, i) => i !== index)
                      onUpdateField('exclusivity.categories', updated)
                    }}
                    className="hover:text-destructive"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>
            <div className="flex gap-2 mt-2">
              <Input
                placeholder="Lägg till kategori..."
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    const value = (e.target as HTMLInputElement).value.trim()
                    if (value) {
                      const updated = [...extraction.exclusivity.categories.filter(c => c !== ''), value]
                      onUpdateField('exclusivity.categories', updated)
                      ;(e.target as HTMLInputElement).value = ''
                    }
                  }
                }}
              />
            </div>
          </div>

          {extraction.exclusivity?.excludedBrands?.length > 0 && (
            <div>
              <Label className="mb-2 block">Uteslutna varumärken</Label>
              <div className="flex flex-wrap gap-2">
                {extraction.exclusivity.excludedBrands.map((brand, index) => (
                  <span
                    key={index}
                    className="inline-flex items-center gap-1 px-3 py-1 bg-muted rounded-full text-sm"
                  >
                    {brand}
                    <button
                      onClick={() => {
                        const updated = extraction.exclusivity.excludedBrands.filter((_, i) => i !== index)
                        onUpdateField('exclusivity.excludedBrands', updated)
                      }}
                      className="hover:text-destructive"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="text-sm text-muted-foreground">Period före (dagar)</Label>
              <Input
                type="number"
                value={extraction.exclusivity.prePeriodDays || ''}
                onChange={(e) => onUpdateField('exclusivity.prePeriodDays', parseInt(e.target.value) || null)}
                placeholder="0"
              />
            </div>

            <div>
              <Label className="text-sm text-muted-foreground">Period efter (dagar)</Label>
              <Input
                type="number"
                value={extraction.exclusivity.postPeriodDays || ''}
                onChange={(e) => onUpdateField('exclusivity.postPeriodDays', parseInt(e.target.value) || null)}
                placeholder="0"
              />
            </div>
          </div>
        </div>
      ) : (
        <div className="text-center py-8 text-muted-foreground">
          <Shield className="h-12 w-12 mx-auto mb-2 opacity-50" />
          <p>Inga exklusivitetsvillkor hittades i avtalet</p>
          <Button
            variant="outline"
            size="sm"
            className="mt-3"
            onClick={() => {
              onUpdateField('exclusivity', {
                categories: [''],
                excludedBrands: [],
                prePeriodDays: null,
                postPeriodDays: null,
              })
            }}
          >
            <Plus className="h-4 w-4 mr-1" />
            Lägg till exklusivitet manuellt
          </Button>
        </div>
      )}
    </div>
  )
}

// Step 6: Confirmation
function Step6Confirm({
  extraction,
  selectedAgencyId,
  createNewAgency,
  newBrandName,
  newAgencyName,
  customers,
}: {
  extraction: ContractExtractionResult | null
  selectedAgencyId: string | null
  createNewAgency: boolean
  newBrandName: string
  newAgencyName: string
  customers: Customer[]
}) {
  if (!extraction) return null

  const selectedAgency = customers.find(c => c.id === selectedAgencyId)

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold mb-1">Bekräfta och skapa</h2>
        <p className="text-muted-foreground text-sm">
          Granska sammanfattningen innan samarbetet skapas
        </p>
      </div>

      <div className="grid gap-4">
        {/* Campaign info */}
        <div className="p-4 border rounded-lg">
          <h3 className="font-medium mb-2">Samarbete</h3>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
            <dt className="text-muted-foreground">Namn</dt>
            <dd>{extraction.campaignName || 'Nytt samarbete'}</dd>

            <dt className="text-muted-foreground">Belopp</dt>
            <dd>
              {extraction.financials.amount
                ? `${extraction.financials.amount.toLocaleString('sv-SE')} ${extraction.financials.currency}`
                : 'Ej angivet'}
            </dd>

            <dt className="text-muted-foreground">Publiceringsdatum</dt>
            <dd>
              {extraction.period.publicationDate || 'Ej angivet'}
            </dd>
          </dl>
        </div>

        {/* Customer info */}
        <div className="p-4 border rounded-lg">
          <h3 className="font-medium mb-2">Varumärke & Byrå</h3>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
            <dt className="text-muted-foreground">Varumärke</dt>
            <dd>{newBrandName || extraction.parties.brand?.name || 'Ej angivet'}</dd>

            <dt className="text-muted-foreground">Byrå / Uppdragsgivare</dt>
            <dd>
              {createNewAgency
                ? `${newAgencyName} (ny kund)`
                : selectedAgency?.name || 'Ej vald'}
            </dd>
          </dl>
        </div>

        {/* Deliverables summary */}
        <div className="p-4 border rounded-lg">
          <h3 className="font-medium mb-2">Innehåll</h3>
          <p className="text-sm text-muted-foreground">
            {extraction.deliverables.length} innehåll kommer att skapas
          </p>
          <ul className="mt-2 space-y-1 text-sm">
            {extraction.deliverables.slice(0, 5).map((del, i) => (
              <li key={i} className="flex items-center gap-2">
                <span className="w-4 h-4 rounded-full bg-primary/10 text-primary text-xs flex items-center justify-center">
                  {del.quantity}
                </span>
                {del.type} - {del.platform || 'Ej angiven plattform'}
              </li>
            ))}
            {extraction.deliverables.length > 5 && (
              <li className="text-muted-foreground">
                ...och {extraction.deliverables.length - 5} till
              </li>
            )}
          </ul>
        </div>

        {/* Exclusivity summary */}
        {extraction.exclusivity?.categories?.length > 0 && (
          <div className="p-4 border rounded-lg">
            <h3 className="font-medium mb-2">Exklusivitet</h3>
            <p className="text-sm">
              Kategorier: {extraction.exclusivity.categories.join(', ')}
            </p>
            {extraction.exclusivity?.postPeriodDays && (
              <p className="text-sm text-muted-foreground mt-1">
                {extraction.exclusivity.postPeriodDays} dagar efter avslut
              </p>
            )}
          </div>
        )}
      </div>

      <div className="flex items-center gap-2 p-4 bg-green-50 border border-green-200 rounded-lg">
        <CheckCircle2 className="h-5 w-5 text-green-600" />
        <p className="text-sm text-green-800">
          Klicka på &quot;Skapa samarbete&quot; för att skapa samarbetet med alla uppgifter.
        </p>
      </div>
    </div>
  )
}
