'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { ModuleWorkspaceShell } from '@/components/modules/ModuleWorkspaceShell'
import { EmptyModuleState } from '@/components/modules/shared/EmptyModuleState'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Plus, Pencil, Trash2, Loader2, Search, Car } from 'lucide-react'

interface ModuleWorkspaceProps { module: { slug: string; name: string; cat: string; desc: string; longDesc: string }; sectorSlug: string; settingsHref: string }
interface Item { id: string; reg_number: string; make: string; model: string; year: number; owner_name: string; last_service: string; next_inspection: string; notes: string }
function generateId(): string { return Date.now().toString(36) + Math.random().toString(36).substring(2, 7) }

const DEFAULT_ITEMS: Item[] = [
  { id: '1', reg_number: 'ABC 123', make: 'Volvo', model: 'V70', year: 2018, owner_name: 'Anders J', last_service: '2025-01-15', next_inspection: '2025-06-30', notes: '' },
  { id: '2', reg_number: 'DEF 456', make: 'BMW', model: '320d', year: 2020, owner_name: 'Maria K', last_service: '2025-02-20', next_inspection: '2025-09-15', notes: '' },
]
const EMPTY_FORM = { reg_number: '', make: '', model: '', year: '', owner_name: '', last_service: '', next_inspection: '', notes: '' }

