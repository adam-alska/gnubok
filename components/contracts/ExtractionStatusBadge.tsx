'use client'

import { cn } from '@/lib/utils'
import type { ExtractionStatus } from '@/types'
import { Loader2, CheckCircle2, XCircle, Clock, SkipForward } from 'lucide-react'

interface ExtractionStatusBadgeProps {
  status: ExtractionStatus
  className?: string
}

const statusConfig: Record<ExtractionStatus, {
  icon: typeof Loader2
  color: string
  bgColor: string
  label: string
  animate?: boolean
}> = {
  pending: {
    icon: Clock,
    color: 'text-gray-600',
    bgColor: 'bg-gray-100',
    label: 'Väntar',
  },
  processing: {
    icon: Loader2,
    color: 'text-blue-600',
    bgColor: 'bg-blue-100',
    label: 'Analyserar...',
    animate: true,
  },
  completed: {
    icon: CheckCircle2,
    color: 'text-green-600',
    bgColor: 'bg-green-100',
    label: 'Klar',
  },
  failed: {
    icon: XCircle,
    color: 'text-red-600',
    bgColor: 'bg-red-100',
    label: 'Misslyckades',
  },
  skipped: {
    icon: SkipForward,
    color: 'text-gray-500',
    bgColor: 'bg-gray-100',
    label: 'Hoppade över',
  },
}

export function ExtractionStatusBadge({ status, className }: ExtractionStatusBadgeProps) {
  const { icon: Icon, color, bgColor, label, animate } = statusConfig[status]

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium',
        bgColor,
        color,
        className
      )}
    >
      <Icon className={cn('h-3.5 w-3.5', animate && 'animate-spin')} />
      {label}
    </span>
  )
}
