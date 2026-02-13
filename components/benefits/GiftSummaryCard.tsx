'use client'

import Link from 'next/link'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { formatCurrency } from '@/lib/utils'
import { Gift, TrendingUp } from 'lucide-react'
import type { GiftSummary } from '@/types'

interface GiftSummaryCardProps {
  summary: GiftSummary | null
}

export default function GiftSummaryCard({ summary }: GiftSummaryCardProps) {
  // Don't show card if no gifts
  if (!summary || summary.total_count === 0) {
    return null
  }

  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-start justify-between">
          <div className="flex items-start gap-3">
            <Gift className="h-5 w-5 flex-shrink-0 text-primary" />
            <div>
              <p className="font-medium">Gåvor & Förmåner</p>
              <p className="text-sm text-muted-foreground">
                {summary.total_count} produkter · {formatCurrency(summary.total_value)} totalt
              </p>
              {summary.taxable_count > 0 && (
                <div className="flex items-center gap-2 mt-1">
                  <TrendingUp className="h-3 w-3 text-destructive" />
                  <span className="text-xs text-destructive">
                    {formatCurrency(summary.taxable_value)} skattepliktig inkomst
                  </span>
                </div>
              )}
              {summary.deductible_count > 0 && (
                <p className="text-xs text-muted-foreground mt-1">
                  {formatCurrency(summary.deductible_value)} avdragsgill kostnad
                </p>
              )}
            </div>
          </div>
          <Link href="/gifts">
            <Button variant="outline" size="sm">
              Visa
            </Button>
          </Link>
        </div>
      </CardContent>
    </Card>
  )
}
