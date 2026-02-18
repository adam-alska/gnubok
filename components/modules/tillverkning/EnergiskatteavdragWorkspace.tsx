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
import { Plus, Pencil, Trash2, Loader2, Zap, Save } from 'lucide-react'

interface ModuleWorkspaceProps {
  module: { slug: string; name: string; cat: string; desc: string; longDesc: string }
  sectorSlug: string
  settingsHref: string
}

interface EnergyRecord {
  id: string
  period: string
  consumptionKwh: number
  totalTaxKr: number
  deductionPct: number
  deductionKr: number
  applicationSent: boolean
}

function fmt(n: number): string {
  return new Intl.NumberFormat('sv-SE', { maximumFractionDigits: 0 }).format(n)
}

function fmtPct(n: number): string {
  return isFinite(n) ? n.toFixed(1) : '0.0'
}

const EMPTY_FORM = {
  period: '',
  consumptionKwh: 0,
  totalTaxKr: 0,
  deductionPct: 100,
  applicationSent: false,
}

export function EnergiskatteavdragWorkspace({ module: mod, sectorSlug, settingsHref }: ModuleWorkspaceProps) {
  const supabase = createClient()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [records, setRecords] = useState<EnergyRecord[]>([])
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingRecord, setEditingRecord] = useState<EnergyRecord | null>(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [recordToDelete, setRecordToDelete] = useState<EnergyRecord | null>(null)

  const saveRecords = useCallback(async (newRecords: EnergyRecord[]) => {
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setSaving(false); return }
    await supabase.from('module_configs').upsert(
      { user_id: user.id, sector_slug: sectorSlug, module_slug: mod.slug, config_key: 'energy_records', config_value: newRecords },
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
      .eq('config_key', 'energy_records').maybeSingle()
    if (data?.config_value && Array.isArray(data.config_value)) {
      setRecords(data.config_value as EnergyRecord[])
    }
    setLoading(false)
  }, [supabase, sectorSlug, mod.slug])

  useEffect(() => { fetchData() }, [fetchData])

  const totalTax = records.reduce((s, r) => s + r.totalTaxKr, 0)
  const totalDeduction = records.reduce((s, r) => s + r.deductionKr, 0)
  const totalConsumption = records.reduce((s, r) => s + r.consumptionKwh, 0)

  function openNew() {
    setEditingRecord(null)
    setForm({ ...EMPTY_FORM, period: new Date().toISOString().slice(0, 7) })
    setDialogOpen(true)
  }

  function openEdit(record: EnergyRecord) {
    setEditingRecord(record)
    setForm({ period: record.period, consumptionKwh: record.consumptionKwh, totalTaxKr: record.totalTaxKr, deductionPct: record.deductionPct, applicationSent: record.applicationSent })
    setDialogOpen(true)
  }

  async function handleSave() {
    const deductionKr = form.totalTaxKr * (form.deductionPct / 100)
    const newRecord: EnergyRecord = {
      id: editingRecord?.id ?? crypto.randomUUID(),
      period: form.period,
      consumptionKwh: form.consumptionKwh,
      totalTaxKr: form.totalTaxKr,
      deductionPct: form.deductionPct,
      deductionKr,
      applicationSent: form.applicationSent,
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
        title={mod.name} description={mod.desc} category="bokforing" sectorName="Tillverkning"
        backHref={`/m/${sectorSlug}`} settingsHref={settingsHref}
        actions={<Button onClick={openNew}><Plus className="mr-2 h-4 w-4" />Ny period</Button>}
      >
        <Tabs defaultValue="oversikt" className="space-y-6">
          <TabsList>
            <TabsTrigger value="oversikt">Översikt</TabsTrigger>
            <TabsTrigger value="perioder">Perioder</TabsTrigger>
          </TabsList>

          <TabsContent value="oversikt" className="space-y-6">
            {loading ? (
              <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
            ) : records.length === 0 ? (
              <EmptyModuleState icon={Zap} title="Inget energiskatteavdrag registrerat" description="Registrera energiförbrukning och skattebelopp för att beräkna avdrag för tillverkande verksamhet. Ansökan skickas till Skatteverket." actionLabel="Ny period" onAction={openNew} />
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <KPICard label="Total energiskatt" value={fmt(totalTax)} unit="kr" />
                <KPICard label="Totalt avdrag" value={fmt(totalDeduction)} unit="kr" />
                <KPICard label="Total förbrukning" value={fmt(totalConsumption)} unit="kWh" />
                <KPICard label="Snitt avdrag %" value={fmtPct(totalTax > 0 ? (totalDeduction / totalTax) * 100 : 0)} unit="%" />
              </div>
            )}
          </TabsContent>

          <TabsContent value="perioder" className="space-y-4">
            {loading ? (
              <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
            ) : records.length === 0 ? (
              <EmptyModuleState icon={Zap} title="Inga perioder" description="Lägg till energiskatteavdrag per period." actionLabel="Ny period" onAction={openNew} />
            ) : (
              <div className="rounded-xl border border-border overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-muted/50 border-b border-border">
                      <th className="text-left px-4 py-3 font-medium text-muted-foreground">Period</th>
                      <th className="text-right px-4 py-3 font-medium text-muted-foreground">Förbrukning (kWh)</th>
                      <th className="text-right px-4 py-3 font-medium text-muted-foreground">Skatt (kr)</th>
                      <th className="text-right px-4 py-3 font-medium text-muted-foreground">Avdrag %</th>
                      <th className="text-right px-4 py-3 font-medium text-muted-foreground">Avdrag (kr)</th>
                      <th className="text-left px-4 py-3 font-medium text-muted-foreground">Ansökan</th>
                      <th className="text-right px-4 py-3 font-medium text-muted-foreground">Åtgärder</th>
                    </tr>
                  </thead>
                  <tbody>
                    {records.sort((a, b) => b.period.localeCompare(a.period)).map(r => (
                      <tr key={r.id} className="border-b border-border last:border-0">
                        <td className="px-4 py-3 font-medium">{r.period}</td>
                        <td className="px-4 py-3 text-right tabular-nums">{fmt(r.consumptionKwh)}</td>
                        <td className="px-4 py-3 text-right tabular-nums">{fmt(r.totalTaxKr)}</td>
                        <td className="px-4 py-3 text-right tabular-nums">{fmtPct(r.deductionPct)}%</td>
                        <td className="px-4 py-3 text-right tabular-nums font-medium">{fmt(r.deductionKr)}</td>
                        <td className="px-4 py-3">{r.applicationSent ? 'Skickad' : 'Ej skickad'}</td>
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
            <DialogTitle>{editingRecord ? 'Redigera period' : 'Ny energiskatteperiod'}</DialogTitle>
            <DialogDescription>Ange energiförbrukning och skattebelopp. Avdraget beräknas automatiskt.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-2"><Label>Period *</Label><Input type="month" value={form.period} onChange={e => setForm(f => ({ ...f, period: e.target.value }))} /></div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2"><Label>Förbrukning (kWh)</Label><Input type="number" min={0} value={form.consumptionKwh} onChange={e => setForm(f => ({ ...f, consumptionKwh: parseFloat(e.target.value) || 0 }))} /></div>
              <div className="grid gap-2"><Label>Energiskatt (kr)</Label><Input type="number" min={0} value={form.totalTaxKr} onChange={e => setForm(f => ({ ...f, totalTaxKr: parseFloat(e.target.value) || 0 }))} /></div>
            </div>
            <div className="grid gap-2"><Label>Avdragsprocent (%)</Label><Input type="number" min={0} max={100} value={form.deductionPct} onChange={e => setForm(f => ({ ...f, deductionPct: parseFloat(e.target.value) || 0 }))} /></div>
            {form.totalTaxKr > 0 && (
              <div className="rounded-lg border border-border bg-muted/30 px-4 py-3 text-sm">
                Beräknat avdrag: <span className="font-semibold">{fmt(form.totalTaxKr * form.deductionPct / 100)} kr</span>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Avbryt</Button>
            <Button onClick={handleSave} disabled={!form.period}>{editingRecord ? 'Uppdatera' : 'Skapa'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Ta bort period</DialogTitle>
            <DialogDescription>Är du säker på att du vill ta bort perioden <span className="font-semibold">{recordToDelete?.period}</span>?</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>Avbryt</Button>
            <Button variant="destructive" onClick={handleDelete}><Trash2 className="mr-2 h-4 w-4" />Ta bort</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
