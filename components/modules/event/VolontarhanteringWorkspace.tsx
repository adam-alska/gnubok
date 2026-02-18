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
import { Plus, Pencil, Trash2, Loader2, Heart } from 'lucide-react'

interface ModuleWorkspaceProps { module: { slug: string; name: string; cat: string; desc: string; longDesc: string }; sectorSlug: string; settingsHref: string }
type VolunteerStatus = 'Anmäld' | 'Bekräftad' | 'Incheckad' | 'Avbokad'
type VolunteerRole = 'Entré' | 'Bar' | 'Säkerhet' | 'Scen' | 'Logistik' | 'Info' | 'VIP' | 'Övrigt'
interface Volunteer { id: string; name: string; email: string; phone: string; event: string; role: VolunteerRole; status: VolunteerStatus; shiftStart: string; shiftEnd: string; notes: string }
const STATUSES: VolunteerStatus[] = ['Anmäld', 'Bekräftad', 'Incheckad', 'Avbokad']
const STATUS_MAP: Record<VolunteerStatus, 'neutral' | 'info' | 'success' | 'danger' | 'warning'> = { 'Anmäld': 'neutral', 'Bekräftad': 'info', 'Incheckad': 'success', 'Avbokad': 'danger' }
const ROLES: VolunteerRole[] = ['Entré', 'Bar', 'Säkerhet', 'Scen', 'Logistik', 'Info', 'VIP', 'Övrigt']
const EMPTY_FORM = { name: '', email: '', phone: '', event: '', role: 'Övrigt' as VolunteerRole, status: 'Anmäld' as VolunteerStatus, shiftStart: '', shiftEnd: '', notes: '' }

