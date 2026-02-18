'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { ModuleWorkspaceShell } from '@/components/modules/ModuleWorkspaceShell'
import { KPICard } from '@/components/modules/shared/KPICard'
import { EmptyModuleState } from '@/components/modules/shared/EmptyModuleState'
import { DateRangeFilter } from '@/components/modules/shared/DateRangeFilter'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog'
import { Plus, Pencil, Trash2, Loader2, Building2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'

interface ModuleWorkspaceProps { module: { slug: string; name: string; cat: string; desc: string; longDesc: string }; sectorSlug: string; settingsHref: string }
interface NoiEntry { id: string; property: string; period: string; rentalIncome: number; otherIncome: number; operatingCosts: number; maintenanceCosts: number; propertyTax: number }
function fmt(n: number): string { return new Intl.NumberFormat('sv-SE', { maximumFractionDigits: 0 }).format(n) }
function fmtPct(n: number): string { return new Intl.NumberFormat('sv-SE', { maximumFractionDigits: 1 }).format(n) }
const EMPTY_FORM = { property: '', period: '', rentalIncome: 0, otherIncome: 0, operatingCosts: 0, maintenanceCosts: 0, propertyTax: 0 }

export function DriftnettoPerFastighetWorkspace({ module: mod, sectorSlug, settingsHref }: ModuleWorkspaceProps) {
  const supabase = createClient()
  const [loading, setLoading] = useState(true); const [saving, setSaving] = useState(false); const [entries, setEntries] = useState<NoiEntry[]>([]); const [dialogOpen, setDialogOpen] = useState(false); const [editing, setEditing] = useState<NoiEntry | null>(null); const [form, setForm] = useState(EMPTY_FORM); const [deleteDialogOpen, setDeleteDialogOpen] = useState(false); const [toDelete, setToDelete] = useState<NoiEntry | null>(null)

  const saveItems = useCallback(async (items: NoiEntry[]) => { setSaving(true); const { data: { user } } = await supabase.auth.getUser(); if (!user) { setSaving(false); return }; await supabase.from('module_configs').upsert({ user_id: user.id, sector_slug: sectorSlug, module_slug: mod.slug, config_key: 'noi_entries', config_value: items }, { onConflict: 'user_id,sector_slug,module_slug,config_key' }); setSaving(false) }, [supabase, sectorSlug, mod.slug])
  const fetchData = useCallback(async () => { setLoading(true); const { data: { user } } = await supabase.auth.getUser(); if (!user) { setLoading(false); return }; const { data } = await supabase.from('module_configs').select('config_value').eq('user_id', user.id).eq('sector_slug', sectorSlug).eq('module_slug', mod.slug).eq('config_key', 'noi_entries').maybeSingle(); if (data?.config_value && Array.isArray(data.config_value)) setEntries(data.config_value as NoiEntry[]); setLoading(false) }, [supabase, sectorSlug, mod.slug])
  useEffect(() => { fetchData() }, [fetchData])

  const totalIncome = entries.reduce((s, e) => s + e.rentalIncome + e.otherIncome, 0)
  const totalCosts = entries.reduce((s, e) => s + e.operatingCosts + e.maintenanceCosts + e.propertyTax, 0)
  const totalNoi = totalIncome - totalCosts
  const noiMargin = totalIncome > 0 ? (totalNoi / totalIncome) * 100 : 0

  function openNew() { setEditing(null); setForm({ ...EMPTY_FORM }); setDialogOpen(true) }
  function openEdit(e: NoiEntry) { setEditing(e); setForm({ property: e.property, period: e.period, rentalIncome: e.rentalIncome, otherIncome: e.otherIncome, operatingCosts: e.operatingCosts, maintenanceCosts: e.maintenanceCosts, propertyTax: e.propertyTax }); setDialogOpen(true) }
  async function handleSave() { const item: NoiEntry = { id: editing?.id ?? crypto.randomUUID(), ...form, property: form.property.trim() }; const updated = editing ? entries.map(e => e.id === editing.id ? item : e) : [...entries, item]; setEntries(updated); setDialogOpen(false); await saveItems(updated) }
  async function handleDelete() { if (!toDelete) return; const updated = entries.filter(e => e.id !== toDelete.id); setEntries(updated); setDeleteDialogOpen(false); setToDelete(null); await saveItems(updated) }

  return (
    <>
      <ModuleWorkspaceShell title={mod.name} description={mod.desc} category="rapport" sectorName="Fastighet" backHref={`/m/${sectorSlug}`} settingsHref={settingsHref} actions={<Button onClick={openNew}><Plus className="mr-2 h-4 w-4" />Ny post</Button>}>
        <Tabs defaultValue="oversikt" className="space-y-6">
          <TabsList><TabsTrigger value="oversikt">Översikt</TabsTrigger><TabsTrigger value="detaljer">Per fastighet</TabsTrigger></TabsList>
          <TabsContent value="oversikt" className="space-y-6">
            {loading ? <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div> : entries.length === 0 ? <EmptyModuleState icon={Building2} title="Inga driftnettoposter" description="Beräkna driftnetto (NOI) per fastighet: hyresintäkter minus driftkostnader." actionLabel="Ny post" onAction={openNew} /> : (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"><KPICard label="Totala intäkter" value={fmt(totalIncome)} unit="kr" /><KPICard label="Totala kostnader" value={fmt(totalCosts)} unit="kr" /><KPICard label="Driftnetto (NOI)" value={fmt(totalNoi)} unit="kr" /><KPICard label="NOI-marginal" value={fmtPct(noiMargin)} unit="%" /></div>
            )}
          </TabsContent>
          <TabsContent value="detaljer" className="space-y-4">
            {entries.length > 0 && <div className="rounded-xl border border-border overflow-hidden"><table className="w-full text-sm"><thead><tr className="bg-muted/50 border-b"><th className="text-left px-4 py-3 font-medium text-muted-foreground">Fastighet</th><th className="text-left px-4 py-3 font-medium text-muted-foreground">Period</th><th className="text-right px-4 py-3 font-medium text-muted-foreground">Hyresint.</th><th className="text-right px-4 py-3 font-medium text-muted-foreground">Drift</th><th className="text-right px-4 py-3 font-medium text-muted-foreground">Underhåll</th><th className="text-right px-4 py-3 font-medium text-muted-foreground">Skatt</th><th className="text-right px-4 py-3 font-medium text-muted-foreground">NOI</th><th className="text-right px-4 py-3 font-medium text-muted-foreground">Marginal</th><th className="text-right px-4 py-3 font-medium text-muted-foreground">Åtgärder</th></tr></thead><tbody>{entries.map(e => { const income = e.rentalIncome + e.otherIncome; const costs = e.operatingCosts + e.maintenanceCosts + e.propertyTax; const noi = income - costs; const margin = income > 0 ? (noi / income) * 100 : 0; return <tr key={e.id} className="border-b last:border-0"><td className="px-4 py-3 font-medium">{e.property}</td><td className="px-4 py-3">{e.period}</td><td className="px-4 py-3 text-right tabular-nums">{fmt(e.rentalIncome)}</td><td className="px-4 py-3 text-right tabular-nums">{fmt(e.operatingCosts)}</td><td className="px-4 py-3 text-right tabular-nums">{fmt(e.maintenanceCosts)}</td><td className="px-4 py-3 text-right tabular-nums">{fmt(e.propertyTax)}</td><td className={`px-4 py-3 text-right tabular-nums font-medium ${noi >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>{fmt(noi)}</td><td className="px-4 py-3 text-right tabular-nums">{fmtPct(margin)}%</td><td className="px-4 py-3 text-right"><div className="flex items-center justify-end gap-1"><Button variant="ghost" size="icon" onClick={() => openEdit(e)}><Pencil className="h-4 w-4" /></Button><Button variant="ghost" size="icon" className="text-red-600" onClick={() => { setToDelete(e); setDeleteDialogOpen(true) }}><Trash2 className="h-4 w-4" /></Button></div></td></tr> })}</tbody></table></div>}
            {saving && <div className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" />Sparar...</div>}
          </TabsContent>
        </Tabs>
      </ModuleWorkspaceShell>
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}><DialogContent className="max-w-md"><DialogHeader><DialogTitle>{editing ? 'Redigera' : 'Ny driftnettopost'}</DialogTitle><DialogDescription>Ange intäkter och kostnader per fastighet.</DialogDescription></DialogHeader><div className="grid gap-4 py-2"><div className="grid grid-cols-2 gap-4"><div className="grid gap-2"><Label>Fastighet *</Label><Input value={form.property} onChange={e => setForm(f => ({ ...f, property: e.target.value }))} /></div><div className="grid gap-2"><Label>Period</Label><Input value={form.period} onChange={e => setForm(f => ({ ...f, period: e.target.value }))} placeholder="t.ex. 2024-Q3" /></div></div><div className="grid grid-cols-2 gap-4"><div className="grid gap-2"><Label>Hyresintäkter (kr)</Label><Input type="number" min={0} value={form.rentalIncome} onChange={e => setForm(f => ({ ...f, rentalIncome: parseFloat(e.target.value) || 0 }))} /></div><div className="grid gap-2"><Label>Övriga intäkter (kr)</Label><Input type="number" min={0} value={form.otherIncome} onChange={e => setForm(f => ({ ...f, otherIncome: parseFloat(e.target.value) || 0 }))} /></div></div><div className="grid grid-cols-3 gap-4"><div className="grid gap-2"><Label>Driftkostnader</Label><Input type="number" min={0} value={form.operatingCosts} onChange={e => setForm(f => ({ ...f, operatingCosts: parseFloat(e.target.value) || 0 }))} /></div><div className="grid gap-2"><Label>Underhåll</Label><Input type="number" min={0} value={form.maintenanceCosts} onChange={e => setForm(f => ({ ...f, maintenanceCosts: parseFloat(e.target.value) || 0 }))} /></div><div className="grid gap-2"><Label>Fastighetsskatt</Label><Input type="number" min={0} value={form.propertyTax} onChange={e => setForm(f => ({ ...f, propertyTax: parseFloat(e.target.value) || 0 }))} /></div></div></div><DialogFooter><Button variant="outline" onClick={() => setDialogOpen(false)}>Avbryt</Button><Button onClick={handleSave} disabled={!form.property.trim()}>{editing ? 'Uppdatera' : 'Skapa'}</Button></DialogFooter></DialogContent></Dialog>
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}><DialogContent className="max-w-sm"><DialogHeader><DialogTitle>Ta bort</DialogTitle><DialogDescription>Är du säker?</DialogDescription></DialogHeader><DialogFooter><Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>Avbryt</Button><Button variant="destructive" onClick={handleDelete}><Trash2 className="mr-2 h-4 w-4" />Ta bort</Button></DialogFooter></DialogContent></Dialog>
    </>
  )
}
