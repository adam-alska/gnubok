'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { ModuleWorkspaceShell } from '@/components/modules/ModuleWorkspaceShell'
import { StatusBadge } from '@/components/modules/shared/StatusBadge'
import { EmptyModuleState } from '@/components/modules/shared/EmptyModuleState'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Plus, Pencil, Trash2, Loader2, AlertTriangle } from 'lucide-react'

interface ModuleWorkspaceProps { module: { slug: string; name: string; cat: string; desc: string; longDesc: string }; sectorSlug: string; settingsHref: string }
type FaultStatus = 'Ny' | 'Pågående' | 'Väntar material' | 'Åtgärdad' | 'Stängd'
type FaultPriority = 'Akut' | 'Hög' | 'Normal' | 'Låg'
interface FaultReport { id: string; property: string; unit: string; reporter: string; category: string; description: string; priority: FaultPriority; status: FaultStatus; reportedDate: string; resolvedDate: string; cost: number }
function fmt(n: number): string { return new Intl.NumberFormat('sv-SE', { maximumFractionDigits: 0 }).format(n) }
const STATUSES: FaultStatus[] = ['Ny', 'Pågående', 'Väntar material', 'Åtgärdad', 'Stängd']
const STATUS_MAP: Record<FaultStatus, 'neutral' | 'info' | 'success' | 'danger' | 'warning'> = { 'Ny': 'danger', 'Pågående': 'warning', 'Väntar material': 'info', 'Åtgärdad': 'success', 'Stängd': 'neutral' }
const PRIORITIES: FaultPriority[] = ['Akut', 'Hög', 'Normal', 'Låg']
const PRIO_MAP: Record<FaultPriority, 'danger' | 'warning' | 'info' | 'neutral'> = { 'Akut': 'danger', 'Hög': 'warning', 'Normal': 'info', 'Låg': 'neutral' }
const CATEGORIES = ['VVS', 'El', 'Lås/dörr', 'Vitvaror', 'Ventilation', 'Fönster', 'Skadedjur', 'Ytskikt', 'Gemensamma utrymmen', 'Övrigt']
const EMPTY_FORM = { property: '', unit: '', reporter: '', category: 'Övrigt', description: '', priority: 'Normal' as FaultPriority, status: 'Ny' as FaultStatus, reportedDate: '', resolvedDate: '', cost: 0 }

