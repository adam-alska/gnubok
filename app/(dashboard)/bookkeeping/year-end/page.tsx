'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { SuccessAnimation } from '@/components/ui/success-animation'
import { useToast } from '@/components/ui/use-toast'
import {
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Loader2,
  Lock,
  BookOpen,
  ChevronDown,
  ChevronUp,
} from 'lucide-react'
import { AccountNumber } from '@/components/ui/account-number'
import type {
  FiscalPeriod,
  YearEndValidation,
  YearEndPreview,
  YearEndResult,
} from '@/types'

function formatAmount(amount: number): string {
  return amount.toLocaleString('sv-SE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

const STEP_LABELS = ['Välj period', 'Validering', 'Förhandsgranskning', 'Genomför']

export default function YearEndPage() {
  const { toast } = useToast()

  const [step, setStep] = useState(0)
  const [periods, setPeriods] = useState<FiscalPeriod[]>([])
  const [selectedPeriodId, setSelectedPeriodId] = useState('')
  const [validation, setValidation] = useState<YearEndValidation | null>(null)
  const [preview, setPreview] = useState<YearEndPreview | null>(null)
  const [result, setResult] = useState<YearEndResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [loadingPeriods, setLoadingPeriods] = useState(true)
  const [executing, setExecuting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showConfirmDialog, setShowConfirmDialog] = useState(false)
  const [showLinesDetail, setShowLinesDetail] = useState(false)
  const [showSuccess, setShowSuccess] = useState(false)

  const selectedPeriod = periods.find((p) => p.id === selectedPeriodId)

  useEffect(() => {
    fetchPeriods()
  }, [])

  async function fetchPeriods() {
    try {
      const res = await fetch('/api/bookkeeping/fiscal-periods')
      const { data } = await res.json()
      const allPeriods: FiscalPeriod[] = data || []
      setPeriods(allPeriods)
      // Pre-select first open period
      const openPeriod = allPeriods.find((p) => !p.is_closed)
      if (openPeriod) {
        setSelectedPeriodId(openPeriod.id)
      }
    } catch {
      toast({ title: 'Fel', description: 'Kunde inte hämta räkenskapsår', variant: 'destructive' })
    } finally {
      setLoadingPeriods(false)
    }
  }

  const fetchValidationAndPreview = useCallback(async () => {
    if (!selectedPeriodId) return
    setLoading(true)
    setError(null)
    setValidation(null)
    setPreview(null)

    try {
      const res = await fetch(`/api/bookkeeping/fiscal-periods/${selectedPeriodId}/year-end`)
      const json = await res.json()

      if (!res.ok) {
        setError(json.error || 'Kunde inte validera perioden')
        return
      }

      setValidation(json.data.validation)
      setPreview(json.data.preview)
    } catch {
      setError('Nätverksfel vid validering')
    } finally {
      setLoading(false)
    }
  }, [selectedPeriodId])

  async function executeYearEnd() {
    setShowConfirmDialog(false)
    setExecuting(true)
    setError(null)

    try {
      const res = await fetch(`/api/bookkeeping/fiscal-periods/${selectedPeriodId}/year-end`, {
        method: 'POST',
      })
      const json = await res.json()

      if (!res.ok) {
        setError(json.error || 'Årsbokslut misslyckades')
        toast({ title: 'Fel', description: json.error || 'Årsbokslut misslyckades', variant: 'destructive' })
        return
      }

      setResult(json.data)
      setShowSuccess(true)
    } catch {
      setError('Nätverksfel vid genomförande')
      toast({ title: 'Fel', description: 'Nätverksfel vid genomförande', variant: 'destructive' })
    } finally {
      setExecuting(false)
    }
  }

  function goToStep(nextStep: number) {
    if (nextStep === 1 && !validation) {
      fetchValidationAndPreview()
    }
    setStep(nextStep)
  }

  function getPeriodStatus(period: FiscalPeriod) {
    if (period.is_closed) return { label: 'Stängd', variant: 'secondary' as const }
    if (period.locked_at) return { label: 'Låst', variant: 'outline' as const }
    return { label: 'Öppen', variant: 'default' as const }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Årsbokslut</h1>
          <p className="text-muted-foreground">
            Stäng räkenskapsåret och generera ingående balanser
          </p>
        </div>
        <Button variant="outline" asChild>
          <Link href="/bookkeeping">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Bokföring
          </Link>
        </Button>
      </div>

      {/* Step indicator */}
      <div className="flex items-center gap-2">
        {STEP_LABELS.map((label, i) => (
          <div key={label} className="flex items-center gap-2">
            <div className="flex items-center gap-1.5">
              <div
                className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-medium ${
                  i < step
                    ? 'bg-primary text-primary-foreground'
                    : i === step
                      ? 'bg-primary text-primary-foreground ring-2 ring-primary/30'
                      : 'bg-muted text-muted-foreground'
                }`}
              >
                {i < step ? <CheckCircle2 className="h-4 w-4" /> : i + 1}
              </div>
              <span
                className={`text-sm hidden sm:inline ${
                  i === step ? 'font-medium' : 'text-muted-foreground'
                }`}
              >
                {label}
              </span>
            </div>
            {i < STEP_LABELS.length - 1 && (
              <div className={`h-px w-8 ${i < step ? 'bg-primary' : 'bg-border'}`} />
            )}
          </div>
        ))}
      </div>

      {/* Error banner */}
      {error && (
        <Card className="border-destructive">
          <CardContent className="flex items-center gap-3 py-4">
            <AlertCircle className="h-5 w-5 text-destructive flex-shrink-0" />
            <p className="text-sm text-destructive">{error}</p>
          </CardContent>
        </Card>
      )}

      {/* Step 0: Period Selection */}
      {step === 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Välj räkenskapsår att stänga</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {loadingPeriods ? (
              <div className="space-y-3">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            ) : periods.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                Inga räkenskapsår hittades. Skapa ett räkenskapsår först.
              </p>
            ) : (
              <>
                <div className="space-y-2">
                  {periods.map((period) => {
                    const status = getPeriodStatus(period)
                    const isSelected = period.id === selectedPeriodId
                    return (
                      <button
                        key={period.id}
                        onClick={() => setSelectedPeriodId(period.id)}
                        disabled={period.is_closed}
                        className={`w-full flex items-center justify-between rounded-lg border p-4 text-left transition-colors ${
                          isSelected
                            ? 'border-primary bg-primary/5'
                            : period.is_closed
                              ? 'border-border bg-muted/50 opacity-60 cursor-not-allowed'
                              : 'border-border hover:border-primary/50 hover:bg-muted/30'
                        }`}
                      >
                        <div>
                          <p className="font-medium">{period.name}</p>
                          <p className="text-sm text-muted-foreground">
                            {period.period_start} – {period.period_end}
                          </p>
                        </div>
                        <Badge variant={status.variant}>{status.label}</Badge>
                      </button>
                    )
                  })}
                </div>

                <div className="flex justify-end">
                  <Button
                    onClick={() => goToStep(1)}
                    disabled={!selectedPeriodId || (selectedPeriod?.is_closed ?? false)}
                  >
                    Nästa
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      )}

      {/* Step 1: Validation */}
      {step === 1 && (
        <Card>
          <CardHeader>
            <CardTitle>Validering — {selectedPeriod?.name}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {loading ? (
              <div className="space-y-3">
                <Skeleton className="h-6 w-3/4" />
                <Skeleton className="h-6 w-1/2" />
                <Skeleton className="h-6 w-2/3" />
              </div>
            ) : validation ? (
              <>
                {/* Ready indicator */}
                <div
                  className={`flex items-center gap-3 rounded-lg p-4 ${
                    validation.ready
                      ? 'bg-green-50 dark:bg-green-950/20'
                      : 'bg-red-50 dark:bg-red-950/20'
                  }`}
                >
                  {validation.ready ? (
                    <CheckCircle2 className="h-6 w-6 text-green-600 dark:text-green-400" />
                  ) : (
                    <AlertCircle className="h-6 w-6 text-red-600 dark:text-red-400" />
                  )}
                  <div>
                    <p className="font-medium">
                      {validation.ready
                        ? 'Perioden är redo för årsbokslut'
                        : 'Perioden kan inte stängas ännu'}
                    </p>
                    {!validation.ready && (
                      <p className="text-sm text-muted-foreground">
                        Åtgärda felen nedan innan du kan fortsätta
                      </p>
                    )}
                  </div>
                </div>

                {/* Errors */}
                {validation.errors.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-sm font-medium text-red-600 dark:text-red-400">Fel som måste åtgärdas</p>
                    {validation.errors.map((err, i) => (
                      <div key={i} className="flex items-start gap-2 text-sm">
                        <AlertCircle className="h-4 w-4 text-red-500 mt-0.5 flex-shrink-0" />
                        <span>{err}</span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Warnings */}
                {validation.warnings.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-sm font-medium text-amber-600 dark:text-amber-400">Varningar</p>
                    {validation.warnings.map((warn, i) => (
                      <div key={i} className="flex items-start gap-2 text-sm">
                        <AlertTriangle className="h-4 w-4 text-amber-500 mt-0.5 flex-shrink-0" />
                        <span>{warn}</span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Details */}
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div className="rounded-lg border p-3">
                    <p className="text-muted-foreground">Utkast kvar</p>
                    <p className="text-lg font-medium">{validation.draftCount}</p>
                  </div>
                  <div className="rounded-lg border p-3">
                    <p className="text-muted-foreground">Saldobalans</p>
                    <p className="text-lg font-medium">
                      {validation.trialBalanceBalanced ? 'Balanserad' : 'Obalanserad'}
                    </p>
                  </div>
                </div>

                {/* Voucher gaps */}
                {validation.voucherGaps.length > 0 && (
                  <div className="rounded-lg border p-3">
                    <p className="text-sm font-medium mb-2">Verifikationsnummerluckor</p>
                    <div className="flex flex-wrap gap-2">
                      {validation.voucherGaps.map((gap, i) => (
                        <Badge key={i} variant="outline">
                          {gap.gap_start}–{gap.gap_end}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
              </>
            ) : null}

            <div className="flex justify-between">
              <Button variant="outline" onClick={() => setStep(0)}>
                <ArrowLeft className="mr-2 h-4 w-4" />
                Tillbaka
              </Button>
              <div className="flex gap-2">
                <Button variant="outline" onClick={fetchValidationAndPreview} disabled={loading}>
                  {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Validera igen
                </Button>
                <Button
                  onClick={() => goToStep(2)}
                  disabled={!validation?.ready}
                >
                  Nästa
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 2: Preview */}
      {step === 2 && preview && (
        <div className="space-y-4">
          {/* Net result highlight */}
          <Card>
            <CardContent className="py-6">
              <div className="text-center">
                <p className="text-sm text-muted-foreground mb-1">Årets resultat</p>
                <p
                  className={`text-4xl font-bold tracking-tight ${
                    preview.netResult >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
                  }`}
                >
                  {formatAmount(preview.netResult)} kr
                </p>
                <p className="text-sm text-muted-foreground mt-2">
                  Bokförs på {preview.closingAccount} — {preview.closingAccountName}
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Result account summary */}
          <Card>
            <CardHeader>
              <CardTitle>Resultatkonton som nollställs</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Konto</TableHead>
                    <TableHead>Namn</TableHead>
                    <TableHead className="text-right">Belopp</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {preview.resultAccountSummary.map((account) => (
                    <TableRow key={account.account_number}>
                      <TableCell><AccountNumber number={account.account_number} name={account.account_name} /></TableCell>
                      <TableCell>{account.account_name}</TableCell>
                      <TableCell className="text-right font-mono">
                        {formatAmount(account.amount)} kr
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {/* Closing journal lines (expandable) */}
          <Card>
            <CardHeader>
              <button
                onClick={() => setShowLinesDetail(!showLinesDetail)}
                className="flex items-center justify-between w-full"
              >
                <CardTitle>Bokslutsverifikation ({preview.closingLines.length} rader)</CardTitle>
                {showLinesDetail ? (
                  <ChevronUp className="h-5 w-5 text-muted-foreground" />
                ) : (
                  <ChevronDown className="h-5 w-5 text-muted-foreground" />
                )}
              </button>
            </CardHeader>
            {showLinesDetail && (
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Konto</TableHead>
                      <TableHead>Beskrivning</TableHead>
                      <TableHead className="text-right">Debet</TableHead>
                      <TableHead className="text-right">Kredit</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {preview.closingLines.map((line, i) => (
                      <TableRow key={i}>
                        <TableCell><AccountNumber number={line.account_number} /></TableCell>
                        <TableCell>{line.line_description}</TableCell>
                        <TableCell className="text-right font-mono">
                          {line.debit_amount > 0 ? formatAmount(line.debit_amount) : ''}
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          {line.credit_amount > 0 ? formatAmount(line.credit_amount) : ''}
                        </TableCell>
                      </TableRow>
                    ))}
                    {/* Totals row */}
                    <TableRow className="font-medium border-t-2">
                      <TableCell colSpan={2}>Summa</TableCell>
                      <TableCell className="text-right font-mono">
                        {formatAmount(
                          preview.closingLines.reduce((sum, l) => sum + l.debit_amount, 0)
                        )}
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {formatAmount(
                          preview.closingLines.reduce((sum, l) => sum + l.credit_amount, 0)
                        )}
                      </TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </CardContent>
            )}
          </Card>

          {/* Navigation */}
          <div className="flex justify-between">
            <Button variant="outline" onClick={() => setStep(1)}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              Tillbaka
            </Button>
            <Button onClick={() => goToStep(3)}>
              Nästa
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Step 3: Execute */}
      {step === 3 && !result && (
        <Card>
          <CardHeader>
            <CardTitle>Genomför årsbokslut</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-lg border p-4 space-y-3">
              <p className="text-sm text-muted-foreground">
                Följande åtgärder kommer att genomföras:
              </p>
              <ul className="space-y-2 text-sm">
                <li className="flex items-start gap-2">
                  <BookOpen className="h-4 w-4 mt-0.5 text-muted-foreground flex-shrink-0" />
                  Bokslutsverifikation skapas med {preview?.closingLines.length} rader
                </li>
                <li className="flex items-start gap-2">
                  <Lock className="h-4 w-4 mt-0.5 text-muted-foreground flex-shrink-0" />
                  Perioden {selectedPeriod?.name} låses och stängs permanent
                </li>
                <li className="flex items-start gap-2">
                  <ArrowRight className="h-4 w-4 mt-0.5 text-muted-foreground flex-shrink-0" />
                  Nytt räkenskapsår skapas med ingående balanser
                </li>
              </ul>
              {preview && (
                <div className="pt-2 border-t">
                  <p className="text-sm">
                    Årets resultat:{' '}
                    <span className="font-medium">
                      {formatAmount(preview.netResult)} kr
                    </span>{' '}
                    → {preview.closingAccount} ({preview.closingAccountName})
                  </p>
                </div>
              )}
            </div>

            <div className="rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 p-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-amber-800 dark:text-amber-200">
                    Denna åtgärd kan inte ångras
                  </p>
                  <p className="text-sm text-amber-700 dark:text-amber-300 mt-1">
                    Perioden stängs permanent enligt Bokföringslagen. Säkerställ att alla bokföringar
                    är korrekta innan du fortsätter.
                  </p>
                </div>
              </div>
            </div>

            <div className="flex justify-between">
              <Button variant="outline" onClick={() => setStep(2)}>
                <ArrowLeft className="mr-2 h-4 w-4" />
                Tillbaka
              </Button>
              <Button
                variant="destructive"
                onClick={() => setShowConfirmDialog(true)}
                disabled={executing}
              >
                {executing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Genomför årsbokslut
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 3: Success state */}
      {step === 3 && result && (
        <Card>
          <CardContent className="py-8">
            <div className="text-center space-y-4">
              <div className="flex justify-center">
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-green-100 dark:bg-green-950/30">
                  <CheckCircle2 className="h-8 w-8 text-green-600 dark:text-green-400" />
                </div>
              </div>
              <div>
                <h2 className="text-xl font-semibold">Årsbokslutet är genomfört</h2>
                <p className="text-muted-foreground mt-1">
                  {selectedPeriod?.name} har stängts och ett nytt räkenskapsår har skapats.
                </p>
              </div>

              <div className="grid gap-3 max-w-md mx-auto text-left">
                <div className="flex items-center justify-between rounded-lg border p-3 text-sm">
                  <span className="text-muted-foreground">Bokslutsverifikation</span>
                  <Link
                    href="/bookkeeping"
                    className="text-primary hover:underline font-medium"
                  >
                    Visa
                  </Link>
                </div>
                <div className="flex items-center justify-between rounded-lg border p-3 text-sm">
                  <span className="text-muted-foreground">Period stängd</span>
                  <Badge variant="secondary">
                    <Lock className="mr-1 h-3 w-3" />
                    Stängd
                  </Badge>
                </div>
                <div className="flex items-center justify-between rounded-lg border p-3 text-sm">
                  <span className="text-muted-foreground">Nytt räkenskapsår</span>
                  <span className="font-medium">{result.nextPeriod.name}</span>
                </div>
                <div className="flex items-center justify-between rounded-lg border p-3 text-sm">
                  <span className="text-muted-foreground">Ingående balanser</span>
                  <Badge variant="default">
                    <CheckCircle2 className="mr-1 h-3 w-3" />
                    Skapade
                  </Badge>
                </div>
              </div>

              <div className="pt-4">
                <Button asChild>
                  <Link href="/bookkeeping">
                    <ArrowLeft className="mr-2 h-4 w-4" />
                    Tillbaka till bokföring
                  </Link>
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Confirmation dialog */}
      <Dialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Bekräfta årsbokslut</DialogTitle>
            <DialogDescription>
              Är du säker på att du vill stänga <strong>{selectedPeriod?.name}</strong>?
              Denna åtgärd kan inte ångras. Perioden kommer att stängas permanent.
            </DialogDescription>
          </DialogHeader>
          {preview && (
            <div className="rounded-lg border p-3 text-sm">
              <p>
                Årets resultat:{' '}
                <span className="font-medium">{formatAmount(preview.netResult)} kr</span>
              </p>
              <p className="text-muted-foreground">
                Bokförs på {preview.closingAccount} — {preview.closingAccountName}
              </p>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowConfirmDialog(false)}>
              Avbryt
            </Button>
            <Button variant="destructive" onClick={executeYearEnd}>
              Stäng perioden
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Success animation overlay */}
      <SuccessAnimation
        show={showSuccess}
        title="Årsbokslut genomfört!"
        description={`${selectedPeriod?.name} har stängts`}
        variant="celebration"
      />
    </div>
  )
}
