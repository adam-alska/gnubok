'use client'

import { TrendingUp, TrendingDown, Minus } from 'lucide-react'
import { cn } from '@/lib/utils'

interface KPICardProps {
  label: string
  value: string | number
  unit?: string
  target?: number
  trend?: 'up' | 'down' | 'neutral'
  trendLabel?: string
  className?: string
}

export function KPICard({ label, value, unit, target, trend, trendLabel, className }: KPICardProps) {
  const TrendIcon = trend === 'up' ? TrendingUp : trend === 'down' ? TrendingDown : Minus

  return (
    <div className={cn('rounded-xl border border-border bg-card p-5 space-y-2', className)}>
      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{label}</p>
      <div className="flex items-baseline gap-1.5">
        <span className="text-2xl font-semibold tracking-tight">{value}</span>
        {unit && <span className="text-sm text-muted-foreground">{unit}</span>}
      </div>
      <div className="flex items-center justify-between">
        {target !== undefined && (
          <p className="text-xs text-muted-foreground">
            Mål: {target}{unit ? ` ${unit}` : ''}
          </p>
        )}
        {trend && (
          <div className={cn(
            'flex items-center gap-1 text-xs font-medium',
            trend === 'up' && 'text-emerald-600',
            trend === 'down' && 'text-red-500',
            trend === 'neutral' && 'text-muted-foreground',
          )}>
            <TrendIcon className="h-3 w-3" />
            {trendLabel}
          </div>
        )}
      </div>
    </div>
  )
}
