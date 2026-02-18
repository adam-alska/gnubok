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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Plus, Pencil, Trash2, Loader2, Search, ShieldCheck } from 'lucide-react'

interface ModuleWorkspaceProps { module: { slug: string; name: string; cat: string; desc: string; longDesc: string }; sectorSlug: string; settingsHref: string }
interface Item { id: string; company: string; org_number: string; fskatt_verified: boolean; insurance_verified: boolean; expiry: string }
function generateId(): string { return Date.now().toString(36) + Math.random().toString(36).substring(2, 7) }

const DEFAULT_ITEMS: Item[] = [
  { id: '1', company: 'Konsultbolaget AB', org_number: '556789-0123', fskatt_verified: true, insurance_verified: true, expiry: '2025-12-31' },
  { id: '2', company: 'Freelance IT HB', org_number: '969876-5432', fskatt_verified: true, insurance_verified: false, expiry: '2025-06-30' },
]
const EMPTY_FORM = { company: '', org_number: '', fskatt_verified: 'true', insurance_verified: 'false', expiry: '' }

export function UeVerifieringBemanningWorkspace({ module: mod, sectorSlug, settingsHref }: ModuleWorkspaceProps) {
  const supabase = createClient()
  const [loading, setLoading] = useState(true); const [saving, setSaving] = useState(false); const [items, setItems] = useState<Item[]>([]); const [dialogOpen, setDialogOpen] = useState(false); const [editing, setEditing] = useState<Item | null>(null); const [form, setForm] = useState(EMPTY_FORM); const [deleteDialogOpen, setDeleteDialogOpen] = useState(false); const [toDelete, setToDelete] = useState<Item | null>(null); const [searchQuery, setSearchQuery] = useState('')
  const save = useCallback(async (d: Item[]) => { setSaving(true); const { data: { user } } = await supabase.auth.getUser(); if (!user) { setSaving(false); return }; await supabase.from('module_configs').upsert({ user_id: user.id, sector_slug: sectorSlug, module_slug: mod.slug, config_key: 'ue_verification', config_value: d }, { onConflict: 'user_id,sector_slug,module_slug,config_key' }); setSaving(false) }, [supabase, sectorSlug, mod.slug])
  const fetch_ = useCallback(async () => { setLoading(true); const { data: { user } } = await supabase.auth.getUser(); if (!user) { setLoading(false); return }; const { data } = await supabase.from('module_configs').select('config_value').eq('user_id', user.id).eq('sector_slug', sectorSlug).eq('module_slug', mod.slug).eq('config_key', 'ue_verification').maybeSingle(); if (data?.config_value && Array.isArray(data.config_value) && data.config_value.length > 0) { setItems(data.config_value as Item[]) } else { setItems(DEFAULT_ITEMS); await supabase.from('module_configs').upsert({ user_id: user.id, sector_slug: sectorSlug, module_slug: mod.slug, config_key: 'ue_verification', config_value: DEFAULT_ITEMS }, { onConflict: 'user_id,sector_slug,module_slug,config_key' }) }; setLoading(false) }, [supabase, sectorSlug, mod.slug])
  useEffect(() => { fetch_() }, [fetch_])
  const filtered = useMemo(() => { let r = items; if (searchQuery.trim()) { const q = searchQuery.toLowerCase(); r = r.filter((i) => i.company.toLowerCase().includes(q) || i.org_number.includes(q)) }; return r.sort((a, b) => a.company.localeCompare(b.company)) }, [items, searchQuery])
  const stats = useMemo(() => ({ total: items.length, verified: items.filter(i => i.fskatt_verified && i.insurance_verified).length, missing: items.filter(i => !i.fskatt_verified || !i.insurance_verified).length }), [items])
  function openNew() { setEditing(null); setForm({ ...EMPTY_FORM }); setDialogOpen(true) }
  function openEdit(i: Item) { setEditing(i); setForm({ company: i.company, org_number: i.org_number, fskatt_verified: String(i.fskatt_verified), insurance_verified: String(i.insurance_verified), expiry: i.expiry }); setDialogOpen(true) }
  async function handleSave() { const entry: Item = { id: editing?.id ?? generateId(), company: form.company.trim(), org_number: form.org_number.trim(), fskatt_verified: form.fskatt_verified === 'true', insurance_verified: form.insurance_verified === 'true', expiry: form.expiry }; const u = editing ? items.map((i) => i.id === editing.id ? entry : i) : [...items, entry]; setItems(u); setDialogOpen(false); await save(u) }
  function openDel(i: Item) { setToDelete(i); setDeleteDialogOpen(true) }
  async function handleDel() { if (!toDelete) return; const u = items.filter((i) => i.id !== toDelete.id); setItems(u); setDeleteDialogOpen(false); setToDelete(null); await save(u) }

  return (
    <>
      <ModuleWorkspaceShell title={mod.name} description={mod.desc} category="bokforing" sectorName="Bemanning & HR" backHref={`/m/${sectorSlug}`} settingsHref={settingsHref} actions={<Button onClick={openNew}><Plus className="mr-2 h-4 w-4" />Ny UE</Button>}>
        {loading ? <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div> : (
          <div className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-3">
              <Card><CardHeader className="pb-2"><CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Totalt UE</CardTitle></CardHeader><CardContent><span className="text-2xl font-semibold tracking-tight">{stats.total}</span></CardContent></Card>
              <Card><CardHeader className="pb-2"><CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Verifierade</CardTitle></CardHeader><CardContent><span className="text-2xl font-semibold tracking-tight text-emerald-600">{stats.verified}</span></CardContent></Card>
              <Card><CardHeader className="pb-2"><CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Saknar verifiering</CardTitle></CardHeader><CardContent><span className="text-2xl font-semibold tracking-tight text-red-600">{stats.missing}</span></CardContent></Card>
            </div>
            <div className="flex items-center gap-3"><div className="relative flex-1 max-w-sm"><Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" /><Input placeholder="Sök bolag eller orgnr..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-9" /></div>{saving && <div className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" />Sparar...</div>}</div>
            {filtered.length === 0 ? <EmptyModuleState icon={ShieldCheck} title="Inga underleverantörer" description="Lägg till underleverantörer för F-skatt och försäkringsverifiering." actionLabel="Ny UE" onAction={openNew} /> : (
              <div className="rounded-xl border border-border overflow-hidden"><Table><TableHeader><TableRow className="bg-muted/50"><TableHead className="font-medium">Bolag</TableHead><TableHead className="font-medium">Org.nr</TableHead><TableHead className="font-medium">F-skatt</TableHead><TableHead className="font-medium">Försäkring</TableHead><TableHead className="font-medium">Utgår</TableHead><TableHead className="font-medium text-right">Åtgärder</TableHead></TableRow></TableHeader><TableBody>{filtered.map((i) => (
                <TableRow key={i.id}><TableCell className="font-medium">{i.company}</TableCell><TableCell className="font-mono">{i.org_number}</TableCell><TableCell><StatusBadge label={i.fskatt_verified ? 'Verifierad' : 'Saknas'} variant={i.fskatt_verified ? 'success' : 'danger'} /></TableCell><TableCell><StatusBadge label={i.insurance_verified ? 'Verifierad' : 'Saknas'} variant={i.insurance_verified ? 'success' : 'danger'} /></TableCell><TableCell>{i.expiry}</TableCell><TableCell className="text-right"><div className="flex items-center justify-end gap-1"><Button variant="ghost" size="icon" onClick={() => openEdit(i)}><Pencil className="h-4 w-4" /></Button><Button variant="ghost" size="icon" className="text-red-600 hover:text-red-700" onClick={() => openDel(i)}><Trash2 className="h-4 w-4" /></Button></div></TableCell></TableRow>
              ))}</TableBody></Table></div>
            )}
          </div>
        )}
      </ModuleWorkspaceShell>
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}><DialogContent className="max-w-md"><DialogHeader><DialogTitle>{editing ? 'Redigera UE' : 'Ny underleverantör'}</DialogTitle><DialogDescription>Verifiera F-skatt och ansvarsförsäkring för underleverantörer.</DialogDescription></DialogHeader><div className="grid gap-4 py-2"><div className="grid grid-cols-2 gap-4"><div className="grid gap-2"><Label>Bolagsnamn *</Label><Input value={form.company} onChange={(e) => setForm((f) => ({ ...f, company: e.target.value }))} /></div><div className="grid gap-2"><Label>Org.nummer</Label><Input value={form.org_number} onChange={(e) => setForm((f) => ({ ...f, org_number: e.target.value }))} placeholder="556789-0123" /></div></div><div className="grid grid-cols-3 gap-4"><div className="grid gap-2"><Label>F-skatt</Label><select className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={form.fskatt_verified} onChange={(e) => setForm((f) => ({ ...f, fskatt_verified: e.target.value }))}><option value="true">Verifierad</option><option value="false">Ej verifierad</option></select></div><div className="grid gap-2"><Label>Försäkring</Label><select className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={form.insurance_verified} onChange={(e) => setForm((f) => ({ ...f, insurance_verified: e.target.value }))}><option value="true">Verifierad</option><option value="false">Ej verifierad</option></select></div><div className="grid gap-2"><Label>Utgår</Label><Input type="date" value={form.expiry} onChange={(e) => setForm((f) => ({ ...f, expiry: e.target.value }))} /></div></div></div><DialogFooter><Button variant="outline" onClick={() => setDialogOpen(false)}>Avbryt</Button><Button onClick={handleSave} disabled={!form.company.trim()}>{editing ? 'Uppdatera' : 'Skapa'}</Button></DialogFooter></DialogContent></Dialog>
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}><DialogContent className="max-w-sm"><DialogHeader><DialogTitle>Ta bort</DialogTitle><DialogDescription>Är du säker på att du vill ta bort <span className="font-semibold">{toDelete?.company}</span>?</DialogDescription></DialogHeader><DialogFooter><Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>Avbryt</Button><Button variant="destructive" onClick={handleDel}><Trash2 className="mr-2 h-4 w-4" />Ta bort</Button></DialogFooter></DialogContent></Dialog>
    </>
  )
}
