'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { PageHeader } from '@/components/ui/page-header'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useToast } from '@/components/ui/use-toast'
import { Plus, Search, Building2 } from 'lucide-react'
import { AssetSummaryCards } from '@/components/assets/AssetSummaryCards'
import { AssetTable } from '@/components/assets/AssetTable'
import type { Asset, AssetCategory, AssetSummary, AssetStatus } from '@/types/fixed-assets'
import { ASSET_STATUS_LABELS } from '@/types/fixed-assets'

export default function AssetsPage() {
  const [assets, setAssets] = useState<Asset[]>([])
  const [categories, setCategories] = useState<AssetCategory[]>([])
  const [summary, setSummary] = useState<AssetSummary | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [summaryLoading, setSummaryLoading] = useState(true)
  const { toast } = useToast()

  // Filters
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [categoryFilter, setCategoryFilter] = useState<string>('all')

  const fetchData = useCallback(async () => {
    setIsLoading(true)

    const params = new URLSearchParams()
    if (statusFilter !== 'all') params.set('status', statusFilter)
    if (categoryFilter !== 'all') params.set('category_id', categoryFilter)
    if (searchTerm) params.set('search', searchTerm)

    const res = await fetch(`/api/assets?${params.toString()}`)
    const json = await res.json()

    if (json.error) {
      toast({
        title: 'Fel',
        description: 'Kunde inte hämta tillgångar',
        variant: 'destructive',
      })
    } else {
      setAssets(json.data || [])
    }
    setIsLoading(false)
  }, [statusFilter, categoryFilter, searchTerm, toast])

  const fetchSummary = useCallback(async () => {
    setSummaryLoading(true)
    const res = await fetch('/api/assets/summary')
    const json = await res.json()
    if (json.data) {
      setSummary(json.data)
    }
    setSummaryLoading(false)
  }, [])

  const fetchCategories = useCallback(async () => {
    const res = await fetch('/api/asset-categories')
    const json = await res.json()

    if (!json.data || json.data.length === 0) {
      // Seed categories
      await fetch('/api/asset-categories/seed', { method: 'POST' })
      const res2 = await fetch('/api/asset-categories')
      const json2 = await res2.json()
      setCategories(json2.data || [])
    } else {
      setCategories(json.data)
    }
  }, [])

  useEffect(() => {
    fetchCategories()
    fetchSummary()
  }, [fetchCategories, fetchSummary])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  return (
    <div className="space-y-6">
      <PageHeader
        title="Anläggningsregister"
        description="Förvalta anläggningstillgångar och avskrivningar"
        action={
          <div className="flex gap-2">
            <Link href="/assets/depreciation">
              <Button variant="outline">
                Avskrivningar
              </Button>
            </Link>
            <Link href="/assets/create">
              <Button>
                <Plus className="mr-2 h-4 w-4" />
                Ny tillgång
              </Button>
            </Link>
          </div>
        }
      />

      {/* Summary Cards */}
      <AssetSummaryCards summary={summary} isLoading={summaryLoading} />

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Sök på tillgångsnummer, namn eller serienummer..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>
        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="Alla kategorier" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Alla kategorier</SelectItem>
            {categories.map((cat) => (
              <SelectItem key={cat.id} value={cat.id}>
                {cat.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Alla statusar" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Alla statusar</SelectItem>
            {(Object.keys(ASSET_STATUS_LABELS) as AssetStatus[]).map((s) => (
              <SelectItem key={s} value={s}>
                {ASSET_STATUS_LABELS[s]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Asset Table */}
      {!isLoading && assets.length === 0 ? (
        <Card>
          <CardContent className="py-12">
            <div className="flex flex-col items-center justify-center">
              <Building2 className="h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium">Inga tillgångar</h3>
              <p className="text-muted-foreground text-center mt-1 max-w-sm">
                {searchTerm || statusFilter !== 'all' || categoryFilter !== 'all'
                  ? 'Inga tillgångar matchar filtren. Prova att ändra sökkriterier.'
                  : 'Du har inga anläggningstillgångar registrerade än. Skapa din första tillgång för att komma igång.'}
              </p>
              {!searchTerm && statusFilter === 'all' && categoryFilter === 'all' && (
                <Link href="/assets/create" className="mt-4">
                  <Button>
                    <Plus className="mr-2 h-4 w-4" />
                    Skapa första tillgången
                  </Button>
                </Link>
              )}
            </div>
          </CardContent>
        </Card>
      ) : (
        <AssetTable assets={assets} isLoading={isLoading} />
      )}
    </div>
  )
}
