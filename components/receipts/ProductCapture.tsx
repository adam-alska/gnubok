'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import {
  X,
  Camera,
  Check,
  Loader2,
  Gift,
  Building,
  User,
  HelpCircle,
  ArrowRight,
} from 'lucide-react'
import { formatCurrency } from '@/lib/utils'
import ReceiptCamera from './ReceiptCamera'
import type { GiftClassification, Gift as GiftType } from '@/types'

interface ProductCaptureProps {
  onComplete: (gift: GiftType) => void
  onCancel: () => void
}

type Step = 'capture' | 'details' | 'classification' | 'result'

export default function ProductCapture({ onComplete, onCancel }: ProductCaptureProps) {
  const [step, setStep] = useState<Step>('capture')
  const [isProcessing, setIsProcessing] = useState(false)
  const [isEstimating, setIsEstimating] = useState(false)

  // Image data
  const [imageData, setImageData] = useState<string | null>(null)
  const [mimeType, setMimeType] = useState<string>('image/jpeg')

  // Product details
  const [brandName, setBrandName] = useState('')
  const [description, setDescription] = useState('')
  const [estimatedValue, setEstimatedValue] = useState<number | null>(null)
  const [aiEstimate, setAiEstimate] = useState<{ value: number; confidence: number } | null>(null)

  // Classification inputs
  const [hasMotprestation, setHasMotprestation] = useState(false)
  const [usedInBusiness, setUsedInBusiness] = useState(false)
  const [usedPrivately, setUsedPrivately] = useState(false)
  const [isSimplePromo, setIsSimplePromo] = useState(false)

  // Result
  const [classification, setClassification] = useState<GiftClassification | null>(null)
  const [createdGift, setCreatedGift] = useState<GiftType | null>(null)

  // Handle image capture
  const handleCapture = async (base64Data: string, type: string) => {
    setImageData(base64Data)
    setMimeType(type)
    setStep('details')

    // Call AI estimate in the background (non-blocking)
    setIsEstimating(true)
    try {
      const byteCharacters = atob(base64Data)
      const byteNumbers = new Array(byteCharacters.length)
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i)
      }
      const byteArray = new Uint8Array(byteNumbers)
      const blob = new Blob([byteArray], { type })

      const formData = new FormData()
      formData.append('image', blob, 'product.jpg')

      const response = await fetch('/api/gifts/estimate', {
        method: 'POST',
        body: formData,
      })

      if (response.ok) {
        const { data } = await response.json()
        if (data) {
          setAiEstimate({ value: data.estimatedValue, confidence: data.confidence })
          // Only pre-fill empty fields
          setEstimatedValue((prev) => prev ?? data.estimatedValue)
          setDescription((prev) => (prev ? prev : data.description || ''))
          setBrandName((prev) => (prev ? prev : data.brand || ''))
        }
      }
    } catch (error) {
      // Silently continue — user can still enter values manually
      console.error('AI estimation failed:', error)
    } finally {
      setIsEstimating(false)
    }
  }

  // Handle details submission
  const handleDetailsSubmit = () => {
    if (!estimatedValue || estimatedValue <= 0) {
      alert('Ange ett uppskattat värde')
      return
    }
    if (!description.trim()) {
      alert('Ange en beskrivning av produkten')
      return
    }
    setStep('classification')
  }

  // Handle classification submission
  const handleClassificationSubmit = async () => {
    if (!imageData || !estimatedValue) return

    setIsProcessing(true)
    try {
      const formData = new FormData()

      // Convert base64 to blob
      const byteCharacters = atob(imageData)
      const byteNumbers = new Array(byteCharacters.length)
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i)
      }
      const byteArray = new Uint8Array(byteNumbers)
      const blob = new Blob([byteArray], { type: mimeType })
      formData.append('image', blob, 'product.jpg')

      formData.append('estimated_value', estimatedValue.toString())
      formData.append('brand_name', brandName || 'Okänt varumärke')
      formData.append('description', description)
      formData.append('has_motprestation', hasMotprestation.toString())
      formData.append('used_in_business', usedInBusiness.toString())
      formData.append('used_privately', usedPrivately.toString())
      formData.append('is_simple_promo', isSimplePromo.toString())

      const response = await fetch('/api/receipts/product', {
        method: 'POST',
        body: formData,
      })

      const data = await response.json()

      if (response.ok && data.data) {
        setClassification(data.data.classification)
        setCreatedGift(data.data.gift)
        setStep('result')
      } else {
        alert(data.error || 'Kunde inte registrera produkten')
      }
    } catch (error) {
      console.error('Submit error:', error)
      alert('Något gick fel. Försök igen.')
    } finally {
      setIsProcessing(false)
    }
  }

  // Handle completion
  const handleComplete = () => {
    if (createdGift) {
      onComplete(createdGift)
    }
  }

  // Render camera step
  if (step === 'capture') {
    return <ReceiptCamera onCapture={handleCapture} onClose={onCancel} />
  }

  // Render details step
  if (step === 'details') {
    return (
      <div className="fixed inset-0 bg-background z-50 flex flex-col">
        <div className="flex items-center justify-between p-4 border-b">
          <Button variant="ghost" size="icon" onClick={onCancel}>
            <X className="h-5 w-5" />
          </Button>
          <h1 className="font-semibold">Produktdetaljer</h1>
          <div className="w-10" />
        </div>

        <div className="flex-1 overflow-auto p-4 space-y-4">
          {/* Image preview */}
          {imageData && (
            <div className="relative">
              <img
                src={`data:${mimeType};base64,${imageData}`}
                alt="Product"
                className="w-full max-h-48 object-contain rounded-lg bg-muted"
              />
              <Button
                variant="secondary"
                size="sm"
                className="absolute bottom-2 right-2"
                onClick={() => setStep('capture')}
              >
                <Camera className="mr-2 h-4 w-4" />
                Ta om
              </Button>
            </div>
          )}

          {/* AI estimation indicator */}
          {isEstimating && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-muted">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span className="text-sm text-muted-foreground">AI analyserar produkten...</span>
            </div>
          )}

          {/* Product details form */}
          <div className="space-y-4">
            <div>
              <Label htmlFor="brand">Varumärke (valfritt)</Label>
              <Input
                id="brand"
                value={brandName}
                onChange={(e) => setBrandName(e.target.value)}
                placeholder="T.ex. Apple, Nike, Samsung..."
              />
            </div>

            <div>
              <Label htmlFor="description">Beskrivning *</Label>
              <Textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Vad är det för produkt?"
                rows={2}
              />
            </div>

            <div>
              <Label htmlFor="value">Uppskattat marknadsvärde (SEK) *</Label>
              <Input
                id="value"
                type="number"
                min={0}
                value={estimatedValue || ''}
                onChange={(e) => setEstimatedValue(parseFloat(e.target.value) || null)}
                placeholder="0"
              />
              {aiEstimate && (
                <div className="flex items-center gap-2 mt-1">
                  <p className="text-xs text-muted-foreground">
                    AI-uppskattning: {formatCurrency(aiEstimate.value, 'SEK')}
                  </p>
                  <Badge variant="outline" className="text-xs">
                    {Math.round(aiEstimate.confidence * 100)}% säkerhet
                  </Badge>
                  {estimatedValue !== aiEstimate.value && (
                    <Button
                      variant="link"
                      size="sm"
                      className="h-auto p-0 text-xs"
                      onClick={() => setEstimatedValue(aiEstimate.value)}
                    >
                      Använd AI-uppskattning
                    </Button>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="p-4 border-t">
          <Button className="w-full" onClick={handleDetailsSubmit} disabled={isProcessing}>
            Fortsätt
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </div>
      </div>
    )
  }

  // Render classification step
  if (step === 'classification') {
    return (
      <div className="fixed inset-0 bg-background z-50 flex flex-col">
        <div className="flex items-center justify-between p-4 border-b">
          <Button variant="ghost" size="icon" onClick={() => setStep('details')}>
            <X className="h-5 w-5" />
          </Button>
          <h1 className="font-semibold">Klassificera förmån</h1>
          <div className="w-10" />
        </div>

        <div className="flex-1 overflow-auto p-4 space-y-4">
          {/* Product summary */}
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center gap-3">
                <Gift className="h-8 w-8 text-muted-foreground" />
                <div>
                  <p className="font-medium">{description}</p>
                  <p className="text-lg font-bold">{formatCurrency(estimatedValue || 0, 'SEK')}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Classification questions */}
          <div className="space-y-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <HelpCircle className="h-4 w-4" />
                  Frågor för klassificering
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Motprestation */}
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>Krävdes motprestation?</Label>
                    <p className="text-xs text-muted-foreground">
                      T.ex. inlägg, recension, omnämnande
                    </p>
                  </div>
                  <Switch
                    checked={hasMotprestation}
                    onCheckedChange={setHasMotprestation}
                  />
                </div>

                {/* Used in business */}
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>Används i verksamheten?</Label>
                    <p className="text-xs text-muted-foreground">
                      Som rekvisita, utrustning, material
                    </p>
                  </div>
                  <Switch
                    checked={usedInBusiness}
                    onCheckedChange={setUsedInBusiness}
                  />
                </div>

                {/* Used privately */}
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>Används privat?</Label>
                    <p className="text-xs text-muted-foreground">
                      För eget bruk, hemma, fritid
                    </p>
                  </div>
                  <Switch
                    checked={usedPrivately}
                    onCheckedChange={setUsedPrivately}
                  />
                </div>

                {/* Simple promo */}
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>Enkel reklamprodukt?</Label>
                    <p className="text-xs text-muted-foreground">
                      Penna, mugg, t-shirt med logga
                    </p>
                  </div>
                  <Switch
                    checked={isSimplePromo}
                    onCheckedChange={setIsSimplePromo}
                  />
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        <div className="p-4 border-t">
          <Button className="w-full" onClick={handleClassificationSubmit} disabled={isProcessing}>
            {isProcessing ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Klassificerar...
              </>
            ) : (
              <>
                <Check className="mr-2 h-4 w-4" />
                Klassificera
              </>
            )}
          </Button>
        </div>
      </div>
    )
  }

  // Render result step
  if (step === 'result' && classification) {
    return (
      <div className="fixed inset-0 bg-background z-50 flex flex-col">
        <div className="flex items-center justify-between p-4 border-b">
          <div className="w-10" />
          <h1 className="font-semibold">Resultat</h1>
          <div className="w-10" />
        </div>

        <div className="flex-1 overflow-auto p-4 space-y-4">
          {/* Result card */}
          <Card className={classification.taxable ? 'border-orange-500' : 'border-green-500'}>
            <CardContent className="pt-6 text-center">
              <div
                className={`h-16 w-16 rounded-full flex items-center justify-center mx-auto mb-4 ${
                  classification.taxable ? 'bg-orange-100' : 'bg-green-100'
                }`}
              >
                {classification.taxable ? (
                  <User className="h-8 w-8 text-orange-600" />
                ) : (
                  <Building className="h-8 w-8 text-green-600" />
                )}
              </div>

              <h2 className="text-xl font-bold mb-2">
                {classification.taxable ? 'Skattepliktig förmån' : 'Skattefri förmån'}
              </h2>

              <Badge variant={classification.taxable ? 'destructive' : 'default'} className="mb-4">
                {formatCurrency(classification.marketValue, 'SEK')}
              </Badge>

              <p className="text-sm text-muted-foreground">{classification.reasoning}</p>

              {classification.deductibleAsExpense && (
                <div className="mt-4 p-3 rounded-lg bg-green-50 dark:bg-green-950/20 text-sm">
                  <p className="font-medium text-green-700 dark:text-green-300">
                    Avdragsgill som företagskostnad
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Booking type info */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Bokföringstyp</CardTitle>
            </CardHeader>
            <CardContent>
              <Badge variant="outline">{classification.bookingType}</Badge>
              <p className="text-xs text-muted-foreground mt-2">
                {classification.bookingType === 'income' &&
                  'Bokförs som intäkt (förmånsvärde)'}
                {classification.bookingType === 'income_and_expense' &&
                  'Bokförs som både intäkt och kostnad'}
                {classification.bookingType === 'tax_free' &&
                  'Ingen bokföringsåtgärd krävs'}
              </p>
            </CardContent>
          </Card>
        </div>

        <div className="p-4 border-t">
          <Button className="w-full" onClick={handleComplete}>
            <Check className="mr-2 h-4 w-4" />
            Klar
          </Button>
        </div>
      </div>
    )
  }

  return null
}
