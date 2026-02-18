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
import { Plus, Pencil, Trash2, Loader2, ClipboardCheck } from 'lucide-react'

interface ModuleWorkspaceProps { module: { slug: string; name: string; cat: string; desc: string; longDesc: string }; sectorSlug: string; settingsHref: string }
type InspectionStatus = 'Planerad' | 'Genomförd' | 'Avvikelse' | 'Åtgärdad'
type InspectionType = 'Rondering' | 'OVK' | 'Brandskydd' | 'Hissbesiktning' | 'Elrevision' | 'Energideklaration' | 'Radon' | 'Övrigt'
interface Inspection { id: string; property: string; type: InspectionType; date: string; nextDate: string; inspector: string; status: InspectionStatus; findings: string; actionRequired: string }
const STATUSES: InspectionStatus[] = ['Planerad', 'Genomförd', 'Avvikelse', 'Åtgärdad']
const STATUS_MAP: Record<InspectionStatus, 'neutral' | 'info' | 'success' | 'danger' | 'warning'> = { 'Planerad': 'info', 'Genomförd': 'success', 'Avvikelse': 'danger', 'Åtgärdad': 'success' }
const TYPES: InspectionType[] = ['Rondering', 'OVK', 'Brandskydd', 'Hissbesiktning', 'Elrevision', 'Energideklaration', 'Radon', 'Övrigt']
const EMPTY_FORM = { property: '', type: 'Rondering' as InspectionType, date: '', nextDate: '', inspector: '', status: 'Planerad' as InspectionStatus, findings: '', actionRequired: '' }

