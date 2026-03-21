'use client'

import { Card, CardContent } from '@/components/ui/card'
import { formatCurrency } from '@/lib/utils'
import type { KPIReport } from '@/types'

interface KPIHeroCardsProps {
  report: KPIReport
}

export function KPIHeroCards({ report }: KPIHeroCardsProps) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      {/* Gross margin */}
      <Card>
        <CardContent className="p-5">
          <p className="text-xs text-muted-foreground mb-1">Bruttomarginal</p>
          <p className="font-display text-xl tabular-nums tracking-tight">
            {report.grossMargin !== null ? `${report.grossMargin}%` : '—'}
          </p>
          <p className="text-xs text-muted-foreground mt-1">av intäkter</p>
        </CardContent>
      </Card>

      {/* Net result */}
      <Card>
        <CardContent className="p-5">
          <p className="text-xs text-muted-foreground mb-1">Resultat</p>
          <p className={`font-display text-xl tabular-nums tracking-tight ${
            report.netResult >= 0 ? 'text-[hsl(var(--chart-1))]' : 'text-[hsl(var(--chart-2))]'
          }`}>
            {formatCurrency(report.netResult)}
          </p>
          <p className="text-xs text-muted-foreground mt-1">netto</p>
        </CardContent>
      </Card>

      {/* Cash position */}
      <Card>
        <CardContent className="p-5">
          <p className="text-xs text-muted-foreground mb-1">Kassa</p>
          <p className={`font-display text-xl tabular-nums tracking-tight ${
            report.cashPosition > 0 ? 'text-[hsl(var(--chart-1))]' : 'text-[hsl(var(--chart-2))]'
          }`}>
            {formatCurrency(report.cashPosition)}
          </p>
          <p className="text-xs text-muted-foreground mt-1">likvida medel</p>
        </CardContent>
      </Card>

      {/* Outstanding receivables */}
      <Card>
        <CardContent className="p-5">
          <p className="text-xs text-muted-foreground mb-1">Kundfordringar</p>
          <p className="font-display text-xl tabular-nums tracking-tight">
            {formatCurrency(report.outstandingReceivables)}
          </p>
          {report.overdueReceivables > 0 ? (
            <p className="text-xs text-[hsl(var(--chart-2))] mt-1">
              varav förfallet: {formatCurrency(report.overdueReceivables)}
            </p>
          ) : (
            <p className="text-xs text-muted-foreground mt-1">utestående</p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
