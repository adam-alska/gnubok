'use client'

import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { AccountNumber } from '@/components/ui/account-number'
import type { Supplier, VatTreatment } from '@/types'

interface ReviewLineItem {
  description: string
  quantity: number
  unit: string
  unit_price: number
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
  vatTreatment: VatTreatment
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

const VAT_TREATMENT_LABELS: Record<VatTreatment, string> = {
  standard_25: '25% moms',
  reduced_12: '12% moms',
  reduced_6: '6% moms',
  reverse_charge: 'Omvänd skattskyldighet',
  export: 'Export (0%)',
  exempt: 'Momsfritt',
}

export function SupplierInvoiceReviewContent({
  supplier,
  invoiceNumber,
  invoiceDate,
  dueDate,
  deliveryDate,
  currency,
  exchangeRate,
  vatTreatment,
  reverseCharge,
  paymentReference,
  items,
  subtotal,
  totalVat,
  total,
}: SupplierInvoiceReviewContentProps) {
  return (
    <div className="space-y-4">
      {/* Supplier info */}
      <div className="bg-muted rounded-lg p-4 flex items-center justify-between">
        <div>
          <p className="font-medium text-base">{supplier.name}</p>
          <p className="text-sm text-muted-foreground">Fakturanr: {invoiceNumber}</p>
        </div>
        {reverseCharge && (
          <Badge variant="outline" className="border-orange-300 text-orange-700 dark:text-orange-400">
            Omvänd skattskyldighet
          </Badge>
        )}
      </div>

      {/* VAT + currency badges */}
      <div className="flex flex-wrap gap-2">
        <Badge className="text-sm px-3 py-1">
          {VAT_TREATMENT_LABELS[vatTreatment]}
        </Badge>
        {currency !== 'SEK' && (
          <Badge variant="outline" className="text-sm px-3 py-1">
            {currency}
            {exchangeRate && ` (kurs ${exchangeRate})`}
          </Badge>
        )}
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
            <th className="py-2">Beskrivning</th>
            <th className="py-2 w-16 text-right">Antal</th>
            <th className="py-2 w-24 text-right">À-pris</th>
            <th className="py-2 w-20">Konto</th>
            <th className="py-2 w-16 text-right">Moms</th>
            <th className="py-2 w-28 text-right">Belopp</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item, index) => {
            const lineTotal = Math.round((item.quantity || 0) * (item.unit_price || 0) * 100) / 100
            return (
              <tr key={index} className="border-b last:border-0">
                <td className="py-2">{item.description}</td>
                <td className="py-2 text-right">{item.quantity} {item.unit}</td>
                <td className="py-2 text-right">{formatAmount(item.unit_price)}</td>
                <td className="py-2">
                  <AccountNumber number={item.account_number} size="sm" />
                </td>
                <td className="py-2 text-right">{Math.round(item.vat_rate * 100)}%</td>
                <td className="py-2 text-right">{formatAmount(lineTotal)}</td>
              </tr>
            )
          })}
        </tbody>
      </table>

      {/* Totals */}
      <div className="space-y-2 text-sm">
        <div className="flex justify-between">
          <span className="text-muted-foreground">Netto (exkl. moms)</span>
          <span>{formatAmount(subtotal)} kr</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Moms</span>
          <span>{formatAmount(totalVat)} kr</span>
        </div>
        <Separator />
        <div className="flex justify-between font-bold text-2xl">
          <span>Totalt</span>
          <span>{formatAmount(total)} kr</span>
        </div>
        {currency !== 'SEK' && exchangeRate && (
          <div className="flex justify-between text-muted-foreground">
            <span>SEK-belopp (vid kurs {exchangeRate})</span>
            <span>{formatAmount(total * parseFloat(exchangeRate))} kr</span>
          </div>
        )}
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
