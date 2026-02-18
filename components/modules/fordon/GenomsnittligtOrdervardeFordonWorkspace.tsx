'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { ModuleWorkspaceShell } from '@/components/modules/ModuleWorkspaceShell'
import { KPICard } from '@/components/modules/shared/KPICard'
import { EmptyModuleState } from '@/components/modules/shared/EmptyModuleState'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Plus, Trash2, Loader2, BarChart3 } from 'lucide-react'

interface ModuleWorkspaceProps { module: { slug: string; name: string; cat: string; desc: string; longDesc: string }; sectorSlug: string; settingsHref: string }
interface MonthlyOrder { month: string; order_count: number; labor_total: number; parts_total: number }
function fmt(n: number): string { return new Intl.NumberFormat('sv-SE', { maximumFractionDigits: 0 }).format(n) }

const DEFAULT_DATA: MonthlyOrder[] = [
  { month: '2025-01', order_count: 45, labor_total: 178500, parts_total: 124000 },
  { month: '2025-02', order_count: 52, labor_total: 210000, parts_total: 145000 },
  { month: '2025-03', order_count: 48, labor_total: 192000, parts_total: 132000 },
]
const EMPTY_FORM = { month: '', order_count: '', labor_total: '', parts_total: '' }

export function GenomsnittligtOrdervardeFordonWorkspace({ module: mod, sectorSlug, settingsHref }: ModuleWorkspaceProps) {
  const supabase = createClient()
  const [loading, setLoading] = useState(true); const [saving, setSaving] = useState(false); const [data, setData] = useState<MonthlyOrder[]>([]); const [dialogOpen, setDialogOpen] = useState(false); const [form, setForm] = useState(EMPTY_FORM); const [deleteDialogOpen, setDeleteDialogOpen] = useState(false); const [monthToDelete, setMonthToDelete] = useState<string | null>(null)
  const saveData = useCallback(async (d: MonthlyOrder[]) => { setSaving(true); const { data: { user } } = await supabase.auth.getUser(); if (!user) { setSaving(false); return }; await supabase.from('module_configs').upsert({ user_id: user.id, sector_slug: sectorSlug, module_slug: mod.slug, config_key: 'order_data', config_value: d }, { onConflict: 'user_id,sector_slug,module_slug,config_key' }); setSaving(false) }, [supabase, sectorSlug, mod.slug])
  const fetch_ = useCallback(async () => { setLoading(true); const { data: { user } } = await supabase.auth.getUser(); if (!user) { setLoading(false); return }; const { data: d } = await supabase.from('module_configs').select('config_value').eq('user_id', user.id).eq('sector_slug', sectorSlug).eq('module_slug', mod.slug).eq('config_key', 'order_data').maybeSingle(); if (d?.config_value && Array.isArray(d.config_value) && d.config_value.length > 0) { setData(d.config_value as MonthlyOrder[]) } else { setData(DEFAULT_DATA); await supabase.from('module_configs').upsert({ user_id: user.id, sector_slug: sectorSlug, module_slug: mod.slug, config_key: 'order_data', config_value: DEFAULT_DATA }, { onConflict: 'user_id,sector_slug,module_slug,config_key' }) }; setLoading(false) }, [supabase, sectorSlug, mod.slug])
  useEffect(() => { fetch_() }, [fetch_])
  const stats = useMemo(() => { if (data.length === 0) return { avgValue: 0, avgLabor: 0, avgParts: 0, totalOrders: 0 }; const totalOrders = data.reduce((s, d) => s + d.order_count, 0); const totalLabor = data.reduce((s, d) => s + d.labor_total, 0); const totalParts = data.reduce((s, d) => s + d.parts_total, 0); return { avgValue: totalOrders > 0 ? (totalLabor + totalParts) / totalOrders : 0, avgLabor: totalOrders > 0 ? totalLabor / totalOrders : 0, avgParts: totalOrders > 0 ? totalParts / totalOrders : 0, totalOrders } }, [data])
  function openNew() { setForm({ ...EMPTY_FORM }); setDialogOpen(true) }
  async function handleSave() { const entry: MonthlyOrder = { month: form.month, order_count: parseInt(form.order_count) || 0, labor_total: parseFloat(form.labor_total) || 0, parts_total: parseFloat(form.parts_total) || 0 }; const u = [...data.filter((d) => d.month !== entry.month), entry].sort((a, b) => a.month.localeCompare(b.month)); setData(u); setDialogOpen(false); await saveData(u) }
  function openDel(m: string) { setMonthToDelete(m); setDeleteDialogOpen(true) }
  async function handleDel() { if (!monthToDelete) return; const u = data.filter((d) => d.month !== monthToDelete); setData(u); setDeleteDialogOpen(false); setMonthToDelete(null); await saveData(u) }

  return (
    <>
      <ModuleWorkspaceShell title={mod.name} description={mod.desc} category="rapport" sectorName="Fordon & Verkstad" backHref={`/m/${sectorSlug}`} settingsHref={settingsHref} actions={<Button onClick={openNew}><Plus className="mr-2 h-4 w-4" />Ny månad</Button>}>
        {loading ? <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div> : data.length === 0 ? <EmptyModuleState icon={BarChart3} title="Ingen data" description="Lägg till månadsdata för att analysera ordervärde." actionLabel="Ny månad" onAction={openNew} /> : (
          <div className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"><KPICard label="Snitt ordervärde" value={fmt(Math.round(stats.avgValue))} unit="kr" /><KPICard label="Snitt arbete/order" value={fmt(Math.round(stats.avgLabor))} unit="kr" /><KPICard label="Snitt delar/order" value={fmt(Math.round(stats.avgParts))} unit="kr" /><KPICard label="Totalt ordrar" value={fmt(stats.totalOrders)} unit="st" /></div>
            <div className="rounded-xl border border-border overflow-hidden"><Table><TableHeader><TableRow className="bg-muted/50"><TableHead className="font-medium">Månad</TableHead><TableHead className="font-medium text-right">Ordrar</TableHead><TableHead className="font-medium text-right">Arbete (kr)</TableHead><TableHead className="font-medium text-right">Delar (kr)</TableHead><TableHead className="font-medium text-right">Snitt/order</TableHead><TableHead className="font-medium text-right">Åtgärder</TableHead></TableRow></TableHeader><TableBody>{data.map((d) => { const avg = d.order_count > 0 ? (d.labor_total + d.parts_total) / d.order_count : 0; return (<TableRow key={d.month}><TableCell className="font-medium">{d.month}</TableCell><TableCell className="text-right tabular-nums">{d.order_count}</TableCell><TableCell className="text-right tabular-nums">{fmt(d.labor_total)}</TableCell><TableCell className="text-right tabular-nums">{fmt(d.parts_total)}</TableCell><TableCell className="text-right tabular-nums font-semibold">{fmt(Math.round(avg))}</TableCell><TableCell className="text-right"><Button variant="ghost" size="icon" className="text-red-600 hover:text-red-700" onClick={() => openDel(d.month)}><Trash2 className="h-4 w-4" /></Button></TableCell></TableRow>) })}</TableBody></Table></div>
          </div>
        )}
      </ModuleWorkspaceShell>
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}><DialogContent className="max-w-md"><DialogHeader><DialogTitle>Ny månadsdata</DialogTitle><DialogDescription>Registrera orderdata för att beräkna genomsnittligt ordervärde.</DialogDescription></DialogHeader><div className="grid gap-4 py-2"><div className="grid gap-2"><Label>Månad *</Label><Input type="month" value={form.month} onChange={(e) => setForm((f) => ({ ...f, month: e.target.value }))} /></div><div className="grid grid-cols-3 gap-4"><div className="grid gap-2"><Label>Antal ordrar *</Label><Input type="number" min={0} value={form.order_count} onChange={(e) => setForm((f) => ({ ...f, order_count: e.target.value }))} /></div><div className="grid gap-2"><Label>Arbete (kr)</Label><Input type="number" min={0} value={form.labor_total} onChange={(e) => setForm((f) => ({ ...f, labor_total: e.target.value }))} /></div><div className="grid gap-2"><Label>Delar (kr)</Label><Input type="number" min={0} value={form.parts_total} onChange={(e) => setForm((f) => ({ ...f, parts_total: e.target.value }))} /></div></div></div><DialogFooter><Button variant="outline" onClick={() => setDialogOpen(false)}>Avbryt</Button><Button onClick={handleSave} disabled={!form.month || !form.order_count}>Spara</Button></DialogFooter></DialogContent></Dialog>
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}><DialogContent className="max-w-sm"><DialogHeader><DialogTitle>Ta bort</DialogTitle><DialogDescription>Ta bort data för <span className="font-semibold">{monthToDelete}</span>?</DialogDescription></DialogHeader><DialogFooter><Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>Avbryt</Button><Button variant="destructive" onClick={handleDel}><Trash2 className="mr-2 h-4 w-4" />Ta bort</Button></DialogFooter></DialogContent></Dialog>
    </>
  )
}
