'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { ModuleWorkspaceShell } from '@/components/modules/ModuleWorkspaceShell'
import { KPICard } from '@/components/modules/shared/KPICard'
import { EmptyModuleState } from '@/components/modules/shared/EmptyModuleState'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Plus, Pencil, Trash2, Loader2, Zap } from 'lucide-react'
import { Badge } from '@/components/ui/badge'

interface ModuleWorkspaceProps { module: { slug: string; name: string; cat: string; desc: string; longDesc: string }; sectorSlug: string; settingsHref: string }
type EnergyType = 'El' | 'Fjärrvärme' | 'Gas' | 'Olja' | 'Vatten'
interface EnergyReading { id: string; property: string; type: EnergyType; period: string; consumption: number; unit: string; cost: number; area: number; costPerM2: number; previousPeriod: number }
function fmt(n: number): string { return new Intl.NumberFormat('sv-SE', { maximumFractionDigits: 0 }).format(n) }
function fmtDec(n: number): string { return new Intl.NumberFormat('sv-SE', { maximumFractionDigits: 1 }).format(n) }
const ENERGY_TYPES: EnergyType[] = ['El', 'Fjärrvärme', 'Gas', 'Olja', 'Vatten']
const ENERGY_UNITS: Record<EnergyType, string> = { 'El': 'kWh', 'Fjärrvärme': 'kWh', 'Gas': 'kWh', 'Olja': 'liter', 'Vatten': 'm³' }
const EMPTY_FORM = { property: '', type: 'El' as EnergyType, period: '', consumption: 0, unit: 'kWh', cost: 0, area: 0, previousPeriod: 0 }

