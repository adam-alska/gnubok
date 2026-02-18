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
import { Plus, Pencil, Trash2, Loader2, Building } from 'lucide-react'
import { Badge } from '@/components/ui/badge'

interface ModuleWorkspaceProps { module: { slug: string; name: string; cat: string; desc: string; longDesc: string }; sectorSlug: string; settingsHref: string }
type DepMethod = 'K2 Linjär' | 'K3 Komponent'
interface DepreciationEntry { id: string; property: string; component: string; acquisitionDate: string; acquisitionCost: number; residualValue: number; usefulLife: number; method: DepMethod; accDepreciation: number }
function fmt(n: number): string { return new Intl.NumberFormat('sv-SE', { maximumFractionDigits: 0 }).format(n) }
const METHODS: DepMethod[] = ['K2 Linjär', 'K3 Komponent']
const EMPTY_FORM = { property: '', component: '', acquisitionDate: '', acquisitionCost: 0, residualValue: 0, usefulLife: 50, method: 'K2 Linjär' as DepMethod, accDepreciation: 0 }

export function FastighetsavskrivningWorkspace({ module: mod, sectorSlug, settingsHref }: ModuleWorkspaceProps) {
  const supabase = createClient()
  const [loading, setLoading] = useState(true); const [saving, setSaving] = useState(false); const [entries, setEntries] = useState<DepreciationEntry[]>([]); const [dialogOpen, setDialogOpen] = useState(false); const [editing, setEditing] = useState<DepreciationEntry | null>(null); const [form, setForm] = useState(EMPTY_FORM); const [deleteDialogOpen, setDeleteDialogOpen] = useState(false); const [toDelete, setToDelete] = useState<DepreciationEntry | null>(null)

  const saveItems = useCallback(async (items: DepreciationEntry[]) => { setSaving(true); const { data: { user } } = await supabase.auth.getUser(); if (!user) { setSaving(false); return }; await supabase.from('module_configs').upsert({ user_id: user.id, sector_slug: sectorSlug, module_slug: mod.slug, config_key: 'depreciation_entries', config_value: items }, { onConflict: 'user_id,sector_slug,module_slug,config_key' }); setSaving(false) }, [supabase, sectorSlug, mod.slug])
  const fetchData = useCallback(async () => { setLoading(true); const { data: { user } } = await supabase.auth.getUser(); if (!user) { setLoading(false); return }; const { data } = await supabase.from('module_configs').select('config_value').eq('user_id', user.id).eq('sector_slug', sectorSlug).eq('module_slug', mod.slug).eq('config_key', 'depreciation_entries').maybeSingle(); if (data?.config_value && Array.isArray(data.config_value)) setEntries(data.config_value as DepreciationEntry[]); setLoading(false) }, [supabase, sectorSlug, mod.slug])
  useEffect(() => { fetchData() }, [fetchData])

  const totalCost = entries.reduce((s, e) => s + e.acquisitionCost, 0)
  const totalAccDep = entries.reduce((s, e) => s + e.accDepreciation, 0)
  const totalBookValue = totalCost - totalAccDep
  const totalAnnualDep = entries.reduce((s, e) => { const depBase = e.acquisitionCost - e.residualValue; return s + depBase / e.usefulLife }, 0)

  function openNew() { setEditing(null); setForm({ ...EMPTY_FORM }); setDialogOpen(true) }
  function openEdit(e: DepreciationEntry) { setEditing(e); setForm({ property: e.property, component: e.component, acquisitionDate: e.acquisitionDate, acquisitionCost: e.acquisitionCost, residualValue: e.residualValue, usefulLife: e.usefulLife, method: e.method, accDepreciation: e.accDepreciation }); setDialogOpen(true) }
  async function handleSave() { const item: DepreciationEntry = { id: editing?.id ?? crypto.randomUUID(), ...form, property: form.property.trim(), component: form.component.trim() }; const updated = editing ? entries.map(e => e.id === editing.id ? item : e) : [...entries, item]; setEntries(updated); setDialogOpen(false); await saveItems(updated) }
  async function handleDelete() { if (!toDelete) return; const updated = entries.filter(e => e.id !== toDelete.id); setEntries(updated); setDeleteDialogOpen(false); setToDelete(null); await saveItems(updated) }

  return (
    <>
      <ModuleWorkspaceShell title={mod.name} description={mod.desc} category="bokforing" sectorName="Fastighet" backHref={`/m/${sectorSlug}`} settingsHref={settingsHref} actions={<Button onClick={openNew}><Plus className="mr-2 h-4 w-4" />Ny post</Button>}>
        <Tabs defaultValue="oversikt" className="space-y-6">
          <TabsList><TabsTrigger value="oversikt">Översikt</TabsTrigger><TabsTrigger value="poster">Poster</TabsTrigger></TabsList>
          <TabsContent value="oversikt" className="space-y-6">
            {loading ? <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div> : entries.length === 0 ? <EmptyModuleState icon={Building} title="Inga avskrivningsposter" description="K2 linjär eller K3 komponentavskrivning. Konto 1119 (ack. avskrivning) och 7820 (avskrivningskostnad)." actionLabel="Ny post" onAction={openNew} /> : (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"><KPICard label="Anskaffningsvärde" value={fmt(totalCost)} unit="kr" /><KPICard label="Ack. avskrivning (1119)" value={fmt(totalAccDep)} unit="kr" /><KPICard label="Bokfört värde" value={fmt(totalBookValue)} unit="kr" /><KPICard label="Årlig avskrivning (7820)" value={fmt(totalAnnualDep)} unit="kr" /></div>
            )}
          </TabsContent>
          <TabsContent value="poster" className="space-y-4">
            {entries.length > 0 && <div className="rounded-xl border border-border overflow-hidden"><table className="w-full text-sm"><thead><tr className="bg-muted/50 border-b"><th className="text-left px-4 py-3 font-medium text-muted-foreground">Fastighet</th><th className="text-left px-4 py-3 font-medium text-muted-foreground">Komponent</th><th className="text-left px-4 py-3 font-medium text-muted-foreground">Metod</th><th className="text-right px-4 py-3 font-medium text-muted-foreground">Anskaff.</th><th className="text-right px-4 py-3 font-medium text-muted-foreground">Livslängd</th><th className="text-right px-4 py-3 font-medium text-muted-foreground">Ack. avskr.</th><th className="text-right px-4 py-3 font-medium text-muted-foreground">Bokfört</th><th className="text-right px-4 py-3 font-medium text-muted-foreground">Åtgärder</th></tr></thead><tbody>{entries.map(e => { const bookValue = e.acquisitionCost - e.accDepreciation; const annDep = (e.acquisitionCost - e.residualValue) / e.usefulLife; return <tr key={e.id} className="border-b last:border-0"><td className="px-4 py-3 font-medium">{e.property}</td><td className="px-4 py-3">{e.component || '-'}</td><td className="px-4 py-3"><Badge variant="outline">{e.method}</Badge></td><td className="px-4 py-3 text-right tabular-nums">{fmt(e.acquisitionCost)}</td><td className="px-4 py-3 text-right tabular-nums">{e.usefulLife} år</td><td className="px-4 py-3 text-right tabular-nums">{fmt(e.accDepreciation)}</td><td className="px-4 py-3 text-right tabular-nums font-medium">{fmt(bookValue)}</td><td className="px-4 py-3 text-right"><div className="flex items-center justify-end gap-1"><Button variant="ghost" size="icon" onClick={() => openEdit(e)}><Pencil className="h-4 w-4" /></Button><Button variant="ghost" size="icon" className="text-red-600" onClick={() => { setToDelete(e); setDeleteDialogOpen(true) }}><Trash2 className="h-4 w-4" /></Button></div></td></tr> })}</tbody></table></div>}
            {saving && <div className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" />Sparar...</div>}
          </TabsContent>
        </Tabs>
      </ModuleWorkspaceShell>
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}><DialogContent className="max-w-md"><DialogHeader><DialogTitle>{editing ? 'Redigera' : 'Ny avskrivning'}</DialogTitle><DialogDescription>Ange fastighetsavskrivning K2/K3.</DialogDescription></DialogHeader><div className="grid gap-4 py-2"><div className="grid grid-cols-2 gap-4"><div className="grid gap-2"><Label>Fastighet *</Label><Input value={form.property} onChange={e => setForm(f => ({ ...f, property: e.target.value }))} /></div><div className="grid gap-2"><Label>Komponent (K3)</Label><Input value={form.component} onChange={e => setForm(f => ({ ...f, component: e.target.value }))} placeholder="t.ex. Stomme, Tak, VVS" /></div></div><div className="grid grid-cols-2 gap-4"><div className="grid gap-2"><Label>Metod</Label><Select value={form.method} onValueChange={val => setForm(f => ({ ...f, method: val as DepMethod }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{METHODS.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent></Select></div><div className="grid gap-2"><Label>Anskaffningsdatum</Label><Input type="date" value={form.acquisitionDate} onChange={e => setForm(f => ({ ...f, acquisitionDate: e.target.value }))} /></div></div><div className="grid grid-cols-3 gap-4"><div className="grid gap-2"><Label>Anskaff.värde (kr)</Label><Input type="number" min={0} value={form.acquisitionCost} onChange={e => setForm(f => ({ ...f, acquisitionCost: parseFloat(e.target.value) || 0 }))} /></div><div className="grid gap-2"><Label>Restvärde (kr)</Label><Input type="number" min={0} value={form.residualValue} onChange={e => setForm(f => ({ ...f, residualValue: parseFloat(e.target.value) || 0 }))} /></div><div className="grid gap-2"><Label>Livslängd (år)</Label><Input type="number" min={1} value={form.usefulLife} onChange={e => setForm(f => ({ ...f, usefulLife: parseInt(e.target.value) || 1 }))} /></div></div><div className="grid gap-2"><Label>Ack. avskrivning (kr)</Label><Input type="number" min={0} value={form.accDepreciation} onChange={e => setForm(f => ({ ...f, accDepreciation: parseFloat(e.target.value) || 0 }))} /></div>{form.acquisitionCost > 0 && <div className="rounded-lg border bg-muted/30 px-4 py-3 text-sm">Årlig avskrivning: <span className="font-semibold">{fmt((form.acquisitionCost - form.residualValue) / form.usefulLife)} kr</span> | Månad: <span className="font-semibold">{fmt((form.acquisitionCost - form.residualValue) / form.usefulLife / 12)} kr</span></div>}</div><DialogFooter><Button variant="outline" onClick={() => setDialogOpen(false)}>Avbryt</Button><Button onClick={handleSave} disabled={!form.property.trim()}>{editing ? 'Uppdatera' : 'Skapa'}</Button></DialogFooter></DialogContent></Dialog>
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}><DialogContent className="max-w-sm"><DialogHeader><DialogTitle>Ta bort</DialogTitle><DialogDescription>Är du säker?</DialogDescription></DialogHeader><DialogFooter><Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>Avbryt</Button><Button variant="destructive" onClick={handleDelete}><Trash2 className="mr-2 h-4 w-4" />Ta bort</Button></DialogFooter></DialogContent></Dialog>
    </>
  )
}
