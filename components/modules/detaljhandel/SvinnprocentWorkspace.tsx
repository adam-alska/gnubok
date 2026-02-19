'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { ModuleWorkspaceShell } from '@/components/modules/ModuleWorkspaceShell'
import { KPICard } from '@/components/modules/shared/KPICard'
import { EmptyModuleState } from '@/components/modules/shared/EmptyModuleState'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { Plus, Pencil, Trash2, Loader2, TrendingDown, Save } from 'lucide-react'
import { cn } from '@/lib/utils'

interface ModuleWorkspaceProps {
  module: { slug: string; name: string; cat: string; desc: string; longDesc: string }
  sectorSlug: string
  settingsHref: string
}

interface ShrinkageRow {
  id: string
  category: string
  period: string
  revenue: number
  shrinkageCost: number
  shrinkagePct: number
  benchmark: number
}

const CATEGORIES = ['Livsmedel', 'Dryck', 'Frukt & Gront', 'Mejeri', 'Kott & Chark', 'Non-food', 'Brod & Bageri', 'Totalt']
const INDUSTRY_BENCHMARKS: Record<string, number> = {
  'Livsmedel': 1.5,
  'Dryck': 0.8,
  'Frukt & Gront': 4.0,
  'Mejeri': 2.5,
  'Kott & Chark': 2.0,
  'Non-food': 0.5,
  'Brod & Bageri': 5.0,
  'Totalt': 1.8,
}

