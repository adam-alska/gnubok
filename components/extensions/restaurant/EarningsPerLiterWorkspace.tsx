'use client'

import { useState, useMemo } from 'react'
import type { WorkspaceComponentProps } from '@/lib/extensions/workspace-registry'
import { useAccountTotals } from '@/lib/extensions/use-account-totals'
import { useExtensionData } from '@/lib/extensions/use-extension-data'
import KPICard from '@/components/extensions/shared/KPICard'
import DateRangeFilter from '@/components/extensions/shared/DateRangeFilter'
import MonthlyTrendTable from '@/components/extensions/shared/MonthlyTrendTable'
import DataEntryForm from '@/components/extensions/shared/DataEntryForm'
import ExtensionLoadingSkeleton from '@/components/extensions/shared/ExtensionLoadingSkeleton'
import ConfirmDeleteDialog from '@/components/extensions/shared/ConfirmDeleteDialog'
import EditEntryDialog from '@/components/extensions/shared/EditEntryDialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { Trash2, Pencil, ArrowUp, ArrowDown, Minus, Settings, Plus, X } from 'lucide-react'

const DEFAULT_CATEGORIES = ['Ol', 'Vin', 'Sprit']

const DEFAULT_PRICING: Record<string, number> = {
  Ol: 80,
  Vin: 120,
  Sprit: 200,
}

interface LiterEntry {
  id: string
  date: string
  category: string
  liters: number
}

interface Pricing {
  [category: string]: number
}

