'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { useToast } from '@/components/ui/use-toast'
import { formatCurrency, formatDate } from '@/lib/utils'
import { getCategoryDisplayName } from '@/lib/tax/expense-warnings'
import Link from 'next/link'
import { Plus, Search, ArrowLeftRight, ArrowUpRight, ArrowDownRight, Sparkles, Check, FileText, Link2, Upload } from 'lucide-react'
import TransactionForm from '@/components/transactions/TransactionForm'
import SwipeCategorizationView from '@/components/transactions/SwipeCategorizationView'
import type { Transaction, TransactionCategory, CreateTransactionInput, Invoice, Customer } from '@/types'
import type { SuggestedCategory } from '@/lib/transactions/category-suggestions'

interface TransactionWithInvoice extends Transaction {
  potential_invoice?: Invoice & { customer?: Customer }
}

export default function TransactionsPage() {
  const [transactions, setTransactions] = useState<TransactionWithInvoice[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [activeTab, setActiveTab] = useState('all')
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [isCreating, setIsCreating] = useState(false)
  const [showSwipeView, setShowSwipeView] = useState(false)
  const [matchDialogOpen, setMatchDialogOpen] = useState(false)
  const [selectedTransaction, setSelectedTransaction] = useState<TransactionWithInvoice | null>(null)
  const [isConfirmingMatch, setIsConfirmingMatch] = useState(false)
  const [categorySuggestions, setCategorySuggestions] = useState<Record<string, SuggestedCategory[]>>({})
  const [isLoadingSuggestions, setIsLoadingSuggestions] = useState(false)
  const { toast } = useToast()
  const supabase = createClient()

  useEffect(() => {
    fetchTransactions()
  }, [])

  async function fetchTransactions() {
    setIsLoading(true)

    // Fetch transactions
    const { data: txData, error: txError } = await supabase
      .from('transactions')
      .select('*')
      .order('date', { ascending: false })

    if (txError) {
      toast({
        title: 'Fel',
        description: 'Kunde inte hämta transaktioner',
        variant: 'destructive',
      })
      setIsLoading(false)
      return
    }

    // Get potential invoice IDs
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

    // Merge potential invoices into transactions
    const transactionsWithInvoices: TransactionWithInvoice[] = (txData || []).map((t) => ({
      ...t,
      potential_invoice: t.potential_invoice_id ? invoiceMap[t.potential_invoice_id] : undefined,
    }))

    setTransactions(transactionsWithInvoices)
    setIsLoading(false)
  }

  async function handleCreateTransaction(data: CreateTransactionInput) {
    setIsCreating(true)

    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      toast({
        title: 'Fel',
        description: 'Du måste vara inloggad',
        variant: 'destructive',
      })
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
      toast({
        title: 'Fel',
        description: error.message,
        variant: 'destructive',
      })
    } else {
      toast({
        title: 'Transaktion tillagd',
        description: `${data.description} har lagts till`,
      })
      setTransactions([transaction, ...transactions])
      setIsDialogOpen(false)
    }

    setIsCreating(false)
  }

  async function handleCategorize(id: string, isBusiness: boolean, category?: TransactionCategory) {
    try {
      const response = await fetch(`/api/transactions/${id}/categorize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_business: isBusiness, category }),
      })

      const result = await response.json()

      if (!response.ok) {
        toast({
          title: 'Fel',
          description: result.error || 'Kunde inte uppdatera transaktion',
          variant: 'destructive',
        })
        return false
      }

      // Update local state
      setTransactions(
        transactions.map((t) =>
          t.id === id
            ? {
                ...t,
                is_business: isBusiness,
                category: result.category,
                journal_entry_id: result.journal_entry_id,
              }
            : t
        )
      )

      // Show appropriate toast
      if (result.journal_entry_created) {
        toast({
          title: 'Bokförd',
          description: 'Transaktion kategoriserad och verifikation skapad',
        })
      } else if (result.journal_entry_error) {
        toast({
          title: 'Kategoriserad',
          description: `Bokföring misslyckades: ${result.journal_entry_error}`,
          variant: 'destructive',
        })
      } else {
        toast({
          title: 'Kategoriserad',
          description: 'Transaktion uppdaterad men kunde inte bokföras',
        })
      }

      return true
    } catch (err) {
      toast({
        title: 'Fel',
        description: 'Något gick fel vid kategorisering',
        variant: 'destructive',
      })
      return false
    }
  }

  async function handleConfirmInvoiceMatch() {
    if (!selectedTransaction || !selectedTransaction.potential_invoice) return

    setIsConfirmingMatch(true)

    try {
      const response = await fetch(`/api/transactions/${selectedTransaction.id}/match-invoice`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invoice_id: selectedTransaction.potential_invoice.id }),
      })

      const result = await response.json()

      if (!response.ok) {
        toast({
          title: 'Fel',
          description: result.error || 'Kunde inte matcha faktura',
          variant: 'destructive',
        })
        setIsConfirmingMatch(false)
        return
      }

      // Update local state
      setTransactions(
        transactions.map((t) =>
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

      toast({
        title: 'Faktura matchad',
        description: `Faktura ${selectedTransaction.potential_invoice.invoice_number} markerad som betald`,
      })

      setMatchDialogOpen(false)
      setSelectedTransaction(null)
    } catch (err) {
      toast({
        title: 'Fel',
        description: 'Något gick fel vid matchning',
        variant: 'destructive',
      })
    }

    setIsConfirmingMatch(false)
  }

  function openMatchDialog(transaction: TransactionWithInvoice) {
    setSelectedTransaction(transaction)
    setMatchDialogOpen(true)
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
        toast({
          title: 'Fel',
          description: result.error || 'Kunde inte matcha faktura',
          variant: 'destructive',
        })
        return false
      }

      // Find the invoice number for the toast
      const transaction = transactions.find(t => t.id === transactionId)
      const invoiceNumber = transaction?.potential_invoice?.invoice_number || ''

      // Update local state
      setTransactions(
        transactions.map((t) =>
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

      toast({
        title: 'Faktura matchad',
        description: `Faktura ${invoiceNumber} markerad som betald`,
      })

      return true
    } catch (err) {
      toast({
        title: 'Fel',
        description: 'Något gick fel vid matchning',
        variant: 'destructive',
      })
      return false
    }
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
    } catch {
      // Non-critical, swipe still works without suggestions
    }
    setIsLoadingSuggestions(false)
  }

  async function runBatchInvoiceMatching() {
    try {
      const response = await fetch('/api/transactions/batch-match-invoices', {
        method: 'POST',
      })
      const data = await response.json()
      if (data.matched > 0) {
        // Refresh transactions to get updated potential_invoice_ids
        await fetchTransactions()
      }
    } catch {
      // Non-critical
    }
  }

  async function openSwipeView() {
    // Run batch invoice matching for income transactions first
    await runBatchInvoiceMatching()
    const uncatIds = uncategorizedTransactions.map((t) => t.id)
    await fetchCategorySuggestions(uncatIds)
    setShowSwipeView(true)
  }

  const uncategorizedTransactions = transactions
    .filter((t) => t.is_business === null)
    .sort((a, b) => {
      // Invoice-matched first
      const aHasMatch = a.potential_invoice ? 1 : 0
      const bHasMatch = b.potential_invoice ? 1 : 0
      if (aHasMatch !== bHasMatch) return bHasMatch - aHasMatch
      // Then by date descending
      return b.date.localeCompare(a.date)
    })
  const transactionsWithMatches = transactions.filter((t) => t.potential_invoice && !t.invoice_id)
  const filteredTransactions = transactions.filter((t) => {
    const matchesSearch = t.description.toLowerCase().includes(searchTerm.toLowerCase())
    const matchesTab =
      activeTab === 'all' ||
      (activeTab === 'uncategorized' && t.is_business === null) ||
      (activeTab === 'business' && t.is_business === true) ||
      (activeTab === 'private' && t.is_business === false) ||
      (activeTab === 'matches' && t.potential_invoice && !t.invoice_id)
    return matchesSearch && matchesTab
  })

  if (showSwipeView && uncategorizedTransactions.length > 0) {
    return (
      <SwipeCategorizationView
        transactions={uncategorizedTransactions}
        suggestions={categorySuggestions}
        onCategorize={handleCategorize}
        onMatchInvoice={handleMatchInvoice}
        onClose={() => setShowSwipeView(false)}
      />
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Transaktioner</h1>
          <p className="text-muted-foreground">
            Hantera och kategorisera dina transaktioner
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" asChild>
            <Link href="/import">
              <Upload className="mr-2 h-4 w-4" />
              Importera
            </Link>
          </Button>
          {uncategorizedTransactions.length > 0 && (
            <Button variant="outline" onClick={openSwipeView} disabled={isLoadingSuggestions}>
              <Sparkles className="mr-2 h-4 w-4" />
              {isLoadingSuggestions ? 'Laddar...' : `Kategorisera (${uncategorizedTransactions.length})`}
            </Button>
          )}
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="mr-2 h-4 w-4" />
                Ny transaktion
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Lägg till transaktion</DialogTitle>
              </DialogHeader>
              <TransactionForm onSubmit={handleCreateTransaction} isLoading={isCreating} />
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Search and tabs */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Sök transaktioner..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="all">Alla</TabsTrigger>
            <TabsTrigger value="uncategorized">
              Ej kategoriserade
              {uncategorizedTransactions.length > 0 && (
                <Badge variant="secondary" className="ml-2">
                  {uncategorizedTransactions.length}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="matches">
              Fakturamatchningar
              {transactionsWithMatches.length > 0 && (
                <Badge variant="secondary" className="ml-2">
                  {transactionsWithMatches.length}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="business">Företag</TabsTrigger>
            <TabsTrigger value="private">Privat</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {/* Transaction list */}
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
      ) : filteredTransactions.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <ArrowLeftRight className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium">Inga transaktioner</h3>
            <p className="text-muted-foreground text-center mt-1">
              {searchTerm
                ? 'Inga transaktioner matchar din sökning'
                : 'Importera transaktioner från din bank eller lägg till manuellt'}
            </p>
            {!searchTerm && (
              <div className="flex gap-2 mt-4">
                <Button asChild>
                  <Link href="/import">
                    <Upload className="mr-2 h-4 w-4" />
                    Importera transaktioner
                  </Link>
                </Button>
                <Button variant="outline" onClick={() => setIsDialogOpen(true)}>
                  <Plus className="mr-2 h-4 w-4" />
                  Lägg till manuellt
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {filteredTransactions.map((transaction) => (
            <Card
              key={transaction.id}
              className={`hover:border-primary/50 transition-colors ${
                transaction.is_business === null ? 'border-warning/50' : ''
              } ${transaction.potential_invoice && !transaction.invoice_id ? 'border-blue-500/50' : ''}`}
            >
              <CardContent className="py-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div
                      className={`h-10 w-10 rounded-full flex items-center justify-center ${
                        transaction.amount > 0
                          ? 'bg-success/10 text-success'
                          : 'bg-destructive/10 text-destructive'
                      }`}
                    >
                      {transaction.amount > 0 ? (
                        <ArrowUpRight className="h-5 w-5" />
                      ) : (
                        <ArrowDownRight className="h-5 w-5" />
                      )}
                    </div>
                    <div>
                      <p className="font-medium">{transaction.description}</p>
                      <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                        <span>{formatDate(transaction.date)}</span>
                        {transaction.is_business !== null && (
                          <>
                            <span>·</span>
                            <Badge
                              variant={transaction.is_business ? 'default' : 'secondary'}
                            >
                              {transaction.is_business
                                ? getCategoryDisplayName(transaction.category)
                                : 'Privat'}
                            </Badge>
                          </>
                        )}
                        {transaction.invoice_id && (
                          <>
                            <span>·</span>
                            <Badge variant="outline" className="text-blue-600 border-blue-600">
                              <Link2 className="h-3 w-3 mr-1" />
                              Kopplad till faktura
                            </Badge>
                          </>
                        )}
                        {transaction.journal_entry_id && (
                          <>
                            <span>·</span>
                            <Badge variant="outline" className="text-success border-success">
                              <Check className="h-3 w-3 mr-1" />
                              Bokförd
                            </Badge>
                          </>
                        )}
                        {transaction.is_business === null && !transaction.potential_invoice && (
                          <>
                            <span>·</span>
                            <Badge variant="outline" className="text-warning border-warning">
                              Ej kategoriserad
                            </Badge>
                          </>
                        )}
                        {transaction.potential_invoice && !transaction.invoice_id && (
                          <>
                            <span>·</span>
                            <Badge
                              variant="outline"
                              className="text-blue-600 border-blue-600 cursor-pointer hover:bg-blue-50"
                              onClick={() => openMatchDialog(transaction)}
                            >
                              <FileText className="h-3 w-3 mr-1" />
                              Möjlig match: Faktura {transaction.potential_invoice.invoice_number}
                            </Badge>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <p
                      className={`font-medium ${
                        transaction.amount > 0 ? 'text-success' : ''
                      }`}
                    >
                      {transaction.amount > 0 ? '+' : ''}
                      {formatCurrency(transaction.amount, transaction.currency)}
                    </p>
                    {transaction.currency !== 'SEK' && transaction.amount_sek && (
                      <p className="text-sm text-muted-foreground">
                        {formatCurrency(transaction.amount_sek)}
                      </p>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Invoice Match Confirmation Dialog */}
      <Dialog open={matchDialogOpen} onOpenChange={setMatchDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Bekräfta fakturamatchning</DialogTitle>
            <DialogDescription>
              Vill du koppla denna transaktion till fakturan? Fakturan kommer att markeras som betald.
            </DialogDescription>
          </DialogHeader>

          {selectedTransaction?.potential_invoice && (
            <div className="space-y-4">
              {/* Transaction details */}
              <div className="rounded-lg border p-4 space-y-2">
                <p className="text-sm font-medium text-muted-foreground">Transaktion</p>
                <p className="font-medium">{selectedTransaction.description}</p>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">{formatDate(selectedTransaction.date)}</span>
                  <span className="font-medium text-success">
                    +{formatCurrency(selectedTransaction.amount, selectedTransaction.currency)}
                  </span>
                </div>
              </div>

              {/* Invoice details */}
              <div className="rounded-lg border p-4 space-y-2">
                <p className="text-sm font-medium text-muted-foreground">Faktura</p>
                <p className="font-medium">
                  Faktura {selectedTransaction.potential_invoice.invoice_number}
                </p>
                <p className="text-sm text-muted-foreground">
                  {selectedTransaction.potential_invoice.customer?.name || 'Okänd kund'}
                </p>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">
                    Förfaller: {formatDate(selectedTransaction.potential_invoice.due_date)}
                  </span>
                  <span className="font-medium">
                    {formatCurrency(
                      selectedTransaction.potential_invoice.total,
                      selectedTransaction.potential_invoice.currency
                    )}
                  </span>
                </div>
              </div>

              {/* What will happen */}
              <div className="rounded-lg bg-muted/50 p-4 space-y-2">
                <p className="text-sm font-medium">Vid bekräftelse:</p>
                <ul className="text-sm text-muted-foreground space-y-1">
                  <li>• Transaktionen kopplas till fakturan</li>
                  <li>• Fakturan markeras som betald</li>
                  <li>• Bokföringsverifikation skapas automatiskt</li>
                </ul>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setMatchDialogOpen(false)}
              disabled={isConfirmingMatch}
            >
              Avbryt
            </Button>
            <Button
              onClick={handleConfirmInvoiceMatch}
              disabled={isConfirmingMatch}
            >
              {isConfirmingMatch ? 'Bekräftar...' : 'Bekräfta matchning'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
