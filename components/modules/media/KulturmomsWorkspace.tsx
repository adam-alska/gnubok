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
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Plus, Pencil, Trash2, Loader2, Film } from 'lucide-react'

interface ModuleWorkspaceProps { module: { slug: string; name: string; cat: string; desc: string; longDesc: string }; sectorSlug: string; settingsHref: string }

type VatRate = '6%' | '25%' | '0%'
interface CultureEntry { id: string; serviceType: string; description: string; amount: number; vatRate: VatRate; vatAmount: number }

const VAT_RATES: VatRate[] = ['6%', '25%', '0%']
const VAT_MAP: Record<VatRate, number> = { '6%': 0.06, '25%': 0.25, '0%': 0 }
function fmt(n: number): string { return new Intl.NumberFormat('sv-SE', { maximumFractionDigits: 0 }).format(n) }
const EMPTY_FORM = { serviceType: '', description: '', amount: 0, vatRate: '6%' as VatRate }

export function KulturmomsWorkspace({ module: mod, sectorSlug, settingsHref }: ModuleWorkspaceProps) {
  const supabase = createClient()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [entries, setEntries] = useState<CultureEntry[]>([])
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<CultureEntry | null>(null)
  const [form, setForm] = useState(EMPTY_FORM)

  const saveData = useCallback(async (items: CultureEntry[]) => { setSaving(true); const { data: { user } } = await supabase.auth.getUser(); if (!user) { setSaving(false); return }; await supabase.from('module_configs').upsert({ user_id: user.id, sector_slug: sectorSlug, module_slug: mod.slug, config_key: 'culture_vat', config_value: items }, { onConflict: 'user_id,sector_slug,module_slug,config_key' }); setSaving(false) }, [supabase, sectorSlug, mod.slug])
  const fetchData = useCallback(async () => { setLoading(true); const { data: { user } } = await supabase.auth.getUser(); if (!user) { setLoading(false); return }; const { data } = await supabase.from('module_configs').select('config_value').eq('user_id', user.id).eq('sector_slug', sectorSlug).eq('module_slug', mod.slug).eq('config_key', 'culture_vat').maybeSingle(); if (data?.config_value && Array.isArray(data.config_value)) setEntries(data.config_value as CultureEntry[]); setLoading(false) }, [supabase, sectorSlug, mod.slug])
  useEffect(() => { fetchData() }, [fetchData])

  const total6 = useMemo(() => entries.filter(e => e.vatRate === '6%').reduce((s, e) => s + e.vatAmount, 0), [entries])
  const total25 = useMemo(() => entries.filter(e => e.vatRate === '25%').reduce((s, e) => s + e.vatAmount, 0), [entries])
  const totalVat = total6 + total25

  function openNew() { setEditing(null); setForm({ ...EMPTY_FORM }); setDialogOpen(true) }
  function openEdit(e: CultureEntry) { setEditing(e); setForm({ serviceType: e.serviceType, description: e.description, amount: e.amount, vatRate: e.vatRate }); setDialogOpen(true) }
  async function handleSave() { const vatAmount = Math.round(form.amount * VAT_MAP[form.vatRate]); const entry: CultureEntry = { id: editing?.id ?? crypto.randomUUID(), ...form, vatAmount }; const updated = editing ? entries.map(e => e.id === editing.id ? entry : e) : [...entries, entry]; setEntries(updated); setDialogOpen(false); await saveData(updated) }
  async function handleDelete(id: string) { const updated = entries.filter(e => e.id !== id); setEntries(updated); await saveData(updated) }

  return (
    <>
      <ModuleWorkspaceShell title={mod.name} description={mod.desc} category="bokforing" sectorName="Media & Kommunikation" backHref={`/m/${sectorSlug}`} settingsHref={settingsHref}
        actions={<Button onClick={openNew}><Plus className="mr-2 h-4 w-4" />Ny post</Button>}>
        <Tabs defaultValue="oversikt" className="space-y-6">
          <TabsList><TabsTrigger value="oversikt">Poster</TabsTrigger><TabsTrigger value="regler">Regler</TabsTrigger></TabsList>
          <TabsContent value="oversikt" className="space-y-6">
            {loading ? <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div> : (
              <>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"><KPICard label="Kulturmoms 6%" value={fmt(total6)} unit="kr" /><KPICard label="Standardmoms 25%" value={fmt(total25)} unit="kr" /><KPICard label="Total moms" value={fmt(totalVat)} unit="kr" /></div>
                {entries.length === 0 ? <EmptyModuleState icon={Film} title="Inga poster" description="Lägg till tjänster och bedöm korrekt momssats (6% kultur vs 25% standard)." actionLabel="Ny post" onAction={openNew} /> : (
                  <div className="rounded-xl border border-border overflow-hidden"><Table><TableHeader><TableRow className="bg-muted/50"><TableHead className="font-medium">Tjänstetyp</TableHead><TableHead className="font-medium">Beskrivning</TableHead><TableHead className="font-medium text-right">Belopp</TableHead><TableHead className="font-medium">Momssats</TableHead><TableHead className="font-medium text-right">Moms</TableHead><TableHead className="font-medium text-right">Åtgärder</TableHead></TableRow></TableHeader>
                    <TableBody>{entries.map(e => <TableRow key={e.id}><TableCell className="font-medium">{e.serviceType}</TableCell><TableCell className="text-muted-foreground">{e.description}</TableCell><TableCell className="text-right tabular-nums">{fmt(e.amount)} kr</TableCell><TableCell><Badge variant={e.vatRate === '6%' ? 'default' : 'secondary'}>{e.vatRate}</Badge></TableCell><TableCell className="text-right tabular-nums">{fmt(e.vatAmount)} kr</TableCell><TableCell className="text-right"><div className="flex items-center justify-end gap-1"><Button variant="ghost" size="icon" onClick={() => openEdit(e)}><Pencil className="h-4 w-4" /></Button><Button variant="ghost" size="icon" className="text-red-600" onClick={() => handleDelete(e.id)}><Trash2 className="h-4 w-4" /></Button></div></TableCell></TableRow>)}</TableBody></Table></div>
                )}
                {saving && <div className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" />Sparar...</div>}
              </>
            )}
          </TabsContent>
          <TabsContent value="regler"><div className="rounded-xl border border-border bg-card p-6 max-w-lg space-y-3"><h3 className="text-sm font-semibold">Kulturmoms 6%</h3><ul className="text-sm text-muted-foreground space-y-2 list-disc pl-4"><li>Publicering av böcker, tidningar (tryckt och digitalt)</li><li>Biografvisning, teater, konserter</li><li>Upplåtelse av upphovsrätt till litterärt/konstnärligt verk</li><li>Övriga mediatjänster: <strong>25%</strong></li></ul></div></TabsContent>
        </Tabs>
      </ModuleWorkspaceShell>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}><DialogContent className="max-w-md"><DialogHeader><DialogTitle>{editing ? 'Redigera' : 'Ny post'}</DialogTitle><DialogDescription>Ange tjänst och korrekt momssats.</DialogDescription></DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="grid gap-2"><Label>Tjänstetyp *</Label><Input value={form.serviceType} onChange={e => setForm(f => ({ ...f, serviceType: e.target.value }))} placeholder="Filmproduktion" /></div>
          <div className="grid gap-2"><Label>Beskrivning</Label><Input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} /></div>
          <div className="grid grid-cols-2 gap-4"><div className="grid gap-2"><Label>Belopp (kr) *</Label><Input type="number" value={form.amount || ''} onChange={e => setForm(f => ({ ...f, amount: parseFloat(e.target.value) || 0 }))} /></div><div className="grid gap-2"><Label>Momssats</Label><Select value={form.vatRate} onValueChange={v => setForm(f => ({ ...f, vatRate: v as VatRate }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{VAT_RATES.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent></Select></div></div>
          <div className="rounded-lg bg-muted/30 p-3"><p className="text-xs text-muted-foreground">Beräknad moms: <strong>{fmt(Math.round(form.amount * VAT_MAP[form.vatRate]))} kr</strong></p></div>
        </div>
        <DialogFooter><Button variant="outline" onClick={() => setDialogOpen(false)}>Avbryt</Button><Button onClick={handleSave} disabled={!form.serviceType.trim()}>{editing ? 'Uppdatera' : 'Lägg till'}</Button></DialogFooter></DialogContent></Dialog>
    </>
  )
}
