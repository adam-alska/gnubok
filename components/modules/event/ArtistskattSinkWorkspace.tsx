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
import { Plus, Pencil, Trash2, Loader2, Globe } from 'lucide-react'
import { Badge } from '@/components/ui/badge'

interface ModuleWorkspaceProps { module: { slug: string; name: string; cat: string; desc: string; longDesc: string }; sectorSlug: string; settingsHref: string }
type TaxType = 'SINK 15%' | 'A-skatt' | 'F-skatt'
interface ArtistTaxEntry { id: string; artist: string; country: string; event: string; grossFee: number; taxType: TaxType; taxAmount: number; netPayout: number; paymentDate: string; reportedToSKV: boolean }
function fmt(n: number): string { return new Intl.NumberFormat('sv-SE', { maximumFractionDigits: 0 }).format(n) }
const TAX_TYPES: TaxType[] = ['SINK 15%', 'A-skatt', 'F-skatt']
const TAX_RATES: Record<TaxType, number> = { 'SINK 15%': 15, 'A-skatt': 30, 'F-skatt': 0 }
const EMPTY_FORM = { artist: '', country: '', event: '', grossFee: 0, taxType: 'SINK 15%' as TaxType, paymentDate: '', reportedToSKV: false }

export function ArtistskattSinkWorkspace({ module: mod, sectorSlug, settingsHref }: ModuleWorkspaceProps) {
  const supabase = createClient()
  const [loading, setLoading] = useState(true); const [saving, setSaving] = useState(false); const [entries, setEntries] = useState<ArtistTaxEntry[]>([]); const [dialogOpen, setDialogOpen] = useState(false); const [editing, setEditing] = useState<ArtistTaxEntry | null>(null); const [form, setForm] = useState(EMPTY_FORM); const [deleteDialogOpen, setDeleteDialogOpen] = useState(false); const [toDelete, setToDelete] = useState<ArtistTaxEntry | null>(null)

  const saveItems = useCallback(async (items: ArtistTaxEntry[]) => { setSaving(true); const { data: { user } } = await supabase.auth.getUser(); if (!user) { setSaving(false); return }; await supabase.from('module_configs').upsert({ user_id: user.id, sector_slug: sectorSlug, module_slug: mod.slug, config_key: 'artist_tax_entries', config_value: items }, { onConflict: 'user_id,sector_slug,module_slug,config_key' }); setSaving(false) }, [supabase, sectorSlug, mod.slug])
  const fetchData = useCallback(async () => { setLoading(true); const { data: { user } } = await supabase.auth.getUser(); if (!user) { setLoading(false); return }; const { data } = await supabase.from('module_configs').select('config_value').eq('user_id', user.id).eq('sector_slug', sectorSlug).eq('module_slug', mod.slug).eq('config_key', 'artist_tax_entries').maybeSingle(); if (data?.config_value && Array.isArray(data.config_value)) setEntries(data.config_value as ArtistTaxEntry[]); setLoading(false) }, [supabase, sectorSlug, mod.slug])
  useEffect(() => { fetchData() }, [fetchData])

  const totalGross = entries.reduce((s, e) => s + e.grossFee, 0)
  const totalTax = entries.reduce((s, e) => s + e.taxAmount, 0)
  const sinkEntries = entries.filter(e => e.taxType === 'SINK 15%')
  const unreported = entries.filter(e => !e.reportedToSKV).length

  function openNew() { setEditing(null); setForm({ ...EMPTY_FORM, paymentDate: new Date().toISOString().split('T')[0] }); setDialogOpen(true) }
  function openEdit(e: ArtistTaxEntry) { setEditing(e); setForm({ artist: e.artist, country: e.country, event: e.event, grossFee: e.grossFee, taxType: e.taxType, paymentDate: e.paymentDate, reportedToSKV: e.reportedToSKV }); setDialogOpen(true) }
  async function handleSave() { const rate = TAX_RATES[form.taxType]; const taxAmount = form.grossFee * (rate / 100); const item: ArtistTaxEntry = { id: editing?.id ?? crypto.randomUUID(), artist: form.artist.trim(), country: form.country.trim(), event: form.event.trim(), grossFee: form.grossFee, taxType: form.taxType, taxAmount, netPayout: form.grossFee - taxAmount, paymentDate: form.paymentDate, reportedToSKV: form.reportedToSKV }; const updated = editing ? entries.map(e => e.id === editing.id ? item : e) : [...entries, item]; setEntries(updated); setDialogOpen(false); await saveItems(updated) }
  async function handleDelete() { if (!toDelete) return; const updated = entries.filter(e => e.id !== toDelete.id); setEntries(updated); setDeleteDialogOpen(false); setToDelete(null); await saveItems(updated) }
  async function toggleReported(id: string) { const updated = entries.map(e => e.id === id ? { ...e, reportedToSKV: !e.reportedToSKV } : e); setEntries(updated); await saveItems(updated) }

  return (
    <>
      <ModuleWorkspaceShell title={mod.name} description={mod.desc} category="bokforing" sectorName="Event" backHref={`/m/${sectorSlug}`} settingsHref={settingsHref} actions={<Button onClick={openNew}><Plus className="mr-2 h-4 w-4" />Ny post</Button>}>
        <Tabs defaultValue="oversikt" className="space-y-6">
          <TabsList><TabsTrigger value="oversikt">Översikt</TabsTrigger><TabsTrigger value="poster">Poster</TabsTrigger></TabsList>
          <TabsContent value="oversikt" className="space-y-6">
            {loading ? <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div> : entries.length === 0 ? <EmptyModuleState icon={Globe} title="Inga artistskattposter" description="SINK-skatt 15% för utländska artister. Registrera arvoden, beräkna skatt och rapportera till Skatteverket." actionLabel="Ny post" onAction={openNew} /> : (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"><KPICard label="Totalt brutto" value={fmt(totalGross)} unit="kr" /><KPICard label="Total skatt" value={fmt(totalTax)} unit="kr" /><KPICard label="SINK-poster" value={String(sinkEntries.length)} unit="st" /><KPICard label="Ej rapporterade" value={String(unreported)} unit="st" /></div>
            )}
          </TabsContent>
          <TabsContent value="poster" className="space-y-4">
            {entries.length > 0 && <div className="rounded-xl border border-border overflow-hidden"><table className="w-full text-sm"><thead><tr className="bg-muted/50 border-b"><th className="text-left px-4 py-3 font-medium text-muted-foreground">Artist</th><th className="text-left px-4 py-3 font-medium text-muted-foreground">Land</th><th className="text-left px-4 py-3 font-medium text-muted-foreground">Event</th><th className="text-right px-4 py-3 font-medium text-muted-foreground">Brutto</th><th className="text-left px-4 py-3 font-medium text-muted-foreground">Skattetyp</th><th className="text-right px-4 py-3 font-medium text-muted-foreground">Skatt</th><th className="text-right px-4 py-3 font-medium text-muted-foreground">Netto</th><th className="text-left px-4 py-3 font-medium text-muted-foreground">SKV</th><th className="text-right px-4 py-3 font-medium text-muted-foreground">Åtgärder</th></tr></thead><tbody>{entries.sort((a, b) => b.paymentDate.localeCompare(a.paymentDate)).map(e => <tr key={e.id} className="border-b last:border-0"><td className="px-4 py-3 font-medium">{e.artist}</td><td className="px-4 py-3">{e.country}</td><td className="px-4 py-3">{e.event}</td><td className="px-4 py-3 text-right tabular-nums">{fmt(e.grossFee)}</td><td className="px-4 py-3"><Badge variant="outline">{e.taxType}</Badge></td><td className="px-4 py-3 text-right tabular-nums">{fmt(e.taxAmount)}</td><td className="px-4 py-3 text-right tabular-nums font-medium">{fmt(e.netPayout)}</td><td className="px-4 py-3"><Button variant="outline" size="sm" onClick={() => toggleReported(e.id)}>{e.reportedToSKV ? <Badge variant="secondary" className="bg-emerald-100 text-emerald-800">Rapporterad</Badge> : <Badge variant="secondary" className="bg-amber-100 text-amber-800">Ej rapp.</Badge>}</Button></td><td className="px-4 py-3 text-right"><div className="flex items-center justify-end gap-1"><Button variant="ghost" size="icon" onClick={() => openEdit(e)}><Pencil className="h-4 w-4" /></Button><Button variant="ghost" size="icon" className="text-red-600" onClick={() => { setToDelete(e); setDeleteDialogOpen(true) }}><Trash2 className="h-4 w-4" /></Button></div></td></tr>)}</tbody></table></div>}
            {saving && <div className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" />Sparar...</div>}
          </TabsContent>
        </Tabs>
      </ModuleWorkspaceShell>
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}><DialogContent className="max-w-md"><DialogHeader><DialogTitle>{editing ? 'Redigera' : 'Ny artistskatt'}</DialogTitle><DialogDescription>Registrera artistarvode och skatteavdrag.</DialogDescription></DialogHeader><div className="grid gap-4 py-2"><div className="grid grid-cols-2 gap-4"><div className="grid gap-2"><Label>Artist *</Label><Input value={form.artist} onChange={e => setForm(f => ({ ...f, artist: e.target.value }))} /></div><div className="grid gap-2"><Label>Land *</Label><Input value={form.country} onChange={e => setForm(f => ({ ...f, country: e.target.value }))} placeholder="t.ex. UK" /></div></div><div className="grid grid-cols-2 gap-4"><div className="grid gap-2"><Label>Event</Label><Input value={form.event} onChange={e => setForm(f => ({ ...f, event: e.target.value }))} /></div><div className="grid gap-2"><Label>Skattetyp</Label><Select value={form.taxType} onValueChange={val => setForm(f => ({ ...f, taxType: val as TaxType }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{TAX_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent></Select></div></div><div className="grid grid-cols-2 gap-4"><div className="grid gap-2"><Label>Bruttoarvode (kr)</Label><Input type="number" min={0} value={form.grossFee} onChange={e => setForm(f => ({ ...f, grossFee: parseFloat(e.target.value) || 0 }))} /></div><div className="grid gap-2"><Label>Utbetalningsdatum</Label><Input type="date" value={form.paymentDate} onChange={e => setForm(f => ({ ...f, paymentDate: e.target.value }))} /></div></div>{form.grossFee > 0 && <div className="rounded-lg border bg-muted/30 px-4 py-3 text-sm">Skatt {TAX_RATES[form.taxType]}%: <span className="font-semibold">{fmt(form.grossFee * TAX_RATES[form.taxType] / 100)} kr</span> | Netto: <span className="font-semibold">{fmt(form.grossFee * (1 - TAX_RATES[form.taxType] / 100))} kr</span></div>}<div className="flex items-center gap-3"><input type="checkbox" checked={form.reportedToSKV} onChange={e => setForm(f => ({ ...f, reportedToSKV: e.target.checked }))} className="h-4 w-4" /><Label>Rapporterad till Skatteverket</Label></div></div><DialogFooter><Button variant="outline" onClick={() => setDialogOpen(false)}>Avbryt</Button><Button onClick={handleSave} disabled={!form.artist.trim() || !form.country.trim()}>{editing ? 'Uppdatera' : 'Skapa'}</Button></DialogFooter></DialogContent></Dialog>
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}><DialogContent className="max-w-sm"><DialogHeader><DialogTitle>Ta bort</DialogTitle><DialogDescription>Är du säker?</DialogDescription></DialogHeader><DialogFooter><Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>Avbryt</Button><Button variant="destructive" onClick={handleDelete}><Trash2 className="mr-2 h-4 w-4" />Ta bort</Button></DialogFooter></DialogContent></Dialog>
    </>
  )
}
