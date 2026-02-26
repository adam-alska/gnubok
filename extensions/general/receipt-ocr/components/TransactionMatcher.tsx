'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { formatCurrency, formatDate } from '@/lib/utils'
import { X, Check, Link2, AlertCircle, Search, Loader2 } from 'lucide-react'
import type { Receipt, ReceiptMatchCandidate, Transaction } from '@/types'

interface TransactionMatcherProps {
  receipt: Receipt
  onMatch: (transactionId: string, confidence: number) => Promise<void>
  onSkip: () => void
  onClose: () => void
}

export default function TransactionMatcher({
  receipt,
  onMatch,
  onSkip,
  onClose,
}: TransactionMatcherProps) {
  const [matches, setMatches] = useState<ReceiptMatchCandidate[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isMatching, setIsMatching] = useState(false)
  const [selectedMatch, setSelectedMatch] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Fetch matches on mount
  useEffect(() => {
    const fetchMatches = async () => {
      setIsLoading(true)
      setError(null)
      try {
        const response = await fetch(`/api/extensions/ext/receipt-ocr/${receipt.id}/match`, {
          method: 'POST',
        })
        const data = await response.json()

        if (response.ok && data.data?.matches) {
          setMatches(data.data.matches)
        } else {
          setError(data.error || 'Kunde inte hämta matchningar')
        }
      } catch {
        setError('Nätverksfel vid hämtning av matchningar')
      } finally {
        setIsLoading(false)
      }
    }

    fetchMatches()
  }, [receipt.id])

  // Handle match confirmation
  const handleConfirmMatch = async () => {
    if (!selectedMatch) return

    const match = matches.find((m) => m.transaction.id === selectedMatch)
    if (!match) return

    setIsMatching(true)
    try {
      await onMatch(selectedMatch, match.confidence)
    } catch {
      setError('Kunde inte koppla kvitto till transaktion')
    } finally {
      setIsMatching(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-background z-50 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b">
        <Button variant="ghost" size="icon" onClick={onClose}>
          <X className="h-5 w-5" />
        </Button>
        <h1 className="font-semibold">Matcha transaktion</h1>
        <div className="w-10" />
      </div>

      {/* Receipt summary */}
      <Card className="m-4 mb-2">
        <CardContent className="pt-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">{receipt.merchant_name || 'Kvitto'}</p>
              {receipt.receipt_date && (
                <p className="text-sm text-muted-foreground">{formatDate(receipt.receipt_date)}</p>
              )}
            </div>
            <p className="text-xl font-bold">
              {formatCurrency(receipt.total_amount || 0, receipt.currency)}
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Content */}
      <div className="flex-1 overflow-auto px-4 pb-4">
        <h2 className="text-sm font-medium text-muted-foreground mb-3 flex items-center gap-2">
          <Search className="h-4 w-4" />
          Möjliga matchningar
        </h2>

        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <Card key={i}>
                <CardContent className="pt-4">
                  <Skeleton className="h-4 w-2/3 mb-2" />
                  <Skeleton className="h-6 w-1/3 mb-2" />
                  <Skeleton className="h-3 w-1/2" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : error ? (
          <Card className="border-destructive">
            <CardContent className="pt-4 flex items-center gap-3 text-destructive">
              <AlertCircle className="h-5 w-5" />
              <p>{error}</p>
            </CardContent>
          </Card>
        ) : matches.length === 0 ? (
          <Card>
            <CardContent className="pt-4 text-center py-8">
              <Search className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
              <p className="font-medium">Inga matchande transaktioner hittades</p>
              <p className="text-sm text-muted-foreground mt-1">
                Det finns ingen banktransaktion som matchar detta kvitto
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {matches.map((match) => (
              <Card
                key={match.transaction.id}
                className={`cursor-pointer transition-colors ${
                  selectedMatch === match.transaction.id
                    ? 'border-primary ring-2 ring-primary/20'
                    : 'hover:border-primary/50'
                }`}
                onClick={() => setSelectedMatch(match.transaction.id)}
              >
                <CardContent className="pt-4">
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{match.transaction.description}</p>
                      <p className="text-sm text-muted-foreground">
                        {formatDate(match.transaction.date)}
                      </p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="font-bold">
                        {formatCurrency(Math.abs(match.transaction.amount), match.transaction.currency)}
                      </p>
                      <Badge
                        variant={match.confidence > 0.8 ? 'default' : match.confidence > 0.6 ? 'secondary' : 'outline'}
                      >
                        {Math.round(match.confidence * 100)}% match
                      </Badge>
                    </div>
                  </div>

                  {/* Match reasons */}
                  <div className="flex flex-wrap gap-1 mt-2">
                    {match.matchReasons.map((reason, idx) => (
                      <Badge key={idx} variant="outline" className="text-xs">
                        {reason}
                      </Badge>
                    ))}
                  </div>

                  {/* Variance info */}
                  <div className="flex gap-4 mt-2 text-xs text-muted-foreground">
                    {match.dateVariance > 0 && (
                      <span>Datum: ±{Math.round(match.dateVariance)} dagar</span>
                    )}
                    {match.amountVariance > 0.01 && (
                      <span>Belopp: ±{Math.round(match.amountVariance * 100)}%</span>
                    )}
                  </div>

                  {/* Selected indicator */}
                  {selectedMatch === match.transaction.id && (
                    <div className="absolute top-2 right-2">
                      <div className="h-6 w-6 rounded-full bg-primary flex items-center justify-center">
                        <Check className="h-4 w-4 text-primary-foreground" />
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Footer actions */}
      <div className="p-4 border-t flex gap-3">
        <Button variant="outline" className="flex-1" onClick={onSkip}>
          Hoppa över
        </Button>
        <Button
          className="flex-1"
          onClick={handleConfirmMatch}
          disabled={!selectedMatch || isMatching}
        >
          {isMatching ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Kopplar...
            </>
          ) : (
            <>
              <Link2 className="mr-2 h-4 w-4" />
              Koppla transaktion
            </>
          )}
        </Button>
      </div>
    </div>
  )
}
