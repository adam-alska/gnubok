'use client'

import { useState, useEffect, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { formatCurrency, formatDate } from '@/lib/utils'
import { ArrowUpRight, ArrowDownRight, Check } from 'lucide-react'
import { getDefaultAccountForCategory } from '@/lib/bookkeeping/category-mapping'
import AccountCombobox from '@/components/bookkeeping/AccountCombobox'
import VatTreatmentSelect from './VatTreatmentSelect'
import type { TransactionWithInvoice } from './transaction-types'
import type { TransactionCategory, VatTreatment, BASAccount } from '@/types'

interface QuickReviewDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  transaction: TransactionWithInvoice | null
  category: TransactionCategory | null
  categoryLabel: string
  defaultAccount: string
  defaultVat: VatTreatment | 'none'
  onConfirm: (
    id: string,
    category: TransactionCategory,
    vatTreatment: VatTreatment | undefined,
    accountOverride: string | undefined
  ) => Promise<void>
}

export default function QuickReviewDialog({
  open,
  onOpenChange,
  transaction,
  category,
  categoryLabel,
  defaultAccount,
  defaultVat,
  onConfirm,
}: QuickReviewDialogProps) {
  const [accountOverride, setAccountOverride] = useState(defaultAccount)
  const [vatTreatment, setVatTreatment] = useState<VatTreatment | 'none'>(defaultVat)
  const [accounts, setAccounts] = useState<BASAccount[]>([])
  const [isProcessing, setIsProcessing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Handle account changes — clear VAT for liability/equity accounts (class 2)
  const handleAccountChange = useCallback((account: string) => {
    setAccountOverride(account)
    if (account.startsWith('2')) {
      setVatTreatment('none')
    }
  }, [])

  // Fetch accounts on mount
  useEffect(() => {
    async function fetchAccounts() {
      try {
        const res = await fetch('/api/bookkeeping/accounts')
        const data = await res.json()
        if (data.accounts) {
          setAccounts(data.accounts)
        }
      } catch {
        // Non-critical
      }
    }
    fetchAccounts()
  }, [])

  if (!transaction || !category) return null

  const isIncome = transaction.amount > 0
  const isLiabilityAccount = accountOverride.startsWith('2')

  async function handleConfirm() {
    if (!category || !transaction) return

    setIsProcessing(true)
    setError(null)
    try {
      const resolvedVat = vatTreatment === 'none' ? undefined : vatTreatment
      const catDefault = getDefaultAccountForCategory(category)
      const override = accountOverride && accountOverride !== catDefault
        ? accountOverride
        : undefined

      await onConfirm(transaction.id, category, resolvedVat, override)
    } catch {
      setError('Ett fel uppstod vid bokföring.')
      setIsProcessing(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={isProcessing ? undefined : onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Granska bokföring</DialogTitle>
          <DialogDescription>
            Kontrollera konto och moms innan du bokför
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

        {/* Category (read-only) */}
        <div>
          <label className="text-sm font-medium text-muted-foreground">Kategori</label>
          <div className="mt-1">
            <Badge variant="outline" className="text-sm py-1 px-3">{categoryLabel}</Badge>
          </div>
        </div>

        {/* Account */}
        <div>
          <label className="text-sm font-medium text-muted-foreground">Konto</label>
          <div className="mt-1">
            <AccountCombobox
              value={accountOverride}
              accounts={accounts}
              onChange={handleAccountChange}
            />
          </div>
        </div>

        {/* VAT treatment */}
        <div>
          <label className="text-sm font-medium text-muted-foreground">Momsbehandling</label>
          <div className="mt-1">
            <VatTreatmentSelect
              value={isLiabilityAccount ? 'none' : vatTreatment}
              onValueChange={setVatTreatment}
              disabled={isLiabilityAccount}
            />
            {isLiabilityAccount && (
              <p className="text-xs text-muted-foreground mt-1">
                Ingen moms för skuld-/eget kapital-konton
              </p>
            )}
          </div>
        </div>

        {error && (
          <div className="p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
            {error}
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-2 pt-2">
          <Button
            variant="outline"
            className="flex-1"
            onClick={() => onOpenChange(false)}
            disabled={isProcessing}
          >
            Avbryt
          </Button>
          <Button
            className="flex-1"
            onClick={handleConfirm}
            disabled={isProcessing || !accountOverride}
          >
            <Check className="mr-2 h-4 w-4" />
            {isProcessing ? 'Bokför...' : 'Bokför'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
