'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { ModuleWorkspaceShell } from '@/components/modules/ModuleWorkspaceShell'
import { KPICard } from '@/components/modules/shared/KPICard'
import { StatusBadge } from '@/components/modules/shared/StatusBadge'
import { EmptyModuleState } from '@/components/modules/shared/EmptyModuleState'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Plus, Pencil, Trash2, Loader2, FileText } from 'lucide-react'

interface ModuleWorkspaceProps { module: { slug: string; name: string; cat: string; desc: string; longDesc: string }; sectorSlug: string; settingsHref: string }
type InvoiceStatus = 'Utkast' | 'Skickad' | 'Betald' | 'Förfallen' | 'Krediterad'
interface RentInvoice { id: string; invoiceNumber: string; tenant: string; property: string; period: string; amount: number; dueDate: string; status: InvoiceStatus; paidDate: string }
function fmt(n: number): string { return new Intl.NumberFormat('sv-SE', { maximumFractionDigits: 0 }).format(n) }
const STATUSES: InvoiceStatus[] = ['Utkast', 'Skickad', 'Betald', 'Förfallen', 'Krediterad']
const STATUS_MAP: Record<InvoiceStatus, 'neutral' | 'info' | 'success' | 'danger' | 'warning'> = { 'Utkast': 'neutral', 'Skickad': 'info', 'Betald': 'success', 'Förfallen': 'danger', 'Krediterad': 'warning' }
const EMPTY_FORM = { invoiceNumber: '', tenant: '', property: '', period: '', amount: 0, dueDate: '', status: 'Utkast' as InvoiceStatus, paidDate: '' }

