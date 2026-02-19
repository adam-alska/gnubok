'use client'

import { Card, CardContent } from '@/components/ui/card'
import { formatCurrency } from '@/lib/utils'
import { CheckCircle2, AlertCircle, Zap, SplitSquareVertical } from 'lucide-react'
import type { ReconciliationSummary } from '@/types/bank-reconciliation'

interface SessionStatsProps {
  summary: ReconciliationSummary
}

export default function SessionStats({ summary }: SessionStatsProps) {
  const stats = [
    {
      label: 'Matchade',
      value: summary.matchedCount,
      amount: summary.matchedAmount,
      icon: CheckCircle2,
      color: 'text-green-600',
      bg: 'bg-green-50 dark:bg-green-950/30',
    },
    {
      label: 'Omatchade',
      value: summary.unmatchedCount,
      amount: summary.unmatchedAmount,
      icon: AlertCircle,
      color: 'text-amber-600',
      bg: 'bg-amber-50 dark:bg-amber-950/30',
    },
    {
      label: 'Auto-matchade',
      value: summary.autoMatchedCount,
      amount: null,
      icon: Zap,
      color: 'text-blue-600',
      bg: 'bg-blue-50 dark:bg-blue-950/30',
    },
    {
      label: 'Delade',
      value: summary.splitCount,
      amount: null,
      icon: SplitSquareVertical,
      color: 'text-purple-600',
      bg: 'bg-purple-50 dark:bg-purple-950/30',
    },
  ]

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      {stats.map((stat) => (
        <Card key={stat.label} className="border-0 shadow-none">
          <CardContent className="p-3">
            <div className="flex items-center gap-2">
              <div className={`h-8 w-8 rounded-lg flex items-center justify-center ${stat.bg}`}>
                <stat.icon className={`h-4 w-4 ${stat.color}`} />
              </div>
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground truncate">{stat.label}</p>
                <p className="text-lg font-semibold leading-tight">{stat.value}</p>
                {stat.amount !== null && (
                  <p className="text-xs text-muted-foreground">
                    {formatCurrency(stat.amount)}
                  </p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
