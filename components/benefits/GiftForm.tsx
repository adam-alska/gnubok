'use client'

import { useState, useMemo } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import { classifyGift, TAX_FREE_PROMO_THRESHOLD, getBookingTypeDisplayText } from '@/lib/benefits/gift-classifier'
import { formatCurrency } from '@/lib/utils'
import { Gift, CheckCircle, XCircle, AlertCircle, HelpCircle, AlertTriangle } from 'lucide-react'
import type { CreateGiftInput, GiftInput, GiftClassification } from '@/types'

interface GiftFormProps {
  onSubmit: (data: CreateGiftInput) => Promise<void>
  initialData?: Partial<CreateGiftInput & { returned?: boolean }>
  isLoading?: boolean
  isLightMode?: boolean
}

export default function GiftForm({ onSubmit, initialData, isLoading, isLightMode }: GiftFormProps) {
  const [formData, setFormData] = useState<CreateGiftInput>({
    date: initialData?.date || new Date().toISOString().split('T')[0],
    brand_name: initialData?.brand_name || '',
    description: initialData?.description || '',
    estimated_value: initialData?.estimated_value || 0,
    has_motprestation: initialData?.has_motprestation || false,
    used_in_business: initialData?.used_in_business || false,
    used_privately: initialData?.used_privately || false,
    is_simple_promo: initialData?.is_simple_promo || false,
  })
  const [returned, setReturned] = useState(initialData?.returned || false)
  const [valueOverridden, setValueOverridden] = useState(false)

  // Compute classification from form data (derived state, no need for useEffect)
  const classification = useMemo<GiftClassification | null>(() => {
    if (formData.estimated_value > 0) {
      const input: GiftInput = {
        estimatedValue: formData.estimated_value,
        hasMotprestation: formData.has_motprestation,
        usedInBusiness: formData.used_in_business,
        usedPrivately: formData.used_privately,
        isSimplePromoItem: formData.is_simple_promo || false,
      }
      return classifyGift(input)
    }
    return null
  }, [formData.estimated_value, formData.has_motprestation, formData.used_in_business, formData.used_privately, formData.is_simple_promo])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    await onSubmit({ ...formData, returned } as CreateGiftInput & { returned?: boolean })
  }

  const updateField = <K extends keyof CreateGiftInput>(field: K, value: CreateGiftInput[K]) => {
    setFormData((prev) => ({ ...prev, [field]: value }))
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Basic Info */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Gift className="h-5 w-5" />
            Produktinformation
          </CardTitle>
          <CardDescription>Ange information om gåvan eller produkten du fått</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="date">Datum</Label>
              <Input
                id="date"
                type="date"
                value={formData.date}
                onChange={(e) => updateField('date', e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="brand_name">Varumärke/Företag</Label>
              <Input
                id="brand_name"
                placeholder="t.ex. Daniel Wellington"
                value={formData.brand_name}
                onChange={(e) => updateField('brand_name', e.target.value)}
                required
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Beskrivning</Label>
            <Textarea
              id="description"
              placeholder="t.ex. Klocka, modell Classic Petite"
              value={formData.description}
              onChange={(e) => updateField('description', e.target.value)}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="estimated_value">Uppskattat marknadsvärde (SEK)</Label>
            <Input
              id="estimated_value"
              type="number"
              min="0"
              step="1"
              placeholder="0"
              value={formData.estimated_value || ''}
              onChange={(e) => updateField('estimated_value', parseFloat(e.target.value) || 0)}
              required
            />
            <p className="text-xs text-muted-foreground">
              Skattefritt om enklare reklamgåva under {formatCurrency(TAX_FREE_PROMO_THRESHOLD)}
            </p>
          </div>

          <div className="flex items-center space-x-2">
            <Switch
              id="is_simple_promo"
              checked={formData.is_simple_promo || false}
              onCheckedChange={(checked) => updateField('is_simple_promo', checked)}
            />
            <Label htmlFor="is_simple_promo" className="flex items-center gap-2">
              Enklare reklamgåva
              <HelpCircle className="h-4 w-4 text-muted-foreground" />
            </Label>
          </div>
          <p className="text-xs text-muted-foreground ml-12">
            T.ex. penna, mugg, t-shirt med företagslogo - inte exklusiva produkter
          </p>

          {/* Returned toggle */}
          <div className="flex items-center space-x-2">
            <Switch
              id="returned"
              checked={returned}
              onCheckedChange={setReturned}
            />
            <Label htmlFor="returned">Returnerad</Label>
          </div>
          {returned && (
            <p className="text-xs text-success ml-12">
              Returnerade gåvor räknas inte som skattepliktig inkomst.
            </p>
          )}

          {/* Value override warning */}
          {valueOverridden && (
            <div className="flex items-start gap-2 p-3 bg-warning/10 border border-warning/30 rounded-lg">
              <AlertTriangle className="h-4 w-4 text-warning mt-0.5 flex-shrink-0" />
              <p className="text-xs text-warning">
                Skatteverket kräver marknadsvärde vid mottagning (inkl. moms). Lägre värdering ökar revisionsrisken.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Decision Tree Questions */}
      <Card>
        <CardHeader>
          <CardTitle>Skatteklassificering</CardTitle>
          <CardDescription>Svara på frågorna nedan för korrekt skattehantering</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Question 1: Motprestation */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="has_motprestation" className="font-medium">
                Fanns krav på att du skulle posta om denna produkt?
              </Label>
              <Switch
                id="has_motprestation"
                checked={formData.has_motprestation}
                onCheckedChange={(checked) => updateField('has_motprestation', checked)}
              />
            </div>
            <p className="text-sm text-muted-foreground">
              T.ex. sponsrat inlägg, samarbete, eller annat krav på att nämna/visa produkten
            </p>
          </div>

          {/* Question 2: Business use - hidden for light mode */}
          {!isLightMode && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="used_in_business" className="font-medium">
                  Använder du produkten i din content-produktion?
                </Label>
                <Switch
                  id="used_in_business"
                  checked={formData.used_in_business}
                  onCheckedChange={(checked) => updateField('used_in_business', checked)}
                />
              </div>
              <p className="text-sm text-muted-foreground">T.ex. som rekvisita, utrustning, eller i bakgrunden</p>
            </div>
          )}

          {/* Question 3: Private use */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="used_privately" className="font-medium">
                Använder du produkten privat?
              </Label>
              <Switch
                id="used_privately"
                checked={formData.used_privately}
                onCheckedChange={(checked) => updateField('used_privately', checked)}
              />
            </div>
            <p className="text-sm text-muted-foreground">T.ex. bär klockan dagligen, använder sminket privat</p>
          </div>
        </CardContent>
      </Card>

      {/* Classification Preview */}
      {classification && (
        <Card
          className={
            classification.taxable
              ? classification.deductibleAsExpense
                ? 'border-warning/50 bg-warning/5'
                : 'border-destructive/50 bg-destructive/5'
              : 'border-success/50 bg-success/5'
          }
        >
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              {classification.taxable ? (
                classification.deductibleAsExpense ? (
                  <AlertCircle className="h-5 w-5 text-warning" />
                ) : (
                  <XCircle className="h-5 w-5 text-destructive" />
                )
              ) : (
                <CheckCircle className="h-5 w-5 text-success" />
              )}
              Klassificering
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <Badge variant={classification.taxable ? 'destructive' : 'default'}>
                {classification.taxable ? 'Skattepliktig' : 'Skattefri'}
              </Badge>
              {classification.deductibleAsExpense && <Badge variant="outline">Avdragsgill</Badge>}
              <Badge variant="secondary">{getBookingTypeDisplayText(classification.bookingType)}</Badge>
            </div>

            <div className="text-sm">
              <p className="font-medium">Förklaring:</p>
              <p className="text-muted-foreground">{classification.reasoning}</p>
            </div>

            {classification.taxable && (
              <div className="text-sm border-t pt-4">
                <p className="font-medium">Skatteeffekt:</p>
                <p className="text-muted-foreground">
                  {isLightMode ? (
                    <>Gåvoskatt: ca {formatCurrency(classification.marketValue * 0.32)} ({Math.round(32)}% av marknadsvärde {formatCurrency(classification.marketValue)}). Skatten ingår inte i din paraplyföretags hantering.</>
                  ) : (
                    <>
                      Marknadsvärdet {formatCurrency(classification.marketValue)} läggs till din beskattningsbara inkomst.
                      {classification.deductibleAsExpense && ' Eftersom produkten endast används i verksamheten är den avdragsgill som kostnad.'}
                    </>
                  )}
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Submit */}
      <div className="flex justify-end gap-2">
        <Button type="submit" disabled={isLoading || !formData.brand_name || !formData.description}>
          {isLoading ? 'Sparar...' : initialData ? 'Uppdatera' : 'Spara gåva'}
        </Button>
      </div>
    </form>
  )
}
