'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { TikTokVideoCard } from './TikTokVideoCard'
import type { TikTokVideo } from '@/types'
import { Loader2 } from 'lucide-react'

interface TikTokVideoListProps {
  accountId?: string
  campaignId?: string
  unlinkedOnly?: boolean
  onLinkClick?: (video: TikTokVideo) => void
  showLinkButton?: boolean
  limit?: number
}

export function TikTokVideoList({
  accountId,
  campaignId,
  unlinkedOnly = false,
  onLinkClick,
  showLinkButton = true,
  limit = 10,
}: TikTokVideoListProps) {
  const [videos, setVideos] = useState<TikTokVideo[]>([])
  const [total, setTotal] = useState(0)
  const [offset, setOffset] = useState(0)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    fetchVideos()
  }, [accountId, campaignId, unlinkedOnly, offset])

  const fetchVideos = async () => {
    setIsLoading(true)
    try {
      const params = new URLSearchParams({
        limit: limit.toString(),
        offset: offset.toString(),
      })

      if (accountId) params.append('account_id', accountId)
      if (campaignId) params.append('campaign_id', campaignId)
      if (unlinkedOnly) params.append('unlinked_only', 'true')

      const response = await fetch(`/api/tiktok/videos?${params.toString()}`)
      const data = await response.json()

      if (offset === 0) {
        setVideos(data.videos || [])
      } else {
        setVideos(prev => [...prev, ...(data.videos || [])])
      }
      setTotal(data.total || 0)
    } catch (error) {
      console.error('Failed to fetch videos:', error)
    }
    setIsLoading(false)
  }

  const loadMore = () => {
    setOffset(prev => prev + limit)
  }

  const hasMore = videos.length < total

  if (isLoading && videos.length === 0) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  if (videos.length === 0) {
    return (
      <div className="text-center py-8">
        <p className="text-muted-foreground">Inga videor hittades</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2">
        {videos.map(video => (
          <TikTokVideoCard
            key={video.id}
            video={video}
            onLinkClick={onLinkClick}
            showLinkButton={showLinkButton}
          />
        ))}
      </div>

      {hasMore && (
        <div className="flex justify-center">
          <Button
            variant="outline"
            onClick={loadMore}
            disabled={isLoading}
          >
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Laddar...
              </>
            ) : (
              `Visa fler (${videos.length} av ${total})`
            )}
          </Button>
        </div>
      )}
    </div>
  )
}
