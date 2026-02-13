'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
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
import { Switch } from '@/components/ui/switch'
import { useToast } from '@/components/ui/use-toast'
import type {
  Campaign,
  Customer,
  CampaignType,
  BillingFrequency,
  CreateCampaignInput
} from '@/types'
import {
  CAMPAIGN_TYPE_LABELS,
  BILLING_FREQUENCY_LABELS,
} from '@/types'

interface CampaignFormProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  initialData?: Partial<Campaign>
  customers: Customer[]
  onSuccess?: (campaign: Campaign) => void
}

const CURRENCIES = ['SEK', 'EUR', 'USD', 'GBP', 'NOK', 'DKK']

export function CampaignForm({
  open,
  onOpenChange,
  initialData,
  customers,
  onSuccess
}: CampaignFormProps) {
  const router = useRouter()
  const { toast } = useToast()
  const [isLoading, setIsLoading] = useState(false)

  const [formData, setFormData] = useState<CreateCampaignInput>({
    name: '',
    description: '',
    customer_id: '',
    brand_name: '',
    campaign_type: 'influencer',
    total_value: undefined,
    currency: 'SEK',
    vat_included: false,
    payment_terms: 30,
    billing_frequency: undefined,
    publication_date: '',
    draft_deadline: '',
    notes: '',
  })

  useEffect(() => {
    if (open) {
      setFormData({
        name: initialData?.name || '',
        description: initialData?.description || '',
        customer_id: initialData?.customer_id || '',
        brand_name: initialData?.brand_name || '',
        campaign_type: initialData?.campaign_type || 'influencer',
        total_value: initialData?.total_value || undefined,
        currency: initialData?.currency || 'SEK',
        vat_included: initialData?.vat_included || false,
        payment_terms: initialData?.payment_terms || 30,
        billing_frequency: initialData?.billing_frequency || undefined,
        publication_date: initialData?.publication_date || '',
        draft_deadline: initialData?.draft_deadline || '',
        notes: initialData?.notes || '',
      })
    }
  }, [open, initialData])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!formData.name) {
      toast({ title: 'Namn krävs', variant: 'destructive' })
      return
    }

    setIsLoading(true)

    try {
      const url = initialData?.id
        ? `/api/campaigns/${initialData.id}`
        : '/api/campaigns'
      const method = initialData?.id ? 'PATCH' : 'POST'

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          customer_id: formData.customer_id || null,
          brand_name: formData.brand_name || null,
          total_value: formData.total_value || null,
          payment_terms: formData.payment_terms || null,
          billing_frequency: formData.billing_frequency || null,
          publication_date: formData.publication_date || null,
          draft_deadline: formData.draft_deadline || null,
        }),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to save campaign')
      }

      const { data } = await response.json()

      toast({
        title: initialData?.id ? 'Samarbete uppdaterat' : 'Samarbete skapat',
        description: formData.name,
      })

      onOpenChange(false)

      if (onSuccess) {
        onSuccess(data)
      } else if (!initialData?.id) {
        router.push(`/campaigns/${data.id}`)
      }
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
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {initialData?.id ? 'Redigera samarbete' : 'Nytt samarbete'}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Basic Info */}
          <div className="space-y-4">
            <div>
              <Label htmlFor="name">Namn på samarbete *</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="T.ex. Sommarkampanj 2025"
                required
              />
            </div>

            <div>
              <Label htmlFor="description">Beskrivning</Label>
              <Textarea
                id="description"
                value={formData.description || ''}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Kort beskrivning av kampanjen..."
                rows={2}
              />
            </div>

            <div>
              <Label htmlFor="brand_name">Varumärke</Label>
              <Input
                id="brand_name"
                value={formData.brand_name || ''}
                onChange={(e) => setFormData({ ...formData, brand_name: e.target.value })}
                placeholder="Varumärket du skapar innehåll för"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Varumärket som samarbetet gäller
              </p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="campaign_type">Typ</Label>
                <Select
                  value={formData.campaign_type}
                  onValueChange={(v) => setFormData({ ...formData, campaign_type: v as CampaignType })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Välj typ" />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(CAMPAIGN_TYPE_LABELS).map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="customer_id">Byrå / Uppdragsgivare</Label>
                <Select
                  value={formData.customer_id || ''}
                  onValueChange={(v) => setFormData({
                    ...formData,
                    customer_id: v,
                  })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Välj byrå/uppdragsgivare" />
                  </SelectTrigger>
                  <SelectContent>
                    {customers.map((customer) => (
                      <SelectItem key={customer.id} value={customer.id}>
                        {customer.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground mt-1">
                  Den som faktureras (byrå eller direktkund)
                </p>
              </div>
            </div>
          </div>

          {/* Financial */}
          <div className="space-y-4 pt-4 border-t">
            <h4 className="font-medium">Ekonomi</h4>

            <div className="grid grid-cols-3 gap-4">
              <div>
                <Label htmlFor="total_value">Arvode</Label>
                <Input
                  id="total_value"
                  type="number"
                  value={formData.total_value || ''}
                  onChange={(e) => setFormData({
                    ...formData,
                    total_value: e.target.value ? parseFloat(e.target.value) : undefined
                  })}
                  placeholder="0"
                />
              </div>

              <div>
                <Label htmlFor="currency">Valuta</Label>
                <Select
                  value={formData.currency}
                  onValueChange={(v) => setFormData({ ...formData, currency: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CURRENCIES.map((c) => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-end gap-2">
                <div className="flex items-center gap-2">
                  <Switch
                    id="vat_included"
                    checked={formData.vat_included}
                    onCheckedChange={(v) => setFormData({ ...formData, vat_included: v })}
                  />
                  <Label htmlFor="vat_included" className="font-normal">Inkl. moms</Label>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="payment_terms">Betalningsvillkor (dagar)</Label>
                <Input
                  id="payment_terms"
                  type="number"
                  value={formData.payment_terms || ''}
                  onChange={(e) => setFormData({
                    ...formData,
                    payment_terms: e.target.value ? parseInt(e.target.value) : undefined
                  })}
                  placeholder="30"
                />
              </div>

              <div>
                <Label htmlFor="billing_frequency">Faktureringsmodell</Label>
                <Select
                  value={formData.billing_frequency || ''}
                  onValueChange={(v) => setFormData({
                    ...formData,
                    billing_frequency: v as BillingFrequency || undefined
                  })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Välj..." />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(BILLING_FREQUENCY_LABELS).map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          {/* Dates */}
          <div className="space-y-4 pt-4 border-t">
            <h4 className="font-medium">Datum</h4>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="publication_date">Publiceringsdatum</Label>
                <Input
                  id="publication_date"
                  type="date"
                  value={formData.publication_date || ''}
                  onChange={(e) => setFormData({ ...formData, publication_date: e.target.value })}
                />
                <p className="text-xs text-muted-foreground mt-1">
                  När innehållet ska publiceras
                </p>
              </div>

              <div>
                <Label htmlFor="draft_deadline">Utkastdeadline</Label>
                <Input
                  id="draft_deadline"
                  type="date"
                  value={formData.draft_deadline || ''}
                  onChange={(e) => setFormData({ ...formData, draft_deadline: e.target.value })}
                />
                <p className="text-xs text-muted-foreground mt-1">
                  När utkast ska skickas (valfritt)
                </p>
              </div>
            </div>
          </div>

          {/* Notes */}
          <div className="pt-4 border-t">
            <Label htmlFor="notes">Anteckningar</Label>
            <Textarea
              id="notes"
              value={formData.notes || ''}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              placeholder="Interna anteckningar..."
              rows={3}
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Avbryt
            </Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading ? 'Sparar...' : initialData?.id ? 'Spara' : 'Skapa samarbete'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
