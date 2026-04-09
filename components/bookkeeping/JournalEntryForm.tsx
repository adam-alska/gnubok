'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useToast } from '@/components/ui/use-toast'
import { Plus, Trash2, AlertTriangle } from 'lucide-react'
import { ConfirmationDialog } from '@/components/ui/confirmation-dialog'
import { JournalEntryReviewContent } from '@/components/bookkeeping/JournalEntryReviewContent'
import DocumentUploadZone from '@/components/bookkeeping/DocumentUploadZone'
import AccountCombobox from '@/components/bookkeeping/AccountCombobox'
import { getErrorMessage } from '@/lib/errors/get-error-message'
import { formatCurrency } from '@/lib/utils'
import { useUnsavedChanges } from '@/lib/hooks/use-unsaved-changes'
import type { UploadedFile } from '@/components/bookkeeping/DocumentUploadZone'
import type { CreateJournalEntryLineInput, FiscalPeriod, BASAccount, JournalEntrySourceType } from '@/types'

export interface FormLine {
  account_number: string
  debit_amount: string
  credit_amount: string
  line_description: string
  currency?: string
  amount_in_currency?: number
  exchange_rate?: number
}

interface Props {
  onCreated?: () => void
  onEntryCreated?: (entryId: string) => void
  initialLines?: FormLine[]
  initialDate?: string
  initialDescription?: string
  sourceType?: JournalEntrySourceType
  sourceId?: string
  submitUrl?: string
  embedded?: boolean
}

const BLANK_LINE: FormLine = { account_number: '', debit_amount: '', credit_amount: '', line_description: '' }

