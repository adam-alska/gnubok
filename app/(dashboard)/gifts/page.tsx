'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { useToast } from '@/components/ui/use-toast'
import GiftForm from '@/components/benefits/GiftForm'
import GiftList from '@/components/benefits/GiftList'
import { formatCurrency } from '@/lib/utils'
import { Plus, Gift, TrendingUp, CheckCircle, Receipt, AlertTriangle } from 'lucide-react'
import type { Gift as GiftType, GiftSummary, CreateGiftInput, EntityType } from '@/types'

export default function GiftsPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { toast } = useToast()

  // State
  const [gifts, setGifts] = useState<GiftType[]>([])
  const [summary, setSummary] = useState<GiftSummary | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [entityType, setEntityType] = useState<EntityType>('enskild_firma')

  const isLightMode = entityType === 'light'

  // Dialog state
  const [isFormOpen, setIsFormOpen] = useState(false)
  const [editingGift, setEditingGift] = useState<GiftType | null>(null)

  // Year filter
  const currentYear = new Date().getFullYear()
  const [selectedYear, setSelectedYear] = useState(
    searchParams.get('year') || currentYear.toString()
  )
  const years = Array.from({ length: 5 }, (_, i) => currentYear - i)

  // Fetch gifts and summary
  const fetchData = useCallback(async () => {
    setIsLoading(true)
    try {
      const [giftsRes, summaryRes, settingsRes] = await Promise.all([
        fetch(`/api/gifts?year=${selectedYear}`),
        fetch(`/api/gifts/summary?year=${selectedYear}`),
        fetch('/api/settings'),
      ])

      if (giftsRes.ok) {
        const giftsData = await giftsRes.json()
        setGifts(giftsData.data || [])
      }

      if (summaryRes.ok) {
        const summaryData = await summaryRes.json()
        setSummary(summaryData.data || null)
      }

      if (settingsRes.ok) {
        const settingsData = await settingsRes.json()
        if (settingsData.data?.entity_type) {
          setEntityType(settingsData.data.entity_type as EntityType)
        }
      }
    } catch (error) {
      console.error('Failed to fetch gifts:', error)
      toast({
        title: 'Fel',
        description: 'Kunde inte hämta gåvor',
        variant: 'destructive',
      })
    } finally {
      setIsLoading(false)
    }
  }, [selectedYear, toast])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  // Update URL when year changes
  const handleYearChange = (year: string) => {
    setSelectedYear(year)
    router.push(`/gifts?year=${year}`)
  }

  // Handle form submit (create or update)
  const handleSubmit = async (data: CreateGiftInput) => {
    setIsSubmitting(true)
    try {
      const url = editingGift ? `/api/gifts/${editingGift.id}` : '/api/gifts'
      const method = editingGift ? 'PUT' : 'POST'

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })

      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || 'Unknown error')
      }

      toast({
        title: editingGift ? 'Gåva uppdaterad' : 'Gåva sparad',
        description: `${data.description} från ${data.brand_name}`,
      })

      setIsFormOpen(false)
      setEditingGift(null)
      fetchData()
    } catch (error) {
      toast({
        title: 'Fel',
        description: error instanceof Error ? error.message : 'Kunde inte spara gåva',
        variant: 'destructive',
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  // Handle edit
  const handleEdit = (gift: GiftType) => {
    setEditingGift(gift)
    setIsFormOpen(true)
  }

  // Handle delete
  const handleDelete = async (id: string) => {
    setIsDeleting(true)
    try {
      const res = await fetch(`/api/gifts/${id}`, { method: 'DELETE' })

      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || 'Unknown error')
      }

      toast({
        title: 'Gåva borttagen',
      })

      fetchData()
    } catch (error) {
      toast({
        title: 'Fel',
        description: error instanceof Error ? error.message : 'Kunde inte ta bort gåva',
        variant: 'destructive',
      })
    } finally {
      setIsDeleting(false)
    }
  }

  // Handle dialog close
  const handleDialogClose = (open: boolean) => {
    if (!open) {
      setIsFormOpen(false)
      setEditingGift(null)
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Gåvor & Förmåner</h1>
          <p className="text-muted-foreground">
            Logga produkter och gåvor du fått för korrekt skattehantering
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={selectedYear} onValueChange={handleYearChange}>
            <SelectTrigger className="w-[120px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {years.map((year) => (
                <SelectItem key={year} value={year.toString()}>
                  {year}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button onClick={() => setIsFormOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Ny gåva
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <Card key={i}>
              <CardContent className="pt-6">
                <Skeleton className="h-4 w-24 mb-2" />
                <Skeleton className="h-8 w-32" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : summary ? (
        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-2 text-muted-foreground mb-1">
                <Gift className="h-4 w-4" />
                <span className="text-sm">Totalt antal</span>
              </div>
              <p className="text-2xl font-bold">{summary.total_count}</p>
              <p className="text-sm text-muted-foreground">{formatCurrency(summary.total_value)}</p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-2 text-destructive mb-1">
                <TrendingUp className="h-4 w-4" />
                <span className="text-sm">Skattepliktig</span>
              </div>
              <p className="text-2xl font-bold">{summary.taxable_count}</p>
              <p className="text-sm text-muted-foreground">
                {formatCurrency(summary.taxable_value)}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-2 text-success mb-1">
                <CheckCircle className="h-4 w-4" />
                <span className="text-sm">Skattefria</span>
              </div>
              <p className="text-2xl font-bold">{summary.tax_free_count}</p>
              <p className="text-sm text-muted-foreground">
                {formatCurrency(summary.tax_free_value)}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              {isLightMode ? (
                <>
                  <div className="flex items-center gap-2 text-warning mb-1">
                    <AlertTriangle className="h-4 w-4" />
                    <span className="text-sm">Virtuell skatteskuld</span>
                  </div>
                  <p className="text-2xl font-bold">
                    {formatCurrency(summary.taxable_value * 0.32)}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    ca 32% av skattepliktiga gåvor
                  </p>
                </>
              ) : (
                <>
                  <div className="flex items-center gap-2 text-primary mb-1">
                    <Receipt className="h-4 w-4" />
                    <span className="text-sm">Avdragsgilla</span>
                  </div>
                  <p className="text-2xl font-bold">{summary.deductible_count}</p>
                  <p className="text-sm text-muted-foreground">
                    {formatCurrency(summary.deductible_value)}
                  </p>
                </>
              )}
            </CardContent>
          </Card>
        </div>
      ) : null}

      {/* Info Card */}
      <Card className="bg-muted/50">
        <CardContent className="pt-6">
          <div className="flex gap-4">
            <Gift className="h-8 w-8 text-primary flex-shrink-0" />
            <div>
              <h3 className="font-medium mb-1">Varför logga gåvor?</h3>
              <p className="text-sm text-muted-foreground">
                Skatteverket granskar aktivt gåvor och förmåner som influencers får. Produkter du
                fått i utbyte mot att posta om dem är skattepliktiga. Genom att logga allt korrekt
                undviker du skattetillägg och kan dessutom göra avdrag för produkter som endast
                används i verksamheten.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Gift List */}
      {isLoading ? (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => (
            <Card key={i}>
              <CardContent className="pt-4">
                <Skeleton className="h-6 w-48 mb-2" />
                <Skeleton className="h-4 w-32" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <GiftList
          gifts={gifts}
          onEdit={handleEdit}
          onDelete={handleDelete}
          isDeleting={isDeleting}
        />
      )}

      {/* Form Dialog */}
      <Dialog open={isFormOpen} onOpenChange={handleDialogClose}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingGift ? 'Redigera gåva' : 'Lägg till ny gåva'}</DialogTitle>
            <DialogDescription>
              Fyll i information om produkten eller gåvan du fått
            </DialogDescription>
          </DialogHeader>
          <GiftForm
            onSubmit={handleSubmit}
            initialData={
              editingGift
                ? {
                    date: editingGift.date,
                    brand_name: editingGift.brand_name,
                    description: editingGift.description,
                    estimated_value: Number(editingGift.estimated_value),
                    has_motprestation: editingGift.has_motprestation,
                    used_in_business: editingGift.used_in_business,
                    used_privately: editingGift.used_privately,
                    is_simple_promo: editingGift.is_simple_promo,
                    returned: editingGift.returned,
                  }
                : undefined
            }
            isLoading={isSubmitting}
            isLightMode={isLightMode}
          />
        </DialogContent>
      </Dialog>
    </div>
  )
}
