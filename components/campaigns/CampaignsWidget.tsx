'use client'

import Link from 'next/link'
import { Campaign, Deliverable, CAMPAIGN_STATUS_LABELS } from '@/types'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { CampaignStatusBadge } from './CampaignStatusBadge'
import {
  Megaphone,
  ArrowRight,
  Clock,
  Package,
  AlertTriangle,
  Plus
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface CampaignsWidgetProps {
  campaigns: Campaign[]
  className?: string
}

export function CampaignsWidget({ campaigns, className }: CampaignsWidgetProps) {
  const today = new Date().toISOString().split('T')[0]

  // Get active campaigns
  const activeCampaigns = campaigns.filter(c =>
    ['active', 'contracted', 'negotiation'].includes(c.status)
  )

  // Find upcoming deliverables (next 7 days)
  const next7Days = new Date()
  next7Days.setDate(next7Days.getDate() + 7)
  const next7DaysStr = next7Days.toISOString().split('T')[0]

  const upcomingDeliverables: (Deliverable & { campaignName: string })[] = []
  for (const campaign of activeCampaigns) {
    for (const deliverable of campaign.deliverables || []) {
      if (
        deliverable.due_date &&
        deliverable.due_date >= today &&
        deliverable.due_date <= next7DaysStr &&
        !['approved', 'published'].includes(deliverable.status)
      ) {
        upcomingDeliverables.push({
          ...deliverable,
          campaignName: campaign.name
        })
      }
    }
  }

  // Sort by due date
  upcomingDeliverables.sort((a, b) =>
    new Date(a.due_date!).getTime() - new Date(b.due_date!).getTime()
  )

  // Find overdue deliverables
  const overdueCount = activeCampaigns.reduce((count, campaign) => {
    return count + (campaign.deliverables?.filter(d =>
      d.due_date &&
      d.due_date < today &&
      !['approved', 'published'].includes(d.status)
    ).length || 0)
  }, 0)

  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString('sv-SE', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
    })
  }

  if (activeCampaigns.length === 0) {
    return null
  }

  return (
    <Card className={className}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Megaphone className="h-4 w-4" />
            Samarbeten
          </CardTitle>
          <Link href="/campaigns">
            <Button variant="ghost" size="sm" className="text-xs">
              Visa alla
              <ArrowRight className="h-3 w-3 ml-1" />
            </Button>
          </Link>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Active campaigns summary */}
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Aktiva samarbeten</span>
          <span className="font-medium">{activeCampaigns.length}</span>
        </div>

        {/* Overdue warning */}
        {overdueCount > 0 && (
          <div className="flex items-center gap-2 p-2 bg-destructive/10 rounded-lg">
            <AlertTriangle className="h-4 w-4 text-destructive" />
            <span className="text-sm text-destructive">
              {overdueCount} försenat innehåll
            </span>
          </div>
        )}

        {/* Upcoming deliverables */}
        {upcomingDeliverables.length > 0 && (
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wide mb-2">
              Kommande denna vecka
            </p>
            <div className="space-y-2">
              {upcomingDeliverables.slice(0, 3).map(deliverable => (
                <div
                  key={deliverable.id}
                  className="flex items-center gap-2 p-2 rounded-lg border bg-card"
                >
                  <Package className="h-4 w-4 text-muted-foreground" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">
                      {deliverable.title}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {deliverable.campaignName}
                    </p>
                  </div>
                  <div className="text-xs text-muted-foreground flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {formatDate(deliverable.due_date!)}
                  </div>
                </div>
              ))}
              {upcomingDeliverables.length > 3 && (
                <p className="text-xs text-muted-foreground text-center">
                  +{upcomingDeliverables.length - 3} till
                </p>
              )}
            </div>
          </div>
        )}

        {/* Quick add button */}
        <Link href="/campaigns/new" className="block">
          <Button variant="outline" size="sm" className="w-full">
            <Plus className="h-4 w-4 mr-1" />
            Nytt samarbete
          </Button>
        </Link>
      </CardContent>
    </Card>
  )
}