export function EnergiovervaningWorkspace({ module: mod, sectorSlug, settingsHref }: ModuleWorkspaceProps) {
  const supabase = createClient()
  const [loading, setLoading] = useState(true); const [saving, setSaving] = useState(false); const [readings, setReadings] = useState<EnergyReading[]>([]); const [dialogOpen, setDialogOpen] = useState(false); const [editing, setEditing] = useState<EnergyReading | null>(null); const [form, setForm] = useState(EMPTY_FORM); const [deleteDialogOpen, setDeleteDialogOpen] = useState(false); const [toDelete, setToDelete] = useState<EnergyReading | null>(null); const [filterType, setFilterType] = useState<EnergyType | 'all'>('all')

  const saveItems = useCallback(async (items: EnergyReading[]) => { setSaving(true); const { data: { user } } = await supabase.auth.getUser(); if (!user) { setSaving(false); return }; await supabase.from('module_configs').upsert({ user_id: user.id, sector_slug: sectorSlug, module_slug: mod.slug, config_key: 'energy_readings', config_value: items }, { onConflict: 'user_id,sector_slug,module_slug,config_key' }); setSaving(false) }, [supabase, sectorSlug, mod.slug])
  const fetchData = useCallback(async () => { setLoading(true); const { data: { user } } = await supabase.auth.getUser(); if (!user) { setLoading(false); return }; const { data } = await supabase.from('module_configs').select('config_value').eq('user_id', user.id).eq('sector_slug', sectorSlug).eq('module_slug', mod.slug).eq('config_key', 'energy_readings').maybeSingle(); if (data?.config_value && Array.isArray(data.config_value)) setReadings(data.config_value as EnergyReading[]); setLoading(false) }, [supabase, sectorSlug, mod.slug])
  useEffect(() => { fetchData() }, [fetchData])

  const filtered = filterType === 'all' ? readings : readings.filter(r => r.type === filterType)
  const totalCost = readings.reduce((s, r) => s + r.cost, 0)
  const totalElKwh = readings.filter(r => r.type === 'El').reduce((s, r) => s + r.consumption, 0)
  const totalHeatKwh = readings.filter(r => r.type === 'Fjärrvärme').reduce((s, r) => s + r.consumption, 0)
  const avgCostPerM2 = (() => { const withArea = readings.filter(r => r.area > 0); if (withArea.length === 0) return 0; return withArea.reduce((s, r) => s + r.cost / r.area, 0) / withArea.length })()

  function openNew() { setEditing(null); setForm({ ...EMPTY_FORM }); setDialogOpen(true) }
  function openEdit(r: EnergyReading) { setEditing(r); setForm({ property: r.property, type: r.type, period: r.period, consumption: r.consumption, unit: r.unit, cost: r.cost, area: r.area, previousPeriod: r.previousPeriod }); setDialogOpen(true) }
  async function handleSave() { const costPerM2 = form.area > 0 ? form.cost / form.area : 0; const item: EnergyReading = { id: editing?.id ?? crypto.randomUUID(), ...form, property: form.property.trim(), costPerM2 }; const updated = editing ? readings.map(r => r.id === editing.id ? item : r) : [...readings, item]; setReadings(updated); setDialogOpen(false); await saveItems(updated) }
  async function handleDelete() { if (!toDelete) return; const updated = readings.filter(r => r.id !== toDelete.id); setReadings(updated); setDeleteDialogOpen(false); setToDelete(null); await saveItems(updated) }

  return (
    <>
      <ModuleWorkspaceShell title={mod.name} description={mod.desc} category="operativ" sectorName="Fastighet" backHref={`/m/${sectorSlug}`} settingsHref={settingsHref} actions={<Button onClick={openNew}><Plus className="mr-2 h-4 w-4" />Ny avläsning</Button>}>
        <Tabs defaultValue="oversikt" className="space-y-6">
          <TabsList><TabsTrigger value="oversikt">Översikt</TabsTrigger><TabsTrigger value="avlasningar">Avläsningar</TabsTrigger></TabsList>
          <TabsContent value="oversikt" className="space-y-6">
            {loading ? <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div> : readings.length === 0 ? <EmptyModuleState icon={Zap} title="Inga energiavläsningar" description="Övervaka energiförbrukning per fastighet med el, värme, vatten och kostnad per m²." actionLabel="Ny avläsning" onAction={openNew} /> : (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"><KPICard label="Total energikostnad" value={fmt(totalCost)} unit="kr" /><KPICard label="El förbrukning" value={fmt(totalElKwh)} unit="kWh" /><KPICard label="Värme förbrukning" value={fmt(totalHeatKwh)} unit="kWh" /><KPICard label="Snitt kr/m²" value={fmtDec(avgCostPerM2)} unit="kr" /></div>
            )}
          </TabsContent>
          <TabsContent value="avlasningar" className="space-y-4">
            <div className="flex items-center gap-3"><Select value={filterType} onValueChange={val => setFilterType(val as EnergyType | 'all')}><SelectTrigger className="w-[180px]"><SelectValue placeholder="Filtrera typ" /></SelectTrigger><SelectContent><SelectItem value="all">Alla typer</SelectItem>{ENERGY_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent></Select>{saving && <div className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" />Sparar...</div>}</div>
            {filtered.length > 0 && <div className="rounded-xl border border-border overflow-hidden"><table className="w-full text-sm"><thead><tr className="bg-muted/50 border-b"><th className="text-left px-4 py-3 font-medium text-muted-foreground">Fastighet</th><th className="text-left px-4 py-3 font-medium text-muted-foreground">Typ</th><th className="text-left px-4 py-3 font-medium text-muted-foreground">Period</th><th className="text-right px-4 py-3 font-medium text-muted-foreground">Förbrukning</th><th className="text-right px-4 py-3 font-medium text-muted-foreground">Kostnad</th><th className="text-right px-4 py-3 font-medium text-muted-foreground">kr/m²</th><th className="text-right px-4 py-3 font-medium text-muted-foreground">Förändring</th><th className="text-right px-4 py-3 font-medium text-muted-foreground">Åtgärder</th></tr></thead><tbody>{filtered.sort((a, b) => b.period.localeCompare(a.period)).map(r => { const change = r.previousPeriod > 0 ? ((r.consumption - r.previousPeriod) / r.previousPeriod) * 100 : 0; return <tr key={r.id} className="border-b last:border-0"><td className="px-4 py-3 font-medium">{r.property}</td><td className="px-4 py-3"><Badge variant="outline">{r.type}</Badge></td><td className="px-4 py-3">{r.period}</td><td className="px-4 py-3 text-right tabular-nums">{fmt(r.consumption)} {r.unit}</td><td className="px-4 py-3 text-right tabular-nums">{fmt(r.cost)}</td><td className="px-4 py-3 text-right tabular-nums">{fmtDec(r.costPerM2)}</td><td className={`px-4 py-3 text-right tabular-nums ${change <= 0 ? 'text-emerald-600' : 'text-red-600'}`}>{r.previousPeriod > 0 ? `${change > 0 ? '+' : ''}${fmtDec(change)}%` : '-'}</td><td className="px-4 py-3 text-right"><div className="flex items-center justify-end gap-1"><Button variant="ghost" size="icon" onClick={() => openEdit(r)}><Pencil className="h-4 w-4" /></Button><Button variant="ghost" size="icon" className="text-red-600" onClick={() => { setToDelete(r); setDeleteDialogOpen(true) }}><Trash2 className="h-4 w-4" /></Button></div></td></tr> })}</tbody></table></div>}
          </TabsContent>
        </Tabs>
      </ModuleWorkspaceShell>
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}><DialogContent className="max-w-md"><DialogHeader><DialogTitle>{editing ? 'Redigera avläsning' : 'Ny avläsning'}</DialogTitle><DialogDescription>Registrera energiförbrukning.</DialogDescription></DialogHeader><div className="grid gap-4 py-2"><div className="grid grid-cols-2 gap-4"><div className="grid gap-2"><Label>Fastighet *</Label><Input value={form.property} onChange={e => setForm(f => ({ ...f, property: e.target.value }))} /></div><div className="grid gap-2"><Label>Energityp</Label><Select value={form.type} onValueChange={val => { const t = val as EnergyType; setForm(f => ({ ...f, type: t, unit: ENERGY_UNITS[t] })) }}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{ENERGY_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent></Select></div></div><div className="grid grid-cols-2 gap-4"><div className="grid gap-2"><Label>Period</Label><Input value={form.period} onChange={e => setForm(f => ({ ...f, period: e.target.value }))} placeholder="t.ex. 2024-01" /></div><div className="grid gap-2"><Label>Yta (m²)</Label><Input type="number" min={0} value={form.area} onChange={e => setForm(f => ({ ...f, area: parseFloat(e.target.value) || 0 }))} /></div></div><div className="grid grid-cols-3 gap-4"><div className="grid gap-2"><Label>Förbrukning ({form.unit})</Label><Input type="number" min={0} value={form.consumption} onChange={e => setForm(f => ({ ...f, consumption: parseFloat(e.target.value) || 0 }))} /></div><div className="grid gap-2"><Label>Kostnad (kr)</Label><Input type="number" min={0} value={form.cost} onChange={e => setForm(f => ({ ...f, cost: parseFloat(e.target.value) || 0 }))} /></div><div className="grid gap-2"><Label>Föreg. period</Label><Input type="number" min={0} value={form.previousPeriod} onChange={e => setForm(f => ({ ...f, previousPeriod: parseFloat(e.target.value) || 0 }))} /></div></div></div><DialogFooter><Button variant="outline" onClick={() => setDialogOpen(false)}>Avbryt</Button><Button onClick={handleSave} disabled={!form.property.trim()}>{editing ? 'Uppdatera' : 'Skapa'}</Button></DialogFooter></DialogContent></Dialog>
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}><DialogContent className="max-w-sm"><DialogHeader><DialogTitle>Ta bort avläsning</DialogTitle><DialogDescription>Är du säker?</DialogDescription></DialogHeader><DialogFooter><Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>Avbryt</Button><Button variant="destructive" onClick={handleDelete}><Trash2 className="mr-2 h-4 w-4" />Ta bort</Button></DialogFooter></DialogContent></Dialog>
    </>
  )
}
