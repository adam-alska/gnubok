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
import { Plus, Pencil, Trash2, Loader2, Search, Users } from 'lucide-react'

interface ModuleWorkspaceProps { module: { slug: string; name: string; cat: string; desc: string; longDesc: string }; sectorSlug: string; settingsHref: string }
type TenantStatus = 'Aktiv' | 'Uppsagd' | 'Avflyttad' | 'Prospekt'
interface Tenant { id: string; name: string; property: string; unit: string; email: string; phone: string; contractStart: string; contractEnd: string; monthlyRent: number; status: TenantStatus; notes: string }
function fmt(n: number): string { return new Intl.NumberFormat('sv-SE', { maximumFractionDigits: 0 }).format(n) }
const STATUSES: TenantStatus[] = ['Aktiv', 'Uppsagd', 'Avflyttad', 'Prospekt']
const STATUS_MAP: Record<TenantStatus, 'neutral' | 'info' | 'success' | 'danger' | 'warning'> = { 'Aktiv': 'success', 'Uppsagd': 'warning', 'Avflyttad': 'neutral', 'Prospekt': 'info' }
const EMPTY_FORM = { name: '', property: '', unit: '', email: '', phone: '', contractStart: '', contractEnd: '', monthlyRent: 0, status: 'Aktiv' as TenantStatus, notes: '' }

