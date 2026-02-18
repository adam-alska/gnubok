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
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog'
import { Plus, Pencil, Trash2, Loader2, Recycle } from 'lucide-react'
import { Badge } from '@/components/ui/badge'

interface ModuleWorkspaceProps {
  module: { slug: string; name: string; cat: string; desc: string; longDesc: string }
  sectorSlug: string
  settingsHref: string
}

interface MaterialRecord {
  id: string
  product: string
  period: string
  bomUsage: number
  actualUsage: number
  wasteKg: number
  wastePct: number
  varianceCostKr: number
}

function fmt(n: number): string {
  return new Intl.NumberFormat('sv-SE', { maximumFractionDigits: 0 }).format(n)
}

function fmtPct(n: number): string {
  return isFinite(n) ? n.toFixed(1) : '0.0'
}

const EMPTY_FORM = {
  product: '',
  period: '',
  bomUsage: 0,
  actualUsage: 0,
  costPerUnit: 0,
}

export function MaterialeffektivitetWorkspace({ module: mod, sectorSlug, settingsHref }: ModuleWorkspaceProps) {
  const supabase = createClient()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [records, setRecords] = useState<MaterialRecord[]>([])
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingRecord, setEditingRecord] = useState<MaterialRecord | null>(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [recordToDelete, setRecordToDelete] = useState<MaterialRecord | null>(null)

  const saveRecords = useCallback(async (newRecords: MaterialRecord[]) => {
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setSaving(false); return }
    await supabase.from('module_configs').upsert(
      { user_id: user.id, sector_slug: sectorSlug, module_slug: mod.slug, config_key: 'material_records', config_value: newRecords },
      { onConflict: 'user_id,sector_slug,module_slug,config_key' }
    )
    setSaving(false)
  }, [supabase, sectorSlug, mod.slug])

  const fetchData = useCallback(async () => {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); return }
    const { data } = await supabase.from('module_configs').select('config_value')
      .eq('user_id', user.id).eq('sector_slug', sectorSlug).eq('module_slug', mod.slug)
      .eq('config_key', 'material_records').maybeSingle()
    if (data?.config_value && Array.isArray(data.config_value)) {
      setRecords(data.config_value as MaterialRecord[])
    }
    setLoading(false)
  }, [supabase, sectorSlug, mod.slug])

  useEffect(() => { fetchData() }, [fetchData])

  const totalBom = records.reduce((s, r) => s + r.bomUsage, 0)
  const totalActual = records.reduce((s, r) => s + r.actualUsage, 0)
  const totalWaste = records.reduce((s, r) => s + r.wasteKg, 0)
  const totalVarianceCost = records.reduce((s, r) => s + r.varianceCostKr, 0)
  const overallWastePct = totalActual > 0 ? (totalWaste / totalActual) * 100 : 0

  function openNew() {
    setEditingRecord(null)
    setForm({ ...EMPTY_FORM, period: new Date().toISOString().slice(0, 7) })
    setDialogOpen(true)
  }

  function openEdit(record: MaterialRecord) {
    setEditingRecord(record)
    setForm({ product: record.product, period: record.period, bomUsage: record.bomUsage, actualUsage: record.actualUsage, costPerUnit: record.actualUsage > 0 ? record.varianceCostKr / (record.actualUsage - record.bomUsage || 1) : 0 })
    setDialogOpen(true)
  }

  async function handleSave() {
    const wasteKg = Math.max(0, form.actualUsage - form.bomUsage)
    const wastePct = form.actualUsage > 0 ? (wasteKg / form.actualUsage) * 100 : 0
    const varianceCostKr = wasteKg * form.costPerUnit
    const newRecord: MaterialRecord = {
      id: editingRecord?.id ?? crypto.randomUUID(),
      product: form.product.trim(),
      period: form.period,
      bomUsage: form.bomUsage,
      actualUsage: form.actualUsage,
      wasteKg,
      wastePct,
      varianceCostKr,
    }
    const updated = editingRecord ? records.map(r => r.id === editingRecord.id ? newRecord : r) : [...records, newRecord]
    setRecords(updated)
    setDialogOpen(false)
    await saveRecords(updated)
  }

  async function handleDelete() {
    if (!recordToDelete) return
    const updated = records.filter(r => r.id !== recordToDelete.id)
    setRecords(updated)
    setDeleteDialogOpen(false)
    setRecordToDelete(null)
    await saveRecords(updated)
  }

  return (
    <>
      <ModuleWorkspaceShell
        title={mod.name} description={mod.desc} category="rapport" sectorName="Tillverkning"
        backHref={`/m/${sectorSlug}`} settingsHref={settingsHref}
        actions={<Button onClick={openNew}><Plus className="mr-2 h-4 w-4" />Ny post</Button>}
      >
        <Tabs defaultValue="oversikt" className="space-y-6">
          <TabsList>
            <TabsTrigger value="oversikt">Översikt</TabsTrigger>
            <TabsTrigger value="detaljer">Detaljer</TabsTrigger>
          </TabsList>

          <TabsContent value="oversikt" className="space-y-6">
            {loading ? (
              <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
            ) : records.length === 0 ? (
              <EmptyModuleState icon={Recycle} title="Ingen materialdata" description="Registrera verklig vs BOM-förbrukning för att analysera materialeffektivitet och spill." actionLabel="Ny post" onAction={openNew} />
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <KPICard label="Spill %" value={fmtPct(overallWastePct)} unit="%" trend={overallWastePct > 5 ? 'down' : overallWastePct < 2 ? 'up' : 'neutral'} />
                <KPICard label="Totalt spill" value={fmt(totalWaste)} unit="kg" />
                <KPICard label="Avvikelsekostnad" value={fmt(totalVarianceCost)} unit="kr" />
                <KPICard label="BOM vs Verklig" value={`${fmt(totalBom)} / ${fmt(totalActual)}`} unit="kg" />
              </div>
            )}
          </TabsContent>

          <TabsContent value="detaljer" className="space-y-4">
            {loading ? (
              <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
            ) : records.length === 0 ? (
              <EmptyModuleState icon={Recycle} title="Inga poster" description="Lägg till materialeffektivitetsdata." actionLabel="Ny post" onAction={openNew} />
            ) : (
              <div className="rounded-xl border border-border overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-muted/50 border-b border-border">
                      <th className="text-left px-4 py-3 font-medium text-muted-foreground">Produkt</th>
                      <th className="text-left px-4 py-3 font-medium text-muted-foreground">Period</th>
                      <th className="text-right px-4 py-3 font-medium text-muted-foreground">BOM (kg)</th>
                      <th className="text-right px-4 py-3 font-medium text-muted-foreground">Verklig (kg)</th>
                      <th className="text-right px-4 py-3 font-medium text-muted-foreground">Spill (kg)</th>
                      <th className="text-right px-4 py-3 font-medium text-muted-foreground">Spill %</th>
                      <th className="text-right px-4 py-3 font-medium text-muted-foreground">Kostnad (kr)</th>
                      <th className="text-right px-4 py-3 font-medium text-muted-foreground">Åtgärder</th>
                    </tr>
                  </thead>
                  <tbody>
                    {records.map(r => (
                      <tr key={r.id} className="border-b border-border last:border-0">
                        <td className="px-4 py-3 font-medium">{r.product}</td>
                        <td className="px-4 py-3">{r.period}</td>
                        <td className="px-4 py-3 text-right tabular-nums">{fmt(r.bomUsage)}</td>
                        <td className="px-4 py-3 text-right tabular-nums">{fmt(r.actualUsage)}</td>
                        <td className="px-4 py-3 text-right tabular-nums">{fmt(r.wasteKg)}</td>
                        <td className="px-4 py-3 text-right tabular-nums">
                          <Badge variant="secondary" className={r.wastePct > 5 ? 'bg-red-100 text-red-800' : 'bg-emerald-100 text-emerald-800'}>
                            {fmtPct(r.wastePct)}%
                          </Badge>
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums">{fmt(r.varianceCostKr)}</td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button variant="ghost" size="icon" onClick={() => openEdit(r)}><Pencil className="h-4 w-4" /></Button>
                            <Button variant="ghost" size="icon" className="text-red-600 hover:text-red-700" onClick={() => { setRecordToDelete(r); setDeleteDialogOpen(true) }}><Trash2 className="h-4 w-4" /></Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {saving && <div className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" />Sparar...</div>}
          </TabsContent>
        </Tabs>
      </ModuleWorkspaceShell>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingRecord ? 'Redigera post' : 'Ny materialeffektivitetspost'}</DialogTitle>
            <DialogDescription>Ange BOM-förbrukning och verklig förbrukning. Spill beräknas automatiskt.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2"><Label>Produkt *</Label><Input value={form.product} onChange={e => setForm(f => ({ ...f, product: e.target.value }))} placeholder="Produkt A" /></div>
              <div className="grid gap-2"><Label>Period *</Label><Input type="month" value={form.period} onChange={e => setForm(f => ({ ...f, period: e.target.value }))} /></div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="grid gap-2"><Label>BOM-förbrukn. (kg)</Label><Input type="number" min={0} value={form.bomUsage} onChange={e => setForm(f => ({ ...f, bomUsage: parseFloat(e.target.value) || 0 }))} /></div>
              <div className="grid gap-2"><Label>Verklig (kg)</Label><Input type="number" min={0} value={form.actualUsage} onChange={e => setForm(f => ({ ...f, actualUsage: parseFloat(e.target.value) || 0 }))} /></div>
              <div className="grid gap-2"><Label>Kostnad/kg (kr)</Label><Input type="number" min={0} step="0.01" value={form.costPerUnit} onChange={e => setForm(f => ({ ...f, costPerUnit: parseFloat(e.target.value) || 0 }))} /></div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Avbryt</Button>
            <Button onClick={handleSave} disabled={!form.product.trim() || !form.period}>{editingRecord ? 'Uppdatera' : 'Skapa'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Ta bort post</DialogTitle><DialogDescription>Är du säker på att du vill ta bort denna post?</DialogDescription></DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>Avbryt</Button>
            <Button variant="destructive" onClick={handleDelete}><Trash2 className="mr-2 h-4 w-4" />Ta bort</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
