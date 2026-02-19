'use client'

import { cn } from '@/lib/utils'
import { TrendingDown, TrendingUp, Minus } from 'lucide-react'

interface VarianceIndicatorProps {
  amount: number
  percentage?: number
  isRevenue?: boolean  // For revenue, positive variance is good
  showIcon?: boolean
  compact?: boolean
  className?: string
}

export default function VarianceIndicator({
  amount,
  percentage,
  isRevenue = false,
  showIcon = true,
  compact = false,
  className,
}: VarianceIndicatorProps) {
  // For revenue: positive variance (actual > budget) is good (green)
  // For expenses: negative variance (actual < budget) is good (green)
  const isPositive = isRevenue ? amount >= 0 : amount <= 0
  const isZero = Math.abs(amount) < 0.01

  const colorClass = isZero
    ? 'text-muted-foreground'
    : isPositive
      ? 'text-emerald-600 dark:text-emerald-400'
      : 'text-red-600 dark:text-red-400'

  const bgClass = isZero
    ? ''
    : isPositive
      ? 'bg-emerald-50 dark:bg-emerald-950/30'
      : 'bg-red-50 dark:bg-red-950/30'

  const formatNumber = (n: number) => {
    return new Intl.NumberFormat('sv-SE', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(Math.round(n))
  }

  if (compact) {
    return (
      <span className={cn(colorClass, 'text-xs tabular-nums', className)}>
        {amount > 0 ? '+' : ''}{formatNumber(amount)}
        {percentage !== undefined && (
          <span className="ml-0.5">({percentage > 0 ? '+' : ''}{percentage.toFixed(1)}%)</span>
        )}
      </span>
    )
  }

  return (
    <div className={cn(
      'inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-medium tabular-nums',
      bgClass,
      colorClass,
      className
    )}>
      {showIcon && !isZero && (
        amount > 0
          ? <TrendingUp className="h-3 w-3" />
          : amount < 0
            ? <TrendingDown className="h-3 w-3" />
            : <Minus className="h-3 w-3" />
      )}
      <span>
        {amount > 0 ? '+' : ''}{formatNumber(amount)}
      </span>
      {percentage !== undefined && (
        <span className="opacity-75">
          ({percentage > 0 ? '+' : ''}{percentage.toFixed(1)}%)
        </span>
      )}
    </div>
  )
}
