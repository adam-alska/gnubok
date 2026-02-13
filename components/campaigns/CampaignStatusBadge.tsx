'use client'

import { Badge } from '@/components/ui/badge'
import type { CampaignStatus } from '@/types'
import { CAMPAIGN_STATUS_LABELS } from '@/types'
import { cn } from '@/lib/utils'

const STATUS_STYLES: Record<CampaignStatus, { className: string; variant: 'default' | 'secondary' | 'outline' | 'destructive' }> = {
  negotiation: { className: 'bg-blue-100 text-blue-700 border-blue-200', variant: 'outline' },
  contracted: { className: 'bg-purple-100 text-purple-700 border-purple-200', variant: 'outline' },
  active: { className: 'bg-green-100 text-green-700 border-green-200', variant: 'outline' },
  delivered: { className: 'bg-yellow-100 text-yellow-700 border-yellow-200', variant: 'outline' },
  invoiced: { className: 'bg-orange-100 text-orange-700 border-orange-200', variant: 'outline' },
  completed: { className: 'bg-emerald-100 text-emerald-700 border-emerald-200', variant: 'outline' },
  cancelled: { className: 'bg-gray-100 text-gray-500 border-gray-200', variant: 'outline' },
}

interface CampaignStatusBadgeProps {
  status: CampaignStatus
  size?: 'sm' | 'default'
}

export function CampaignStatusBadge({ status, size = 'default' }: CampaignStatusBadgeProps) {
  const style = STATUS_STYLES[status]

  return (
    <Badge
      variant={style.variant}
      className={cn(
        style.className,
        size === 'sm' && 'text-xs px-1.5 py-0'
      )}
    >
      {CAMPAIGN_STATUS_LABELS[status]}
    </Badge>
  )
}
