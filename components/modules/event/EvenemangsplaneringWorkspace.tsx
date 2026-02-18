'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { ModuleWorkspaceShell } from '@/components/modules/ModuleWorkspaceShell'
import { StatusBadge } from '@/components/modules/shared/StatusBadge'
import { EmptyModuleState } from '@/components/modules/shared/EmptyModuleState'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Plus, Pencil, Trash2, Loader2, CalendarDays } from 'lucide-react'

interface ModuleWorkspaceProps { module: { slug: string; name: string; cat: string; desc: string; longDesc: string }; sectorSlug: string; settingsHref: string }
type EventStatus = 'Planering' | 'Bekräftat' | 'Pågående' | 'Genomfört' | 'Inställt'
interface EventItem { id: string; name: string; venue: string; date: string; endDate: string; status: EventStatus; capacity: number; budget: number; notes: string }
function fmt(n: number): string { return new Intl.NumberFormat('sv-SE', { maximumFractionDigits: 0 }).format(n) }
const STATUSES: EventStatus[] = ['Planering', 'Bekräftat', 'Pågående', 'Genomfört', 'Inställt']
const STATUS_MAP: Record<EventStatus, 'neutral' | 'info' | 'success' | 'danger' | 'warning'> = { 'Planering': 'neutral', 'Bekräftat': 'info', 'Pågående': 'warning', 'Genomfört': 'success', 'Inställt': 'danger' }
const EMPTY_FORM = { name: '', venue: '', date: '', endDate: '', status: 'Planering' as EventStatus, capacity: 0, budget: 0, notes: '' }

