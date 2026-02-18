'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { ModuleWorkspaceShell } from '@/components/modules/ModuleWorkspaceShell'
import { KPICard } from '@/components/modules/shared/KPICard'
import { StatusBadge } from '@/components/modules/shared/StatusBadge'
import { EmptyModuleState } from '@/components/modules/shared/EmptyModuleState'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Plus, Pencil, Trash2, Loader2, Calendar } from 'lucide-react'

interface ModuleWorkspaceProps { module: { slug: string; name: string; cat: string; desc: string; longDesc: string }; sectorSlug: string; settingsHref: string }
type PlanStatus = 'Planerad' | 'Pågående' | 'Genomförd' | 'Uppskjuten'
interface MaintenancePlan { id: string; property: string; component: string; description: string; plannedYear: string; estimatedCost: number; actualCost: number; status: PlanStatus; priority: string; contractor: string }
function fmt(n: number): string { return new Intl.NumberFormat('sv-SE', { maximumFractionDigits: 0 }).format(n) }
const STATUSES: PlanStatus[] = ['Planerad', 'Pågående', 'Genomförd', 'Uppskjuten']
const STATUS_MAP: Record<PlanStatus, 'neutral' | 'info' | 'success' | 'danger' | 'warning'> = { 'Planerad': 'neutral', 'Pågående': 'warning', 'Genomförd': 'success', 'Uppskjuten': 'info' }
const EMPTY_FORM = { property: '', component: '', description: '', plannedYear: new Date().getFullYear().toString(), estimatedCost: 0, actualCost: 0, status: 'Planerad' as PlanStatus, priority: 'Normal', contractor: '' }

