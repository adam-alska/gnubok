'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { ModuleWorkspaceShell } from '@/components/modules/ModuleWorkspaceShell'
import { EmptyModuleState } from '@/components/modules/shared/EmptyModuleState'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Plus, Pencil, Trash2, Loader2, Search, CalendarDays } from 'lucide-react'

interface ModuleWorkspaceProps { module: { slug: string; name: string; cat: string; desc: string; longDesc: string }; sectorSlug: string; settingsHref: string }
interface Item { id: string; date: string; time_start: string; time_end: string; customer_name: string; reg_number: string; description: string; mechanic: string; lift: string }
function generateId(): string { return Date.now().toString(36) + Math.random().toString(36).substring(2, 7) }

const DEFAULT_ITEMS: Item[] = [
  { id: '1', date: '2025-03-20', time_start: '08:00', time_end: '10:00', customer_name: 'Anders J', reg_number: 'ABC 123', description: 'Service', mechanic: 'Erik M', lift: 'Lyft 1' },
  { id: '2', date: '2025-03-20', time_start: '10:30', time_end: '14:00', customer_name: 'Maria K', reg_number: 'DEF 456', description: 'Kamremsbyte', mechanic: 'Sven L', lift: 'Lyft 2' },
]
const EMPTY_FORM = { date: '', time_start: '', time_end: '', customer_name: '', reg_number: '', description: '', mechanic: '', lift: '' }

