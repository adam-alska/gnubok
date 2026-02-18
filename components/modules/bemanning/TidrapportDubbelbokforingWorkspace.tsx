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
import { Plus, Pencil, Trash2, Loader2, Search, Clock } from 'lucide-react'

interface ModuleWorkspaceProps { module: { slug: string; name: string; cat: string; desc: string; longDesc: string }; sectorSlug: string; settingsHref: string }
interface Item { id: string; consultant: string; client: string; date: string; hours: number; hourly_rate: number; salary_cost: number; margin: number; description: string }
function generateId(): string { return Date.now().toString(36) + Math.random().toString(36).substring(2, 7) }
function fmt(n: number): string { return new Intl.NumberFormat('sv-SE', { maximumFractionDigits: 0 }).format(n) }

const DEFAULT_ITEMS: Item[] = [
  { id: '1', consultant: 'Anna S', client: 'TechAB', date: '2025-03-20', hours: 8, hourly_rate: 850, salary_cost: 3200, margin: 3600, description: 'Utveckling' },
  { id: '2', consultant: 'Johan L', client: 'Firma XY', date: '2025-03-20', hours: 8, hourly_rate: 750, salary_cost: 2800, margin: 3200, description: 'Projektledning' },
]
const EMPTY_FORM = { consultant: '', client: '', date: '', hours: '', hourly_rate: '850', salary_cost: '', description: '' }

