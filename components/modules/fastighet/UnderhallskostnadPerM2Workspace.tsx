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
import { Plus, Pencil, Trash2, Loader2, Wrench } from 'lucide-react'

interface ModuleWorkspaceProps { module: { slug: string; name: string; cat: string; desc: string; longDesc: string }; sectorSlug: string; settingsHref: string }
interface MaintenanceCostEntry { id: string; property: string; period: string; area: number; planedMaintenance: number; unplanedMaintenance: number; improvementCost: number }
function fmt(n: number): string { return new Intl.NumberFormat('sv-SE', { maximumFractionDigits: 0 }).format(n) }
function fmtDec(n: number): string { return new Intl.NumberFormat('sv-SE', { maximumFractionDigits: 1 }).format(n) }
const EMPTY_FORM = { property: '', period: '', area: 0, planedMaintenance: 0, unplanedMaintenance: 0, improvementCost: 0 }

export function UnderhallskostnadPerM2Workspace({ module: mod, sectorSlug, settingsHref }: ModuleWorkspaceProps) {
  const supabase = createClient()
  const [loading, setLoading] = useState(true); const [saving, setSaving] = useState(false); const [entries, setEntries] = useState<MaintenanceCostEntry[]>([]); const [dialogOpen, setDialogOpen] = useState(false); const [editing, setEditing] = useState<MaintenanceCostEntry | null>(null); const [form, setForm] = useState(EMPTY_FORM); const [deleteDialogOpen, setDeleteDialogOpen] = useState(false); const [toDelete, setToDelete] = useState<MaintenanceCostEntry | null>(null)

  const saveItems = useCallback(async (items: MaintenanceCostEntry[]) => { setSaving(true); const { data: { user } } = await supabase.auth.getUser(); if (!user) { setSaving(false); return }; await supabase.from('module_configs').upsert({ user_id: user.id, sector_slug: sectorSlug, module_slug: mod.slug, config_key: 'maintenance_cost_entries', config_value: items }, { onConflict: 'user_id,sector_slug,module_slug,config_key' }); setSaving(false) }, [supabase, sectorSlug, mod.slug])
  const fetchData = useCallback(async () => { setLoading(true); const { data: { user } } = await supabase.auth.getUser(); if (!user) { setLoading(false); return }; const { data } = await supabase.from('module_configs').select('config_value').eq('user_id', user.id).eq('sector_slug', sectorSlug).eq('module_slug', mod.slug).eq('config_key', 'maintenance_cost_entries').maybeSingle(); if (data?.config_value && Array.isArray(data.config_value)) setEntries(data.config_value as MaintenanceCostEntry[]); setLoading(false) }, [supabase, sectorSlug, mod.slug])
  useEffect(() => { fetchData() }, [fetchData])

  const totalArea = entries.reduce((s, e) => s + e.area, 0)
  const totalMaintenance = entries.reduce((s, e) => s + e.planedMaintenance + e.unplanedMaintenance, 0)
  const costPerM2 = totalArea > 0 ? totalMaintenance / totalArea : 0
  const totalImprovement = entries.reduce((s, e) => s + e.improvementCost, 0)

  function openNew() { setEditing(null); setForm({ ...EMPTY_FORM }); setDialogOpen(true) }
  function openEdit(e: MaintenanceCostEntry) { setEditing(e); setForm({ property: e.property, period: e.period, area: e.area, planedMaintenance: e.planedMaintenance, unplanedMaintenance: e.unplanedMaintenance, improvementCost: e.improvementCost }); setDialogOpen(true) }
  async function handleSave() { const item: MaintenanceCostEntry = { id: editing?.id ?? crypto.randomUUID(), ...form, property: form.property.trim() }; const updated = editing ? entries.map(e => e.id === editing.id ? item : e) : [...entries, item]; setEntries(updated); setDialogOpen(false); await saveItems(updated) }
  async function handleDelete() { if (!toDelete) return; const updated = entries.filter(e => e.id !== toDelete.id); setEntries(updated); setDeleteDialogOpen(false); setToDelete(null); await saveItems(updated) }

  return (
    <>
      <ModuleWorkspaceShell title={mod.name} description={mod.desc} category="rapport" sectorName="Fastighet" backHref={`/m/${sectorSlug}`} settingsHref={settingsHref} actions={<Button onClick={openNew}><Plus className="mr-2 h-4 w-4" />Ny post</Button>}>
        <Tabs defaultValue="oversikt" className="space-y-6">
          <TabsList><TabsTrigger value="oversikt">Översikt</TabsTrigger><TabsTrigger value="detaljer">Per fastighet</TabsTrigger></TabsList>
          <TabsContent value="oversikt" className="space-y-6">
            {loading ? <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div> : entries.length === 0 ? <EmptyModuleState icon={Wrench} title="Inga underhållskostnader" description="Analysera underhållskostnad per m² med uppdelning planerat/oplanerat." actionLabel="Ny post" onAction={openNew} /> : (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"><KPICard label="Kostnad/m²" value={fmtDec(costPerM2)} unit="kr" /><KPICard label="Total underhåll" value={fmt(totalMaintenance)} unit="kr" /><KPICard label="Förbättringar" value={fmt(totalImprovement)} unit="kr" /><KPICard label="Total yta" value={fmt(totalArea)} unit="m²" /></div>
            )}
          </TabsContent>
          <TabsContent value="detaljer" className="space-y-4">
            {entries.length > 0 && <div className="rounded-xl border border-border overflow-hidden"><table className="w-full text-sm"><thead><tr className="bg-muted/50 border-b"><th className="text-left px-4 py-3 font-medium text-muted-foreground">Fastighet</th><th className="text-left px-4 py-3 font-medium text-muted-foreground">Period</th><th className="text-right px-4 py-3 font-medium text-muted-foreground">Yta m²</th><th className="text-right px-4 py-3 font-medium text-muted-foreground">Planerat</th><th className="text-right px-4 py-3 font-medium text-muted-foreground">Oplanerat</th><th className="text-right px-4 py-3 font-medium text-muted-foreground">Förbättring</th><th className="text-right px-4 py-3 font-medium text-muted-foreground">kr/m²</th><th className="text-right px-4 py-3 font-medium text-muted-foreground">Åtgärder</th></tr></thead><tbody>{entries.map(e => { const total = e.planedMaintenance + e.unplanedMaintenance; const perM2 = e.area > 0 ? total / e.area : 0; return <tr key={e.id} className="border-b last:border-0"><td className="px-4 py-3 font-medium">{e.property}</td><td className="px-4 py-3">{e.period}</td><td className="px-4 py-3 text-right tabular-nums">{fmt(e.area)}</td><td className="px-4 py-3 text-right tabular-nums">{fmt(e.planedMaintenance)}</td><td className="px-4 py-3 text-right tabular-nums">{fmt(e.unplanedMaintenance)}</td><td className="px-4 py-3 text-right tabular-nums">{fmt(e.improvementCost)}</td><td className="px-4 py-3 text-right tabular-nums font-medium">{fmtDec(perM2)}</td><td className="px-4 py-3 text-right"><div className="flex items-center justify-end gap-1"><Button variant="ghost" size="icon" onClick={() => openEdit(e)}><Pencil className="h-4 w-4" /></Button><Button variant="ghost" size="icon" className="text-red-600" onClick={() => { setToDelete(e); setDeleteDialogOpen(true) }}><Trash2 className="h-4 w-4" /></Button></div></td></tr> })}</tbody></table></div>}
            {saving && <div className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" />Sparar...</div>}
          </TabsContent>
        </Tabs>
      </ModuleWorkspaceShell>
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}><DialogContent className="max-w-md"><DialogHeader><DialogTitle>{editing ? 'Redigera' : 'Ny underhållspost'}</DialogTitle><DialogDescription>Registrera underhållskostnader per fastighet.</DialogDescription></DialogHeader><div className="grid gap-4 py-2"><div className="grid grid-cols-2 gap-4"><div className="grid gap-2"><Label>Fastighet *</Label><Input value={form.property} onChange={e => setForm(f => ({ ...f, property: e.target.value }))} /></div><div className="grid gap-2"><Label>Period</Label><Input value={form.period} onChange={e => setForm(f => ({ ...f, period: e.target.value }))} placeholder="t.ex. 2024" /></div></div><div className="grid grid-cols-2 gap-4"><div className="grid gap-2"><Label>Yta (m²)</Label><Input type="number" min={0} value={form.area} onChange={e => setForm(f => ({ ...f, area: parseFloat(e.target.value) || 0 }))} /></div><div className="grid gap-2"><Label>Planerat underhåll (kr)</Label><Input type="number" min={0} value={form.planedMaintenance} onChange={e => setForm(f => ({ ...f, planedMaintenance: parseFloat(e.target.value) || 0 }))} /></div></div><div className="grid grid-cols-2 gap-4"><div className="grid gap-2"><Label>Oplanerat underhåll (kr)</Label><Input type="number" min={0} value={form.unplanedMaintenance} onChange={e => setForm(f => ({ ...f, unplanedMaintenance: parseFloat(e.target.value) || 0 }))} /></div><div className="grid gap-2"><Label>Förbättringar (kr)</Label><Input type="number" min={0} value={form.improvementCost} onChange={e => setForm(f => ({ ...f, improvementCost: parseFloat(e.target.value) || 0 }))} /></div></div></div><DialogFooter><Button variant="outline" onClick={() => setDialogOpen(false)}>Avbryt</Button><Button onClick={handleSave} disabled={!form.property.trim()}>{editing ? 'Uppdatera' : 'Skapa'}</Button></DialogFooter></DialogContent></Dialog>
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}><DialogContent className="max-w-sm"><DialogHeader><DialogTitle>Ta bort</DialogTitle><DialogDescription>Är du säker?</DialogDescription></DialogHeader><DialogFooter><Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>Avbryt</Button><Button variant="destructive" onClick={handleDelete}><Trash2 className="mr-2 h-4 w-4" />Ta bort</Button></DialogFooter></DialogContent></Dialog>
    </>
  )
}