export function VerkstadsplaneringWorkspace({ module: mod, sectorSlug, settingsHref }: ModuleWorkspaceProps) {
  const supabase = createClient()
  const [loading, setLoading] = useState(true); const [saving, setSaving] = useState(false); const [items, setItems] = useState<Item[]>([]); const [dialogOpen, setDialogOpen] = useState(false); const [editing, setEditing] = useState<Item | null>(null); const [form, setForm] = useState(EMPTY_FORM); const [deleteDialogOpen, setDeleteDialogOpen] = useState(false); const [toDelete, setToDelete] = useState<Item | null>(null); const [searchQuery, setSearchQuery] = useState('')
  const save = useCallback(async (d: Item[]) => { setSaving(true); const { data: { user } } = await supabase.auth.getUser(); if (!user) { setSaving(false); return }; await supabase.from('module_configs').upsert({ user_id: user.id, sector_slug: sectorSlug, module_slug: mod.slug, config_key: 'schedule', config_value: d }, { onConflict: 'user_id,sector_slug,module_slug,config_key' }); setSaving(false) }, [supabase, sectorSlug, mod.slug])
  const fetch_ = useCallback(async () => { setLoading(true); const { data: { user } } = await supabase.auth.getUser(); if (!user) { setLoading(false); return }; const { data } = await supabase.from('module_configs').select('config_value').eq('user_id', user.id).eq('sector_slug', sectorSlug).eq('module_slug', mod.slug).eq('config_key', 'schedule').maybeSingle(); if (data?.config_value && Array.isArray(data.config_value) && data.config_value.length > 0) { setItems(data.config_value as Item[]) } else { setItems(DEFAULT_ITEMS); await supabase.from('module_configs').upsert({ user_id: user.id, sector_slug: sectorSlug, module_slug: mod.slug, config_key: 'schedule', config_value: DEFAULT_ITEMS }, { onConflict: 'user_id,sector_slug,module_slug,config_key' }) }; setLoading(false) }, [supabase, sectorSlug, mod.slug])
  useEffect(() => { fetch_() }, [fetch_])
  const filtered = useMemo(() => { let r = items; if (searchQuery.trim()) { const q = searchQuery.toLowerCase(); r = r.filter((i) => i.customer_name.toLowerCase().includes(q) || i.reg_number.toLowerCase().includes(q) || i.mechanic.toLowerCase().includes(q)) }; return r.sort((a, b) => a.date.localeCompare(b.date) || a.time_start.localeCompare(b.time_start)) }, [items, searchQuery])
  function openNew() { setEditing(null); setForm({ ...EMPTY_FORM }); setDialogOpen(true) }
  function openEdit(i: Item) { setEditing(i); setForm({ date: i.date, time_start: i.time_start, time_end: i.time_end, customer_name: i.customer_name, reg_number: i.reg_number, description: i.description, mechanic: i.mechanic, lift: i.lift }); setDialogOpen(true) }
  async function handleSave() { const entry: Item = { id: editing?.id ?? generateId(), date: form.date, time_start: form.time_start, time_end: form.time_end, customer_name: form.customer_name.trim(), reg_number: form.reg_number.trim(), description: form.description.trim(), mechanic: form.mechanic.trim(), lift: form.lift.trim() }; const u = editing ? items.map((i) => i.id === editing.id ? entry : i) : [...items, entry]; setItems(u); setDialogOpen(false); await save(u) }
  function openDel(i: Item) { setToDelete(i); setDeleteDialogOpen(true) }
  async function handleDel() { if (!toDelete) return; const u = items.filter((i) => i.id !== toDelete.id); setItems(u); setDeleteDialogOpen(false); setToDelete(null); await save(u) }

  return (
    <>
      <ModuleWorkspaceShell title={mod.name} description={mod.desc} category="operativ" sectorName="Fordon & Verkstad" backHref={`/m/${sectorSlug}`} settingsHref={settingsHref} actions={<Button onClick={openNew}><Plus className="mr-2 h-4 w-4" />Ny bokning</Button>}>
        {loading ? <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div> : (
          <div className="space-y-6">
            <div className="flex items-center gap-3"><div className="relative flex-1 max-w-sm"><Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" /><Input placeholder="Sök kund, reg.nr, mekaniker..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-9" /></div>{saving && <div className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" />Sparar...</div>}</div>
            {filtered.length === 0 ? <EmptyModuleState icon={CalendarDays} title="Inga bokningar" description="Lägg till verkstadsbokningar för att planera arbetet." actionLabel="Ny bokning" onAction={openNew} /> : (
              <div className="rounded-xl border border-border overflow-hidden"><Table><TableHeader><TableRow className="bg-muted/50"><TableHead className="font-medium">Datum</TableHead><TableHead className="font-medium">Tid</TableHead><TableHead className="font-medium">Kund</TableHead><TableHead className="font-medium">Reg.nr</TableHead><TableHead className="font-medium">Beskrivning</TableHead><TableHead className="font-medium">Mekaniker</TableHead><TableHead className="font-medium">Lyft</TableHead><TableHead className="font-medium text-right">Åtgärder</TableHead></TableRow></TableHeader><TableBody>{filtered.map((i) => (
                <TableRow key={i.id}><TableCell>{i.date}</TableCell><TableCell>{i.time_start}-{i.time_end}</TableCell><TableCell className="font-medium">{i.customer_name}</TableCell><TableCell className="font-mono">{i.reg_number}</TableCell><TableCell>{i.description}</TableCell><TableCell>{i.mechanic}</TableCell><TableCell><Badge variant="outline">{i.lift}</Badge></TableCell><TableCell className="text-right"><div className="flex items-center justify-end gap-1"><Button variant="ghost" size="icon" onClick={() => openEdit(i)}><Pencil className="h-4 w-4" /></Button><Button variant="ghost" size="icon" className="text-red-600 hover:text-red-700" onClick={() => openDel(i)}><Trash2 className="h-4 w-4" /></Button></div></TableCell></TableRow>
              ))}</TableBody></Table></div>
            )}
          </div>
        )}
      </ModuleWorkspaceShell>
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}><DialogContent className="max-w-lg"><DialogHeader><DialogTitle>{editing ? 'Redigera bokning' : 'Ny bokning'}</DialogTitle><DialogDescription>Planera verkstadstid för kunder.</DialogDescription></DialogHeader><div className="grid gap-4 py-2"><div className="grid grid-cols-3 gap-4"><div className="grid gap-2"><Label>Datum *</Label><Input type="date" value={form.date} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} /></div><div className="grid gap-2"><Label>Start</Label><Input type="time" value={form.time_start} onChange={(e) => setForm((f) => ({ ...f, time_start: e.target.value }))} /></div><div className="grid gap-2"><Label>Slut</Label><Input type="time" value={form.time_end} onChange={(e) => setForm((f) => ({ ...f, time_end: e.target.value }))} /></div></div><div className="grid grid-cols-2 gap-4"><div className="grid gap-2"><Label>Kund *</Label><Input value={form.customer_name} onChange={(e) => setForm((f) => ({ ...f, customer_name: e.target.value }))} /></div><div className="grid gap-2"><Label>Reg.nr</Label><Input value={form.reg_number} onChange={(e) => setForm((f) => ({ ...f, reg_number: e.target.value }))} /></div></div><div className="grid grid-cols-3 gap-4"><div className="grid gap-2"><Label>Beskrivning</Label><Input value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} /></div><div className="grid gap-2"><Label>Mekaniker</Label><Input value={form.mechanic} onChange={(e) => setForm((f) => ({ ...f, mechanic: e.target.value }))} /></div><div className="grid gap-2"><Label>Lyft</Label><Input value={form.lift} onChange={(e) => setForm((f) => ({ ...f, lift: e.target.value }))} placeholder="Lyft 1" /></div></div></div><DialogFooter><Button variant="outline" onClick={() => setDialogOpen(false)}>Avbryt</Button><Button onClick={handleSave} disabled={!form.customer_name.trim() || !form.date}>{editing ? 'Uppdatera' : 'Skapa'}</Button></DialogFooter></DialogContent></Dialog>
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}><DialogContent className="max-w-sm"><DialogHeader><DialogTitle>Ta bort bokning</DialogTitle><DialogDescription>Är du säker på att du vill ta bort bokningen för <span className="font-semibold">{toDelete?.customer_name}</span>?</DialogDescription></DialogHeader><DialogFooter><Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>Avbryt</Button><Button variant="destructive" onClick={handleDel}><Trash2 className="mr-2 h-4 w-4" />Ta bort</Button></DialogFooter></DialogContent></Dialog>
    </>
  )
}
