'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { ModuleWorkspaceShell } from '@/components/modules/ModuleWorkspaceShell'
import { EmptyModuleState } from '@/components/modules/shared/EmptyModuleState'
import { KPICard } from '@/components/modules/shared/KPICard'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { Plus, Pencil, Trash2, Loader2, ReceiptText } from 'lucide-react'

interface ModuleWorkspaceProps {
  module: { slug: string; name: string; cat: string; desc: string; longDesc: string }
  sectorSlug: string
  settingsHref: string
}

type VatRate = '12%' | '25%' | '0%'
interface SalesEntry { id: string; description: string; amount: number; vatRate: VatRate; vatAmount: number }

const VAT_RATES: VatRate[] = ['12%', '25%', '0%']
const VAT_MAP: Record<VatRate, number> = { '12%': 0.12, '25%': 0.25, '0%': 0 }
function fmt(n: number): string { return new Intl.NumberFormat('sv-SE', { maximumFractionDigits: 0 }).format(n) }

const EMPTY_FORM = { description: '', amount: 0, vatRate: '12%' as VatRate }

export function MomssplitLivsmedelWorkspace({ module: mod, sectorSlug, settingsHref }: ModuleWorkspaceProps) {
  const supabase = createClient()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [entries, setEntries] = useState<SalesEntry[]>([])
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<SalesEntry | null>(null)
  const [form, setForm] = useState(EMPTY_FORM)

  const saveData = useCallback(async (items: SalesEntry[]) => {
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setSaving(false); return }
    await supabase.from('module_configs').upsert({ user_id: user.id, sector_slug: sectorSlug, module_slug: mod.slug, config_key: 'vat_split', config_value: items }, { onConflict: 'user_id,sector_slug,module_slug,config_key' })
    setSaving(false)
  }, [supabase, sectorSlug, mod.slug])

  const fetchData = useCallback(async () => {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); return }
    const { data } = await supabase.from('module_configs').select('config_value').eq('user_id', user.id).eq('sector_slug', sectorSlug).eq('module_slug', mod.slug).eq('config_key', 'vat_split').maybeSingle()
    if (data?.config_value && Array.isArray(data.config_value)) setEntries(data.config_value as SalesEntry[])
    setLoading(false)
  }, [supabase, sectorSlug, mod.slug])

  useEffect(() => { fetchData() }, [fetchData])

  const totalSales = useMemo(() => entries.reduce((s, e) => s + e.amount, 0), [entries])
  const totalVat = useMemo(() => entries.reduce((s, e) => s + e.vatAmount, 0), [entries])
  const food12 = useMemo(() => entries.filter(e => e.vatRate === '12%').reduce((s, e) => s + e.vatAmount, 0), [entries])
  const other25 = useMemo(() => entries.filter(e => e.vatRate === '25%').reduce((s, e) => s + e.vatAmount, 0), [entries])

  function openNew() { setEditing(null); setForm({ ...EMPTY_FORM }); setDialogOpen(true) }
  function openEdit(e: SalesEntry) { setEditing(e); setForm({ description: e.description, amount: e.amount, vatRate: e.vatRate }); setDialogOpen(true) }
  async function handleSave() {
    const vatAmount = Math.round(form.amount * VAT_MAP[form.vatRate])
    const entry: SalesEntry = { id: editing?.id ?? crypto.randomUUID(), ...form, vatAmount }
    const updated = editing ? entries.map(e => e.id === editing.id ? entry : e) : [...entries, entry]
    setEntries(updated); setDialogOpen(false); await saveData(updated)
  }
  async function handleDelete(id: string) { const updated = entries.filter(e => e.id !== id); setEntries(updated); await saveData(updated) }

  return (
    <>
      <ModuleWorkspaceShell title={mod.name} description={mod.desc} category="bokforing" sectorName="Jordbruk & Livsmedel" backHref={`/m/${sectorSlug}`} settingsHref={settingsHref}
        actions={<Button onClick={openNew}><Plus className="mr-2 h-4 w-4" />Ny post</Button>}>
        {loading ? <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div> : (
          <div className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <KPICard label="Total försäljning" value={fmt(totalSales)} unit="kr" />
              <KPICard label="Total moms" value={fmt(totalVat)} unit="kr" />
              <KPICard label="Moms 12% (livsmedel)" value={fmt(food12)} unit="kr" />
              <KPICard label="Moms 25% (övrigt)" value={fmt(other25)} unit="kr" />
            </div>
            {entries.length === 0 ? <EmptyModuleState icon={ReceiptText} title="Inga poster" description="Lägg till försäljningsposter för att splitta moms 12% livsmedel vs 25% övrigt." actionLabel="Ny post" onAction={openNew} /> : (
              <div className="rounded-xl border border-border overflow-hidden">
                <Table><TableHeader><TableRow className="bg-muted/50"><TableHead className="font-medium">Beskrivning</TableHead><TableHead className="font-medium text-right">Belopp</TableHead><TableHead className="font-medium">Momssats</TableHead><TableHead className="font-medium text-right">Momsbelopp</TableHead><TableHead className="font-medium text-right">Åtgärder</TableHead></TableRow></TableHeader>
                  <TableBody>{entries.map(e => (
                    <TableRow key={e.id}><TableCell className="font-medium">{e.description}</TableCell><TableCell className="text-right tabular-nums">{fmt(e.amount)} kr</TableCell><TableCell><Badge variant={e.vatRate === '12%' ? 'default' : e.vatRate === '25%' ? 'secondary' : 'outline'}>{e.vatRate}</Badge></TableCell><TableCell className="text-right tabular-nums">{fmt(e.vatAmount)} kr</TableCell>
                      <TableCell className="text-right"><div className="flex items-center justify-end gap-1"><Button variant="ghost" size="icon" onClick={() => openEdit(e)}><Pencil className="h-4 w-4" /></Button><Button variant="ghost" size="icon" className="text-red-600" onClick={() => handleDelete(e.id)}><Trash2 className="h-4 w-4" /></Button></div></TableCell></TableRow>
                  ))}</TableBody></Table></div>
            )}
            {saving && <div className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" />Sparar...</div>}
          </div>
        )}
      </ModuleWorkspaceShell>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}><DialogContent className="max-w-md"><DialogHeader><DialogTitle>{editing ? 'Redigera' : 'Ny post'}</DialogTitle><DialogDescription>Ange försäljning och momssats.</DialogDescription></DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="grid gap-2"><Label>Beskrivning *</Label><Input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Grönsaksförsäljning" /></div>
          <div className="grid grid-cols-2 gap-4"><div className="grid gap-2"><Label>Belopp (kr) *</Label><Input type="number" value={form.amount || ''} onChange={e => setForm(f => ({ ...f, amount: parseFloat(e.target.value) || 0 }))} /></div><div className="grid gap-2"><Label>Momssats</Label><Select value={form.vatRate} onValueChange={v => setForm(f => ({ ...f, vatRate: v as VatRate }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{VAT_RATES.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent></Select></div></div>
          <div className="rounded-lg bg-muted/30 p-3"><p className="text-xs text-muted-foreground">Beräknad moms: <strong>{fmt(Math.round(form.amount * VAT_MAP[form.vatRate]))} kr</strong></p></div>
        </div>
        <DialogFooter><Button variant="outline" onClick={() => setDialogOpen(false)}>Avbryt</Button><Button onClick={handleSave} disabled={!form.description.trim()}>{editing ? 'Uppdatera' : 'Lägg till'}</Button></DialogFooter></DialogContent></Dialog>
    </>
  )
}
