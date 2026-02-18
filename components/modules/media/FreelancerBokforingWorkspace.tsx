'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { ModuleWorkspaceShell } from '@/components/modules/ModuleWorkspaceShell'
import { EmptyModuleState } from '@/components/modules/shared/EmptyModuleState'
import { KPICard } from '@/components/modules/shared/KPICard'
import { StatusBadge } from '@/components/modules/shared/StatusBadge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Plus, Pencil, Trash2, Loader2, UserCheck } from 'lucide-react'

interface ModuleWorkspaceProps { module: { slug: string; name: string; cat: string; desc: string; longDesc: string }; sectorSlug: string; settingsHref: string }

interface FreelanceInvoice { id: string; freelancerName: string; invoiceNumber: string; amount: number; date: string; project: string; hasFSkatt: boolean; account: string; notes: string }

function fmt(n: number): string { return new Intl.NumberFormat('sv-SE', { maximumFractionDigits: 0 }).format(n) }
const EMPTY_FORM = { freelancerName: '', invoiceNumber: '', amount: 0, date: '', project: '', hasFSkatt: true, account: '4010', notes: '' }

export function FreelancerBokforingWorkspace({ module: mod, sectorSlug, settingsHref }: ModuleWorkspaceProps) {
  const supabase = createClient()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [invoices, setInvoices] = useState<FreelanceInvoice[]>([])
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<FreelanceInvoice | null>(null)
  const [form, setForm] = useState(EMPTY_FORM)

  const saveData = useCallback(async (items: FreelanceInvoice[]) => { setSaving(true); const { data: { user } } = await supabase.auth.getUser(); if (!user) { setSaving(false); return }; await supabase.from('module_configs').upsert({ user_id: user.id, sector_slug: sectorSlug, module_slug: mod.slug, config_key: 'freelance_invoices', config_value: items }, { onConflict: 'user_id,sector_slug,module_slug,config_key' }); setSaving(false) }, [supabase, sectorSlug, mod.slug])
  const fetchData = useCallback(async () => { setLoading(true); const { data: { user } } = await supabase.auth.getUser(); if (!user) { setLoading(false); return }; const { data } = await supabase.from('module_configs').select('config_value').eq('user_id', user.id).eq('sector_slug', sectorSlug).eq('module_slug', mod.slug).eq('config_key', 'freelance_invoices').maybeSingle(); if (data?.config_value && Array.isArray(data.config_value)) setInvoices(data.config_value as FreelanceInvoice[]); setLoading(false) }, [supabase, sectorSlug, mod.slug])
  useEffect(() => { fetchData() }, [fetchData])

  const totalAmount = useMemo(() => invoices.reduce((s, i) => s + i.amount, 0), [invoices])
  const noFSkatt = useMemo(() => invoices.filter(i => !i.hasFSkatt).length, [invoices])

  function openNew() { setEditing(null); setForm({ ...EMPTY_FORM }); setDialogOpen(true) }
  function openEdit(inv: FreelanceInvoice) { setEditing(inv); setForm({ freelancerName: inv.freelancerName, invoiceNumber: inv.invoiceNumber, amount: inv.amount, date: inv.date, project: inv.project, hasFSkatt: inv.hasFSkatt, account: inv.account, notes: inv.notes }); setDialogOpen(true) }
  async function handleSave() { const entry: FreelanceInvoice = { id: editing?.id ?? crypto.randomUUID(), ...form }; const updated = editing ? invoices.map(i => i.id === editing.id ? entry : i) : [...invoices, entry]; setInvoices(updated); setDialogOpen(false); await saveData(updated) }
  async function handleDelete(id: string) { const updated = invoices.filter(i => i.id !== id); setInvoices(updated); await saveData(updated) }

  return (
    <>
      <ModuleWorkspaceShell title={mod.name} description={mod.desc} category="bokforing" sectorName="Media & Kommunikation" backHref={`/m/${sectorSlug}`} settingsHref={settingsHref}
        actions={<Button onClick={openNew}><Plus className="mr-2 h-4 w-4" />Ny faktura</Button>}>
        {loading ? <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div> : (
          <div className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <KPICard label="Totalt freelancekostnad" value={fmt(totalAmount)} unit="kr" />
              <KPICard label="Antal fakturor" value={invoices.length} />
              <KPICard label="Saknar F-skatt" value={noFSkatt} trend={noFSkatt > 0 ? 'down' : 'neutral'} trendLabel={noFSkatt > 0 ? 'Kräver skatteavdrag' : undefined} />
            </div>
            {invoices.length === 0 ? <EmptyModuleState icon={UserCheck} title="Inga freelancefakturor" description="Registrera fakturor med F-skatt-kontroll och automatkontering konto 4010." actionLabel="Ny faktura" onAction={openNew} /> : (
              <div className="rounded-xl border border-border overflow-hidden"><Table><TableHeader><TableRow className="bg-muted/50"><TableHead className="font-medium">Freelancer</TableHead><TableHead className="font-medium">Fakturanr</TableHead><TableHead className="font-medium">Datum</TableHead><TableHead className="font-medium">Projekt</TableHead><TableHead className="font-medium text-right">Belopp</TableHead><TableHead className="font-medium">F-skatt</TableHead><TableHead className="font-medium text-right">Åtgärder</TableHead></TableRow></TableHeader>
                <TableBody>{invoices.sort((a, b) => b.date.localeCompare(a.date)).map(inv => (
                  <TableRow key={inv.id}><TableCell className="font-medium">{inv.freelancerName}</TableCell><TableCell className="font-mono">{inv.invoiceNumber}</TableCell><TableCell>{inv.date}</TableCell><TableCell className="text-muted-foreground">{inv.project}</TableCell><TableCell className="text-right tabular-nums">{fmt(inv.amount)} kr</TableCell><TableCell><StatusBadge label={inv.hasFSkatt ? 'Ja' : 'Nej'} variant={inv.hasFSkatt ? 'success' : 'danger'} /></TableCell>
                    <TableCell className="text-right"><div className="flex items-center justify-end gap-1"><Button variant="ghost" size="icon" onClick={() => openEdit(inv)}><Pencil className="h-4 w-4" /></Button><Button variant="ghost" size="icon" className="text-red-600" onClick={() => handleDelete(inv.id)}><Trash2 className="h-4 w-4" /></Button></div></TableCell></TableRow>
                ))}</TableBody></Table></div>
            )}
            {saving && <div className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" />Sparar...</div>}
          </div>
        )}
      </ModuleWorkspaceShell>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}><DialogContent className="max-w-lg"><DialogHeader><DialogTitle>{editing ? 'Redigera' : 'Ny faktura'}</DialogTitle><DialogDescription>Freelancerfaktura med F-skatt-kontroll.</DialogDescription></DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="grid grid-cols-2 gap-4"><div className="grid gap-2"><Label>Freelancer *</Label><Input value={form.freelancerName} onChange={e => setForm(f => ({ ...f, freelancerName: e.target.value }))} /></div><div className="grid gap-2"><Label>Fakturanummer</Label><Input value={form.invoiceNumber} onChange={e => setForm(f => ({ ...f, invoiceNumber: e.target.value }))} /></div></div>
          <div className="grid grid-cols-3 gap-4"><div className="grid gap-2"><Label>Belopp (kr) *</Label><Input type="number" value={form.amount || ''} onChange={e => setForm(f => ({ ...f, amount: parseFloat(e.target.value) || 0 }))} /></div><div className="grid gap-2"><Label>Datum</Label><Input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} /></div><div className="grid gap-2"><Label>Konto</Label><Input value={form.account} onChange={e => setForm(f => ({ ...f, account: e.target.value }))} placeholder="4010" /></div></div>
          <div className="grid grid-cols-2 gap-4"><div className="grid gap-2"><Label>Projekt</Label><Input value={form.project} onChange={e => setForm(f => ({ ...f, project: e.target.value }))} /></div><div className="flex items-end"><Button type="button" variant={form.hasFSkatt ? 'default' : 'destructive'} size="sm" onClick={() => setForm(f => ({ ...f, hasFSkatt: !f.hasFSkatt }))} className="w-full">{form.hasFSkatt ? 'F-skatt: Verifierad' : 'F-skatt: SAKNAS'}</Button></div></div>
        </div>
        <DialogFooter><Button variant="outline" onClick={() => setDialogOpen(false)}>Avbryt</Button><Button onClick={handleSave} disabled={!form.freelancerName.trim()}>{editing ? 'Uppdatera' : 'Lägg till'}</Button></DialogFooter></DialogContent></Dialog>
    </>
  )
}
