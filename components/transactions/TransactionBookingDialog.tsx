'use client'

import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { useToast } from '@/components/ui/use-toast'
import { formatCurrency, formatDate } from '@/lib/utils'
import { ArrowUpRight, ArrowDownRight, ChevronDown, ChevronUp, Paperclip } from 'lucide-react'
import JournalEntryForm from '@/components/bookkeeping/JournalEntryForm'
import DocumentUploadZone from '@/components/bookkeeping/DocumentUploadZone'
import type { UploadedFile } from '@/components/bookkeeping/DocumentUploadZone'
import type { FormLine } from '@/components/bookkeeping/JournalEntryForm'
import type { TransactionWithInvoice } from './transaction-types'

interface TransactionBookingDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  transaction: TransactionWithInvoice | null
  onBooked: (transactionId: string, journalEntryId: string) => void
}

function buildInitialLines(transaction: TransactionWithInvoice): FormLine[] {
  const amount = Math.round(Math.abs(transaction.amount_sek ?? transaction.amount) * 100) / 100
  const amountStr = amount.toFixed(2)
  const isExpense = transaction.amount < 0

  if (isExpense) {
    return [
      { account_number: '1930', debit_amount: '', credit_amount: amountStr, line_description: 'Företagskonto' },
      { account_number: '', debit_amount: amountStr, credit_amount: '', line_description: '' },
    ]
  }

  return [
    { account_number: '1930', debit_amount: amountStr, credit_amount: '', line_description: 'Företagskonto' },
    { account_number: '', debit_amount: '', credit_amount: amountStr, line_description: '' },
  ]
}

export default function TransactionBookingDialog({
  open,
  onOpenChange,
  transaction,
  onBooked,
}: TransactionBookingDialogProps) {
  const { toast } = useToast()
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([])
  const [showUploadZone, setShowUploadZone] = useState(false)

  if (!transaction) return null

  const isIncome = transaction.amount > 0

  const handleBooked = async (transactionId: string, journalEntryId: string) => {
    // Link any uploaded documents to the new journal entry
    const filesToLink = uploadedFiles.filter((f) => f.status === 'uploaded' && f.id)
    if (filesToLink.length > 0) {
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

    setUploadedFiles([])
    setShowUploadZone(false)
    onBooked(transactionId, journalEntryId)
  }

  return (
    <Dialog open={open} onOpenChange={(o) => {
      if (!o) {
        setUploadedFiles([])
        setShowUploadZone(false)
      }
      onOpenChange(o)
    }}>
      <DialogContent className="sm:max-w-2xl max-h-[95dvh] sm:max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Bokför transaktion</DialogTitle>
          <DialogDescription>
            Skapa en verifikation för transaktionen
          </DialogDescription>
        </DialogHeader>

        {/* Transaction summary */}
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

        {/* Document upload section */}
        <div className="rounded-lg border">
          <button
            type="button"
            onClick={() => setShowUploadZone(!showUploadZone)}
            className="flex items-center justify-between w-full px-3 py-2.5 text-sm hover:bg-muted/50 transition-colors"
          >
            <div className="flex items-center gap-2">
              <Paperclip className="h-4 w-4 text-muted-foreground" />
              <span className="font-medium">Underlag (valfritt)</span>
              {uploadedFiles.filter((f) => f.status === 'uploaded').length > 0 && (
                <span className="text-xs text-muted-foreground">
                  {uploadedFiles.filter((f) => f.status === 'uploaded').length} bifogade
                </span>
              )}
            </div>
            {showUploadZone ? (
              <ChevronUp className="h-4 w-4 text-muted-foreground" />
            ) : (
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            )}
          </button>
          {showUploadZone && (
            <div className="px-3 pb-3">
              <DocumentUploadZone
                files={uploadedFiles}
                onFilesChange={setUploadedFiles}
                compact
              />
            </div>
          )}
        </div>

        <JournalEntryForm
          key={transaction.id}
          embedded
          initialLines={buildInitialLines(transaction)}
          initialDate={transaction.date}
          initialDescription={transaction.description}
          submitUrl={`/api/transactions/${transaction.id}/book`}
          sourceType="bank_transaction"
          sourceId={transaction.id}
          onEntryCreated={(entryId) => handleBooked(transaction.id, entryId)}
        />
      </DialogContent>
    </Dialog>
  )
}
