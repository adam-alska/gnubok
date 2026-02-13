'use client'

import { cn } from '@/lib/utils'
import type { ConfidenceLevel } from '@/types'
import { CheckCircle2, AlertCircle, HelpCircle, XCircle } from 'lucide-react'

interface ConfidenceIndicatorProps {
  level: ConfidenceLevel
  showLabel?: boolean
  size?: 'sm' | 'md'
}

const config: Record<ConfidenceLevel, {
  icon: typeof CheckCircle2
  color: string
  bgColor: string
  label: string
}> = {
  high: {
    icon: CheckCircle2,
    color: 'text-green-600',
    bgColor: 'bg-green-100',
    label: 'Hög säkerhet',
  },
  medium: {
    icon: AlertCircle,
    color: 'text-yellow-600',
    bgColor: 'bg-yellow-100',
    label: 'Medel säkerhet',
  },
  low: {
    icon: HelpCircle,
    color: 'text-orange-600',
    bgColor: 'bg-orange-100',
    label: 'Låg säkerhet',
  },
  missing: {
    icon: XCircle,
    color: 'text-gray-400',
    bgColor: 'bg-gray-100',
    label: 'Saknas',
  },
}

export function ConfidenceIndicator({
  level,
  showLabel = false,
  size = 'md',
}: ConfidenceIndicatorProps) {
  const { icon: Icon, color, bgColor, label } = config[level]

  const iconSize = size === 'sm' ? 'h-3.5 w-3.5' : 'h-4 w-4'

  if (showLabel) {
    return (
      <span
        className={cn(
          'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium',
          bgColor,
          color
        )}
      >
        <Icon className={iconSize} />
        {label}
      </span>
    )
  }

  return (
    <span title={label}>
      <Icon className={cn(iconSize, color)} />
    </span>
  )
}

interface ConfidenceFieldProps {
  label: string
  confidence: ConfidenceLevel
  children: React.ReactNode
  className?: string
}

export function ConfidenceField({
  label,
  confidence,
  children,
  className,
}: ConfidenceFieldProps) {
  return (
    <div className={cn('space-y-1', className)}>
      <div className="flex items-center gap-2">
        <label className="text-sm font-medium text-muted-foreground">
          {label}
        </label>
        <ConfidenceIndicator level={confidence} size="sm" />
      </div>
      {children}
    </div>
  )
}
