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
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { Plus, Pencil, Trash2, Loader2, Save, LayoutGrid } from 'lucide-react'
import { cn } from '@/lib/utils'

interface ModuleWorkspaceProps {
  module: { slug: string; name: string; cat: string; desc: string; longDesc: string }
  sectorSlug: string
  settingsHref: string
}

interface StoreEntry {
  id: string
  storeName: string
  areaM2: number
  revenue: number
  period: string
  revenuePerM2: number
}

function generateId(): string {
  return crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`
}

function fmt(n: number): string {
  return new Intl.NumberFormat('sv-SE', { maximumFractionDigits: 0 }).format(n)
}

function fmtDec(n: number): string {
  return isFinite(n) ? n.toFixed(1) : '0.0'
}

const EMPTY_FORM = {
  storeName: '',
  areaM2: 0,
  revenue: 0,
  period: '',
}

export function ForsaljningPerM2Workspace({ module: mod, sectorSlug, settingsHref }: ModuleWorkspaceProps) {
  const supabase = createClient()

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [entries, setEntries] = useState<StoreEntry[]>([])

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingItem, setEditingItem] = useState<StoreEntry | null>(null)
  const [form, setForm] = useState(EMPTY_FORM)

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [itemToDelete, setItemToDelete] = useState<StoreEntry | null>(null)

  const saveEntries = useCallback(async (newEntries: StoreEntry[]) => {
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setSaving(false); return }
    await supabase.from('module_configs').upsert(
      { user_id: user.id, sector_slug: sectorSlug, module_slug: mod.slug, config_key: 'sales_per_m2', config_value: newEntries },
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
      .eq('user_id', user.id).eq('sector_slug', sectorSlug).eq('module_slug', mod.slug).eq('config_key', 'sales_per_m2')
      .maybeSingle()
    if (data?.config_value && Array.isArray(data.config_value)) setEntries(data.config_value as StoreEntry[])
    setLoading(false)
  }, [supabase, sectorSlug, mod.slug])

  useEffect(() => { fetchData() }, [fetchData])

  const avgPerM2 = useMemo(() => {
    if (entries.length === 0) return 0
    return entries.reduce((s, e) => s + e.revenuePerM2, 0) / entries.length
  }, [entries])

  const bestStore = useMemo(() => {
    if (entries.length === 0) return '-'
    return entries.reduce((b, e) => e.revenuePerM2 > b.revenuePerM2 ? e : b).storeName
  }, [entries])

  const totalRevenue = useMemo(() => entries.reduce((s, e) => s + e.revenue, 0), [entries])
  const totalArea = useMemo(() => entries.reduce((s, e) => s + e.areaM2, 0), [entries])

  function openNewItem() { setEditingItem(null); setForm({ ...EMPTY_FORM }); setDialogOpen(true) }
  function openEditItem(item: StoreEntry) {
    setEditingItem(item)
    setForm({ storeName: item.storeName, areaM2: item.areaM2, revenue: item.revenue, period: item.period })
    setDialogOpen(true)
  }

  async function handleSaveItem() {
    const revenuePerM2 = form.areaM2 > 0 ? form.revenue / form.areaM2 : 0
    const item: StoreEntry = {
      id: editingItem?.id ?? generateId(),
      storeName: form.storeName.trim(),
      areaM2: form.areaM2,
      revenue: form.revenue,
      period: form.period,
      revenuePerM2,
    }
    let updated: StoreEntry[]
    if (editingItem) updated = entries.map(e => e.id === editingItem.id ? item : e)
    else updated = [...entries, item]
    setEntries(updated)
    setDialogOpen(false)
    await saveEntries(updated)
  }

  async function handleDeleteItem() {
    if (!itemToDelete) return
    const updated = entries.filter(e => e.id !== itemToDelete.id)
    setEntries(updated)
    setDeleteDialogOpen(false)
    setItemToDelete(null)
    await saveEntries(updated)
  }

  return (
    <>
      <ModuleWorkspaceShell
        title={mod.name} description={mod.desc} category="rapport" sectorName="Detaljhandel"
        backHref={`/m/${sectorSlug}`} settingsHref={settingsHref}
        actions={<Button onClick={openNewItem}><Plus className="mr-2 h-4 w-4" />Ny butik/period</Button>}
      >
        {loading ? (
          <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : (
          <div className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <KPICard label="Snitt försäljning/m2" value={fmt(avgPerM2)} unit="kr/m2" />
              <KPICard label="Bästa butik" value={bestStore} />
              <KPICard label="Total intakt" value={fmt(totalRevenue)} unit="kr" />
              <KPICard label="Total yta" value={fmt(totalArea)} unit="m2" />
            </div>

            {entries.length === 0 ? (
              <EmptyModuleState icon={LayoutGrid} title="Ingen data" description="Lägg till butiker och intäkter för att beräkna försäljning per kvadratmeter." actionLabel="Ny post" onAction={openNewItem} />
            ) : (
              <div className="rounded-xl border border-border overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead className="font-medium">Butik</TableHead>
                      <TableHead className="font-medium text-right">Yta (m2)</TableHead>
                      <TableHead className="font-medium text-right">Intakt (kr)</TableHead>
                      <TableHead className="font-medium text-right">Kr/m2</TableHead>
                      <TableHead className="font-medium">Period</TableHead>
                      <TableHead className="font-medium text-right">Åtgärder</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {entries.sort((a, b) => b.revenuePerM2 - a.revenuePerM2).map((entry) => (
                      <TableRow key={entry.id}>
                        <TableCell className="font-medium">{entry.storeName}</TableCell>
                        <TableCell className="text-right tabular-nums">{fmt(entry.areaM2)}</TableCell>
                        <TableCell className="text-right tabular-nums">{fmt(entry.revenue)}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          <span className={cn('font-medium', entry.revenuePerM2 >= avgPerM2 ? 'text-emerald-600' : 'text-red-600')}>
                            {fmt(entry.revenuePerM2)}
                          </span>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">{entry.period}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button variant="ghost" size="icon" onClick={() => openEditItem(entry)}><Pencil className="h-4 w-4" /></Button>
                            <Button variant="ghost" size="icon" className="text-red-600 hover:text-red-700" onClick={() => { setItemToDelete(entry); setDeleteDialogOpen(true) }}><Trash2 className="h-4 w-4" /></Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                    {entries.length > 1 && (
                      <TableRow className="bg-muted/30 font-medium">
                        <TableCell>Totalt / Snitt</TableCell>
                        <TableCell className="text-right tabular-nums">{fmt(totalArea)}</TableCell>
                        <TableCell className="text-right tabular-nums">{fmt(totalRevenue)}</TableCell>
                        <TableCell className="text-right tabular-nums font-medium">{fmt(totalArea > 0 ? totalRevenue / totalArea : 0)}</TableCell>
                        <TableCell />
                        <TableCell />
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            )}
            {saving && <div className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" />Sparar...</div>}
          </div>
        )}
      </ModuleWorkspaceShell>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{editingItem ? 'Redigera' : 'Ny butik/period'}</DialogTitle><DialogDescription>Ange butik, försäljningsyta och intäkter för att beräkna kr/m2.</DialogDescription></DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-2"><Label>Butik *</Label><Input value={form.storeName} onChange={(e) => setForm(f => ({ ...f, storeName: e.target.value }))} placeholder="Butik City" /></div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2"><Label>Försäljningsyta (m2) *</Label><Input type="number" min={1} value={form.areaM2} onChange={(e) => setForm(f => ({ ...f, areaM2: Number(e.target.value) || 0 }))} /></div>
              <div className="grid gap-2"><Label>Intakt (kr) *</Label><Input type="number" min={0} value={form.revenue} onChange={(e) => setForm(f => ({ ...f, revenue: Number(e.target.value) || 0 }))} /></div>
            </div>
            <div className="grid gap-2"><Label>Period</Label><Input value={form.period} onChange={(e) => setForm(f => ({ ...f, period: e.target.value }))} placeholder="2024-01" /></div>
            {form.areaM2 > 0 && form.revenue > 0 && (
              <p className="text-xs text-muted-foreground">Beräknad försäljning per m2: <strong>{fmt(form.revenue / form.areaM2)} kr/m2</strong></p>
            )}
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setDialogOpen(false)}>Avbryt</Button><Button onClick={handleSaveItem} disabled={!form.storeName.trim() || form.areaM2 <= 0}>{editingItem ? 'Uppdatera' : 'Lägg till'}</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Ta bort post</DialogTitle><DialogDescription>Är du säker på att du vill ta bort {itemToDelete?.storeName}?</DialogDescription></DialogHeader>
          <DialogFooter><Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>Avbryt</Button><Button variant="destructive" onClick={handleDeleteItem}><Trash2 className="mr-2 h-4 w-4" />Ta bort</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
