'use client'

import { useState, useEffect, useCallback } from 'react'
import { motion } from 'framer-motion'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useToast } from '@/components/ui/use-toast'
import { formatCurrency } from '@/lib/utils'
import {
  Zap,
  Search,
  Filter,
  CheckCircle2,
  Loader2,
  ArrowLeft,
} from 'lucide-react'
import TransactionList from './TransactionList'
import MatchPanel from './MatchPanel'
import SessionStats from './SessionStats'
import ReconciliationProgressBar from './ReconciliationProgressBar'
import type { Transaction } from '@/types'
import type {
  BankReconciliationSession,
  BankReconciliationItem,
  MatchSuggestion,
  ReconciliationSummary,
  ReconciliationFilter,
  ReconciliationMatchType,
} from '@/types/bank-reconciliation'

interface ReconciliationWorkspaceProps {
  sessionId: string
  onBack: () => void
}

export default function ReconciliationWorkspace({
  sessionId,
  onBack,
}: ReconciliationWorkspaceProps) {
  const [session, setSession] = useState<BankReconciliationSession | null>(null)
  const [items, setItems] = useState<BankReconciliationItem[]>([])
  const [summary, setSummary] = useState<ReconciliationSummary | null>(null)
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null)
  const [suggestions, setSuggestions] = useState<MatchSuggestion[]>([])
  const [isLoadingSuggestions, setIsLoadingSuggestions] = useState(false)
  const [filter, setFilter] = useState<ReconciliationFilter>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [isAutoMatching, setIsAutoMatching] = useState(false)
  const [isCompleting, setIsCompleting] = useState(false)
  const { toast } = useToast()

  // Fetch session data
  const fetchSession = useCallback(async () => {
    try {
      const response = await fetch(`/api/reconciliation/sessions/${sessionId}`)
      const result = await response.json()

      if (!response.ok) {
        toast({
          title: 'Fel',
          description: result.error || 'Kunde inte hämta session',
          variant: 'destructive',
        })
        return
      }

      setSession(result.data.session)
      setItems(result.data.items)
      setSummary(result.data.summary)

      // Auto-select first unmatched item if nothing selected
      if (!selectedItemId) {
        const firstUnmatched = result.data.items.find(
          (i: BankReconciliationItem) => !i.is_reconciled
        )
        if (firstUnmatched) {
          setSelectedItemId(firstUnmatched.id)
        }
      }
    } catch {
      toast({
        title: 'Fel',
        description: 'Kunde inte hämta sessiondata',
        variant: 'destructive',
      })
    } finally {
      setIsLoading(false)
    }
  }, [sessionId, selectedItemId, toast])

  useEffect(() => {
    fetchSession()
  }, [fetchSession])

  // Fetch suggestions when selected item changes
  useEffect(() => {
    if (!selectedItemId) {
      setSuggestions([])
      return
    }

    const item = items.find((i) => i.id === selectedItemId)
    if (!item || item.is_reconciled) {
      setSuggestions([])
      return
    }

    // For items that already have auto-match suggestions, show them
    if (item.confidence_score > 0 && item.matched_invoice_id) {
      const invoice = item.matched_invoice
      if (invoice) {
        setSuggestions([
          {
            type: 'invoice',
            id: invoice.id,
            label: `Faktura ${(invoice as { invoice_number?: string }).invoice_number || ''}`,
            description: (invoice as { customer?: { name?: string } }).customer?.name || 'Okänd kund',
            confidence: item.confidence_score,
            matchReason: item.notes || 'Auto-matchad',
            invoice: invoice as any,
          },
        ])
        return
      }
    }

    // Otherwise fetch fresh suggestions
    fetchSuggestionsForItem(item)
  }, [selectedItemId, items])

  async function fetchSuggestionsForItem(item: BankReconciliationItem) {
    // For now, we use the existing match data from auto-matching
    // In production, this would call an API to get fresh suggestions
    setIsLoadingSuggestions(true)

    try {
      // Build suggestions from item data
      const newSuggestions: MatchSuggestion[] = []

      if (item.matched_invoice_id && item.matched_invoice) {
        const invoice = item.matched_invoice as any
        newSuggestions.push({
          type: 'invoice',
          id: invoice.id,
          label: `Faktura ${invoice.invoice_number || ''}`,
          description: invoice.customer?.name || 'Okänd kund',
          confidence: item.confidence_score || 0.5,
          matchReason: item.notes || 'Föreslaget baserat på belopp',
          invoice,
        })
      }

      setSuggestions(newSuggestions)
    } finally {
      setIsLoadingSuggestions(false)
    }
  }

  // Auto-match all unmatched transactions
  async function handleAutoMatch() {
    setIsAutoMatching(true)

    try {
      const response = await fetch(`/api/reconciliation/sessions/${sessionId}/auto-match`, {
        method: 'POST',
      })
      const result = await response.json()

      if (!response.ok) {
        toast({
          title: 'Fel',
          description: result.error || 'Auto-matchning misslyckades',
          variant: 'destructive',
        })
        return
      }

      toast({
        title: 'Auto-matchning klar',
        description: result.data.message,
      })

      // Refresh session data
      await fetchSession()
    } catch {
      toast({
        title: 'Fel',
        description: 'Något gick fel vid auto-matchning',
        variant: 'destructive',
      })
    } finally {
      setIsAutoMatching(false)
    }
  }

  // Reconcile a single item
  async function handleReconcile(
    itemId: string,
    matchType: ReconciliationMatchType,
    matchId?: string,
    debitAccount?: string,
    creditAccount?: string,
    description?: string
  ) {
    const response = await fetch(`/api/reconciliation/items/${itemId}/reconcile`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        match_type: matchType,
        matched_invoice_id: matchType !== 'auto_rule' ? matchId : undefined,
        matched_supplier_invoice_id: undefined,
        debit_account: debitAccount,
        credit_account: creditAccount,
        description,
      }),
    })

    const result = await response.json()

    if (!response.ok) {
      throw new Error(result.error || 'Kunde inte avstämma')
    }

    // Refresh data and move to next unmatched
    await fetchSession()

    // Auto-advance to next unmatched item
    const nextUnmatched = items.find(
      (i) => !i.is_reconciled && i.id !== itemId
    )
    if (nextUnmatched) {
      setSelectedItemId(nextUnmatched.id)
    }
  }

  // Split a transaction
  async function handleSplit(
    itemId: string,
    splits: { amount: number; description: string; debit_account: string; credit_account: string }[]
  ) {
    const response = await fetch(`/api/reconciliation/items/${itemId}/split`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ splits }),
    })

    const result = await response.json()

    if (!response.ok) {
      throw new Error(result.error || 'Kunde inte dela transaktion')
    }

    await fetchSession()

    const nextUnmatched = items.find(
      (i) => !i.is_reconciled && i.id !== itemId
    )
    if (nextUnmatched) {
      setSelectedItemId(nextUnmatched.id)
    }
  }

  // Unmatch a transaction
  async function handleUnmatch(itemId: string) {
    const response = await fetch(`/api/reconciliation/items/${itemId}/unmatch`, {
      method: 'POST',
    })

    const result = await response.json()

    if (!response.ok) {
      throw new Error(result.error || 'Kunde inte ångra matchning')
    }

    await fetchSession()
  }

  // Complete session
  async function handleComplete() {
    setIsCompleting(true)

    try {
      const response = await fetch(`/api/reconciliation/sessions/${sessionId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'completed' }),
      })

      if (!response.ok) {
        const result = await response.json()
        toast({
          title: 'Fel',
          description: result.error || 'Kunde inte slutföra',
          variant: 'destructive',
        })
        return
      }

      toast({
        title: 'Avstamning klar!',
        description: `${summary?.matchedCount || 0} transaktioner avstämda`,
      })

      onBack()
    } catch {
      toast({
        title: 'Fel',
        description: 'Något gick fel',
        variant: 'destructive',
      })
    } finally {
      setIsCompleting(false)
    }
  }

  const selectedItem = items.find((i) => i.id === selectedItemId) || null

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)]">
      {/* Top bar */}
      <div className="shrink-0 space-y-3 pb-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={onBack} className="h-8">
              <ArrowLeft className="h-4 w-4 mr-1" />
              Tillbaka
            </Button>
            <div>
              <h2 className="text-lg font-semibold">
                {session?.account_name || 'Bankavstamning'}
              </h2>
              <p className="text-xs text-muted-foreground">
                {session?.period_start} - {session?.period_end}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleAutoMatch}
              disabled={isAutoMatching || summary?.unmatchedCount === 0}
            >
              {isAutoMatching ? (
                <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
              ) : (
                <Zap className="h-4 w-4 mr-1.5" />
              )}
              {isAutoMatching ? 'Matchar...' : 'Auto-matcha alla'}
            </Button>

            {summary && summary.matchedCount === summary.totalTransactions && summary.totalTransactions > 0 && (
              <Button
                size="sm"
                onClick={handleComplete}
                disabled={isCompleting}
                className="bg-green-600 hover:bg-green-700"
              >
                {isCompleting ? (
                  <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                ) : (
                  <CheckCircle2 className="h-4 w-4 mr-1.5" />
                )}
                Slutför avstämning
              </Button>
            )}
          </div>
        </div>

        {/* Progress bar */}
        {summary && (
          <ReconciliationProgressBar
            matched={summary.matchedCount}
            total={summary.totalTransactions}
          />
        )}

        {/* Stats */}
        {summary && <SessionStats summary={summary} />}

        {/* Filters */}
        <div className="flex items-center gap-3">
          <div className="relative flex-1 max-w-xs">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="Sök transaktioner..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-8 h-8 text-sm"
            />
          </div>

          <Tabs
            value={filter}
            onValueChange={(v) => setFilter(v as ReconciliationFilter)}
          >
            <TabsList className="h-8">
              <TabsTrigger value="all" className="text-xs h-7 px-2.5">
                Alla
                <Badge variant="secondary" className="ml-1 text-[10px] px-1 py-0 h-4">
                  {items.length}
                </Badge>
              </TabsTrigger>
              <TabsTrigger value="unmatched" className="text-xs h-7 px-2.5">
                Omatchade
                <Badge variant="destructive" className="ml-1 text-[10px] px-1 py-0 h-4">
                  {summary?.unmatchedCount || 0}
                </Badge>
              </TabsTrigger>
              <TabsTrigger value="suggestions" className="text-xs h-7 px-2.5">
                Förslag
              </TabsTrigger>
              <TabsTrigger value="matched" className="text-xs h-7 px-2.5">
                Klara
                <Badge variant="success" className="ml-1 text-[10px] px-1 py-0 h-4">
                  {summary?.matchedCount || 0}
                </Badge>
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </div>

      {/* Split view workspace */}
      <div className="flex-1 flex gap-4 min-h-0">
        {/* Left: Transaction list */}
        <Card className="w-1/2 flex flex-col overflow-hidden">
          <CardContent className="flex-1 overflow-y-auto p-2">
            <TransactionList
              items={items}
              selectedItemId={selectedItemId}
              onSelectItem={setSelectedItemId}
              filter={filter}
              searchQuery={searchQuery}
            />
          </CardContent>
        </Card>

        {/* Right: Match panel */}
        <Card className="w-1/2 flex flex-col overflow-hidden">
          <MatchPanel
            item={selectedItem}
            suggestions={suggestions}
            isLoadingSuggestions={isLoadingSuggestions}
            onReconcile={handleReconcile}
            onSplit={handleSplit}
            onUnmatch={handleUnmatch}
          />
        </Card>
      </div>
    </div>
  )
}
