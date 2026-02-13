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
import { Badge } from '@/components/ui/badge'
import { useToast } from '@/components/ui/use-toast'
import type { Exclusivity, CreateExclusivityInput, ExclusivityConflict } from '@/types'
import { AlertTriangle, X, Plus } from 'lucide-react'

interface ExclusivityFormProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  campaignId: string
  initialData?: Partial<Exclusivity>
  onSuccess?: (exclusivity: Exclusivity) => void
}

// Common category suggestions
const CATEGORY_SUGGESTIONS = [
  'Skönhet', 'Hudvård', 'Smink', 'Mode', 'Kläder', 'Accessoarer',
  'Mat', 'Dryck', 'Kaffe', 'Energidryck', 'Snacks',
  'Teknik', 'Mobil', 'Gaming', 'Elektronik',
  'Träning', 'Gym', 'Kosttillskott', 'Sport',
  'Resor', 'Hotell', 'Flyg',
  'Bank', 'Finans', 'Försäkring',
  'Bil', 'Bilar', 'Transport'
]

export function ExclusivityForm({
  open,
  onOpenChange,
  campaignId,
  initialData,
  onSuccess
}: ExclusivityFormProps) {
  const { toast } = useToast()
  const [isLoading, setIsLoading] = useState(false)
  const [isCheckingConflicts, setIsCheckingConflicts] = useState(false)
  const [conflicts, setConflicts] = useState<ExclusivityConflict[]>([])
  const [newCategory, setNewCategory] = useState('')
  const [newBrand, setNewBrand] = useState('')

  const [formData, setFormData] = useState<Omit<CreateExclusivityInput, 'campaign_id'>>({
    categories: [],
    excluded_brands: [],
    start_date: '',
    end_date: '',
    notes: '',
  })

  useEffect(() => {
    if (open) {
      setFormData({
        categories: initialData?.categories || [],
        excluded_brands: initialData?.excluded_brands || [],
        start_date: initialData?.start_date || '',
        end_date: initialData?.end_date || '',
        notes: initialData?.notes || '',
      })
      setConflicts([])
      setNewCategory('')
      setNewBrand('')
    }
  }, [open, initialData])

  // Check for conflicts when dates or categories change
  const checkConflicts = async () => {
    if (!formData.categories.length || !formData.start_date || !formData.end_date) {
      setConflicts([])
      return
    }

    setIsCheckingConflicts(true)
    try {
      const params = new URLSearchParams({
        categories: formData.categories.join(','),
        start_date: formData.start_date,
        end_date: formData.end_date,
        exclude_campaign_id: campaignId,
      })

      const response = await fetch(`/api/exclusivities/conflicts?${params}`)
      if (response.ok) {
        const data = await response.json()
        setConflicts(data.conflicts || [])
      }
    } catch (error) {
      console.error('Failed to check conflicts:', error)
    } finally {
      setIsCheckingConflicts(false)
    }
  }

  useEffect(() => {
    const timer = setTimeout(checkConflicts, 500)
    return () => clearTimeout(timer)
  }, [formData.categories, formData.start_date, formData.end_date])

  const addCategory = (category: string) => {
    const trimmed = category.trim()
    if (trimmed && !formData.categories.includes(trimmed)) {
      setFormData({
        ...formData,
        categories: [...formData.categories, trimmed]
      })
    }
    setNewCategory('')
  }

  const removeCategory = (category: string) => {
    setFormData({
      ...formData,
      categories: formData.categories.filter(c => c !== category)
    })
  }

  const addBrand = (brand: string) => {
    const trimmed = brand.trim()
    if (trimmed && !formData.excluded_brands?.includes(trimmed)) {
      setFormData({
        ...formData,
        excluded_brands: [...(formData.excluded_brands || []), trimmed]
      })
    }
    setNewBrand('')
  }

  const removeBrand = (brand: string) => {
    setFormData({
      ...formData,
      excluded_brands: formData.excluded_brands?.filter(b => b !== brand) || []
    })
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (formData.categories.length === 0) {
      toast({ title: 'Minst en kategori krävs', variant: 'destructive' })
      return
    }

    if (!formData.start_date || !formData.end_date) {
      toast({ title: 'Start- och slutdatum krävs', variant: 'destructive' })
      return
    }

    setIsLoading(true)

    try {
      const url = initialData?.id
        ? `/api/exclusivities/${initialData.id}`
        : `/api/campaigns/${campaignId}/exclusivities`
      const method = initialData?.id ? 'PATCH' : 'POST'

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to save exclusivity')
      }

      const result = await response.json()

      // Show warning if there are conflicts
      if (result.warning) {
        toast({
          title: 'Exklusivitet sparad med varning',
          description: result.warning,
          variant: 'default',
        })
      } else {
        toast({
          title: initialData?.id ? 'Exklusivitet uppdaterad' : 'Exklusivitet tillagd',
        })
      }

      onOpenChange(false)
      onSuccess?.(result.data)
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
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {initialData?.id ? 'Redigera exklusivitet' : 'Lägg till exklusivitet'}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Categories */}
          <div>
            <Label>Kategorier *</Label>
            <div className="flex flex-wrap gap-2 mt-2 mb-2">
              {formData.categories.map(category => (
                <Badge key={category} variant="secondary" className="gap-1">
                  {category}
                  <button
                    type="button"
                    onClick={() => removeCategory(category)}
                    className="hover:text-destructive"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
            </div>
            <div className="flex gap-2">
              <Input
                value={newCategory}
                onChange={(e) => setNewCategory(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    addCategory(newCategory)
                  }
                }}
                placeholder="Lägg till kategori..."
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={() => addCategory(newCategory)}
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>
            <div className="flex flex-wrap gap-1 mt-2">
              {CATEGORY_SUGGESTIONS
                .filter(s => !formData.categories.includes(s))
                .slice(0, 8)
                .map(suggestion => (
                  <button
                    key={suggestion}
                    type="button"
                    onClick={() => addCategory(suggestion)}
                    className="text-xs text-muted-foreground hover:text-foreground px-2 py-0.5 rounded border hover:border-primary"
                  >
                    + {suggestion}
                  </button>
                ))}
            </div>
          </div>

          {/* Excluded brands */}
          <div>
            <Label>Specifika varumärken som exkluderas (valfritt)</Label>
            <div className="flex flex-wrap gap-2 mt-2 mb-2">
              {formData.excluded_brands?.map(brand => (
                <Badge key={brand} variant="outline" className="gap-1">
                  {brand}
                  <button
                    type="button"
                    onClick={() => removeBrand(brand)}
                    className="hover:text-destructive"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
            </div>
            <div className="flex gap-2">
              <Input
                value={newBrand}
                onChange={(e) => setNewBrand(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    addBrand(newBrand)
                  }
                }}
                placeholder="Lägg till varumärke..."
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={() => addBrand(newBrand)}
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Date range */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="start_date">Startdatum *</Label>
              <Input
                id="start_date"
                type="date"
                value={formData.start_date}
                onChange={(e) => setFormData({ ...formData, start_date: e.target.value })}
                required
              />
            </div>
            <div>
              <Label htmlFor="end_date">Slutdatum *</Label>
              <Input
                id="end_date"
                type="date"
                value={formData.end_date}
                onChange={(e) => setFormData({ ...formData, end_date: e.target.value })}
                required
              />
            </div>
          </div>

          {/* Conflict warnings */}
          {conflicts.length > 0 && (
            <div className="p-3 bg-orange-50 border border-orange-200 rounded-lg">
              <div className="flex items-start gap-2">
                <AlertTriangle className="h-5 w-5 text-orange-600 flex-shrink-0" />
                <div>
                  <p className="font-medium text-orange-800">
                    {conflicts.length} överlappande exklusivitet(er)
                  </p>
                  <ul className="text-sm text-orange-700 mt-1 space-y-1">
                    {conflicts.map((conflict, i) => (
                      <li key={i}>
                        <strong>{conflict.conflictingCampaign?.name || 'Okänd kampanj'}</strong>
                        : {conflict.overlappingCategories.join(', ')}
                        {' '}({conflict.overlapStart} - {conflict.overlapEnd})
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          )}

          {/* Notes */}
          <div>
            <Label htmlFor="notes">Anteckningar</Label>
            <Textarea
              id="notes"
              value={formData.notes || ''}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              placeholder="Detaljer om exklusiviteten..."
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
