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
import { Plus, Pencil, Trash2, Loader2, Handshake } from 'lucide-react'

interface ModuleWorkspaceProps { module: { slug: string; name: string; cat: string; desc: string; longDesc: string }; sectorSlug: string; settingsHref: string }
type SponsorStatus = 'Prospekt' | 'Kontaktad' | 'Förhandling' | 'Avtal' | 'Aktiv' | 'Avslutad'
type SponsorLevel = 'Guld' | 'Silver' | 'Brons' | 'Partner' | 'Mediepartner'
interface Sponsor { id: string; name: string; contactPerson: string; email: string; level: SponsorLevel; amount: number; status: SponsorStatus; event: string; deliverables: string; contractEnd: string }
function fmt(n: number): string { return new Intl.NumberFormat('sv-SE', { maximumFractionDigits: 0 }).format(n) }
const STATUSES: SponsorStatus[] = ['Prospekt', 'Kontaktad', 'Förhandling', 'Avtal', 'Aktiv', 'Avslutad']
const STATUS_MAP: Record<SponsorStatus, 'neutral' | 'info' | 'success' | 'danger' | 'warning'> = { 'Prospekt': 'neutral', 'Kontaktad': 'info', 'Förhandling': 'warning', 'Avtal': 'info', 'Aktiv': 'success', 'Avslutad': 'neutral' }
const LEVELS: SponsorLevel[] = ['Guld', 'Silver', 'Brons', 'Partner', 'Mediepartner']
const EMPTY_FORM = { name: '', contactPerson: '', email: '', level: 'Brons' as SponsorLevel, amount: 0, status: 'Prospekt' as SponsorStatus, event: '', deliverables: '', contractEnd: '' }