export default function JournalEntryForm({
  onCreated,
  onEntryCreated,
  initialLines,
  initialDate,
  initialDescription,
  sourceType,
  sourceId,
  submitUrl,
  embedded,
}: Props) {
  const { toast } = useToast()
  const [periods, setPeriods] = useState<FiscalPeriod[]>([])
  const [selectedPeriod, setSelectedPeriod] = useState('')
  const [entryDate, setEntryDate] = useState(initialDate ?? new Date().toISOString().split('T')[0])
  const [description, setDescription] = useState(initialDescription ?? '')
  const [lines, setLines] = useState<FormLine[]>(
    initialLines ?? [{ ...BLANK_LINE }, { ...BLANK_LINE }]
  )
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [showReview, setShowReview] = useState(false)
  const [showNoDocWarning, setShowNoDocWarning] = useState(false)
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([])
  const [accounts, setAccounts] = useState<BASAccount[]>([])

  const isUploading = uploadedFiles.some((f) => f.status === 'uploading')

  const hasContent = description !== '' ||
    lines.some(l => l.account_number !== '' || l.debit_amount !== '' || l.credit_amount !== '') ||
    uploadedFiles.length > 0
  useUnsavedChanges(hasContent)

  async function fetchPeriods() {
    const res = await fetch('/api/bookkeeping/fiscal-periods')
    const { data } = await res.json()
    setPeriods(data || [])
    if (data && data.length > 0) {
      setSelectedPeriod(data[0].id)
    }
  }

  async function fetchAccounts() {
    const res = await fetch('/api/bookkeeping/accounts')
    const { data } = await res.json()
    setAccounts(data || [])
  }

  useEffect(() => {
    fetchPeriods()
    fetchAccounts()
  }, [])

  const addLine = () => {
    setLines([...lines, { ...BLANK_LINE }])
  }

  const removeLine = (index: number) => {
    if (lines.length <= 2) return
    setLines(lines.filter((_, i) => i !== index))
  }

  const updateLine = (index: number, field: keyof FormLine, value: string) => {
    const updated = [...lines]
    updated[index] = { ...updated[index], [field]: value }

    // If entering debit, clear credit and vice versa
    if (field === 'debit_amount' && value) {
      updated[index].credit_amount = ''
    } else if (field === 'credit_amount' && value) {
      updated[index].debit_amount = ''
    }

    // Auto-fill line description from account name when selecting an account
    if (field === 'account_number' && value) {
      const account = accounts.find((a) => a.account_number === value)
      if (account) {
        updated[index].line_description = account.account_name
      }

      // Auto-fill balancing amount when both amount fields are empty
      if (!updated[index].debit_amount && !updated[index].credit_amount) {
        const otherLines = updated.filter((_, i) => i !== index)
        const otherDebit = otherLines.reduce((sum, l) => sum + (parseFloat(l.debit_amount) || 0), 0)
        const otherCredit = otherLines.reduce((sum, l) => sum + (parseFloat(l.credit_amount) || 0), 0)
        const diff = Math.round((otherCredit - otherDebit) * 100) / 100
        if (diff > 0) {
          updated[index].debit_amount = diff.toFixed(2)
        } else if (diff < 0) {
          updated[index].credit_amount = Math.abs(diff).toFixed(2)
        }
      }
    }

    setLines(updated)
  }

  const totalDebit = lines.reduce((sum, l) => sum + (parseFloat(l.debit_amount) || 0), 0)
  const totalCredit = lines.reduce((sum, l) => sum + (parseFloat(l.credit_amount) || 0), 0)
  const isBalanced = Math.round((totalDebit - totalCredit) * 100) === 0 && totalDebit > 0

  const handleReview = () => {
    if (!selectedPeriod || !description || !isBalanced) return
    const hasDocuments = uploadedFiles.some((f) => f.status === 'uploaded')
    if (!embedded && !hasDocuments) {
      setShowNoDocWarning(true)
      return
    }
    setShowReview(true)
  }

  const handleConfirm = async () => {
    setIsSubmitting(true)

    const entryLines: CreateJournalEntryLineInput[] = lines
      .filter((l) => l.account_number && (l.debit_amount || l.credit_amount))
      .map((l) => ({
        account_number: l.account_number,
        debit_amount: parseFloat(l.debit_amount) || 0,
        credit_amount: parseFloat(l.credit_amount) || 0,
        line_description: l.line_description || undefined,
        ...(l.currency ? { currency: l.currency } : {}),
        ...(l.amount_in_currency != null ? { amount_in_currency: l.amount_in_currency } : {}),
        ...(l.exchange_rate != null ? { exchange_rate: l.exchange_rate } : {}),
      }))

    const url = submitUrl ?? '/api/bookkeeping/journal-entries'

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fiscal_period_id: selectedPeriod,
        entry_date: entryDate,
        description,
        source_type: sourceType ?? 'manual',
        source_id: sourceId,
        lines: entryLines,
      }),
    })

    const result = await res.json()

    if (result.error) {
      toast({
        title: 'Kunde inte skapa verifikation',
        description: getErrorMessage(result, { context: 'journal_entry', statusCode: res.status }),
        variant: 'destructive',
      })
    } else {
      // Link uploaded documents to the new journal entry (non-blocking)
      const journalEntryId = result.data?.id ?? result.journal_entry_id
      if (journalEntryId && uploadedFiles.length > 0) {
        const filesToLink = uploadedFiles.filter((f) => f.status === 'uploaded' && f.id)
        let linkFailCount = 0
        for (const file of filesToLink) {
          try {
            await fetch(`/api/documents/${file.id}/link`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ journal_entry_id: journalEntryId }),
            })
          } catch {
            linkFailCount++
          }
        }
        if (linkFailCount > 0) {
          toast({
            title: 'Underlag kunde inte bifogas',
            description: `${linkFailCount} fil(er) kunde inte länkas till verifikationen. Försök igen via bokföringssidan.`,
            variant: 'destructive',
          })
        }
      }

      toast({
        title: 'Verifikation skapad',
        description: `Verifikation ${result.data?.voucher_series ?? ''}${result.data?.voucher_number ?? ''} har skapats.`,
      })
      setShowReview(false)
      // Reset form
      setDescription('')
      setUploadedFiles([])
      setLines([{ ...BLANK_LINE }, { ...BLANK_LINE }])
      onCreated?.()
      if (journalEntryId) {
        onEntryCreated?.(journalEntryId)
      }
    }

    setIsSubmitting(false)
  }

  const formContent = (
    <div className="space-y-4">
      <div className={`grid gap-4 grid-cols-1 ${embedded && initialDate ? 'sm:grid-cols-2' : 'sm:grid-cols-3'}`}>
        <div>
          <Label>Räkenskapsår</Label>
          <Select value={selectedPeriod} onValueChange={setSelectedPeriod}>
            <SelectTrigger className="mt-1">
              <SelectValue placeholder="Välj period" />
            </SelectTrigger>
            <SelectContent>
              {periods.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {!(embedded && initialDate) && (
          <div>
            <Label>Datum</Label>
            <Input
              type="date"
              value={entryDate}
              onChange={(e) => setEntryDate(e.target.value)}
            />
          </div>
        )}
        <div>
          <Label>Beskrivning</Label>
          <Input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Verifikationstext..."
          />
        </div>
      </div>

      {/* Entry lines — mobile cards */}
      <div className="sm:hidden space-y-3">
        {lines.map((line, index) => (
          <div key={index} className="rounded-lg border bg-card p-3 space-y-2">
            <div className="flex items-start gap-2">
              <div className="flex-1">
                <AccountCombobox
                  value={line.account_number}
                  accounts={accounts}
                  onChange={(num) => updateLine(index, 'account_number', num)}
                />
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => removeLine(index)}
                disabled={lines.length <= 2}
                className="h-8 w-8 p-0 min-h-[44px] min-w-[44px] shrink-0 -mr-1 -mt-1"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
            <Input
              value={line.line_description}
              onChange={(e) => updateLine(index, 'line_description', e.target.value)}
              placeholder="Radtext..."
            />
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Debet</Label>
                <Input
                  type="number"
                  value={line.debit_amount}
                  onChange={(e) => updateLine(index, 'debit_amount', e.target.value)}
                  placeholder="0,00"
                  className="text-right"
                  inputMode="decimal"
                  min="0"
                  step="0.01"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Kredit</Label>
                <Input
                  type="number"
                  value={line.credit_amount}
                  onChange={(e) => updateLine(index, 'credit_amount', e.target.value)}
                  placeholder="0,00"
                  className="text-right"
                  inputMode="decimal"
                  min="0"
                  step="0.01"
                />
              </div>
            </div>
          </div>
        ))}

        {/* Mobile totals */}
        <div className="flex justify-between items-center px-1 pt-2 font-semibold text-sm">
          <span>Summa</span>
          <div className="flex gap-4">
            <span className={isBalanced ? 'text-success' : 'text-destructive'}>
              D: {totalDebit.toLocaleString('sv-SE', { minimumFractionDigits: 2 })}
            </span>
            <span className={isBalanced ? 'text-success' : 'text-destructive'}>
              K: {totalCredit.toLocaleString('sv-SE', { minimumFractionDigits: 2 })}
            </span>
          </div>
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={addLine}
          className="w-full"
        >
          <Plus className="h-3 w-3 mr-1" />
          Lägg till rad
        </Button>
      </div>

      {/* Entry lines — desktop table */}
      <div className="hidden sm:block">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-muted-foreground">
              <th className="py-2 w-28">Konto</th>
              <th className="py-2 px-1">Beskrivning</th>
              <th className="py-2 w-32 px-1 text-right">Debet</th>
              <th className="py-2 w-32 px-1 text-right">Kredit</th>
              <th className="py-2 w-10"></th>
            </tr>
          </thead>
          <tbody>
            {lines.map((line, index) => (
              <tr key={index} className="border-b">
                <td className="py-1.5">
                  <AccountCombobox
                    value={line.account_number}
                    accounts={accounts}
                    onChange={(num) => updateLine(index, 'account_number', num)}
                  />
                </td>
                <td className="py-1.5 px-1">
                  <Input
                    value={line.line_description}
                    onChange={(e) => updateLine(index, 'line_description', e.target.value)}
                    placeholder="Radtext..."
                    className="h-8"
                  />
                </td>
                <td className="py-1.5 px-1">
                  <Input
                    type="number"
                    value={line.debit_amount}
                    onChange={(e) => updateLine(index, 'debit_amount', e.target.value)}
                    placeholder="0,00"
                    className="text-right h-8"
                    inputMode="decimal"
                    min="0"
                    step="0.01"
                  />
                </td>
                <td className="py-1.5 px-1">
                  <Input
                    type="number"
                    value={line.credit_amount}
                    onChange={(e) => updateLine(index, 'credit_amount', e.target.value)}
                    placeholder="0,00"
                    className="text-right h-8"
                    inputMode="decimal"
                    min="0"
                    step="0.01"
                  />
                </td>
                <td className="py-1.5">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => removeLine(index)}
                    disabled={lines.length <= 2}
                    className="h-8 w-8 p-0 min-h-[44px] min-w-[44px]"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="font-semibold">
              <td colSpan={2} className="py-2 px-1">
                Summa
              </td>
              <td
                className={`py-2 px-1 text-right ${
                  isBalanced ? 'text-success' : 'text-destructive'
                }`}
              >
                {totalDebit.toLocaleString('sv-SE', { minimumFractionDigits: 2 })}
              </td>
              <td
                className={`py-2 px-1 text-right ${
                  isBalanced ? 'text-success' : 'text-destructive'
                }`}
              >
                {totalCredit.toLocaleString('sv-SE', { minimumFractionDigits: 2 })}
              </td>
              <td></td>
            </tr>
          </tfoot>
        </table>

        <Button
          variant="outline"
          size="sm"
          onClick={addLine}
          className="mt-2"
        >
          <Plus className="h-3 w-3 mr-1" />
          Lägg till rad
        </Button>
      </div>

      {/* Document attachments */}
      {!embedded && (
        <div>
          <Label className="mb-2 block">Underlag</Label>
          <DocumentUploadZone
            files={uploadedFiles}
            onFilesChange={setUploadedFiles}
          />
        </div>
      )}

      {!isBalanced && totalDebit > 0 && (
        <p className="text-sm text-destructive">
          Differens: {formatCurrency(Math.abs(totalDebit - totalCredit))}
        </p>
      )}

      <div className="flex flex-col items-end gap-1">
        <Button
          onClick={handleReview}
          disabled={!isBalanced || !description || !selectedPeriod || isSubmitting || isUploading}
        >
          Granska & skapa
        </Button>
        {(!description || !selectedPeriod || isUploading) && (
          <div className="text-xs text-muted-foreground space-y-0.5 text-right">
            {!description && <p>Ange en beskrivning</p>}
            {!selectedPeriod && <p>Välj en räkenskapsperiod</p>}
            {isUploading && <p>Vänta tills filerna laddats upp</p>}
          </div>
        )}
      </div>

      <ConfirmationDialog
        open={showReview}
        onOpenChange={setShowReview}
        onConfirm={handleConfirm}
        isSubmitting={isSubmitting}
        title="Granska verifikation"
        warningText={embedded ? '' : 'En verifikation skapas och kan inte ändras efteråt. Korrigeringar görs genom storno.'}
      >
        <JournalEntryReviewContent
          periodName={periods.find((p) => p.id === selectedPeriod)?.name || ''}
          entryDate={entryDate}
          description={description}
          lines={lines}
          totalDebit={totalDebit}
          totalCredit={totalCredit}
          attachmentCount={uploadedFiles.filter((f) => f.status === 'uploaded').length}
          showBalanceBadge={!embedded}
          hideDate={!!embedded}
        />
      </ConfirmationDialog>

      {/* Warning dialog when no documents attached */}
      <ConfirmationDialog
        open={showNoDocWarning}
        onOpenChange={setShowNoDocWarning}
        onConfirm={() => {
          setShowNoDocWarning(false)
          setShowReview(true)
        }}
        isSubmitting={false}
        title="Underlag saknas"
        warningText="Inget underlag har bifogats. Enligt bokföringslagen (BFL) krävs underlag för varje bokföringspost."
        confirmLabel="Bokför utan underlag"
      >
        <div className="flex items-start gap-3 rounded-lg border border-warning/30 bg-warning/10 p-4">
          <AlertTriangle className="h-5 w-5 text-warning-foreground mt-0.5 shrink-0" />
          <div className="text-sm text-warning-foreground">
            <p className="font-medium mb-1">Inget underlag bifogat</p>
            <p>
              Enligt bokföringslagen (BFL 5 kap. 6-7 §§) ska varje bokföringspost ha en verifikation som
              underlag. Du kan bifoga underlag nu eller fortsätta utan.
            </p>
          </div>
        </div>
      </ConfirmationDialog>
    </div>
  )

  if (embedded) {
    return formContent
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Ny verifikation</CardTitle>
      </CardHeader>
      <CardContent>
        {formContent}
      </CardContent>
    </Card>
  )
}
