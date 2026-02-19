'use client'

import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { useToast } from '@/components/ui/use-toast'
import { formatCurrency, formatDate } from '@/lib/utils'
import {
  Check,
  X,
  Search,
  BookOpen,
  SplitSquareVertical,
  Undo2,
  FileText,
  Loader2,
  Keyboard,
} from 'lucide-react'
import MatchSuggestionComponent from './MatchSuggestion'
import QuickBookingForm from './QuickBookingForm'
import SplitTransactionDialog from './SplitTransactionDialog'
import type { Transaction, Invoice, Customer } from '@/types'
import type {
  BankReconciliationItem,
  MatchSuggestion,
  ReconciliationMatchType,
} from '@/types/bank-reconciliation'

interface MatchPanelProps {
  item: BankReconciliationItem | null
  suggestions: MatchSuggestion[]
  isLoadingSuggestions: boolean
  onReconcile: (
    itemId: string,
    matchType: ReconciliationMatchType,
    matchId?: string,
    debitAccount?: string,
    creditAccount?: string,
    description?: string
  ) => Promise<void>
  onSplit: (
    itemId: string,
    splits: { amount: number; description: string; debit_account: string; credit_account: string }[]
  ) => Promise<void>
  onUnmatch: (itemId: string) => Promise<void>
}

type PanelMode = 'suggestions' | 'search' | 'booking' | 'reconciled'

