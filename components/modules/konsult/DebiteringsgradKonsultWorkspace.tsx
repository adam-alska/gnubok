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
import { Plus, Pencil, Trash2, Loader2, Target, Save } from 'lucide-react'
import { Badge } from '@/components/ui/badge'

interface ModuleWorkspaceProps { module: { slug: string; name: string; cat: string; desc: string; longDesc: string }; sectorSlug: string; settingsHref: string }

interface UtilizationRecord { id: string; consultant: string; period: string; billableHours: number; totalHours: number; utilizationPct: number }

function fmtPct(n: number): string { return isFinite(n) ? n.toFixed(1) : '0.0' }

const EMPTY_FORM = { consultant: '', period: '', billableHours: 0, totalHours: 0 }

export function DebiteringsgradKonsultWorkspace({ module: mod, sectorSlug, settingsHref }: ModuleWorkspaceProps) {
  const supabase = createClient()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [records, setRecords] = useState<UtilizationRecord[]>([])
  const [target, setTarget] = useState(75)
  const [targetInput, setTargetInput] = useState('75')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingRecord, setEditingRecord] = useState<UtilizationRecord | null>(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [recordToDelete, setRecordToDelete] = useState<UtilizationRecord | null>(null)

  const saveRecords = useCallback(async (r: UtilizationRecord[]) => {
    setSaving(true); const { data: { user } } = await supabase.auth.getUser(); if (!user) { setSaving(false); return }
    await supabase.from('module_configs').upsert({ user_id: user.id, sector_slug: sectorSlug, module_slug: mod.slug, config_key: 'utilization_records', config_value: r }, { onConflict: 'user_id,sector_slug,module_slug,config_key' }); setSaving(false)
  }, [supabase, sectorSlug, mod.slug])

  const fetchData = useCallback(async () => {
    setLoading(true); const { data: { user } } = await supabase.auth.getUser(); if (!user) { setLoading(false); return }
    const { data } = await supabase.from('module_configs').select('config_value').eq('user_id', user.id).eq('sector_slug', sectorSlug).eq('module_slug', mod.slug).eq('config_key', 'utilization_records').maybeSingle()
    if (data?.config_value && Array.isArray(data.config_value)) setRecords(data.config_value as UtilizationRecord[])
    const { data: tData } = await supabase.from('module_configs').select('config_value').eq('user_id', user.id).eq('sector_slug', sectorSlug).eq('module_slug', mod.slug).eq('config_key', 'utilization_target').maybeSingle()
    if (tData?.config_value) { setTarget(Number(tData.config_value)); setTargetInput(String(tData.config_value)) }
    setLoading(false)
  }, [supabase, sectorSlug, mod.slug])

  useEffect(() => { fetchData() }, [fetchData])

  const totalBillable = records.reduce((s, r) => s + r.billableHours, 0)
  const totalHours = records.reduce((s, r) => s + r.totalHours, 0)
  const avgUtilization = totalHours > 0 ? (totalBillable / totalHours) * 100 : 0

  function openNew() { setEditingRecord(null); setForm({ ...EMPTY_FORM, period: new Date().toISOString().slice(0, 7) }); setDialogOpen(true) }
  function openEdit(r: UtilizationRecord) { setEditingRecord(r); setForm({ consultant: r.consultant, period: r.period, billableHours: r.billableHours, totalHours: r.totalHours }); setDialogOpen(true) }

  async function handleSave() {
    const pct = form.totalHours > 0 ? (form.billableHours / form.totalHours) * 100 : 0
    const newRecord: UtilizationRecord = { id: editingRecord?.id ?? crypto.randomUUID(), consultant: form.consultant.trim(), period: form.period, billableHours: form.billableHours, totalHours: form.totalHours, utilizationPct: pct }
    const updated = editingRecord ? records.map(r => r.id === editingRecord.id ? newRecord : r) : [...records, newRecord]
    setRecords(updated); setDialogOpen(false); await saveRecords(updated)
  }

  async function handleDelete() { if (!recordToDelete) return; const updated = records.filter(r => r.id !== recordToDelete.id); setRecords(updated); setDeleteDialogOpen(false); setRecordToDelete(null); await saveRecords(updated) }

  async function handleSaveTarget() {
    const val = parseFloat(targetInput); if (isNaN(val)) return
    const { data: { user } } = await supabase.auth.getUser(); if (!user) return
    await supabase.from('module_configs').upsert({ user_id: user.id, sector_slug: sectorSlug, module_slug: mod.slug, config_key: 'utilization_target', config_value: val }, { onConflict: 'user_id,sector_slug,module_slug,config_key' }); setTarget(val)
  }

  return (
    <>
      <ModuleWorkspaceShell title={mod.name} description={mod.desc} category="rapport" sectorName="Konsult" backHref={`/m/${sectorSlug}`} settingsHref={settingsHref} actions={<Button onClick={openNew}><Plus className="mr-2 h-4 w-4" />Ny post</Button>}>
        <Tabs defaultValue="oversikt" className="space-y-6">
          <TabsList><TabsTrigger value="oversikt">Översikt</TabsTrigger><TabsTrigger value="detaljer">Detaljer</TabsTrigger><TabsTrigger value="installningar">Inställningar</TabsTrigger></TabsList>
          <TabsContent value="oversikt" className="space-y-6">
            {loading ? <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div> : records.length === 0 ? <EmptyModuleState icon={Target} title="Ingen debiteringsdata" description="Registrera debiteringsbara och totala timmar per konsult och period." actionLabel="Ny post" onAction={openNew} /> : (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <KPICard label="Debiteringsgrad" value={fmtPct(avgUtilization)} unit="%" target={target} trend={avgUtilization >= target ? 'up' : 'down'} />
                <KPICard label="Mål" value={fmtPct(target)} unit="%" />
                <KPICard label="Debiteringsbara timmar" value={String(totalBillable)} unit="h" />
                <KPICard label="Totala timmar" value={String(totalHours)} unit="h" />
              </div>
            )}
          </TabsContent>
          <TabsContent value="detaljer" className="space-y-4">
            {loading ? <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div> : records.length === 0 ? <EmptyModuleState icon={Target} title="Inga poster" description="Lägg till debiteringsdata." actionLabel="Ny post" onAction={openNew} /> : (
              <div className="rounded-xl border border-border overflow-hidden"><table className="w-full text-sm"><thead><tr className="bg-muted/50 border-b border-border"><th className="text-left px-4 py-3 font-medium text-muted-foreground">Konsult</th><th className="text-left px-4 py-3 font-medium text-muted-foreground">Period</th><th className="text-right px-4 py-3 font-medium text-muted-foreground">Debiteringsb.</th><th className="text-right px-4 py-3 font-medium text-muted-foreground">Totalt</th><th className="text-right px-4 py-3 font-medium text-muted-foreground">Grad %</th><th className="text-right px-4 py-3 font-medium text-muted-foreground">Åtgärder</th></tr></thead><tbody>
                {records.sort((a, b) => b.period.localeCompare(a.period)).map(r => (<tr key={r.id} className="border-b border-border last:border-0"><td className="px-4 py-3 font-medium">{r.consultant}</td><td className="px-4 py-3">{r.period}</td><td className="px-4 py-3 text-right tabular-nums">{r.billableHours}h</td><td className="px-4 py-3 text-right tabular-nums">{r.totalHours}h</td><td className="px-4 py-3 text-right"><Badge variant="secondary" className={r.utilizationPct >= target ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'}>{fmtPct(r.utilizationPct)}%</Badge></td><td className="px-4 py-3 text-right"><div className="flex items-center justify-end gap-1"><Button variant="ghost" size="icon" onClick={() => openEdit(r)}><Pencil className="h-4 w-4" /></Button><Button variant="ghost" size="icon" className="text-red-600 hover:text-red-700" onClick={() => { setRecordToDelete(r); setDeleteDialogOpen(true) }}><Trash2 className="h-4 w-4" /></Button></div></td></tr>))}
              </tbody></table></div>
            )}
          </TabsContent>
          <TabsContent value="installningar" className="space-y-6">
            <div className="rounded-xl border border-border bg-card p-6 max-w-md space-y-4">
              <h3 className="text-sm font-semibold">Mål debiteringsgrad</h3>
              <p className="text-xs text-muted-foreground">Ange målvärde för debiteringsgrad i procent. Typiskt 70-85%.</p>
              <div className="flex items-end gap-3"><div className="space-y-1.5"><Label className="text-xs">Mål (%)</Label><Input type="number" step="0.1" min={0} max={100} value={targetInput} onChange={e => setTargetInput(e.target.value)} className="h-9 w-32" /></div><Button size="sm" onClick={handleSaveTarget}><Save className="mr-2 h-3.5 w-3.5" />Spara</Button></div>
            </div>
          </TabsContent>
        </Tabs>
      </ModuleWorkspaceShell>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}><DialogContent className="max-w-md"><DialogHeader><DialogTitle>{editingRecord ? 'Redigera post' : 'Ny debiteringspost'}</DialogTitle><DialogDescription>Ange timmar per konsult och period.</DialogDescription></DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="grid grid-cols-2 gap-4"><div className="grid gap-2"><Label>Konsult *</Label><Input value={form.consultant} onChange={e => setForm(f => ({ ...f, consultant: e.target.value }))} /></div><div className="grid gap-2"><Label>Period *</Label><Input type="month" value={form.period} onChange={e => setForm(f => ({ ...f, period: e.target.value }))} /></div></div>
          <div className="grid grid-cols-2 gap-4"><div className="grid gap-2"><Label>Debiteringsbara timmar</Label><Input type="number" min={0} value={form.billableHours} onChange={e => setForm(f => ({ ...f, billableHours: parseFloat(e.target.value) || 0 }))} /></div><div className="grid gap-2"><Label>Totala timmar</Label><Input type="number" min={0} value={form.totalHours} onChange={e => setForm(f => ({ ...f, totalHours: parseFloat(e.target.value) || 0 }))} /></div></div>
          {form.totalHours > 0 && <div className="rounded-lg border bg-muted/30 px-4 py-3 text-sm">Debiteringsgrad: <span className="font-semibold">{fmtPct((form.billableHours / form.totalHours) * 100)}%</span></div>}
        </div>
        <DialogFooter><Button variant="outline" onClick={() => setDialogOpen(false)}>Avbryt</Button><Button onClick={handleSave} disabled={!form.consultant.trim() || !form.period}>{editingRecord ? 'Uppdatera' : 'Skapa'}</Button></DialogFooter></DialogContent></Dialog>

      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}><DialogContent className="max-w-sm"><DialogHeader><DialogTitle>Ta bort post</DialogTitle><DialogDescription>Är du säker?</DialogDescription></DialogHeader><DialogFooter><Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>Avbryt</Button><Button variant="destructive" onClick={handleDelete}><Trash2 className="mr-2 h-4 w-4" />Ta bort</Button></DialogFooter></DialogContent></Dialog>
    </>
  )
}
