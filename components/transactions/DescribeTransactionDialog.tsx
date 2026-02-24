'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { useToast } from '@/components/ui/use-toast'
import { formatCurrency, formatDate } from '@/lib/utils'
import {
  ArrowUpRight,
  ArrowDownRight,
  Loader2,
  Search,
  ArrowLeft,
  Check,
  CheckCircle2,
  AlertTriangle,
} from 'lucide-react'
import JournalEntryPreview from './JournalEntryPreview'
import { formatAccountWithName } from '@/lib/bookkeeping/client-account-names'
import type { TransactionWithInvoice } from './transaction-types'

interface TemplateMatch {
  template_id: string
  name_sv: string
  name_en: string
  group: string
  debit_account: string
  credit_account: string
  confidence: number
  description_sv: string
  vat_rate: number
  vat_treatment: string | null
  deductibility: 'full' | 'non_deductible' | 'conditional'
  deductibility_note_sv: string | null
  special_rules_sv: string | null
  risk_level: string
}

interface DescribeResult {
  templates: TemplateMatch[]
  needs_more_detail: boolean
  user_description: string
  batch_candidate_count: number
  merchant_name: string | null
}

interface DescribeTransactionDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  transaction: TransactionWithInvoice | null
  onCategorized: (transactionId: string, journalEntryId: string | null) => void
  onBatchApplied?: (count: number) => void
}

type Step = 'describe' | 'pick' | 'batch'

function getExamplePrompts(transaction: TransactionWithInvoice): string[] {
  const desc = (transaction.description || '').toLowerCase()
  const isExpense = transaction.amount < 0

  if (!isExpense) {
    return ['Konsultarvode', 'Forsaljning av varor', 'Aterbetalning']
  }

  // Contextual suggestions based on description keywords
  if (desc.includes('restaurang') || desc.includes('lunch') || desc.includes('middag') || desc.includes('mat')) {
    return ['Lunch med kund', 'Personalmiddag', 'Fika till kontoret']
  }
  if (desc.includes('hotel') || desc.includes('hotell') || desc.includes('boende') || desc.includes('resa')) {
    return ['Tjansteresa', 'Hotell konferens', 'Flygbiljett']
  }
  if (desc.includes('uber') || desc.includes('taxi') || desc.includes('bolt') || desc.includes('sj ')) {
    return ['Taxi till kund', 'Tjansteresa', 'Pendling']
  }
  if (desc.includes('google') || desc.includes('meta') || desc.includes('facebook') || desc.includes('linkedin')) {
    return ['Online-annonsering', 'SaaS-prenumeration', 'Marknadsforingskampanj']
  }
  if (desc.includes('amazon') || desc.includes('aws') || desc.includes('azure') || desc.includes('cloud')) {
    return ['Serverhosting', 'SaaS-prenumeration', 'Kontorsmaterial']
  }

  // Generic expense suggestions
  return ['Kontorsmaterial', 'SaaS-prenumeration', 'Konsulttjanst', 'Reklam']
}

