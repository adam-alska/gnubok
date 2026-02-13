'use client'

import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { formatCurrency, formatDate } from '@/lib/utils'
import { ArrowRight, Banknote, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface RecentPayoutsCardProps {
  entries: Array<{
    id: string
    date: string
    description: string | null
    gross_amount: number
    net_amount: number
    service_fee: number
    pension_deduction: number
    social_fees: number
    income_tax_withheld: number
    platform_fee: number
    type: string
    provider: string | null
  }>
}

export default function RecentPayoutsCard({ entries }: RecentPayoutsCardProps) {
  const displayEntries = entries.slice(0, 5)
  const isEmpty = displayEntries.length === 0

  return (
    <Card className="h-full">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Banknote className="h-5 w-5 text-muted-foreground" />
            <CardTitle className="text-lg">Senaste utbetalningar</CardTitle>
          </div>
          {!isEmpty && (
            <Link
              href="/shadow-ledger"
              className="text-sm text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
            >
              Visa alla
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {isEmpty ? (
          <div className="text-center py-6">
            <p className="text-sm text-muted-foreground mb-4">
              Inga utbetalningar registrerade
            </p>
            <Link href="/shadow-ledger/new">
              <Button variant="outline" size="sm">
                <Plus className="mr-2 h-4 w-4" />
                Logga utbetalning
              </Button>
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            {displayEntries.map((entry) => (
              <div
                key={entry.id}
                className="flex items-center justify-between py-2 border-b border-border/50 last:border-0"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate">
                    {entry.description || entry.provider || 'Utbetalning'}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {formatDate(entry.date)}
                  </p>
                </div>
                <div className="text-right ml-4 flex-shrink-0">
                  <p className="text-sm tabular-nums font-medium">
                    {formatCurrency(entry.net_amount)}
                  </p>
                  {entry.gross_amount !== entry.net_amount && (
                    <p className="text-xs text-muted-foreground tabular-nums">
                      brutto {formatCurrency(entry.gross_amount)}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
