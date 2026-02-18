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
import { Plus, Pencil, Trash2, Loader2, Receipt } from 'lucide-react'

interface ModuleWorkspaceProps { module: { slug: string; name: string; cat: string; desc: string; longDesc: string }; sectorSlug: string; settingsHref: string }
type VatCategory = 'Biljetter 6%' | 'F&B 25%' | 'Merch 25%' | 'Övrigt'
interface VatEntry { id: string; event: string; category: VatCategory; netAmount: number; vatRate: number; vatAmount: number; totalAmount: number }
function fmt(n: number): string { return new Intl.NumberFormat('sv-SE', { maximumFractionDigits: 0 }).format(n) }
const VAT_RATES: Record<VatCategory, number> = { 'Biljetter 6%': 6, 'F&B 25%': 25, 'Merch 25%': 25, 'Övrigt': 25 }
const CATEGORIES: VatCategory[] = ['Biljetter 6%', 'F&B 25%', 'Merch 25%', 'Övrigt']
const EMPTY_FORM = { event: '', category: 'Biljetter 6%' as VatCategory, netAmount: 0 }

export function KulturmomsEventWorkspace({ module: mod, sectorSlug, settingsHref }: ModuleWorkspaceProps) {
  const supabase = createClient()
  const [loading, setLoading] = useState(true); const [saving, setSaving] = useState(false); const [entries, setEntries] = useState<VatEntry[]>([]); const [dialogOpen, setDialogOpen] = useState(false); const [editing, setEditing] = useState<VatEntry | null>(null); const [form, setForm] = useState(EMPTY_FORM); const [deleteDialogOpen, setDeleteDialogOpen] = useState(false); const [toDelete, setToDelete] = useState<VatEntry | null>(null)

  const saveItems = useCallback(async (items: VatEntry[]) => { setSaving(true); const { data: { user } } = await supabase.auth.getUser(); if (!user) { setSaving(false); return }; await supabase.from('module_configs').upsert({ user_id: user.id, sector_slug: sectorSlug, module_slug: mod.slug, config_key: 'vat_entries', config_value: items }, { onConflict: 'user_id,sector_slug,module_slug,config_key' }); setSaving(false) }, [supabase, sectorSlug, mod.slug])
  const fetchData = useCallback(async () => { setLoading(true); const { data: { user } } = await supabase.auth.getUser(); if (!user) { setLoading(false); return }; const { data } = await supabase.from('module_configs').select('config_value').eq('user_id', user.id).eq('sector_slug', sectorSlug).eq('module_slug', mod.slug).eq('config_key', 'vat_entries').maybeSingle(); if (data?.config_value && Array.isArray(data.config_value)) setEntries(data.config_value as VatEntry[]); setLoading(false) }, [supabase, sectorSlug, mod.slug])
  useEffect(() => { fetchData() }, [fetchData])

  const totalVat6 = entries.filter(e => e.vatRate === 6).reduce((s, e) => s + e.vatAmount, 0)
  const totalVat25 = entries.filter(e => e.vatRate === 25).reduce((s, e) => s + e.vatAmount, 0)
  const totalNet = entries.reduce((s, e) => s + e.netAmount, 0)

  function openNew() { setEditing(null); setForm({ ...EMPTY_FORM }); setDialogOpen(true) }
  function openEdit(e: VatEntry) { setEditing(e); setForm({ event: e.event, category: e.category, netAmount: e.netAmount }); setDialogOpen(true) }
  async function handleSave() { const rate = VAT_RATES[form.category]; const vatAmount = form.netAmount * (rate / 100); const item: VatEntry = { id: editing?.id ?? crypto.randomUUID(), event: form.event.trim(), category: form.category, netAmount: form.netAmount, vatRate: rate, vatAmount, totalAmount: form.netAmount + vatAmount }; const updated = editing ? entries.map(e => e.id === editing.id ? item : e) : [...entries, item]; setEntries(updated); setDialogOpen(false); await saveItems(updated) }
  async function handleDelete() { if (!toDelete) return; const updated = entries.filter(e => e.id !== toDelete.id); setEntries(updated); setDeleteDialogOpen(false); setToDelete(null); await saveItems(updated) }

  return (
    <>
      <ModuleWorkspaceShell title={mod.name} description={mod.desc} category="bokforing" sectorName="Event" backHref={`/m/${sectorSlug}`} settingsHref={settingsHref} actions={<Button onClick={openNew}><Plus className="mr-2 h-4 w-4" />Ny post</Button>}>
        <Tabs defaultValue="oversikt" className="space-y-6">
          <TabsList><TabsTrigger value="oversikt">Översikt</TabsTrigger><TabsTrigger value="poster">Poster</TabsTrigger></TabsList>
          <TabsContent value="oversikt" className="space-y-6">
            {loading ? <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div> : entries.length === 0 ? <EmptyModuleState icon={Receipt} title="Inga momsposter" description="Kulturmoms: 6% på biljetter, 25% på F&B och merch. Registrera försäljning per kategori." actionLabel="Ny post" onAction={openNew} /> : (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"><KPICard label="Moms 6% (biljetter)" value={fmt(totalVat6)} unit="kr" /><KPICard label="Moms 25% (F&B/merch)" value={fmt(totalVat25)} unit="kr" /><KPICard label="Total moms" value={fmt(totalVat6 + totalVat25)} unit="kr" /><KPICard label="Netto" value={fmt(totalNet)} unit="kr" /></div>
            )}
          </TabsContent>
          <TabsContent value="poster" className="space-y-4">
            {entries.length > 0 && <div className="rounded-xl border border-border overflow-hidden"><table className="w-full text-sm"><thead><tr className="bg-muted/50 border-b"><th className="text-left px-4 py-3 font-medium text-muted-foreground">Event</th><th className="text-left px-4 py-3 font-medium text-muted-foreground">Kategori</th><th className="text-right px-4 py-3 font-medium text-muted-foreground">Netto</th><th className="text-right px-4 py-3 font-medium text-muted-foreground">Moms %</th><th className="text-right px-4 py-3 font-medium text-muted-foreground">Moms kr</th><th className="text-right px-4 py-3 font-medium text-muted-foreground">Totalt</th><th className="text-right px-4 py-3 font-medium text-muted-foreground">Åtgärder</th></tr></thead><tbody>{entries.map(e => <tr key={e.id} className="border-b last:border-0"><td className="px-4 py-3 font-medium">{e.event}</td><td className="px-4 py-3">{e.category}</td><td className="px-4 py-3 text-right tabular-nums">{fmt(e.netAmount)}</td><td className="px-4 py-3 text-right tabular-nums">{e.vatRate}%</td><td className="px-4 py-3 text-right tabular-nums">{fmt(e.vatAmount)}</td><td className="px-4 py-3 text-right tabular-nums font-medium">{fmt(e.totalAmount)}</td><td className="px-4 py-3 text-right"><div className="flex items-center justify-end gap-1"><Button variant="ghost" size="icon" onClick={() => openEdit(e)}><Pencil className="h-4 w-4" /></Button><Button variant="ghost" size="icon" className="text-red-600" onClick={() => { setToDelete(e); setDeleteDialogOpen(true) }}><Trash2 className="h-4 w-4" /></Button></div></td></tr>)}</tbody></table></div>}
            {saving && <div className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" />Sparar...</div>}
          </TabsContent>
        </Tabs>
      </ModuleWorkspaceShell>
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}><DialogContent className="max-w-md"><DialogHeader><DialogTitle>{editing ? 'Redigera' : 'Ny momspost'}</DialogTitle><DialogDescription>Registrera försäljning per momskategori.</DialogDescription></DialogHeader><div className="grid gap-4 py-2"><div className="grid gap-2"><Label>Event *</Label><Input value={form.event} onChange={e => setForm(f => ({ ...f, event: e.target.value }))} /></div><div className="grid grid-cols-2 gap-4"><div className="grid gap-2"><Label>Kategori</Label><Select value={form.category} onValueChange={val => setForm(f => ({ ...f, category: val as VatCategory }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent></Select></div><div className="grid gap-2"><Label>Nettobelopp (kr)</Label><Input type="number" min={0} value={form.netAmount} onChange={e => setForm(f => ({ ...f, netAmount: parseFloat(e.target.value) || 0 }))} /></div></div>{form.netAmount > 0 && <div className="rounded-lg border bg-muted/30 px-4 py-3 text-sm">Moms {VAT_RATES[form.category]}%: <span className="font-semibold">{fmt(form.netAmount * VAT_RATES[form.category] / 100)} kr</span> | Totalt: <span className="font-semibold">{fmt(form.netAmount * (1 + VAT_RATES[form.category] / 100))} kr</span></div>}</div><DialogFooter><Button variant="outline" onClick={() => setDialogOpen(false)}>Avbryt</Button><Button onClick={handleSave} disabled={!form.event.trim()}>{editing ? 'Uppdatera' : 'Skapa'}</Button></DialogFooter></DialogContent></Dialog>
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}><DialogContent className="max-w-sm"><DialogHeader><DialogTitle>Ta bort</DialogTitle><DialogDescription>Är du säker?</DialogDescription></DialogHeader><DialogFooter><Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>Avbryt</Button><Button variant="destructive" onClick={handleDelete}><Trash2 className="mr-2 h-4 w-4" />Ta bort</Button></DialogFooter></DialogContent></Dialog>
    </>
  )
}
