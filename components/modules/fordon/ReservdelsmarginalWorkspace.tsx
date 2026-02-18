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
import { Plus, Pencil, Trash2, Loader2, Search, TrendingUp } from 'lucide-react'

interface ModuleWorkspaceProps { module: { slug: string; name: string; cat: string; desc: string; longDesc: string }; sectorSlug: string; settingsHref: string }
interface Item { id: string; category: string; purchase_total: number; sell_total: number; margin_pct: number; month: string }
function generateId(): string { return Date.now().toString(36) + Math.random().toString(36).substring(2, 7) }
function fmt(n: number): string { return new Intl.NumberFormat('sv-SE', { maximumFractionDigits: 0 }).format(n) }

const DEFAULT_ITEMS: Item[] = [
  { id: '1', category: 'Bromsar', purchase_total: 45000, sell_total: 89000, margin_pct: 49.4, month: '2025-03' },
  { id: '2', category: 'Filter', purchase_total: 8500, sell_total: 19500, margin_pct: 56.4, month: '2025-03' },
  { id: '3', category: 'Motor', purchase_total: 62000, sell_total: 124000, margin_pct: 50.0, month: '2025-03' },
]
const EMPTY_FORM = { category: '', purchase_total: '', sell_total: '', month: '' }

export function ReservdelsmarginalWorkspace({ module: mod, sectorSlug, settingsHref }: ModuleWorkspaceProps) {
  const supabase = createClient()
  const [loading, setLoading] = useState(true); const [saving, setSaving] = useState(false); const [items, setItems] = useState<Item[]>([]); const [dialogOpen, setDialogOpen] = useState(false); const [editing, setEditing] = useState<Item | null>(null); const [form, setForm] = useState(EMPTY_FORM); const [deleteDialogOpen, setDeleteDialogOpen] = useState(false); const [toDelete, setToDelete] = useState<Item | null>(null); const [searchQuery, setSearchQuery] = useState('')
  const save = useCallback(async (d: Item[]) => { setSaving(true); const { data: { user } } = await supabase.auth.getUser(); if (!user) { setSaving(false); return }; await supabase.from('module_configs').upsert({ user_id: user.id, sector_slug: sectorSlug, module_slug: mod.slug, config_key: 'parts_margin', config_value: d }, { onConflict: 'user_id,sector_slug,module_slug,config_key' }); setSaving(false) }, [supabase, sectorSlug, mod.slug])
  const fetch_ = useCallback(async () => { setLoading(true); const { data: { user } } = await supabase.auth.getUser(); if (!user) { setLoading(false); return }; const { data } = await supabase.from('module_configs').select('config_value').eq('user_id', user.id).eq('sector_slug', sectorSlug).eq('module_slug', mod.slug).eq('config_key', 'parts_margin').maybeSingle(); if (data?.config_value && Array.isArray(data.config_value) && data.config_value.length > 0) { setItems(data.config_value as Item[]) } else { setItems(DEFAULT_ITEMS); await supabase.from('module_configs').upsert({ user_id: user.id, sector_slug: sectorSlug, module_slug: mod.slug, config_key: 'parts_margin', config_value: DEFAULT_ITEMS }, { onConflict: 'user_id,sector_slug,module_slug,config_key' }) }; setLoading(false) }, [supabase, sectorSlug, mod.slug])
  useEffect(() => { fetch_() }, [fetch_])
  const filtered = useMemo(() => { let r = items; if (searchQuery.trim()) { const q = searchQuery.toLowerCase(); r = r.filter((i) => i.category.toLowerCase().includes(q)) }; return r }, [items, searchQuery])
  const stats = useMemo(() => { const totalPurchase = items.reduce((s, i) => s + i.purchase_total, 0); const totalSell = items.reduce((s, i) => s + i.sell_total, 0); const avgMargin = totalSell > 0 ? ((totalSell - totalPurchase) / totalSell) * 100 : 0; return { totalPurchase, totalSell, avgMargin, count: items.length } }, [items])
  function openNew() { setEditing(null); setForm({ ...EMPTY_FORM }); setDialogOpen(true) }
  function openEdit(i: Item) { setEditing(i); setForm({ category: i.category, purchase_total: String(i.purchase_total), sell_total: String(i.sell_total), month: i.month }); setDialogOpen(true) }
  async function handleSave() { const pp = parseFloat(form.purchase_total) || 0; const sp = parseFloat(form.sell_total) || 0; const margin = sp > 0 ? ((sp - pp) / sp) * 100 : 0; const entry: Item = { id: editing?.id ?? generateId(), category: form.category.trim(), purchase_total: pp, sell_total: sp, margin_pct: Math.round(margin * 10) / 10, month: form.month }; const u = editing ? items.map((i) => i.id === editing.id ? entry : i) : [...items, entry]; setItems(u); setDialogOpen(false); await save(u) }
  function openDel(i: Item) { setToDelete(i); setDeleteDialogOpen(true) }
  async function handleDel() { if (!toDelete) return; const u = items.filter((i) => i.id !== toDelete.id); setItems(u); setDeleteDialogOpen(false); setToDelete(null); await save(u) }

  return (
    <>
      <ModuleWorkspaceShell title={mod.name} description={mod.desc} category="rapport" sectorName="Fordon & Verkstad" backHref={`/m/${sectorSlug}`} settingsHref={settingsHref} actions={<Button onClick={openNew}><Plus className="mr-2 h-4 w-4" />Ny kategori</Button>}>
        {loading ? <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div> : (
          <div className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Card><CardHeader className="pb-2"><CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Snitt marginal</CardTitle></CardHeader><CardContent><span className="text-2xl font-semibold tracking-tight">{stats.avgMargin.toFixed(1)}</span><span className="text-sm text-muted-foreground ml-1">%</span></CardContent></Card>
              <Card><CardHeader className="pb-2"><CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Total inköp</CardTitle></CardHeader><CardContent><span className="text-2xl font-semibold tracking-tight">{fmt(stats.totalPurchase)}</span><span className="text-sm text-muted-foreground ml-1">kr</span></CardContent></Card>
              <Card><CardHeader className="pb-2"><CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Total försäljning</CardTitle></CardHeader><CardContent><span className="text-2xl font-semibold tracking-tight">{fmt(stats.totalSell)}</span><span className="text-sm text-muted-foreground ml-1">kr</span></CardContent></Card>
              <Card><CardHeader className="pb-2"><CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Kategorier</CardTitle></CardHeader><CardContent><span className="text-2xl font-semibold tracking-tight">{stats.count}</span></CardContent></Card>
            </div>
            <div className="flex items-center gap-3"><div className="relative flex-1 max-w-sm"><Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" /><Input placeholder="Sök kategori..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-9" /></div>{saving && <div className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" />Sparar...</div>}</div>
            {filtered.length === 0 ? <EmptyModuleState icon={TrendingUp} title="Ingen marginaldata" description="Lägg till reservdelsförsäljning per kategori." actionLabel="Ny kategori" onAction={openNew} /> : (
              <div className="rounded-xl border border-border overflow-hidden"><Table><TableHeader><TableRow className="bg-muted/50"><TableHead className="font-medium">Kategori</TableHead><TableHead className="font-medium">Månad</TableHead><TableHead className="font-medium text-right">Inköp</TableHead><TableHead className="font-medium text-right">Försäljning</TableHead><TableHead className="font-medium text-right">Marginal %</TableHead><TableHead className="font-medium text-right">Åtgärder</TableHead></TableRow></TableHeader><TableBody>{filtered.map((i) => (
                <TableRow key={i.id}><TableCell className="font-medium">{i.category}</TableCell><TableCell>{i.month}</TableCell><TableCell className="text-right tabular-nums">{fmt(i.purchase_total)}</TableCell><TableCell className="text-right tabular-nums">{fmt(i.sell_total)}</TableCell><TableCell className="text-right tabular-nums font-semibold">{i.margin_pct.toFixed(1)}%</TableCell><TableCell className="text-right"><div className="flex items-center justify-end gap-1"><Button variant="ghost" size="icon" onClick={() => openEdit(i)}><Pencil className="h-4 w-4" /></Button><Button variant="ghost" size="icon" className="text-red-600 hover:text-red-700" onClick={() => openDel(i)}><Trash2 className="h-4 w-4" /></Button></div></TableCell></TableRow>
              ))}</TableBody></Table></div>
            )}
          </div>
        )}
      </ModuleWorkspaceShell>
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}><DialogContent className="max-w-md"><DialogHeader><DialogTitle>{editing ? 'Redigera' : 'Ny kategori'}</DialogTitle><DialogDescription>Ange försäljning och inköp per reservdelskategori.</DialogDescription></DialogHeader><div className="grid gap-4 py-2"><div className="grid grid-cols-2 gap-4"><div className="grid gap-2"><Label>Kategori *</Label><Input value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))} placeholder="Bromsar" /></div><div className="grid gap-2"><Label>Månad</Label><Input type="month" value={form.month} onChange={(e) => setForm((f) => ({ ...f, month: e.target.value }))} /></div></div><div className="grid grid-cols-2 gap-4"><div className="grid gap-2"><Label>Inköp (kr)</Label><Input type="number" min={0} value={form.purchase_total} onChange={(e) => setForm((f) => ({ ...f, purchase_total: e.target.value }))} /></div><div className="grid gap-2"><Label>Försäljning (kr)</Label><Input type="number" min={0} value={form.sell_total} onChange={(e) => setForm((f) => ({ ...f, sell_total: e.target.value }))} /></div></div></div><DialogFooter><Button variant="outline" onClick={() => setDialogOpen(false)}>Avbryt</Button><Button onClick={handleSave} disabled={!form.category.trim()}>{editing ? 'Uppdatera' : 'Skapa'}</Button></DialogFooter></DialogContent></Dialog>
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}><DialogContent className="max-w-sm"><DialogHeader><DialogTitle>Ta bort</DialogTitle><DialogDescription>Är du säker på att du vill ta bort <span className="font-semibold">{toDelete?.category}</span>?</DialogDescription></DialogHeader><DialogFooter><Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>Avbryt</Button><Button variant="destructive" onClick={handleDel}><Trash2 className="mr-2 h-4 w-4" />Ta bort</Button></DialogFooter></DialogContent></Dialog>
    </>
  )
}