export default function DescribeTransactionDialog({
  open,
  onOpenChange,
  transaction,
  onCategorized,
  onBatchApplied,
}: DescribeTransactionDialogProps) {
  const { toast } = useToast()
  const [step, setStep] = useState<Step>('describe')
  const [description, setDescription] = useState('')
  const [isSearching, setIsSearching] = useState(false)
  const [isBooking, setIsBooking] = useState(false)
  const [isBatchApplying, setIsBatchApplying] = useState(false)
  const [describeResult, setDescribeResult] = useState<DescribeResult | null>(null)
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null)

  function resetState() {
    setStep('describe')
    setDescription('')
    setIsSearching(false)
    setIsBooking(false)
    setIsBatchApplying(false)
    setDescribeResult(null)
    setSelectedTemplateId(null)
  }

  function handleOpenChange(isOpen: boolean) {
    if (!isOpen) {
      resetState()
    }
    onOpenChange(isOpen)
  }

  async function handleSearch() {
    if (!transaction || description.trim().length < 3) return

    setIsSearching(true)
    try {
      const response = await fetch(`/api/transactions/${transaction.id}/describe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description: description.trim() }),
      })
      const result = await response.json()
      if (!response.ok) {
        toast({
          title: 'Fel',
          description: result.error || 'Kunde inte soka mallar',
          variant: 'destructive',
        })
        setIsSearching(false)
        return
      }

      setDescribeResult(result.data)
      setSelectedTemplateId(null)
      setStep('pick')
    } catch {
      toast({
        title: 'Fel',
        description: 'Nagot gick fel vid sokning',
        variant: 'destructive',
      })
    }
    setIsSearching(false)
  }

  async function handleBook() {
    if (!transaction || !selectedTemplateId || !describeResult) return

    setIsBooking(true)
    try {
      const response = await fetch(`/api/transactions/${transaction.id}/categorize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          is_business: true,
          template_id: selectedTemplateId,
          user_description: describeResult.user_description,
        }),
      })
      const result = await response.json()
      if (!response.ok) {
        toast({
          title: 'Fel',
          description: result.error || 'Kunde inte bokfora transaktion',
          variant: 'destructive',
        })
        setIsBooking(false)
        return
      }

      if (describeResult.batch_candidate_count > 0) {
        setStep('batch')
        setIsBooking(false)
        onCategorized(transaction.id, result.journal_entry_id || null)
      } else {
        toast({ title: 'Bokford', description: 'Transaktion bokford och verifikation skapad' })
        onCategorized(transaction.id, result.journal_entry_id || null)
        handleOpenChange(false)
      }
    } catch {
      toast({
        title: 'Fel',
        description: 'Nagot gick fel vid bokforing',
        variant: 'destructive',
      })
      setIsBooking(false)
    }
  }

  async function handleBatchApply() {
    if (!describeResult || !selectedTemplateId) return

    setIsBatchApplying(true)
    try {
      const response = await fetch('/api/transactions/batch-describe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          merchant_name: describeResult.merchant_name,
          template_id: selectedTemplateId,
          is_business: true,
          user_description: describeResult.user_description,
        }),
      })
      const result = await response.json()
      if (!response.ok) {
        toast({
          title: 'Fel',
          description: result.error || 'Kunde inte bokfora batch',
          variant: 'destructive',
        })
        setIsBatchApplying(false)
        return
      }

      const applied = result.data?.applied || 0
      const errors = result.data?.errors || []
      if (errors.length > 0) {
        toast({
          title: 'Delvis klart',
          description: `${applied} lyckades, ${errors.length} misslyckades`,
          variant: 'destructive',
        })
      } else {
        toast({
          title: 'Klart',
          description: `${applied} transaktioner bokforda`,
        })
      }
      onBatchApplied?.(applied)
      handleOpenChange(false)
    } catch {
      toast({
        title: 'Fel',
        description: 'Nagot gick fel vid batchbokforing',
        variant: 'destructive',
      })
      setIsBatchApplying(false)
    }
  }

  function handleSkipBatch() {
    toast({ title: 'Bokford', description: 'Transaktion bokford och verifikation skapad' })
    handleOpenChange(false)
  }

  if (!transaction) return null

  const isIncome = transaction.amount > 0

  return (
    <Dialog open={open} onOpenChange={(isBooking || isBatchApplying) ? undefined : handleOpenChange}>
      <DialogContent className="max-w-md max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>
            {step === 'describe' && 'Beskriv transaktion'}
            {step === 'pick' && 'Valj mall'}
            {step === 'batch' && 'Bokfor liknande'}
          </DialogTitle>
          <DialogDescription>
            {step === 'describe' && 'Beskriv vad transaktionen galler sa hittar vi ratt bokforingsmall'}
            {step === 'pick' && 'Valj den mall som stammer bast'}
            {step === 'batch' && 'Transaktion bokford!'}
          </DialogDescription>
        </DialogHeader>

        {/* Transaction summary - shown in describe and pick steps */}
        {(step === 'describe' || step === 'pick') && (
          <div className="flex items-center gap-3 rounded-lg border p-3">
            <div
              className={`h-9 w-9 rounded-full flex items-center justify-center flex-shrink-0 ${
                isIncome
                  ? 'bg-success/10 text-success'
                  : 'bg-destructive/10 text-destructive'
              }`}
            >
              {isIncome ? (
                <ArrowUpRight className="h-4 w-4" />
              ) : (
                <ArrowDownRight className="h-4 w-4" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-medium text-sm truncate">{transaction.description}</p>
              <p className="text-xs text-muted-foreground">{formatDate(transaction.date)}</p>
            </div>
            <p className={`font-medium text-sm flex-shrink-0 ${isIncome ? 'text-success' : ''}`}>
              {isIncome ? '+' : ''}
              {formatCurrency(transaction.amount, transaction.currency)}
            </p>
          </div>
        )}

        {/* Step 1: Describe */}
        {step === 'describe' && (
          <div className="space-y-4">
            <Textarea
              placeholder="Beskriv vad transaktionen galler, t.ex. 'lunch med kund' eller 'kontorsmaterial'"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey && description.trim().length >= 3) {
                  e.preventDefault()
                  handleSearch()
                }
              }}
            />
            <div className="flex flex-wrap gap-1.5">
              {getExamplePrompts(transaction).map((prompt) => (
                <button
                  key={prompt}
                  type="button"
                  className="text-xs px-2.5 py-1 rounded-full border bg-muted/50 hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                  onClick={() => setDescription(prompt)}
                >
                  {prompt}
                </button>
              ))}
            </div>
            <Button
              className="w-full"
              disabled={description.trim().length < 3 || isSearching}
              onClick={handleSearch}
            >
              {isSearching ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Search className="mr-2 h-4 w-4" />
              )}
              {isSearching ? 'Soker...' : 'Sok'}
            </Button>
          </div>
        )}

        {/* Step 2: Pick template */}
        {step === 'pick' && describeResult && (
          <div className="space-y-4 min-h-0 flex flex-col">
            {describeResult.needs_more_detail && (
              <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-500/10 text-amber-700 dark:text-amber-400 text-sm">
                <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5" />
                <p>Resultaten ar osakra. Forsok beskriv mer detaljerat for battre traffar.</p>
              </div>
            )}

            <div className="overflow-y-auto max-h-[40vh] space-y-2 pr-1">
              {describeResult.templates.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">
                  Inga matchande mallar hittades. Forsok med en annan beskrivning.
                </p>
              ) : (
                describeResult.templates.map((template) => (
                  <Card
                    key={template.template_id}
                    className={`cursor-pointer transition-colors hover:border-primary/50 ${
                      selectedTemplateId === template.template_id
                        ? 'border-primary bg-primary/5'
                        : ''
                    }`}
                    onClick={() => setSelectedTemplateId(template.template_id)}
                  >
                    <CardContent className="py-3 px-4">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="font-medium text-sm">{template.name_sv}</p>
                          {template.description_sv && (
                            <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                              {template.description_sv}
                            </p>
                          )}
                          <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                            <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                              D: {formatAccountWithName(template.debit_account)}
                            </Badge>
                            <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                              K: {formatAccountWithName(template.credit_account)}
                            </Badge>
                            {template.vat_treatment && template.vat_treatment !== 'exempt' && (
                              <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                                Moms {Math.round(template.vat_rate * 100)}%
                              </Badge>
                            )}
                            {template.vat_treatment === 'exempt' && (
                              <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                                Momsfritt
                              </Badge>
                            )}
                            {template.deductibility === 'non_deductible' && (
                              <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-amber-600 border-amber-300">
                                Ej avdragsgill
                              </Badge>
                            )}
                            {template.deductibility === 'conditional' && (
                              <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-amber-600 border-amber-300">
                                Villkorligt avdrag
                              </Badge>
                            )}
                          </div>
                          {(template.deductibility_note_sv || template.special_rules_sv) && selectedTemplateId === template.template_id && (
                            <div className="mt-2 space-y-1">
                              {template.deductibility_note_sv && (
                                <p className="text-[11px] text-amber-600 dark:text-amber-400">
                                  {template.deductibility_note_sv}
                                </p>
                              )}
                              {template.special_rules_sv && (
                                <p className="text-[11px] text-muted-foreground italic">
                                  {template.special_rules_sv}
                                </p>
                              )}
                            </div>
                          )}
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <Badge
                            variant={template.confidence >= 0.7 ? 'default' : 'outline'}
                            className="text-[10px] px-1.5 py-0"
                          >
                            {Math.round(template.confidence * 100)}%
                          </Badge>
                          {selectedTemplateId === template.template_id && (
                            <Check className="h-4 w-4 text-primary" />
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))
              )}
            </div>

            {/* Journal entry preview for selected template */}
            {selectedTemplateId && (() => {
              const tmpl = describeResult.templates.find(t => t.template_id === selectedTemplateId)
              if (!tmpl) return null
              return (
                <JournalEntryPreview
                  amount={transaction.amount}
                  currency={transaction.currency}
                  templateDebitAccount={tmpl.debit_account}
                  templateCreditAccount={tmpl.credit_account}
                  templateVatRate={tmpl.vat_rate}
                />
              )
            })()}

            <div className="flex gap-2 pt-2">
              <Button
                variant="ghost"
                className="flex-shrink-0"
                onClick={() => {
                  setStep('describe')
                  setSelectedTemplateId(null)
                }}
              >
                <ArrowLeft className="mr-2 h-4 w-4" />
                Beskriv igen
              </Button>
              <Button
                className="flex-1"
                disabled={!selectedTemplateId || isBooking}
                onClick={handleBook}
              >
                {isBooking ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Check className="mr-2 h-4 w-4" />
                )}
                {isBooking ? 'Bokfor...' : 'Bokfor'}
              </Button>
            </div>
          </div>
        )}

        {/* Step 3: Batch offer */}
        {step === 'batch' && describeResult && (
          <div className="space-y-4">
            <div className="flex items-center gap-3 p-4 rounded-lg bg-success/10">
              <CheckCircle2 className="h-6 w-6 text-success flex-shrink-0" />
              <p className="text-sm font-medium">Transaktionen ar bokford!</p>
            </div>

            <p className="text-sm text-muted-foreground">
              Det finns ytterligare{' '}
              <span className="font-medium text-foreground">
                {describeResult.batch_candidate_count}
              </span>{' '}
              obokforda transaktioner fran{' '}
              <span className="font-medium text-foreground">
                {describeResult.merchant_name}
              </span>
              . Anvand samma mall?
            </p>

            <div className="flex gap-2">
              <Button
                variant="outline"
                className="flex-1"
                onClick={handleSkipBatch}
                disabled={isBatchApplying}
              >
                Nej, bara den har
              </Button>
              <Button
                className="flex-1"
                onClick={handleBatchApply}
                disabled={isBatchApplying}
              >
                {isBatchApplying ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : null}
                {isBatchApplying
                  ? 'Bokfor...'
                  : `Ja, bokfor alla ${describeResult.batch_candidate_count} st`}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
