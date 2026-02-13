'use client'

import { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { useToast } from '@/components/ui/use-toast'
import { formatCurrency } from '@/lib/utils'
import { SCHABLONAVDRAG_RATES, validateMileageEntry } from '@/lib/tax/schablonavdrag'
import { Car, Loader2, MapPin, Calendar, FileText, X } from 'lucide-react'
import type { CreateMileageEntryInput } from '@/types'

interface MileageEntryProps {
  onSave: (entry: CreateMileageEntryInput) => Promise<void>
  onCancel?: () => void
  initialDate?: string
}

export default function MileageEntry({
  onSave,
  onCancel,
  initialDate,
}: MileageEntryProps) {
  const { toast } = useToast()
  const [isSaving, setIsSaving] = useState(false)
  const [errors, setErrors] = useState<string[]>([])

  const today = new Date().toISOString().split('T')[0]
  const [formData, setFormData] = useState<CreateMileageEntryInput>({
    date: initialDate || today,
    distance_km: 0,
    purpose: '',
    from_location: '',
    to_location: '',
  })

  // Calculate deduction preview
  const deductionPreview = formData.distance_km > 0
    ? formData.distance_km * SCHABLONAVDRAG_RATES.bil.rate_per_km
    : 0

  function handleChange(
    field: keyof CreateMileageEntryInput,
    value: string | number
  ) {
    setFormData((prev) => ({ ...prev, [field]: value }))
    setErrors([]) // Clear errors on change
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()

    // Validate
    const validation = validateMileageEntry({
      date: formData.date,
      distance_km: formData.distance_km,
      purpose: formData.purpose,
    })

    if (!validation.valid) {
      setErrors(validation.errors)
      return
    }

    setIsSaving(true)
    try {
      await onSave(formData)
      toast({
        title: 'Körning registrerad',
        description: `${formData.distance_km} km - avdrag ${formatCurrency(deductionPreview)}`,
      })
      // Reset form
      setFormData({
        date: today,
        distance_km: 0,
        purpose: '',
        from_location: '',
        to_location: '',
      })
    } catch (error) {
      toast({
        title: 'Fel',
        description: 'Kunde inte spara körningen',
        variant: 'destructive',
      })
    }
    setIsSaving(false)
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Car className="h-5 w-5" />
              Registrera körning
            </CardTitle>
            <CardDescription>
              Logga en tjänsteresa för milersättning
            </CardDescription>
          </div>
          {onCancel && (
            <Button variant="ghost" size="icon" onClick={onCancel}>
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Error display */}
          {errors.length > 0 && (
            <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20">
              <ul className="text-sm text-destructive space-y-1">
                {errors.map((error, idx) => (
                  <li key={idx}>{error}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Date and distance row */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="date" className="flex items-center gap-2">
                <Calendar className="h-4 w-4" />
                Datum
              </Label>
              <Input
                id="date"
                type="date"
                value={formData.date}
                max={today}
                onChange={(e) => handleChange('date', e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="distance_km">Avstånd (km)</Label>
              <Input
                id="distance_km"
                type="number"
                step="0.1"
                min="0.1"
                max="10000"
                placeholder="0"
                value={formData.distance_km || ''}
                onChange={(e) =>
                  handleChange('distance_km', parseFloat(e.target.value) || 0)
                }
                required
              />
            </div>
          </div>

          {/* Locations row */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="from_location" className="flex items-center gap-2">
                <MapPin className="h-4 w-4" />
                Från
              </Label>
              <Input
                id="from_location"
                placeholder="T.ex. Hemma"
                value={formData.from_location || ''}
                onChange={(e) => handleChange('from_location', e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="to_location" className="flex items-center gap-2">
                <MapPin className="h-4 w-4" />
                Till
              </Label>
              <Input
                id="to_location"
                placeholder="T.ex. Kundens kontor"
                value={formData.to_location || ''}
                onChange={(e) => handleChange('to_location', e.target.value)}
              />
            </div>
          </div>

          {/* Purpose */}
          <div className="space-y-2">
            <Label htmlFor="purpose" className="flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Ändamål
            </Label>
            <Textarea
              id="purpose"
              placeholder="Beskriv syftet med resan, t.ex. kundmöte, fotografering, leverans..."
              value={formData.purpose}
              onChange={(e) => handleChange('purpose', e.target.value)}
              rows={2}
              required
            />
          </div>

          {/* Deduction preview */}
          {formData.distance_km > 0 && (
            <div className="p-4 rounded-lg bg-success/10 border border-success/20">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">Beräknat avdrag</p>
                  <p className="text-xs text-muted-foreground">
                    {formData.distance_km} km × {SCHABLONAVDRAG_RATES.bil.rate_per_km.toFixed(2)} kr/km
                  </p>
                </div>
                <span className="text-xl font-bold text-success">
                  {formatCurrency(deductionPreview)}
                </span>
              </div>
            </div>
          )}

          {/* Submit button */}
          <div className="flex justify-end gap-2">
            {onCancel && (
              <Button type="button" variant="outline" onClick={onCancel}>
                Avbryt
              </Button>
            )}
            <Button type="submit" disabled={isSaving}>
              {isSaving ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Sparar...
                </>
              ) : (
                'Spara körning'
              )}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}
