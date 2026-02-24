'use client'

import { useMemo } from 'react'
import { formatCurrency } from '@/lib/utils'
import { formatAccountWithName } from '@/lib/bookkeeping/client-account-names'
import { getVatRate, extractVatAmount, extractNetAmount } from '@/lib/bookkeeping/vat-entries'
import { getCategoryAccountMapping } from '@/lib/bookkeeping/category-mapping'
import type { TransactionCategory, VatTreatment } from '@/types'

interface PreviewLine {
  side: 'debet' | 'kredit'
  account: string
  amount: number
}

interface JournalEntryPreviewProps {
  amount: number
  currency?: string
  category?: TransactionCategory
  vatTreatment?: VatTreatment | 'none'
  accountOverride?: string
  /** For template-based bookings — overrides category mapping */
  templateDebitAccount?: string
  templateCreditAccount?: string
  templateVatRate?: number
}

export default function JournalEntryPreview({
  amount,
  currency = 'SEK',
  category,
  vatTreatment,
  accountOverride,
  templateDebitAccount,
  templateCreditAccount,
  templateVatRate,
}: JournalEntryPreviewProps) {
  const lines = useMemo(() => {
    const result: PreviewLine[] = []
    const absAmount = Math.abs(amount)

    // Template-based preview
    if (templateDebitAccount && templateCreditAccount) {
      const vatRate = templateVatRate ?? 0
      const vatAmt = extractVatAmount(absAmount, vatRate)
      const netAmt = extractNetAmount(absAmount, vatRate)

      result.push({ side: 'debet', account: templateDebitAccount, amount: netAmt })
      if (vatAmt > 0) {
        result.push({ side: 'debet', account: '2641', amount: vatAmt })
      }
      result.push({ side: 'kredit', account: templateCreditAccount, amount: absAmount })
      return result
    }

    // Category-based preview
    if (!category) return result

    const resolvedVat = vatTreatment === 'none' ? undefined : vatTreatment
    const mapping = getCategoryAccountMapping(category, amount, category !== 'private', 'enskild_firma', resolvedVat)

    const debitAccount = accountOverride && amount < 0 ? accountOverride : mapping.debitAccount
    const creditAccount = accountOverride && amount > 0 ? accountOverride : mapping.creditAccount

    const treatment = mapping.vatTreatment as VatTreatment | null
    const vatRate = treatment ? getVatRate(treatment) : 0
    const vatAmt = vatRate > 0 ? extractVatAmount(absAmount, vatRate) : 0
    const netAmt = vatRate > 0 ? extractNetAmount(absAmount, vatRate) : absAmount

    if (amount < 0) {
      // Expense: Debit expense + VAT, Credit bank
      result.push({ side: 'debet', account: debitAccount, amount: netAmt })
      if (vatAmt > 0 && mapping.vatDebitAccount) {
        result.push({ side: 'debet', account: mapping.vatDebitAccount, amount: vatAmt })
      }
      result.push({ side: 'kredit', account: creditAccount, amount: absAmount })
    } else {
      // Income: Debit bank, Credit revenue + VAT
      result.push({ side: 'debet', account: debitAccount, amount: absAmount })
      if (vatAmt > 0 && mapping.vatCreditAccount) {
        result.push({ side: 'kredit', account: mapping.vatCreditAccount, amount: vatAmt })
      }
      result.push({ side: 'kredit', account: creditAccount, amount: netAmt })
    }

    // Reverse charge: add offsetting lines
    if (treatment === 'reverse_charge' && amount < 0) {
      const rcVatAmt = Math.round(absAmount * 0.25 * 100) / 100
      result.push({ side: 'debet', account: '2645', amount: rcVatAmt })
      result.push({ side: 'kredit', account: '2614', amount: rcVatAmt })
    }

    return result
  }, [amount, category, vatTreatment, accountOverride, templateDebitAccount, templateCreditAccount, templateVatRate])

  if (lines.length === 0) return null

  return (
    <div className="rounded-lg border bg-muted/30 px-3 py-2.5">
      <p className="text-xs font-medium text-muted-foreground mb-1.5">Verifikation</p>
      <div className="space-y-0.5 font-mono text-xs">
        {lines.map((line, i) => (
          <div key={i} className="flex items-baseline gap-2">
            <span className={`w-12 text-right flex-shrink-0 ${line.side === 'debet' ? 'text-foreground' : 'text-muted-foreground'}`}>
              {line.side === 'debet' ? 'Debet' : 'Kredit'}
            </span>
            <span className="flex-1 truncate">{formatAccountWithName(line.account)}</span>
            <span className="flex-shrink-0 tabular-nums">{formatCurrency(line.amount, currency)}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
