'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { ModuleWorkspaceShell } from '@/components/modules/ModuleWorkspaceShell'
import { KPICard } from '@/components/modules/shared/KPICard'
import { EmptyModuleState } from '@/components/modules/shared/EmptyModuleState'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Plus, Pencil, Trash2, Loader2, Ticket } from 'lucide-react'
import { Badge } from '@/components/ui/badge'

interface ModuleWorkspaceProps { module: { slug: string; name: string; cat: string; desc: string; longDesc: string }; sectorSlug: string; settingsHref: string }
type TicketStatus = 'Tillgänglig' | 'Försäljning' | 'Slutsålt' | 'Stängd'
interface TicketBatch { id: string; event: string; ticketType: string; price: number; quantity: number; sold: number; status: TicketStatus; saleStart: string; saleEnd: string }
function fmt(n: number): string { return new Intl.NumberFormat('sv-SE', { maximumFractionDigits: 0 }).format(n) }
const STATUSES: TicketStatus[] = ['Tillgänglig', 'Försäljning', 'Slutsålt', 'Stängd']
const STATUS_COLORS: Record<TicketStatus, string> = { 'Tillgänglig': 'bg-blue-100 text-blue-800', 'Försäljning': 'bg-emerald-100 text-emerald-800', 'Slutsålt': 'bg-amber-100 text-amber-800', 'Stängd': 'bg-gray-100 text-gray-800' }
const EMPTY_FORM = { event: '', ticketType: '', price: 0, quantity: 0, sold: 0, status: 'Tillgänglig' as TicketStatus, saleStart: '', saleEnd: '' }

