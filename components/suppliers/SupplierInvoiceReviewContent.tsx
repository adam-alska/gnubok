'use client'

import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { AccountNumber } from '@/components/ui/account-number'
import { formatCurrency } from '@/lib/utils'
import type { Supplier } from '@/types'

interface ReviewLineItem {
  description: string
  amount: number
  account_number: string
  vat_rate: number
}

interface SupplierInvoiceReviewContentProps {
  supplier: Supplier
  invoiceNumber: string
  invoiceDate: string
  dueDate: string
  deliveryDate?: string
  currency: string
  exchangeRate?: string
  reverseCharge: boolean
  paymentReference?: string
  items: ReviewLineItem[]
  subtotal: number
  totalVat: number
  total: number
}

function formatAmount(amount: number): string {
  return amount.toLocaleString('sv-SE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

interface JournalPreviewLine {
  account_number: string
  description: string
  debit: number
  credit: number
}

function buildJournalPreview(
  items: ReviewLineItem[],
  subtotal: number,
  totalVat: number,
  total: number,
  reverseCharge: boolean,
): JournalPreviewLine[] {
  const lines: JournalPreviewLine[] = []

  // Aggregate expense amounts by account number
  const expenseByAccount = new Map<string, number>()
  for (const item of items) {
    const current = expenseByAccount.get(item.account_number) || 0
    expenseByAccount.set(item.account_number, current + Math.round(item.amount * 100) / 100)
  }

  // Debit: Expense accounts
  for (const [accountNumber, amount] of expenseByAccount) {
    lines.push({
      account_number: accountNumber,
      description: accountNumber,
      debit: Math.round(amount * 100) / 100,
      credit: 0,
    })
  }

  if (reverseCharge) {
    // EU reverse charge: fiktiv moms
    const vatRate = 0.25
    const fiktivVat = Math.round(subtotal * vatRate * 100) / 100
    lines.push({
      account_number: '2645',
      description: 'Beraknad ingaende moms',
      debit: fiktivVat,
      credit: 0,
    })
    lines.push({
      account_number: '2614',
      description: 'Utgaende moms omvand',
      debit: 0,
      credit: fiktivVat,
    })
    // Credit: 2440 at subtotal (no real VAT for reverse charge)
    lines.push({
      account_number: '2440',
      description: 'Leverantorsskulder',
      debit: 0,
      credit: Math.round(subtotal * 100) / 100,
    })
  } else {
    if (totalVat > 0) {
      lines.push({
        account_number: '2641',
        description: 'Ingaende moms',
        debit: Math.round(totalVat * 100) / 100,
        credit: 0,
      })
    }
    // Credit: 2440 at total incl. VAT
    lines.push({
      account_number: '2440',
      description: 'Leverantorsskulder',
      debit: 0,
      credit: Math.round(total * 100) / 100,
    })
  }

  return lines
}

const ACCOUNT_LABELS: Record<string, string> = {
  '2440': 'Leverantörsskulder',
  '2641': 'Ingående moms',
  '2645': 'Beräknad ingående moms',
  '2614': 'Utg. moms omvänd skattskyldighet',
}

export function SupplierInvoiceReviewContent({
  supplier,
  invoiceNumber,
  invoiceDate,
  dueDate,
  deliveryDate,
  currency,
  exchangeRate,
  reverseCharge,
  paymentReference,
  items,
  subtotal,
  totalVat,
  total,
}: SupplierInvoiceReviewContentProps) {
  const journalLines = buildJournalPreview(items, subtotal, totalVat, total, reverseCharge)
  const totalDebit = journalLines.reduce((sum, l) => sum + l.debit, 0)
  const totalCredit = journalLines.reduce((sum, l) => sum + l.credit, 0)

  return (
    <div className="space-y-4">
      {/* Supplier info */}
      <div className="bg-muted rounded-lg p-4 flex items-center justify-between">
        <div>
          <p className="font-medium text-base">{supplier.name}</p>
          <p className="text-sm text-muted-foreground">Fakturanr: {invoiceNumber}</p>
        </div>
        <div className="flex gap-2">
          {reverseCharge && (
            <Badge variant="outline" className="border-orange-300 text-orange-700 dark:text-orange-400">
              Omvänd skattskyldighet
            </Badge>
          )}
          {currency !== 'SEK' && (
            <Badge variant="outline" className="text-sm">
              {currency}
              {exchangeRate && ` (kurs ${exchangeRate})`}
            </Badge>
          )}
        </div>
      </div>

      {/* Dates */}
      <div className="grid grid-cols-3 gap-4 text-sm">
        <div>
          <span className="text-muted-foreground">Fakturadatum</span>
          <p className="font-medium">{invoiceDate}</p>
        </div>
        <div>
          <span className="text-muted-foreground">Förfallodatum</span>
          <p className="font-medium">{dueDate}</p>
        </div>
        {deliveryDate && (
          <div>
            <span className="text-muted-foreground">Leveransdatum</span>
            <p className="font-medium">{deliveryDate}</p>
          </div>
        )}
      </div>

      {/* Line items table */}
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left text-muted-foreground">
            <th className="py-2 w-20">Konto</th>
            <th className="py-2">Beskrivning</th>
            <th className="py-2 w-28 text-right">Belopp</th>
            <th className="py-2 w-16 text-right">Moms%</th>
            <th className="py-2 w-24 text-right">Moms</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item, index) => {
            const vatAmount = Math.round(item.amount * item.vat_rate * 100) / 100
            return (
              <tr key={index} className="border-b last:border-0">
                <td className="py-2">
                  <AccountNumber number={item.account_number} size="sm" />
                </td>
                <td className="py-2">{item.description}</td>
                <td className="py-2 text-right font-mono">{formatAmount(item.amount)}</td>
                <td className="py-2 text-right">{Math.round(item.vat_rate * 100)}%</td>
                <td className="py-2 text-right font-mono">{formatAmount(vatAmount)}</td>
              </tr>
            )
          })}
        </tbody>
      </table>

      {/* Totals */}
      <div className="space-y-2 text-sm">
        <div className="flex justify-between">
          <span className="text-muted-foreground">Netto (exkl. moms)</span>
          <span>{formatCurrency(subtotal, currency)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Moms</span>
          <span>{formatCurrency(totalVat, currency)}</span>
        </div>
        <Separator />
        <div className="flex justify-between font-bold text-2xl">
          <span>Totalt</span>
          <span>{formatCurrency(total, currency)}</span>
        </div>
        {currency !== 'SEK' && exchangeRate && (
          <div className="flex justify-between text-muted-foreground">
            <span>SEK-belopp (vid kurs {exchangeRate})</span>
            <span>{formatCurrency(total * parseFloat(exchangeRate))}</span>
          </div>
        )}
      </div>

      {/* Verifikation preview */}
      <div className="bg-muted/50 border rounded-lg p-4 space-y-2">
        <p className="text-sm font-semibold text-muted-foreground">Verifikation som bokförs</p>
        <table className="w-full text-sm font-mono">
          <thead>
            <tr className="text-left text-muted-foreground text-xs">
              <th className="pb-1 w-16">Konto</th>
              <th className="pb-1">Beskrivning</th>
              <th className="pb-1 w-24 text-right">Debet</th>
              <th className="pb-1 w-24 text-right">Kredit</th>
            </tr>
          </thead>
          <tbody>
            {journalLines.map((line, index) => (
              <tr key={index} className="border-b border-dashed border-muted-foreground/20 last:border-0">
                <td className="py-1">
                  <AccountNumber number={line.account_number} size="sm" />
                </td>
                <td className="py-1 text-xs">
                  {ACCOUNT_LABELS[line.account_number] || line.description}
                </td>
                <td className="py-1 text-right">
                  {line.debit > 0 ? formatAmount(line.debit) : ''}
                </td>
                <td className="py-1 text-right">
                  {line.credit > 0 ? formatAmount(line.credit) : ''}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t font-semibold">
              <td className="pt-1" colSpan={2}>SUMMA</td>
              <td className="pt-1 text-right">{formatAmount(totalDebit)}</td>
              <td className="pt-1 text-right">{formatAmount(totalCredit)}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Payment reference */}
      {paymentReference && (
        <div className="border-t pt-3 text-sm text-muted-foreground">
          <p>Betalningsreferens: {paymentReference}</p>
        </div>
      )}
    </div>
  )
}
