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
import { Plus, Pencil, Trash2, Loader2, Search, Wrench } from 'lucide-react'

interface ModuleWorkspaceProps { module: { slug: string; name: string; cat: string; desc: string; longDesc: string }; sectorSlug: string; settingsHref: string }
type OrderStatus = 'mottagen' | 'pagaende' | 'klar' | 'fakturerad'
interface Item { id: string; order_number: string; reg_number: string; customer_name: string; description: string; mechanic: string; status: OrderStatus; date: string }
const STATUS_LABELS: Record<OrderStatus, string> = { mottagen: 'Mottagen', pagaende: 'Pågående', klar: 'Klar', fakturerad: 'Fakturerad' }
const STATUS_VARIANT: Record<OrderStatus, 'info' | 'warning' | 'success' | 'neutral'> = { mottagen: 'info', pagaende: 'warning', klar: 'success', fakturerad: 'neutral' }
function generateId(): string { return Date.now().toString(36) + Math.random().toString(36).substring(2, 7) }

const DEFAULT_ITEMS: Item[] = [
  { id: '1', order_number: 'AO-001', reg_number: 'ABC 123', customer_name: 'Anders J', description: 'Service 30000 km', mechanic: 'Erik M', status: 'pagaende', date: '2025-03-20' },
  { id: '2', order_number: 'AO-002', reg_number: 'DEF 456', customer_name: 'Maria K', description: 'Bromsbyte', mechanic: 'Sven L', status: 'mottagen', date: '2025-03-21' },
]
const EMPTY_FORM = { order_number: '', reg_number: '', customer_name: '', description: '', mechanic: '', status: 'mottagen' as OrderStatus, date: '' }