export function TidrapportDubbelbokforingWorkspace({ module: mod, sectorSlug, settingsHref }: ModuleWorkspaceProps) {
  const supabase = createClient()
  const [loading, setLoading] = useState(true); const [saving, setSaving] = useState(false); const [items, setItems] = useState<Item[]>([]); const [dialogOpen, setDialogOpen] = useState(false); const [editing, setEditing] = useState<Item | null>(null); const [form, setForm] = useState(EMPTY_FORM); const [deleteDialogOpen, setDeleteDialogOpen] = useState(false); const [toDelete, setToDelete] = useState<Item | null>(null); const [searchQuery, setSearchQuery] = useState('')
  const save = useCallback(async (d: Item[]) => { setSaving(true); const { data: { user } } = await supabase.auth.getUser(); if (!user) { setSaving(false); return }; await supabase.from('module_configs').upsert({ user_id: user.id, sector_slug: sectorSlug, module_slug: mod.slug, config_key: 'time_reports', config_value: d }, { onConflict: 'user_id,sector_slug,module_slug,config_key' }); setSaving(false) }, [supabase, sectorSlug, mod.slug])
  const fetch_ = useCallback(async () => { setLoading(true); const { data: { user } } = await supabase.auth.getUser(); if (!user) { setLoading(false); return }; const { data } = await supabase.from('module_configs').select('config_value').eq('user_id', user.id).eq('sector_slug', sectorSlug).eq('module_slug', mod.slug).eq('config_key', 'time_reports').maybeSingle(); if (data?.config_value && Array.isArray(data.config_value) && data.config_value.length > 0) { setItems(data.config_value as Item[]) } else { setItems(DEFAULT_ITEMS); await supabase.from('module_configs').upsert({ user_id: user.id, sector_slug: sectorSlug, module_slug: mod.slug, config_key: 'time_reports', config_value: DEFAULT_ITEMS }, { onConflict: 'user_id,sector_slug,module_slug,config_key' }) }; setLoading(false) }, [supabase, sectorSlug, mod.slug])
  useEffect(() => { fetch_() }, [fetch_])
  const filtered = useMemo(() => { let r = items; if (searchQuery.trim()) { const q = searchQuery.toLowerCase(); r = r.filter((i) => i.consultant.toLowerCase().includes(q) || i.client.toLowerCase().includes(q)) }; return r.sort((a, b) => b.date.localeCompare(a.date)) }, [items, searchQuery])
  const stats = useMemo(() => ({ totalBilled: items.reduce((s, i) => s + i.hours * i.hourly_rate, 0), totalCost: items.reduce((s, i) => s + i.salary_cost, 0), totalMargin: items.reduce((s, i) => s + i.margin, 0), totalHours: items.reduce((s, i) => s + i.hours, 0) }), [items])
  function openNew() { setEditing(null); setForm({ ...EMPTY_FORM }); setDialogOpen(true) }
  function openEdit(i: Item) { setEditing(i); setForm({ consultant: i.consultant, client: i.client, date: i.date, hours: String(i.hours), hourly_rate: String(i.hourly_rate), salary_cost: String(i.salary_cost), description: i.description }); setDialogOpen(true) }
  async function handleSave() { const h = parseFloat(form.hours) || 0; const r = parseFloat(form.hourly_rate) || 0; const sc = parseFloat(form.salary_cost) || 0; const entry: Item = { id: editing?.id ?? generateId(), consultant: form.consultant.trim(), client: form.client.trim(), date: form.date, hours: h, hourly_rate: r, salary_cost: sc, margin: h * r - sc, description: form.description.trim() }; const u = editing ? items.map((i) => i.id === editing.id ? entry : i) : [...items, entry]; setItems(u); setDialogOpen(false); await save(u) }
  function openDel(i: Item) { setToDelete(i); setDeleteDialogOpen(true) }
  async function handleDel() { if (!toDelete) return; const u = items.filter((i) => i.id !== toDelete.id); setItems(u); setDeleteDialogOpen(false); setToDelete(null); await save(u) }

  return (
    <>
      <ModuleWorkspaceShell title={mod.name} description={mod.desc} category="bokforing" sectorName="Bemanning & HR" backHref={`/m/${sectorSlug}`} settingsHref={settingsHref} actions={<Button onClick={openNew}><Plus className="mr-2 h-4 w-4" />Ny tidrapport</Button>}>
        {loading ? <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div> : (
          <div className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-4">
              <Card><CardHeader className="pb-2"><CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Fakturerat</CardTitle></CardHeader><CardContent><span className="text-2xl font-semibold tracking-tight">{fmt(stats.totalBilled)}</span><span className="text-sm text-muted-foreground ml-1">kr</span></CardContent></Card>
              <Card><CardHeader className="pb-2"><CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Lönekostnad</CardTitle></CardHeader><CardContent><span className="text-2xl font-semibold tracking-tight">{fmt(stats.totalCost)}</span><span className="text-sm text-muted-foreground ml-1">kr</span></CardContent></Card>
              <Card><CardHeader className="pb-2"><CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Marginal</CardTitle></CardHeader><CardContent><span className="text-2xl font-semibold tracking-tight">{fmt(stats.totalMargin)}</span><span className="text-sm text-muted-foreground ml-1">kr</span></CardContent></Card>
              <Card><CardHeader className="pb-2"><CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Timmar</CardTitle></CardHeader><CardContent><span className="text-2xl font-semibold tracking-tight">{stats.totalHours}</span><span className="text-sm text-muted-foreground ml-1">h</span></CardContent></Card>
            </div>
            <div className="flex items-center gap-3"><div className="relative flex-1 max-w-sm"><Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" /><Input placeholder="Sök konsult eller kund..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-9" /></div>{saving && <div className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" />Sparar...</div>}</div>
            {filtered.length === 0 ? <EmptyModuleState icon={Clock} title="Inga tidrapporter" description="Registrera tid för att generera faktura och lön." actionLabel="Ny tidrapport" onAction={openNew} /> : (
              <div className="rounded-xl border border-border overflow-hidden"><Table><TableHeader><TableRow className="bg-muted/50"><TableHead className="font-medium">Konsult</TableHead><TableHead className="font-medium">Kund</TableHead><TableHead className="font-medium">Datum</TableHead><TableHead className="font-medium text-right">Tim</TableHead><TableHead className="font-medium text-right">Fakturerat</TableHead><TableHead className="font-medium text-right">Lönekostnad</TableHead><TableHead className="font-medium text-right">Marginal</TableHead><TableHead className="font-medium text-right">Åtgärder</TableHead></TableRow></TableHeader><TableBody>{filtered.map((i) => (
                <TableRow key={i.id}><TableCell className="font-medium">{i.consultant}</TableCell><TableCell>{i.client}</TableCell><TableCell>{i.date}</TableCell><TableCell className="text-right tabular-nums">{i.hours}</TableCell><TableCell className="text-right tabular-nums">{fmt(i.hours * i.hourly_rate)}</TableCell><TableCell className="text-right tabular-nums">{fmt(i.salary_cost)}</TableCell><TableCell className="text-right tabular-nums font-semibold">{fmt(i.margin)}</TableCell><TableCell className="text-right"><div className="flex items-center justify-end gap-1"><Button variant="ghost" size="icon" onClick={() => openEdit(i)}><Pencil className="h-4 w-4" /></Button><Button variant="ghost" size="icon" className="text-red-600 hover:text-red-700" onClick={() => openDel(i)}><Trash2 className="h-4 w-4" /></Button></div></TableCell></TableRow>
              ))}</TableBody></Table></div>
            )}
          </div>
        )}
      </ModuleWorkspaceShell>
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}><DialogContent className="max-w-lg"><DialogHeader><DialogTitle>{editing ? 'Redigera tidrapport' : 'Ny tidrapport'}</DialogTitle><DialogDescription>Tidrapportering genererar underlag för faktura (konto 3010) och lönekostnad (konto 7010).</DialogDescription></DialogHeader><div className="grid gap-4 py-2"><div className="grid grid-cols-2 gap-4"><div className="grid gap-2"><Label>Konsult *</Label><Input value={form.consultant} onChange={(e) => setForm((f) => ({ ...f, consultant: e.target.value }))} /></div><div className="grid gap-2"><Label>Kund *</Label><Input value={form.client} onChange={(e) => setForm((f) => ({ ...f, client: e.target.value }))} /></div></div><div className="grid grid-cols-4 gap-4"><div className="grid gap-2"><Label>Datum</Label><Input type="date" value={form.date} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} /></div><div className="grid gap-2"><Label>Timmar</Label><Input type="number" min={0} step={0.5} value={form.hours} onChange={(e) => setForm((f) => ({ ...f, hours: e.target.value }))} /></div><div className="grid gap-2"><Label>Timpris (kr)</Label><Input type="number" min={0} value={form.hourly_rate} onChange={(e) => setForm((f) => ({ ...f, hourly_rate: e.target.value }))} /></div><div className="grid gap-2"><Label>Lönekostnad</Label><Input type="number" min={0} value={form.salary_cost} onChange={(e) => setForm((f) => ({ ...f, salary_cost: e.target.value }))} /></div></div><div className="grid gap-2"><Label>Beskrivning</Label><Input value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} /></div></div><DialogFooter><Button variant="outline" onClick={() => setDialogOpen(false)}>Avbryt</Button><Button onClick={handleSave} disabled={!form.consultant.trim()}>{editing ? 'Uppdatera' : 'Skapa'}</Button></DialogFooter></DialogContent></Dialog>
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}><DialogContent className="max-w-sm"><DialogHeader><DialogTitle>Ta bort</DialogTitle><DialogDescription>Är du säker på att du vill ta bort tidrapporten för <span className="font-semibold">{toDelete?.consultant}</span>?</DialogDescription></DialogHeader><DialogFooter><Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>Avbryt</Button><Button variant="destructive" onClick={handleDel}><Trash2 className="mr-2 h-4 w-4" />Ta bort</Button></DialogFooter></DialogContent></Dialog>
    </>
  )
}
