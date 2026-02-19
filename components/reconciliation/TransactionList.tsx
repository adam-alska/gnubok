'use client'

import { useCallback, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Badge } from '@/components/ui/badge'
import { formatCurrency, formatDate } from '@/lib/utils'
import {
  ArrowUpRight,
  ArrowDownRight,
  Check,
  AlertCircle,
  Sparkles,
  SplitSquareVertical,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import type { BankReconciliationItem, ReconciliationFilter } from '@/types/bank-reconciliation'
import type { Transaction } from '@/types'

interface TransactionListProps {
  items: BankReconciliationItem[]
  selectedItemId: string | null
  onSelectItem: (itemId: string) => void
  filter: ReconciliationFilter
  searchQuery: string
}

function getStatusIcon(item: BankReconciliationItem) {
  if (item.is_reconciled) return Check
  if (item.match_type === 'split') return SplitSquareVertical
  if (item.confidence_score > 0) return Sparkles
  return AlertCircle
}

function getStatusColor(item: BankReconciliationItem): string {
  if (item.is_reconciled) return 'border-l-green-500 bg-green-50/50 dark:bg-green-950/10'
  if (item.confidence_score >= 0.8) return 'border-l-blue-500 bg-blue-50/50 dark:bg-blue-950/10'
  if (item.confidence_score > 0) return 'border-l-amber-500 bg-amber-50/50 dark:bg-amber-950/10'
  return 'border-l-red-500'
}

function getMatchBadge(item: BankReconciliationItem) {
  if (item.is_reconciled) {
    switch (item.match_type) {
      case 'auto_invoice':
        return { label: 'Auto', variant: 'success' as const }
      case 'auto_rule':
        return { label: 'Regel', variant: 'success' as const }
      case 'manual':
        return { label: 'Manuell', variant: 'default' as const }
      case 'split':
        return { label: 'Delad', variant: 'default' as const }
      default:
        return { label: 'Klar', variant: 'success' as const }
    }
  }

  if (item.confidence_score >= 0.8) {
    return { label: 'Forslag', variant: 'warning' as const }
  }

  if (item.confidence_score > 0) {
    return { label: 'Mojlig', variant: 'secondary' as const }
  }

  return { label: 'Ej matchad', variant: 'destructive' as const }
}

export default function TransactionList({
  items,
  selectedItemId,
  onSelectItem,
  filter,
  searchQuery,
}: TransactionListProps) {
  const listRef = useRef<HTMLDivElement>(null)
  const selectedRef = useRef<HTMLDivElement>(null)

  // Filter items
  const filteredItems = items.filter((item) => {
    const tx = item.transaction as Transaction | undefined
    if (!tx) return false

    // Filter by status
    if (filter === 'matched' && !item.is_reconciled) return false
    if (filter === 'unmatched' && item.is_reconciled) return false
    if (filter === 'suggestions' && (item.is_reconciled || item.confidence_score === 0)) return false

    // Filter by search query
    if (searchQuery) {
      const query = searchQuery.toLowerCase()
      const matchesDescription = tx.description.toLowerCase().includes(query)
      const matchesAmount = String(Math.abs(tx.amount)).includes(query)
      const matchesMerchant = tx.merchant_name?.toLowerCase().includes(query)
      if (!matchesDescription && !matchesAmount && !matchesMerchant) return false
    }

    return true
  })

  // Keyboard navigation
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!filteredItems.length) return

      const currentIndex = filteredItems.findIndex((i) => i.id === selectedItemId)

      if (e.key === 'ArrowDown' || e.key === 'j') {
        e.preventDefault()
        const nextIndex = currentIndex < filteredItems.length - 1 ? currentIndex + 1 : 0
        onSelectItem(filteredItems[nextIndex].id)
      }

      if (e.key === 'ArrowUp' || e.key === 'k') {
        e.preventDefault()
        const prevIndex = currentIndex > 0 ? currentIndex - 1 : filteredItems.length - 1
        onSelectItem(filteredItems[prevIndex].id)
      }
    },
    [filteredItems, selectedItemId, onSelectItem]
  )

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])

  // Scroll selected item into view
  useEffect(() => {
    if (selectedRef.current) {
      selectedRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    }
  }, [selectedItemId])

  if (filteredItems.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <AlertCircle className="h-8 w-8 text-muted-foreground mb-3" />
        <p className="text-sm text-muted-foreground">
          {searchQuery
            ? 'Inga transaktioner matchar din sokning'
            : filter === 'unmatched'
            ? 'Alla transaktioner ar matchade!'
            : 'Inga transaktioner i denna vy'}
        </p>
      </div>
    )
  }

  return (
    <div ref={listRef} className="space-y-1 overflow-y-auto" role="listbox" aria-label="Transaktioner">
      <AnimatePresence mode="popLayout">
        {filteredItems.map((item) => {
          const tx = item.transaction as Transaction
          if (!tx) return null

          const isSelected = item.id === selectedItemId
          const StatusIcon = getStatusIcon(item)
          const badge = getMatchBadge(item)
          const isIncome = tx.amount > 0

          return (
            <motion.div
              key={item.id}
              ref={isSelected ? selectedRef : undefined}
              layout
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -10 }}
              role="option"
              aria-selected={isSelected}
              tabIndex={0}
              onClick={() => onSelectItem(item.id)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  onSelectItem(item.id)
                }
              }}
              className={cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-lg border-l-4 cursor-pointer transition-all',
                'hover:bg-muted/50 focus:outline-none focus:ring-2 focus:ring-primary/20',
                getStatusColor(item),
                isSelected && 'ring-2 ring-primary/30 bg-primary/5 shadow-sm'
              )}
            >
              {/* Amount indicator */}
              <div
                className={cn(
                  'h-8 w-8 rounded-full flex items-center justify-center shrink-0',
                  isIncome
                    ? 'bg-green-100 text-green-700 dark:bg-green-950/50 dark:text-green-400'
                    : 'bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-400'
                )}
              >
                {isIncome ? (
                  <ArrowUpRight className="h-4 w-4" />
                ) : (
                  <ArrowDownRight className="h-4 w-4" />
                )}
              </div>

              {/* Transaction details */}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium truncate">{tx.description}</p>
                </div>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-xs text-muted-foreground">{formatDate(tx.date)}</span>
                  <Badge variant={badge.variant} className="text-[10px] px-1 py-0 h-4">
                    {badge.label}
                  </Badge>
                </div>
              </div>

              {/* Amount + status icon */}
              <div className="text-right shrink-0 flex items-center gap-2">
                <p
                  className={cn(
                    'text-sm font-medium tabular-nums',
                    isIncome ? 'text-green-700 dark:text-green-400' : ''
                  )}
                >
                  {isIncome ? '+' : ''}
                  {formatCurrency(tx.amount, tx.currency)}
                </p>
                <StatusIcon
                  className={cn(
                    'h-4 w-4 shrink-0',
                    item.is_reconciled
                      ? 'text-green-500'
                      : item.confidence_score >= 0.8
                      ? 'text-blue-500'
                      : item.confidence_score > 0
                      ? 'text-amber-500'
                      : 'text-red-400'
                  )}
                />
              </div>
            </motion.div>
          )
        })}
      </AnimatePresence>
    </div>
  )
}
