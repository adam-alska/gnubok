'use client'

import { Card, CardContent } from '@/components/ui/card'
import { TrendingUp, TrendingDown, Info } from 'lucide-react'
import { formatCurrency } from '@/lib/utils'
import type { KPIReport } from '@/types'

interface KPIOperationalGridProps {
  report: KPIReport
}

export function KPIOperationalGrid({ report }: KPIOperationalGridProps) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      {/* Revenue growth */}
      <Card>
        <CardContent className="p-5">
          <p className="text-xs text-muted-foreground mb-1">Intäktstillväxt</p>
          {!report.periodComplete ? (
            <p className="text-sm text-muted-foreground">Välj ett avslutat räkenskapsår</p>
          ) : report.revenueGrowth !== null ? (
            <div className="flex items-center gap-2">
              {report.revenueGrowth >= 0 ? (
                <TrendingUp className="h-4 w-4 text-[hsl(var(--chart-1))]" />
              ) : (
                <TrendingDown className="h-4 w-4 text-[hsl(var(--chart-2))]" />
              )}
              <p className={`font-display text-xl tabular-nums tracking-tight ${
                report.revenueGrowth >= 0 ? 'text-[hsl(var(--chart-1))]' : 'text-[hsl(var(--chart-2))]'
              }`}>
                {report.revenueGrowth > 0 ? '+' : ''}{report.revenueGrowth}%
              </p>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Första räkenskapsåret</p>
          )}
        </CardContent>
      </Card>

      {/* Expense ratio */}
      <Card>
        <CardContent className="p-5">
          <p className="text-xs text-muted-foreground mb-1">Kostnadsandel</p>
          {report.expenseRatio !== null ? (
            <>
              <p className="font-display text-xl tabular-nums tracking-tight">
                {report.expenseRatio}%
              </p>
              <div className="mt-2 h-1.5 rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full rounded-full bg-[hsl(var(--chart-2))]/60 transition-all"
                  style={{ width: `${Math.min(report.expenseRatio, 100)}%` }}
                />
              </div>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">Inga intäkter</p>
          )}
        </CardContent>
      </Card>

      {/* Avg payment days */}
      <Card>
        <CardContent className="p-5">
          <div className="flex items-center gap-1.5 mb-1">
            <p className="text-xs text-muted-foreground">Snittbetaltid</p>
            {report.avgPaymentDays === null && (
              <span title="Kräver minst 5 betalda fakturor med betalningsdatum. Sätts via fakturering i gnubok eller bankmatchning.">
                <Info className="h-3 w-3 text-muted-foreground/60" />
              </span>
            )}
          </div>
          {report.avgPaymentDays !== null ? (
            <p className="font-display text-xl tabular-nums tracking-tight">
              {report.avgPaymentDays} <span className="text-sm font-normal text-muted-foreground">dagar</span>
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">Inte tillräckligt med data</p>
          )}
        </CardContent>
      </Card>

      {/* VAT liability */}
      <Card>
        <CardContent className="p-5">
          <p className="text-xs text-muted-foreground mb-1">Momsskuld</p>
          <p className={`font-display text-xl tabular-nums tracking-tight ${
            report.vatLiability > 0 ? 'text-[hsl(var(--chart-2))]' : 'text-[hsl(var(--chart-1))]'
          }`}>
            {formatCurrency(Math.abs(report.vatLiability))}
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            {report.vatLiability > 0 ? 'Att betala' : report.vatLiability < 0 ? 'Att återfå' : 'Jämnt'}
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
