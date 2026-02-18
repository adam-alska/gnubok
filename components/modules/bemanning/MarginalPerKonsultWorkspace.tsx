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
import { Plus, Pencil, Trash2, Loader2, Search, TrendingUp } from 'lucide-react'

interface ModuleWorkspaceProps { module: { slug: string; name: string; cat: string; desc: string; longDesc: string }; sectorSlug: string; settingsHref: string }
interface Item { id: string; consultant: string; billed: number; cost: number; margin_pct: number }
function generateId(): string { return Date.now().toString(36) + Math.random().toString(36).substring(2, 7) }
function fmt(n: number): string { return new Intl.NumberFormat('sv-SE', { maximumFractionDigits: 0 }).format(n) }

const DEFAULT_ITEMS: Item[] = [
  { id: '1', consultant: 'Anna S', billed: 136000, cost: 68000, margin_pct: 50.0 },
  { id: '2', consultant: 'Johan L', billed: 120000, cost: 72000, margin_pct: 40.0 },
  { id: '3', consultant: 'Erik M', billed: 96000, cost: 54000, margin_pct: 43.8 },
]
const EMPTY_FORM = { consultant: '', billed: '', cost: '' }

export function MarginalPerKonsultWorkspace({ module: mod, sectorSlug, settingsHref }: ModuleWorkspaceProps) {
  const supabase = createClient()
  const [loading, setLoading] = useState(true); const [saving, setSaving] = useState(false); const [items, setItems] = useState<Item[]>([]); const [dialogOpen, setDialogOpen] = useState(false); const [editing, setEditing] = useState<Item | null>(null); const [form, setForm] = useState(EMPTY_FORM); const [deleteDialogOpen, setDeleteDialogOpen] = useState(false); const [toDelete, setToDelete] = useState<Item | null>(null); const [searchQuery, setSearchQuery] = useState('')
  const save = useCallback(async (d: Item[]) => { setSaving(true); const { data: { user } } = await supabase.auth.getUser(); if (!user) { setSaving(false); return }; await supabase.from('module_configs').upsert({ user_id: user.id, sector_slug: sectorSlug, module_slug: mod.slug, config_key: 'consultant_margin', config_value: d }, { onConflict: 'user_id,sector_slug,module_slug,config_key' }); setSaving(false) }, [supabase, sectorSlug, mod.slug])
  const fetch_ = useCallback(async () => { setLoading(true); const { data: { user } } = await supabase.auth.getUser(); if (!user) { setLoading(false); return }; const { data } = await supabase.from('module_configs').select('config_value').eq('user_id', user.id).eq('sector_slug', sectorSlug).eq('module_slug', mod.slug).eq('config_key', 'consultant_margin').maybeSingle(); if (data?.config_value && Array.isArray(data.config_value) && data.config_value.length > 0) { setItems(data.config_value as Item[]) } else { setItems(DEFAULT_ITEMS); await supabase.from('module_configs').upsert({ user_id: user.id, sector_slug: sectorSlug, module_slug: mod.slug, config_key: 'consultant_margin', config_value: DEFAULT_ITEMS }, { onConflict: 'user_id,sector_slug,module_slug,config_key' }) }; setLoading(false) }, [supabase, sectorSlug, mod.slug])
  useEffect(() => { fetch_() }, [fetch_])
  const filtered = useMemo(() => { let r = items; if (searchQuery.trim()) { const q = searchQuery.toLowerCase(); r = r.filter((i) => i.consultant.toLowerCase().includes(q)) }; return r.sort((a, b) => b.margin_pct - a.margin_pct) }, [items, searchQuery])
  const stats = useMemo(() => { const totalBilled = items.reduce((s, i) => s + i.billed, 0); const totalCost = items.reduce((s, i) => s + i.cost, 0); const avgMargin = totalBilled > 0 ? ((totalBilled - totalCost) / totalBilled) * 100 : 0; return { totalBilled, totalCost, avgMargin, count: items.length } }, [items])
  function openNew() { setEditing(null); setForm({ ...EMPTY_FORM }); setDialogOpen(true) }
  function openEdit(i: Item) { setEditing(i); setForm({ consultant: i.consultant, billed: String(i.billed), cost: String(i.cost) }); setDialogOpen(true) }
  async function handleSave() { const b = parseFloat(form.billed) || 0; const c = parseFloat(form.cost) || 0; const margin = b > 0 ? ((b - c) / b) * 100 : 0; const entry: Item = { id: editing?.id ?? generateId(), consultant: form.consultant.trim(), billed: b, cost: c, margin_pct: Math.round(margin * 10) / 10 }; const u = editing ? items.map((i) => i.id === editing.id ? entry : i) : [...items, entry]; setItems(u); setDialogOpen(false); await save(u) }
  function openDel(i: Item) { setToDelete(i); setDeleteDialogOpen(true) }
  async function handleDel() { if (!toDelete) return; const u = items.filter((i) => i.id !== toDelete.id); setItems(u); setDeleteDialogOpen(false); setToDelete(null); await save(u) }

  return (
    <>
      <ModuleWorkspaceShell title={mod.name} description={mod.desc} category="rapport" sectorName="Bemanning & HR" backHref={`/m/${sectorSlug}`} settingsHref={settingsHref} actions={<Button onClick={openNew}><Plus className="mr-2 h-4 w-4" />Ny konsult</Button>}>
        {loading ? <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div> : (
          <div className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-4">
              <Card><CardHeader className="pb-2"><CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Snitt marginal</CardTitle></CardHeader><CardContent><span className="text-2xl font-semibold tracking-tight">{stats.avgMargin.toFixed(1)}</span><span className="text-sm text-muted-foreground ml-1">%</span></CardContent></Card>
              <Card><CardHeader className="pb-2"><CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Total fakturering</CardTitle></CardHeader><CardContent><span className="text-2xl font-semibold tracking-tight">{fmt(stats.totalBilled)}</span><span className="text-sm text-muted-foreground ml-1">kr</span></CardContent></Card>
              <Card><CardHeader className="pb-2"><CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Total kostnad</CardTitle></CardHeader><CardContent><span className="text-2xl font-semibold tracking-tight">{fmt(stats.totalCost)}</span><span className="text-sm text-muted-foreground ml-1">kr</span></CardContent></Card>
              <Card><CardHeader className="pb-2"><CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Konsulter</CardTitle></CardHeader><CardContent><span className="text-2xl font-semibold tracking-tight">{stats.count}</span></CardContent></Card>
            </div>
            <div className="flex items-center gap-3"><div className="relative flex-1 max-w-sm"><Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" /><Input placeholder="Sök konsult..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-9" /></div>{saving && <div className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" />Sparar...</div>}</div>
            {filtered.length === 0 ? <EmptyModuleState icon={TrendingUp} title="Ingen marginaldata" description="Lägg till konsulter för att analysera marginal." actionLabel="Ny konsult" onAction={openNew} /> : (
              <div className="rounded-xl border border-border overflow-hidden"><Table><TableHeader><TableRow className="bg-muted/50"><TableHead className="font-medium">Konsult</TableHead><TableHead className="font-medium text-right">Fakturerat</TableHead><TableHead className="font-medium text-right">Kostnad</TableHead><TableHead className="font-medium text-right">Marginal</TableHead><TableHead className="font-medium text-right">Marginal %</TableHead><TableHead className="font-medium text-right">Åtgärder</TableHead></TableRow></TableHeader><TableBody>{filtered.map((i) => (
                <TableRow key={i.id}><TableCell className="font-medium">{i.consultant}</TableCell><TableCell className="text-right tabular-nums">{fmt(i.billed)}</TableCell><TableCell className="text-right tabular-nums">{fmt(i.cost)}</TableCell><TableCell className="text-right tabular-nums font-semibold">{fmt(i.billed - i.cost)}</TableCell><TableCell className="text-right"><Badge variant="secondary" className={i.margin_pct >= 40 ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400' : i.margin_pct >= 25 ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400' : 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400'}>{i.margin_pct.toFixed(1)}%</Badge></TableCell><TableCell className="text-right"><div className="flex items-center justify-end gap-1"><Button variant="ghost" size="icon" onClick={() => openEdit(i)}><Pencil className="h-4 w-4" /></Button><Button variant="ghost" size="icon" className="text-red-600 hover:text-red-700" onClick={() => openDel(i)}><Trash2 className="h-4 w-4" /></Button></div></TableCell></TableRow>
              ))}</TableBody></Table></div>
            )}
          </div>
        )}
      </ModuleWorkspaceShell>
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}><DialogContent className="max-w-md"><DialogHeader><DialogTitle>{editing ? 'Redigera' : 'Ny konsult'}</DialogTitle><DialogDescription>Marginal beräknas automatiskt utifrån fakturerat och kostnad.</DialogDescription></DialogHeader><div className="grid gap-4 py-2"><div className="grid gap-2"><Label>Konsult *</Label><Input value={form.consultant} onChange={(e) => setForm((f) => ({ ...f, consultant: e.target.value }))} /></div><div className="grid grid-cols-2 gap-4"><div className="grid gap-2"><Label>Fakturerat (kr)</Label><Input type="number" min={0} value={form.billed} onChange={(e) => setForm((f) => ({ ...f, billed: e.target.value }))} /></div><div className="grid gap-2"><Label>Kostnad (kr)</Label><Input type="number" min={0} value={form.cost} onChange={(e) => setForm((f) => ({ ...f, cost: e.target.value }))} /></div></div></div><DialogFooter><Button variant="outline" onClick={() => setDialogOpen(false)}>Avbryt</Button><Button onClick={handleSave} disabled={!form.consultant.trim()}>{editing ? 'Uppdatera' : 'Skapa'}</Button></DialogFooter></DialogContent></Dialog>
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}><DialogContent className="max-w-sm"><DialogHeader><DialogTitle>Ta bort</DialogTitle><DialogDescription>Är du säker på att du vill ta bort <span className="font-semibold">{toDelete?.consultant}</span>?</DialogDescription></DialogHeader><DialogFooter><Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>Avbryt</Button><Button variant="destructive" onClick={handleDel}><Trash2 className="mr-2 h-4 w-4" />Ta bort</Button></DialogFooter></DialogContent></Dialog>
    </>
  )
}
