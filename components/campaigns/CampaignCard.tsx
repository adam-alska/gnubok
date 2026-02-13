'use client'

import { Campaign, CAMPAIGN_TYPE_LABELS } from '@/types'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { CampaignStatusBadge } from './CampaignStatusBadge'
import { cn } from '@/lib/utils'
import {
  Building2,
  Calendar,
  FileText,
  Package,
  ChevronRight,
  Banknote,
  Clock,
  AlertCircle,
} from 'lucide-react'
import Link from 'next/link'

interface CampaignCardProps {
  campaign: Campaign
  onClick?: () => void
}

export function CampaignCard({ campaign, onClick }: CampaignCardProps) {
  const formatCurrency = (amount: number | null) => {
    if (!amount) return '-'
    return new Intl.NumberFormat('sv-SE', {
      style: 'currency',
      currency: campaign.currency || 'SEK',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount)
  }

  const formatDate = (date: string | null) => {
    if (!date) return '-'
    return new Date(date).toLocaleDateString('sv-SE', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    })
  }

  // Deliverable progress
  const totalDeliverables = campaign.deliverables?.length || 0
  const completedDeliverables = campaign.deliverables?.filter(d =>
    ['approved', 'published'].includes(d.status)
  ).length || 0
  const pendingDeliverables = totalDeliverables - completedDeliverables
  const progressPercent = totalDeliverables > 0 ? Math.round((completedDeliverables / totalDeliverables) * 100) : 0

  // Find next due date
  const nextDueDate = campaign.deliverables
    ?.filter(d => d.due_date && !['approved', 'published'].includes(d.status))
    .sort((a, b) => new Date(a.due_date!).getTime() - new Date(b.due_date!).getTime())[0]?.due_date

  // Check if next deadline is soon (within 3 days)
  const isDeadlineSoon = nextDueDate && (() => {
    const daysUntil = Math.round((new Date(nextDueDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
    return daysUntil <= 3 && daysUntil >= 0
  })()

  // Check for active exclusivities
  const hasActiveExclusivity = campaign.exclusivities?.some(e => {
    const today = new Date().toISOString().split('T')[0]
    return e.start_date <= today && e.end_date >= today
  })

  // Customer initial for avatar
  const customerInitial = campaign.customer?.name?.charAt(0)?.toUpperCase() || '?'

  return (
    <Link href={`/campaigns/${campaign.id}`}>
      <Card
        className={cn(
          'hover-lift cursor-pointer',
          campaign.status === 'cancelled' && 'opacity-60'
        )}
      >
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-start gap-3 flex-1 min-w-0">
              {/* Customer avatar */}
              <div className="flex-shrink-0 w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-sm font-medium text-primary">
                {customerInitial}
              </div>
              <div className="flex-1 min-w-0">
                <CardTitle className="text-lg truncate">{campaign.name || campaign.customer?.name || 'Namnlöst samarbete'}</CardTitle>
                {campaign.customer && (
                  <p className="text-sm text-muted-foreground mt-0.5 truncate">
                    {campaign.customer.name}
                  </p>
                )}
              </div>
            </div>
            <div className="flex flex-col items-end gap-1">
              <CampaignStatusBadge status={campaign.status} />
              <Badge variant="secondary" className="text-xs">
                {CAMPAIGN_TYPE_LABELS[campaign.campaign_type]}
              </Badge>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          {/* Deliverable progress bar */}
          {totalDeliverables > 0 && (
            <div className="mb-4">
              <div className="flex items-center justify-between text-xs mb-1.5">
                <span className="text-muted-foreground">Innehåll</span>
                <span className="font-medium">{completedDeliverables}/{totalDeliverables} klara</span>
              </div>
              <Progress value={progressPercent} className="h-1.5" />
            </div>
          )}

          <div className="grid grid-cols-2 gap-3 text-sm">
            {/* Value */}
            <div className="flex items-center gap-2 text-muted-foreground">
              <Banknote className="h-4 w-4" />
              <span className="font-medium text-foreground tabular-nums">
                {formatCurrency(campaign.total_value)}
              </span>
            </div>

            {/* Date range */}
            <div className="flex items-center gap-2 text-muted-foreground">
              <Calendar className="h-4 w-4" />
              <span>
                {campaign.start_date ? formatDate(campaign.start_date) : '-'}
              </span>
            </div>

            {/* Next deadline - more prominent if soon */}
            {nextDueDate && (
              <div className={cn(
                "flex items-center gap-2",
                isDeadlineSoon ? "text-warning-foreground" : "text-muted-foreground"
              )}>
                {isDeadlineSoon ? (
                  <AlertCircle className="h-4 w-4" />
                ) : (
                  <Clock className="h-4 w-4" />
                )}
                <span className={isDeadlineSoon ? 'font-medium' : ''}>
                  {formatDate(nextDueDate)}
                </span>
              </div>
            )}

            {/* Contracts */}
            {campaign.contracts && campaign.contracts.length > 0 && (
              <div className="flex items-center gap-2 text-muted-foreground">
                <FileText className="h-4 w-4" />
                <span>{campaign.contracts.length} avtal</span>
              </div>
            )}

            {/* Exclusivity indicator */}
            {hasActiveExclusivity && (
              <Badge variant="outline" className="text-xs w-fit">
                Aktiv exklusivitet
              </Badge>
            )}
          </div>

          <div className="flex justify-end mt-4">
            <ChevronRight className="h-5 w-5 text-muted-foreground" />
          </div>
        </CardContent>
      </Card>
    </Link>
  )
}
