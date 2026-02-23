'use client'

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { formatCurrency, formatDate } from '@/lib/utils'
import { ArrowUpRight, ArrowDownRight } from 'lucide-react'
import JournalEntryForm from '@/components/bookkeeping/JournalEntryForm'
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
      { account_number: '', debit_amount: amountStr, credit_amount: '', line_description: '' },
      { account_number: '1930', debit_amount: '', credit_amount: amountStr, line_description: 'Företagskonto' },
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
  if (!transaction) return null

  const isIncome = transaction.amount > 0

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
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

        <JournalEntryForm
          key={transaction.id}
          embedded
          initialLines={buildInitialLines(transaction)}
          initialDate={transaction.date}
          initialDescription={transaction.description}
          submitUrl={`/api/transactions/${transaction.id}/book`}
          sourceType="bank_transaction"
          sourceId={transaction.id}
          onEntryCreated={(entryId) => onBooked(transaction.id, entryId)}
        />
      </DialogContent>
    </Dialog>
  )
}