export function ArbetsorderWorkspace({ module: mod, sectorSlug, settingsHref }: ModuleWorkspaceProps) {
  const supabase = createClient()
  const [loading, setLoading] = useState(true); const [saving, setSaving] = useState(false); const [items, setItems] = useState<Item[]>([]); const [dialogOpen, setDialogOpen] = useState(false); const [editing, setEditing] = useState<Item | null>(null); const [form, setForm] = useState(EMPTY_FORM); const [deleteDialogOpen, setDeleteDialogOpen] = useState(false); const [toDelete, setToDelete] = useState<Item | null>(null); const [searchQuery, setSearchQuery] = useState('')
  const save = useCallback(async (d: Item[]) => { setSaving(true); const { data: { user } } = await supabase.auth.getUser(); if (!user) { setSaving(false); return }; await supabase.from('module_configs').upsert({ user_id: user.id, sector_slug: sectorSlug, module_slug: mod.slug, config_key: 'work_orders', config_value: d }, { onConflict: 'user_id,sector_slug,module_slug,config_key' }); setSaving(false) }, [supabase, sectorSlug, mod.slug])
  const fetch_ = useCallback(async () => { setLoading(true); const { data: { user } } = await supabase.auth.getUser(); if (!user) { setLoading(false); return }; const { data } = await supabase.from('module_configs').select('config_value').eq('user_id', user.id).eq('sector_slug', sectorSlug).eq('module_slug', mod.slug).eq('config_key', 'work_orders').maybeSingle(); if (data?.config_value && Array.isArray(data.config_value) && data.config_value.length > 0) { setItems(data.config_value as Item[]) } else { setItems(DEFAULT_ITEMS); await supabase.from('module_configs').upsert({ user_id: user.id, sector_slug: sectorSlug, module_slug: mod.slug, config_key: 'work_orders', config_value: DEFAULT_ITEMS }, { onConflict: 'user_id,sector_slug,module_slug,config_key' }) }; setLoading(false) }, [supabase, sectorSlug, mod.slug])
  useEffect(() => { fetch_() }, [fetch_])
  const filtered = useMemo(() => { let r = items; if (searchQuery.trim()) { const q = searchQuery.toLowerCase(); r = r.filter((i) => i.order_number.toLowerCase().includes(q) || i.customer_name.toLowerCase().includes(q) || i.reg_number.toLowerCase().includes(q)) }; return r.sort((a, b) => b.date.localeCompare(a.date)) }, [items, searchQuery])
  const stats = useMemo(() => ({ total: items.length, active: items.filter(i => i.status === 'pagaende').length, pending: items.filter(i => i.status === 'mottagen').length, done: items.filter(i => i.status === 'klar' || i.status === 'fakturerad').length }), [items])
  function openNew() { setEditing(null); setForm({ ...EMPTY_FORM }); setDialogOpen(true) }
  function openEdit(i: Item) { setEditing(i); setForm({ order_number: i.order_number, reg_number: i.reg_number, customer_name: i.customer_name, description: i.description, mechanic: i.mechanic, status: i.status, date: i.date }); setDialogOpen(true) }
  async function handleSave() { const entry: Item = { id: editing?.id ?? generateId(), order_number: form.order_number.trim(), reg_number: form.reg_number.trim(), customer_name: form.customer_name.trim(), description: form.description.trim(), mechanic: form.mechanic.trim(), status: form.status, date: form.date }; const u = editing ? items.map((i) => i.id === editing.id ? entry : i) : [...items, entry]; setItems(u); setDialogOpen(false); await save(u) }
  function openDel(i: Item) { setToDelete(i); setDeleteDialogOpen(true) }
  async function handleDel() { if (!toDelete) return; const u = items.filter((i) => i.id !== toDelete.id); setItems(u); setDeleteDialogOpen(false); setToDelete(null); await save(u) }

  return (
    <>
      <ModuleWorkspaceShell title={mod.name} description={mod.desc} category="operativ" sectorName="Fordon & Verkstad" backHref={`/m/${sectorSlug}`} settingsHref={settingsHref} actions={<Button onClick={openNew}><Plus className="mr-2 h-4 w-4" />Ny arbetsorder</Button>}>
        {loading ? <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div> : (
          <div className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-4">
              <Card><CardHeader className="pb-2"><CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Totalt</CardTitle></CardHeader><CardContent><span className="text-2xl font-semibold tracking-tight">{stats.total}</span></CardContent></Card>
              <Card><CardHeader className="pb-2"><CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Väntande</CardTitle></CardHeader><CardContent><span className="text-2xl font-semibold tracking-tight">{stats.pending}</span></CardContent></Card>
              <Card><CardHeader className="pb-2"><CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Pågående</CardTitle></CardHeader><CardContent><span className="text-2xl font-semibold tracking-tight">{stats.active}</span></CardContent></Card>
              <Card><CardHeader className="pb-2"><CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Klara</CardTitle></CardHeader><CardContent><span className="text-2xl font-semibold tracking-tight">{stats.done}</span></CardContent></Card>
            </div>
            <div className="flex items-center gap-3"><div className="relative flex-1 max-w-sm"><Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" /><Input placeholder="Sök order, kund, reg.nr..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-9" /></div>{saving && <div className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" />Sparar...</div>}</div>
            {filtered.length === 0 ? <EmptyModuleState icon={Wrench} title="Inga arbetsordrar" description="Skapa arbetsordrar för att hantera verkstadsjobb." actionLabel="Ny arbetsorder" onAction={openNew} /> : (
              <div className="rounded-xl border border-border overflow-hidden"><Table><TableHeader><TableRow className="bg-muted/50"><TableHead className="font-medium">Order</TableHead><TableHead className="font-medium">Reg.nr</TableHead><TableHead className="font-medium">Kund</TableHead><TableHead className="font-medium">Beskrivning</TableHead><TableHead className="font-medium">Mekaniker</TableHead><TableHead className="font-medium">Status</TableHead><TableHead className="font-medium text-right">Åtgärder</TableHead></TableRow></TableHeader><TableBody>{filtered.map((i) => (
                <TableRow key={i.id}><TableCell className="font-mono font-medium">{i.order_number}</TableCell><TableCell className="font-mono">{i.reg_number}</TableCell><TableCell>{i.customer_name}</TableCell><TableCell>{i.description}</TableCell><TableCell>{i.mechanic}</TableCell><TableCell><StatusBadge label={STATUS_LABELS[i.status]} variant={STATUS_VARIANT[i.status]} /></TableCell><TableCell className="text-right"><div className="flex items-center justify-end gap-1"><Button variant="ghost" size="icon" onClick={() => openEdit(i)}><Pencil className="h-4 w-4" /></Button><Button variant="ghost" size="icon" className="text-red-600 hover:text-red-700" onClick={() => openDel(i)}><Trash2 className="h-4 w-4" /></Button></div></TableCell></TableRow>
              ))}</TableBody></Table></div>
            )}
          </div>
        )}
      </ModuleWorkspaceShell>
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}><DialogContent className="max-w-lg"><DialogHeader><DialogTitle>{editing ? 'Redigera arbetsorder' : 'Ny arbetsorder'}</DialogTitle><DialogDescription>Registrera arbetsordrar för att hålla koll på verkstadsjobb.</DialogDescription></DialogHeader><div className="grid gap-4 py-2"><div className="grid grid-cols-3 gap-4"><div className="grid gap-2"><Label>Ordernr</Label><Input value={form.order_number} onChange={(e) => setForm((f) => ({ ...f, order_number: e.target.value }))} /></div><div className="grid gap-2"><Label>Reg.nr</Label><Input value={form.reg_number} onChange={(e) => setForm((f) => ({ ...f, reg_number: e.target.value }))} /></div><div className="grid gap-2"><Label>Kund *</Label><Input value={form.customer_name} onChange={(e) => setForm((f) => ({ ...f, customer_name: e.target.value }))} /></div></div><div className="grid grid-cols-2 gap-4"><div className="grid gap-2"><Label>Beskrivning</Label><Input value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} /></div><div className="grid gap-2"><Label>Mekaniker</Label><Input value={form.mechanic} onChange={(e) => setForm((f) => ({ ...f, mechanic: e.target.value }))} /></div></div><div className="grid grid-cols-2 gap-4"><div className="grid gap-2"><Label>Datum</Label><Input type="date" value={form.date} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} /></div><div className="grid gap-2"><Label>Status</Label><Select value={form.status} onValueChange={(v) => setForm((f) => ({ ...f, status: v as OrderStatus }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="mottagen">Mottagen</SelectItem><SelectItem value="pagaende">Pågående</SelectItem><SelectItem value="klar">Klar</SelectItem><SelectItem value="fakturerad">Fakturerad</SelectItem></SelectContent></Select></div></div></div><DialogFooter><Button variant="outline" onClick={() => setDialogOpen(false)}>Avbryt</Button><Button onClick={handleSave} disabled={!form.customer_name.trim()}>{editing ? 'Uppdatera' : 'Skapa'}</Button></DialogFooter></DialogContent></Dialog>
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}><DialogContent className="max-w-sm"><DialogHeader><DialogTitle>Ta bort</DialogTitle><DialogDescription>Är du säker på att du vill ta bort arbetsorder <span className="font-semibold">{toDelete?.order_number}</span>?</DialogDescription></DialogHeader><DialogFooter><Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>Avbryt</Button><Button variant="destructive" onClick={handleDel}><Trash2 className="mr-2 h-4 w-4" />Ta bort</Button></DialogFooter></DialogContent></Dialog>
    </>
  )
}
