'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { ModuleWorkspaceShell } from '@/components/modules/ModuleWorkspaceShell'
import { EmptyModuleState } from '@/components/modules/shared/EmptyModuleState'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Plus, Pencil, Trash2, Loader2, Search, Gauge } from 'lucide-react'

interface ModuleWorkspaceProps { module: { slug: string; name: string; cat: string; desc: string; longDesc: string }; sectorSlug: string; settingsHref: string }
interface Item { id: string; resource_name: string; resource_type: string; available_hours: number; used_hours: number; utilization_pct: number; week: string }
function generateId(): string { return Date.now().toString(36) + Math.random().toString(36).substring(2, 7) }
function fmt(n: number): string { return new Intl.NumberFormat('sv-SE', { maximumFractionDigits: 0 }).format(n) }

const DEFAULT_ITEMS: Item[] = [
  { id: '1', resource_name: 'Lyft 1', resource_type: 'Lyft', available_hours: 40, used_hours: 35, utilization_pct: 87.5, week: '2025-W12' },
  { id: '2', resource_name: 'Lyft 2', resource_type: 'Lyft', available_hours: 40, used_hours: 28, utilization_pct: 70.0, week: '2025-W12' },
  { id: '3', resource_name: 'Erik M', resource_type: 'Mekaniker', available_hours: 40, used_hours: 36, utilization_pct: 90.0, week: '2025-W12' },
]
const EMPTY_FORM = { resource_name: '', resource_type: 'Lyft', available_hours: '40', used_hours: '', week: '' }

