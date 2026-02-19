'use client'

import { motion } from 'framer-motion'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { formatCurrency, formatDate } from '@/lib/utils'
import { Check, FileText, BookOpen, Settings2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { MatchSuggestion as MatchSuggestionType } from '@/types/bank-reconciliation'

interface MatchSuggestionProps {
  suggestion: MatchSuggestionType
  onAccept: (suggestion: MatchSuggestionType) => void
  isLoading?: boolean
  index: number
}

function getConfidenceColor(score: number): string {
  if (score >= 0.9) return 'bg-green-500'
  if (score >= 0.7) return 'bg-blue-500'
  if (score >= 0.5) return 'bg-amber-500'
  return 'bg-red-500'
}

function getConfidenceLabel(score: number): string {
  if (score >= 0.9) return 'Mycket hog'
  if (score >= 0.7) return 'Hog'
  if (score >= 0.5) return 'Medel'
  return 'Lag'
}

function getTypeIcon(type: string) {
  switch (type) {
    case 'invoice':
      return FileText
    case 'supplier_invoice':
      return FileText
    case 'rule':
      return Settings2
    default:
      return BookOpen
  }
}

export default function MatchSuggestion({
  suggestion,
  onAccept,
  isLoading,
  index,
}: MatchSuggestionProps) {
  const Icon = getTypeIcon(suggestion.type)
  const confidencePercent = Math.round(suggestion.confidence * 100)

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05 }}
      className={cn(
        'group rounded-lg border p-3 transition-all hover:border-primary/50 hover:shadow-sm',
        index === 0 && 'border-primary/30 bg-primary/5'
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0 flex-1">
          <div className="h-8 w-8 rounded-lg bg-muted flex items-center justify-center shrink-0 mt-0.5">
            <Icon className="h-4 w-4 text-muted-foreground" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <p className="font-medium text-sm truncate">{suggestion.label}</p>
              {index === 0 && (
                <Badge variant="default" className="text-[10px] px-1.5 py-0">
                  Basta match
                </Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground truncate">{suggestion.description}</p>
            <p className="text-xs text-muted-foreground mt-1">{suggestion.matchReason}</p>

            {/* Invoice details */}
            {suggestion.invoice && (
              <div className="mt-2 flex items-center gap-3 text-xs text-muted-foreground">
                <span>Belopp: {formatCurrency(suggestion.invoice.total, suggestion.invoice.currency)}</span>
                <span>Forfall: {formatDate(suggestion.invoice.due_date)}</span>
              </div>
            )}

            {/* Supplier invoice details */}
            {suggestion.supplierInvoice && (
              <div className="mt-2 flex items-center gap-3 text-xs text-muted-foreground">
                <span>Belopp: {formatCurrency(suggestion.supplierInvoice.total)}</span>
                <span>Forfall: {formatDate(suggestion.supplierInvoice.due_date)}</span>
              </div>
            )}

            {/* Rule details */}
            {suggestion.rule && (
              <div className="mt-2 text-xs text-muted-foreground">
                Konto: {suggestion.rule.debit_account} / {suggestion.rule.credit_account}
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          {/* Confidence bar */}
          <div className="flex items-center gap-2">
            <div className="w-16 h-1.5 rounded-full bg-secondary overflow-hidden">
              <div
                className={cn('h-full rounded-full transition-all', getConfidenceColor(suggestion.confidence))}
                style={{ width: `${confidencePercent}%` }}
              />
            </div>
            <span className="text-xs text-muted-foreground whitespace-nowrap">
              {confidencePercent}%
            </span>
          </div>

          <Button
            size="sm"
            variant={index === 0 ? 'default' : 'outline'}
            onClick={() => onAccept(suggestion)}
            disabled={isLoading}
            className="h-8"
          >
            <Check className="h-3.5 w-3.5 mr-1" />
            Matcha
          </Button>
        </div>
      </div>
    </motion.div>
  )
}

export { getConfidenceColor, getConfidenceLabel }
