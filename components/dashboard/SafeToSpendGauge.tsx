'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { cn, formatCurrency } from '@/lib/utils'
import { Wallet } from 'lucide-react'

interface SafeToSpendGaugeProps {
  bankBalance: number
  giftTaxDebt: number
  hobbyReserve: number
}

export default function SafeToSpendGauge({
  bankBalance,
  giftTaxDebt,
  hobbyReserve,
}: SafeToSpendGaugeProps) {
  const safeToSpend = Math.max(0, bankBalance - giftTaxDebt - hobbyReserve)
  const total = bankBalance || 1 // Avoid division by zero

  const safePercent = bankBalance > 0 ? (safeToSpend / total) * 100 : 0
  const giftPercent = bankBalance > 0 ? (giftTaxDebt / total) * 100 : 0
  const hobbyPercent = bankBalance > 0 ? (hobbyReserve / total) * 100 : 0

  // Determine color level
  let level: 'green' | 'yellow' | 'red'
  if (safePercent > 70) {
    level = 'green'
  } else if (safePercent > 30) {
    level = 'yellow'
  } else {
    level = 'red'
  }

  const noBankConnected = !bankBalance || bankBalance === 0

  return (
    <Card className={cn(noBankConnected && 'opacity-60')}>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <Wallet className="h-5 w-5 text-muted-foreground" />
          <CardTitle className="text-lg">Att spendera</CardTitle>
        </div>
      </CardHeader>
      <CardContent>
        {noBankConnected ? (
          <div className="text-center py-4">
            <p className="text-2xl font-display font-medium text-muted-foreground">
              Ingen bank ansluten
            </p>
            <p className="text-sm text-muted-foreground mt-1">
              Koppla din bank f\u00f6r att se ditt disponibla belopp
            </p>
          </div>
        ) : (
          <>
            <div className="text-center mb-6">
              <p
                className={cn(
                  'font-display text-4xl font-medium tabular-nums',
                  level === 'green' && 'text-emerald-600',
                  level === 'yellow' && 'text-amber-600',
                  level === 'red' && 'text-red-600'
                )}
              >
                {formatCurrency(safeToSpend)}
              </p>
              <p className="text-sm text-muted-foreground mt-1">
                av {formatCurrency(bankBalance)} p\u00e5 kontot
              </p>
            </div>

            {/* Stacked bar */}
            <div className="w-full h-4 rounded-full overflow-hidden flex bg-muted">
              {safePercent > 0 && (
                <div
                  className={cn(
                    'h-full transition-all duration-500',
                    level === 'green' && 'bg-emerald-500',
                    level === 'yellow' && 'bg-amber-500',
                    level === 'red' && 'bg-red-500'
                  )}
                  style={{ width: `${safePercent}%` }}
                />
              )}
              {giftPercent > 0 && (
                <div
                  className="h-full bg-amber-400 transition-all duration-500"
                  style={{ width: `${giftPercent}%` }}
                />
              )}
              {hobbyPercent > 0 && (
                <div
                  className="h-full bg-orange-400 transition-all duration-500"
                  style={{ width: `${hobbyPercent}%` }}
                />
              )}
            </div>

            {/* Legend */}
            <div className="flex flex-wrap gap-x-5 gap-y-1 mt-3 text-xs text-muted-foreground">
              <div className="flex items-center gap-1.5">
                <span
                  className={cn(
                    'inline-block h-2.5 w-2.5 rounded-full',
                    level === 'green' && 'bg-emerald-500',
                    level === 'yellow' && 'bg-amber-500',
                    level === 'red' && 'bg-red-500'
                  )}
                />
                Disponibelt
              </div>
              {giftTaxDebt > 0 && (
                <div className="flex items-center gap-1.5">
                  <span className="inline-block h-2.5 w-2.5 rounded-full bg-amber-400" />
                  G\u00e5voskatt ({formatCurrency(giftTaxDebt)})
                </div>
              )}
              {hobbyReserve > 0 && (
                <div className="flex items-center gap-1.5">
                  <span className="inline-block h-2.5 w-2.5 rounded-full bg-orange-400" />
                  Hobby ({formatCurrency(hobbyReserve)})
                </div>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}
