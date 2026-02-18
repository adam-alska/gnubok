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
import { Plus, Pencil, Trash2, Loader2, Music } from 'lucide-react'

interface ModuleWorkspaceProps { module: { slug: string; name: string; cat: string; desc: string; longDesc: string }; sectorSlug: string; settingsHref: string }
type BookingStatus = 'Förfrågan' | 'Offert' | 'Bekräftad' | 'Avtal signerat' | 'Avbokad'
interface Booking { id: string; artist: string; agent: string; event: string; date: string; fee: number; currency: string; status: BookingStatus; technicalReqs: string; travelIncluded: boolean }
function fmt(n: number): string { return new Intl.NumberFormat('sv-SE', { maximumFractionDigits: 0 }).format(n) }
const STATUSES: BookingStatus[] = ['Förfrågan', 'Offert', 'Bekräftad', 'Avtal signerat', 'Avbokad']
const STATUS_MAP: Record<BookingStatus, 'neutral' | 'info' | 'success' | 'danger' | 'warning'> = { 'Förfrågan': 'neutral', 'Offert': 'info', 'Bekräftad': 'warning', 'Avtal signerat': 'success', 'Avbokad': 'danger' }
const EMPTY_FORM = { artist: '', agent: '', event: '', date: '', fee: 0, currency: 'SEK', status: 'Förfrågan' as BookingStatus, technicalReqs: '', travelIncluded: false }

