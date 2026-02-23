'use client'

import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { getVatSummaryFromItems } from '@/lib/invoices/vat-rules'
import { formatCurrency } from '@/lib/utils'
import type { Customer, Currency } from '@/types'

interface ReviewItem {
  description: string
  quantity: number
  unit: string
  unit_price: number
  vat_rate?: number
}

interface InvoiceReviewContentProps {
  customer: Customer
  invoiceDate: string
  dueDate: string
  currency: Currency
  items: ReviewItem[]
  subtotal: number
  vatAmount: number
  total: number
  yourReference?: string
  ourReference?: string
  notes?: string
}

export function InvoiceReviewContent({
  customer,
  invoiceDate,
  dueDate,
  currency,
  items,
  subtotal,
  vatAmount,
  total,
  yourReference,
  ourReference,
  notes,
}: InvoiceReviewContentProps) {
  const customerTypeLabel: Record<string, string> = {
    individual: 'Privatperson',
    swedish_business: 'Svenskt företag',
    eu_business: 'EU-företag',
    non_eu_business: 'Utanför EU',
  }

  // Derive VAT summary from items
  const vatSummary = getVatSummaryFromItems(items)

  // Calculate per-rate VAT breakdown
  const vatByRate = new Map<number, number>()
  for (const item of items) {
    const rate = item.vat_rate ?? 25
    const lineTotal = item.quantity * item.unit_price
    const lineVat = Math.round(lineTotal * rate / 100 * 100) / 100
    vatByRate.set(rate, (vatByRate.get(rate) || 0) + lineVat)
  }

  const showVatColumn = vatByRate.size > 1

  return (
    <div className="space-y-4">
      {/* Customer info */}
      <div className="bg-muted rounded-lg p-4 flex items-center justify-between">
        <div>
          <p className="font-medium text-base">{customer.name}</p>
          <p className="text-sm text-muted-foreground">{customer.email}</p>
        </div>
        <Badge variant="outline">
          {customerTypeLabel[customer.customer_type] || customer.customer_type}
        </Badge>
      </div>

      {/* VAT treatment */}
      <Badge className="text-sm px-3 py-1">
        {vatSummary.label}
      </Badge>

      {/* Dates */}
      <div className="grid grid-cols-2 gap-4 text-sm">
        <div>
          <span className="text-muted-foreground">Fakturadatum</span>
          <p className="font-medium">{invoiceDate}</p>
        </div>
        <div>
          <span className="text-muted-foreground">Förfallodatum</span>
          <p className="font-medium">{dueDate}</p>
        </div>
      </div>

      {/* Line items table */}
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left text-muted-foreground">
            <th className="py-2">Beskrivning</th>
            <th className="py-2 w-16 text-right">Antal</th>
            <th className="py-2 w-16 text-center">Enhet</th>
            <th className="py-2 w-24 text-right">À-pris</th>
            {showVatColumn && <th className="py-2 w-16 text-right">Moms</th>}
            <th className="py-2 w-28 text-right">Belopp</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item, index) => (
            <tr key={index} className="border-b last:border-0">
              <td className="py-2">{item.description}</td>
              <td className="py-2 text-right">{item.quantity}</td>
              <td className="py-2 text-center">{item.unit}</td>
              <td className="py-2 text-right">{formatCurrency(item.unit_price, currency)}</td>
              {showVatColumn && (
                <td className="py-2 text-right">{item.vat_rate ?? 25}%</td>
              )}
              <td className="py-2 text-right">
                {formatCurrency(item.quantity * item.unit_price, currency)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Totals */}
      <div className="space-y-2 text-sm">
        <div className="flex justify-between">
          <span className="text-muted-foreground">Delsumma</span>
          <span>{formatCurrency(subtotal, currency)}</span>
        </div>
        {Array.from(vatByRate.entries())
          .filter(([, vat]) => vat > 0)
          .sort(([a], [b]) => b - a)
          .map(([rate, vat]) => (
            <div key={rate} className="flex justify-between">
              <span className="text-muted-foreground">Moms {rate}%</span>
              <span>{formatCurrency(vat, currency)}</span>
            </div>
          ))}
        {Array.from(vatByRate.values()).every((vat) => vat === 0) && (
          <div className="flex justify-between">
            <span className="text-muted-foreground">Moms</span>
            <span>{formatCurrency(0, currency)}</span>
          </div>
        )}
        <Separator />
        <div className="flex justify-between font-bold text-2xl">
          <span>Totalt</span>
          <span>{formatCurrency(total, currency)}</span>
        </div>
      </div>

      {/* References/notes */}
      {(yourReference || ourReference || notes) && (
        <div className="border-t pt-3 space-y-1 text-sm text-muted-foreground">
          {yourReference && <p>Er referens: {yourReference}</p>}
          {ourReference && <p>Vår referens: {ourReference}</p>}
          {notes && <p>Anteckning: {notes}</p>}
        </div>
      )}
    </div>
  )
}
