'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { ModuleWorkspaceShell } from '@/components/modules/ModuleWorkspaceShell'
import { EmptyModuleState } from '@/components/modules/shared/EmptyModuleState'
import { StatusBadge } from '@/components/modules/shared/StatusBadge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Plus, Pencil, Trash2, Loader2, FileText, Search } from 'lucide-react'

interface ModuleWorkspaceProps { module: { slug: string; name: string; cat: string; desc: string; longDesc: string }; sectorSlug: string; settingsHref: string }

type InvoiceStatus = 'utkast' | 'skickad' | 'betald' | 'forfalld'

interface WorkOrderInvoice {
  id: string; order_number: string; customer_name: string; reg_number: string; date: string
  labor_hours: number; hourly_rate: number; parts_total: number; status: InvoiceStatus; description: string
}

const STATUS_LABELS: Record<InvoiceStatus, string> = { utkast: 'Utkast', skickad: 'Skickad', betald: 'Betald', forfalld: 'Förfallen' }
const STATUS_VARIANT: Record<InvoiceStatus, 'neutral' | 'info' | 'success' | 'danger'> = { utkast: 'neutral', skickad: 'info', betald: 'success', forfalld: 'danger' }

function generateId(): string { return Date.now().toString(36) + Math.random().toString(36).substring(2, 7) }
function fmt(n: number): string { return new Intl.NumberFormat('sv-SE', { maximumFractionDigits: 0 }).format(n) }

const DEFAULT_DATA: WorkOrderInvoice[] = [
  { id: '1', order_number: 'AO-2025-001', customer_name: 'Anders Johansson', reg_number: 'ABC 123', date: '2025-03-15', labor_hours: 3, hourly_rate: 850, parts_total: 2400, status: 'betald', description: 'Bromsbyte fram' },
  { id: '2', order_number: 'AO-2025-002', customer_name: 'Maria Karlsson', reg_number: 'DEF 456', date: '2025-03-20', labor_hours: 5, hourly_rate: 850, parts_total: 5600, status: 'skickad', description: 'Kamremsybte + vattenpump' },
]

const EMPTY_FORM = { order_number: '', customer_name: '', reg_number: '', date: '', labor_hours: '', hourly_rate: '850', parts_total: '', status: 'utkast' as InvoiceStatus, description: '' }

