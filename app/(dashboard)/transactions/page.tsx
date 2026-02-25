'use client'

import { useState, useEffect } from 'react'
import { AnimatePresence } from 'framer-motion'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useToast } from '@/components/ui/use-toast'
import { X } from 'lucide-react'
import TransactionForm from '@/components/transactions/TransactionForm'
import SwipeCategorizationView from '@/components/transactions/SwipeCategorizationView'
import BatchCategorySelector from '@/components/transactions/BatchCategorySelector'
import TransactionStatusBar from '@/components/transactions/TransactionStatusBar'
import TransactionInboxCard from '@/components/transactions/TransactionInboxCard'
import TransactionHistoryList from '@/components/transactions/TransactionHistoryList'
import InboxZeroState from '@/components/transactions/InboxZeroState'
import InvoiceMatchDialog from '@/components/transactions/InvoiceMatchDialog'
import TransactionBookingDialog from '@/components/transactions/TransactionBookingDialog'
import QuickReviewDialog from '@/components/transactions/QuickReviewDialog'
import DescribeTransactionDialog from '@/components/transactions/DescribeTransactionDialog'
import { EXPENSE_CATEGORIES, INCOME_CATEGORIES } from '@/components/transactions/transaction-types'
import { getDefaultAccountForCategory, getDefaultVatTreatmentForCategory } from '@/lib/bookkeeping/category-mapping'
import type { TransactionWithInvoice, ViewMode, CategorizeHandler } from '@/components/transactions/transaction-types'
import type { TransactionCategory, CreateTransactionInput, Invoice, Customer, VatTreatment, InvoiceInboxItem } from '@/types'
import type { SuggestedCategory, SuggestedTemplate } from '@/lib/transactions/category-suggestions'