export function BiljettforsaljningWorkspace({ module: mod, sectorSlug, settingsHref }: ModuleWorkspaceProps) {
  const supabase = createClient()
  const [loading, setLoading] = useState(true); const [saving, setSaving] = useState(false); const [batches, setBatches] = useState<TicketBatch[]>([]); const [dialogOpen, setDialogOpen] = useState(false); const [editing, setEditing] = useState<TicketBatch | null>(null); const [form, setForm] = useState(EMPTY_FORM); const [deleteDialogOpen, setDeleteDialogOpen] = useState(false); const [toDelete, setToDelete] = useState<TicketBatch | null>(null)

  const saveItems = useCallback(async (items: TicketBatch[]) => { setSaving(true); const { data: { user } } = await supabase.auth.getUser(); if (!user) { setSaving(false); return }; await supabase.from('module_configs').upsert({ user_id: user.id, sector_slug: sectorSlug, module_slug: mod.slug, config_key: 'ticket_batches', config_value: items }, { onConflict: 'user_id,sector_slug,module_slug,config_key' }); setSaving(false) }, [supabase, sectorSlug, mod.slug])
  const fetchData = useCallback(async () => { setLoading(true); const { data: { user } } = await supabase.auth.getUser(); if (!user) { setLoading(false); return }; const { data } = await supabase.from('module_configs').select('config_value').eq('user_id', user.id).eq('sector_slug', sectorSlug).eq('module_slug', mod.slug).eq('config_key', 'ticket_batches').maybeSingle(); if (data?.config_value && Array.isArray(data.config_value)) setBatches(data.config_value as TicketBatch[]); setLoading(false) }, [supabase, sectorSlug, mod.slug])
  useEffect(() => { fetchData() }, [fetchData])

  const totalSold = batches.reduce((s, b) => s + b.sold, 0)
  const totalCapacity = batches.reduce((s, b) => s + b.quantity, 0)
  const totalRevenue = batches.reduce((s, b) => s + b.sold * b.price, 0)
  const sellThrough = totalCapacity > 0 ? (totalSold / totalCapacity) * 100 : 0

  function openNew() { setEditing(null); setForm({ ...EMPTY_FORM }); setDialogOpen(true) }
  function openEdit(b: TicketBatch) { setEditing(b); setForm({ event: b.event, ticketType: b.ticketType, price: b.price, quantity: b.quantity, sold: b.sold, status: b.status, saleStart: b.saleStart, saleEnd: b.saleEnd }); setDialogOpen(true) }
  async function handleSave() { const item: TicketBatch = { id: editing?.id ?? crypto.randomUUID(), ...form, event: form.event.trim(), ticketType: form.ticketType.trim() }; const updated = editing ? batches.map(b => b.id === editing.id ? item : b) : [...batches, item]; setBatches(updated); setDialogOpen(false); await saveItems(updated) }
  async function handleDelete() { if (!toDelete) return; const updated = batches.filter(b => b.id !== toDelete.id); setBatches(updated); setDeleteDialogOpen(false); setToDelete(null); await saveItems(updated) }

  return (
    <>
      <ModuleWorkspaceShell title={mod.name} description={mod.desc} category="operativ" sectorName="Event" backHref={`/m/${sectorSlug}`} settingsHref={settingsHref} actions={<Button onClick={openNew}><Plus className="mr-2 h-4 w-4" />Ny biljettyp</Button>}>
        <Tabs defaultValue="oversikt" className="space-y-6">
          <TabsList><TabsTrigger value="oversikt">Översikt</TabsTrigger><TabsTrigger value="biljetter">Biljetter</TabsTrigger></TabsList>
          <TabsContent value="oversikt" className="space-y-6">
            {loading ? <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div> : batches.length === 0 ? <EmptyModuleState icon={Ticket} title="Inga biljetttyper" description="Hantera biljettförsäljning med typer, priser, kapacitet och försäljningsstatus." actionLabel="Ny biljettyp" onAction={openNew} /> : (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"><KPICard label="Sålda biljetter" value={fmt(totalSold)} unit="st" /><KPICard label="Total kapacitet" value={fmt(totalCapacity)} unit="st" /><KPICard label="Intäkter" value={fmt(totalRevenue)} unit="kr" /><KPICard label="Fyllnadsgrad" value={sellThrough.toFixed(1)} unit="%" /></div>
            )}
          </TabsContent>
          <TabsContent value="biljetter" className="space-y-4">
            {batches.length > 0 && <div className="rounded-xl border border-border overflow-hidden"><table className="w-full text-sm"><thead><tr className="bg-muted/50 border-b"><th className="text-left px-4 py-3 font-medium text-muted-foreground">Event</th><th className="text-left px-4 py-3 font-medium text-muted-foreground">Biljettyp</th><th className="text-right px-4 py-3 font-medium text-muted-foreground">Pris</th><th className="text-right px-4 py-3 font-medium text-muted-foreground">Sålda/Tot</th><th className="text-right px-4 py-3 font-medium text-muted-foreground">Intäkt</th><th className="text-left px-4 py-3 font-medium text-muted-foreground">Status</th><th className="text-left px-4 py-3 font-medium text-muted-foreground">Försäljningsperiod</th><th className="text-right px-4 py-3 font-medium text-muted-foreground">Åtgärder</th></tr></thead><tbody>{batches.map(b => <tr key={b.id} className="border-b last:border-0"><td className="px-4 py-3 font-medium">{b.event}</td><td className="px-4 py-3">{b.ticketType}</td><td className="px-4 py-3 text-right tabular-nums">{fmt(b.price)}</td><td className="px-4 py-3 text-right tabular-nums">{fmt(b.sold)}/{fmt(b.quantity)}</td><td className="px-4 py-3 text-right tabular-nums font-medium">{fmt(b.sold * b.price)}</td><td className="px-4 py-3"><Badge variant="secondary" className={STATUS_COLORS[b.status]}>{b.status}</Badge></td><td className="px-4 py-3 text-xs">{b.saleStart}{b.saleEnd && ` - ${b.saleEnd}`}</td><td className="px-4 py-3 text-right"><div className="flex items-center justify-end gap-1"><Button variant="ghost" size="icon" onClick={() => openEdit(b)}><Pencil className="h-4 w-4" /></Button><Button variant="ghost" size="icon" className="text-red-600" onClick={() => { setToDelete(b); setDeleteDialogOpen(true) }}><Trash2 className="h-4 w-4" /></Button></div></td></tr>)}</tbody></table></div>}
            {saving && <div className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" />Sparar...</div>}
          </TabsContent>
        </Tabs>
      </ModuleWorkspaceShell>
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}><DialogContent className="max-w-md"><DialogHeader><DialogTitle>{editing ? 'Redigera' : 'Ny biljettyp'}</DialogTitle><DialogDescription>Ange biljettuppgifter.</DialogDescription></DialogHeader><div className="grid gap-4 py-2"><div className="grid grid-cols-2 gap-4"><div className="grid gap-2"><Label>Event *</Label><Input value={form.event} onChange={e => setForm(f => ({ ...f, event: e.target.value }))} /></div><div className="grid gap-2"><Label>Biljettyp *</Label><Input value={form.ticketType} onChange={e => setForm(f => ({ ...f, ticketType: e.target.value }))} placeholder="t.ex. Early Bird" /></div></div><div className="grid grid-cols-3 gap-4"><div className="grid gap-2"><Label>Pris (kr)</Label><Input type="number" min={0} value={form.price} onChange={e => setForm(f => ({ ...f, price: parseFloat(e.target.value) || 0 }))} /></div><div className="grid gap-2"><Label>Antal</Label><Input type="number" min={0} value={form.quantity} onChange={e => setForm(f => ({ ...f, quantity: parseInt(e.target.value) || 0 }))} /></div><div className="grid gap-2"><Label>Sålda</Label><Input type="number" min={0} value={form.sold} onChange={e => setForm(f => ({ ...f, sold: parseInt(e.target.value) || 0 }))} /></div></div><div className="grid grid-cols-3 gap-4"><div className="grid gap-2"><Label>Status</Label><Select value={form.status} onValueChange={val => setForm(f => ({ ...f, status: val as TicketStatus }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent></Select></div><div className="grid gap-2"><Label>Försäljning från</Label><Input type="date" value={form.saleStart} onChange={e => setForm(f => ({ ...f, saleStart: e.target.value }))} /></div><div className="grid gap-2"><Label>Försäljning till</Label><Input type="date" value={form.saleEnd} onChange={e => setForm(f => ({ ...f, saleEnd: e.target.value }))} /></div></div></div><DialogFooter><Button variant="outline" onClick={() => setDialogOpen(false)}>Avbryt</Button><Button onClick={handleSave} disabled={!form.event.trim() || !form.ticketType.trim()}>{editing ? 'Uppdatera' : 'Skapa'}</Button></DialogFooter></DialogContent></Dialog>
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}><DialogContent className="max-w-sm"><DialogHeader><DialogTitle>Ta bort</DialogTitle><DialogDescription>Är du säker?</DialogDescription></DialogHeader><DialogFooter><Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>Avbryt</Button><Button variant="destructive" onClick={handleDelete}><Trash2 className="mr-2 h-4 w-4" />Ta bort</Button></DialogFooter></DialogContent></Dialog>
    </>
  )
}