export function ArbetsorderTillFakturaWorkspace({ module: mod, sectorSlug, settingsHref }: ModuleWorkspaceProps) {
  const supabase = createClient()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [invoices, setInvoices] = useState<WorkOrderInvoice[]>([])
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<WorkOrderInvoice | null>(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [toDelete, setToDelete] = useState<WorkOrderInvoice | null>(null)
  const [searchQuery, setSearchQuery] = useState('')

  const save = useCallback(async (d: WorkOrderInvoice[]) => { setSaving(true); const { data: { user } } = await supabase.auth.getUser(); if (!user) { setSaving(false); return }; await supabase.from('module_configs').upsert({ user_id: user.id, sector_slug: sectorSlug, module_slug: mod.slug, config_key: 'invoices', config_value: d }, { onConflict: 'user_id,sector_slug,module_slug,config_key' }); setSaving(false) }, [supabase, sectorSlug, mod.slug])
  const fetch_ = useCallback(async () => { setLoading(true); const { data: { user } } = await supabase.auth.getUser(); if (!user) { setLoading(false); return }; const { data } = await supabase.from('module_configs').select('config_value').eq('user_id', user.id).eq('sector_slug', sectorSlug).eq('module_slug', mod.slug).eq('config_key', 'invoices').maybeSingle(); if (data?.config_value && Array.isArray(data.config_value) && data.config_value.length > 0) { setInvoices(data.config_value as WorkOrderInvoice[]) } else { setInvoices(DEFAULT_DATA); await supabase.from('module_configs').upsert({ user_id: user.id, sector_slug: sectorSlug, module_slug: mod.slug, config_key: 'invoices', config_value: DEFAULT_DATA }, { onConflict: 'user_id,sector_slug,module_slug,config_key' }) }; setLoading(false) }, [supabase, sectorSlug, mod.slug])
  useEffect(() => { fetch_() }, [fetch_])

  const filtered = useMemo(() => { let r = invoices; if (searchQuery.trim()) { const q = searchQuery.toLowerCase(); r = r.filter((i) => i.order_number.toLowerCase().includes(q) || i.customer_name.toLowerCase().includes(q) || i.reg_number.toLowerCase().includes(q)) }; return r.sort((a, b) => b.date.localeCompare(a.date)) }, [invoices, searchQuery])

  const stats = useMemo(() => { const totalRevenue = invoices.reduce((s, i) => s + i.labor_hours * i.hourly_rate + i.parts_total, 0); const laborRevenue = invoices.reduce((s, i) => s + i.labor_hours * i.hourly_rate, 0); const partsRevenue = invoices.reduce((s, i) => s + i.parts_total, 0); return { total: invoices.length, totalRevenue, laborRevenue, partsRevenue } }, [invoices])

  function openNew() { setEditing(null); setForm({ ...EMPTY_FORM }); setDialogOpen(true) }
  function openEdit(i: WorkOrderInvoice) { setEditing(i); setForm({ order_number: i.order_number, customer_name: i.customer_name, reg_number: i.reg_number, date: i.date, labor_hours: String(i.labor_hours), hourly_rate: String(i.hourly_rate), parts_total: String(i.parts_total), status: i.status, description: i.description }); setDialogOpen(true) }
  async function handleSave() { const entry: WorkOrderInvoice = { id: editing?.id ?? generateId(), order_number: form.order_number.trim(), customer_name: form.customer_name.trim(), reg_number: form.reg_number.trim(), date: form.date, labor_hours: parseFloat(form.labor_hours) || 0, hourly_rate: parseFloat(form.hourly_rate) || 0, parts_total: parseFloat(form.parts_total) || 0, status: form.status, description: form.description.trim() }; const u = editing ? invoices.map((i) => i.id === editing.id ? entry : i) : [...invoices, entry]; setInvoices(u); setDialogOpen(false); await save(u) }
  function openDel(i: WorkOrderInvoice) { setToDelete(i); setDeleteDialogOpen(true) }
  async function handleDel() { if (!toDelete) return; const u = invoices.filter((i) => i.id !== toDelete.id); setInvoices(u); setDeleteDialogOpen(false); setToDelete(null); await save(u) }

  return (
    <>
      <ModuleWorkspaceShell title={mod.name} description={mod.desc} category="bokforing" sectorName="Fordon & Verkstad" backHref={`/m/${sectorSlug}`} settingsHref={settingsHref} actions={<Button onClick={openNew}><Plus className="mr-2 h-4 w-4" />Ny faktura</Button>}>
        {loading ? <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div> : (
          <div className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Card><CardHeader className="pb-2"><CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Antal fakturor</CardTitle></CardHeader><CardContent><span className="text-2xl font-semibold tracking-tight">{stats.total}</span></CardContent></Card>
              <Card><CardHeader className="pb-2"><CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Total omsättning</CardTitle></CardHeader><CardContent><span className="text-2xl font-semibold tracking-tight">{fmt(stats.totalRevenue)}</span><span className="text-sm text-muted-foreground ml-1">kr</span></CardContent></Card>
              <Card><CardHeader className="pb-2"><CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Arbetsintäkter</CardTitle></CardHeader><CardContent><span className="text-2xl font-semibold tracking-tight">{fmt(stats.laborRevenue)}</span><span className="text-sm text-muted-foreground ml-1">kr</span></CardContent></Card>
              <Card><CardHeader className="pb-2"><CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Delar</CardTitle></CardHeader><CardContent><span className="text-2xl font-semibold tracking-tight">{fmt(stats.partsRevenue)}</span><span className="text-sm text-muted-foreground ml-1">kr</span></CardContent></Card>
            </div>
            <div className="flex items-center gap-3"><div className="relative flex-1 max-w-sm"><Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" /><Input placeholder="Sök order, kund, reg.nr..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-9" /></div>{saving && <div className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" />Sparar...</div>}</div>
            {filtered.length === 0 ? <EmptyModuleState icon={FileText} title="Inga fakturor" description="Skapa en faktura från en arbetsorder." actionLabel="Ny faktura" onAction={openNew} /> : (
              <div className="rounded-xl border border-border overflow-hidden"><Table><TableHeader><TableRow className="bg-muted/50"><TableHead className="font-medium">Order</TableHead><TableHead className="font-medium">Kund</TableHead><TableHead className="font-medium">Reg.nr</TableHead><TableHead className="font-medium">Datum</TableHead><TableHead className="font-medium text-right">Arbete</TableHead><TableHead className="font-medium text-right">Delar</TableHead><TableHead className="font-medium text-right">Totalt</TableHead><TableHead className="font-medium">Status</TableHead><TableHead className="font-medium text-right">Åtgärder</TableHead></TableRow></TableHeader><TableBody>{filtered.map((i) => { const total = i.labor_hours * i.hourly_rate + i.parts_total; return (<TableRow key={i.id}><TableCell className="font-mono font-medium">{i.order_number}</TableCell><TableCell>{i.customer_name}</TableCell><TableCell className="font-mono">{i.reg_number}</TableCell><TableCell>{i.date}</TableCell><TableCell className="text-right tabular-nums">{fmt(i.labor_hours * i.hourly_rate)}</TableCell><TableCell className="text-right tabular-nums">{fmt(i.parts_total)}</TableCell><TableCell className="text-right tabular-nums font-semibold">{fmt(total)}</TableCell><TableCell><StatusBadge label={STATUS_LABELS[i.status]} variant={STATUS_VARIANT[i.status]} /></TableCell><TableCell className="text-right"><div className="flex items-center justify-end gap-1"><Button variant="ghost" size="icon" onClick={() => openEdit(i)}><Pencil className="h-4 w-4" /></Button><Button variant="ghost" size="icon" className="text-red-600 hover:text-red-700" onClick={() => openDel(i)}><Trash2 className="h-4 w-4" /></Button></div></TableCell></TableRow>) })}</TableBody></Table></div>
            )}
          </div>
        )}
      </ModuleWorkspaceShell>
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}><DialogContent className="max-w-lg"><DialogHeader><DialogTitle>{editing ? 'Redigera faktura' : 'Ny faktura'}</DialogTitle><DialogDescription>{editing ? 'Uppdatera fakturan.' : 'Skapa faktura från arbetsorder.'}</DialogDescription></DialogHeader><div className="grid gap-4 py-2"><div className="grid grid-cols-3 gap-4"><div className="grid gap-2"><Label>Ordernr *</Label><Input value={form.order_number} onChange={(e) => setForm((f) => ({ ...f, order_number: e.target.value }))} placeholder="AO-2025-001" /></div><div className="grid gap-2"><Label>Kund *</Label><Input value={form.customer_name} onChange={(e) => setForm((f) => ({ ...f, customer_name: e.target.value }))} /></div><div className="grid gap-2"><Label>Reg.nr</Label><Input value={form.reg_number} onChange={(e) => setForm((f) => ({ ...f, reg_number: e.target.value }))} placeholder="ABC 123" /></div></div><div className="grid grid-cols-4 gap-4"><div className="grid gap-2"><Label>Datum *</Label><Input type="date" value={form.date} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} /></div><div className="grid gap-2"><Label>Tim (h)</Label><Input type="number" min={0} step={0.5} value={form.labor_hours} onChange={(e) => setForm((f) => ({ ...f, labor_hours: e.target.value }))} /></div><div className="grid gap-2"><Label>Timpris (kr)</Label><Input type="number" min={0} value={form.hourly_rate} onChange={(e) => setForm((f) => ({ ...f, hourly_rate: e.target.value }))} /></div><div className="grid gap-2"><Label>Delar (kr)</Label><Input type="number" min={0} value={form.parts_total} onChange={(e) => setForm((f) => ({ ...f, parts_total: e.target.value }))} /></div></div><div className="grid grid-cols-2 gap-4"><div className="grid gap-2"><Label>Status</Label><Select value={form.status} onValueChange={(v) => setForm((f) => ({ ...f, status: v as InvoiceStatus }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="utkast">Utkast</SelectItem><SelectItem value="skickad">Skickad</SelectItem><SelectItem value="betald">Betald</SelectItem><SelectItem value="forfalld">Förfallen</SelectItem></SelectContent></Select></div><div className="grid gap-2"><Label>Beskrivning</Label><Input value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} /></div></div></div><DialogFooter><Button variant="outline" onClick={() => setDialogOpen(false)}>Avbryt</Button><Button onClick={handleSave} disabled={!form.order_number.trim() || !form.customer_name.trim()}>{editing ? 'Uppdatera' : 'Skapa'}</Button></DialogFooter></DialogContent></Dialog>
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}><DialogContent className="max-w-sm"><DialogHeader><DialogTitle>Ta bort faktura</DialogTitle><DialogDescription>Är du säker på att du vill ta bort <span className="font-semibold">{toDelete?.order_number}</span>?</DialogDescription></DialogHeader><DialogFooter><Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>Avbryt</Button><Button variant="destructive" onClick={handleDel}><Trash2 className="mr-2 h-4 w-4" />Ta bort</Button></DialogFooter></DialogContent></Dialog>
    </>
  )
}
