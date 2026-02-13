'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  TikTokConnectButton,
  TikTokAccountCard,
  TikTokStatsWidget,
  TikTokGrowthChart,
  TikTokVideoList,
  VideoLinkModal,
  TikTokROITable,
} from '@/components/tiktok'
import type { TikTokAccount, TikTokStatsSummary, TikTokVideo, TikTokCampaignROI } from '@/types'
import {
  Loader2,
  TrendingUp,
  Video,
  Target,
  BarChart3,
} from 'lucide-react'

export default function AnalyticsPage() {
  const router = useRouter()
  const supabase = createClient()

  const [isLoading, setIsLoading] = useState(true)
  const [accounts, setAccounts] = useState<TikTokAccount[]>([])
  const [stats, setStats] = useState<TikTokStatsSummary | null>(null)
  const [roiData, setRoiData] = useState<TikTokCampaignROI[]>([])
  const [selectedVideo, setSelectedVideo] = useState<TikTokVideo | null>(null)
  const [isLinkModalOpen, setIsLinkModalOpen] = useState(false)
  const [isSyncing, setIsSyncing] = useState(false)

  useEffect(() => {
    checkAuth()
  }, [])

  const checkAuth = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      router.push('/login')
      return
    }
    fetchData()
  }

  const fetchData = async () => {
    setIsLoading(true)
    await Promise.all([
      fetchAccounts(),
      fetchStats(),
      fetchROI(),
    ])
    setIsLoading(false)
  }

  const fetchAccounts = async () => {
    try {
      const response = await fetch('/api/tiktok/accounts')
      const data = await response.json()
      setAccounts(data.accounts || [])
    } catch (error) {
      console.error('Failed to fetch accounts:', error)
    }
  }

  const fetchStats = async () => {
    try {
      const response = await fetch('/api/tiktok/stats')
      const data = await response.json()
      setStats(data.summary || null)
    } catch (error) {
      console.error('Failed to fetch stats:', error)
    }
  }

  const fetchROI = async () => {
    // Fetch campaigns with TikTok videos for ROI calculation
    try {
      const response = await fetch('/api/tiktok/videos?limit=100')
      const data = await response.json()

      // Group videos by campaign and calculate ROI
      // This is a simplified version - the actual calculation is in the API
      const campaignVideos = new Map<string, TikTokVideo[]>()
      for (const video of data.videos || []) {
        if (video.campaign_id) {
          if (!campaignVideos.has(video.campaign_id)) {
            campaignVideos.set(video.campaign_id, [])
          }
          campaignVideos.get(video.campaign_id)!.push(video)
        }
      }

      // For now, just set empty - actual ROI data would come from a dedicated endpoint
      setRoiData([])
    } catch (error) {
      console.error('Failed to fetch ROI data:', error)
    }
  }

  const handleSync = async () => {
    if (accounts.length === 0) return

    setIsSyncing(true)
    try {
      const activeAccount = accounts.find(a => a.status === 'active')
      if (activeAccount) {
        await fetch('/api/tiktok/sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ account_id: activeAccount.id, sync_type: 'full' }),
        })
        await fetchData()
      }
    } catch (error) {
      console.error('Sync failed:', error)
    }
    setIsSyncing(false)
  }

  const handleVideoLinkClick = (video: TikTokVideo) => {
    setSelectedVideo(video)
    setIsLinkModalOpen(true)
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  const activeAccount = accounts.find(a => a.status === 'active')

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Analytics</h1>
        <p className="text-muted-foreground">
          Analysera din sociala medieprestanda och kampanj-ROI
        </p>
      </div>

      {/* No connected account */}
      {accounts.length === 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Koppla TikTok</CardTitle>
            <CardDescription>
              Anslut ditt TikTok-konto för att se statistik och analysera kampanjprestanda
            </CardDescription>
          </CardHeader>
          <CardContent>
            <TikTokConnectButton />
          </CardContent>
        </Card>
      )}

      {/* Connected account */}
      {activeAccount && (
        <>
          {/* Stats overview */}
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">Följare</span>
                </div>
                <p className="text-2xl font-bold mt-2">
                  {stats?.currentFollowers.toLocaleString('sv-SE') || '0'}
                </p>
                {stats?.followerChange7d !== undefined && (
                  <p className={`text-sm ${stats.followerChange7d >= 0 ? 'text-success' : 'text-destructive'}`}>
                    {stats.followerChange7d >= 0 ? '+' : ''}{stats.followerChange7d.toLocaleString('sv-SE')} senaste 7 dagar
                  </p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-2">
                  <Video className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">Videor</span>
                </div>
                <p className="text-2xl font-bold mt-2">
                  {stats?.totalVideos || 0}
                </p>
                <p className="text-sm text-muted-foreground">
                  {stats?.totalLikes.toLocaleString('sv-SE') || '0'} totala likes
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-2">
                  <Target className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">Engagement Rate</span>
                </div>
                <p className="text-2xl font-bold mt-2">
                  {stats?.engagementRate.toFixed(1) || '0'}%
                </p>
                <p className="text-sm text-muted-foreground">
                  Genomsnitt senaste videor
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-2">
                  <BarChart3 className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">30-dagars tillväxt</span>
                </div>
                <p className="text-2xl font-bold mt-2">
                  {stats?.followerChange30d !== undefined ? (
                    <>
                      {stats.followerChange30d >= 0 ? '+' : ''}
                      {stats.followerChange30d.toLocaleString('sv-SE')}
                    </>
                  ) : '0'}
                </p>
                <p className="text-sm text-muted-foreground">
                  nya följare
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Tabs for different views */}
          <Tabs defaultValue="growth" className="space-y-6">
            <TabsList>
              <TabsTrigger value="growth">Tillväxt</TabsTrigger>
              <TabsTrigger value="videos">Videor</TabsTrigger>
              <TabsTrigger value="roi">Kampanj-ROI</TabsTrigger>
            </TabsList>

            <TabsContent value="growth" className="space-y-6">
              <TikTokGrowthChart accountId={activeAccount.id} />

              {/* Recent videos with metrics */}
              <Card>
                <CardHeader>
                  <CardTitle>Senaste videor</CardTitle>
                  <CardDescription>
                    Prestanda för dina senaste publiceringar
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <TikTokVideoList
                    accountId={activeAccount.id}
                    limit={6}
                    onLinkClick={handleVideoLinkClick}
                  />
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="videos" className="space-y-6">
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle>Alla videor</CardTitle>
                      <CardDescription>
                        Klicka på länk-ikonen för att koppla en video till en kampanj
                      </CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <TikTokVideoList
                    accountId={activeAccount.id}
                    limit={20}
                    onLinkClick={handleVideoLinkClick}
                  />
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="roi" className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>Kampanj-ROI</CardTitle>
                  <CardDescription>
                    Analysera avkastningen på dina influencer-kampanjer baserat på TikTok-prestanda
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <TikTokROITable campaigns={roiData} />
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>

          {/* Account info at bottom */}
          <Card>
            <CardHeader>
              <CardTitle>Kopplat konto</CardTitle>
            </CardHeader>
            <CardContent>
              <TikTokAccountCard
                account={activeAccount}
                onDisconnect={fetchData}
                onSync={fetchData}
              />
            </CardContent>
          </Card>
        </>
      )}

      {/* Video link modal */}
      <VideoLinkModal
        video={selectedVideo}
        isOpen={isLinkModalOpen}
        onClose={() => {
          setIsLinkModalOpen(false)
          setSelectedVideo(null)
        }}
        onSuccess={fetchData}
      />
    </div>
  )
}