export function FordonsregisterWorkspace({ module: mod, sectorSlug, settingsHref }: ModuleWorkspaceProps) {
  const supabase = createClient()
  const [loading, setLoading] = useState(true); const [saving, setSaving] = useState(false); const [items, setItems] = useState<Item[]>([]); const [dialogOpen, setDialogOpen] = useState(false); const [editing, setEditing] = useState<Item | null>(null); const [form, setForm] = useState(EMPTY_FORM); const [deleteDialogOpen, setDeleteDialogOpen] = useState(false); const [toDelete, setToDelete] = useState<Item | null>(null); const [searchQuery, setSearchQuery] = useState('')
  const save = useCallback(async (d: Item[]) => { setSaving(true); const { data: { user } } = await supabase.auth.getUser(); if (!user) { setSaving(false); return }; await supabase.from('module_configs').upsert({ user_id: user.id, sector_slug: sectorSlug, module_slug: mod.slug, config_key: 'vehicles', config_value: d }, { onConflict: 'user_id,sector_slug,module_slug,config_key' }); setSaving(false) }, [supabase, sectorSlug, mod.slug])
  const fetch_ = useCallback(async () => { setLoading(true); const { data: { user } } = await supabase.auth.getUser(); if (!user) { setLoading(false); return }; const { data } = await supabase.from('module_configs').select('config_value').eq('user_id', user.id).eq('sector_slug', sectorSlug).eq('module_slug', mod.slug).eq('config_key', 'vehicles').maybeSingle(); if (data?.config_value && Array.isArray(data.config_value) && data.config_value.length > 0) { setItems(data.config_value as Item[]) } else { setItems(DEFAULT_ITEMS); await supabase.from('module_configs').upsert({ user_id: user.id, sector_slug: sectorSlug, module_slug: mod.slug, config_key: 'vehicles', config_value: DEFAULT_ITEMS }, { onConflict: 'user_id,sector_slug,module_slug,config_key' }) }; setLoading(false) }, [supabase, sectorSlug, mod.slug])
  useEffect(() => { fetch_() }, [fetch_])
  const filtered = useMemo(() => { let r = items; if (searchQuery.trim()) { const q = searchQuery.toLowerCase(); r = r.filter((i) => i.reg_number.toLowerCase().includes(q) || i.owner_name.toLowerCase().includes(q) || i.make.toLowerCase().includes(q)) }; return r.sort((a, b) => a.reg_number.localeCompare(b.reg_number)) }, [items, searchQuery])
  const stats = useMemo(() => ({ total: items.length, upcoming: items.filter(i => i.next_inspection && i.next_inspection <= new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0]).length }), [items])
  function openNew() { setEditing(null); setForm({ ...EMPTY_FORM }); setDialogOpen(true) }
  function openEdit(i: Item) { setEditing(i); setForm({ reg_number: i.reg_number, make: i.make, model: i.model, year: String(i.year), owner_name: i.owner_name, last_service: i.last_service, next_inspection: i.next_inspection, notes: i.notes }); setDialogOpen(true) }
  async function handleSave() { const entry: Item = { id: editing?.id ?? generateId(), reg_number: form.reg_number.trim().toUpperCase(), make: form.make.trim(), model: form.model.trim(), year: parseInt(form.year) || 0, owner_name: form.owner_name.trim(), last_service: form.last_service, next_inspection: form.next_inspection, notes: form.notes.trim() }; const u = editing ? items.map((i) => i.id === editing.id ? entry : i) : [...items, entry]; setItems(u); setDialogOpen(false); await save(u) }
  function openDel(i: Item) { setToDelete(i); setDeleteDialogOpen(true) }
  async function handleDel() { if (!toDelete) return; const u = items.filter((i) => i.id !== toDelete.id); setItems(u); setDeleteDialogOpen(false); setToDelete(null); await save(u) }

  return (
    <>
      <ModuleWorkspaceShell title={mod.name} description={mod.desc} category="operativ" sectorName="Fordon & Verkstad" backHref={`/m/${sectorSlug}`} settingsHref={settingsHref} actions={<Button onClick={openNew}><Plus className="mr-2 h-4 w-4" />Nytt fordon</Button>}>
        {loading ? <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div> : (
          <div className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-2">
              <Card><CardHeader className="pb-2"><CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Registrerade fordon</CardTitle></CardHeader><CardContent><span className="text-2xl font-semibold tracking-tight">{stats.total}</span></CardContent></Card>
              <Card><CardHeader className="pb-2"><CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Besiktning inom 30 dagar</CardTitle></CardHeader><CardContent><span className="text-2xl font-semibold tracking-tight text-amber-600">{stats.upcoming}</span></CardContent></Card>
            </div>
            <div className="flex items-center gap-3"><div className="relative flex-1 max-w-sm"><Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" /><Input placeholder="Sök reg.nr, ägare, märke..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-9" /></div>{saving && <div className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" />Sparar...</div>}</div>
            {filtered.length === 0 ? <EmptyModuleState icon={Car} title="Inga fordon" description="Lägg till fordon i registret." actionLabel="Nytt fordon" onAction={openNew} /> : (
              <div className="rounded-xl border border-border overflow-hidden"><Table><TableHeader><TableRow className="bg-muted/50"><TableHead className="font-medium">Reg.nr</TableHead><TableHead className="font-medium">Märke</TableHead><TableHead className="font-medium">Modell</TableHead><TableHead className="font-medium text-right">År</TableHead><TableHead className="font-medium">Ägare</TableHead><TableHead className="font-medium">Senaste service</TableHead><TableHead className="font-medium">Nästa besiktning</TableHead><TableHead className="font-medium text-right">Åtgärder</TableHead></TableRow></TableHeader><TableBody>{filtered.map((i) => (
                <TableRow key={i.id}><TableCell className="font-mono font-medium">{i.reg_number}</TableCell><TableCell>{i.make}</TableCell><TableCell>{i.model}</TableCell><TableCell className="text-right tabular-nums">{i.year}</TableCell><TableCell>{i.owner_name}</TableCell><TableCell>{i.last_service}</TableCell><TableCell>{i.next_inspection}</TableCell><TableCell className="text-right"><div className="flex items-center justify-end gap-1"><Button variant="ghost" size="icon" onClick={() => openEdit(i)}><Pencil className="h-4 w-4" /></Button><Button variant="ghost" size="icon" className="text-red-600 hover:text-red-700" onClick={() => openDel(i)}><Trash2 className="h-4 w-4" /></Button></div></TableCell></TableRow>
              ))}</TableBody></Table></div>
            )}
          </div>
        )}
      </ModuleWorkspaceShell>
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}><DialogContent className="max-w-lg"><DialogHeader><DialogTitle>{editing ? 'Redigera fordon' : 'Nytt fordon'}</DialogTitle><DialogDescription>Registrera fordonsuppgifter för service- och besiktningsuppföljning.</DialogDescription></DialogHeader><div className="grid gap-4 py-2"><div className="grid grid-cols-3 gap-4"><div className="grid gap-2"><Label>Reg.nr *</Label><Input value={form.reg_number} onChange={(e) => setForm((f) => ({ ...f, reg_number: e.target.value }))} placeholder="ABC 123" /></div><div className="grid gap-2"><Label>Märke</Label><Input value={form.make} onChange={(e) => setForm((f) => ({ ...f, make: e.target.value }))} placeholder="Volvo" /></div><div className="grid gap-2"><Label>Modell</Label><Input value={form.model} onChange={(e) => setForm((f) => ({ ...f, model: e.target.value }))} placeholder="V70" /></div></div><div className="grid grid-cols-2 gap-4"><div className="grid gap-2"><Label>Årsmodell</Label><Input type="number" value={form.year} onChange={(e) => setForm((f) => ({ ...f, year: e.target.value }))} /></div><div className="grid gap-2"><Label>Ägare</Label><Input value={form.owner_name} onChange={(e) => setForm((f) => ({ ...f, owner_name: e.target.value }))} /></div></div><div className="grid grid-cols-2 gap-4"><div className="grid gap-2"><Label>Senaste service</Label><Input type="date" value={form.last_service} onChange={(e) => setForm((f) => ({ ...f, last_service: e.target.value }))} /></div><div className="grid gap-2"><Label>Nästa besiktning</Label><Input type="date" value={form.next_inspection} onChange={(e) => setForm((f) => ({ ...f, next_inspection: e.target.value }))} /></div></div></div><DialogFooter><Button variant="outline" onClick={() => setDialogOpen(false)}>Avbryt</Button><Button onClick={handleSave} disabled={!form.reg_number.trim()}>{editing ? 'Uppdatera' : 'Skapa'}</Button></DialogFooter></DialogContent></Dialog>
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}><DialogContent className="max-w-sm"><DialogHeader><DialogTitle>Ta bort fordon</DialogTitle><DialogDescription>Är du säker på att du vill ta bort <span className="font-semibold">{toDelete?.reg_number}</span>?</DialogDescription></DialogHeader><DialogFooter><Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>Avbryt</Button><Button variant="destructive" onClick={handleDel}><Trash2 className="mr-2 h-4 w-4" />Ta bort</Button></DialogFooter></DialogContent></Dialog>
    </>
  )
}
