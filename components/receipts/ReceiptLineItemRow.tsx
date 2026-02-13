'use client'

import { Switch } from '@/components/ui/switch'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { formatCurrency } from '@/lib/utils'
import { getExpenseCategories, CATEGORY_LABELS } from '@/lib/receipts/receipt-categorizer'
import type { ReceiptLineItem, TransactionCategory } from '@/types'

interface ReceiptLineItemRowProps {
  item: ReceiptLineItem
  onToggleBusiness: (id: string, isBusiness: boolean) => void
  onCategoryChange: (id: string, category: TransactionCategory) => void
  disabled?: boolean
}

export default function ReceiptLineItemRow({
  item,
  onToggleBusiness,
  onCategoryChange,
  disabled = false,
}: ReceiptLineItemRowProps) {
  const expenseCategories = getExpenseCategories()
  const isBusiness = item.is_business === true

  return (
    <div className="flex flex-col gap-2 p-3 border rounded-lg bg-card">
      {/* Description and amount */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <p className="font-medium text-sm truncate">{item.description}</p>
          {item.quantity !== 1 && (
            <p className="text-xs text-muted-foreground">
              {item.quantity} x {item.unit_price ? formatCurrency(item.unit_price, 'SEK') : '—'}
            </p>
          )}
        </div>
        <div className="text-right flex-shrink-0">
          <p className="font-semibold">{formatCurrency(item.line_total, 'SEK')}</p>
          {item.vat_rate && (
            <p className="text-xs text-muted-foreground">{item.vat_rate}% moms</p>
          )}
        </div>
      </div>

      {/* Classification controls */}
      <div className="flex items-center gap-3 pt-2 border-t">
        {/* Business/Private toggle */}
        <div className="flex items-center gap-2">
          <span className={`text-xs ${!isBusiness ? 'text-muted-foreground' : 'font-medium'}`}>
            Privat
          </span>
          <Switch
            checked={isBusiness}
            onCheckedChange={(checked) => onToggleBusiness(item.id, checked)}
            disabled={disabled}
          />
          <span className={`text-xs ${isBusiness ? 'font-medium' : 'text-muted-foreground'}`}>
            Företag
          </span>
        </div>

        {/* Category selector (only for business) */}
        {isBusiness && (
          <Select
            value={item.category || undefined}
            onValueChange={(value) => onCategoryChange(item.id, value as TransactionCategory)}
            disabled={disabled}
          >
            <SelectTrigger className="h-8 w-32 text-xs">
              <SelectValue placeholder="Kategori" />
            </SelectTrigger>
            <SelectContent>
              {expenseCategories.map((cat) => (
                <SelectItem key={cat.value} value={cat.value}>
                  {cat.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {/* Confidence badge */}
        {item.extraction_confidence !== null && item.extraction_confidence < 0.8 && (
          <Badge variant="outline" className="text-xs">
            {Math.round((item.extraction_confidence || 0) * 100)}%
          </Badge>
        )}

        {/* AI suggestion indicator */}
        {item.suggested_category && item.is_business === null && (
          <Badge variant="secondary" className="text-xs">
            Förslag: {CATEGORY_LABELS[`expense_${item.suggested_category}` as TransactionCategory] || item.suggested_category}
          </Badge>
        )}
      </div>
    </div>
  )
}
