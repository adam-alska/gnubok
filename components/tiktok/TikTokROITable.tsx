'use client'

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import Link from 'next/link'
import type { TikTokCampaignROI } from '@/types'
import { formatCurrency } from '@/lib/utils'

interface TikTokROITableProps {
  campaigns: TikTokCampaignROI[]
  className?: string
}

export function TikTokROITable({ campaigns, className }: TikTokROITableProps) {
  const formatNumber = (num: number) => {
    if (num >= 1000000) {
      return (num / 1000000).toFixed(1) + 'M'
    }
    if (num >= 1000) {
      return (num / 1000).toFixed(1) + 'K'
    }
    return num.toLocaleString('sv-SE')
  }

  const formatCPV = (cpv: number) => {
    if (cpv === 0) return '-'
    if (cpv < 0.01) return '< 0.01 kr'
    return formatCurrency(cpv)
  }

  const getROIBadge = (cpv: number) => {
    if (cpv === 0) return null
    if (cpv < 0.1) return <Badge variant="default">Utmärkt</Badge>
    if (cpv < 0.5) return <Badge variant="secondary">Bra</Badge>
    if (cpv < 1) return <Badge variant="outline">OK</Badge>
    return <Badge variant="destructive">Hög kostnad</Badge>
  }

  if (campaigns.length === 0) {
    return (
      <div className="text-center py-8">
        <p className="text-muted-foreground">
          Inga samarbeten med kopplade TikTok-videor
        </p>
      </div>
    )
  }

  return (
    <div className={className}>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Samarbete</TableHead>
            <TableHead className="text-right">Videor</TableHead>
            <TableHead className="text-right">Visningar</TableHead>
            <TableHead className="text-right">Engagemang</TableHead>
            <TableHead className="text-right">Kostnad</TableHead>
            <TableHead className="text-right">CPV</TableHead>
            <TableHead className="text-right">CPE</TableHead>
            <TableHead>ROI</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {campaigns.map(campaign => (
            <TableRow key={campaign.campaignId}>
              <TableCell>
                <Link
                  href={`/campaigns/${campaign.campaignId}`}
                  className="font-medium hover:underline"
                >
                  {campaign.campaignName}
                </Link>
              </TableCell>
              <TableCell className="text-right">
                {campaign.videos.length}
              </TableCell>
              <TableCell className="text-right">
                {formatNumber(campaign.totalViews)}
              </TableCell>
              <TableCell className="text-right">
                {formatNumber(campaign.totalEngagements)}
              </TableCell>
              <TableCell className="text-right">
                {formatCurrency(campaign.totalCost)}
              </TableCell>
              <TableCell className="text-right">
                {formatCPV(campaign.costPerView)}
              </TableCell>
              <TableCell className="text-right">
                {formatCPV(campaign.costPerEngagement)}
              </TableCell>
              <TableCell>
                {getROIBadge(campaign.costPerView)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      {/* Summary */}
      <div className="mt-4 p-4 bg-secondary/30 rounded-lg">
        <div className="grid grid-cols-4 gap-4 text-sm">
          <div>
            <p className="text-muted-foreground">Totala visningar</p>
            <p className="font-medium">
              {formatNumber(campaigns.reduce((sum, c) => sum + c.totalViews, 0))}
            </p>
          </div>
          <div>
            <p className="text-muted-foreground">Totalt engagemang</p>
            <p className="font-medium">
              {formatNumber(campaigns.reduce((sum, c) => sum + c.totalEngagements, 0))}
            </p>
          </div>
          <div>
            <p className="text-muted-foreground">Total kostnad</p>
            <p className="font-medium">
              {formatCurrency(campaigns.reduce((sum, c) => sum + c.totalCost, 0))}
            </p>
          </div>
          <div>
            <p className="text-muted-foreground">Genomsnittlig CPV</p>
            <p className="font-medium">
              {formatCPV(
                campaigns.reduce((sum, c) => sum + c.totalCost, 0) /
                Math.max(1, campaigns.reduce((sum, c) => sum + c.totalViews, 0))
              )}
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
