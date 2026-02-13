'use client'

import { useState, useEffect } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useToast } from '@/components/ui/use-toast'
import type { Deliverable, DeliverableType, PlatformType, CreateDeliverableInput } from '@/types'
import { DELIVERABLE_TYPE_LABELS, PLATFORM_LABELS } from '@/types'

interface DeliverableFormProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  campaignId: string
  initialData?: Partial<Deliverable>
  onSuccess?: (deliverable: Deliverable) => void
}

export function DeliverableForm({
  open,
  onOpenChange,
  campaignId,
  initialData,
  onSuccess
}: DeliverableFormProps) {
  const { toast } = useToast()
  const [isLoading, setIsLoading] = useState(false)

  const [formData, setFormData] = useState<Omit<CreateDeliverableInput, 'campaign_id'>>({
    title: '',
    deliverable_type: 'video',
    platform: 'instagram',
    account_handle: '',
    quantity: 1,
    description: '',
    due_date: '',
    notes: '',
  })

  useEffect(() => {
    if (open) {
      setFormData({
        title: initialData?.title || '',
        deliverable_type: initialData?.deliverable_type || 'video',
        platform: initialData?.platform || 'instagram',
        account_handle: initialData?.account_handle || '',
        quantity: initialData?.quantity || 1,
        description: initialData?.description || '',
        due_date: initialData?.due_date || '',
        notes: initialData?.notes || '',
      })
    }
  }, [open, initialData])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!formData.title) {
      toast({ title: 'Titel krävs', variant: 'destructive' })
      return
    }

    setIsLoading(true)

    try {
      const url = initialData?.id
        ? `/api/deliverables/${initialData.id}`
        : `/api/campaigns/${campaignId}/deliverables`
      const method = initialData?.id ? 'PATCH' : 'POST'

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          due_date: formData.due_date || null,
        }),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to save deliverable')
      }

      const { data } = await response.json()

      toast({
        title: initialData?.id ? 'Leverabel uppdaterad' : 'Leverabel tillagd',
        description: formData.title,
      })

      onOpenChange(false)
      onSuccess?.(data)
    } catch (error) {
      toast({
        title: 'Fel',
        description: error instanceof Error ? error.message : 'Något gick fel',
        variant: 'destructive',
      })
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {initialData?.id ? 'Redigera leverabel' : 'Lägg till leverabel'}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="title">Titel *</Label>
            <Input
              id="title"
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              placeholder="T.ex. Instagram Reel - Produktrecension"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="platform">Plattform *</Label>
              <Select
                value={formData.platform}
                onValueChange={(v) => setFormData({ ...formData, platform: v as PlatformType })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(PLATFORM_LABELS).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="deliverable_type">Typ *</Label>
              <Select
                value={formData.deliverable_type}
                onValueChange={(v) => setFormData({ ...formData, deliverable_type: v as DeliverableType })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(DELIVERABLE_TYPE_LABELS).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="account_handle">Konto/Kanal</Label>
              <Input
                id="account_handle"
                value={formData.account_handle || ''}
                onChange={(e) => setFormData({ ...formData, account_handle: e.target.value })}
                placeholder="@användarnamn"
              />
            </div>

            <div>
              <Label htmlFor="quantity">Antal</Label>
              <Input
                id="quantity"
                type="number"
                min="1"
                value={formData.quantity || 1}
                onChange={(e) => setFormData({ ...formData, quantity: parseInt(e.target.value) || 1 })}
              />
            </div>
          </div>

          <div>
            <Label htmlFor="due_date">Deadline</Label>
            <Input
              id="due_date"
              type="date"
              value={formData.due_date || ''}
              onChange={(e) => setFormData({ ...formData, due_date: e.target.value })}
            />
            <p className="text-xs text-muted-foreground mt-1">
              En deadline skapas automatiskt i kalendern
            </p>
          </div>

          <div>
            <Label htmlFor="description">Beskrivning</Label>
            <Textarea
              id="description"
              value={formData.description || ''}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="Specifika instruktioner eller krav..."
              rows={3}
            />
          </div>

          <div>
            <Label htmlFor="notes">Interna anteckningar</Label>
            <Textarea
              id="notes"
              value={formData.notes || ''}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              placeholder="Anteckningar..."
              rows={2}
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Avbryt
            </Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading ? 'Sparar...' : initialData?.id ? 'Spara' : 'Lägg till'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