export function ArtistTalangbokningWorkspace({ module: mod, sectorSlug, settingsHref }: ModuleWorkspaceProps) {
  const supabase = createClient()
  const [loading, setLoading] = useState(true); const [saving, setSaving] = useState(false); const [bookings, setBookings] = useState<Booking[]>([]); const [dialogOpen, setDialogOpen] = useState(false); const [editing, setEditing] = useState<Booking | null>(null); const [form, setForm] = useState(EMPTY_FORM); const [deleteDialogOpen, setDeleteDialogOpen] = useState(false); const [toDelete, setToDelete] = useState<Booking | null>(null); const [filterStatus, setFilterStatus] = useState<BookingStatus | 'all'>('all')

  const saveItems = useCallback(async (items: Booking[]) => { setSaving(true); const { data: { user } } = await supabase.auth.getUser(); if (!user) { setSaving(false); return }; await supabase.from('module_configs').upsert({ user_id: user.id, sector_slug: sectorSlug, module_slug: mod.slug, config_key: 'bookings', config_value: items }, { onConflict: 'user_id,sector_slug,module_slug,config_key' }); setSaving(false) }, [supabase, sectorSlug, mod.slug])
  const fetchData = useCallback(async () => { setLoading(true); const { data: { user } } = await supabase.auth.getUser(); if (!user) { setLoading(false); return }; const { data } = await supabase.from('module_configs').select('config_value').eq('user_id', user.id).eq('sector_slug', sectorSlug).eq('module_slug', mod.slug).eq('config_key', 'bookings').maybeSingle(); if (data?.config_value && Array.isArray(data.config_value)) setBookings(data.config_value as Booking[]); setLoading(false) }, [supabase, sectorSlug, mod.slug])
  useEffect(() => { fetchData() }, [fetchData])

  const filtered = filterStatus === 'all' ? bookings : bookings.filter(b => b.status === filterStatus)
  const totalFees = bookings.filter(b => b.status !== 'Avbokad').reduce((s, b) => s + b.fee, 0)

  function openNew() { setEditing(null); setForm({ ...EMPTY_FORM }); setDialogOpen(true) }
  function openEdit(b: Booking) { setEditing(b); setForm({ artist: b.artist, agent: b.agent, event: b.event, date: b.date, fee: b.fee, currency: b.currency, status: b.status, technicalReqs: b.technicalReqs, travelIncluded: b.travelIncluded }); setDialogOpen(true) }
  async function handleSave() { const item: Booking = { id: editing?.id ?? crypto.randomUUID(), ...form, artist: form.artist.trim(), agent: form.agent.trim(), event: form.event.trim(), technicalReqs: form.technicalReqs.trim() }; const updated = editing ? bookings.map(b => b.id === editing.id ? item : b) : [...bookings, item]; setBookings(updated); setDialogOpen(false); await saveItems(updated) }
  async function handleDelete() { if (!toDelete) return; const updated = bookings.filter(b => b.id !== toDelete.id); setBookings(updated); setDeleteDialogOpen(false); setToDelete(null); await saveItems(updated) }

  return (
    <>
      <ModuleWorkspaceShell title={mod.name} description={mod.desc} category="operativ" sectorName="Event" backHref={`/m/${sectorSlug}`} settingsHref={settingsHref} actions={<Button onClick={openNew}><Plus className="mr-2 h-4 w-4" />Ny bokning</Button>}>
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <Select value={filterStatus} onValueChange={val => setFilterStatus(val as BookingStatus | 'all')}><SelectTrigger className="w-[180px]"><SelectValue placeholder="Filter" /></SelectTrigger><SelectContent><SelectItem value="all">Alla status</SelectItem>{STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent></Select>
            <span className="ml-auto text-sm text-muted-foreground">Total gage: <span className="font-medium text-foreground">{fmt(totalFees)} kr</span></span>
            {saving && <div className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" />Sparar...</div>}
          </div>
          {loading ? <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div> : filtered.length === 0 ? <EmptyModuleState icon={Music} title="Inga bokningar" description="Hantera artist- och talangbokningar med avtal, gage, tekniska krav och status." actionLabel="Ny bokning" onAction={openNew} /> : (
            <div className="space-y-3">{filtered.sort((a, b) => a.date.localeCompare(b.date)).map(b => (
              <div key={b.id} className="flex items-center justify-between gap-4 rounded-xl border border-border bg-card px-5 py-4">
                <div className="flex flex-col min-w-0"><div className="flex items-center gap-2"><span className="font-medium text-sm">{b.artist}</span></div><div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5"><span>{b.event}</span><span>{b.date}</span><span>{fmt(b.fee)} {b.currency}</span>{b.agent && <span>Agent: {b.agent}</span>}{b.travelIncluded && <span>Resa inkl.</span>}</div></div>
                <div className="flex items-center gap-2 flex-shrink-0"><StatusBadge label={b.status} variant={STATUS_MAP[b.status]} /><Button variant="ghost" size="icon" onClick={() => openEdit(b)}><Pencil className="h-4 w-4" /></Button><Button variant="ghost" size="icon" className="text-red-600" onClick={() => { setToDelete(b); setDeleteDialogOpen(true) }}><Trash2 className="h-4 w-4" /></Button></div>
              </div>
            ))}</div>
          )}
        </div>
      </ModuleWorkspaceShell>
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}><DialogContent className="max-w-md"><DialogHeader><DialogTitle>{editing ? 'Redigera bokning' : 'Ny bokning'}</DialogTitle><DialogDescription>Ange bokningsuppgifter.</DialogDescription></DialogHeader><div className="grid gap-4 py-2"><div className="grid grid-cols-2 gap-4"><div className="grid gap-2"><Label>Artist/talang *</Label><Input value={form.artist} onChange={e => setForm(f => ({ ...f, artist: e.target.value }))} /></div><div className="grid gap-2"><Label>Agent</Label><Input value={form.agent} onChange={e => setForm(f => ({ ...f, agent: e.target.value }))} /></div></div><div className="grid grid-cols-2 gap-4"><div className="grid gap-2"><Label>Event *</Label><Input value={form.event} onChange={e => setForm(f => ({ ...f, event: e.target.value }))} /></div><div className="grid gap-2"><Label>Datum</Label><Input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} /></div></div><div className="grid grid-cols-3 gap-4"><div className="grid gap-2"><Label>Gage</Label><Input type="number" min={0} value={form.fee} onChange={e => setForm(f => ({ ...f, fee: parseFloat(e.target.value) || 0 }))} /></div><div className="grid gap-2"><Label>Valuta</Label><Select value={form.currency} onValueChange={val => setForm(f => ({ ...f, currency: val }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="SEK">SEK</SelectItem><SelectItem value="EUR">EUR</SelectItem><SelectItem value="USD">USD</SelectItem><SelectItem value="GBP">GBP</SelectItem></SelectContent></Select></div><div className="grid gap-2"><Label>Status</Label><Select value={form.status} onValueChange={val => setForm(f => ({ ...f, status: val as BookingStatus }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent></Select></div></div><div className="grid gap-2"><Label>Tekniska krav</Label><Input value={form.technicalReqs} onChange={e => setForm(f => ({ ...f, technicalReqs: e.target.value }))} /></div><div className="flex items-center gap-3"><input type="checkbox" checked={form.travelIncluded} onChange={e => setForm(f => ({ ...f, travelIncluded: e.target.checked }))} className="h-4 w-4" /><Label>Resa inkluderad</Label></div></div><DialogFooter><Button variant="outline" onClick={() => setDialogOpen(false)}>Avbryt</Button><Button onClick={handleSave} disabled={!form.artist.trim() || !form.event.trim()}>{editing ? 'Uppdatera' : 'Skapa'}</Button></DialogFooter></DialogContent></Dialog>
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}><DialogContent className="max-w-sm"><DialogHeader><DialogTitle>Ta bort bokning</DialogTitle><DialogDescription>Är du säker?</DialogDescription></DialogHeader><DialogFooter><Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>Avbryt</Button><Button variant="destructive" onClick={handleDelete}><Trash2 className="mr-2 h-4 w-4" />Ta bort</Button></DialogFooter></DialogContent></Dialog>
    </>
  )
}
