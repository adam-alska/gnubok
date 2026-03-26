'use client'

import { useState, useEffect, useRef } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { formatCurrency } from '@/lib/utils'
import {
  CheckCircle,
  AlertCircle,
  ArrowRight,
  Loader2,
  Calendar,
  FileText,
  Database,
} from 'lucide-react'
import { useUnsavedChanges } from '@/lib/hooks/use-unsaved-changes'
import type { ImportPreview, AccountMapping } from '@/lib/import/types'

interface ImportReviewStepProps {
  preview: ImportPreview
  mappings: AccountMapping[]
  onExecute: (options: ImportExecuteOptions) => Promise<void>
  onBack: () => void
  isLoading: boolean
}

export interface ImportExecuteOptions {
  createFiscalPeriod: boolean
  importOpeningBalances: boolean
  importTransactions: boolean
  voucherSeries: string
}

export default function ImportReviewStep({
  preview,
  mappings,
  onExecute,
  onBack,
  isLoading,
}: ImportReviewStepProps) {
  const [options, setOptions] = useState<ImportExecuteOptions>({
    createFiscalPeriod: true,
    importOpeningBalances: true,
    importTransactions: true,
    voucherSeries: 'B',
  })
  const [elapsed, setElapsed] = useState(0)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Block browser close/refresh during import
  useUnsavedChanges(isLoading)

  // Elapsed time counter during import
  useEffect(() => {
    if (isLoading) {
      setElapsed(0)
      intervalRef.current = setInterval(() => setElapsed((s) => s + 1), 1000)
    } else {
      if (intervalRef.current) clearInterval(intervalRef.current)
      setElapsed(0)
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current) }
  }, [isLoading])

  const handleExecute = () => {
    onExecute(options)
  }

  const updateOption = <K extends keyof ImportExecuteOptions>(
    key: K,
    value: ImportExecuteOptions[K]
  ) => {
    setOptions((prev) => ({ ...prev, [key]: value }))
  }

  // Calculate what will be imported
  const mappedCount = mappings.filter((m) => m.targetAccount).length
  const hasOpeningBalances = preview.openingBalanceTotal > 0
  const hasTransactions = preview.voucherCount > 0

  // Full-screen loading takeover during import execution
  if (isLoading) {
    return (
      <div className="space-y-6">
        <Card>
          <CardContent className="pt-8 pb-8">
            <div className="flex flex-col items-center text-center space-y-6">
              <Loader2 className="h-10 w-10 text-primary animate-spin" />
              <div className="space-y-1">
                <p className="font-medium text-lg">Importerar bokföring...</p>
                <p className="text-sm text-muted-foreground">
                  {preview.voucherCount} verifikationer bearbetas
                </p>
              </div>
              <div className="text-2xl font-display font-medium tabular-nums text-muted-foreground">
                {elapsed}s
              </div>
              <p className="text-sm text-muted-foreground max-w-sm">
                Stäng inte sidan. Importen kan ta upp till några minuter beroende på antalet verifikationer.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Summary */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CheckCircle className="h-5 w-5 text-success" />
            Redo att importera
          </CardTitle>
          <CardDescription>
            Granska inställningarna nedan och klicka på &quot;Starta import&quot; för att genomföra importen.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-3">
            <div className="flex items-center gap-3 p-3 bg-muted rounded-lg">
              <FileText className="h-8 w-8 text-muted-foreground" />
              <div>
                <p className="font-medium">{preview.companyName || 'Okänt företag'}</p>
                <p className="text-sm text-muted-foreground">{preview.orgNumber || 'Inget orgnr'}</p>
              </div>
            </div>
            <div className="flex items-center gap-3 p-3 bg-muted rounded-lg">
              <Calendar className="h-8 w-8 text-muted-foreground" />
              <div>
                <p className="font-medium">Räkenskapsår</p>
                <p className="text-sm text-muted-foreground">
                  {preview.fiscalYearStart
                    ? new Date(preview.fiscalYearStart).toLocaleDateString('sv-SE')
                    : '?'}{' '}
                  -{' '}
                  {preview.fiscalYearEnd
                    ? new Date(preview.fiscalYearEnd).toLocaleDateString('sv-SE')
                    : '?'}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3 p-3 bg-muted rounded-lg">
              <Database className="h-8 w-8 text-muted-foreground" />
              <div>
                <p className="font-medium">{mappedCount} konton mappade</p>
                <p className="text-sm text-muted-foreground">
                  {preview.voucherCount} verifikationer
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Import options */}
      <Card>
        <CardHeader>
          <CardTitle>Importinställningar</CardTitle>
          <CardDescription>Välj vad som ska importeras</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Fiscal period */}
          <div className="flex items-start justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="create-fiscal-period" className="font-medium">
                Skapa räkenskapsår
              </Label>
              <p className="text-sm text-muted-foreground">
                Skapar automatiskt räkenskapsåret om det inte redan finns
              </p>
            </div>
            <Switch
              id="create-fiscal-period"
              checked={options.createFiscalPeriod}
              onCheckedChange={(checked) => updateOption('createFiscalPeriod', checked)}
            />
          </div>

          {/* Opening balances */}
          <div className="flex items-start justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="import-opening-balances" className="font-medium">
                Importera ingående balanser
              </Label>
              <p className="text-sm text-muted-foreground">
                {hasOpeningBalances
                  ? `Skapar verifikation för IB på ${formatCurrency(preview.openingBalanceTotal)}`
                  : 'Inga ingående balanser i filen'}
              </p>
            </div>
            <Switch
              id="import-opening-balances"
              checked={options.importOpeningBalances}
              onCheckedChange={(checked) => updateOption('importOpeningBalances', checked)}
              disabled={!hasOpeningBalances}
            />
          </div>

          {/* Transactions */}
          <div className="flex items-start justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="import-transactions" className="font-medium">
                Importera verifikationer
              </Label>
              <p className="text-sm text-muted-foreground">
                {hasTransactions
                  ? `Importerar ${preview.voucherCount} verifikationer med ${preview.transactionLineCount} rader`
                  : 'Inga verifikationer i filen (SIE1-format?)'}
              </p>
            </div>
            <Switch
              id="import-transactions"
              checked={options.importTransactions}
              onCheckedChange={(checked) => updateOption('importTransactions', checked)}
              disabled={!hasTransactions}
            />
          </div>

          {/* Voucher series */}
          {options.importTransactions && hasTransactions && (
            <div className="space-y-2">
              <Label htmlFor="voucher-series" className="font-medium">
                Verifikationsserie för importerade transaktioner
              </Label>
              <Select
                value={options.voucherSeries}
                onValueChange={(value) => updateOption('voucherSeries', value)}
              >
                <SelectTrigger id="voucher-series" className="w-48">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="A">A - Huvudserie</SelectItem>
                  <SelectItem value="B">B - Import</SelectItem>
                  <SelectItem value="C">C - Korrigeringar</SelectItem>
                  <SelectItem value="I">I - Import (alternativ)</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-sm text-muted-foreground">
                Använd en separat serie för att enkelt kunna skilja importerade från manuella verifikationer
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Warnings */}
      {!preview.trialBalance.isBalanced && (
        <Card className="border-warning/50 bg-warning/5">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-warning">
              <AlertCircle className="h-5 w-5" />
              Observera
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              De ingående balanserna i filen balanserar inte helt. En justeringspost kommer
              att skapas automatiskt mot konto 2099 (Årets resultat).
            </p>
          </CardContent>
        </Card>
      )}

      {/* What happens next */}
      <Card className="bg-muted/50">
        <CardHeader>
          <CardTitle className="text-base">Vad händer när du importerar?</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-2">
          <p>1. Räkenskapsåret skapas om det inte finns</p>
          <p>2. En verifikation för ingående balanser skapas</p>
          <p>3. Alla verifikationer importeras med nya verifikationsnummer</p>
          <p>4. Kontomappningarna sparas för framtida importer</p>
          <p className="pt-2 font-medium">
            Importen kan inte ångras automatiskt, men du kan ta bort skapade verifikationer manuellt.
          </p>
        </CardContent>
      </Card>

      {/* Actions */}
      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-between">
        <Button variant="outline" className="min-h-11" onClick={onBack}>
          Tillbaka
        </Button>
        <Button className="min-h-11" onClick={handleExecute}>
          Starta import
          <ArrowRight className="ml-2 h-4 w-4" />
        </Button>
      </div>
    </div>
  )
}