function generateId(): string {
  return crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`
}

function fmt(n: number): string {
  return new Intl.NumberFormat('sv-SE', { maximumFractionDigits: 0 }).format(n)
}

function fmtPct(n: number): string {
  return isFinite(n) ? n.toFixed(2) : '0.00'
}

const EMPTY_FORM = {
  category: 'Livsmedel',
  period: '',
  revenue: 0,
  shrinkageCost: 0,
}

export function SvinnprocentWorkspace({ module: mod, sectorSlug, settingsHref }: ModuleWorkspaceProps) {
  const supabase = createClient()

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [rows, setRows] = useState<ShrinkageRow[]>([])

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingItem, setEditingItem] = useState<ShrinkageRow | null>(null)
  const [form, setForm] = useState(EMPTY_FORM)

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [itemToDelete, setItemToDelete] = useState<ShrinkageRow | null>(null)

  const saveRows = useCallback(async (newRows: ShrinkageRow[]) => {
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setSaving(false); return }
    await supabase.from('module_configs').upsert(
      { user_id: user.id, sector_slug: sectorSlug, module_slug: mod.slug, config_key: 'shrinkage_pct_data', config_value: newRows },
      { onConflict: 'user_id,sector_slug,module_slug,config_key' }
    )
    setSaving(false)
  }, [supabase, sectorSlug, mod.slug])

  const fetchData = useCallback(async () => {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); return }
    const { data } = await supabase
      .from('module_configs').select('config_value')
      .eq('user_id', user.id).eq('sector_slug', sectorSlug).eq('module_slug', mod.slug).eq('config_key', 'shrinkage_pct_data')
      .maybeSingle()
    if (data?.config_value && Array.isArray(data.config_value)) setRows(data.config_value as ShrinkageRow[])
    setLoading(false)
  }, [supabase, sectorSlug, mod.slug])

  useEffect(() => { fetchData() }, [fetchData])

  const avgPct = useMemo(() => rows.length > 0 ? rows.reduce((s, r) => s + r.shrinkagePct, 0) / rows.length : 0, [rows])
  const totalShrinkage = useMemo(() => rows.reduce((s, r) => s + r.shrinkageCost, 0), [rows])
  const worstCategory = useMemo(() => {
    if (rows.length === 0) return '-'
    return rows.reduce((w, r) => r.shrinkagePct > w.shrinkagePct ? r : w).category
  }, [rows])

  function openNewItem() { setEditingItem(null); setForm({ ...EMPTY_FORM }); setDialogOpen(true) }
  function openEditItem(item: ShrinkageRow) {
    setEditingItem(item)
    setForm({ category: item.category, period: item.period, revenue: item.revenue, shrinkageCost: item.shrinkageCost })
    setDialogOpen(true)
  }

  async function handleSaveItem() {
    const shrinkagePct = form.revenue > 0 ? (form.shrinkageCost / form.revenue) * 100 : 0
    const item: ShrinkageRow = {
      id: editingItem?.id ?? generateId(),
      category: form.category,
      period: form.period,
      revenue: form.revenue,
      shrinkageCost: form.shrinkageCost,
      shrinkagePct,
      benchmark: INDUSTRY_BENCHMARKS[form.category] ?? 1.8,
    }
    let updated: ShrinkageRow[]
    if (editingItem) updated = rows.map(r => r.id === editingItem.id ? item : r)
    else updated = [...rows, item]
    setRows(updated)
    setDialogOpen(false)
    await saveRows(updated)
  }

  async function handleDeleteItem() {
    if (!itemToDelete) return
    const updated = rows.filter(r => r.id !== itemToDelete.id)
    setRows(updated)
    setDeleteDialogOpen(false)
    setItemToDelete(null)
    await saveRows(updated)
  }

  return (
    <>
      <ModuleWorkspaceShell
        title={mod.name} description={mod.desc} category="rapport" sectorName="Detaljhandel"
        backHref={`/m/${sectorSlug}`} settingsHref={settingsHref}
        actions={<Button onClick={openNewItem}><Plus className="mr-2 h-4 w-4" />Ny post</Button>}
      >
        <Tabs defaultValue="oversikt" className="space-y-6">
          <TabsList>
            <TabsTrigger value="oversikt">Översikt</TabsTrigger>
            <TabsTrigger value="detalj">Per kategori</TabsTrigger>
            <TabsTrigger value="benchmark">Branschjämförelse</TabsTrigger>
          </TabsList>

          <TabsContent value="oversikt" className="space-y-6">
            {loading ? (
              <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <KPICard label="Genomsnittlig svinn %" value={fmtPct(avgPct)} unit="%" trend={avgPct <= 1.8 ? 'up' : avgPct <= 3 ? 'neutral' : 'down'} trendLabel={avgPct <= 1.8 ? 'Under branschsnitt' : 'Över branschsnitt'} />
                <KPICard label="Total svinnskostnad" value={fmt(totalShrinkage)} unit="kr" />
                <KPICard label="Sämsta kategori" value={worstCategory} />
                <KPICard label="Branschsnitt (totalt)" value={fmtPct(INDUSTRY_BENCHMARKS['Totalt'])} unit="%" />
              </div>
            )}
          </TabsContent>

          <TabsContent value="detalj" className="space-y-4">
            {rows.length === 0 ? (
              <EmptyModuleState icon={TrendingDown} title="Ingen svinndata" description="Lägg till svinndata per kategori för att se trender." actionLabel="Ny post" onAction={openNewItem} />
            ) : (
              <div className="rounded-xl border border-border overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead className="font-medium">Kategori</TableHead>
                      <TableHead className="font-medium">Period</TableHead>
                      <TableHead className="font-medium text-right">Intakter (kr)</TableHead>
                      <TableHead className="font-medium text-right">Svinn (kr)</TableHead>
                      <TableHead className="font-medium text-right">Svinn %</TableHead>
                      <TableHead className="font-medium text-right">Branschsnitt</TableHead>
                      <TableHead className="font-medium text-right">Åtgärder</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.sort((a, b) => b.shrinkagePct - a.shrinkagePct).map((row) => (
                      <TableRow key={row.id}>
                        <TableCell className="font-medium">{row.category}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{row.period}</TableCell>
                        <TableCell className="text-right tabular-nums">{fmt(row.revenue)}</TableCell>
                        <TableCell className="text-right tabular-nums">{fmt(row.shrinkageCost)}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          <span className={cn('font-medium', row.shrinkagePct <= row.benchmark ? 'text-emerald-600' : 'text-red-600')}>
                            {fmtPct(row.shrinkagePct)}%
                          </span>
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-muted-foreground">{fmtPct(row.benchmark)}%</TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button variant="ghost" size="icon" onClick={() => openEditItem(row)}><Pencil className="h-4 w-4" /></Button>
                            <Button variant="ghost" size="icon" className="text-red-600 hover:text-red-700" onClick={() => { setItemToDelete(row); setDeleteDialogOpen(true) }}><Trash2 className="h-4 w-4" /></Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </TabsContent>

          <TabsContent value="benchmark" className="space-y-4">
            <div className="rounded-xl border border-border bg-card p-6 space-y-4">
              <h3 className="text-sm font-semibold">Branschreferensvärden (detaljhandel livsmedel)</h3>
              <div className="space-y-2">
                {Object.entries(INDUSTRY_BENCHMARKS).map(([cat, pct]) => (
                  <div key={cat} className="flex items-center justify-between">
                    <span className="text-sm">{cat}</span>
                    <span className="text-sm font-medium tabular-nums">{fmtPct(pct)}%</span>
                  </div>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">Källa: Branschgenomsnitt för svensk dagligvaruhandel.</p>
            </div>
          </TabsContent>
        </Tabs>
        {saving && <div className="flex items-center gap-2 text-xs text-muted-foreground mt-4"><Loader2 className="h-3.5 w-3.5 animate-spin" />Sparar...</div>}
      </ModuleWorkspaceShell>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{editingItem ? 'Redigera' : 'Ny svinnpost'}</DialogTitle><DialogDescription>Ange intäkter och svinnskostnad för att beräkna svinnprocent.</DialogDescription></DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2"><Label>Kategori *</Label><Select value={form.category} onValueChange={(val) => setForm(f => ({ ...f, category: val }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent></Select></div>
              <div className="grid gap-2"><Label>Period</Label><Input value={form.period} onChange={(e) => setForm(f => ({ ...f, period: e.target.value }))} placeholder="2024-01" /></div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2"><Label>Intakter (kr) *</Label><Input type="number" min={0} value={form.revenue} onChange={(e) => setForm(f => ({ ...f, revenue: Number(e.target.value) || 0 }))} /></div>
              <div className="grid gap-2"><Label>Svinnkostnad (kr) *</Label><Input type="number" min={0} value={form.shrinkageCost} onChange={(e) => setForm(f => ({ ...f, shrinkageCost: Number(e.target.value) || 0 }))} /></div>
            </div>
            {form.revenue > 0 && (
              <p className="text-xs text-muted-foreground">
                Beräknad svinnprocent: <strong className={cn((form.shrinkageCost / form.revenue * 100) <= (INDUSTRY_BENCHMARKS[form.category] ?? 1.8) ? 'text-emerald-600' : 'text-red-600')}>{fmtPct(form.shrinkageCost / form.revenue * 100)}%</strong>
                {' '}(branschsnitt: {fmtPct(INDUSTRY_BENCHMARKS[form.category] ?? 1.8)}%)
              </p>
            )}
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setDialogOpen(false)}>Avbryt</Button><Button onClick={handleSaveItem} disabled={form.revenue <= 0}>{editingItem ? 'Uppdatera' : 'Lägg till'}</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Ta bort post</DialogTitle><DialogDescription>Är du säker på att du vill ta bort denna svinnpost?</DialogDescription></DialogHeader>
          <DialogFooter><Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>Avbryt</Button><Button variant="destructive" onClick={handleDeleteItem}><Trash2 className="mr-2 h-4 w-4" />Ta bort</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
