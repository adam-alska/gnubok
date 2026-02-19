'use client'

import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { formatCurrency } from '@/lib/utils'
import { Plus, Trash2, AlertCircle } from 'lucide-react'
import type { Transaction } from '@/types'

interface SplitEntry {
  amount: string
  description: string
  debit_account: string
  credit_account: string
}

interface SplitTransactionDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  transaction: Transaction
  onSplit: (splits: { amount: number; description: string; debit_account: string; credit_account: string }[]) => void
  isLoading?: boolean
}

export default function SplitTransactionDialog({
  open,
  onOpenChange,
  transaction,
  onSplit,
  isLoading,
}: SplitTransactionDialogProps) {
  const totalAmount = Math.abs(transaction.amount)
  const isExpense = transaction.amount < 0

  const [splits, setSplits] = useState<SplitEntry[]>([
    {
      amount: '',
      description: transaction.description,
      debit_account: isExpense ? '' : '1930',
      credit_account: isExpense ? '1930' : '',
    },
    {
      amount: '',
      description: '',
      debit_account: isExpense ? '' : '1930',
      credit_account: isExpense ? '1930' : '',
    },
  ])

  function addSplit() {
    setSplits([
      ...splits,
      {
        amount: '',
        description: '',
        debit_account: isExpense ? '' : '1930',
        credit_account: isExpense ? '1930' : '',
      },
    ])
  }

  function removeSplit(index: number) {
    if (splits.length <= 2) return
    setSplits(splits.filter((_, i) => i !== index))
  }

  function updateSplit(index: number, field: keyof SplitEntry, value: string) {
    const updated = [...splits]
    updated[index] = { ...updated[index], [field]: value }
    setSplits(updated)
  }

  const parsedAmounts = splits.map((s) => parseFloat(s.amount) || 0)
  const splitTotal = parsedAmounts.reduce((sum, a) => sum + a, 0)
  const remainder = totalAmount - splitTotal
  const isBalanced = Math.abs(remainder) < 0.01

  const allValid = splits.every(
    (s) =>
      (parseFloat(s.amount) || 0) > 0 &&
      s.description.trim().length > 0 &&
      s.debit_account.length === 4 &&
      s.credit_account.length === 4
  )

  function handleSubmit() {
    if (!allValid || !isBalanced) return

    onSplit(
      splits.map((s) => ({
        amount: parseFloat(s.amount),
        description: s.description,
        debit_account: s.debit_account,
        credit_account: s.credit_account,
      }))
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Dela transaktion</DialogTitle>
          <DialogDescription>
            Dela upp {formatCurrency(totalAmount, transaction.currency)} i flera bokforingsposter.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Original transaction info */}
          <div className="rounded-lg bg-muted/50 p-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">{transaction.description}</span>
              <span className="font-medium">{formatCurrency(totalAmount, transaction.currency)}</span>
            </div>
          </div>

          {/* Split entries */}
          <div className="space-y-3">
            {splits.map((split, index) => (
              <div
                key={index}
                className="rounded-lg border p-3 space-y-3"
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Del {index + 1}</span>
                  {splits.length > 2 && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => removeSplit(index)}
                      className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs">Belopp</Label>
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="0.00"
                      value={split.amount}
                      onChange={(e) => updateSplit(index, 'amount', e.target.value)}
                      className="font-mono"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Beskrivning</Label>
                    <Input
                      placeholder="Beskrivning"
                      value={split.description}
                      onChange={(e) => updateSplit(index, 'description', e.target.value)}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs">Debet</Label>
                    <Input
                      placeholder="Konto"
                      value={split.debit_account}
                      onChange={(e) =>
                        updateSplit(index, 'debit_account', e.target.value.replace(/\D/g, '').slice(0, 4))
                      }
                      maxLength={4}
                      className="font-mono"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Kredit</Label>
                    <Input
                      placeholder="Konto"
                      value={split.credit_account}
                      onChange={(e) =>
                        updateSplit(index, 'credit_account', e.target.value.replace(/\D/g, '').slice(0, 4))
                      }
                      maxLength={4}
                      className="font-mono"
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Add split button */}
          <Button variant="outline" size="sm" onClick={addSplit} className="w-full">
            <Plus className="h-3.5 w-3.5 mr-1.5" />
            Lägg till del
          </Button>

          {/* Balance summary */}
          <div
            className={`rounded-lg p-3 flex items-center justify-between ${
              isBalanced
                ? 'bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-800'
                : 'bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800'
            }`}
          >
            <div className="flex items-center gap-2 text-sm">
              {!isBalanced && <AlertCircle className="h-4 w-4 text-amber-600" />}
              <span>
                Summa delar: {formatCurrency(splitTotal)} av {formatCurrency(totalAmount)}
              </span>
            </div>
            {!isBalanced && (
              <span className="text-sm font-medium text-amber-700 dark:text-amber-400">
                Aterstar: {formatCurrency(remainder)}
              </span>
            )}
            {isBalanced && (
              <span className="text-sm font-medium text-green-700 dark:text-green-400">
                Balanserat
              </span>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isLoading}>
            Avbryt
          </Button>
          <Button onClick={handleSubmit} disabled={!allValid || !isBalanced || isLoading}>
            {isLoading ? 'Delar...' : `Dela i ${splits.length} poster`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
