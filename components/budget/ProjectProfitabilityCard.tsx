'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { TrendingUp, TrendingDown, DollarSign, Target, BarChart3 } from 'lucide-react'
import type { ProjectProfitability } from '@/types/budget-costcenters'

interface ProjectProfitabilityCardProps {
  profitability: ProjectProfitability
  className?: string
}

function formatSEK(amount: number): string {
  return new Intl.NumberFormat('sv-SE', {
    style: 'currency',
    currency: 'SEK',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount)
}

export default function ProjectProfitabilityCard({
  profitability,
  className,
}: ProjectProfitabilityCardProps) {
  const isPositiveMargin = profitability.gross_margin >= 0
  const budgetUsed = profitability.budget_utilization

  return (
    <Card className={cn(className)}>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <BarChart3 className="h-4 w-4 text-primary" />
          Projektlönsamhet
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-4">
          {/* Revenue */}
          <div className="space-y-1">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <TrendingUp className="h-3 w-3" />
              Intäkter
            </div>
            <div className="text-lg font-semibold text-emerald-600 dark:text-emerald-400">
              {formatSEK(profitability.total_revenue)}
            </div>
          </div>

          {/* Expenses */}
          <div className="space-y-1">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <TrendingDown className="h-3 w-3" />
              Kostnader
            </div>
            <div className="text-lg font-semibold text-red-600 dark:text-red-400">
              {formatSEK(profitability.total_expenses)}
            </div>
          </div>

          {/* Gross Margin */}
          <div className="space-y-1">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <DollarSign className="h-3 w-3" />
              Bruttomarginal
            </div>
            <div className={cn(
              'text-lg font-semibold',
              isPositiveMargin
                ? 'text-emerald-600 dark:text-emerald-400'
                : 'text-red-600 dark:text-red-400'
            )}>
              {formatSEK(profitability.gross_margin)}
              <Badge
                variant={isPositiveMargin ? 'success' : 'destructive'}
                className="ml-2 text-xs"
              >
                {profitability.gross_margin_percentage.toFixed(1)}%
              </Badge>
            </div>
          </div>

          {/* Budget Utilization */}
          <div className="space-y-1">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Target className="h-3 w-3" />
              Budgetutnyttjande
            </div>
            <div className="space-y-1.5">
              <div className="text-lg font-semibold">
                {profitability.budget_amount > 0
                  ? `${budgetUsed.toFixed(0)}%`
                  : '-'
                }
              </div>
              {profitability.budget_amount > 0 && (
                <div className="w-full bg-muted rounded-full h-2">
                  <div
                    className={cn(
                      'h-2 rounded-full transition-all',
                      budgetUsed > 100
                        ? 'bg-red-500'
                        : budgetUsed > 80
                          ? 'bg-amber-500'
                          : 'bg-emerald-500'
                    )}
                    style={{ width: `${Math.min(budgetUsed, 100)}%` }}
                  />
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Budget info */}
        {profitability.budget_amount > 0 && (
          <div className="mt-4 pt-4 border-t text-sm text-muted-foreground flex justify-between">
            <span>Budget: {formatSEK(profitability.budget_amount)}</span>
            <span>Kvar: {formatSEK(profitability.budget_amount - profitability.total_expenses)}</span>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
