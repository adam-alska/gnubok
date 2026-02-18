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
import { Plus, Pencil, Trash2, Loader2, Search, Recycle } from 'lucide-react'

interface ModuleWorkspaceProps { module: { slug: string; name: string; cat: string; desc: string; longDesc: string }; sectorSlug: string; settingsHref: string }
interface Item { id: string; name: string; purchase_price: number; sell_price: number; margin: number; vat_on_margin: number; date: string; customer: string }

function generateId(): string { return Date.now().toString(36) + Math.random().toString(36).substring(2, 7) }
function fmt(n: number): string { return new Intl.NumberFormat('sv-SE', { maximumFractionDigits: 0 }).format(n) }
function fmt2(n: number): string { return new Intl.NumberFormat('sv-SE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n) }

const DEFAULT_ITEMS: Item[] = [
  { id: '1', name: 'Växellåda Volvo V70', purchase_price: 3500, sell_price: 8500, margin: 5000, vat_on_margin: 1000, date: '2025-03-10', customer: 'Anders J' },
  { id: '2', name: 'Generator BMW E46', purchase_price: 1200, sell_price: 3200, margin: 2000, vat_on_margin: 400, date: '2025-03-15', customer: 'Maria K' },
]
const EMPTY_FORM = { name: '', purchase_price: '', sell_price: '', date: '', customer: '' }

export function VmbBegagnadeDelarWorkspace({ module: mod, sectorSlug, settingsHref }: ModuleWorkspaceProps) {
  const supabase = createClient()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [items, setItems] = useState<Item[]>([])
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<Item | null>(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [toDelete, setToDelete] = useState<Item | null>(null)
  const [searchQuery, setSearchQuery] = useState('')

  const save = useCallback(async (d: Item[]) => { setSaving(true); const { data: { user } } = await supabase.auth.getUser(); if (!user) { setSaving(false); return }; await supabase.from('module_configs').upsert({ user_id: user.id, sector_slug: sectorSlug, module_slug: mod.slug, config_key: 'vmb_items', config_value: d }, { onConflict: 'user_id,sector_slug,module_slug,config_key' }); setSaving(false) }, [supabase, sectorSlug, mod.slug])
  const fetch_ = useCallback(async () => { setLoading(true); const { data: { user } } = await supabase.auth.getUser(); if (!user) { setLoading(false); return }; const { data } = await supabase.from('module_configs').select('config_value').eq('user_id', user.id).eq('sector_slug', sectorSlug).eq('module_slug', mod.slug).eq('config_key', 'vmb_items').maybeSingle(); if (data?.config_value && Array.isArray(data.config_value) && data.config_value.length > 0) { setItems(data.config_value as Item[]) } else { setItems(DEFAULT_ITEMS); await supabase.from('module_configs').upsert({ user_id: user.id, sector_slug: sectorSlug, module_slug: mod.slug, config_key: 'vmb_items', config_value: DEFAULT_ITEMS }, { onConflict: 'user_id,sector_slug,module_slug,config_key' }) }; setLoading(false) }, [supabase, sectorSlug, mod.slug])
  useEffect(() => { fetch_() }, [fetch_])

  const filtered = useMemo(() => { let r = items; if (searchQuery.trim()) { const q = searchQuery.toLowerCase(); r = r.filter((i) => i.name.toLowerCase().includes(q) || i.customer.toLowerCase().includes(q)) }; return r.sort((a, b) => b.date.localeCompare(a.date)) }, [items, searchQuery])
  const stats = useMemo(() => ({ totalMargin: items.reduce((s, i) => s + i.margin, 0), totalVat: items.reduce((s, i) => s + i.vat_on_margin, 0), count: items.length, avgMarginPct: items.length > 0 ? items.reduce((s, i) => s + (i.sell_price > 0 ? (i.margin / i.sell_price) * 100 : 0), 0) / items.length : 0 }), [items])

  function openNew() { setEditing(null); setForm({ ...EMPTY_FORM }); setDialogOpen(true) }
  function openEdit(i: Item) { setEditing(i); setForm({ name: i.name, purchase_price: String(i.purchase_price), sell_price: String(i.sell_price), date: i.date, customer: i.customer }); setDialogOpen(true) }
  async function handleSave() { const pp = parseFloat(form.purchase_price) || 0; const sp = parseFloat(form.sell_price) || 0; const margin = sp - pp; const vatOnMargin = margin > 0 ? margin * 0.2 : 0; const entry: Item = { id: editing?.id ?? generateId(), name: form.name.trim(), purchase_price: pp, sell_price: sp, margin, vat_on_margin: Math.round(vatOnMargin * 100) / 100, date: form.date, customer: form.customer.trim() }; const u = editing ? items.map((i) => i.id === editing.id ? entry : i) : [...items, entry]; setItems(u); setDialogOpen(false); await save(u) }
  function openDel(i: Item) { setToDelete(i); setDeleteDialogOpen(true) }
  async function handleDel() { if (!toDelete) return; const u = items.filter((i) => i.id !== toDelete.id); setItems(u); setDeleteDialogOpen(false); setToDelete(null); await save(u) }

  return (
    <>
      <ModuleWorkspaceShell title={mod.name} description={mod.desc} category="bokforing" sectorName="Fordon & Verkstad" backHref={`/m/${sectorSlug}`} settingsHref={settingsHref} actions={<Button onClick={openNew}><Plus className="mr-2 h-4 w-4" />Ny VMB-post</Button>}>
        {loading ? <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div> : (
          <div className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Card><CardHeader className="pb-2"><CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Total marginal</CardTitle></CardHeader><CardContent><span className="text-2xl font-semibold tracking-tight">{fmt(stats.totalMargin)}</span><span className="text-sm text-muted-foreground ml-1">kr</span></CardContent></Card>
              <Card><CardHeader className="pb-2"><CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Moms på marginal (2640)</CardTitle></CardHeader><CardContent><span className="text-2xl font-semibold tracking-tight">{fmt2(stats.totalVat)}</span><span className="text-sm text-muted-foreground ml-1">kr</span></CardContent></Card>
              <Card><CardHeader className="pb-2"><CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Snitt marginal %</CardTitle></CardHeader><CardContent><span className="text-2xl font-semibold tracking-tight">{stats.avgMarginPct.toFixed(1)}</span><span className="text-sm text-muted-foreground ml-1">%</span></CardContent></Card>
              <Card><CardHeader className="pb-2"><CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Antal poster</CardTitle></CardHeader><CardContent><span className="text-2xl font-semibold tracking-tight">{stats.count}</span></CardContent></Card>
            </div>
            <div className="flex items-center gap-3"><div className="relative flex-1 max-w-sm"><Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" /><Input placeholder="Sök del eller kund..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-9" /></div>{saving && <div className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" />Sparar...</div>}</div>
            {filtered.length === 0 ? <EmptyModuleState icon={Recycle} title="Inga VMB-poster" description="Registrera försäljning av begagnade delar med vinstmarginalbeskattning." actionLabel="Ny VMB-post" onAction={openNew} /> : (
              <div className="rounded-xl border border-border overflow-hidden"><Table><TableHeader><TableRow className="bg-muted/50"><TableHead className="font-medium">Del</TableHead><TableHead className="font-medium">Kund</TableHead><TableHead className="font-medium">Datum</TableHead><TableHead className="font-medium text-right">Inköp</TableHead><TableHead className="font-medium text-right">Sälj</TableHead><TableHead className="font-medium text-right">Marginal</TableHead><TableHead className="font-medium text-right">Moms</TableHead><TableHead className="font-medium text-right">Åtgärder</TableHead></TableRow></TableHeader><TableBody>{filtered.map((i) => (<TableRow key={i.id}><TableCell className="font-medium">{i.name}</TableCell><TableCell>{i.customer}</TableCell><TableCell>{i.date}</TableCell><TableCell className="text-right tabular-nums">{fmt(i.purchase_price)}</TableCell><TableCell className="text-right tabular-nums">{fmt(i.sell_price)}</TableCell><TableCell className="text-right tabular-nums font-semibold">{fmt(i.margin)}</TableCell><TableCell className="text-right tabular-nums">{fmt2(i.vat_on_margin)}</TableCell><TableCell className="text-right"><div className="flex items-center justify-end gap-1"><Button variant="ghost" size="icon" onClick={() => openEdit(i)}><Pencil className="h-4 w-4" /></Button><Button variant="ghost" size="icon" className="text-red-600 hover:text-red-700" onClick={() => openDel(i)}><Trash2 className="h-4 w-4" /></Button></div></TableCell></TableRow>))}</TableBody></Table></div>
            )}
          </div>
        )}
      </ModuleWorkspaceShell>
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}><DialogContent className="max-w-md"><DialogHeader><DialogTitle>{editing ? 'Redigera VMB-post' : 'Ny VMB-post'}</DialogTitle><DialogDescription>Moms beräknas automatiskt på vinstmarginalen (25% av marginalen).</DialogDescription></DialogHeader><div className="grid gap-4 py-2"><div className="grid gap-2"><Label>Delnamn *</Label><Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="Växellåda Volvo V70" /></div><div className="grid grid-cols-2 gap-4"><div className="grid gap-2"><Label>Inköpspris (kr) *</Label><Input type="number" min={0} value={form.purchase_price} onChange={(e) => setForm((f) => ({ ...f, purchase_price: e.target.value }))} /></div><div className="grid gap-2"><Label>Säljpris (kr) *</Label><Input type="number" min={0} value={form.sell_price} onChange={(e) => setForm((f) => ({ ...f, sell_price: e.target.value }))} /></div></div><div className="grid grid-cols-2 gap-4"><div className="grid gap-2"><Label>Datum *</Label><Input type="date" value={form.date} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} /></div><div className="grid gap-2"><Label>Kund</Label><Input value={form.customer} onChange={(e) => setForm((f) => ({ ...f, customer: e.target.value }))} /></div></div></div><DialogFooter><Button variant="outline" onClick={() => setDialogOpen(false)}>Avbryt</Button><Button onClick={handleSave} disabled={!form.name.trim() || !form.sell_price}>{editing ? 'Uppdatera' : 'Skapa'}</Button></DialogFooter></DialogContent></Dialog>
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}><DialogContent className="max-w-sm"><DialogHeader><DialogTitle>Ta bort VMB-post</DialogTitle><DialogDescription>Är du säker på att du vill ta bort <span className="font-semibold">{toDelete?.name}</span>?</DialogDescription></DialogHeader><DialogFooter><Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>Avbryt</Button><Button variant="destructive" onClick={handleDel}><Trash2 className="mr-2 h-4 w-4" />Ta bort</Button></DialogFooter></DialogContent></Dialog>
    </>
  )
}
