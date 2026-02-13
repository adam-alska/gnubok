'use client'

import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import type { TikTokVideo } from '@/types'
import { formatDate } from '@/lib/utils'
import {
  Eye,
  Heart,
  MessageCircle,
  Share2,
  ExternalLink,
  Link as LinkIcon,
} from 'lucide-react'

interface TikTokVideoCardProps {
  video: TikTokVideo
  onLinkClick?: (video: TikTokVideo) => void
  showLinkButton?: boolean
}

export function TikTokVideoCard({
  video,
  onLinkClick,
  showLinkButton = true,
}: TikTokVideoCardProps) {
  const formatNumber = (num: number) => {
    if (num >= 1000000) {
      return (num / 1000000).toFixed(1) + 'M'
    }
    if (num >= 1000) {
      return (num / 1000).toFixed(1) + 'K'
    }
    return num.toLocaleString('sv-SE')
  }

  const engagementRate = video.view_count > 0
    ? ((video.like_count + video.comment_count + video.share_count) / video.view_count) * 100
    : 0

  return (
    <Card className="overflow-hidden">
      <div className="flex">
        {/* Thumbnail */}
        {video.cover_image_url && (
          <div className="relative w-24 h-36 flex-shrink-0">
            <img
              src={video.cover_image_url}
              alt={video.title || 'Video'}
              className="w-full h-full object-cover"
            />
            {video.duration && (
              <div className="absolute bottom-1 right-1 bg-black/70 text-white text-xs px-1 rounded">
                {Math.floor(video.duration / 60)}:{(video.duration % 60).toString().padStart(2, '0')}
              </div>
            )}
          </div>
        )}

        <CardContent className="flex-1 p-3">
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              <p className="font-medium text-sm line-clamp-2">
                {video.title || 'Untitled video'}
              </p>
              {video.published_at && (
                <p className="text-xs text-muted-foreground mt-1">
                  {formatDate(video.published_at)}
                </p>
              )}
            </div>
            <div className="flex items-center gap-1 flex-shrink-0">
              {video.share_url && (
                <Button variant="ghost" size="sm" asChild>
                  <a
                    href={video.share_url}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <ExternalLink className="h-4 w-4" />
                  </a>
                </Button>
              )}
              {showLinkButton && onLinkClick && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onLinkClick(video)}
                >
                  <LinkIcon className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>

          {/* Metrics */}
          <div className="flex items-center gap-3 mt-3 text-xs text-muted-foreground">
            <div className="flex items-center gap-1">
              <Eye className="h-3 w-3" />
              {formatNumber(video.view_count)}
            </div>
            <div className="flex items-center gap-1">
              <Heart className="h-3 w-3" />
              {formatNumber(video.like_count)}
            </div>
            <div className="flex items-center gap-1">
              <MessageCircle className="h-3 w-3" />
              {formatNumber(video.comment_count)}
            </div>
            <div className="flex items-center gap-1">
              <Share2 className="h-3 w-3" />
              {formatNumber(video.share_count)}
            </div>
          </div>

          {/* Tags */}
          <div className="flex items-center gap-2 mt-2">
            <Badge variant="secondary" className="text-xs">
              {engagementRate.toFixed(1)}% eng.
            </Badge>
            {video.campaign_id && (
              <Badge variant="default" className="text-xs">
                Kopplad till samarbete
              </Badge>
            )}
          </div>
        </CardContent>
      </div>
    </Card>
  )
}
