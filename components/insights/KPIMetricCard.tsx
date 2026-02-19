'use client'

import { motion } from 'framer-motion'
import { Card, CardContent } from '@/components/ui/card'
import { TrendingUp, TrendingDown, Minus } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

interface KPIMetricCardProps {
  label: string
  value: string
  subValue?: string
  icon: LucideIcon
  trend?: {
    direction: 'up' | 'down' | 'flat'
    value: string
    positive?: boolean // Is this trend direction good?
  }
  variant?: 'default' | 'highlight' | 'warning' | 'danger'
}

export default function KPIMetricCard({
  label,
  value,
  subValue,
  icon: Icon,
  trend,
  variant = 'default',
}: KPIMetricCardProps) {
  const variantStyles = {
    default: '',
    highlight: 'bg-primary/5 border-primary/20',
    warning: 'bg-amber-500/5 border-amber-500/20',
    danger: 'bg-destructive/5 border-destructive/20',
  }

  const getTrendIcon = () => {
    if (!trend) return null
    if (trend.direction === 'up') return TrendingUp
    if (trend.direction === 'down') return TrendingDown
    return Minus
  }

  const getTrendColor = () => {
    if (!trend) return ''
    if (trend.direction === 'flat') return 'text-muted-foreground'
    if (trend.positive) return 'text-green-600'
    return 'text-red-500'
  }

  const TrendIcon = getTrendIcon()

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      <Card className={`h-full hover-lift ${variantStyles[variant]}`}>
        <CardContent className="p-4">
          <div className="flex items-start justify-between mb-3">
            <div className="p-2 rounded-lg bg-muted/50">
              <Icon className="h-4 w-4 text-muted-foreground" />
            </div>
            {trend && TrendIcon && (
              <div className={`flex items-center gap-1 ${getTrendColor()}`}>
                <TrendIcon className="h-3.5 w-3.5" />
                <span className="text-xs font-medium">{trend.value}</span>
              </div>
            )}
          </div>

          <p className="font-display text-2xl font-bold tabular-nums leading-tight">
            {value}
          </p>
          <p className="text-xs text-muted-foreground mt-1">{label}</p>
          {subValue && (
            <p className="text-xs text-muted-foreground mt-0.5">{subValue}</p>
          )}
        </CardContent>
      </Card>
    </motion.div>
  )
}
