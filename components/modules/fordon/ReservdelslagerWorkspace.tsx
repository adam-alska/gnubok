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
import { Plus, Pencil, Trash2, Loader2, Search, Package } from 'lucide-react'

interface ModuleWorkspaceProps { module: { slug: string; name: string; cat: string; desc: string; longDesc: string }; sectorSlug: string; settingsHref: string }

interface Part { id: string; article_number: string; name: string; category: string; quantity: number; purchase_price: number; sell_price: number; location: string }

function generateId(): string { return Date.now().toString(36) + Math.random().toString(36).substring(2, 7) }
function fmt(n: number): string { return new Intl.NumberFormat('sv-SE', { maximumFractionDigits: 0 }).format(n) }

const DEFAULT_ITEMS: Part[] = [
  { id: '1', article_number: 'BP-001', name: 'Bromsbelägg fram', category: 'Bromsar', quantity: 12, purchase_price: 450, sell_price: 890, location: 'A1-03' },
  { id: '2', article_number: 'OF-010', name: 'Oljefilter standard', category: 'Filter', quantity: 25, purchase_price: 85, sell_price: 195, location: 'B2-01' },
  { id: '3', article_number: 'KR-005', name: 'Kamrem kit', category: 'Motor', quantity: 4, purchase_price: 1200, sell_price: 2400, location: 'C1-08' },
]

const EMPTY_FORM = { article_number: '', name: '', category: '', quantity: '', purchase_price: '', sell_price: '', location: '' }