export function VerkstadsbelaggningWorkspace({ module: mod, sectorSlug, settingsHref }: ModuleWorkspaceProps) {
  const supabase = createClient()
  const [loading, setLoading] = useState(true); const [saving, setSaving] = useState(false); const [items, setItems] = useState<Item[]>([]); const [dialogOpen, setDialogOpen] = useState(false); const [editing, setEditing] = useState<Item | null>(null); const [form, setForm] = useState(EMPTY_FORM); const [deleteDialogOpen, setDeleteDialogOpen] = useState(false); const [toDelete, setToDelete] = useState<Item | null>(null); const [searchQuery, setSearchQuery] = useState('')
  const save = useCallback(async (d: Item[]) => { setSaving(true); const { data: { user } } = await supabase.auth.getUser(); if (!user) { setSaving(false); return }; await supabase.from('module_configs').upsert({ user_id: user.id, sector_slug: sectorSlug, module_slug: mod.slug, config_key: 'utilization', config_value: d }, { onConflict: 'user_id,sector_slug,module_slug,config_key' }); setSaving(false) }, [supabase, sectorSlug, mod.slug])
  const fetch_ = useCallback(async () => { setLoading(true); const { data: { user } } = await supabase.auth.getUser(); if (!user) { setLoading(false); return }; const { data } = await supabase.from('module_configs').select('config_value').eq('user_id', user.id).eq('sector_slug', sectorSlug).eq('module_slug', mod.slug).eq('config_key', 'utilization').maybeSingle(); if (data?.config_value && Array.isArray(data.config_value) && data.config_value.length > 0) { setItems(data.config_value as Item[]) } else { setItems(DEFAULT_ITEMS); await supabase.from('module_configs').upsert({ user_id: user.id, sector_slug: sectorSlug, module_slug: mod.slug, config_key: 'utilization', config_value: DEFAULT_ITEMS }, { onConflict: 'user_id,sector_slug,module_slug,config_key' }) }; setLoading(false) }, [supabase, sectorSlug, mod.slug])
  useEffect(() => { fetch_() }, [fetch_])
  const filtered = useMemo(() => { let r = items; if (searchQuery.trim()) { const q = searchQuery.toLowerCase(); r = r.filter((i) => i.resource_name.toLowerCase().includes(q) || i.resource_type.toLowerCase().includes(q)) }; return r }, [items, searchQuery])
  const stats = useMemo(() => { const totalAvail = items.reduce((s, i) => s + i.available_hours, 0); const totalUsed = items.reduce((s, i) => s + i.used_hours, 0); const avgUtil = totalAvail > 0 ? (totalUsed / totalAvail) * 100 : 0; return { totalAvail, totalUsed, avgUtil, count: items.length } }, [items])
  function openNew() { setEditing(null); setForm({ ...EMPTY_FORM }); setDialogOpen(true) }
  function openEdit(i: Item) { setEditing(i); setForm({ resource_name: i.resource_name, resource_type: i.resource_type, available_hours: String(i.available_hours), used_hours: String(i.used_hours), week: i.week }); setDialogOpen(true) }
  async function handleSave() { const avail = parseFloat(form.available_hours) || 0; const used = parseFloat(form.used_hours) || 0; const pct = avail > 0 ? (used / avail) * 100 : 0; const entry: Item = { id: editing?.id ?? generateId(), resource_name: form.resource_name.trim(), resource_type: form.resource_type, available_hours: avail, used_hours: used, utilization_pct: Math.round(pct * 10) / 10, week: form.week }; const u = editing ? items.map((i) => i.id === editing.id ? entry : i) : [...items, entry]; setItems(u); setDialogOpen(false); await save(u) }
  function openDel(i: Item) { setToDelete(i); setDeleteDialogOpen(true) }
  async function handleDel() { if (!toDelete) return; const u = items.filter((i) => i.id !== toDelete.id); setItems(u); setDeleteDialogOpen(false); setToDelete(null); await save(u) }

  return (
    <>
      <ModuleWorkspaceShell title={mod.name} description={mod.desc} category="rapport" sectorName="Fordon & Verkstad" backHref={`/m/${sectorSlug}`} settingsHref={settingsHref} actions={<Button onClick={openNew}><Plus className="mr-2 h-4 w-4" />Ny resurs</Button>}>
        {loading ? <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div> : (
          <div className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Card><CardHeader className="pb-2"><CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Snitt beläggning</CardTitle></CardHeader><CardContent><span className="text-2xl font-semibold tracking-tight">{stats.avgUtil.toFixed(1)}</span><span className="text-sm text-muted-foreground ml-1">%</span></CardContent></Card>
              <Card><CardHeader className="pb-2"><CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Tillgängligt</CardTitle></CardHeader><CardContent><span className="text-2xl font-semibold tracking-tight">{fmt(stats.totalAvail)}</span><span className="text-sm text-muted-foreground ml-1">h</span></CardContent></Card>
              <Card><CardHeader className="pb-2"><CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Använt</CardTitle></CardHeader><CardContent><span className="text-2xl font-semibold tracking-tight">{fmt(stats.totalUsed)}</span><span className="text-sm text-muted-foreground ml-1">h</span></CardContent></Card>
              <Card><CardHeader className="pb-2"><CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Resurser</CardTitle></CardHeader><CardContent><span className="text-2xl font-semibold tracking-tight">{stats.count}</span></CardContent></Card>
            </div>
            <div className="flex items-center gap-3"><div className="relative flex-1 max-w-sm"><Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" /><Input placeholder="Sök resurs..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-9" /></div>{saving && <div className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" />Sparar...</div>}</div>
            {filtered.length === 0 ? <EmptyModuleState icon={Gauge} title="Ingen beläggningsdata" description="Lägg till resurser för att mäta verkstadsbeläggning." actionLabel="Ny resurs" onAction={openNew} /> : (
              <div className="rounded-xl border border-border overflow-hidden"><Table><TableHeader><TableRow className="bg-muted/50"><TableHead className="font-medium">Resurs</TableHead><TableHead className="font-medium">Typ</TableHead><TableHead className="font-medium">Vecka</TableHead><TableHead className="font-medium text-right">Tillgängliga</TableHead><TableHead className="font-medium text-right">Använda</TableHead><TableHead className="font-medium text-right">Beläggning</TableHead><TableHead className="font-medium text-right">Åtgärder</TableHead></TableRow></TableHeader><TableBody>{filtered.map((i) => (
                <TableRow key={i.id}><TableCell className="font-medium">{i.resource_name}</TableCell><TableCell><Badge variant="outline">{i.resource_type}</Badge></TableCell><TableCell>{i.week}</TableCell><TableCell className="text-right tabular-nums">{i.available_hours}h</TableCell><TableCell className="text-right tabular-nums">{i.used_hours}h</TableCell><TableCell className="text-right"><Badge variant="secondary" className={i.utilization_pct >= 80 ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400' : i.utilization_pct >= 50 ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400' : 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400'}>{i.utilization_pct.toFixed(1)}%</Badge></TableCell><TableCell className="text-right"><div className="flex items-center justify-end gap-1"><Button variant="ghost" size="icon" onClick={() => openEdit(i)}><Pencil className="h-4 w-4" /></Button><Button variant="ghost" size="icon" className="text-red-600 hover:text-red-700" onClick={() => openDel(i)}><Trash2 className="h-4 w-4" /></Button></div></TableCell></TableRow>
              ))}</TableBody></Table></div>
            )}
          </div>
        )}
      </ModuleWorkspaceShell>
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}><DialogContent className="max-w-md"><DialogHeader><DialogTitle>{editing ? 'Redigera' : 'Ny resurs'}</DialogTitle><DialogDescription>Ange resurstillgänglighet och nyttjande.</DialogDescription></DialogHeader><div className="grid gap-4 py-2"><div className="grid grid-cols-2 gap-4"><div className="grid gap-2"><Label>Resursnamn *</Label><Input value={form.resource_name} onChange={(e) => setForm((f) => ({ ...f, resource_name: e.target.value }))} placeholder="Lyft 1" /></div><div className="grid gap-2"><Label>Typ</Label><Input value={form.resource_type} onChange={(e) => setForm((f) => ({ ...f, resource_type: e.target.value }))} placeholder="Lyft / Mekaniker" /></div></div><div className="grid grid-cols-3 gap-4"><div className="grid gap-2"><Label>Vecka</Label><Input value={form.week} onChange={(e) => setForm((f) => ({ ...f, week: e.target.value }))} placeholder="2025-W12" /></div><div className="grid gap-2"><Label>Tillgängliga (h)</Label><Input type="number" min={0} value={form.available_hours} onChange={(e) => setForm((f) => ({ ...f, available_hours: e.target.value }))} /></div><div className="grid gap-2"><Label>Använda (h)</Label><Input type="number" min={0} value={form.used_hours} onChange={(e) => setForm((f) => ({ ...f, used_hours: e.target.value }))} /></div></div></div><DialogFooter><Button variant="outline" onClick={() => setDialogOpen(false)}>Avbryt</Button><Button onClick={handleSave} disabled={!form.resource_name.trim()}>{editing ? 'Uppdatera' : 'Skapa'}</Button></DialogFooter></DialogContent></Dialog>
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}><DialogContent className="max-w-sm"><DialogHeader><DialogTitle>Ta bort</DialogTitle><DialogDescription>Är du säker på att du vill ta bort <span className="font-semibold">{toDelete?.resource_name}</span>?</DialogDescription></DialogHeader><DialogFooter><Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>Avbryt</Button><Button variant="destructive" onClick={handleDel}><Trash2 className="mr-2 h-4 w-4" />Ta bort</Button></DialogFooter></DialogContent></Dialog>
    </>
  )
}
