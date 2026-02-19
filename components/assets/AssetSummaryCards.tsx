'use client'

import { Card, CardContent } from '@/components/ui/card'
import { Building2, Coins, TrendingDown, CheckCircle2 } from 'lucide-react'
import { formatCurrency } from '@/lib/utils'
import type { AssetSummary } from '@/types/fixed-assets'

interface AssetSummaryCardsProps {
  summary: AssetSummary | null
  isLoading: boolean
}

export function AssetSummaryCards({ summary, isLoading }: AssetSummaryCardsProps) {
  if (isLoading) {
    return (
      <div className="grid gap-4 md:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <Card key={i} className="animate-pulse">
            <CardContent className="pt-6">
              <div className="flex items-center gap-4">
                <div className="h-12 w-12 rounded-lg bg-muted" />
                <div className="space-y-2">
                  <div className="h-4 bg-muted rounded w-20" />
                  <div className="h-6 bg-muted rounded w-24" />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    )
  }

  const cards = [
    {
      label: 'Aktiva tillgangar',
      value: summary?.totalAssets ?? 0,
      formatted: String(summary?.totalAssets ?? 0),
      icon: Building2,
      bgClass: 'bg-primary/10',
      iconClass: 'text-primary',
    },
    {
      label: 'Totalt bokfort varde',
      value: summary?.totalBookValue ?? 0,
      formatted: formatCurrency(summary?.totalBookValue ?? 0),
      icon: Coins,
      bgClass: 'bg-success/10',
      iconClass: 'text-success',
    },
    {
      label: 'Avskrivningar i ar',
      value: summary?.totalDepreciationThisYear ?? 0,
      formatted: formatCurrency(summary?.totalDepreciationThisYear ?? 0),
      icon: TrendingDown,
      bgClass: 'bg-warning/10',
      iconClass: 'text-warning-foreground',
    },
    {
      label: 'Fullt avskrivna',
      value: summary?.fullyDepreciated ?? 0,
      formatted: String(summary?.fullyDepreciated ?? 0),
      icon: CheckCircle2,
      bgClass: 'bg-muted',
      iconClass: 'text-muted-foreground',
    },
  ]

  return (
    <div className="grid gap-4 md:grid-cols-4">
      {cards.map((card) => {
        const Icon = card.icon
        return (
          <Card key={card.label}>
            <CardContent className="pt-6">
              <div className="flex items-center gap-4">
                <div className={`h-12 w-12 rounded-lg ${card.bgClass} flex items-center justify-center`}>
                  <Icon className={`h-6 w-6 ${card.iconClass}`} />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">{card.label}</p>
                  <p className="text-2xl font-bold tabular-nums">{card.formatted}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}
