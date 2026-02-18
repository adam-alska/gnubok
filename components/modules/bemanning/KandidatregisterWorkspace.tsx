'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { ModuleWorkspaceShell } from '@/components/modules/ModuleWorkspaceShell'
import { EmptyModuleState } from '@/components/modules/shared/EmptyModuleState'
import { StatusBadge } from '@/components/modules/shared/StatusBadge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Plus, Pencil, Trash2, Loader2, Search, Users } from 'lucide-react'

interface ModuleWorkspaceProps { module: { slug: string; name: string; cat: string; desc: string; longDesc: string }; sectorSlug: string; settingsHref: string }
type CandidateStatus = 'aktiv' | 'uthyrd' | 'inaktiv'
interface Item { id: string; name: string; email: string; phone: string; skills: string; status: CandidateStatus; gdpr_consent_date: string; notes: string }
const STATUS_LABELS: Record<CandidateStatus, string> = { aktiv: 'Aktiv', uthyrd: 'Uthyrd', inaktiv: 'Inaktiv' }
const STATUS_VARIANT: Record<CandidateStatus, 'success' | 'info' | 'neutral'> = { aktiv: 'success', uthyrd: 'info', inaktiv: 'neutral' }
function generateId(): string { return Date.now().toString(36) + Math.random().toString(36).substring(2, 7) }

const DEFAULT_ITEMS: Item[] = [
  { id: '1', name: 'Anna Svensson', email: 'anna@test.se', phone: '070-1234567', skills: 'Java, React, AWS', status: 'uthyrd', gdpr_consent_date: '2025-01-15', notes: '' },
  { id: '2', name: 'Johan Larsson', email: 'johan@test.se', phone: '070-2345678', skills: '.NET, Azure, SQL', status: 'aktiv', gdpr_consent_date: '2025-02-01', notes: '' },
]
const EMPTY_FORM = { name: '', email: '', phone: '', skills: '', status: 'aktiv' as CandidateStatus, gdpr_consent_date: '', notes: '' }

