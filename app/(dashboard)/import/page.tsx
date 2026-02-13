'use client'

import { useState, useCallback } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { useToast } from '@/components/ui/use-toast'
import SIEUploadStep from '@/components/import/SIEUploadStep'
import SIEPreviewStep from '@/components/import/SIEPreviewStep'
import AccountMappingStep from '@/components/import/AccountMappingStep'
import ImportReviewStep, { type ImportExecuteOptions } from '@/components/import/ImportReviewStep'
import ImportResultStep from '@/components/import/ImportResultStep'
import { applyMappingOverride } from '@/lib/import/account-mapper'
import type {
  ImportWizardStep,
  ParsedSIEFile,
  AccountMapping,
  ImportPreview,
  ImportResult,
  ParseIssue,
} from '@/lib/import/types'
import type { BASAccount } from '@/types'

const STEPS: ImportWizardStep[] = ['upload', 'preview', 'mapping', 'review', 'result']

const STEP_LABELS: Record<ImportWizardStep, string> = {
  upload: 'Ladda upp',
  preview: 'Förhandsgranskning',
  mapping: 'Kontomappning',
  review: 'Bekräfta',
  result: 'Resultat',
}

export default function ImportPage() {
  const { toast } = useToast()

  // Wizard state
  const [step, setStep] = useState<ImportWizardStep>('upload')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Data state
  const [file, setFile] = useState<File | null>(null)
  const [_parsed, setParsed] = useState<ParsedSIEFile | null>(null)
  const [mappings, setMappings] = useState<AccountMapping[]>([])
  const [basAccounts, setBasAccounts] = useState<BASAccount[]>([])
  const [preview, setPreview] = useState<ImportPreview | null>(null)
  const [issues, setIssues] = useState<ParseIssue[]>([])
  const [importResult, setImportResult] = useState<ImportResult | null>(null)
  const [_sieAccounts, setSieAccounts] = useState<{ number: string; name: string }[]>([])
  const [isCreatingAccounts, setIsCreatingAccounts] = useState(false)

  // Calculate progress
  const currentStepIndex = STEPS.indexOf(step)
  const progress = ((currentStepIndex + 1) / STEPS.length) * 100

  // Handle file selection and parsing
  const handleFileSelect = useCallback(async (selectedFile: File) => {
    setFile(selectedFile)
    setError(null)
    setIsLoading(true)

    try {
      const formData = new FormData()
      formData.append('file', selectedFile)

      const res = await fetch('/api/import/sie/parse', {
        method: 'POST',
        body: formData,
      })

      const data = await res.json()

      if (!res.ok) {
        if (data.error === 'duplicate') {
          setError(data.message)
        } else if (data.error === 'validation') {
          setError(`${data.message}: ${data.errors?.join(', ') || 'Unknown validation error'}`)
        } else {
          setError(data.error || 'Failed to parse file')
        }
        return
      }

      // Store parsed data
      setParsed({
        header: data.parsed.header,
        accounts: data.parsed.accounts,
        openingBalances: [],
        closingBalances: [],
        resultBalances: [],
        vouchers: [],
        issues: data.parsed.issues,
        stats: data.parsed.stats,
      })
      setMappings(data.mappings)
      setPreview(data.preview)
      setIssues(data.parsed.issues)
      setSieAccounts(data.parsed.accounts)

      // Fetch BAS accounts for the mapping step
      const accountsRes = await fetch('/api/bookkeeping/accounts')
      if (accountsRes.ok) {
        const accountsData = await accountsRes.json()
        setBasAccounts(accountsData.data || [])
      }

      // Move to preview step
      setStep('preview')

      toast({
        title: 'Fil analyserad',
        description: `${data.parsed.stats.totalAccounts} konton och ${data.parsed.stats.totalVouchers} verifikationer hittades`,
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to parse file')
    } finally {
      setIsLoading(false)
    }
  }, [toast])

  // Handle mapping changes
  const handleMappingChange = useCallback((sourceAccount: string, targetAccount: string, targetName: string) => {
    setMappings((prev) => applyMappingOverride(prev, sourceAccount, targetAccount, targetName))

    // Update preview mapping status
    setPreview((prev) => {
      if (!prev) return prev
      const updatedMappings = applyMappingOverride(mappings, sourceAccount, targetAccount, targetName)
      const mapped = updatedMappings.filter((m) => m.targetAccount).length
      const unmapped = updatedMappings.length - mapped
      const lowConfidence = updatedMappings.filter((m) => m.targetAccount && m.confidence < 0.7).length

      return {
        ...prev,
        mappingStatus: {
          ...prev.mappingStatus,
          mapped,
          unmapped,
          lowConfidence,
        },
      }
    })
  }, [mappings])

  // Calculate missing accounts (unmapped accounts that could be created)
  const missingAccounts = mappings
    .filter((m) => !m.targetAccount)
    .map((m) => ({ number: m.sourceAccount, name: m.sourceName }))

  // Handle creating missing accounts
  const handleCreateAccounts = useCallback(async () => {
    if (missingAccounts.length === 0) return

    setIsCreatingAccounts(true)

    try {
      const res = await fetch('/api/import/sie/create-accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accounts: missingAccounts }),
      })

      const data = await res.json()

      if (!res.ok) {
        toast({
          title: 'Fel',
          description: data.error || 'Kunde inte skapa konton',
          variant: 'destructive',
        })
        return
      }

      toast({
        title: 'Konton skapade',
        description: `${data.created} nya konton har lagts till i din kontoplan`,
      })

      // Re-parse the file to get updated mappings
      if (file) {
        const formData = new FormData()
        formData.append('file', file)

        const parseRes = await fetch('/api/import/sie/parse', {
          method: 'POST',
          body: formData,
        })

        const parseData = await parseRes.json()

        if (parseRes.ok) {
          setMappings(parseData.mappings)
          setPreview(parseData.preview)

          // Refresh BAS accounts
          const accountsRes = await fetch('/api/bookkeeping/accounts')
          if (accountsRes.ok) {
            const accountsData = await accountsRes.json()
            setBasAccounts(accountsData.data || [])
          }
        }
      }
    } catch (err) {
      toast({
        title: 'Fel',
        description: err instanceof Error ? err.message : 'Kunde inte skapa konton',
        variant: 'destructive',
      })
    } finally {
      setIsCreatingAccounts(false)
    }
  }, [missingAccounts, file, toast])

  // Handle import execution
  const handleExecuteImport = useCallback(async (options: ImportExecuteOptions) => {
    if (!file) {
      setError('No file selected')
      return
    }

    setIsLoading(true)
    setError(null)

    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('mappings', JSON.stringify(mappings))
      formData.append('options', JSON.stringify(options))

      const res = await fetch('/api/import/sie/execute', {
        method: 'POST',
        body: formData,
      })

      const data = await res.json()

      if (!res.ok) {
        if (data.result) {
          setImportResult(data.result)
        } else {
          setError(data.error || 'Import failed')
          return
        }
      } else {
        setImportResult(data.result)
      }

      // Move to result step
      setStep('result')

      if (data.result?.success) {
        toast({
          title: 'Import genomförd',
          description: `${data.result.journalEntriesCreated} verifikationer skapades`,
        })
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import failed')
    } finally {
      setIsLoading(false)
    }
  }, [file, mappings, toast])

  // Navigation handlers
  const goToStep = (targetStep: ImportWizardStep) => {
    setStep(targetStep)
    setError(null)
  }

  const goBack = () => {
    const currentIndex = STEPS.indexOf(step)
    if (currentIndex > 0) {
      setStep(STEPS[currentIndex - 1])
    }
  }

  const handleNewImport = () => {
    // Reset all state
    setStep('upload')
    setFile(null)
    setParsed(null)
    setMappings([])
    setPreview(null)
    setIssues([])
    setImportResult(null)
    setError(null)
    setSieAccounts([])
    setIsCreatingAccounts(false)
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Importera bokföring</h1>
        <p className="text-muted-foreground">
          Migrera din bokföring från Fortnox, Visma eller annat bokföringssystem via SIE-fil
        </p>
      </div>

      {/* Progress */}
      <Card>
        <CardContent className="pt-6">
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              {STEPS.map((s, i) => (
                <span
                  key={s}
                  className={`${
                    i <= currentStepIndex ? 'text-primary font-medium' : 'text-muted-foreground'
                  }`}
                >
                  {STEP_LABELS[s]}
                </span>
              ))}
            </div>
            <Progress value={progress} className="h-2" />
          </div>
        </CardContent>
      </Card>

      {/* Step content */}
      {step === 'upload' && (
        <SIEUploadStep
          onFileSelect={handleFileSelect}
          isLoading={isLoading}
          error={error}
        />
      )}

      {step === 'preview' && preview && (
        <SIEPreviewStep
          preview={preview}
          issues={issues}
          missingAccounts={missingAccounts}
          onCreateAccounts={handleCreateAccounts}
          isCreatingAccounts={isCreatingAccounts}
          onContinue={() => goToStep('mapping')}
          onBack={goBack}
        />
      )}

      {step === 'mapping' && (
        <AccountMappingStep
          mappings={mappings}
          basAccounts={basAccounts}
          onMappingChange={handleMappingChange}
          onContinue={() => goToStep('review')}
          onBack={goBack}
        />
      )}

      {step === 'review' && preview && (
        <ImportReviewStep
          preview={preview}
          mappings={mappings}
          onExecute={handleExecuteImport}
          onBack={goBack}
          isLoading={isLoading}
        />
      )}

      {step === 'result' && importResult && (
        <ImportResultStep
          result={importResult}
          onNewImport={handleNewImport}
        />
      )}
    </div>
  )
}