export function BesiktningRonderingWorkspace({ module: mod, sectorSlug, settingsHref }: ModuleWorkspaceProps) {
  const supabase = createClient()
  const [loading, setLoading] = useState(true); const [saving, setSaving] = useState(false); const [inspections, setInspections] = useState<Inspection[]>([]); const [dialogOpen, setDialogOpen] = useState(false); const [editing, setEditing] = useState<Inspection | null>(null); const [form, setForm] = useState(EMPTY_FORM); const [deleteDialogOpen, setDeleteDialogOpen] = useState(false); const [toDelete, setToDelete] = useState<Inspection | null>(null); const [filterType, setFilterType] = useState<InspectionType | 'all'>('all')

  const saveItems = useCallback(async (items: Inspection[]) => { setSaving(true); const { data: { user } } = await supabase.auth.getUser(); if (!user) { setSaving(false); return }; await supabase.from('module_configs').upsert({ user_id: user.id, sector_slug: sectorSlug, module_slug: mod.slug, config_key: 'inspections', config_value: items }, { onConflict: 'user_id,sector_slug,module_slug,config_key' }); setSaving(false) }, [supabase, sectorSlug, mod.slug])
  const fetchData = useCallback(async () => { setLoading(true); const { data: { user } } = await supabase.auth.getUser(); if (!user) { setLoading(false); return }; const { data } = await supabase.from('module_configs').select('config_value').eq('user_id', user.id).eq('sector_slug', sectorSlug).eq('module_slug', mod.slug).eq('config_key', 'inspections').maybeSingle(); if (data?.config_value && Array.isArray(data.config_value)) setInspections(data.config_value as Inspection[]); setLoading(false) }, [supabase, sectorSlug, mod.slug])
  useEffect(() => { fetchData() }, [fetchData])

  const filtered = filterType === 'all' ? inspections : inspections.filter(i => i.type === filterType)
  const pendingCount = inspections.filter(i => i.status === 'Planerad').length
  const deviationCount = inspections.filter(i => i.status === 'Avvikelse').length

  function openNew() { setEditing(null); setForm({ ...EMPTY_FORM, date: new Date().toISOString().split('T')[0] }); setDialogOpen(true) }
  function openEdit(i: Inspection) { setEditing(i); setForm({ property: i.property, type: i.type, date: i.date, nextDate: i.nextDate, inspector: i.inspector, status: i.status, findings: i.findings, actionRequired: i.actionRequired }); setDialogOpen(true) }
  async function handleSave() { const item: Inspection = { id: editing?.id ?? crypto.randomUUID(), ...form, property: form.property.trim(), inspector: form.inspector.trim(), findings: form.findings.trim(), actionRequired: form.actionRequired.trim() }; const updated = editing ? inspections.map(i => i.id === editing.id ? item : i) : [...inspections, item]; setInspections(updated); setDialogOpen(false); await saveItems(updated) }
  async function handleDelete() { if (!toDelete) return; const updated = inspections.filter(i => i.id !== toDelete.id); setInspections(updated); setDeleteDialogOpen(false); setToDelete(null); await saveItems(updated) }

  return (
    <>
      <ModuleWorkspaceShell title={mod.name} description={mod.desc} category="operativ" sectorName="Fastighet" backHref={`/m/${sectorSlug}`} settingsHref={settingsHref} actions={<Button onClick={openNew}><Plus className="mr-2 h-4 w-4" />Ny besiktning</Button>}>
        <div className="space-y-4">
          <div className="flex items-center gap-3"><Select value={filterType} onValueChange={val => setFilterType(val as InspectionType | 'all')}><SelectTrigger className="w-[200px]"><SelectValue placeholder="Filtrera typ" /></SelectTrigger><SelectContent><SelectItem value="all">Alla typer</SelectItem>{TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent></Select><span className="text-sm text-muted-foreground">Planerade: <span className="font-medium text-foreground">{pendingCount}</span></span>{deviationCount > 0 && <span className="text-sm text-red-600 font-medium">Avvikelser: {deviationCount}</span>}{saving && <div className="flex items-center gap-2 text-xs text-muted-foreground ml-auto"><Loader2 className="h-3.5 w-3.5 animate-spin" />Sparar...</div>}</div>
          {loading ? <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div> : filtered.length === 0 ? <EmptyModuleState icon={ClipboardCheck} title="Inga besiktningar" description="Hantera besiktningsprotokoll, ronderingar, OVK, brandskydd och andra obligatoriska kontroller." actionLabel="Ny besiktning" onAction={openNew} /> : (
            <div className="space-y-2">{filtered.sort((a, b) => b.date.localeCompare(a.date)).map(i => (
              <div key={i.id} className="flex items-center justify-between gap-4 rounded-xl border border-border bg-card px-5 py-3">
                <div className="flex items-center gap-3 min-w-0"><StatusBadge label={i.type} variant="info" /><span className="font-medium text-sm">{i.property}</span><span className="text-xs text-muted-foreground">{i.date}</span>{i.nextDate && <span className="text-xs text-muted-foreground">Nästa: {i.nextDate}</span>}{i.inspector && <span className="text-xs text-muted-foreground">{i.inspector}</span>}</div>
                <div className="flex items-center gap-2 flex-shrink-0"><StatusBadge label={i.status} variant={STATUS_MAP[i.status]} /><Button variant="ghost" size="icon" onClick={() => openEdit(i)}><Pencil className="h-4 w-4" /></Button><Button variant="ghost" size="icon" className="text-red-600" onClick={() => { setToDelete(i); setDeleteDialogOpen(true) }}><Trash2 className="h-4 w-4" /></Button></div>
              </div>
            ))}</div>
          )}
        </div>
      </ModuleWorkspaceShell>
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}><DialogContent className="max-w-md"><DialogHeader><DialogTitle>{editing ? 'Redigera besiktning' : 'Ny besiktning'}</DialogTitle><DialogDescription>Ange besiktningsuppgifter.</DialogDescription></DialogHeader><div className="grid gap-4 py-2"><div className="grid grid-cols-2 gap-4"><div className="grid gap-2"><Label>Fastighet *</Label><Input value={form.property} onChange={e => setForm(f => ({ ...f, property: e.target.value }))} /></div><div className="grid gap-2"><Label>Typ</Label><Select value={form.type} onValueChange={val => setForm(f => ({ ...f, type: val as InspectionType }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent></Select></div></div><div className="grid grid-cols-3 gap-4"><div className="grid gap-2"><Label>Datum</Label><Input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} /></div><div className="grid gap-2"><Label>Nästa datum</Label><Input type="date" value={form.nextDate} onChange={e => setForm(f => ({ ...f, nextDate: e.target.value }))} /></div><div className="grid gap-2"><Label>Status</Label><Select value={form.status} onValueChange={val => setForm(f => ({ ...f, status: val as InspectionStatus }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent></Select></div></div><div className="grid gap-2"><Label>Inspektör</Label><Input value={form.inspector} onChange={e => setForm(f => ({ ...f, inspector: e.target.value }))} /></div><div className="grid gap-2"><Label>Fynd/observationer</Label><Input value={form.findings} onChange={e => setForm(f => ({ ...f, findings: e.target.value }))} /></div><div className="grid gap-2"><Label>Åtgärd krävs</Label><Input value={form.actionRequired} onChange={e => setForm(f => ({ ...f, actionRequired: e.target.value }))} /></div></div><DialogFooter><Button variant="outline" onClick={() => setDialogOpen(false)}>Avbryt</Button><Button onClick={handleSave} disabled={!form.property.trim()}>{editing ? 'Uppdatera' : 'Skapa'}</Button></DialogFooter></DialogContent></Dialog>
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}><DialogContent className="max-w-sm"><DialogHeader><DialogTitle>Ta bort besiktning</DialogTitle><DialogDescription>Är du säker?</DialogDescription></DialogHeader><DialogFooter><Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>Avbryt</Button><Button variant="destructive" onClick={handleDelete}><Trash2 className="mr-2 h-4 w-4" />Ta bort</Button></DialogFooter></DialogContent></Dialog>
    </>
  )
}