export default function MatchPanel({
  item,
  suggestions,
  isLoadingSuggestions,
  onReconcile,
  onSplit,
  onUnmatch,
}: MatchPanelProps) {
  const [mode, setMode] = useState<PanelMode>('suggestions')
  const [isLoading, setIsLoading] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<MatchSuggestion[]>([])
  const [splitDialogOpen, setSplitDialogOpen] = useState(false)
  const { toast } = useToast()

  const tx = item?.transaction as Transaction | undefined

  // Reset mode when item changes
  useEffect(() => {
    if (!item) return
    if (item.is_reconciled) {
      setMode('reconciled')
    } else if (suggestions.length > 0) {
      setMode('suggestions')
    } else {
      setMode('booking')
    }
    setSearchQuery('')
    setSearchResults([])
  }, [item?.id, item?.is_reconciled, suggestions.length])

  // Keyboard shortcuts
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!item || !tx || item.is_reconciled) return

      // Enter to accept best suggestion
      if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey && mode === 'suggestions' && suggestions.length > 0) {
        const target = e.target as HTMLElement
        if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return
        e.preventDefault()
        handleAcceptSuggestion(suggestions[0])
      }

      // b for booking mode
      if (e.key === 'b' && !e.ctrlKey && !e.metaKey) {
        const target = e.target as HTMLElement
        if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return
        e.preventDefault()
        setMode('booking')
      }

      // s for search mode
      if (e.key === 's' && !e.ctrlKey && !e.metaKey) {
        const target = e.target as HTMLElement
        if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return
        e.preventDefault()
        setMode('search')
      }

      // d for split dialog
      if (e.key === 'd' && !e.ctrlKey && !e.metaKey) {
        const target = e.target as HTMLElement
        if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return
        e.preventDefault()
        setSplitDialogOpen(true)
      }
    },
    [item, tx, mode, suggestions]
  )

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])

  async function handleAcceptSuggestion(suggestion: MatchSuggestion) {
    if (!item) return
    setIsLoading(true)

    try {
      const matchType: ReconciliationMatchType =
        suggestion.type === 'rule' ? 'auto_rule' : 'manual'

      let debitAccount: string | undefined
      let creditAccount: string | undefined

      if (suggestion.rule) {
        debitAccount = suggestion.rule.debit_account || undefined
        creditAccount = suggestion.rule.credit_account || undefined
      }

      await onReconcile(
        item.id,
        matchType,
        suggestion.id,
        debitAccount,
        creditAccount
      )

      toast({
        title: 'Matchad',
        description: `Transaktion matchad med ${suggestion.label}`,
      })
    } catch {
      toast({
        title: 'Fel',
        description: 'Kunde inte matcha transaktionen',
        variant: 'destructive',
      })
    }

    setIsLoading(false)
  }

  async function handleQuickBooking(debitAccount: string, creditAccount: string, description: string) {
    if (!item) return
    setIsLoading(true)

    try {
      await onReconcile(item.id, 'manual', undefined, debitAccount, creditAccount, description)
      toast({
        title: 'Bokford',
        description: 'Transaktion bokford och avstamning klar',
      })
    } catch {
      toast({
        title: 'Fel',
        description: 'Kunde inte bokfora transaktionen',
        variant: 'destructive',
      })
    }

    setIsLoading(false)
  }

  async function handleSplit(
    splits: { amount: number; description: string; debit_account: string; credit_account: string }[]
  ) {
    if (!item) return
    setIsLoading(true)

    try {
      await onSplit(item.id, splits)
      setSplitDialogOpen(false)
      toast({
        title: 'Delad',
        description: `Transaktion delad i ${splits.length} poster`,
      })
    } catch {
      toast({
        title: 'Fel',
        description: 'Kunde inte dela transaktionen',
        variant: 'destructive',
      })
    }

    setIsLoading(false)
  }

  async function handleUnmatch() {
    if (!item) return
    setIsLoading(true)

    try {
      await onUnmatch(item.id)
      toast({
        title: 'Angrat',
        description: 'Matchning angrat',
      })
    } catch {
      toast({
        title: 'Fel',
        description: 'Kunde inte angra matchningen',
        variant: 'destructive',
      })
    }

    setIsLoading(false)
  }

  // Empty state
  if (!item || !tx) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center p-8">
        <Keyboard className="h-12 w-12 text-muted-foreground/30 mb-4" />
        <p className="text-muted-foreground text-sm">
          Välj en transaktion från listan till vänster
        </p>
        <div className="mt-4 space-y-1 text-xs text-muted-foreground/60">
          <p><kbd className="px-1.5 py-0.5 rounded bg-muted text-[10px] font-mono">j</kbd> / <kbd className="px-1.5 py-0.5 rounded bg-muted text-[10px] font-mono">k</kbd> Navigera</p>
          <p><kbd className="px-1.5 py-0.5 rounded bg-muted text-[10px] font-mono">Enter</kbd> Acceptera bästa förslag</p>
          <p><kbd className="px-1.5 py-0.5 rounded bg-muted text-[10px] font-mono">b</kbd> Bokför direkt</p>
          <p><kbd className="px-1.5 py-0.5 rounded bg-muted text-[10px] font-mono">d</kbd> Dela transaktion</p>
        </div>
      </div>
    )
  }

  const isIncome = tx.amount > 0

  return (
    <div className="flex flex-col h-full">
      {/* Transaction header */}
      <div className="p-4 border-b shrink-0">
        <div className="flex items-start justify-between">
          <div>
            <h3 className="font-medium text-sm">{tx.description}</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              {formatDate(tx.date)}
              {tx.merchant_name && ` - ${tx.merchant_name}`}
            </p>
          </div>
          <div className="text-right">
            <p
              className={`text-lg font-semibold tabular-nums ${
                isIncome ? 'text-green-600' : ''
              }`}
            >
              {isIncome ? '+' : ''}
              {formatCurrency(tx.amount, tx.currency)}
            </p>
          </div>
        </div>

        {/* Mode tabs */}
        {!item.is_reconciled && (
          <div className="flex gap-1 mt-3">
            <Button
              variant={mode === 'suggestions' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setMode('suggestions')}
              className="h-7 text-xs"
            >
              <FileText className="h-3 w-3 mr-1" />
              Matchningar
              {suggestions.length > 0 && (
                <Badge variant="secondary" className="ml-1 text-[10px] px-1 py-0 h-4">
                  {suggestions.length}
                </Badge>
              )}
            </Button>
            <Button
              variant={mode === 'search' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setMode('search')}
              className="h-7 text-xs"
            >
              <Search className="h-3 w-3 mr-1" />
              Sok
            </Button>
            <Button
              variant={mode === 'booking' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setMode('booking')}
              className="h-7 text-xs"
            >
              <BookOpen className="h-3 w-3 mr-1" />
              Bokfor
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setSplitDialogOpen(true)}
              className="h-7 text-xs"
            >
              <SplitSquareVertical className="h-3 w-3 mr-1" />
              Dela
            </Button>
          </div>
        )}
      </div>

      {/* Content area */}
      <div className="flex-1 overflow-y-auto p-4">
        <AnimatePresence mode="wait">
          {/* Reconciled state */}
          {item.is_reconciled && (
            <motion.div
              key="reconciled"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="space-y-4"
            >
              <div className="rounded-lg bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-800 p-4">
                <div className="flex items-center gap-2">
                  <Check className="h-5 w-5 text-green-600" />
                  <span className="font-medium text-green-800 dark:text-green-300">
                    Transaktion avstamning klar
                  </span>
                </div>
                <p className="text-sm text-green-700 dark:text-green-400 mt-1">
                  {item.notes || `Matchad som ${item.match_type}`}
                </p>
              </div>

              {/* Show matched invoice details */}
              {item.matched_invoice && (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Matchad faktura</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-1 text-sm">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Faktura</span>
                        <span>{(item.matched_invoice as Invoice).invoice_number}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Kund</span>
                        <span>{((item.matched_invoice as Invoice & { customer?: Customer }).customer?.name) || '-'}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Belopp</span>
                        <span>{formatCurrency((item.matched_invoice as Invoice).total, (item.matched_invoice as Invoice).currency)}</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}

              <Button
                variant="outline"
                size="sm"
                onClick={handleUnmatch}
                disabled={isLoading}
                className="w-full"
              >
                <Undo2 className="h-3.5 w-3.5 mr-1.5" />
                {isLoading ? 'Angrar...' : 'Angra matchning'}
              </Button>
            </motion.div>
          )}

          {/* Suggestions mode */}
          {!item.is_reconciled && mode === 'suggestions' && (
            <motion.div
              key="suggestions"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="space-y-2"
            >
              {isLoadingSuggestions ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                  <span className="ml-2 text-sm text-muted-foreground">Soker matchningar...</span>
                </div>
              ) : suggestions.length > 0 ? (
                suggestions.map((suggestion, index) => (
                  <MatchSuggestionComponent
                    key={suggestion.id}
                    suggestion={suggestion}
                    onAccept={handleAcceptSuggestion}
                    isLoading={isLoading}
                    index={index}
                  />
                ))
              ) : (
                <div className="text-center py-8">
                  <Search className="h-8 w-8 text-muted-foreground/30 mx-auto mb-3" />
                  <p className="text-sm text-muted-foreground">
                    Inga automatiska matchningar hittades
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Anvand Sok, Bokfor direkt eller Dela
                  </p>
                </div>
              )}
            </motion.div>
          )}

          {/* Search mode */}
          {!item.is_reconciled && mode === 'search' && (
            <motion.div
              key="search"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="space-y-3"
            >
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Sok faktura, leverantorsfaktura..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  autoFocus
                  className="pl-9"
                />
              </div>

              {searchQuery.length > 0 && (
                <div className="text-xs text-muted-foreground">
                  Sokfunktionalitet for att hitta fakturor och leverantorsfakturor baserat pa nummer, kund eller belopp.
                </div>
              )}

              {/* Show filtered suggestions based on search */}
              {suggestions
                .filter((s) => {
                  if (!searchQuery) return false
                  const q = searchQuery.toLowerCase()
                  return (
                    s.label.toLowerCase().includes(q) ||
                    s.description.toLowerCase().includes(q)
                  )
                })
                .map((suggestion, index) => (
                  <MatchSuggestionComponent
                    key={suggestion.id}
                    suggestion={suggestion}
                    onAccept={handleAcceptSuggestion}
                    isLoading={isLoading}
                    index={index}
                  />
                ))}
            </motion.div>
          )}

          {/* Booking mode */}
          {!item.is_reconciled && mode === 'booking' && (
            <motion.div
              key="booking"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <QuickBookingForm
                transaction={tx}
                onSubmit={handleQuickBooking}
                isLoading={isLoading}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Split dialog */}
      {tx && (
        <SplitTransactionDialog
          open={splitDialogOpen}
          onOpenChange={setSplitDialogOpen}
          transaction={tx}
          onSplit={handleSplit}
          isLoading={isLoading}
        />
      )}
    </div>
  )
}