export default function TransactionsPage() {
  const [transactions, setTransactions] = useState<TransactionWithInvoice[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [mode, setMode] = useState<ViewMode>('inbox')
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [isCreating, setIsCreating] = useState(false)
  const [showSwipeView, setShowSwipeView] = useState(false)
  const [categorySuggestions, setCategorySuggestions] = useState<Record<string, SuggestedCategory[]>>({})
  const [templateSuggestions, setTemplateSuggestions] = useState<Record<string, SuggestedTemplate[]>>({})
  const [isLoadingSuggestions, setIsLoadingSuggestions] = useState(false)
  const [processingId, setProcessingId] = useState<string | null>(null)

  // Batch mode
  const [isBatchMode, setIsBatchMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [showBatchSelector, setShowBatchSelector] = useState(false)
  const [batchProgress, setBatchProgress] = useState<{ done: number; total: number } | null>(null)

  // Invoice match dialog
  const [matchDialogOpen, setMatchDialogOpen] = useState(false)
  const [selectedTransaction, setSelectedTransaction] = useState<TransactionWithInvoice | null>(null)
  const [isConfirmingMatch, setIsConfirmingMatch] = useState(false)

  // Booking dialog (journal entry form)
  const [bookingDialogOpen, setBookingDialogOpen] = useState(false)
  const [bookingDialogTransaction, setBookingDialogTransaction] = useState<TransactionWithInvoice | null>(null)

  // Quick review dialog (suggestion review before booking)
  const [quickReviewOpen, setQuickReviewOpen] = useState(false)
  const [quickReviewTransaction, setQuickReviewTransaction] = useState<TransactionWithInvoice | null>(null)
  const [quickReviewCategory, setQuickReviewCategory] = useState<TransactionCategory | null>(null)
  const [quickReviewLabel, setQuickReviewLabel] = useState('')

  // Describe dialog
  const [describeDialogOpen, setDescribeDialogOpen] = useState(false)
  const [describeDialogTransaction, setDescribeDialogTransaction] = useState<TransactionWithInvoice | null>(null)

  // Entity type for tooltip context
  const [entityType, setEntityType] = useState<string>('enskild_firma')

  // Set of transaction IDs that are animating out (just categorized)
  const [exitingIds, setExitingIds] = useState<Set<string>>(new Set())

  const { toast } = useToast()
  const supabase = createClient()

  // Computed lists
  const uncategorizedTransactions = transactions
    .filter((t) => t.is_business === null && !exitingIds.has(t.id))
    .sort((a, b) => {
      const aHasMatch = a.potential_invoice ? 1 : 0
      const bHasMatch = b.potential_invoice ? 1 : 0
      if (aHasMatch !== bHasMatch) return bHasMatch - aHasMatch
      return b.date.localeCompare(a.date)
    })
  const transactionsWithMatches = transactions.filter((t) => t.potential_invoice && !t.invoice_id)

  async function fetchTransactions() {
    setIsLoading(true)
    const { data: txData, error: txError } = await supabase
      .from('transactions')
      .select('*')
      .order('date', { ascending: false })

    if (txError) {
      toast({ title: 'Fel', description: 'Kunde inte hämta transaktioner', variant: 'destructive' })
      setIsLoading(false)
      return
    }

    const potentialInvoiceIds = (txData || [])
      .filter((t) => t.potential_invoice_id)
      .map((t) => t.potential_invoice_id)

    let invoiceMap: Record<string, Invoice & { customer?: Customer }> = {}
    if (potentialInvoiceIds.length > 0) {
      const { data: invoices } = await supabase
        .from('invoices')
        .select('*, customer:customers(*)')
        .in('id', potentialInvoiceIds)
      if (invoices) {
        invoiceMap = invoices.reduce((acc, inv) => {
          acc[inv.id] = inv
          return acc
        }, {} as Record<string, Invoice & { customer?: Customer }>)
      }
    }

    // Fetch matched inbox items for unbooked transactions
    const unbookedTxIds = (txData || [])
      .filter((t) => !t.journal_entry_id && t.is_business === null)
      .map((t) => t.id)

    let inboxItemMap: Record<string, InvoiceInboxItem> = {}
    if (unbookedTxIds.length > 0) {
      const { data: inboxItems } = await supabase
        .from('invoice_inbox_items')
        .select('*')
        .in('matched_transaction_id', unbookedTxIds)
        .in('status', ['ready', 'processing'])
      if (inboxItems) {
        inboxItemMap = inboxItems.reduce((acc, item) => {
          if (item.matched_transaction_id) {
            acc[item.matched_transaction_id] = item as InvoiceInboxItem
          }
          return acc
        }, {} as Record<string, InvoiceInboxItem>)
      }
    }

    const transactionsWithInvoices: TransactionWithInvoice[] = (txData || []).map((t) => ({
      ...t,
      potential_invoice: t.potential_invoice_id ? invoiceMap[t.potential_invoice_id] : undefined,
      matched_inbox_item: inboxItemMap[t.id] || undefined,
    }))

    setTransactions(transactionsWithInvoices)
    setIsLoading(false)
  }

  async function fetchCategorySuggestions(txIds: string[]) {
    if (txIds.length === 0) return
    setIsLoadingSuggestions(true)
    try {
      const response = await fetch('/api/transactions/suggest-categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transaction_ids: txIds }),
      })
      const data = await response.json()
      if (data.suggestions) {
        setCategorySuggestions(data.suggestions)
      }
      if (data.template_suggestions) {
        setTemplateSuggestions(data.template_suggestions)
      }
    } catch {
      // Non-critical
    }
    setIsLoadingSuggestions(false)
  }

  // Fetch transactions on mount
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { fetchTransactions() }, [])

  // Fetch entity type for tooltip context
  useEffect(() => {
    async function fetchEntityType() {
      try {
        const res = await fetch('/api/settings')
        const data = await res.json()
        if (data?.entity_type) {
          setEntityType(data.entity_type)
        }
      } catch {
        // Non-critical, defaults to enskild_firma
      }
    }
    fetchEntityType()
  }, [])

  // Auto-fetch suggestions when transactions load
  useEffect(() => {
    const uncatIds = transactions
      .filter((t) => t.is_business === null)
      .map((t) => t.id)
      .slice(0, 50)
    if (uncatIds.length > 0) {
      fetchCategorySuggestions(uncatIds)
    }
  }, [transactions.length])

  const handleCategorize: CategorizeHandler = async (id, isBusiness, category, vatTreatment, accountOverride, templateId, inboxItemId) => {
    try {
      setProcessingId(id)
      const response = await fetch(`/api/transactions/${id}/categorize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          is_business: isBusiness,
          category,
          vat_treatment: vatTreatment,
          account_override: accountOverride,
          template_id: templateId,
          inbox_item_id: inboxItemId,
        }),
      })

      const result = await response.json()
      if (!response.ok) {
        toast({ title: 'Fel', description: result.error || 'Kunde inte uppdatera transaktion', variant: 'destructive' })
        setProcessingId(null)
        return null
      }

      // Mark as exiting for animation, then update state
      setExitingIds((prev) => new Set(prev).add(id))

      if (result.journal_entry_created) {
        toast({ title: 'Bokförd', description: 'Transaktion bokförd och verifikation skapad' })
      } else if (result.journal_entry_error) {
        toast({ title: 'Delvis bokförd', description: `Verifikation kunde inte skapas: ${result.journal_entry_error}`, variant: 'destructive' })
      } else {
        toast({ title: 'Delvis bokförd', description: 'Transaktion uppdaterad men verifikation kunde inte skapas' })
      }

      // Update transaction in state after a brief delay for animation
      setExitingIds((prev) => new Set(prev).add(id))
      setTimeout(() => {
        setTransactions((prev) =>
          prev.map((t) =>
            t.id === id
              ? { ...t, is_business: isBusiness, category: result.category, journal_entry_id: result.journal_entry_id }
              : t
          )
        )
        setExitingIds((prev) => {
          const next = new Set(prev)
          next.delete(id)
          return next
        })
        setProcessingId(null)
      }, 350)

      return result.journal_entry_id || null
    } catch {
      toast({ title: 'Fel', description: 'Något gick fel vid bokföring', variant: 'destructive' })
      setProcessingId(null)
      return null
    }
  }

  async function handleMarkPrivate(id: string) {
    await handleCategorize(id, false, 'private')
  }

  async function handleConfirmInvoiceMatch() {
    if (!selectedTransaction?.potential_invoice) return
    setIsConfirmingMatch(true)

    try {
      const response = await fetch(`/api/transactions/${selectedTransaction.id}/match-invoice`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invoice_id: selectedTransaction.potential_invoice.id }),
      })
      const result = await response.json()
      if (!response.ok) {
        toast({ title: 'Fel', description: result.error || 'Kunde inte matcha faktura', variant: 'destructive' })
        setIsConfirmingMatch(false)
        return
      }

      toast({
        title: 'Faktura matchad',
        description: `Faktura ${selectedTransaction.potential_invoice.invoice_number} markerad som betald`,
      })
      setMatchDialogOpen(false)

      // Mark as exiting for animation
      setExitingIds((prev) => new Set(prev).add(selectedTransaction.id))
      setTimeout(() => {
        setTransactions((prev) =>
          prev.map((t) =>
            t.id === selectedTransaction.id
              ? {
                  ...t,
                  invoice_id: selectedTransaction.potential_invoice?.id || null,
                  potential_invoice_id: null,
                  potential_invoice: undefined,
                  is_business: true,
                  category: 'income_services' as TransactionCategory,
                  journal_entry_id: result.journal_entry_id,
                }
              : t
          )
        )
        setExitingIds((prev) => {
          const next = new Set(prev)
          next.delete(selectedTransaction.id)
          return next
        })
        setSelectedTransaction(null)
        setIsConfirmingMatch(false)
      }, 350)
    } catch {
      toast({ title: 'Fel', description: 'Något gick fel vid matchning', variant: 'destructive' })
      setIsConfirmingMatch(false)
    }
  }

  async function handleMatchInvoice(transactionId: string, invoiceId: string): Promise<boolean> {
    try {
      const response = await fetch(`/api/transactions/${transactionId}/match-invoice`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invoice_id: invoiceId }),
      })
      const result = await response.json()
      if (!response.ok) {
        toast({ title: 'Fel', description: result.error || 'Kunde inte matcha faktura', variant: 'destructive' })
        return false
      }

      const transaction = transactions.find((t) => t.id === transactionId)
      const invoiceNumber = transaction?.potential_invoice?.invoice_number || ''

      setTransactions((prev) =>
        prev.map((t) =>
          t.id === transactionId
            ? {
                ...t,
                invoice_id: invoiceId,
                potential_invoice_id: null,
                potential_invoice: undefined,
                is_business: true,
                category: 'income_services' as TransactionCategory,
                journal_entry_id: result.journal_entry_id,
              }
            : t
        )
      )

      toast({ title: 'Faktura matchad', description: `Faktura ${invoiceNumber} markerad som betald` })
      return true
    } catch {
      toast({ title: 'Fel', description: 'Något gick fel vid matchning', variant: 'destructive' })
      return false
    }
  }

  async function handleCreateTransaction(data: CreateTransactionInput) {
    setIsCreating(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      toast({ title: 'Fel', description: 'Du måste vara inloggad', variant: 'destructive' })
      setIsCreating(false)
      return
    }

    const { data: transaction, error } = await supabase
      .from('transactions')
      .insert({
        user_id: user.id,
        date: data.date,
        description: data.description,
        amount: data.amount,
        currency: data.currency,
        category: data.category || 'uncategorized',
        is_business: data.is_business,
        notes: data.notes,
      })
      .select()
      .single()

    if (error) {
      toast({ title: 'Fel', description: error.message, variant: 'destructive' })
    } else {
      toast({ title: 'Transaktion tillagd', description: `${data.description} har lagts till` })
      setTransactions([transaction, ...transactions])
      setIsDialogOpen(false)
    }
    setIsCreating(false)
  }

  function handleTransactionBooked(transactionId: string, journalEntryId: string) {
    setExitingIds((prev) => new Set(prev).add(transactionId))
    setTimeout(() => {
      setTransactions((prev) =>
        prev.map((t) =>
          t.id === transactionId
            ? { ...t, is_business: true, journal_entry_id: journalEntryId }
            : t
        )
      )
      setExitingIds((prev) => {
        const next = new Set(prev)
        next.delete(transactionId)
        return next
      })
    }, 350)
    setBookingDialogOpen(false)
    setBookingDialogTransaction(null)
    toast({ title: 'Bokförd', description: 'Transaktion bokförd och verifikation skapad' })
  }

  // Batch mode handlers
  function toggleBatchSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function exitBatchMode() {
    setIsBatchMode(false)
    setSelectedIds(new Set())
  }

  async function handleBatchMarkPrivate() {
    const ids = Array.from(selectedIds)
    setBatchProgress({ done: 0, total: ids.length })
    for (let i = 0; i < ids.length; i++) {
      await handleCategorize(ids[i], false, 'private')
      setBatchProgress({ done: i + 1, total: ids.length })
    }
    setBatchProgress(null)
    toast({ title: 'Klart', description: `${ids.length} transaktioner markerade som privat` })
    exitBatchMode()
  }

  async function handleBatchCategorize(category: TransactionCategory, vatTreatment?: VatTreatment) {
    const ids = Array.from(selectedIds)
    setBatchProgress({ done: 0, total: ids.length })
    let successes = 0
    const failures: string[] = []
    for (let i = 0; i < ids.length; i++) {
      const result = await handleCategorize(ids[i], true, category, vatTreatment)
      if (result) {
        successes++
      } else {
        const tx = transactions.find((t) => t.id === ids[i])
        failures.push(tx?.description || ids[i])
      }
      setBatchProgress({ done: i + 1, total: ids.length })
    }
    setBatchProgress(null)
    setShowBatchSelector(false)
    if (failures.length === 0) {
      toast({ title: 'Klart', description: `${successes} transaktioner bokförda` })
    } else {
      toast({
        title: 'Delvis klart',
        description: `${successes} lyckades, ${failures.length} misslyckades: ${failures.slice(0, 3).join(', ')}${failures.length > 3 ? '...' : ''}`,
        variant: 'destructive',
      })
    }
    exitBatchMode()
  }

  async function openSwipeView() {
    try {
      // Match invoices to transactions
      await fetch('/api/transactions/batch-match-invoices', { method: 'POST' })
        .then((r) => r.json())
        .then((data) => {
          if (data.matched > 0) fetchTransactions()
        })
    } catch {
      // Non-critical
    }
    try {
      // Run document matching sweep for latest inbox matches
      await fetch('/api/documents/match-sweep', { method: 'POST' })
        .then((r) => r.json())
        .then((data) => {
          if (data.data?.matched > 0) fetchTransactions()
        })
    } catch {
      // Non-critical
    }
    const uncatIds = uncategorizedTransactions.map((t) => t.id)
    await fetchCategorySuggestions(uncatIds)
    setShowSwipeView(true)
  }

  function openMatchDialog(transaction: TransactionWithInvoice) {
    setSelectedTransaction(transaction)
    setMatchDialogOpen(true)
  }

  function openCategoryDialog(transaction: TransactionWithInvoice) {
    setBookingDialogTransaction(transaction)
    setBookingDialogOpen(true)
  }

  function handleOpenQuickReview(transaction: TransactionWithInvoice, suggestion: SuggestedCategory) {
    const allCategories = [...EXPENSE_CATEGORIES, ...INCOME_CATEGORIES]
    const label = allCategories.find((c) => c.value === suggestion.category)?.label || suggestion.label
    setQuickReviewTransaction(transaction)
    setQuickReviewCategory(suggestion.category)
    setQuickReviewLabel(label)
    setQuickReviewOpen(true)
  }

  async function handleQuickReviewConfirm(
    id: string,
    category: TransactionCategory,
    vatTreatment: VatTreatment | undefined,
    accountOverride: string | undefined
  ): Promise<string | null> {
    const journalEntryId = await handleCategorize(id, true, category, vatTreatment, accountOverride)
    if (journalEntryId) {
      setQuickReviewOpen(false)
      setQuickReviewTransaction(null)
      setQuickReviewCategory(null)
    }
    return journalEntryId
  }

  function openDescribeDialog(transaction: TransactionWithInvoice) {
    setDescribeDialogTransaction(transaction)
    setDescribeDialogOpen(true)
  }

  function handleDescribeCategorized(transactionId: string, journalEntryId: string | null) {
    setExitingIds((prev) => new Set(prev).add(transactionId))
    setTimeout(() => {
      setTransactions((prev) =>
        prev.map((t) =>
          t.id === transactionId
            ? { ...t, is_business: true, journal_entry_id: journalEntryId }
            : t
        )
      )
      setExitingIds((prev) => {
        const next = new Set(prev)
        next.delete(transactionId)
        return next
      })
    }, 350)
  }

  function handleBatchApplied() {
    fetchTransactions()
  }

  // Swipe view
  if (showSwipeView && uncategorizedTransactions.length > 0) {
    return (
      <SwipeCategorizationView
        transactions={uncategorizedTransactions}
        suggestions={categorySuggestions}
        templateSuggestions={templateSuggestions}
        onCategorize={handleCategorize}
        onMatchInvoice={handleMatchInvoice}
        onClose={() => setShowSwipeView(false)}
      />
    )
  }

  return (
    <div className="space-y-6">
      {/* Status bar with mode toggle */}
      <TransactionStatusBar
        uncategorizedCount={uncategorizedTransactions.length}
        invoiceMatchCount={transactionsWithMatches.length}
        mode={mode}
        onModeChange={setMode}
        onOpenSwipeView={openSwipeView}
        onOpenCreateDialog={() => setIsDialogOpen(true)}
        isLoadingSuggestions={isLoadingSuggestions}
        isBatchMode={isBatchMode}
        onToggleBatchMode={() => (isBatchMode ? exitBatchMode() : setIsBatchMode(true))}
      />

      {/* Content based on mode */}
      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="animate-pulse">
              <CardContent className="py-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-2">
                    <div className="h-5 bg-muted rounded w-48" />
                    <div className="h-4 bg-muted rounded w-24" />
                  </div>
                  <div className="h-6 bg-muted rounded w-20" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : mode === 'inbox' ? (
        uncategorizedTransactions.length === 0 ? (
          <InboxZeroState
            hasTransactions={transactions.length > 0}
            onCreateTransaction={() => setIsDialogOpen(true)}
          />
        ) : (
          <div className="space-y-2">
            <AnimatePresence mode="popLayout">
              {uncategorizedTransactions.map((transaction) => (
                <TransactionInboxCard
                  key={transaction.id}
                  transaction={transaction}
                  suggestions={categorySuggestions[transaction.id]}
                  templateSuggestions={templateSuggestions[transaction.id]}
                  processingId={processingId}
                  isBatchMode={isBatchMode}
                  isSelected={selectedIds.has(transaction.id)}
                  entityType={entityType}
                  onCategorize={handleCategorize}
                  onMarkPrivate={handleMarkPrivate}
                  onOpenMatchDialog={openMatchDialog}
                  onOpenCategoryDialog={openCategoryDialog}
                  onOpenDescribe={openDescribeDialog}
                  onOpenQuickReview={handleOpenQuickReview}
                  onToggleSelect={toggleBatchSelect}
                />
              ))}
            </AnimatePresence>
          </div>
        )
      ) : (
        <TransactionHistoryList
          transactions={transactions}
          onOpenMatchDialog={openMatchDialog}
          onOpenCategoryDialog={openCategoryDialog}
        />
      )}

      {/* Batch mode floating action bar */}
      {isBatchMode && selectedIds.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 bg-background border rounded-xl shadow-lg px-4 py-3">
          <Badge variant="secondary">{selectedIds.size} valda</Badge>
          <Button variant="ghost" size="sm" onClick={() => setSelectedIds(new Set())}>
            <X className="mr-1 h-3 w-3" />
            Avmarkera
          </Button>
          <Button variant="outline" size="sm" onClick={handleBatchMarkPrivate}>
            Markera som privat
          </Button>
          <Button size="sm" onClick={() => setShowBatchSelector(true)}>
            Bokför {selectedIds.size} st
          </Button>
        </div>
      )}

      {/* Dialogs */}
      <BatchCategorySelector
        open={showBatchSelector}
        onOpenChange={setShowBatchSelector}
        selectedCount={selectedIds.size}
        onSelectCategory={handleBatchCategorize}
        progress={batchProgress}
      />

      <InvoiceMatchDialog
        open={matchDialogOpen}
        onOpenChange={setMatchDialogOpen}
        transaction={selectedTransaction}
        isConfirming={isConfirmingMatch}
        onConfirm={handleConfirmInvoiceMatch}
      />

      <TransactionBookingDialog
        open={bookingDialogOpen}
        onOpenChange={setBookingDialogOpen}
        transaction={bookingDialogTransaction}
        onBooked={handleTransactionBooked}
      />

      <QuickReviewDialog
        key={quickReviewTransaction?.id ?? '' + String(quickReviewCategory)}
        open={quickReviewOpen}
        onOpenChange={setQuickReviewOpen}
        transaction={quickReviewTransaction}
        category={quickReviewCategory}
        categoryLabel={quickReviewLabel}
        defaultAccount={quickReviewCategory ? getDefaultAccountForCategory(quickReviewCategory) : ''}
        defaultVat={quickReviewCategory ? (getDefaultVatTreatmentForCategory(quickReviewCategory) ?? 'none') : 'none'}
        onConfirm={handleQuickReviewConfirm}
      />

      <DescribeTransactionDialog
        open={describeDialogOpen}
        onOpenChange={setDescribeDialogOpen}
        transaction={describeDialogTransaction}
        onCategorized={handleDescribeCategorized}
        onBatchApplied={handleBatchApplied}
      />

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Lägg till transaktion</DialogTitle>
          </DialogHeader>
          <TransactionForm onSubmit={handleCreateTransaction} isLoading={isCreating} />
        </DialogContent>
      </Dialog>
    </div>
  )
}