export function HyresgasthanteringWorkspace({ module: mod, sectorSlug, settingsHref }: ModuleWorkspaceProps) {
  const supabase = createClient()
  const [loading, setLoading] = useState(true); const [saving, setSaving] = useState(false); const [tenants, setTenants] = useState<Tenant[]>([]); const [searchQuery, setSearchQuery] = useState(''); const [dialogOpen, setDialogOpen] = useState(false); const [editing, setEditing] = useState<Tenant | null>(null); const [form, setForm] = useState(EMPTY_FORM); const [deleteDialogOpen, setDeleteDialogOpen] = useState(false); const [toDelete, setToDelete] = useState<Tenant | null>(null); const [filterStatus, setFilterStatus] = useState<TenantStatus | 'all'>('all')

  const saveItems = useCallback(async (items: Tenant[]) => { setSaving(true); const { data: { user } } = await supabase.auth.getUser(); if (!user) { setSaving(false); return }; await supabase.from('module_configs').upsert({ user_id: user.id, sector_slug: sectorSlug, module_slug: mod.slug, config_key: 'tenants', config_value: items }, { onConflict: 'user_id,sector_slug,module_slug,config_key' }); setSaving(false) }, [supabase, sectorSlug, mod.slug])
  const fetchData = useCallback(async () => { setLoading(true); const { data: { user } } = await supabase.auth.getUser(); if (!user) { setLoading(false); return }; const { data } = await supabase.from('module_configs').select('config_value').eq('user_id', user.id).eq('sector_slug', sectorSlug).eq('module_slug', mod.slug).eq('config_key', 'tenants').maybeSingle(); if (data?.config_value && Array.isArray(data.config_value)) setTenants(data.config_value as Tenant[]); setLoading(false) }, [supabase, sectorSlug, mod.slug])
  useEffect(() => { fetchData() }, [fetchData])

  const filtered = tenants.filter(t => { if (filterStatus !== 'all' && t.status !== filterStatus) return false; if (searchQuery.trim()) { const q = searchQuery.toLowerCase(); return t.name.toLowerCase().includes(q) || t.property.toLowerCase().includes(q) }; return true })
  const totalRent = tenants.filter(t => t.status === 'Aktiv').reduce((s, t) => s + t.monthlyRent, 0)

  function openNew() { setEditing(null); setForm({ ...EMPTY_FORM }); setDialogOpen(true) }
  function openEdit(t: Tenant) { setEditing(t); setForm({ name: t.name, property: t.property, unit: t.unit, email: t.email, phone: t.phone, contractStart: t.contractStart, contractEnd: t.contractEnd, monthlyRent: t.monthlyRent, status: t.status, notes: t.notes }); setDialogOpen(true) }
  async function handleSave() { const item: Tenant = { id: editing?.id ?? crypto.randomUUID(), ...form, name: form.name.trim(), property: form.property.trim(), unit: form.unit.trim(), email: form.email.trim(), phone: form.phone.trim(), notes: form.notes.trim() }; const updated = editing ? tenants.map(t => t.id === editing.id ? item : t) : [...tenants, item]; setTenants(updated); setDialogOpen(false); await saveItems(updated) }
  async function handleDelete() { if (!toDelete) return; const updated = tenants.filter(t => t.id !== toDelete.id); setTenants(updated); setDeleteDialogOpen(false); setToDelete(null); await saveItems(updated) }

  return (
    <>
      <ModuleWorkspaceShell title={mod.name} description={mod.desc} category="operativ" sectorName="Fastighet" backHref={`/m/${sectorSlug}`} settingsHref={settingsHref} actions={<Button onClick={openNew}><Plus className="mr-2 h-4 w-4" />Ny hyresgäst</Button>}>
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3"><div className="relative flex-1 max-w-sm"><Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" /><Input placeholder="Sök hyresgäst..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="pl-9" /></div><Select value={filterStatus} onValueChange={val => setFilterStatus(val as TenantStatus | 'all')}><SelectTrigger className="w-[180px]"><SelectValue placeholder="Filter" /></SelectTrigger><SelectContent><SelectItem value="all">Alla status</SelectItem>{STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent></Select><span className="ml-auto text-sm text-muted-foreground">Aktiv hyra: <span className="font-medium text-foreground">{fmt(totalRent)} kr/mån</span></span>{saving && <div className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" />Sparar...</div>}</div>
          {loading ? <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div> : filtered.length === 0 ? <EmptyModuleState icon={Users} title="Inga hyresgäster" description="Hantera hyresgäster med kontaktinfo, avtal, hyra och status." actionLabel="Ny hyresgäst" onAction={openNew} /> : (
            <div className="space-y-3">{filtered.map(t => (
              <div key={t.id} className="flex items-center justify-between gap-4 rounded-xl border border-border bg-card px-5 py-4">
                <div className="flex flex-col min-w-0"><div className="flex items-center gap-2"><span className="font-medium text-sm">{t.name}</span></div><div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5"><span>{t.property} - {t.unit}</span><span>{fmt(t.monthlyRent)} kr/mån</span>{t.contractEnd && <span>Avtal t.o.m. {t.contractEnd}</span>}{t.email && <span>{t.email}</span>}</div></div>
                <div className="flex items-center gap-2 flex-shrink-0"><StatusBadge label={t.status} variant={STATUS_MAP[t.status]} /><Button variant="ghost" size="icon" onClick={() => openEdit(t)}><Pencil className="h-4 w-4" /></Button><Button variant="ghost" size="icon" className="text-red-600" onClick={() => { setToDelete(t); setDeleteDialogOpen(true) }}><Trash2 className="h-4 w-4" /></Button></div>
              </div>
            ))}</div>
          )}
        </div>
      </ModuleWorkspaceShell>
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}><DialogContent className="max-w-md"><DialogHeader><DialogTitle>{editing ? 'Redigera hyresgäst' : 'Ny hyresgäst'}</DialogTitle><DialogDescription>Ange hyresgästuppgifter.</DialogDescription></DialogHeader><div className="grid gap-4 py-2"><div className="grid grid-cols-2 gap-4"><div className="grid gap-2"><Label>Namn *</Label><Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} /></div><div className="grid gap-2"><Label>Status</Label><Select value={form.status} onValueChange={val => setForm(f => ({ ...f, status: val as TenantStatus }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent></Select></div></div><div className="grid grid-cols-2 gap-4"><div className="grid gap-2"><Label>Fastighet</Label><Input value={form.property} onChange={e => setForm(f => ({ ...f, property: e.target.value }))} /></div><div className="grid gap-2"><Label>Enhet</Label><Input value={form.unit} onChange={e => setForm(f => ({ ...f, unit: e.target.value }))} placeholder="t.ex. Lgh 301" /></div></div><div className="grid grid-cols-2 gap-4"><div className="grid gap-2"><Label>E-post</Label><Input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} /></div><div className="grid gap-2"><Label>Telefon</Label><Input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} /></div></div><div className="grid grid-cols-3 gap-4"><div className="grid gap-2"><Label>Avtal från</Label><Input type="date" value={form.contractStart} onChange={e => setForm(f => ({ ...f, contractStart: e.target.value }))} /></div><div className="grid gap-2"><Label>Avtal till</Label><Input type="date" value={form.contractEnd} onChange={e => setForm(f => ({ ...f, contractEnd: e.target.value }))} /></div><div className="grid gap-2"><Label>Hyra (kr/mån)</Label><Input type="number" min={0} value={form.monthlyRent} onChange={e => setForm(f => ({ ...f, monthlyRent: parseFloat(e.target.value) || 0 }))} /></div></div><div className="grid gap-2"><Label>Anteckningar</Label><Input value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} /></div></div><DialogFooter><Button variant="outline" onClick={() => setDialogOpen(false)}>Avbryt</Button><Button onClick={handleSave} disabled={!form.name.trim()}>{editing ? 'Uppdatera' : 'Skapa'}</Button></DialogFooter></DialogContent></Dialog>
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}><DialogContent className="max-w-sm"><DialogHeader><DialogTitle>Ta bort hyresgäst</DialogTitle><DialogDescription>Är du säker?</DialogDescription></DialogHeader><DialogFooter><Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>Avbryt</Button><Button variant="destructive" onClick={handleDelete}><Trash2 className="mr-2 h-4 w-4" />Ta bort</Button></DialogFooter></DialogContent></Dialog>
    </>
  )
}
