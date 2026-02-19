'use client'

import Link from 'next/link'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Receipt,
  Clock,
  CreditCard,
  Landmark,
  ArrowRight,
  AlertTriangle,
} from 'lucide-react'
import type { QuickStats } from '@/types/financial-insights'

interface QuickStatsRowProps {
  stats: QuickStats
  loading?: boolean
}

function formatSEK(amount: number): string {
  return new Intl.NumberFormat('sv-SE', {
    style: 'currency',
    currency: 'SEK',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount)
}

export default function QuickStatsRow({ stats, loading }: QuickStatsRowProps) {
  if (loading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-28 bg-muted/30 animate-pulse rounded-xl" />
        ))}
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
      {/* Outstanding invoices */}
      <Link href="/invoices?status=unpaid" className="group">
        <Card className="h-full hover-lift">
          <CardContent className="p-4">
            <div className="flex items-start justify-between mb-3">
              <div className="p-2 rounded-lg bg-blue-500/10">
                <Receipt className="h-4 w-4 text-blue-600" />
              </div>
              <ArrowRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>
            <p className="font-display text-lg font-bold tabular-nums">
              {formatSEK(stats.outstandingInvoicesTotal)}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {stats.outstandingInvoicesCount} utestående fakturor
            </p>
          </CardContent>
        </Card>
      </Link>

      {/* Overdue invoices */}
      <Link href="/invoices?status=unpaid" className="group">
        <Card className={`h-full hover-lift ${stats.overdueInvoicesCount > 0 ? 'border-destructive/30' : ''}`}>
          <CardContent className="p-4">
            <div className="flex items-start justify-between mb-3">
              <div className={`p-2 rounded-lg ${stats.overdueInvoicesCount > 0 ? 'bg-destructive/10' : 'bg-muted/50'}`}>
                <Clock className={`h-4 w-4 ${stats.overdueInvoicesCount > 0 ? 'text-destructive' : 'text-muted-foreground'}`} />
              </div>
              {stats.overdueInvoicesCount > 0 && (
                <Badge variant="destructive" className="text-[10px] px-1.5 py-0 gap-1">
                  <AlertTriangle className="h-2.5 w-2.5" />
                  Kräver åtgärd
                </Badge>
              )}
            </div>
            <p className="font-display text-lg font-bold tabular-nums">
              {stats.overdueInvoicesCount > 0 ? formatSEK(stats.overdueInvoicesTotal) : 'Inga'}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {stats.overdueInvoicesCount > 0
                ? `${stats.overdueInvoicesCount} försenade fakturor`
                : 'Inga försenade fakturor'}
            </p>
          </CardContent>
        </Card>
      </Link>

      {/* Upcoming payments */}
      <Link href="/supplier-invoices" className="group">
        <Card className="h-full hover-lift">
          <CardContent className="p-4">
            <div className="flex items-start justify-between mb-3">
              <div className="p-2 rounded-lg bg-amber-500/10">
                <CreditCard className="h-4 w-4 text-amber-600" />
              </div>
              <ArrowRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>
            <p className="font-display text-lg font-bold tabular-nums">
              {formatSEK(stats.upcomingPaymentsTotal)}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {stats.upcomingPaymentsCount} kommande betalningar
            </p>
          </CardContent>
        </Card>
      </Link>

      {/* Tax obligations */}
      <Link href="/reports/vat" className="group">
        <Card className="h-full hover-lift">
          <CardContent className="p-4">
            <div className="flex items-start justify-between mb-3">
              <div className="p-2 rounded-lg bg-purple-500/10">
                <Landmark className="h-4 w-4 text-purple-600" />
              </div>
              <ArrowRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>
            <p className="font-display text-lg font-bold tabular-nums">
              {formatSEK(stats.taxObligationsThisMonth)}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Skatteförpliktelser denna månad
            </p>
          </CardContent>
        </Card>
      </Link>
    </div>
  )
}