export function FelanmalanWorkspace({ module: mod, sectorSlug, settingsHref }: ModuleWorkspaceProps) {
  const supabase = createClient()
  const [loading, setLoading] = useState(true); const [saving, setSaving] = useState(false); const [reports, setReports] = useState<FaultReport[]>([]); const [dialogOpen, setDialogOpen] = useState(false); const [editing, setEditing] = useState<FaultReport | null>(null); const [form, setForm] = useState(EMPTY_FORM); const [deleteDialogOpen, setDeleteDialogOpen] = useState(false); const [toDelete, setToDelete] = useState<FaultReport | null>(null); const [filterStatus, setFilterStatus] = useState<FaultStatus | 'all'>('all')

  const saveItems = useCallback(async (items: FaultReport[]) => { setSaving(true); const { data: { user } } = await supabase.auth.getUser(); if (!user) { setSaving(false); return }; await supabase.from('module_configs').upsert({ user_id: user.id, sector_slug: sectorSlug, module_slug: mod.slug, config_key: 'fault_reports', config_value: items }, { onConflict: 'user_id,sector_slug,module_slug,config_key' }); setSaving(false) }, [supabase, sectorSlug, mod.slug])
  const fetchData = useCallback(async () => { setLoading(true); const { data: { user } } = await supabase.auth.getUser(); if (!user) { setLoading(false); return }; const { data } = await supabase.from('module_configs').select('config_value').eq('user_id', user.id).eq('sector_slug', sectorSlug).eq('module_slug', mod.slug).eq('config_key', 'fault_reports').maybeSingle(); if (data?.config_value && Array.isArray(data.config_value)) setReports(data.config_value as FaultReport[]); setLoading(false) }, [supabase, sectorSlug, mod.slug])
  useEffect(() => { fetchData() }, [fetchData])

  const filtered = filterStatus === 'all' ? reports : reports.filter(r => r.status === filterStatus)
  const openCount = reports.filter(r => r.status !== 'Åtgärdad' && r.status !== 'Stängd').length
  const urgentCount = reports.filter(r => r.priority === 'Akut' && r.status !== 'Åtgärdad' && r.status !== 'Stängd').length

  function openNew() { setEditing(null); setForm({ ...EMPTY_FORM, reportedDate: new Date().toISOString().split('T')[0] }); setDialogOpen(true) }
  function openEdit(r: FaultReport) { setEditing(r); setForm({ property: r.property, unit: r.unit, reporter: r.reporter, category: r.category, description: r.description, priority: r.priority, status: r.status, reportedDate: r.reportedDate, resolvedDate: r.resolvedDate, cost: r.cost }); setDialogOpen(true) }
  async function handleSave() { const item: FaultReport = { id: editing?.id ?? crypto.randomUUID(), ...form, property: form.property.trim(), unit: form.unit.trim(), reporter: form.reporter.trim(), description: form.description.trim() }; const updated = editing ? reports.map(r => r.id === editing.id ? item : r) : [...reports, item]; setReports(updated); setDialogOpen(false); await saveItems(updated) }
  async function handleDelete() { if (!toDelete) return; const updated = reports.filter(r => r.id !== toDelete.id); setReports(updated); setDeleteDialogOpen(false); setToDelete(null); await saveItems(updated) }

  return (
    <>
      <ModuleWorkspaceShell title={mod.name} description={mod.desc} category="operativ" sectorName="Fastighet" backHref={`/m/${sectorSlug}`} settingsHref={settingsHref} actions={<Button onClick={openNew}><Plus className="mr-2 h-4 w-4" />Ny felanmälan</Button>}>
        <div className="space-y-4">
          <div className="flex items-center gap-3"><Select value={filterStatus} onValueChange={val => setFilterStatus(val as FaultStatus | 'all')}><SelectTrigger className="w-[180px]"><SelectValue placeholder="Filter" /></SelectTrigger><SelectContent><SelectItem value="all">Alla</SelectItem>{STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent></Select><span className="text-sm text-muted-foreground">Öppna: <span className="font-medium text-foreground">{openCount}</span></span>{urgentCount > 0 && <span className="text-sm text-red-600 font-medium">Akuta: {urgentCount}</span>}{saving && <div className="flex items-center gap-2 text-xs text-muted-foreground ml-auto"><Loader2 className="h-3.5 w-3.5 animate-spin" />Sparar...</div>}</div>
          {loading ? <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div> : filtered.length === 0 ? <EmptyModuleState icon={AlertTriangle} title="Inga felanmälningar" description="Hantera felanmälningar med prioritet, kategori, status och kostnad." actionLabel="Ny felanmälan" onAction={openNew} /> : (
            <div className="space-y-2">{filtered.sort((a, b) => { const po = { 'Akut': 0, 'Hög': 1, 'Normal': 2, 'Låg': 3 }; return po[a.priority] - po[b.priority] }).map(r => (
              <div key={r.id} className="flex items-center justify-between gap-4 rounded-xl border border-border bg-card px-5 py-3">
                <div className="flex items-center gap-3 min-w-0"><StatusBadge label={r.priority} variant={PRIO_MAP[r.priority]} /><span className="font-medium text-sm truncate">{r.description}</span><span className="text-xs text-muted-foreground">{r.property} {r.unit}</span><span className="text-xs text-muted-foreground">{r.category}</span></div>
                <div className="flex items-center gap-2 flex-shrink-0"><StatusBadge label={r.status} variant={STATUS_MAP[r.status]} />{r.cost > 0 && <span className="text-xs tabular-nums text-muted-foreground">{fmt(r.cost)} kr</span>}<Button variant="ghost" size="icon" onClick={() => openEdit(r)}><Pencil className="h-4 w-4" /></Button><Button variant="ghost" size="icon" className="text-red-600" onClick={() => { setToDelete(r); setDeleteDialogOpen(true) }}><Trash2 className="h-4 w-4" /></Button></div>
              </div>
            ))}</div>
          )}
        </div>
      </ModuleWorkspaceShell>
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}><DialogContent className="max-w-md"><DialogHeader><DialogTitle>{editing ? 'Redigera felanmälan' : 'Ny felanmälan'}</DialogTitle><DialogDescription>Ange feluppgifter.</DialogDescription></DialogHeader><div className="grid gap-4 py-2"><div className="grid grid-cols-3 gap-4"><div className="grid gap-2"><Label>Fastighet *</Label><Input value={form.property} onChange={e => setForm(f => ({ ...f, property: e.target.value }))} /></div><div className="grid gap-2"><Label>Enhet</Label><Input value={form.unit} onChange={e => setForm(f => ({ ...f, unit: e.target.value }))} /></div><div className="grid gap-2"><Label>Anmälare</Label><Input value={form.reporter} onChange={e => setForm(f => ({ ...f, reporter: e.target.value }))} /></div></div><div className="grid gap-2"><Label>Beskrivning *</Label><Input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} /></div><div className="grid grid-cols-3 gap-4"><div className="grid gap-2"><Label>Kategori</Label><Select value={form.category} onValueChange={val => setForm(f => ({ ...f, category: val }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent></Select></div><div className="grid gap-2"><Label>Prioritet</Label><Select value={form.priority} onValueChange={val => setForm(f => ({ ...f, priority: val as FaultPriority }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{PRIORITIES.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent></Select></div><div className="grid gap-2"><Label>Status</Label><Select value={form.status} onValueChange={val => setForm(f => ({ ...f, status: val as FaultStatus }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent></Select></div></div><div className="grid grid-cols-3 gap-4"><div className="grid gap-2"><Label>Anmälningsdatum</Label><Input type="date" value={form.reportedDate} onChange={e => setForm(f => ({ ...f, reportedDate: e.target.value }))} /></div><div className="grid gap-2"><Label>Åtgärdad datum</Label><Input type="date" value={form.resolvedDate} onChange={e => setForm(f => ({ ...f, resolvedDate: e.target.value }))} /></div><div className="grid gap-2"><Label>Kostnad (kr)</Label><Input type="number" min={0} value={form.cost} onChange={e => setForm(f => ({ ...f, cost: parseFloat(e.target.value) || 0 }))} /></div></div></div><DialogFooter><Button variant="outline" onClick={() => setDialogOpen(false)}>Avbryt</Button><Button onClick={handleSave} disabled={!form.property.trim() || !form.description.trim()}>{editing ? 'Uppdatera' : 'Skapa'}</Button></DialogFooter></DialogContent></Dialog>
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}><DialogContent className="max-w-sm"><DialogHeader><DialogTitle>Ta bort</DialogTitle><DialogDescription>Är du säker?</DialogDescription></DialogHeader><DialogFooter><Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>Avbryt</Button><Button variant="destructive" onClick={handleDelete}><Trash2 className="mr-2 h-4 w-4" />Ta bort</Button></DialogFooter></DialogContent></Dialog>
    </>
  )
}
