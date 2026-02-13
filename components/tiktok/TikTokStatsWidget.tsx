'use client'

import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { formatDate } from '@/lib/utils'
import type { TikTokStatsSummary } from '@/types'
import {
  Users,
  TrendingUp,
  TrendingDown,
  Heart,
  Video,
  ArrowRight,
  RefreshCw,
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface TikTokStatsWidgetProps {
  stats: TikTokStatsSummary | null
  onSync?: () => void
  isSyncing?: boolean
  className?: string
}

export function TikTokStatsWidget({
  stats,
  onSync,
  isSyncing,
  className,
}: TikTokStatsWidgetProps) {
  if (!stats) {
    return null
  }

  const formatNumber = (num: number) => {
    if (num >= 1000000) {
      return (num / 1000000).toFixed(1) + 'M'
    }
    if (num >= 1000) {
      return (num / 1000).toFixed(1) + 'K'
    }
    return num.toLocaleString('sv-SE')
  }

  const formatChange = (change: number) => {
    const prefix = change >= 0 ? '+' : ''
    return prefix + formatNumber(change)
  }

  return (
    <Card className={className}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <TikTokIcon className="h-4 w-4" />
            TikTok
          </CardTitle>
          <div className="flex items-center gap-2">
            {onSync && (
              <Button
                variant="ghost"
                size="sm"
                onClick={onSync}
                disabled={isSyncing}
              >
                <RefreshCw className={cn('h-4 w-4', isSyncing && 'animate-spin')} />
              </Button>
            )}
            <Link href="/analytics">
              <Button variant="ghost" size="sm" className="text-xs">
                Detaljer
                <ArrowRight className="h-3 w-3 ml-1" />
              </Button>
            </Link>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Main follower count */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm text-muted-foreground">Följare</span>
          </div>
          <div className="text-right">
            <p className="font-display text-2xl font-medium">
              {formatNumber(stats.currentFollowers)}
            </p>
          </div>
        </div>

        {/* Growth indicators */}
        <div className="grid grid-cols-2 gap-4">
          <div className="flex items-center gap-2">
            <div className={cn(
              'flex items-center gap-1 text-sm',
              stats.followerChange7d >= 0 ? 'text-success' : 'text-destructive'
            )}>
              {stats.followerChange7d >= 0 ? (
                <TrendingUp className="h-4 w-4" />
              ) : (
                <TrendingDown className="h-4 w-4" />
              )}
              {formatChange(stats.followerChange7d)}
            </div>
            <span className="text-xs text-muted-foreground">7d</span>
          </div>
          <div className="flex items-center gap-2">
            <div className={cn(
              'flex items-center gap-1 text-sm',
              stats.followerChange30d >= 0 ? 'text-success' : 'text-destructive'
            )}>
              {stats.followerChange30d >= 0 ? (
                <TrendingUp className="h-4 w-4" />
              ) : (
                <TrendingDown className="h-4 w-4" />
              )}
              {formatChange(stats.followerChange30d)}
            </div>
            <span className="text-xs text-muted-foreground">30d</span>
          </div>
        </div>

        {/* Secondary stats */}
        <div className="flex items-center justify-between pt-2 border-t">
          <div className="flex items-center gap-2">
            <Heart className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm">{formatNumber(stats.totalLikes)}</span>
          </div>
          <div className="flex items-center gap-2">
            <Video className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm">{stats.totalVideos} videor</span>
          </div>
          <div className="text-sm text-muted-foreground">
            {stats.engagementRate.toFixed(1)}% eng.
          </div>
        </div>

        {/* Last synced */}
        {stats.lastSynced && (
          <p className="text-xs text-muted-foreground text-center">
            Senast uppdaterad: {formatDate(stats.lastSynced)}
          </p>
        )}
      </CardContent>
    </Card>
  )
}

function TikTokIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="currentColor"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 5 20.1a6.34 6.34 0 0 0 10.86-4.43v-7a8.16 8.16 0 0 0 4.77 1.52v-3.4a4.85 4.85 0 0 1-1-.1z" />
    </svg>
  )
}
