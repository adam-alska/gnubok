'use client'

import { useState, useEffect, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Camera,
  Receipt,
  Check,
  Clock,
  AlertCircle,
  ArrowRight,
} from 'lucide-react'
import { formatCurrency, formatDate } from '@/lib/utils'
import { useRouter } from 'next/navigation'
import ReceiptDashboard from '../components/ReceiptDashboard'
import ReceiptReviewView from '../components/ReceiptReviewView'
import TransactionMatcher from '../components/TransactionMatcher'
import type { Receipt as ReceiptType, ReceiptLineItem, ReceiptQueueSummary, ConfirmLineItemInput } from '@/types'

type ViewMode = 'dashboard' | 'list' | 'review' | 'match'
type ListFilter = 'all' | 'pending' | 'confirmed'

export default function ReceiptsPage() {
  const router = useRouter()
  const [viewMode, setViewMode] = useState<ViewMode>('dashboard')
  const [listFilter, setListFilter] = useState<ListFilter>('all')

  const [receipts, setReceipts] = useState<(ReceiptType & { line_items: ReceiptLineItem[] })[]>([])
  const [summary, setSummary] = useState<ReceiptQueueSummary | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  // Selected receipt for review/match
  const [selectedReceipt, setSelectedReceipt] = useState<(ReceiptType & { line_items: ReceiptLineItem[] }) | null>(null)

  // Fetch receipts and summary
  const fetchData = useCallback(async () => {
    setIsLoading(true)
    try {
      const [receiptsRes, queueRes] = await Promise.all([
        fetch('/api/extensions/receipt-ocr'),
        fetch('/api/extensions/receipt-ocr/queue'),
      ])

      const [receiptsData, queueData] = await Promise.all([
        receiptsRes.json(),
        queueRes.json(),
      ])

      if (receiptsData.data) {
        setReceipts(receiptsData.data)
      }

      if (queueData.data?.summary) {
        setSummary(queueData.data.summary)
      }
    } catch (error) {
      console.error('Fetch error:', error)
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  // Filter receipts based on tab
  const filteredReceipts = receipts.filter((r) => {
    if (listFilter === 'pending') return r.status === 'extracted'
    if (listFilter === 'confirmed') return r.status === 'confirmed'
    return true
  })

  // Handle scan receipt
  const handleScanReceipt = () => {
    router.push('/receipts/scan')
  }

  // Handle view receipt queue
  const handleViewReceiptQueue = () => {
    setListFilter('pending')
    setViewMode('list')
  }

  // Handle view transaction queue
  const handleViewTransactionQueue = () => {
    router.push('/transactions?filter=unmatched')
  }

  // Handle receipt selection for review
  const handleSelectReceipt = (receipt: ReceiptType & { line_items: ReceiptLineItem[] }) => {
    setSelectedReceipt(receipt)
    if (receipt.status === 'extracted') {
      setViewMode('review')
    } else {
      setViewMode('match')
    }
  }

  // Handle confirm receipt
  const handleConfirmReceipt = async (data: {
    line_items: ConfirmLineItemInput[]
    representation_persons?: number
    representation_purpose?: string
  }) => {
    if (!selectedReceipt) return

    const response = await fetch(`/api/extensions/receipt-ocr/${selectedReceipt.id}/confirm`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })

    if (response.ok) {
      await fetchData()
      setSelectedReceipt(null)
      setViewMode('dashboard')
    } else {
      const errorData = await response.json()
      throw new Error(errorData.error || 'Kunde inte bekräfta kvitto')
    }
  }

  // Handle match receipt to transaction
  const handleMatchReceipt = async (transactionId: string, confidence: number) => {
    if (!selectedReceipt) return

    const response = await fetch(`/api/extensions/receipt-ocr/${selectedReceipt.id}/match`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ transaction_id: transactionId, match_confidence: confidence }),
    })

    if (response.ok) {
      await fetchData()
      setSelectedReceipt(null)
      setViewMode('dashboard')
    }
  }

  // Render receipt review view
  if (viewMode === 'review' && selectedReceipt) {
    return (
      <ReceiptReviewView
        receipt={selectedReceipt}
        onConfirm={handleConfirmReceipt}
        onCancel={() => {
          setSelectedReceipt(null)
          setViewMode('dashboard')
        }}
        onFindMatches={() => setViewMode('match')}
      />
    )
  }

  // Render transaction matcher
  if (viewMode === 'match' && selectedReceipt) {
    return (
      <TransactionMatcher
        receipt={selectedReceipt}
        onMatch={handleMatchReceipt}
        onSkip={() => {
          setSelectedReceipt(null)
          setViewMode('dashboard')
        }}
        onClose={() => {
          setSelectedReceipt(null)
          setViewMode('dashboard')
        }}
      />
    )
  }

  // Render main page
  return (
    <div className="container max-w-4xl mx-auto p-4 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Kvittohantering</h1>
        <Button onClick={handleScanReceipt}>
          <Camera className="mr-2 h-4 w-4" />
          Skanna kvitto
        </Button>
      </div>

      {/* Dashboard or List view toggle */}
      <Tabs
        value={viewMode === 'list' ? 'list' : 'dashboard'}
        onValueChange={(v) => setViewMode(v as ViewMode)}
      >
        <TabsList>
          <TabsTrigger value="dashboard">Översikt</TabsTrigger>
          <TabsTrigger value="list">Alla kvitton</TabsTrigger>
        </TabsList>
      </Tabs>

      {viewMode === 'dashboard' && (
        <>
          {isLoading ? (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <Skeleton className="h-24" />
                <Skeleton className="h-24" />
              </div>
              <Skeleton className="h-32" />
              <Skeleton className="h-24" />
            </div>
          ) : summary ? (
            <ReceiptDashboard
              summary={summary}
              onScanReceipt={handleScanReceipt}
              onViewReceiptQueue={handleViewReceiptQueue}
              onViewTransactionQueue={handleViewTransactionQueue}
            />
          ) : (
            <Card>
              <CardContent className="pt-4 text-center py-8">
                <AlertCircle className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
                <p>Kunde inte ladda data</p>
                <Button variant="outline" className="mt-4" onClick={fetchData}>
                  Försök igen
                </Button>
              </CardContent>
            </Card>
          )}
        </>
      )}

      {viewMode === 'list' && (
        <>
          {/* List filters */}
          <div className="flex gap-2">
            <Button
              variant={listFilter === 'all' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setListFilter('all')}
            >
              Alla
            </Button>
            <Button
              variant={listFilter === 'pending' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setListFilter('pending')}
            >
              <Clock className="mr-1 h-3 w-3" />
              Att granska
            </Button>
            <Button
              variant={listFilter === 'confirmed' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setListFilter('confirmed')}
            >
              <Check className="mr-1 h-3 w-3" />
              Bekräftade
            </Button>
          </div>

          {/* Receipt list */}
          {isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-24" />
              ))}
            </div>
          ) : filteredReceipts.length === 0 ? (
            <Card>
              <CardContent className="pt-4 text-center py-8">
                <Receipt className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
                <p className="text-muted-foreground">Inga kvitton hittades</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {filteredReceipts.map((receipt) => (
                <Card
                  key={receipt.id}
                  className="cursor-pointer hover:border-primary/50 transition-colors"
                  onClick={() => handleSelectReceipt(receipt)}
                >
                  <CardContent className="pt-4">
                    <div className="flex items-start justify-between">
                      <div className="flex items-start gap-3">
                        {receipt.image_url ? (
                          <img
                            src={receipt.image_url}
                            alt="Receipt"
                            className="h-16 w-12 object-cover rounded"
                          />
                        ) : (
                          <div className="h-16 w-12 bg-muted rounded flex items-center justify-center">
                            <Receipt className="h-6 w-6 text-muted-foreground" />
                          </div>
                        )}
                        <div>
                          <p className="font-medium">{receipt.merchant_name || 'Okänt kvitto'}</p>
                          {receipt.receipt_date && (
                            <p className="text-sm text-muted-foreground">
                              {formatDate(receipt.receipt_date)}
                            </p>
                          )}
                          <div className="flex flex-wrap gap-1 mt-1">
                            <Badge
                              variant={
                                receipt.status === 'confirmed'
                                  ? 'default'
                                  : receipt.status === 'extracted'
                                  ? 'secondary'
                                  : receipt.status === 'error'
                                  ? 'destructive'
                                  : 'outline'
                              }
                            >
                              {receipt.status === 'confirmed' && 'Bekräftat'}
                              {receipt.status === 'extracted' && 'Att granska'}
                              {receipt.status === 'processing' && 'Analyserar...'}
                              {receipt.status === 'pending' && 'Väntar'}
                              {receipt.status === 'error' && 'Fel'}
                            </Badge>
                            {receipt.matched_transaction_id && (
                              <Badge variant="outline">Kopplat</Badge>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="font-bold">
                          {formatCurrency(receipt.total_amount || 0, receipt.currency)}
                        </p>
                        <ArrowRight className="h-4 w-4 text-muted-foreground mt-2 ml-auto" />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}