export function EvenemangsplaneringWorkspace({ module: mod, sectorSlug, settingsHref }: ModuleWorkspaceProps) {
  const supabase = createClient()
  const [loading, setLoading] = useState(true); const [saving, setSaving] = useState(false); const [events, setEvents] = useState<EventItem[]>([]); const [dialogOpen, setDialogOpen] = useState(false); const [editing, setEditing] = useState<EventItem | null>(null); const [form, setForm] = useState(EMPTY_FORM); const [deleteDialogOpen, setDeleteDialogOpen] = useState(false); const [toDelete, setToDelete] = useState<EventItem | null>(null); const [filterStatus, setFilterStatus] = useState<EventStatus | 'all'>('all')

  const saveItems = useCallback(async (items: EventItem[]) => { setSaving(true); const { data: { user } } = await supabase.auth.getUser(); if (!user) { setSaving(false); return }; await supabase.from('module_configs').upsert({ user_id: user.id, sector_slug: sectorSlug, module_slug: mod.slug, config_key: 'events', config_value: items }, { onConflict: 'user_id,sector_slug,module_slug,config_key' }); setSaving(false) }, [supabase, sectorSlug, mod.slug])
  const fetchData = useCallback(async () => { setLoading(true); const { data: { user } } = await supabase.auth.getUser(); if (!user) { setLoading(false); return }; const { data } = await supabase.from('module_configs').select('config_value').eq('user_id', user.id).eq('sector_slug', sectorSlug).eq('module_slug', mod.slug).eq('config_key', 'events').maybeSingle(); if (data?.config_value && Array.isArray(data.config_value)) setEvents(data.config_value as EventItem[]); setLoading(false) }, [supabase, sectorSlug, mod.slug])
  useEffect(() => { fetchData() }, [fetchData])

  const filtered = filterStatus === 'all' ? events : events.filter(e => e.status === filterStatus)
  const upcoming = events.filter(e => e.status !== 'Genomfört' && e.status !== 'Inställt')
  const totalBudget = upcoming.reduce((s, e) => s + e.budget, 0)

  function openNew() { setEditing(null); setForm({ ...EMPTY_FORM }); setDialogOpen(true) }
  function openEdit(e: EventItem) { setEditing(e); setForm({ name: e.name, venue: e.venue, date: e.date, endDate: e.endDate, status: e.status, capacity: e.capacity, budget: e.budget, notes: e.notes }); setDialogOpen(true) }
  async function handleSave() { const item: EventItem = { id: editing?.id ?? crypto.randomUUID(), ...form, name: form.name.trim(), venue: form.venue.trim(), notes: form.notes.trim() }; const updated = editing ? events.map(e => e.id === editing.id ? item : e) : [...events, item]; setEvents(updated); setDialogOpen(false); await saveItems(updated) }
  async function handleDelete() { if (!toDelete) return; const updated = events.filter(e => e.id !== toDelete.id); setEvents(updated); setDeleteDialogOpen(false); setToDelete(null); await saveItems(updated) }
  async function changeStatus(id: string, status: EventStatus) { const updated = events.map(e => e.id === id ? { ...e, status } : e); setEvents(updated); await saveItems(updated) }

  return (
    <>
      <ModuleWorkspaceShell title={mod.name} description={mod.desc} category="operativ" sectorName="Event" backHref={`/m/${sectorSlug}`} settingsHref={settingsHref} actions={<Button onClick={openNew}><Plus className="mr-2 h-4 w-4" />Nytt event</Button>}>
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <Select value={filterStatus} onValueChange={val => setFilterStatus(val as EventStatus | 'all')}><SelectTrigger className="w-[180px]"><SelectValue placeholder="Filter" /></SelectTrigger><SelectContent><SelectItem value="all">Alla status</SelectItem>{STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent></Select>
            <div className="flex items-center gap-4 ml-auto text-sm"><span className="text-muted-foreground">Kommande: <span className="font-medium text-foreground">{upcoming.length}</span></span><span className="text-muted-foreground">Budget: <span className="font-medium text-foreground">{fmt(totalBudget)} kr</span></span></div>
            {saving && <div className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" />Sparar...</div>}
          </div>
          {loading ? <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div> : filtered.length === 0 ? <EmptyModuleState icon={CalendarDays} title="Inga evenemang" description="Planera och hantera evenemang med datum, kapacitet, budget och status." actionLabel="Nytt event" onAction={openNew} /> : (
            <div className="space-y-3">{filtered.sort((a, b) => a.date.localeCompare(b.date)).map(e => (
              <div key={e.id} className="flex items-center justify-between gap-4 rounded-xl border border-border bg-card px-5 py-4">
                <div className="flex flex-col min-w-0"><div className="flex items-center gap-2"><span className="font-medium text-sm">{e.name}</span></div><div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5"><span>{e.venue}</span><span>{e.date}{e.endDate && ` - ${e.endDate}`}</span><span>Kap: {fmt(e.capacity)}</span><span>Budget: {fmt(e.budget)} kr</span></div></div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <Select value={e.status} onValueChange={val => changeStatus(e.id, val as EventStatus)}><SelectTrigger className="h-8 w-[130px]"><StatusBadge label={e.status} variant={STATUS_MAP[e.status]} /></SelectTrigger><SelectContent>{STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent></Select>
                  <Button variant="ghost" size="icon" onClick={() => openEdit(e)}><Pencil className="h-4 w-4" /></Button><Button variant="ghost" size="icon" className="text-red-600" onClick={() => { setToDelete(e); setDeleteDialogOpen(true) }}><Trash2 className="h-4 w-4" /></Button>
                </div>
              </div>
            ))}</div>
          )}
        </div>
      </ModuleWorkspaceShell>
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}><DialogContent className="max-w-md"><DialogHeader><DialogTitle>{editing ? 'Redigera event' : 'Nytt evenemang'}</DialogTitle><DialogDescription>Ange eventuppgifter.</DialogDescription></DialogHeader><div className="grid gap-4 py-2"><div className="grid grid-cols-2 gap-4"><div className="grid gap-2"><Label>Namn *</Label><Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} /></div><div className="grid gap-2"><Label>Plats</Label><Input value={form.venue} onChange={e => setForm(f => ({ ...f, venue: e.target.value }))} /></div></div><div className="grid grid-cols-2 gap-4"><div className="grid gap-2"><Label>Startdatum</Label><Input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} /></div><div className="grid gap-2"><Label>Slutdatum</Label><Input type="date" value={form.endDate} onChange={e => setForm(f => ({ ...f, endDate: e.target.value }))} /></div></div><div className="grid grid-cols-3 gap-4"><div className="grid gap-2"><Label>Status</Label><Select value={form.status} onValueChange={val => setForm(f => ({ ...f, status: val as EventStatus }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent></Select></div><div className="grid gap-2"><Label>Kapacitet</Label><Input type="number" min={0} value={form.capacity} onChange={e => setForm(f => ({ ...f, capacity: parseInt(e.target.value) || 0 }))} /></div><div className="grid gap-2"><Label>Budget (kr)</Label><Input type="number" min={0} value={form.budget} onChange={e => setForm(f => ({ ...f, budget: parseFloat(e.target.value) || 0 }))} /></div></div><div className="grid gap-2"><Label>Anteckningar</Label><Input value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} /></div></div><DialogFooter><Button variant="outline" onClick={() => setDialogOpen(false)}>Avbryt</Button><Button onClick={handleSave} disabled={!form.name.trim()}>{editing ? 'Uppdatera' : 'Skapa'}</Button></DialogFooter></DialogContent></Dialog>
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}><DialogContent className="max-w-sm"><DialogHeader><DialogTitle>Ta bort event</DialogTitle><DialogDescription>Är du säker?</DialogDescription></DialogHeader><DialogFooter><Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>Avbryt</Button><Button variant="destructive" onClick={handleDelete}><Trash2 className="mr-2 h-4 w-4" />Ta bort</Button></DialogFooter></DialogContent></Dialog>
    </>
  )
}