export function UnderhallsplaneringWorkspace({ module: mod, sectorSlug, settingsHref }: ModuleWorkspaceProps) {
  const supabase = createClient()
  const [loading, setLoading] = useState(true); const [saving, setSaving] = useState(false); const [plans, setPlans] = useState<MaintenancePlan[]>([]); const [dialogOpen, setDialogOpen] = useState(false); const [editing, setEditing] = useState<MaintenancePlan | null>(null); const [form, setForm] = useState(EMPTY_FORM); const [deleteDialogOpen, setDeleteDialogOpen] = useState(false); const [toDelete, setToDelete] = useState<MaintenancePlan | null>(null); const [filterYear, setFilterYear] = useState('all')

  const saveItems = useCallback(async (items: MaintenancePlan[]) => { setSaving(true); const { data: { user } } = await supabase.auth.getUser(); if (!user) { setSaving(false); return }; await supabase.from('module_configs').upsert({ user_id: user.id, sector_slug: sectorSlug, module_slug: mod.slug, config_key: 'maintenance_plans', config_value: items }, { onConflict: 'user_id,sector_slug,module_slug,config_key' }); setSaving(false) }, [supabase, sectorSlug, mod.slug])
  const fetchData = useCallback(async () => { setLoading(true); const { data: { user } } = await supabase.auth.getUser(); if (!user) { setLoading(false); return }; const { data } = await supabase.from('module_configs').select('config_value').eq('user_id', user.id).eq('sector_slug', sectorSlug).eq('module_slug', mod.slug).eq('config_key', 'maintenance_plans').maybeSingle(); if (data?.config_value && Array.isArray(data.config_value)) setPlans(data.config_value as MaintenancePlan[]); setLoading(false) }, [supabase, sectorSlug, mod.slug])
  useEffect(() => { fetchData() }, [fetchData])

  const years = [...new Set(plans.map(p => p.plannedYear))].sort()
  const filtered = filterYear === 'all' ? plans : plans.filter(p => p.plannedYear === filterYear)
  const totalEstimated = filtered.reduce((s, p) => s + p.estimatedCost, 0)
  const totalActual = filtered.filter(p => p.status === 'Genomförd').reduce((s, p) => s + p.actualCost, 0)
  const pendingCount = filtered.filter(p => p.status === 'Planerad' || p.status === 'Pågående').length

  function openNew() { setEditing(null); setForm({ ...EMPTY_FORM }); setDialogOpen(true) }
  function openEdit(p: MaintenancePlan) { setEditing(p); setForm({ property: p.property, component: p.component, description: p.description, plannedYear: p.plannedYear, estimatedCost: p.estimatedCost, actualCost: p.actualCost, status: p.status, priority: p.priority, contractor: p.contractor }); setDialogOpen(true) }
  async function handleSave() { const item: MaintenancePlan = { id: editing?.id ?? crypto.randomUUID(), ...form, property: form.property.trim(), component: form.component.trim(), description: form.description.trim(), contractor: form.contractor.trim() }; const updated = editing ? plans.map(p => p.id === editing.id ? item : p) : [...plans, item]; setPlans(updated); setDialogOpen(false); await saveItems(updated) }
  async function handleDelete() { if (!toDelete) return; const updated = plans.filter(p => p.id !== toDelete.id); setPlans(updated); setDeleteDialogOpen(false); setToDelete(null); await saveItems(updated) }

  return (
    <>
      <ModuleWorkspaceShell title={mod.name} description={mod.desc} category="operativ" sectorName="Fastighet" backHref={`/m/${sectorSlug}`} settingsHref={settingsHref} actions={<Button onClick={openNew}><Plus className="mr-2 h-4 w-4" />Ny plan</Button>}>
        <Tabs defaultValue="oversikt" className="space-y-6">
          <TabsList><TabsTrigger value="oversikt">Översikt</TabsTrigger><TabsTrigger value="planer">Planer</TabsTrigger></TabsList>
          <TabsContent value="oversikt" className="space-y-6">
            <div className="flex items-center gap-3"><Select value={filterYear} onValueChange={setFilterYear}><SelectTrigger className="w-[180px]"><SelectValue placeholder="Filtrera år" /></SelectTrigger><SelectContent><SelectItem value="all">Alla år</SelectItem>{years.map(y => <SelectItem key={y} value={y}>{y}</SelectItem>)}</SelectContent></Select></div>
            {loading ? <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div> : plans.length === 0 ? <EmptyModuleState icon={Calendar} title="Inga underhållsplaner" description="Skapa 10-årig underhållsplan med komponenter, kostnader och tidsplan." actionLabel="Ny plan" onAction={openNew} /> : (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"><KPICard label="Beräknad kostnad" value={fmt(totalEstimated)} unit="kr" /><KPICard label="Faktisk kostnad" value={fmt(totalActual)} unit="kr" /><KPICard label="Pågående/planerade" value={String(pendingCount)} unit="st" /><KPICard label="Totalt åtgärder" value={String(filtered.length)} unit="st" /></div>
            )}
          </TabsContent>
          <TabsContent value="planer" className="space-y-4">
            {filtered.length > 0 && <div className="space-y-2">{filtered.sort((a, b) => a.plannedYear.localeCompare(b.plannedYear)).map(p => (
              <div key={p.id} className="flex items-center justify-between gap-4 rounded-xl border border-border bg-card px-5 py-3">
                <div className="flex items-center gap-3 min-w-0"><span className="text-xs text-muted-foreground w-12">{p.plannedYear}</span><span className="font-medium text-sm truncate">{p.description}</span><span className="text-xs text-muted-foreground">{p.property}</span><span className="text-xs text-muted-foreground">{p.component}</span></div>
                <div className="flex items-center gap-2 flex-shrink-0"><span className="text-sm tabular-nums">{fmt(p.estimatedCost)} kr</span><StatusBadge label={p.status} variant={STATUS_MAP[p.status]} /><Button variant="ghost" size="icon" onClick={() => openEdit(p)}><Pencil className="h-4 w-4" /></Button><Button variant="ghost" size="icon" className="text-red-600" onClick={() => { setToDelete(p); setDeleteDialogOpen(true) }}><Trash2 className="h-4 w-4" /></Button></div>
              </div>
            ))}</div>}
            {saving && <div className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" />Sparar...</div>}
          </TabsContent>
        </Tabs>
      </ModuleWorkspaceShell>
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}><DialogContent className="max-w-md"><DialogHeader><DialogTitle>{editing ? 'Redigera plan' : 'Ny underhållsplan'}</DialogTitle><DialogDescription>Ange planerade åtgärder.</DialogDescription></DialogHeader><div className="grid gap-4 py-2"><div className="grid grid-cols-2 gap-4"><div className="grid gap-2"><Label>Fastighet *</Label><Input value={form.property} onChange={e => setForm(f => ({ ...f, property: e.target.value }))} /></div><div className="grid gap-2"><Label>Komponent</Label><Input value={form.component} onChange={e => setForm(f => ({ ...f, component: e.target.value }))} placeholder="t.ex. Tak, Fasad, VVS" /></div></div><div className="grid gap-2"><Label>Beskrivning *</Label><Input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} /></div><div className="grid grid-cols-3 gap-4"><div className="grid gap-2"><Label>Planerat år</Label><Input value={form.plannedYear} onChange={e => setForm(f => ({ ...f, plannedYear: e.target.value }))} /></div><div className="grid gap-2"><Label>Beräknad (kr)</Label><Input type="number" min={0} value={form.estimatedCost} onChange={e => setForm(f => ({ ...f, estimatedCost: parseFloat(e.target.value) || 0 }))} /></div><div className="grid gap-2"><Label>Faktisk (kr)</Label><Input type="number" min={0} value={form.actualCost} onChange={e => setForm(f => ({ ...f, actualCost: parseFloat(e.target.value) || 0 }))} /></div></div><div className="grid grid-cols-2 gap-4"><div className="grid gap-2"><Label>Status</Label><Select value={form.status} onValueChange={val => setForm(f => ({ ...f, status: val as PlanStatus }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent></Select></div><div className="grid gap-2"><Label>Entreprenör</Label><Input value={form.contractor} onChange={e => setForm(f => ({ ...f, contractor: e.target.value }))} /></div></div></div><DialogFooter><Button variant="outline" onClick={() => setDialogOpen(false)}>Avbryt</Button><Button onClick={handleSave} disabled={!form.property.trim() || !form.description.trim()}>{editing ? 'Uppdatera' : 'Skapa'}</Button></DialogFooter></DialogContent></Dialog>
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}><DialogContent className="max-w-sm"><DialogHeader><DialogTitle>Ta bort plan</DialogTitle><DialogDescription>Är du säker?</DialogDescription></DialogHeader><DialogFooter><Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>Avbryt</Button><Button variant="destructive" onClick={handleDelete}><Trash2 className="mr-2 h-4 w-4" />Ta bort</Button></DialogFooter></DialogContent></Dialog>
    </>
  )
}
