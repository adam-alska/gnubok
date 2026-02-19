'use client'

import { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useToast } from '@/components/ui/use-toast'
import { formatCurrency } from '@/lib/utils'
import { Loader2, Calculator } from 'lucide-react'
import type { AssetCategory, DepreciationMethod } from '@/types/fixed-assets'
import {
  DEPRECIATION_METHOD_LABELS,
  DEPRECIATION_METHOD_DESCRIPTIONS,
} from '@/types/fixed-assets'

interface AssetFormProps {
  mode: 'create' | 'edit'
  initialData?: {
    name: string
    description: string
    category_id: string
    acquisition_date: string
    acquisition_cost: number
    residual_value: number
    useful_life_months: number
    depreciation_method: DepreciationMethod
    declining_balance_rate: number | null
    location: string
    serial_number: string
    supplier_name: string
    warranty_expires: string
    notes: string
  }
  assetId?: string
}

export function AssetForm({ mode, initialData, assetId }: AssetFormProps) {
  const router = useRouter()
  const supabase = createClient()
  const { toast } = useToast()

  const [categories, setCategories] = useState<AssetCategory[]>([])
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [categoriesLoading, setCategoriesLoading] = useState(true)

  // Form state
  const [name, setName] = useState(initialData?.name || '')
  const [description, setDescription] = useState(initialData?.description || '')
  const [categoryId, setCategoryId] = useState(initialData?.category_id || '')
  const [acquisitionDate, setAcquisitionDate] = useState(
    initialData?.acquisition_date || new Date().toISOString().split('T')[0]
  )
  const [acquisitionCost, setAcquisitionCost] = useState(
    initialData?.acquisition_cost?.toString() || ''
  )
  const [residualValue, setResidualValue] = useState(
    initialData?.residual_value?.toString() || '0'
  )
  const [usefulLifeMonths, setUsefulLifeMonths] = useState(
    initialData?.useful_life_months?.toString() || ''
  )
  const [depreciationMethod, setDepreciationMethod] = useState<DepreciationMethod>(
    initialData?.depreciation_method || 'straight_line'
  )
  const [decliningBalanceRate, setDecliningBalanceRate] = useState(
    initialData?.declining_balance_rate?.toString() || '20'
  )
  const [location, setLocation] = useState(initialData?.location || '')
  const [serialNumber, setSerialNumber] = useState(initialData?.serial_number || '')
  const [supplierName, setSupplierName] = useState(initialData?.supplier_name || '')
  const [warrantyExpires, setWarrantyExpires] = useState(initialData?.warranty_expires || '')
  const [notes, setNotes] = useState(initialData?.notes || '')

  useEffect(() => {
    fetchCategories()
  }, [])

  async function fetchCategories() {
    setCategoriesLoading(true)
    const res = await fetch('/api/asset-categories')
    const json = await res.json()

    if (json.data && json.data.length > 0) {
      setCategories(json.data)
    } else {
      // Seed default categories
      await fetch('/api/asset-categories/seed', { method: 'POST' })
      const res2 = await fetch('/api/asset-categories')
      const json2 = await res2.json()
      setCategories(json2.data || [])
    }
    setCategoriesLoading(false)
  }

  // When category changes, apply defaults
  function handleCategoryChange(catId: string) {
    setCategoryId(catId)
    const cat = categories.find((c) => c.id === catId)
    if (cat && mode === 'create') {
      if (cat.default_useful_life_months) {
        setUsefulLifeMonths(String(cat.default_useful_life_months))
      }
      if (cat.default_depreciation_method) {
        setDepreciationMethod(cat.default_depreciation_method as DepreciationMethod)
      }
    }
  }

  // Monthly depreciation preview
  const monthlyPreview = useMemo(() => {
    const cost = parseFloat(acquisitionCost) || 0
    const residual = parseFloat(residualValue) || 0
    const months = parseInt(usefulLifeMonths) || 0
    if (cost <= 0 || months <= 0) return null
    const depreciable = cost - residual
    if (depreciable <= 0) return null

    if (depreciationMethod === 'straight_line') {
      return depreciable / months
    } else if (depreciationMethod === 'declining_balance') {
      const rate = parseFloat(decliningBalanceRate) || 20
      return cost * (rate / 100 / 12)
    }
    return null
  }, [acquisitionCost, residualValue, usefulLifeMonths, depreciationMethod, decliningBalanceRate])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setIsSubmitting(true)

    const payload: Record<string, unknown> = {
      name,
      description: description || undefined,
      category_id: categoryId || undefined,
      acquisition_date: acquisitionDate,
      acquisition_cost: parseFloat(acquisitionCost),
      residual_value: parseFloat(residualValue) || 0,
      useful_life_months: parseInt(usefulLifeMonths),
      depreciation_method: depreciationMethod,
      declining_balance_rate:
        depreciationMethod === 'declining_balance'
          ? parseFloat(decliningBalanceRate) || 20
          : undefined,
      location: location || undefined,
      serial_number: serialNumber || undefined,
      supplier_name: supplierName || undefined,
      warranty_expires: warrantyExpires || undefined,
      notes: notes || undefined,
    }

    try {
      const url = mode === 'edit' && assetId ? `/api/assets/${assetId}` : '/api/assets'
      const method = mode === 'edit' ? 'PATCH' : 'POST'

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      const json = await res.json()

      if (!res.ok) {
        throw new Error(json.error || 'Ett fel uppstod')
      }

      toast({
        title: mode === 'create' ? 'Tillgang skapad' : 'Tillgang uppdaterad',
        description: `${name} har ${mode === 'create' ? 'lagts till' : 'uppdaterats'} i anlaggningsregistret`,
      })

      if (mode === 'create' && json.data?.id) {
        router.push(`/assets/${json.data.id}`)
      } else {
        router.push('/assets')
      }
    } catch (err) {
      toast({
        title: 'Fel',
        description: err instanceof Error ? err.message : 'Kunde inte spara tillgang',
        variant: 'destructive',
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Basic Information */}
      <Card>
        <CardHeader>
          <CardTitle>Grunduppgifter</CardTitle>
          <CardDescription>
            Namn, kategori och beskrivning av tillgangen
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="name">Namn *</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="T.ex. MacBook Pro 16"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="category">Kategori</Label>
              <Select value={categoryId} onValueChange={handleCategoryChange}>
                <SelectTrigger>
                  <SelectValue placeholder={categoriesLoading ? 'Laddar...' : 'Välj kategori'} />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((cat) => (
                    <SelectItem key={cat.id} value={cat.id}>
                      {cat.name} ({cat.asset_account})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="description">Beskrivning</Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Valfri beskrivning av tillgangen..."
            />
          </div>
        </CardContent>
      </Card>

      {/* Financial Details */}
      <Card>
        <CardHeader>
          <CardTitle>Ekonomiska uppgifter</CardTitle>
          <CardDescription>Anskaffningsvarde, restvarde och nyttjandeperiod</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            {mode === 'create' && (
              <div className="space-y-2">
                <Label htmlFor="acquisition_date">Anskaffningsdatum *</Label>
                <Input
                  id="acquisition_date"
                  type="date"
                  value={acquisitionDate}
                  onChange={(e) => setAcquisitionDate(e.target.value)}
                  required
                />
              </div>
            )}
            {mode === 'create' && (
              <div className="space-y-2">
                <Label htmlFor="acquisition_cost">Anskaffningsvarde (SEK) *</Label>
                <Input
                  id="acquisition_cost"
                  type="number"
                  step="0.01"
                  min="0"
                  value={acquisitionCost}
                  onChange={(e) => setAcquisitionCost(e.target.value)}
                  placeholder="0.00"
                  required
                />
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="residual_value">Restvarde (SEK)</Label>
              <Input
                id="residual_value"
                type="number"
                step="0.01"
                min="0"
                value={residualValue}
                onChange={(e) => setResidualValue(e.target.value)}
                placeholder="0.00"
              />
              <p className="text-xs text-muted-foreground">
                Beraknat varde vid slutet av nyttjandeperioden
              </p>
            </div>
            {mode === 'create' && (
              <div className="space-y-2">
                <Label htmlFor="useful_life_months">Nyttjandeperiod (manader) *</Label>
                <Input
                  id="useful_life_months"
                  type="number"
                  min="1"
                  value={usefulLifeMonths}
                  onChange={(e) => setUsefulLifeMonths(e.target.value)}
                  placeholder="60"
                  required
                />
                {usefulLifeMonths && parseInt(usefulLifeMonths) > 0 && (
                  <p className="text-xs text-muted-foreground">
                    = {Math.round((parseInt(usefulLifeMonths) / 12) * 10) / 10} ar
                  </p>
                )}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Depreciation Method */}
      {mode === 'create' && (
        <Card>
          <CardHeader>
            <CardTitle>Avskrivningsmetod</CardTitle>
            <CardDescription>Hur tillgangen ska skrivas av over tid</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Metod</Label>
              <Select
                value={depreciationMethod}
                onValueChange={(v) => setDepreciationMethod(v as DepreciationMethod)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(DEPRECIATION_METHOD_LABELS) as DepreciationMethod[]).map((m) => (
                    <SelectItem key={m} value={m}>
                      {DEPRECIATION_METHOD_LABELS[m]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {DEPRECIATION_METHOD_DESCRIPTIONS[depreciationMethod]}
              </p>
            </div>

            {depreciationMethod === 'declining_balance' && (
              <div className="space-y-2">
                <Label htmlFor="declining_rate">Arlig avskrivningssats (%)</Label>
                <Input
                  id="declining_rate"
                  type="number"
                  min="1"
                  max="100"
                  value={decliningBalanceRate}
                  onChange={(e) => setDecliningBalanceRate(e.target.value)}
                  placeholder="20"
                />
                <p className="text-xs text-muted-foreground">
                  Typiskt 20-30% for degressiv avskrivning
                </p>
              </div>
            )}

            {/* Preview */}
            {monthlyPreview !== null && monthlyPreview > 0 && (
              <div className="rounded-lg bg-muted/50 p-4 flex items-center gap-3">
                <Calculator className="h-5 w-5 text-primary" />
                <div>
                  <p className="text-sm font-medium">
                    Beraknad manatlig avskrivning: {formatCurrency(monthlyPreview)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {depreciationMethod === 'declining_balance'
                      ? 'Forsta manadens avskrivning (sjunker over tid)'
                      : 'Samma belopp varje manad'}
                  </p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Additional Details */}
      <Card>
        <CardHeader>
          <CardTitle>Ovriga uppgifter</CardTitle>
          <CardDescription>Valfri tillaggsinformation</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="location">Placering</Label>
              <Input
                id="location"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="T.ex. Kontor Stockholm"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="serial_number">Serienummer</Label>
              <Input
                id="serial_number"
                value={serialNumber}
                onChange={(e) => setSerialNumber(e.target.value)}
                placeholder="T.ex. SN-12345678"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="supplier_name">Leverantor</Label>
              <Input
                id="supplier_name"
                value={supplierName}
                onChange={(e) => setSupplierName(e.target.value)}
                placeholder="T.ex. Apple Sweden AB"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="warranty_expires">Garanti utgar</Label>
              <Input
                id="warranty_expires"
                type="date"
                value={warrantyExpires}
                onChange={(e) => setWarrantyExpires(e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="notes">Anteckningar</Label>
            <Textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Valfria anteckningar..."
            />
          </div>
        </CardContent>
      </Card>

      {/* Submit */}
      <div className="flex justify-end gap-3">
        <Button
          type="button"
          variant="outline"
          onClick={() => router.push('/assets')}
        >
          Avbryt
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {mode === 'create' ? 'Skapa tillgang' : 'Spara andringar'}
        </Button>
      </div>
    </form>
  )
}