function DeltaIndicator({ current, previous }: { current: number; previous: number }) {
  if (previous === 0) return <Minus className="h-3.5 w-3.5 text-muted-foreground inline" />
  const delta = Math.round(((current - previous) / previous) * 10000) / 100
  if (delta > 0) {
    return (
      <span className="inline-flex items-center gap-0.5 text-xs text-green-600">
        <ArrowUp className="h-3 w-3" />+{delta}%
      </span>
    )
  }
  if (delta < 0) {
    return (
      <span className="inline-flex items-center gap-0.5 text-xs text-red-600">
        <ArrowDown className="h-3 w-3" />{delta}%
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-0.5 text-xs text-muted-foreground">
      <Minus className="h-3 w-3" />0%
    </span>
  )
}

export default function EarningsPerLiterWorkspace({}: WorkspaceComponentProps) {
  const now = new Date()
  const [dateRange, setDateRange] = useState({
    start: new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10),
    end: new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10),
  })

  const { data, save, remove, refresh, isLoading: dataLoading } = useExtensionData('restaurant', 'earnings-per-liter')

  // Settings: categories
  const settings = data.find(d => d.key === 'settings')?.value as { categories?: string[] } | undefined
  const categories = settings?.categories ?? DEFAULT_CATEGORIES

  // Pricing per category (kr per liter)
  const pricingData = data.find(d => d.key === 'pricing')?.value as Pricing | undefined
  const pricing: Pricing = useMemo(() => {
    const base: Pricing = {}
    for (const cat of categories) {
      base[cat] = pricingData?.[cat] ?? DEFAULT_PRICING[cat] ?? 100
    }
    return base
  }, [categories, pricingData])

  // Entries filtered by date range
  const entries: LiterEntry[] = useMemo(() =>
    data.filter(d => d.key.startsWith('entry:'))
      .map(d => ({
        id: d.key,
        ...(d.value as { date: string; category: string; liters: number }),
      }))
      .filter(e => e.date >= dateRange.start && e.date <= dateRange.end)
      .sort((a, b) => b.date.localeCompare(a.date))
  , [data, dateRange])

  // Previous period entries for comparison
  const prevPeriodEntries: LiterEntry[] = useMemo(() => {
    const startDate = new Date(dateRange.start)
    const endDate = new Date(dateRange.end)
    const durationMs = endDate.getTime() - startDate.getTime()
    const prevStart = new Date(startDate.getTime() - durationMs - 86400000)
    const prevEnd = new Date(startDate.getTime() - 86400000)
    const prevStartStr = prevStart.toISOString().slice(0, 10)
    const prevEndStr = prevEnd.toISOString().slice(0, 10)
    return data.filter(d => d.key.startsWith('entry:'))
      .map(d => ({
        id: d.key,
        ...(d.value as { date: string; category: string; liters: number }),
      }))
      .filter(e => e.date >= prevStartStr && e.date <= prevEndStr)
  }, [data, dateRange])

  // Form state - single entry
  const [entryDate, setEntryDate] = useState(now.toISOString().slice(0, 10))
  const [category, setCategory] = useState(categories[0])
  const [liters, setLiters] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Batch entry mode
  const [batchMode, setBatchMode] = useState(false)
  const [batchDate, setBatchDate] = useState(now.toISOString().slice(0, 10))
  const [batchLiters, setBatchLiters] = useState<Record<string, string>>({})
  const [isBatchSubmitting, setIsBatchSubmitting] = useState(false)

  // Edit state
  const [editingEntry, setEditingEntry] = useState<LiterEntry | null>(null)
  const [editDate, setEditDate] = useState('')
  const [editCategory, setEditCategory] = useState('')
  const [editLiters, setEditLiters] = useState('')
  const [isSavingEdit, setIsSavingEdit] = useState(false)

  // Delete confirmation state
  const [deletingEntry, setDeletingEntry] = useState<LiterEntry | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)

  // Category management state
  const [newCategoryName, setNewCategoryName] = useState('')
  const [editingPricing, setEditingPricing] = useState(false)
  const [pricingInputs, setPricingInputs] = useState<Record<string, string>>({})

  // Alcohol revenue from bookkeeping (accounts 3000-3999)
  const { totalCredit: alcoholRevenue, isLoading: revenueLoading } = useAccountTotals({
    from: '3000', to: '3999',
    dateFrom: dateRange.start, dateTo: dateRange.end,
  })

  // Calculations
  const totalLiters = entries.reduce((s, e) => s + e.liters, 0)
  const earningsPerLiter = totalLiters > 0
    ? Math.round((alcoholRevenue / totalLiters) * 100) / 100
    : 0

  // Estimated revenue based on pricing
  const estimatedRevenue = useMemo(() => {
    let total = 0
    for (const e of entries) {
      const price = pricing[e.category] ?? 100
      total += e.liters * price
    }
    return Math.round(total * 100) / 100
  }, [entries, pricing])

  // Previous period calculations
  const prevTotalLiters = prevPeriodEntries.reduce((s, e) => s + e.liters, 0)
  const prevEstimatedRevenue = useMemo(() => {
    let total = 0
    for (const e of prevPeriodEntries) {
      const price = pricing[e.category] ?? 100
      total += e.liters * price
    }
    return Math.round(total * 100) / 100
  }, [prevPeriodEntries, pricing])
  const prevEarningsPerLiter = prevTotalLiters > 0
    ? Math.round((prevEstimatedRevenue / prevTotalLiters) * 100) / 100
    : 0

  // Category breakdown with per-category revenue = liters x avg price
  const categoryBreakdown = useMemo(() => {
    const map = new Map<string, number>()
    for (const e of entries) {
      map.set(e.category, (map.get(e.category) ?? 0) + e.liters)
    }
    return categories.map(cat => {
      const catLiters = map.get(cat) ?? 0
      const avgPrice = pricing[cat] ?? 100
      const estimatedRev = Math.round(catLiters * avgPrice * 100) / 100
      const eplCategory = catLiters > 0
        ? Math.round((estimatedRev / catLiters) * 100) / 100
        : 0
      return {
        category: cat,
        liters: catLiters,
        avgPrice,
        estimatedRevenue: estimatedRev,
        earningsPerLiter: eplCategory,
      }
    })
  }, [entries, categories, pricing])

  // Monthly trend
  const monthlyTrend = useMemo(() => {
    const map = new Map<string, number>()
    for (const e of entries) {
      const month = e.date.slice(0, 7)
      map.set(month, (map.get(month) ?? 0) + e.liters)
    }
    return Array.from(map.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, liters]) => ({ month, value: liters }))
  }, [entries])

  // --- Handlers ---

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const val = parseFloat(liters)
    if (isNaN(val) || val <= 0) return
    setIsSubmitting(true)
    const id = crypto.randomUUID()
    await save(`entry:${id}`, { date: entryDate, category, liters: val })
    setLiters('')
    await refresh()
    setIsSubmitting(false)
  }

  const handleBatchSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsBatchSubmitting(true)
    for (const cat of categories) {
      const val = parseFloat(batchLiters[cat] ?? '')
      if (!isNaN(val) && val > 0) {
        const id = crypto.randomUUID()
        await save(`entry:${id}`, { date: batchDate, category: cat, liters: val })
      }
    }
    setBatchLiters({})
    await refresh()
    setIsBatchSubmitting(false)
  }

  const openEdit = (entry: LiterEntry) => {
    setEditingEntry(entry)
    setEditDate(entry.date)
    setEditCategory(entry.category)
    setEditLiters(String(entry.liters))
  }

  const handleSaveEdit = async () => {
    if (!editingEntry) return
    const val = parseFloat(editLiters)
    if (isNaN(val) || val <= 0) return
    setIsSavingEdit(true)
    await save(editingEntry.id, { date: editDate, category: editCategory, liters: val })
    await refresh()
    setIsSavingEdit(false)
    setEditingEntry(null)
  }

  const handleConfirmDelete = async () => {
    if (!deletingEntry) return
    setIsDeleting(true)
    await remove(deletingEntry.id)
    setIsDeleting(false)
    setDeletingEntry(null)
  }

  // Category management
  const handleAddCategory = async () => {
    const name = newCategoryName.trim()
    if (!name || categories.includes(name)) return
    const updated = [...categories, name]
    await save('settings', { ...settings, categories: updated })
    setNewCategoryName('')
    await refresh()
  }

  const handleRemoveCategory = async (cat: string) => {
    const updated = categories.filter(c => c !== cat)
    if (updated.length === 0) return
    await save('settings', { ...settings, categories: updated })
    // Update pricing to remove the category
    if (pricingData) {
      const updatedPricing = { ...pricingData }
      delete updatedPricing[cat]
      await save('pricing', updatedPricing)
    }
    await refresh()
  }

  const handleRenameCategory = async (oldName: string, newName: string) => {
    if (!newName.trim() || oldName === newName.trim()) return
    const trimmed = newName.trim()
    const updated = categories.map(c => c === oldName ? trimmed : c)
    await save('settings', { ...settings, categories: updated })
    // Update pricing key
    if (pricingData) {
      const updatedPricing = { ...pricingData }
      if (updatedPricing[oldName] !== undefined) {
        updatedPricing[trimmed] = updatedPricing[oldName]
        delete updatedPricing[oldName]
      }
      await save('pricing', updatedPricing)
    }
    await refresh()
  }

  const handleSavePricing = async () => {
    const updated: Pricing = {}
    for (const cat of categories) {
      const val = parseFloat(pricingInputs[cat] ?? '')
      updated[cat] = !isNaN(val) && val > 0 ? Math.round(val * 100) / 100 : (pricing[cat] ?? 100)
    }
    await save('pricing', updated)
    setEditingPricing(false)
    await refresh()
  }

  const startEditPricing = () => {
    const inputs: Record<string, string> = {}
    for (const cat of categories) {
      inputs[cat] = String(pricing[cat] ?? 100)
    }
    setPricingInputs(inputs)
    setEditingPricing(true)
  }

  if (dataLoading || revenueLoading) return <ExtensionLoadingSkeleton />

  return (
    <div className="space-y-6">
      <Tabs defaultValue="register">
        <TabsList>
          <TabsTrigger value="register">Registrera</TabsTrigger>
          <TabsTrigger value="overview">Oversikt</TabsTrigger>
          <TabsTrigger value="settings">Installningar</TabsTrigger>
        </TabsList>

        {/* ---- REGISTER TAB ---- */}
        <TabsContent value="register" className="space-y-6 mt-4">
          <DateRangeFilter onRangeChange={(start, end) => setDateRange({ start, end })} />

          {/* KPI row */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <KPICard
              label="Intakt per liter"
              value={earningsPerLiter.toLocaleString('sv-SE')}
              suffix="kr/l"
              trend={prevEarningsPerLiter > 0 ? {
                value: Math.round(((earningsPerLiter - prevEarningsPerLiter) / prevEarningsPerLiter) * 10000) / 100,
                label: 'mot foreg. period',
              } : undefined}
            />
            <KPICard
              label="Totalt liter"
              value={(Math.round(totalLiters * 100) / 100).toLocaleString('sv-SE')}
              suffix="l"
              trend={prevTotalLiters > 0 ? {
                value: Math.round(((totalLiters - prevTotalLiters) / prevTotalLiters) * 10000) / 100,
                label: 'mot foreg. period',
              } : undefined}
            />
            <KPICard
              label="Uppskattad intakt"
              value={estimatedRevenue.toLocaleString('sv-SE')}
              suffix="kr"
            />
            <KPICard
              label="Bokford intakt"
              value={alcoholRevenue.toLocaleString('sv-SE')}
              suffix="kr"
            />
          </div>

          {/* Revenue comparison */}
          {estimatedRevenue > 0 && alcoholRevenue > 0 && (
            <div className="rounded-xl border p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">Uppskattad vs bokford intakt</p>
                  <p className="text-xs text-muted-foreground">
                    Differens baserat pa snittkr/liter per kategori
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-lg font-semibold tabular-nums">
                    {(Math.round((estimatedRevenue - alcoholRevenue) * 100) / 100).toLocaleString('sv-SE')} kr
                  </p>
                  <DeltaIndicator current={estimatedRevenue} previous={alcoholRevenue} />
                </div>
              </div>
            </div>
          )}

          {/* Single entry form / batch mode toggle */}
          <div className="flex items-center gap-2 justify-end">
            <Button
              variant={batchMode ? 'default' : 'outline'}
              size="sm"
              onClick={() => setBatchMode(!batchMode)}
            >
              {batchMode ? 'Enkel registrering' : 'Registrera flera'}
            </Button>
          </div>

          {batchMode ? (
            <DataEntryForm
              title="Registrera flera kategorier"
              onSubmit={handleBatchSubmit}
              submitLabel="Registrera alla"
              isSubmitting={isBatchSubmitting}
            >
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="epl-batch-date">Datum</Label>
                  <Input
                    id="epl-batch-date"
                    type="date"
                    value={batchDate}
                    onChange={e => setBatchDate(e.target.value)}
                    className="max-w-xs"
                  />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {categories.map(cat => (
                    <div key={cat} className="space-y-2">
                      <Label htmlFor={`epl-batch-${cat}`}>
                        {cat} (liter)
                      </Label>
                      <Input
                        id={`epl-batch-${cat}`}
                        type="number"
                        step="0.01"
                        min="0"
                        placeholder="0.00"
                        value={batchLiters[cat] ?? ''}
                        onChange={e => setBatchLiters(prev => ({ ...prev, [cat]: e.target.value }))}
                      />
                    </div>
                  ))}
                </div>
              </div>
            </DataEntryForm>
          ) : (
            <DataEntryForm
              title="Registrera literforbrukning"
              onSubmit={handleSubmit}
              submitLabel="Registrera"
              isSubmitting={isSubmitting}
            >
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="epl-date">Datum</Label>
                  <Input id="epl-date" type="date" value={entryDate} onChange={e => setEntryDate(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="epl-category">Kategori</Label>
                  <Select value={category} onValueChange={setCategory}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {categories.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="epl-liters">Antal liter</Label>
                  <Input id="epl-liters" type="number" step="0.01" min="0" placeholder="0.00" value={liters} onChange={e => setLiters(e.target.value)} />
                </div>
              </div>
            </DataEntryForm>
          )}

          {/* Entry history */}
          <div>
            <h3 className="text-sm font-semibold mb-3">Senaste registreringar</h3>
            {entries.length === 0 ? (
              <p className="text-sm text-muted-foreground">Inga registreringar i vald period.</p>
            ) : (
              <div className="rounded-xl border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Datum</TableHead>
                      <TableHead>Kategori</TableHead>
                      <TableHead className="text-right">Liter</TableHead>
                      <TableHead className="text-right">Uppsk. intakt</TableHead>
                      <TableHead className="w-20"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {entries.slice(0, 20).map(e => {
                      const entryRevenue = Math.round(e.liters * (pricing[e.category] ?? 100) * 100) / 100
                      return (
                        <TableRow key={e.id}>
                          <TableCell>{e.date}</TableCell>
                          <TableCell>{e.category}</TableCell>
                          <TableCell className="text-right tabular-nums">{e.liters.toLocaleString('sv-SE')} l</TableCell>
                          <TableCell className="text-right tabular-nums">{entryRevenue.toLocaleString('sv-SE')} kr</TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1">
                              <Button variant="ghost" size="sm" onClick={() => openEdit(e)}>
                                <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
                              </Button>
                              <Button variant="ghost" size="sm" onClick={() => setDeletingEntry(e)}>
                                <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        </TabsContent>

        {/* ---- OVERVIEW TAB ---- */}
        <TabsContent value="overview" className="space-y-6 mt-4">
          <DateRangeFilter onRangeChange={(start, end) => setDateRange({ start, end })} />

          {/* Period comparison KPIs */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="rounded-xl border p-4 space-y-1">
              <p className="text-xs text-muted-foreground">Intakt/liter (nuvarande)</p>
              <p className="text-2xl font-semibold tabular-nums">{earningsPerLiter.toLocaleString('sv-SE')} kr/l</p>
              {prevEarningsPerLiter > 0 && (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">Foreg: {prevEarningsPerLiter.toLocaleString('sv-SE')} kr/l</span>
                  <DeltaIndicator current={earningsPerLiter} previous={prevEarningsPerLiter} />
                </div>
              )}
            </div>
            <div className="rounded-xl border p-4 space-y-1">
              <p className="text-xs text-muted-foreground">Liter (nuvarande)</p>
              <p className="text-2xl font-semibold tabular-nums">{(Math.round(totalLiters * 100) / 100).toLocaleString('sv-SE')} l</p>
              {prevTotalLiters > 0 && (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">Foreg: {(Math.round(prevTotalLiters * 100) / 100).toLocaleString('sv-SE')} l</span>
                  <DeltaIndicator current={totalLiters} previous={prevTotalLiters} />
                </div>
              )}
            </div>
            <div className="rounded-xl border p-4 space-y-1">
              <p className="text-xs text-muted-foreground">Uppsk. intakt (nuvarande)</p>
              <p className="text-2xl font-semibold tabular-nums">{estimatedRevenue.toLocaleString('sv-SE')} kr</p>
              {prevEstimatedRevenue > 0 && (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">Foreg: {prevEstimatedRevenue.toLocaleString('sv-SE')} kr</span>
                  <DeltaIndicator current={estimatedRevenue} previous={prevEstimatedRevenue} />
                </div>
              )}
            </div>
          </div>

          {/* Category breakdown */}
          {categoryBreakdown.some(c => c.liters > 0) && (
            <div>
              <h3 className="text-sm font-semibold mb-3">Per kategori</h3>
              <div className="rounded-xl border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Kategori</TableHead>
                      <TableHead className="text-right">Liter</TableHead>
                      <TableHead className="text-right">Snittpris/l</TableHead>
                      <TableHead className="text-right">Uppsk. intakt</TableHead>
                      <TableHead className="text-right">Kr/liter</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {categoryBreakdown.map(c => (
                      <TableRow key={c.category}>
                        <TableCell className="font-medium">{c.category}</TableCell>
                        <TableCell className="text-right tabular-nums">{c.liters.toLocaleString('sv-SE')} l</TableCell>
                        <TableCell className="text-right tabular-nums">{c.avgPrice.toLocaleString('sv-SE')} kr</TableCell>
                        <TableCell className="text-right tabular-nums">{c.estimatedRevenue.toLocaleString('sv-SE')} kr</TableCell>
                        <TableCell className="text-right tabular-nums">{c.earningsPerLiter.toLocaleString('sv-SE')} kr/l</TableCell>
                      </TableRow>
                    ))}
                    <TableRow className="font-semibold">
                      <TableCell>Totalt</TableCell>
                      <TableCell className="text-right tabular-nums">{(Math.round(totalLiters * 100) / 100).toLocaleString('sv-SE')} l</TableCell>
                      <TableCell className="text-right"></TableCell>
                      <TableCell className="text-right tabular-nums">{estimatedRevenue.toLocaleString('sv-SE')} kr</TableCell>
                      <TableCell className="text-right tabular-nums">{earningsPerLiter.toLocaleString('sv-SE')} kr/l</TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </div>
            </div>
          )}

          {/* Monthly trend */}
          {monthlyTrend.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold mb-3">Manadstrend</h3>
              <MonthlyTrendTable rows={monthlyTrend} valueLabel="Liter" valueSuffix="l" />
            </div>
          )}
        </TabsContent>

        {/* ---- SETTINGS TAB ---- */}
        <TabsContent value="settings" className="space-y-6 mt-4">
          {/* Category management */}
          <div className="rounded-xl border p-4 space-y-4">
            <div>
              <h3 className="text-sm font-semibold">Kategorier</h3>
              <p className="text-xs text-muted-foreground">Lagg till, ta bort eller byt namn pa dryckkategorier.</p>
            </div>

            <div className="flex gap-2">
              <Input
                placeholder="Ny kategori"
                value={newCategoryName}
                onChange={e => setNewCategoryName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleAddCategory()}
                className="max-w-xs"
              />
              <Button size="sm" onClick={handleAddCategory} disabled={!newCategoryName.trim()}>
                <Plus className="h-4 w-4 mr-1" /> Lagg till
              </Button>
            </div>

            {categories.length > 0 && (
              <div className="rounded-xl border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Namn</TableHead>
                      <TableHead className="w-24"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {categories.map(cat => (
                      <CategoryRow
                        key={cat}
                        name={cat}
                        canRemove={categories.length > 1}
                        onRename={(newName) => handleRenameCategory(cat, newName)}
                        onRemove={() => handleRemoveCategory(cat)}
                      />
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>

          {/* Pricing settings */}
          <div className="rounded-xl border p-4 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold">Snittpris per liter</h3>
                <p className="text-xs text-muted-foreground">
                  Anvands for att berakna uppskattad intakt per kategori.
                </p>
              </div>
              {!editingPricing && (
                <Button size="sm" variant="ghost" onClick={startEditPricing}>
                  <Settings className="h-4 w-4 mr-1" /> Andra
                </Button>
              )}
            </div>

            {editingPricing ? (
              <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {categories.map(cat => (
                    <div key={cat} className="space-y-2">
                      <Label htmlFor={`pricing-${cat}`}>{cat} (kr/liter)</Label>
                      <Input
                        id={`pricing-${cat}`}
                        type="number"
                        step="0.01"
                        min="0"
                        value={pricingInputs[cat] ?? ''}
                        onChange={e => setPricingInputs(prev => ({ ...prev, [cat]: e.target.value }))}
                      />
                    </div>
                  ))}
                </div>
                <div className="flex gap-2">
                  <Button size="sm" onClick={handleSavePricing}>Spara</Button>
                  <Button size="sm" variant="ghost" onClick={() => setEditingPricing(false)}>Avbryt</Button>
                </div>
              </div>
            ) : (
              <div className="rounded-xl border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Kategori</TableHead>
                      <TableHead className="text-right">Pris (kr/l)</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {categories.map(cat => (
                      <TableRow key={cat}>
                        <TableCell className="font-medium">{cat}</TableCell>
                        <TableCell className="text-right tabular-nums">{(pricing[cat] ?? 100).toLocaleString('sv-SE')} kr</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>

      {/* Edit entry dialog */}
      <EditEntryDialog
        open={editingEntry !== null}
        onOpenChange={(open) => { if (!open) setEditingEntry(null) }}
        title="Redigera registrering"
        description="Andra datum, kategori eller antal liter."
        onSave={handleSaveEdit}
        isSaving={isSavingEdit}
      >
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="edit-date">Datum</Label>
            <Input id="edit-date" type="date" value={editDate} onChange={e => setEditDate(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="edit-category">Kategori</Label>
            <Select value={editCategory} onValueChange={setEditCategory}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {categories.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="edit-liters">Antal liter</Label>
            <Input id="edit-liters" type="number" step="0.01" min="0" value={editLiters} onChange={e => setEditLiters(e.target.value)} />
          </div>
        </div>
      </EditEntryDialog>

      {/* Delete confirmation dialog */}
      <ConfirmDeleteDialog
        open={deletingEntry !== null}
        onOpenChange={(open) => { if (!open) setDeletingEntry(null) }}
        title="Ta bort registrering"
        description={deletingEntry ? `Vill du ta bort ${deletingEntry.liters} l ${deletingEntry.category} fran ${deletingEntry.date}?` : ''}
        onConfirm={handleConfirmDelete}
        isDeleting={isDeleting}
      />
    </div>
  )
}

// Inline sub-component for category row with rename support
function CategoryRow({
  name,
  canRemove,
  onRename,
  onRemove,
}: {
  name: string
  canRemove: boolean
  onRename: (newName: string) => Promise<void>
  onRemove: () => Promise<void>
}) {
  const [isRenaming, setIsRenaming] = useState(false)
  const [newName, setNewName] = useState(name)

  const handleRename = async () => {
    await onRename(newName)
    setIsRenaming(false)
  }

  return (
    <TableRow>
      <TableCell>
        {isRenaming ? (
          <div className="flex items-center gap-2">
            <Input
              value={newName}
              onChange={e => setNewName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleRename()}
              className="h-8 max-w-[200px]"
              autoFocus
            />
            <Button size="sm" variant="outline" onClick={handleRename}>Spara</Button>
            <Button size="sm" variant="ghost" onClick={() => { setIsRenaming(false); setNewName(name) }}>Avbryt</Button>
          </div>
        ) : (
          <span className="font-medium">{name}</span>
        )}
      </TableCell>
      <TableCell>
        <div className="flex items-center gap-1 justify-end">
          {!isRenaming && (
            <Button variant="ghost" size="sm" onClick={() => setIsRenaming(true)}>
              <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
            </Button>
          )}
          {canRemove && !isRenaming && (
            <Button variant="ghost" size="sm" onClick={onRemove}>
              <X className="h-3.5 w-3.5 text-muted-foreground" />
            </Button>
          )}
        </div>
      </TableCell>
    </TableRow>
  )
}
