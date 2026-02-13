'use client'

import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { cn, formatCurrency } from '@/lib/utils'
import { Gift, ArrowRight, CheckCircle2 } from 'lucide-react'

interface GiftTaxDebtCardProps {
  virtualTaxDebt: number
  taxableGiftCount: number
  effectiveRate: number
}

export default function GiftTaxDebtCard({
  virtualTaxDebt,
  taxableGiftCount,
  effectiveRate,
}: GiftTaxDebtCardProps) {
  const hasDebt = virtualTaxDebt > 0

  return (
    <Link href="/gifts" className="group block">
      <Card className="h-full hover:border-primary/30 transition-colors">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Gift className="h-5 w-5 text-muted-foreground" />
              <CardTitle className="text-lg">G\u00e5voskatt</CardTitle>
            </div>
            <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-foreground group-hover:translate-x-0.5 transition-all" />
          </div>
        </CardHeader>
        <CardContent>
          {hasDebt ? (
            <div className="space-y-3">
              <div>
                <p className="font-display text-2xl font-medium tabular-nums text-amber-600">
                  {formatCurrency(virtualTaxDebt)}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Virtuell skatteskuld
                </p>
              </div>

              <div className="flex items-center gap-3 text-sm text-muted-foreground">
                <div>
                  <span className="tabular-nums font-medium text-foreground">
                    {taxableGiftCount}
                  </span>{' '}
                  skattepliktiga g\u00e5vor
                </div>
                <span className="text-border">{'\u00b7'}</span>
                <div>
                  <span className="tabular-nums font-medium text-foreground">
                    {(effectiveRate * 100).toFixed(1)}%
                  </span>{' '}
                  skattesats
                </div>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-3 py-2">
              <CheckCircle2 className="h-5 w-5 text-emerald-500 flex-shrink-0" />
              <div>
                <p className="text-sm font-medium text-emerald-700">
                  Ingen g\u00e5voskatt att betala
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Du har inga skattepliktiga g\u00e5vor registrerade i \u00e5r
                </p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </Link>
  )
}
