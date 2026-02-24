'use client'

import { motion } from 'framer-motion'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { formatCurrency, formatDate } from '@/lib/utils'
import { ArrowUpRight, ArrowDownRight, FileText, Loader2, MessageSquareText } from 'lucide-react'
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from '@/components/ui/info-tooltip'
import { formatAccountWithName } from '@/lib/bookkeeping/client-account-names'
import type { TransactionWithInvoice, CategorizeHandler } from './transaction-types'
import type { SuggestedCategory, SuggestedTemplate } from '@/lib/transactions/category-suggestions'

interface TransactionInboxCardProps {
  transaction: TransactionWithInvoice
  suggestions?: SuggestedCategory[]
  templateSuggestions?: SuggestedTemplate[]
  processingId: string | null
  isBatchMode: boolean
  isSelected: boolean
  entityType?: string
  onCategorize: CategorizeHandler
  onMarkPrivate: (id: string) => void
  onOpenMatchDialog: (transaction: TransactionWithInvoice) => void
  onOpenCategoryDialog: (transaction: TransactionWithInvoice) => void
  onOpenDescribe?: (transaction: TransactionWithInvoice) => void
  onOpenQuickReview?: (transaction: TransactionWithInvoice, suggestion: SuggestedCategory) => void
  onToggleSelect: (id: string) => void
  onAnimationComplete?: (id: string) => void
}

export default function TransactionInboxCard({
  transaction,
  suggestions,
  templateSuggestions,
  processingId,
  isBatchMode,
  isSelected,
  entityType = 'enskild_firma',
  onCategorize,
  onMarkPrivate,
  onOpenMatchDialog,
  onOpenCategoryDialog,
  onOpenDescribe,
  onOpenQuickReview,
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
  const hasWeakSuggestions = !topSuggestion || topSuggestion.confidence < 0.55
  const showTemplateFallback = hasWeakSuggestions && templateSuggestions && templateSuggestions.length > 0

  function handleSuggestionClick(suggestion: SuggestedCategory) {
    if (onOpenQuickReview) {
      onOpenQuickReview(transaction, suggestion)
    } else {
      onCategorize(transaction.id, true, suggestion.category)
    }
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
                  {topSuggestion.account && (
                    <span className="ml-1 text-muted-foreground font-normal">
                      ({formatAccountWithName(topSuggestion.account)})
                    </span>
                  )}
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
                  {suggestions[1].account && (
                    <span className="ml-1 text-muted-foreground font-normal">
                      ({formatAccountWithName(suggestions[1].account)})
                    </span>
                  )}
                </Button>
              )}

              {/* Fallback templates when no strong suggestion */}
              {showTemplateFallback && !hasInvoiceMatch && (
                <>
                  <span className="text-[10px] text-muted-foreground">Osaker? Prova:</span>
                  {templateSuggestions!.slice(0, 3).map((tmpl) => (
                    <Button
                      key={tmpl.template_id}
                      size="sm"
                      variant="outline"
                      className="h-8 text-xs border-dashed"
                      onClick={() => onOpenDescribe?.(transaction)}
                      disabled={isProcessing || isDisabled}
                    >
                      {tmpl.name_sv}
                    </Button>
                  ))}
                </>
              )}

              {/* Private button */}
              <TooltipProvider delayDuration={300}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-8 text-xs text-muted-foreground"
                      onClick={() => onMarkPrivate(transaction.id)}
                      disabled={isProcessing || isDisabled}
                    >
                      Privat
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="max-w-[260px]">
                    <p className="text-sm leading-relaxed">
                      {entityType === 'aktiebolag'
                        ? 'Privat utgift med företagets kort \u2014 bokförs som skuld till ägaren (konto 2893)'
                        : 'Privat uttag \u2014 bokförs mot konto 2013 (Övriga egna uttag)'}
                    </p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>

              {/* Describe transaction */}
              {onOpenDescribe && (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 text-xs"
                  onClick={() => onOpenDescribe(transaction)}
                  disabled={isProcessing || isDisabled}
                >
                  <MessageSquareText className="mr-1.5 h-3 w-3" />
                  Beskriv...
                </Button>
              )}

              {/* Open category dialog */}
              <Button
                size="sm"
                variant={!hasInvoiceMatch && !topSuggestion ? 'default' : 'outline'}
                className="h-8 text-xs"
                onClick={() => onOpenCategoryDialog(transaction)}
                disabled={isProcessing || isDisabled}
              >
                {!hasInvoiceMatch && !topSuggestion ? 'Bokför' : 'Bokför manuellt...'}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </motion.div>
  )
}
