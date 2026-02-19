'use client'

import { Card, CardContent } from '@/components/ui/card'
import { TrendingUp, TrendingDown, Minus } from 'lucide-react'

interface ResultSummaryProps {
  netResult: number
  taxAmount?: number
  resultAfterTax?: number
  label?: string
}

function formatAmount(amount: number): string {
  return amount.toLocaleString('sv-SE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

export function ResultSummary({
  netResult,
  taxAmount,
  resultAfterTax,
  label = 'Arets resultat',
}: ResultSummaryProps) {
  const isProfit = netResult > 0
  const isLoss = netResult < 0
  const Icon = isProfit ? TrendingUp : isLoss ? TrendingDown : Minus

  return (
    <Card className="border-2">
      <CardContent className="py-8">
        <div className="text-center space-y-4">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-muted">
            <Icon
              className={`h-8 w-8 ${
                isProfit
                  ? 'text-green-600'
                  : isLoss
                  ? 'text-red-600'
                  : 'text-muted-foreground'
              }`}
            />
          </div>

          <div>
            <p className="text-sm text-muted-foreground mb-1">{label}</p>
            <p
              className={`text-4xl font-bold tracking-tight ${
                isProfit
                  ? 'text-green-600'
                  : isLoss
                  ? 'text-red-600'
                  : 'text-foreground'
              }`}
            >
              {formatAmount(netResult)} kr
            </p>
          </div>

          {taxAmount !== undefined && taxAmount > 0 && (
            <div className="pt-4 border-t space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Bolagsskatt (20,6%)</span>
                <span className="text-orange-600">-{formatAmount(taxAmount)} kr</span>
              </div>
              {resultAfterTax !== undefined && (
                <div className="flex justify-between text-sm font-semibold">
                  <span>Resultat efter skatt</span>
                  <span
                    className={
                      resultAfterTax >= 0 ? 'text-green-600' : 'text-red-600'
                    }
                  >
                    {formatAmount(resultAfterTax)} kr
                  </span>
                </div>
              )}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