export function HyresavierWorkspace({ module: mod, sectorSlug, settingsHref }: ModuleWorkspaceProps) {
  const supabase = createClient()
  const [loading, setLoading] = useState(true); const [saving, setSaving] = useState(false); const [invoices, setInvoices] = useState<RentInvoice[]>([]); const [dialogOpen, setDialogOpen] = useState(false); const [editing, setEditing] = useState<RentInvoice | null>(null); const [form, setForm] = useState(EMPTY_FORM); const [deleteDialogOpen, setDeleteDialogOpen] = useState(false); const [toDelete, setToDelete] = useState<RentInvoice | null>(null); const [filterStatus, setFilterStatus] = useState<InvoiceStatus | 'all'>('all')

  const saveItems = useCallback(async (items: RentInvoice[]) => { setSaving(true); const { data: { user } } = await supabase.auth.getUser(); if (!user) { setSaving(false); return }; await supabase.from('module_configs').upsert({ user_id: user.id, sector_slug: sectorSlug, module_slug: mod.slug, config_key: 'rent_invoices', config_value: items }, { onConflict: 'user_id,sector_slug,module_slug,config_key' }); setSaving(false) }, [supabase, sectorSlug, mod.slug])
  const fetchData = useCallback(async () => { setLoading(true); const { data: { user } } = await supabase.auth.getUser(); if (!user) { setLoading(false); return }; const { data } = await supabase.from('module_configs').select('config_value').eq('user_id', user.id).eq('sector_slug', sectorSlug).eq('module_slug', mod.slug).eq('config_key', 'rent_invoices').maybeSingle(); if (data?.config_value && Array.isArray(data.config_value)) setInvoices(data.config_value as RentInvoice[]); setLoading(false) }, [supabase, sectorSlug, mod.slug])
  useEffect(() => { fetchData() }, [fetchData])

  const filtered = filterStatus === 'all' ? invoices : invoices.filter(i => i.status === filterStatus)
  const totalInvoiced = invoices.reduce((s, i) => s + i.amount, 0)
  const totalPaid = invoices.filter(i => i.status === 'Betald').reduce((s, i) => s + i.amount, 0)
  const totalOverdue = invoices.filter(i => i.status === 'Förfallen').reduce((s, i) => s + i.amount, 0)

  function openNew() { setEditing(null); setForm({ ...EMPTY_FORM }); setDialogOpen(true) }
  function openEdit(i: RentInvoice) { setEditing(i); setForm({ invoiceNumber: i.invoiceNumber, tenant: i.tenant, property: i.property, period: i.period, amount: i.amount, dueDate: i.dueDate, status: i.status, paidDate: i.paidDate }); setDialogOpen(true) }
  async function handleSave() { const item: RentInvoice = { id: editing?.id ?? crypto.randomUUID(), ...form, invoiceNumber: form.invoiceNumber.trim(), tenant: form.tenant.trim(), property: form.property.trim() }; const updated = editing ? invoices.map(i => i.id === editing.id ? item : i) : [...invoices, item]; setInvoices(updated); setDialogOpen(false); await saveItems(updated) }
  async function handleDelete() { if (!toDelete) return; const updated = invoices.filter(i => i.id !== toDelete.id); setInvoices(updated); setDeleteDialogOpen(false); setToDelete(null); await saveItems(updated) }

  return (
    <>
      <ModuleWorkspaceShell title={mod.name} description={mod.desc} category="operativ" sectorName="Fastighet" backHref={`/m/${sectorSlug}`} settingsHref={settingsHref} actions={<Button onClick={openNew}><Plus className="mr-2 h-4 w-4" />Ny avi</Button>}>
        <Tabs defaultValue="oversikt" className="space-y-6">
          <TabsList><TabsTrigger value="oversikt">Översikt</TabsTrigger><TabsTrigger value="avier">Avier</TabsTrigger></TabsList>
          <TabsContent value="oversikt" className="space-y-6">
            {loading ? <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div> : invoices.length === 0 ? <EmptyModuleState icon={FileText} title="Inga hyresavier" description="Skapa och hantera hyresavier med fakturanummer, status och betalningsspårning." actionLabel="Ny avi" onAction={openNew} /> : (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"><KPICard label="Totalt fakturerat" value={fmt(totalInvoiced)} unit="kr" /><KPICard label="Betalt" value={fmt(totalPaid)} unit="kr" /><KPICard label="Förfallet" value={fmt(totalOverdue)} unit="kr" /><KPICard label="Antal avier" value={String(invoices.length)} unit="st" /></div>
            )}
          </TabsContent>
          <TabsContent value="avier" className="space-y-4">
            <div className="flex items-center gap-3"><Select value={filterStatus} onValueChange={val => setFilterStatus(val as InvoiceStatus | 'all')}><SelectTrigger className="w-[180px]"><SelectValue placeholder="Filter" /></SelectTrigger><SelectContent><SelectItem value="all">Alla</SelectItem>{STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent></Select>{saving && <div className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" />Sparar...</div>}</div>
            {filtered.length > 0 && <div className="space-y-2">{filtered.sort((a, b) => b.dueDate.localeCompare(a.dueDate)).map(i => (
              <div key={i.id} className="flex items-center justify-between gap-4 rounded-xl border border-border bg-card px-5 py-3">
                <div className="flex items-center gap-3 min-w-0"><span className="font-mono text-xs text-muted-foreground w-16">{i.invoiceNumber}</span><span className="font-medium text-sm">{i.tenant}</span><span className="text-xs text-muted-foreground">{i.property}</span><span className="text-xs text-muted-foreground">{i.period}</span></div>
                <div className="flex items-center gap-3 flex-shrink-0"><span className="font-medium tabular-nums text-sm">{fmt(i.amount)} kr</span><span className="text-xs text-muted-foreground">{i.dueDate}</span><StatusBadge label={i.status} variant={STATUS_MAP[i.status]} /><Button variant="ghost" size="icon" onClick={() => openEdit(i)}><Pencil className="h-4 w-4" /></Button><Button variant="ghost" size="icon" className="text-red-600" onClick={() => { setToDelete(i); setDeleteDialogOpen(true) }}><Trash2 className="h-4 w-4" /></Button></div>
              </div>
            ))}</div>}
          </TabsContent>
        </Tabs>
      </ModuleWorkspaceShell>
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}><DialogContent className="max-w-md"><DialogHeader><DialogTitle>{editing ? 'Redigera avi' : 'Ny hyresavi'}</DialogTitle><DialogDescription>Ange aviuppgifter.</DialogDescription></DialogHeader><div className="grid gap-4 py-2"><div className="grid grid-cols-2 gap-4"><div className="grid gap-2"><Label>Fakturanr *</Label><Input value={form.invoiceNumber} onChange={e => setForm(f => ({ ...f, invoiceNumber: e.target.value }))} /></div><div className="grid gap-2"><Label>Hyresgäst *</Label><Input value={form.tenant} onChange={e => setForm(f => ({ ...f, tenant: e.target.value }))} /></div></div><div className="grid grid-cols-2 gap-4"><div className="grid gap-2"><Label>Fastighet</Label><Input value={form.property} onChange={e => setForm(f => ({ ...f, property: e.target.value }))} /></div><div className="grid gap-2"><Label>Period</Label><Input value={form.period} onChange={e => setForm(f => ({ ...f, period: e.target.value }))} placeholder="t.ex. Jan 2024" /></div></div><div className="grid grid-cols-3 gap-4"><div className="grid gap-2"><Label>Belopp (kr)</Label><Input type="number" min={0} value={form.amount} onChange={e => setForm(f => ({ ...f, amount: parseFloat(e.target.value) || 0 }))} /></div><div className="grid gap-2"><Label>Förfallodatum</Label><Input type="date" value={form.dueDate} onChange={e => setForm(f => ({ ...f, dueDate: e.target.value }))} /></div><div className="grid gap-2"><Label>Status</Label><Select value={form.status} onValueChange={val => setForm(f => ({ ...f, status: val as InvoiceStatus }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent></Select></div></div>{form.status === 'Betald' && <div className="grid gap-2"><Label>Betaldatum</Label><Input type="date" value={form.paidDate} onChange={e => setForm(f => ({ ...f, paidDate: e.target.value }))} /></div>}</div><DialogFooter><Button variant="outline" onClick={() => setDialogOpen(false)}>Avbryt</Button><Button onClick={handleSave} disabled={!form.invoiceNumber.trim() || !form.tenant.trim()}>{editing ? 'Uppdatera' : 'Skapa'}</Button></DialogFooter></DialogContent></Dialog>
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}><DialogContent className="max-w-sm"><DialogHeader><DialogTitle>Ta bort avi</DialogTitle><DialogDescription>Är du säker?</DialogDescription></DialogHeader><DialogFooter><Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>Avbryt</Button><Button variant="destructive" onClick={handleDelete}><Trash2 className="mr-2 h-4 w-4" />Ta bort</Button></DialogFooter></DialogContent></Dialog>
    </>
  )
}
