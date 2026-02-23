'use client'

import { motion } from 'framer-motion'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { formatCurrency, formatDate } from '@/lib/utils'
import { ArrowUpRight, ArrowDownRight, FileText, MoreHorizontal, Loader2 } from 'lucide-react'
import type { TransactionWithInvoice, CategorizeHandler } from './transaction-types'
import type { SuggestedCategory } from '@/lib/transactions/category-suggestions'

interface TransactionInboxCardProps {
  transaction: TransactionWithInvoice
  suggestions?: SuggestedCategory[]
  processingId: string | null
  isBatchMode: boolean
  isSelected: boolean
  onCategorize: CategorizeHandler
  onMarkPrivate: (id: string) => void
  onOpenMatchDialog: (transaction: TransactionWithInvoice) => void
  onOpenCategoryDialog: (transaction: TransactionWithInvoice) => void
  onToggleSelect: (id: string) => void
  onAnimationComplete?: (id: string) => void
}

export default function TransactionInboxCard({
  transaction,
  suggestions,
  processingId,
  isBatchMode,
  isSelected,
  onCategorize,
  onMarkPrivate,
  onOpenMatchDialog,
  onOpenCategoryDialog,
  onToggleSelect,
  onAnimationComplete,
}: TransactionInboxCardProps) {
  const isProcessing = processingId === transaction.id
  const isDisabled = processingId !== null && processingId !== transaction.id
  const isIncome = transaction.amount > 0
  const hasInvoiceMatch = !!transaction.potential_invoice && !transaction.invoice_id
  const topSuggestion = suggestions?.[0]
  const isUncategorized = transaction.is_business === null && !transaction.journal_entry_id
  const showCheckbox = isBatchMode && isUncategorized

  async function handleSuggestionClick(suggestion: SuggestedCategory) {
    await onCategorize(transaction.id, true, suggestion.category)
  }

  return (
    <motion.div
      layout
      initial={{ opacity: 1, height: 'auto' }}
      exit={{ opacity: 0, height: 0, marginBottom: 0 }}
      transition={{ duration: 0.3, ease: 'easeInOut' }}
      onAnimationComplete={(definition) => {
        // Only call on exit animation
        if (typeof definition === 'object' && 'opacity' in definition && definition.opacity === 0) {
          onAnimationComplete?.(transaction.id)
        }
      }}
    >
      <Card
        className={`transition-colors ${
          hasInvoiceMatch ? 'border-blue-500/50' : 'border-warning/50'
        } ${isSelected ? 'border-primary bg-primary/[0.02]' : ''} ${
          isDisabled ? 'opacity-50' : ''
        }`}
        onClick={showCheckbox ? () => onToggleSelect(transaction.id) : undefined}
      >
        <CardContent className="py-4">
          <div className="flex items-start justify-between gap-4">
            {/* Left: checkbox + icon + info */}
            <div className="flex items-start gap-3 min-w-0 flex-1">
              {showCheckbox && (
                <Checkbox
                  checked={isSelected}
                  onCheckedChange={() => onToggleSelect(transaction.id)}
                  onClick={(e) => e.stopPropagation()}
                  className="mt-1"
                />
              )}
              <div
                className={`h-10 w-10 rounded-full flex items-center justify-center flex-shrink-0 ${
                  isIncome
                    ? 'bg-success/10 text-success'
                    : 'bg-destructive/10 text-destructive'
                }`}
              >
                {isIncome ? (
                  <ArrowUpRight className="h-5 w-5" />
                ) : (
                  <ArrowDownRight className="h-5 w-5" />
                )}
              </div>
              <div className="min-w-0">
                <p className="font-medium truncate">{transaction.description}</p>
                <p className="text-sm text-muted-foreground">{formatDate(transaction.date)}</p>
              </div>
            </div>

            {/* Right: amount */}
            <div className="text-right flex-shrink-0">
              <p className={`font-medium ${isIncome ? 'text-success' : ''}`}>
                {isIncome ? '+' : ''}
                {formatCurrency(transaction.amount, transaction.currency)}
              </p>
              {transaction.currency !== 'SEK' && transaction.amount_sek && (
                <p className="text-sm text-muted-foreground">
                  {formatCurrency(transaction.amount_sek)}
                </p>
              )}
            </div>
          </div>

          {/* Inline action buttons - only shown when not in batch mode */}
          {!isBatchMode && (
            <div className="flex flex-wrap items-center gap-2 mt-3 pt-3 border-t">
              {/* Primary action: invoice match or top suggestion */}
              {hasInvoiceMatch ? (
                <Button
                  size="sm"
                  variant="default"
                  className="h-8 text-xs"
                  onClick={() => onOpenMatchDialog(transaction)}
                  disabled={isProcessing || isDisabled}
                >
                  {isProcessing ? (
                    <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />
                  ) : (
                    <FileText className="mr-1.5 h-3 w-3" />
                  )}
                  Matcha Faktura {transaction.potential_invoice!.invoice_number}
                </Button>
              ) : topSuggestion ? (
                <Button
                  size="sm"
                  variant="default"
                  className="h-8 text-xs"
                  onClick={() => handleSuggestionClick(topSuggestion)}
                  disabled={isProcessing || isDisabled}
                >
                  {isProcessing ? (
                    <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />
                  ) : null}
                  {topSuggestion.label}
                  {topSuggestion.confidence >= 0.8 && (
                    <Badge variant="secondary" className="ml-1.5 text-[10px] px-1 py-0">
                      {Math.round(topSuggestion.confidence * 100)}%
                    </Badge>
                  )}
                </Button>
              ) : null}

              {/* Secondary suggestions (up to 1 more) */}
              {!hasInvoiceMatch && suggestions && suggestions.length > 1 && (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 text-xs"
                  onClick={() => handleSuggestionClick(suggestions[1])}
                  disabled={isProcessing || isDisabled}
                >
                  {suggestions[1].label}
                </Button>
              )}

              {/* Private button */}
              <Button
                size="sm"
                variant="ghost"
                className="h-8 text-xs text-muted-foreground"
                onClick={() => onMarkPrivate(transaction.id)}
                disabled={isProcessing || isDisabled}
              >
                Privat
              </Button>

              {/* More options */}
              <Button
                size="sm"
                variant="ghost"
                className="h-8 w-8 p-0 text-muted-foreground"
                onClick={() => onOpenCategoryDialog(transaction)}
                disabled={isProcessing || isDisabled}
              >
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </motion.div>
  )
}
