'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useToast } from '@/components/ui/use-toast'
import { Plus, Trash2 } from 'lucide-react'
import { ConfirmationDialog } from '@/components/ui/confirmation-dialog'
import { JournalEntryReviewContent } from '@/components/bookkeeping/JournalEntryReviewContent'
import DocumentUploadZone from '@/components/bookkeeping/DocumentUploadZone'
import AccountCombobox from '@/components/bookkeeping/AccountCombobox'
import type { UploadedFile } from '@/components/bookkeeping/DocumentUploadZone'
import type { CreateJournalEntryLineInput, FiscalPeriod, BASAccount } from '@/types'

interface Props {
  onCreated?: () => void
}

interface FormLine {
  account_number: string
  debit_amount: string
  credit_amount: string
  line_description: string
}

export default function JournalEntryForm({ onCreated }: Props) {
  const { toast } = useToast()
  const [periods, setPeriods] = useState<FiscalPeriod[]>([])
  const [selectedPeriod, setSelectedPeriod] = useState('')
  const [entryDate, setEntryDate] = useState(new Date().toISOString().split('T')[0])
  const [description, setDescription] = useState('')
  const [lines, setLines] = useState<FormLine[]>([
    { account_number: '', debit_amount: '', credit_amount: '', line_description: '' },
    { account_number: '', debit_amount: '', credit_amount: '', line_description: '' },
  ])
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [showReview, setShowReview] = useState(false)
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([])
  const [accounts, setAccounts] = useState<BASAccount[]>([])

  const isUploading = uploadedFiles.some((f) => f.status === 'uploading')

  useEffect(() => {
    fetchPeriods()
    fetchAccounts()
  }, [])

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

  const addLine = () => {
    setLines([
      ...lines,
      { account_number: '', debit_amount: '', credit_amount: '', line_description: '' },
    ])
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

    setLines(updated)
  }

  const totalDebit = lines.reduce((sum, l) => sum + (parseFloat(l.debit_amount) || 0), 0)
  const totalCredit = lines.reduce((sum, l) => sum + (parseFloat(l.credit_amount) || 0), 0)
  const isBalanced = Math.abs(totalDebit - totalCredit) < 0.01 && totalDebit > 0

  const handleReview = () => {
    if (!selectedPeriod || !description || !isBalanced) return
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
      }))

    const res = await fetch('/api/bookkeeping/journal-entries', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fiscal_period_id: selectedPeriod,
        entry_date: entryDate,
        description,
        source_type: 'manual',
        lines: entryLines,
      }),
    })

    const result = await res.json()

    if (result.error) {
      toast({
        title: 'Fel',
        description: result.error,
        variant: 'destructive',
      })
    } else {
      // Link uploaded documents to the new journal entry (non-blocking)
      const journalEntryId = result.data?.id
      if (journalEntryId) {
        const filesToLink = uploadedFiles.filter((f) => f.status === 'uploaded' && f.id)
        for (const file of filesToLink) {
          try {
            await fetch(`/api/documents/${file.id}/link`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ journal_entry_id: journalEntryId }),
            })
          } catch (linkErr) {
            console.error('[JournalEntryForm] Failed to link document:', linkErr)
          }
        }
      }

      toast({
        title: 'Verifikation skapad',
        description: `Verifikation ${result.data?.voucher_series}${result.data?.voucher_number} har skapats.`,
      })
      setShowReview(false)
      // Reset form
      setDescription('')
      setUploadedFiles([])
      setLines([
        { account_number: '', debit_amount: '', credit_amount: '', line_description: '' },
        { account_number: '', debit_amount: '', credit_amount: '', line_description: '' },
      ])
      onCreated?.()
    }

    setIsSubmitting(false)
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Ny verifikation</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-3 gap-4">
          <div>
            <Label>Räkenskapsår</Label>
            <select
              value={selectedPeriod}
              onChange={(e) => setSelectedPeriod(e.target.value)}
              className="w-full mt-1 rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              {periods.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label>Datum</Label>
            <Input
              type="date"
              value={entryDate}
              onChange={(e) => setEntryDate(e.target.value)}
            />
          </div>
          <div>
            <Label>Beskrivning</Label>
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Verifikationstext..."
            />
          </div>
        </div>

        {/* Entry lines */}
        <div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th className="py-2 w-24">Konto</th>
                <th className="py-2">Beskrivning</th>
                <th className="py-2 w-32 text-right">Debet</th>
                <th className="py-2 w-32 text-right">Kredit</th>
                <th className="py-2 w-10"></th>
              </tr>
            </thead>
            <tbody>
              {lines.map((line, index) => (
                <tr key={index} className="border-b">
                  <td className="py-1">
                    <AccountCombobox
                      value={line.account_number}
                      accounts={accounts}
                      onChange={(num) => updateLine(index, 'account_number', num)}
                    />
                  </td>
                  <td className="py-1 px-1">
                    <Input
                      value={line.line_description}
                      onChange={(e) => updateLine(index, 'line_description', e.target.value)}
                      placeholder="Radtext..."
                      className="h-8"
                    />
                  </td>
                  <td className="py-1">
                    <Input
                      type="number"
                      value={line.debit_amount}
                      onChange={(e) => updateLine(index, 'debit_amount', e.target.value)}
                      placeholder="0,00"
                      className="text-right h-8"
                      min="0"
                      step="0.01"
                    />
                  </td>
                  <td className="py-1">
                    <Input
                      type="number"
                      value={line.credit_amount}
                      onChange={(e) => updateLine(index, 'credit_amount', e.target.value)}
                      placeholder="0,00"
                      className="text-right h-8"
                      min="0"
                      step="0.01"
                    />
                  </td>
                  <td className="py-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => removeLine(index)}
                      disabled={lines.length <= 2}
                      className="h-8 w-8 p-0"
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="font-semibold">
                <td colSpan={2} className="py-2">
                  Summa
                </td>
                <td
                  className={`py-2 text-right ${
                    isBalanced ? 'text-green-600' : 'text-red-600'
                  }`}
                >
                  {totalDebit.toLocaleString('sv-SE', { minimumFractionDigits: 2 })}
                </td>
                <td
                  className={`py-2 text-right ${
                    isBalanced ? 'text-green-600' : 'text-red-600'
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
        <div>
          <Label className="mb-2 block">Underlag</Label>
          <DocumentUploadZone
            files={uploadedFiles}
            onFilesChange={setUploadedFiles}
          />
        </div>

        {!isBalanced && totalDebit > 0 && (
          <p className="text-sm text-red-600">
            Differens: {Math.abs(totalDebit - totalCredit).toLocaleString('sv-SE', { minimumFractionDigits: 2 })} kr
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
          warningText="En verifikation skapas och kan inte ändras efteråt. Korrigeringar görs genom storno."
        >
          <JournalEntryReviewContent
            periodName={periods.find((p) => p.id === selectedPeriod)?.name || ''}
            entryDate={entryDate}
            description={description}
            lines={lines}
            totalDebit={totalDebit}
            totalCredit={totalCredit}
            attachmentCount={uploadedFiles.filter((f) => f.status === 'uploaded').length}
          />
        </ConfirmationDialog>
      </CardContent>
    </Card>
  )
}
