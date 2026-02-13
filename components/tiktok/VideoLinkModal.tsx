'use client'

import { useState, useEffect } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useToast } from '@/components/ui/use-toast'
import type { TikTokVideo, Campaign, Deliverable } from '@/types'
import { Loader2 } from 'lucide-react'

interface VideoLinkModalProps {
  video: TikTokVideo | null
  isOpen: boolean
  onClose: () => void
  onSuccess?: () => void
}

export function VideoLinkModal({
  video,
  isOpen,
  onClose,
  onSuccess,
}: VideoLinkModalProps) {
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [deliverables, setDeliverables] = useState<Deliverable[]>([])
  const [selectedCampaign, setSelectedCampaign] = useState<string>('')
  const [selectedDeliverable, setSelectedDeliverable] = useState<string>('')
  const [isLoading, setIsLoading] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const { toast } = useToast()

  useEffect(() => {
    if (isOpen) {
      fetchCampaigns()
    }
  }, [isOpen])

  useEffect(() => {
    if (selectedCampaign) {
      fetchDeliverables(selectedCampaign)
    } else {
      setDeliverables([])
      setSelectedDeliverable('')
    }
  }, [selectedCampaign])

  const fetchCampaigns = async () => {
    setIsLoading(true)
    try {
      const response = await fetch('/api/campaigns')
      const data = await response.json()
      setCampaigns(data.campaigns || [])
    } catch (error) {
      console.error('Failed to fetch campaigns:', error)
    }
    setIsLoading(false)
  }

  const fetchDeliverables = async (campaignId: string) => {
    try {
      const response = await fetch(`/api/campaigns/${campaignId}/deliverables`)
      const data = await response.json()
      setDeliverables(data.deliverables || [])
    } catch (error) {
      console.error('Failed to fetch deliverables:', error)
    }
  }

  const handleSave = async () => {
    if (!video || !selectedCampaign) return

    setIsSaving(true)
    try {
      const response = await fetch(`/api/tiktok/videos/${video.id}/link`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          campaign_id: selectedCampaign,
          deliverable_id: selectedDeliverable || undefined,
        }),
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Failed to link video')
      }

      toast({
        title: 'Video kopplad',
        description: 'Videon har kopplats till samarbetet',
      })

      onSuccess?.()
      onClose()
    } catch (error) {
      toast({
        title: 'Kunde inte koppla video',
        description: error instanceof Error ? error.message : 'Ett fel uppstod',
        variant: 'destructive',
      })
    }
    setIsSaving(false)
  }

  const handleUnlink = async () => {
    if (!video) return

    setIsSaving(true)
    try {
      const response = await fetch(`/api/tiktok/videos/${video.id}/link`, {
        method: 'DELETE',
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Failed to unlink video')
      }

      toast({
        title: 'Koppling borttagen',
        description: 'Videon har kopplats bort från samarbetet',
      })

      onSuccess?.()
      onClose()
    } catch (error) {
      toast({
        title: 'Kunde inte ta bort koppling',
        description: error instanceof Error ? error.message : 'Ett fel uppstod',
        variant: 'destructive',
      })
    }
    setIsSaving(false)
  }

  const handleClose = () => {
    setSelectedCampaign('')
    setSelectedDeliverable('')
    onClose()
  }

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Koppla video till samarbete</DialogTitle>
          <DialogDescription>
            {video?.title || 'Välj ett samarbete att koppla denna video till för ROI-spårning'}
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="campaign">Samarbete</Label>
              <Select
                value={selectedCampaign}
                onValueChange={setSelectedCampaign}
              >
                <SelectTrigger id="campaign">
                  <SelectValue placeholder="Välj samarbete" />
                </SelectTrigger>
                <SelectContent>
                  {campaigns.map(campaign => (
                    <SelectItem key={campaign.id} value={campaign.id}>
                      {campaign.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {deliverables.length > 0 && (
              <div className="space-y-2">
                <Label htmlFor="deliverable">Leverabel (valfritt)</Label>
                <Select
                  value={selectedDeliverable}
                  onValueChange={setSelectedDeliverable}
                >
                  <SelectTrigger id="deliverable">
                    <SelectValue placeholder="Välj leverabel" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">Ingen specifik leverabel</SelectItem>
                    {deliverables.map(deliverable => (
                      <SelectItem key={deliverable.id} value={deliverable.id}>
                        {deliverable.title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          {video?.campaign_id && (
            <Button
              variant="destructive"
              onClick={handleUnlink}
              disabled={isSaving}
            >
              {isSaving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                'Ta bort koppling'
              )}
            </Button>
          )}
          <Button variant="outline" onClick={handleClose}>
            Avbryt
          </Button>
          <Button
            onClick={handleSave}
            disabled={!selectedCampaign || isSaving}
          >
            {isSaving ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Sparar...
              </>
            ) : (
              'Koppla'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
