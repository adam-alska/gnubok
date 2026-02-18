'use client'

import { useEffect, useState, useCallback } from 'react'
import { ModuleWorkspaceShell } from '@/components/modules/ModuleWorkspaceShell'
import { KPICard } from '@/components/modules/shared/KPICard'
import { DateRangeFilter } from '@/components/modules/shared/DateRangeFilter'
import { EmptyModuleState } from '@/components/modules/shared/EmptyModuleState'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog'
import { createClient } from '@/lib/supabase/client'
import { Trash2, Plus, Loader2 } from 'lucide-react'

interface ModuleWorkspaceProps {
  module: { slug: string; name: string; cat: string; desc: string; longDesc: string }
  sectorSlug: string
  settingsHref: string
}

interface WasteEntry {
  id: string
  date: string
  item_name: string
  category: string
  quantity: number
  unit: string
  estimated_cost: number
  reason: string
  notes: string | null
}

interface CategoryBreakdown {
  category: string
  count: number
  totalCost: number
  pctOfTotal: number
}

const WASTE_CATEGORIES = ['Råvaror', 'Tillagat', 'Utgånget', 'Övrigt'] as const

function startOfMonth(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}

function todayStr(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function fmt(n: number): string {
  return new Intl.NumberFormat('sv-SE', { maximumFractionDigits: 0 }).format(n)
}

function fmtPct(n: number): string {
  return isFinite(n) ? n.toFixed(1) : '0.0'
}

const emptyForm = {
  date: todayStr(),
  item_name: '',
  category: 'Råvaror' as string,
  quantity: '',
  unit: 'kg',
  estimated_cost: '',
  reason: '',
  notes: '',
}

export function SvinnrapportWorkspace({ module: mod, sectorSlug, settingsHref }: ModuleWorkspaceProps) {
  const supabase = createClient()

  const [from, setFrom] = useState(startOfMonth)
  const [to, setTo] = useState(todayStr)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const [entries, setEntries] = useState<WasteEntry[]>([])
  const [revenue, setRevenue] = useState(0)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [form, setForm] = useState(emptyForm)

  const fetchData = useCallback(async () => {
    setLoading(true)

    // Fetch waste entries
    const { data: wasteData } = await supabase
      .from('waste_entries')
      .select('*')
      .gte('date', from)
      .lte('date', to)
      .order('date', { ascending: false })

    setEntries((wasteData as WasteEntry[]) ?? [])

    // Fetch revenue from journal_entry_lines (accounts 3000-3999)
    const { data: revenueLines } = await supabase
      .from('journal_entry_lines')
      .select('credit, journal_entries!inner(date)')
      .like('account_number', '3%')
      .gte('journal_entries.date', from)
      .lte('journal_entries.date', to) as { data: { credit: number }[] | null }

    const totalRevenue = (revenueLines ?? []).reduce((s, l) => s + Number(l.credit), 0)
    setRevenue(totalRevenue)

    setLoading(false)
  }, [from, to, supabase])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const totalWaste = entries.reduce((s, e) => s + Number(e.estimated_cost), 0)
  const wastePct = revenue > 0 ? (totalWaste / revenue) * 100 : 0

  // Category breakdown
  const catMap: Record<string, { count: number; cost: number }> = {}
  for (const e of entries) {
    if (!catMap[e.category]) catMap[e.category] = { count: 0, cost: 0 }
    catMap[e.category].count++
    catMap[e.category].cost += Number(e.estimated_cost)
  }
  const categoryBreakdown: CategoryBreakdown[] = Object.entries(catMap)
    .map(([category, { count, cost }]) => ({
      category,
      count,
      totalCost: cost,
      pctOfTotal: totalWaste > 0 ? (cost / totalWaste) * 100 : 0,
    }))
    .sort((a, b) => b.totalCost - a.totalCost)

  const topCategory = categoryBreakdown.length > 0 ? categoryBreakdown[0].category : '-'

  const handleAddEntry = async () => {
    const quantity = parseFloat(form.quantity)
    const estimated_cost = parseFloat(form.estimated_cost)
    if (!form.item_name || isNaN(quantity) || isNaN(estimated_cost)) return

    setSaving(true)
    await supabase.from('waste_entries').insert({
      date: form.date,
      item_name: form.item_name,
      category: form.category,
      quantity,
      unit: form.unit,
      estimated_cost,
      reason: form.reason,
      notes: form.notes || null,
    })
    setSaving(false)
    setDialogOpen(false)
    setForm(emptyForm)
    fetchData()
  }

  const handleDeleteEntry = async (id: string) => {
    await supabase.from('waste_entries').delete().eq('id', id)
    fetchData()
  }

  return (
    <ModuleWorkspaceShell
      title={mod.name}
      description={mod.desc}
      category="rapport"
      sectorName="Restaurang"
      backHref={`/m/${sectorSlug}`}
      settingsHref={settingsHref}
      actions={
        <DateRangeFilter from={from} to={to} onFromChange={setFrom} onToChange={setTo} />
      }
    >
      <Tabs defaultValue="oversikt" className="space-y-6">
        <TabsList>
          <TabsTrigger value="oversikt">Översikt</TabsTrigger>
          <TabsTrigger value="poster">Svinnposter</TabsTrigger>
          <TabsTrigger value="kategori">Kategori</TabsTrigger>
        </TabsList>

        {/* Overview */}
        <TabsContent value="oversikt" className="space-y-6">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : entries.length === 0 ? (
            <EmptyModuleState
              icon={Trash2}
              title="Inga svinnposter"
              description="Det finns inga registrerade svinnposter för perioden. Lägg till poster via fliken Svinnposter."
            />
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <KPICard label="Totalt svinn" value={fmt(totalWaste)} unit="kr" />
              <KPICard
                label="Svinn % av omsättning"
                value={fmtPct(wastePct)}
                unit="%"
                trend={wastePct > 3 ? 'down' : wastePct < 1 ? 'up' : 'neutral'}
                trendLabel={wastePct > 3 ? 'Högt' : wastePct < 1 ? 'Lågt' : 'OK'}
              />
              <KPICard label="Störst kategori" value={topCategory} />
            </div>
          )}
        </TabsContent>

        {/* Waste entries list + add */}
        <TabsContent value="poster" className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">Svinnposter</h3>
            <Button size="sm" onClick={() => setDialogOpen(true)}>
              <Plus className="mr-2 h-3.5 w-3.5" />
              Lägg till
            </Button>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : entries.length === 0 ? (
            <EmptyModuleState
              icon={Trash2}
              title="Inga svinnposter"
              description="Börja registrera svinn genom att klicka på Lägg till."
              actionLabel="Lägg till svinnpost"
              onAction={() => setDialogOpen(true)}
            />
          ) : (
            <div className="rounded-xl border border-border overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-muted/50 border-b border-border">
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Datum</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Artikel</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Kategori</th>
                    <th className="text-right px-4 py-3 font-medium text-muted-foreground">Antal</th>
                    <th className="text-right px-4 py-3 font-medium text-muted-foreground">Kostnad (kr)</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Orsak</th>
                    <th className="px-4 py-3 w-10"></th>
                  </tr>
                </thead>
                <tbody>
                  {entries.map((e) => (
                    <tr key={e.id} className="border-b border-border last:border-0">
                      <td className="px-4 py-3 whitespace-nowrap">{e.date}</td>
                      <td className="px-4 py-3">{e.item_name}</td>
                      <td className="px-4 py-3">{e.category}</td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        {e.quantity} {e.unit}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">{fmt(e.estimated_cost)}</td>
                      <td className="px-4 py-3 text-muted-foreground">{e.reason}</td>
                      <td className="px-4 py-3">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0 text-muted-foreground hover:text-red-500"
                          onClick={() => handleDeleteEntry(e.id)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </TabsContent>

        {/* Category breakdown */}
        <TabsContent value="kategori" className="space-y-4">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : categoryBreakdown.length === 0 ? (
            <EmptyModuleState
              icon={Trash2}
              title="Ingen kategoridata"
              description="Registrera svinnposter för att se kategoriuppdelning."
            />
          ) : (
            <div className="rounded-xl border border-border overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-muted/50 border-b border-border">
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Kategori</th>
                    <th className="text-right px-4 py-3 font-medium text-muted-foreground">Antal</th>
                    <th className="text-right px-4 py-3 font-medium text-muted-foreground">Kostnad (kr)</th>
                    <th className="text-right px-4 py-3 font-medium text-muted-foreground">Andel %</th>
                  </tr>
                </thead>
                <tbody>
                  {categoryBreakdown.map((c) => (
                    <tr key={c.category} className="border-b border-border last:border-0">
                      <td className="px-4 py-3">{c.category}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{c.count}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{fmt(c.totalCost)}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{fmtPct(c.pctOfTotal)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Add waste entry dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Ny svinnpost</DialogTitle>
            <DialogDescription>
              Registrera en svinnhändelse med artikel, kategori och uppskattad kostnad.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs">Datum</Label>
                <Input
                  type="date"
                  value={form.date}
                  onChange={(e) => setForm({ ...form, date: e.target.value })}
                  className="h-9"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Kategori</Label>
                <select
                  value={form.category}
                  onChange={(e) => setForm({ ...form, category: e.target.value })}
                  className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                >
                  {WASTE_CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Artikelnamn</Label>
              <Input
                value={form.item_name}
                onChange={(e) => setForm({ ...form, item_name: e.target.value })}
                className="h-9"
                placeholder="t.ex. Laxfilé"
              />
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs">Antal</Label>
                <Input
                  type="number"
                  step="0.1"
                  value={form.quantity}
                  onChange={(e) => setForm({ ...form, quantity: e.target.value })}
                  className="h-9"
                  placeholder="2.5"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Enhet</Label>
                <Input
                  value={form.unit}
                  onChange={(e) => setForm({ ...form, unit: e.target.value })}
                  className="h-9"
                  placeholder="kg"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Kostnad (kr)</Label>
                <Input
                  type="number"
                  step="1"
                  value={form.estimated_cost}
                  onChange={(e) => setForm({ ...form, estimated_cost: e.target.value })}
                  className="h-9"
                  placeholder="350"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Orsak</Label>
              <Input
                value={form.reason}
                onChange={(e) => setForm({ ...form, reason: e.target.value })}
                className="h-9"
                placeholder="t.ex. Passerade bäst-före"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Anteckningar (valfritt)</Label>
              <Input
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                className="h-9"
                placeholder="Övriga kommentarer"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Avbryt
            </Button>
            <Button onClick={handleAddEntry} disabled={saving}>
              {saving && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
              Spara
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ModuleWorkspaceShell>
  )
}