export function ReservdelslagerWorkspace({ module: mod, sectorSlug, settingsHref }: ModuleWorkspaceProps) {
  const supabase = createClient()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [items, setItems] = useState<Part[]>([])
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<Part | null>(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [toDelete, setToDelete] = useState<Part | null>(null)
  const [searchQuery, setSearchQuery] = useState('')

  const save = useCallback(async (d: Part[]) => { setSaving(true); const { data: { user } } = await supabase.auth.getUser(); if (!user) { setSaving(false); return }; await supabase.from('module_configs').upsert({ user_id: user.id, sector_slug: sectorSlug, module_slug: mod.slug, config_key: 'parts', config_value: d }, { onConflict: 'user_id,sector_slug,module_slug,config_key' }); setSaving(false) }, [supabase, sectorSlug, mod.slug])
  const fetch_ = useCallback(async () => { setLoading(true); const { data: { user } } = await supabase.auth.getUser(); if (!user) { setLoading(false); return }; const { data } = await supabase.from('module_configs').select('config_value').eq('user_id', user.id).eq('sector_slug', sectorSlug).eq('module_slug', mod.slug).eq('config_key', 'parts').maybeSingle(); if (data?.config_value && Array.isArray(data.config_value) && data.config_value.length > 0) { setItems(data.config_value as Part[]) } else { setItems(DEFAULT_ITEMS); await supabase.from('module_configs').upsert({ user_id: user.id, sector_slug: sectorSlug, module_slug: mod.slug, config_key: 'parts', config_value: DEFAULT_ITEMS }, { onConflict: 'user_id,sector_slug,module_slug,config_key' }) }; setLoading(false) }, [supabase, sectorSlug, mod.slug])
  useEffect(() => { fetch_() }, [fetch_])

  const filtered = useMemo(() => { let r = items; if (searchQuery.trim()) { const q = searchQuery.toLowerCase(); r = r.filter((i) => i.article_number.toLowerCase().includes(q) || i.name.toLowerCase().includes(q) || i.category.toLowerCase().includes(q)) }; return r.sort((a, b) => a.article_number.localeCompare(b.article_number)) }, [items, searchQuery])

  const stats = useMemo(() => {
    const totalValue = items.reduce((s, i) => s + i.quantity * i.purchase_price, 0)
    const totalItems = items.reduce((s, i) => s + i.quantity, 0)
    const uniqueParts = items.length
    const lowStock = items.filter((i) => i.quantity <= 3).length
    return { totalValue, totalItems, uniqueParts, lowStock }
  }, [items])

  function openNew() { setEditing(null); setForm({ ...EMPTY_FORM }); setDialogOpen(true) }
  function openEdit(i: Part) { setEditing(i); setForm({ article_number: i.article_number, name: i.name, category: i.category, quantity: String(i.quantity), purchase_price: String(i.purchase_price), sell_price: String(i.sell_price), location: i.location }); setDialogOpen(true) }
  async function handleSave() { const entry: Part = { id: editing?.id ?? generateId(), article_number: form.article_number.trim(), name: form.name.trim(), category: form.category.trim(), quantity: parseInt(form.quantity) || 0, purchase_price: parseFloat(form.purchase_price) || 0, sell_price: parseFloat(form.sell_price) || 0, location: form.location.trim() }; const u = editing ? items.map((i) => i.id === editing.id ? entry : i) : [...items, entry]; setItems(u); setDialogOpen(false); await save(u) }
  function openDel(i: Part) { setToDelete(i); setDeleteDialogOpen(true) }
  async function handleDel() { if (!toDelete) return; const u = items.filter((i) => i.id !== toDelete.id); setItems(u); setDeleteDialogOpen(false); setToDelete(null); await save(u) }

  return (
    <>
      <ModuleWorkspaceShell title={mod.name} description={mod.desc} category="bokforing" sectorName="Fordon & Verkstad" backHref={`/m/${sectorSlug}`} settingsHref={settingsHref} actions={<Button onClick={openNew}><Plus className="mr-2 h-4 w-4" />Ny reservdel</Button>}>
        {loading ? <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div> : (
          <div className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Card><CardHeader className="pb-2"><CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Lagervärde (1460)</CardTitle></CardHeader><CardContent><span className="text-2xl font-semibold tracking-tight">{fmt(stats.totalValue)}</span><span className="text-sm text-muted-foreground ml-1">kr</span></CardContent></Card>
              <Card><CardHeader className="pb-2"><CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Totalt i lager</CardTitle></CardHeader><CardContent><span className="text-2xl font-semibold tracking-tight">{fmt(stats.totalItems)}</span><span className="text-sm text-muted-foreground ml-1">st</span></CardContent></Card>
              <Card><CardHeader className="pb-2"><CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Unika artiklar</CardTitle></CardHeader><CardContent><span className="text-2xl font-semibold tracking-tight">{stats.uniqueParts}</span></CardContent></Card>
              <Card><CardHeader className="pb-2"><CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Lågt lager</CardTitle></CardHeader><CardContent><span className="text-2xl font-semibold tracking-tight text-amber-600">{stats.lowStock}</span></CardContent></Card>
            </div>
            <div className="flex items-center gap-3"><div className="relative flex-1 max-w-sm"><Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" /><Input placeholder="Sök artikelnr, namn, kategori..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-9" /></div>{saving && <div className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" />Sparar...</div>}</div>
            {filtered.length === 0 ? <EmptyModuleState icon={Package} title="Inga reservdelar" description="Lägg till reservdelar i lagret." actionLabel="Ny reservdel" onAction={openNew} /> : (
              <div className="rounded-xl border border-border overflow-hidden"><Table><TableHeader><TableRow className="bg-muted/50"><TableHead className="font-medium">Art.nr</TableHead><TableHead className="font-medium">Namn</TableHead><TableHead className="font-medium">Kategori</TableHead><TableHead className="font-medium text-right">Antal</TableHead><TableHead className="font-medium text-right">Inköpspris</TableHead><TableHead className="font-medium text-right">Säljpris</TableHead><TableHead className="font-medium">Plats</TableHead><TableHead className="font-medium text-right">Åtgärder</TableHead></TableRow></TableHeader><TableBody>{filtered.map((i) => (
                <TableRow key={i.id}><TableCell className="font-mono font-medium">{i.article_number}</TableCell><TableCell>{i.name}</TableCell><TableCell><Badge variant="outline">{i.category}</Badge></TableCell><TableCell className="text-right tabular-nums">{i.quantity <= 3 ? <span className="text-amber-600 font-semibold">{i.quantity}</span> : i.quantity}</TableCell><TableCell className="text-right tabular-nums">{fmt(i.purchase_price)}</TableCell><TableCell className="text-right tabular-nums">{fmt(i.sell_price)}</TableCell><TableCell className="font-mono text-sm">{i.location}</TableCell><TableCell className="text-right"><div className="flex items-center justify-end gap-1"><Button variant="ghost" size="icon" onClick={() => openEdit(i)}><Pencil className="h-4 w-4" /></Button><Button variant="ghost" size="icon" className="text-red-600 hover:text-red-700" onClick={() => openDel(i)}><Trash2 className="h-4 w-4" /></Button></div></TableCell></TableRow>
              ))}</TableBody></Table></div>
            )}
          </div>
        )}
      </ModuleWorkspaceShell>
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}><DialogContent className="max-w-lg"><DialogHeader><DialogTitle>{editing ? 'Redigera reservdel' : 'Ny reservdel'}</DialogTitle><DialogDescription>{editing ? 'Uppdatera reservdelens uppgifter.' : 'Lägg till en ny reservdel i lagret.'}</DialogDescription></DialogHeader><div className="grid gap-4 py-2"><div className="grid grid-cols-2 gap-4"><div className="grid gap-2"><Label>Artikelnummer *</Label><Input value={form.article_number} onChange={(e) => setForm((f) => ({ ...f, article_number: e.target.value }))} placeholder="BP-001" /></div><div className="grid gap-2"><Label>Namn *</Label><Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} /></div></div><div className="grid grid-cols-3 gap-4"><div className="grid gap-2"><Label>Kategori</Label><Input value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))} placeholder="Bromsar" /></div><div className="grid gap-2"><Label>Antal *</Label><Input type="number" min={0} value={form.quantity} onChange={(e) => setForm((f) => ({ ...f, quantity: e.target.value }))} /></div><div className="grid gap-2"><Label>Lagerplats</Label><Input value={form.location} onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))} placeholder="A1-03" /></div></div><div className="grid grid-cols-2 gap-4"><div className="grid gap-2"><Label>Inköpspris (kr)</Label><Input type="number" min={0} value={form.purchase_price} onChange={(e) => setForm((f) => ({ ...f, purchase_price: e.target.value }))} /></div><div className="grid gap-2"><Label>Säljpris (kr)</Label><Input type="number" min={0} value={form.sell_price} onChange={(e) => setForm((f) => ({ ...f, sell_price: e.target.value }))} /></div></div></div><DialogFooter><Button variant="outline" onClick={() => setDialogOpen(false)}>Avbryt</Button><Button onClick={handleSave} disabled={!form.article_number.trim() || !form.name.trim()}>{editing ? 'Uppdatera' : 'Skapa'}</Button></DialogFooter></DialogContent></Dialog>
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}><DialogContent className="max-w-sm"><DialogHeader><DialogTitle>Ta bort reservdel</DialogTitle><DialogDescription>Är du säker på att du vill ta bort <span className="font-semibold">{toDelete?.name}</span> ({toDelete?.article_number})?</DialogDescription></DialogHeader><DialogFooter><Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>Avbryt</Button><Button variant="destructive" onClick={handleDel}><Trash2 className="mr-2 h-4 w-4" />Ta bort</Button></DialogFooter></DialogContent></Dialog>
    </>
  )
}