export function KandidatregisterWorkspace({ module: mod, sectorSlug, settingsHref }: ModuleWorkspaceProps) {
  const supabase = createClient()
  const [loading, setLoading] = useState(true); const [saving, setSaving] = useState(false); const [items, setItems] = useState<Item[]>([]); const [dialogOpen, setDialogOpen] = useState(false); const [editing, setEditing] = useState<Item | null>(null); const [form, setForm] = useState(EMPTY_FORM); const [deleteDialogOpen, setDeleteDialogOpen] = useState(false); const [toDelete, setToDelete] = useState<Item | null>(null); const [searchQuery, setSearchQuery] = useState('')
  const save = useCallback(async (d: Item[]) => { setSaving(true); const { data: { user } } = await supabase.auth.getUser(); if (!user) { setSaving(false); return }; await supabase.from('module_configs').upsert({ user_id: user.id, sector_slug: sectorSlug, module_slug: mod.slug, config_key: 'candidates', config_value: d }, { onConflict: 'user_id,sector_slug,module_slug,config_key' }); setSaving(false) }, [supabase, sectorSlug, mod.slug])
  const fetch_ = useCallback(async () => { setLoading(true); const { data: { user } } = await supabase.auth.getUser(); if (!user) { setLoading(false); return }; const { data } = await supabase.from('module_configs').select('config_value').eq('user_id', user.id).eq('sector_slug', sectorSlug).eq('module_slug', mod.slug).eq('config_key', 'candidates').maybeSingle(); if (data?.config_value && Array.isArray(data.config_value) && data.config_value.length > 0) { setItems(data.config_value as Item[]) } else { setItems(DEFAULT_ITEMS); await supabase.from('module_configs').upsert({ user_id: user.id, sector_slug: sectorSlug, module_slug: mod.slug, config_key: 'candidates', config_value: DEFAULT_ITEMS }, { onConflict: 'user_id,sector_slug,module_slug,config_key' }) }; setLoading(false) }, [supabase, sectorSlug, mod.slug])
  useEffect(() => { fetch_() }, [fetch_])
  const filtered = useMemo(() => { let r = items; if (searchQuery.trim()) { const q = searchQuery.toLowerCase(); r = r.filter((i) => i.name.toLowerCase().includes(q) || i.skills.toLowerCase().includes(q)) }; return r.sort((a, b) => a.name.localeCompare(b.name)) }, [items, searchQuery])
  const stats = useMemo(() => ({ total: items.length, aktiv: items.filter(i => i.status === 'aktiv').length, uthyrd: items.filter(i => i.status === 'uthyrd').length }), [items])
  function openNew() { setEditing(null); setForm({ ...EMPTY_FORM }); setDialogOpen(true) }
  function openEdit(i: Item) { setEditing(i); setForm({ name: i.name, email: i.email, phone: i.phone, skills: i.skills, status: i.status, gdpr_consent_date: i.gdpr_consent_date, notes: i.notes }); setDialogOpen(true) }
  async function handleSave() { const entry: Item = { id: editing?.id ?? generateId(), name: form.name.trim(), email: form.email.trim(), phone: form.phone.trim(), skills: form.skills.trim(), status: form.status, gdpr_consent_date: form.gdpr_consent_date, notes: form.notes.trim() }; const u = editing ? items.map((i) => i.id === editing.id ? entry : i) : [...items, entry]; setItems(u); setDialogOpen(false); await save(u) }
  function openDel(i: Item) { setToDelete(i); setDeleteDialogOpen(true) }
  async function handleDel() { if (!toDelete) return; const u = items.filter((i) => i.id !== toDelete.id); setItems(u); setDeleteDialogOpen(false); setToDelete(null); await save(u) }

  return (
    <>
      <ModuleWorkspaceShell title={mod.name} description={mod.desc} category="operativ" sectorName="Bemanning & HR" backHref={`/m/${sectorSlug}`} settingsHref={settingsHref} actions={<Button onClick={openNew}><Plus className="mr-2 h-4 w-4" />Ny kandidat</Button>}>
        {loading ? <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div> : (
          <div className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-3">
              <Card><CardHeader className="pb-2"><CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Totalt kandidater</CardTitle></CardHeader><CardContent><span className="text-2xl font-semibold tracking-tight">{stats.total}</span></CardContent></Card>
              <Card><CardHeader className="pb-2"><CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Tillgängliga</CardTitle></CardHeader><CardContent><span className="text-2xl font-semibold tracking-tight text-emerald-600">{stats.aktiv}</span></CardContent></Card>
              <Card><CardHeader className="pb-2"><CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Uthyrda</CardTitle></CardHeader><CardContent><span className="text-2xl font-semibold tracking-tight text-blue-600">{stats.uthyrd}</span></CardContent></Card>
            </div>
            <div className="flex items-center gap-3"><div className="relative flex-1 max-w-sm"><Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" /><Input placeholder="Sök namn eller kompetens..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-9" /></div>{saving && <div className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" />Sparar...</div>}</div>
            {filtered.length === 0 ? <EmptyModuleState icon={Users} title="Inga kandidater" description="Lägg till kandidater i registret." actionLabel="Ny kandidat" onAction={openNew} /> : (
              <div className="rounded-xl border border-border overflow-hidden"><Table><TableHeader><TableRow className="bg-muted/50"><TableHead className="font-medium">Namn</TableHead><TableHead className="font-medium">E-post</TableHead><TableHead className="font-medium">Telefon</TableHead><TableHead className="font-medium">Kompetenser</TableHead><TableHead className="font-medium">Status</TableHead><TableHead className="font-medium">GDPR samtycke</TableHead><TableHead className="font-medium text-right">Åtgärder</TableHead></TableRow></TableHeader><TableBody>{filtered.map((i) => (
                <TableRow key={i.id}><TableCell className="font-medium">{i.name}</TableCell><TableCell>{i.email}</TableCell><TableCell>{i.phone}</TableCell><TableCell className="max-w-[200px] truncate">{i.skills}</TableCell><TableCell><StatusBadge label={STATUS_LABELS[i.status]} variant={STATUS_VARIANT[i.status]} /></TableCell><TableCell>{i.gdpr_consent_date}</TableCell><TableCell className="text-right"><div className="flex items-center justify-end gap-1"><Button variant="ghost" size="icon" onClick={() => openEdit(i)}><Pencil className="h-4 w-4" /></Button><Button variant="ghost" size="icon" className="text-red-600 hover:text-red-700" onClick={() => openDel(i)}><Trash2 className="h-4 w-4" /></Button></div></TableCell></TableRow>
              ))}</TableBody></Table></div>
            )}
          </div>
        )}
      </ModuleWorkspaceShell>
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}><DialogContent className="max-w-lg"><DialogHeader><DialogTitle>{editing ? 'Redigera kandidat' : 'Ny kandidat'}</DialogTitle><DialogDescription>GDPR-samtycke krävs för lagring av personuppgifter.</DialogDescription></DialogHeader><div className="grid gap-4 py-2"><div className="grid grid-cols-2 gap-4"><div className="grid gap-2"><Label>Namn *</Label><Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} /></div><div className="grid gap-2"><Label>E-post</Label><Input type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} /></div></div><div className="grid grid-cols-2 gap-4"><div className="grid gap-2"><Label>Telefon</Label><Input value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} /></div><div className="grid gap-2"><Label>Status</Label><Select value={form.status} onValueChange={(v) => setForm((f) => ({ ...f, status: v as CandidateStatus }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="aktiv">Aktiv</SelectItem><SelectItem value="uthyrd">Uthyrd</SelectItem><SelectItem value="inaktiv">Inaktiv</SelectItem></SelectContent></Select></div></div><div className="grid gap-2"><Label>Kompetenser</Label><Input value={form.skills} onChange={(e) => setForm((f) => ({ ...f, skills: e.target.value }))} placeholder="Java, React, AWS" /></div><div className="grid grid-cols-2 gap-4"><div className="grid gap-2"><Label>GDPR samtycke</Label><Input type="date" value={form.gdpr_consent_date} onChange={(e) => setForm((f) => ({ ...f, gdpr_consent_date: e.target.value }))} /></div><div className="grid gap-2"><Label>Anteckningar</Label><Input value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} /></div></div></div><DialogFooter><Button variant="outline" onClick={() => setDialogOpen(false)}>Avbryt</Button><Button onClick={handleSave} disabled={!form.name.trim()}>{editing ? 'Uppdatera' : 'Skapa'}</Button></DialogFooter></DialogContent></Dialog>
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}><DialogContent className="max-w-sm"><DialogHeader><DialogTitle>Ta bort kandidat</DialogTitle><DialogDescription>Är du säker på att du vill ta bort <span className="font-semibold">{toDelete?.name}</span>? Observera GDPR-krav vid radering.</DialogDescription></DialogHeader><DialogFooter><Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>Avbryt</Button><Button variant="destructive" onClick={handleDel}><Trash2 className="mr-2 h-4 w-4" />Ta bort</Button></DialogFooter></DialogContent></Dialog>
    </>
  )
}