export function VolontarhanteringWorkspace({ module: mod, sectorSlug, settingsHref }: ModuleWorkspaceProps) {
  const supabase = createClient()
  const [loading, setLoading] = useState(true); const [saving, setSaving] = useState(false); const [volunteers, setVolunteers] = useState<Volunteer[]>([]); const [dialogOpen, setDialogOpen] = useState(false); const [editing, setEditing] = useState<Volunteer | null>(null); const [form, setForm] = useState(EMPTY_FORM); const [deleteDialogOpen, setDeleteDialogOpen] = useState(false); const [toDelete, setToDelete] = useState<Volunteer | null>(null); const [filterRole, setFilterRole] = useState<VolunteerRole | 'all'>('all')

  const saveItems = useCallback(async (items: Volunteer[]) => { setSaving(true); const { data: { user } } = await supabase.auth.getUser(); if (!user) { setSaving(false); return }; await supabase.from('module_configs').upsert({ user_id: user.id, sector_slug: sectorSlug, module_slug: mod.slug, config_key: 'volunteers', config_value: items }, { onConflict: 'user_id,sector_slug,module_slug,config_key' }); setSaving(false) }, [supabase, sectorSlug, mod.slug])
  const fetchData = useCallback(async () => { setLoading(true); const { data: { user } } = await supabase.auth.getUser(); if (!user) { setLoading(false); return }; const { data } = await supabase.from('module_configs').select('config_value').eq('user_id', user.id).eq('sector_slug', sectorSlug).eq('module_slug', mod.slug).eq('config_key', 'volunteers').maybeSingle(); if (data?.config_value && Array.isArray(data.config_value)) setVolunteers(data.config_value as Volunteer[]); setLoading(false) }, [supabase, sectorSlug, mod.slug])
  useEffect(() => { fetchData() }, [fetchData])

  const filtered = filterRole === 'all' ? volunteers : volunteers.filter(v => v.role === filterRole)
  const confirmed = volunteers.filter(v => v.status === 'Bekräftad' || v.status === 'Incheckad').length
  const checkedIn = volunteers.filter(v => v.status === 'Incheckad').length

  function openNew() { setEditing(null); setForm({ ...EMPTY_FORM }); setDialogOpen(true) }
  function openEdit(v: Volunteer) { setEditing(v); setForm({ name: v.name, email: v.email, phone: v.phone, event: v.event, role: v.role, status: v.status, shiftStart: v.shiftStart, shiftEnd: v.shiftEnd, notes: v.notes }); setDialogOpen(true) }
  async function handleSave() { const item: Volunteer = { id: editing?.id ?? crypto.randomUUID(), ...form, name: form.name.trim(), email: form.email.trim(), phone: form.phone.trim(), event: form.event.trim(), notes: form.notes.trim() }; const updated = editing ? volunteers.map(v => v.id === editing.id ? item : v) : [...volunteers, item]; setVolunteers(updated); setDialogOpen(false); await saveItems(updated) }
  async function handleDelete() { if (!toDelete) return; const updated = volunteers.filter(v => v.id !== toDelete.id); setVolunteers(updated); setDeleteDialogOpen(false); setToDelete(null); await saveItems(updated) }
  async function checkIn(id: string) { const updated = volunteers.map(v => v.id === id ? { ...v, status: 'Incheckad' as VolunteerStatus } : v); setVolunteers(updated); await saveItems(updated) }

  return (
    <>
      <ModuleWorkspaceShell title={mod.name} description={mod.desc} category="operativ" sectorName="Event" backHref={`/m/${sectorSlug}`} settingsHref={settingsHref} actions={<Button onClick={openNew}><Plus className="mr-2 h-4 w-4" />Ny volontär</Button>}>
        <Tabs defaultValue="oversikt" className="space-y-6">
          <TabsList><TabsTrigger value="oversikt">Översikt</TabsTrigger><TabsTrigger value="lista">Lista</TabsTrigger></TabsList>
          <TabsContent value="oversikt" className="space-y-6">
            {loading ? <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div> : volunteers.length === 0 ? <EmptyModuleState icon={Heart} title="Inga volontärer" description="Hantera volontärer med roller, scheman, incheckning och kontaktinfo." actionLabel="Ny volontär" onAction={openNew} /> : (
              <div className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"><KPICard label="Totalt anmälda" value={String(volunteers.length)} unit="st" /><KPICard label="Bekräftade" value={String(confirmed)} unit="st" /><KPICard label="Incheckade" value={String(checkedIn)} unit="st" /><KPICard label="Roller" value={String(new Set(volunteers.map(v => v.role)).size)} unit="st" /></div>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{ROLES.map(r => { const count = volunteers.filter(v => v.role === r && v.status !== 'Avbokad').length; return count > 0 ? <div key={r} className="rounded-xl border border-border bg-card p-4"><p className="text-xs font-medium text-muted-foreground uppercase">{r}</p><p className="text-xl font-semibold mt-1">{count} <span className="text-sm font-normal text-muted-foreground">volontärer</span></p></div> : null })}</div>
              </div>
            )}
          </TabsContent>
          <TabsContent value="lista" className="space-y-4">
            <div className="flex items-center gap-3">
              <Select value={filterRole} onValueChange={val => setFilterRole(val as VolunteerRole | 'all')}><SelectTrigger className="w-[180px]"><SelectValue placeholder="Filter roll" /></SelectTrigger><SelectContent><SelectItem value="all">Alla roller</SelectItem>{ROLES.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent></Select>
              {saving && <div className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" />Sparar...</div>}
            </div>
            {filtered.length > 0 && <div className="space-y-2">{filtered.map(v => (
              <div key={v.id} className="flex items-center justify-between gap-4 rounded-xl border border-border bg-card px-5 py-3">
                <div className="flex items-center gap-3 min-w-0"><span className="font-medium text-sm">{v.name}</span><StatusBadge label={v.role} variant="info" /><span className="text-xs text-muted-foreground">{v.event}</span>{v.shiftStart && <span className="text-xs text-muted-foreground">{v.shiftStart} - {v.shiftEnd}</span>}</div>
                <div className="flex items-center gap-2 flex-shrink-0"><StatusBadge label={v.status} variant={STATUS_MAP[v.status]} />{v.status === 'Bekräftad' && <Button variant="outline" size="sm" onClick={() => checkIn(v.id)}>Checka in</Button>}<Button variant="ghost" size="icon" onClick={() => openEdit(v)}><Pencil className="h-4 w-4" /></Button><Button variant="ghost" size="icon" className="text-red-600" onClick={() => { setToDelete(v); setDeleteDialogOpen(true) }}><Trash2 className="h-4 w-4" /></Button></div>
              </div>
            ))}</div>}
          </TabsContent>
        </Tabs>
      </ModuleWorkspaceShell>
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}><DialogContent className="max-w-md"><DialogHeader><DialogTitle>{editing ? 'Redigera volontär' : 'Ny volontär'}</DialogTitle><DialogDescription>Ange volontäruppgifter.</DialogDescription></DialogHeader><div className="grid gap-4 py-2"><div className="grid grid-cols-2 gap-4"><div className="grid gap-2"><Label>Namn *</Label><Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} /></div><div className="grid gap-2"><Label>E-post</Label><Input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} /></div></div><div className="grid grid-cols-2 gap-4"><div className="grid gap-2"><Label>Telefon</Label><Input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} /></div><div className="grid gap-2"><Label>Event</Label><Input value={form.event} onChange={e => setForm(f => ({ ...f, event: e.target.value }))} /></div></div><div className="grid grid-cols-2 gap-4"><div className="grid gap-2"><Label>Roll</Label><Select value={form.role} onValueChange={val => setForm(f => ({ ...f, role: val as VolunteerRole }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{ROLES.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent></Select></div><div className="grid gap-2"><Label>Status</Label><Select value={form.status} onValueChange={val => setForm(f => ({ ...f, status: val as VolunteerStatus }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent></Select></div></div><div className="grid grid-cols-2 gap-4"><div className="grid gap-2"><Label>Pass start</Label><Input type="time" value={form.shiftStart} onChange={e => setForm(f => ({ ...f, shiftStart: e.target.value }))} /></div><div className="grid gap-2"><Label>Pass slut</Label><Input type="time" value={form.shiftEnd} onChange={e => setForm(f => ({ ...f, shiftEnd: e.target.value }))} /></div></div><div className="grid gap-2"><Label>Anteckningar</Label><Input value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} /></div></div><DialogFooter><Button variant="outline" onClick={() => setDialogOpen(false)}>Avbryt</Button><Button onClick={handleSave} disabled={!form.name.trim()}>{editing ? 'Uppdatera' : 'Skapa'}</Button></DialogFooter></DialogContent></Dialog>
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}><DialogContent className="max-w-sm"><DialogHeader><DialogTitle>Ta bort volontär</DialogTitle><DialogDescription>Är du säker?</DialogDescription></DialogHeader><DialogFooter><Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>Avbryt</Button><Button variant="destructive" onClick={handleDelete}><Trash2 className="mr-2 h-4 w-4" />Ta bort</Button></DialogFooter></DialogContent></Dialog>
    </>
  )
}