export function SponsorhanteringWorkspace({ module: mod, sectorSlug, settingsHref }: ModuleWorkspaceProps) {
  const supabase = createClient()
  const [loading, setLoading] = useState(true); const [saving, setSaving] = useState(false); const [sponsors, setSponsors] = useState<Sponsor[]>([]); const [dialogOpen, setDialogOpen] = useState(false); const [editing, setEditing] = useState<Sponsor | null>(null); const [form, setForm] = useState(EMPTY_FORM); const [deleteDialogOpen, setDeleteDialogOpen] = useState(false); const [toDelete, setToDelete] = useState<Sponsor | null>(null); const [filterStatus, setFilterStatus] = useState<SponsorStatus | 'all'>('all')

  const saveItems = useCallback(async (items: Sponsor[]) => { setSaving(true); const { data: { user } } = await supabase.auth.getUser(); if (!user) { setSaving(false); return }; await supabase.from('module_configs').upsert({ user_id: user.id, sector_slug: sectorSlug, module_slug: mod.slug, config_key: 'sponsors', config_value: items }, { onConflict: 'user_id,sector_slug,module_slug,config_key' }); setSaving(false) }, [supabase, sectorSlug, mod.slug])
  const fetchData = useCallback(async () => { setLoading(true); const { data: { user } } = await supabase.auth.getUser(); if (!user) { setLoading(false); return }; const { data } = await supabase.from('module_configs').select('config_value').eq('user_id', user.id).eq('sector_slug', sectorSlug).eq('module_slug', mod.slug).eq('config_key', 'sponsors').maybeSingle(); if (data?.config_value && Array.isArray(data.config_value)) setSponsors(data.config_value as Sponsor[]); setLoading(false) }, [supabase, sectorSlug, mod.slug])
  useEffect(() => { fetchData() }, [fetchData])

  const filtered = filterStatus === 'all' ? sponsors : sponsors.filter(s => s.status === filterStatus)
  const totalActive = sponsors.filter(s => s.status === 'Aktiv' || s.status === 'Avtal').reduce((s, sp) => s + sp.amount, 0)

  function openNew() { setEditing(null); setForm({ ...EMPTY_FORM }); setDialogOpen(true) }
  function openEdit(s: Sponsor) { setEditing(s); setForm({ name: s.name, contactPerson: s.contactPerson, email: s.email, level: s.level, amount: s.amount, status: s.status, event: s.event, deliverables: s.deliverables, contractEnd: s.contractEnd }); setDialogOpen(true) }
  async function handleSave() { const item: Sponsor = { id: editing?.id ?? crypto.randomUUID(), ...form, name: form.name.trim(), contactPerson: form.contactPerson.trim(), email: form.email.trim(), deliverables: form.deliverables.trim(), event: form.event.trim() }; const updated = editing ? sponsors.map(s => s.id === editing.id ? item : s) : [...sponsors, item]; setSponsors(updated); setDialogOpen(false); await saveItems(updated) }
  async function handleDelete() { if (!toDelete) return; const updated = sponsors.filter(s => s.id !== toDelete.id); setSponsors(updated); setDeleteDialogOpen(false); setToDelete(null); await saveItems(updated) }

  return (
    <>
      <ModuleWorkspaceShell title={mod.name} description={mod.desc} category="operativ" sectorName="Event" backHref={`/m/${sectorSlug}`} settingsHref={settingsHref} actions={<Button onClick={openNew}><Plus className="mr-2 h-4 w-4" />Ny sponsor</Button>}>
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <Select value={filterStatus} onValueChange={val => setFilterStatus(val as SponsorStatus | 'all')}><SelectTrigger className="w-[180px]"><SelectValue placeholder="Filter" /></SelectTrigger><SelectContent><SelectItem value="all">Alla status</SelectItem>{STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent></Select>
            <span className="ml-auto text-sm text-muted-foreground">Aktivt värde: <span className="font-medium text-foreground">{fmt(totalActive)} kr</span></span>
            {saving && <div className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" />Sparar...</div>}
          </div>
          {loading ? <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div> : filtered.length === 0 ? <EmptyModuleState icon={Handshake} title="Inga sponsorer" description="Hantera sponsorrelationer med nivåer, avtal, leveranser och pipeline." actionLabel="Ny sponsor" onAction={openNew} /> : (
            <div className="space-y-3">{filtered.map(s => (
              <div key={s.id} className="flex items-center justify-between gap-4 rounded-xl border border-border bg-card px-5 py-4">
                <div className="flex flex-col min-w-0"><div className="flex items-center gap-2"><span className="font-medium text-sm">{s.name}</span><StatusBadge label={s.level} variant={s.level === 'Guld' ? 'warning' : s.level === 'Silver' ? 'neutral' : 'info'} /></div><div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5"><span>{s.contactPerson}</span><span>{s.event}</span><span>{fmt(s.amount)} kr</span>{s.contractEnd && <span>Avtal t.o.m. {s.contractEnd}</span>}</div></div>
                <div className="flex items-center gap-2 flex-shrink-0"><StatusBadge label={s.status} variant={STATUS_MAP[s.status]} /><Button variant="ghost" size="icon" onClick={() => openEdit(s)}><Pencil className="h-4 w-4" /></Button><Button variant="ghost" size="icon" className="text-red-600" onClick={() => { setToDelete(s); setDeleteDialogOpen(true) }}><Trash2 className="h-4 w-4" /></Button></div>
              </div>
            ))}</div>
          )}
        </div>
      </ModuleWorkspaceShell>
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}><DialogContent className="max-w-md"><DialogHeader><DialogTitle>{editing ? 'Redigera sponsor' : 'Ny sponsor'}</DialogTitle><DialogDescription>Ange sponsoruppgifter.</DialogDescription></DialogHeader><div className="grid gap-4 py-2"><div className="grid grid-cols-2 gap-4"><div className="grid gap-2"><Label>Företagsnamn *</Label><Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} /></div><div className="grid gap-2"><Label>Kontaktperson</Label><Input value={form.contactPerson} onChange={e => setForm(f => ({ ...f, contactPerson: e.target.value }))} /></div></div><div className="grid grid-cols-2 gap-4"><div className="grid gap-2"><Label>E-post</Label><Input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} /></div><div className="grid gap-2"><Label>Event</Label><Input value={form.event} onChange={e => setForm(f => ({ ...f, event: e.target.value }))} /></div></div><div className="grid grid-cols-3 gap-4"><div className="grid gap-2"><Label>Nivå</Label><Select value={form.level} onValueChange={val => setForm(f => ({ ...f, level: val as SponsorLevel }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{LEVELS.map(l => <SelectItem key={l} value={l}>{l}</SelectItem>)}</SelectContent></Select></div><div className="grid gap-2"><Label>Belopp (kr)</Label><Input type="number" min={0} value={form.amount} onChange={e => setForm(f => ({ ...f, amount: parseFloat(e.target.value) || 0 }))} /></div><div className="grid gap-2"><Label>Status</Label><Select value={form.status} onValueChange={val => setForm(f => ({ ...f, status: val as SponsorStatus }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent></Select></div></div><div className="grid grid-cols-2 gap-4"><div className="grid gap-2"><Label>Avtal t.o.m.</Label><Input type="date" value={form.contractEnd} onChange={e => setForm(f => ({ ...f, contractEnd: e.target.value }))} /></div><div className="grid gap-2"><Label>Leveranser</Label><Input value={form.deliverables} onChange={e => setForm(f => ({ ...f, deliverables: e.target.value }))} placeholder="t.ex. Logo, VIP-plats" /></div></div></div><DialogFooter><Button variant="outline" onClick={() => setDialogOpen(false)}>Avbryt</Button><Button onClick={handleSave} disabled={!form.name.trim()}>{editing ? 'Uppdatera' : 'Skapa'}</Button></DialogFooter></DialogContent></Dialog>
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}><DialogContent className="max-w-sm"><DialogHeader><DialogTitle>Ta bort sponsor</DialogTitle><DialogDescription>Är du säker?</DialogDescription></DialogHeader><DialogFooter><Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>Avbryt</Button><Button variant="destructive" onClick={handleDelete}><Trash2 className="mr-2 h-4 w-4" />Ta bort</Button></DialogFooter></DialogContent></Dialog>
    </>
  )
}
