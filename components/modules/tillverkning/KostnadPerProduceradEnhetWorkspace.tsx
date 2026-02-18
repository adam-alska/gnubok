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
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog'
import { Plus, Pencil, Trash2, Loader2, Calculator } from 'lucide-react'

interface ModuleWorkspaceProps {
  module: { slug: string; name: string; cat: string; desc: string; longDesc: string }
  sectorSlug: string
  settingsHref: string
}

interface CostRecord {
  id: string
  product: string
  period: string
  unitsProduced: number
  materialCost: number
  laborCost: number
  overheadCost: number
  totalCost: number
  costPerUnit: number
}

function fmt(n: number): string {
  return new Intl.NumberFormat('sv-SE', { maximumFractionDigits: 0 }).format(n)
}

function fmtDec(n: number): string {
  return new Intl.NumberFormat('sv-SE', { maximumFractionDigits: 2 }).format(n)
}

const EMPTY_FORM = {
  product: '',
  period: '',
  unitsProduced: 0,
  materialCost: 0,
  laborCost: 0,
  overheadCost: 0,
}

export function KostnadPerProduceradEnhetWorkspace({ module: mod, sectorSlug, settingsHref }: ModuleWorkspaceProps) {
  const supabase = createClient()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [records, setRecords] = useState<CostRecord[]>([])
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingRecord, setEditingRecord] = useState<CostRecord | null>(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [recordToDelete, setRecordToDelete] = useState<CostRecord | null>(null)

  const saveRecords = useCallback(async (newRecords: CostRecord[]) => {
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setSaving(false); return }
    await supabase.from('module_configs').upsert(
      { user_id: user.id, sector_slug: sectorSlug, module_slug: mod.slug, config_key: 'cost_records', config_value: newRecords },
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
      .eq('config_key', 'cost_records').maybeSingle()
    if (data?.config_value && Array.isArray(data.config_value)) {
      setRecords(data.config_value as CostRecord[])
    }
    setLoading(false)
  }, [supabase, sectorSlug, mod.slug])

  useEffect(() => { fetchData() }, [fetchData])

  const totalUnits = records.reduce((s, r) => s + r.unitsProduced, 0)
  const totalCost = records.reduce((s, r) => s + r.totalCost, 0)
  const avgCostPerUnit = totalUnits > 0 ? totalCost / totalUnits : 0

  function openNew() {
    setEditingRecord(null)
    setForm({ ...EMPTY_FORM, period: new Date().toISOString().slice(0, 7) })
    setDialogOpen(true)
  }

  function openEdit(record: CostRecord) {
    setEditingRecord(record)
    setForm({ product: record.product, period: record.period, unitsProduced: record.unitsProduced, materialCost: record.materialCost, laborCost: record.laborCost, overheadCost: record.overheadCost })
    setDialogOpen(true)
  }

  async function handleSave() {
    const totalCost = form.materialCost + form.laborCost + form.overheadCost
    const costPerUnit = form.unitsProduced > 0 ? totalCost / form.unitsProduced : 0
    const newRecord: CostRecord = {
      id: editingRecord?.id ?? crypto.randomUUID(),
      product: form.product.trim(),
      period: form.period,
      unitsProduced: form.unitsProduced,
      materialCost: form.materialCost,
      laborCost: form.laborCost,
      overheadCost: form.overheadCost,
      totalCost,
      costPerUnit,
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
            <TabsTrigger value="detaljer">Per produkt</TabsTrigger>
          </TabsList>

          <TabsContent value="oversikt" className="space-y-6">
            {loading ? (
              <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
            ) : records.length === 0 ? (
              <EmptyModuleState icon={Calculator} title="Ingen produktionskostnadsdata" description="Registrera material-, arbets- och OH-kostnader per produkt och period för att analysera kostnad per producerad enhet." actionLabel="Ny post" onAction={openNew} />
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <KPICard label="Snitt kostnad/enhet" value={fmtDec(avgCostPerUnit)} unit="kr" />
                <KPICard label="Totala enheter" value={fmt(totalUnits)} unit="st" />
                <KPICard label="Total kostnad" value={fmt(totalCost)} unit="kr" />
                <KPICard label="Antal produkter" value={String(new Set(records.map(r => r.product)).size)} unit="st" />
              </div>
            )}
          </TabsContent>

          <TabsContent value="detaljer" className="space-y-4">
            {loading ? (
              <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
            ) : records.length === 0 ? (
              <EmptyModuleState icon={Calculator} title="Inga poster" description="Lägg till produktionskostnadsdata." actionLabel="Ny post" onAction={openNew} />
            ) : (
              <div className="rounded-xl border border-border overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-muted/50 border-b border-border">
                      <th className="text-left px-4 py-3 font-medium text-muted-foreground">Produkt</th>
                      <th className="text-left px-4 py-3 font-medium text-muted-foreground">Period</th>
                      <th className="text-right px-4 py-3 font-medium text-muted-foreground">Enheter</th>
                      <th className="text-right px-4 py-3 font-medium text-muted-foreground">Material</th>
                      <th className="text-right px-4 py-3 font-medium text-muted-foreground">Arbete</th>
                      <th className="text-right px-4 py-3 font-medium text-muted-foreground">OH</th>
                      <th className="text-right px-4 py-3 font-medium text-muted-foreground">Totalt</th>
                      <th className="text-right px-4 py-3 font-medium text-muted-foreground">kr/enhet</th>
                      <th className="text-right px-4 py-3 font-medium text-muted-foreground">Åtgärder</th>
                    </tr>
                  </thead>
                  <tbody>
                    {records.sort((a, b) => b.period.localeCompare(a.period)).map(r => (
                      <tr key={r.id} className="border-b border-border last:border-0">
                        <td className="px-4 py-3 font-medium">{r.product}</td>
                        <td className="px-4 py-3">{r.period}</td>
                        <td className="px-4 py-3 text-right tabular-nums">{fmt(r.unitsProduced)}</td>
                        <td className="px-4 py-3 text-right tabular-nums">{fmt(r.materialCost)}</td>
                        <td className="px-4 py-3 text-right tabular-nums">{fmt(r.laborCost)}</td>
                        <td className="px-4 py-3 text-right tabular-nums">{fmt(r.overheadCost)}</td>
                        <td className="px-4 py-3 text-right tabular-nums font-medium">{fmt(r.totalCost)}</td>
                        <td className="px-4 py-3 text-right tabular-nums font-medium">{fmtDec(r.costPerUnit)}</td>
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
            <DialogTitle>{editingRecord ? 'Redigera post' : 'Ny kostnad per enhet'}</DialogTitle>
            <DialogDescription>Ange kostnadskomponenter och producerade enheter.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2"><Label>Produkt *</Label><Input value={form.product} onChange={e => setForm(f => ({ ...f, product: e.target.value }))} placeholder="Produkt A" /></div>
              <div className="grid gap-2"><Label>Period *</Label><Input type="month" value={form.period} onChange={e => setForm(f => ({ ...f, period: e.target.value }))} /></div>
            </div>
            <div className="grid gap-2"><Label>Producerade enheter</Label><Input type="number" min={0} value={form.unitsProduced} onChange={e => setForm(f => ({ ...f, unitsProduced: parseInt(e.target.value) || 0 }))} /></div>
            <div className="grid grid-cols-3 gap-4">
              <div className="grid gap-2"><Label>Material (kr)</Label><Input type="number" min={0} value={form.materialCost} onChange={e => setForm(f => ({ ...f, materialCost: parseFloat(e.target.value) || 0 }))} /></div>
              <div className="grid gap-2"><Label>Arbete (kr)</Label><Input type="number" min={0} value={form.laborCost} onChange={e => setForm(f => ({ ...f, laborCost: parseFloat(e.target.value) || 0 }))} /></div>
              <div className="grid gap-2"><Label>OH (kr)</Label><Input type="number" min={0} value={form.overheadCost} onChange={e => setForm(f => ({ ...f, overheadCost: parseFloat(e.target.value) || 0 }))} /></div>
            </div>
            {form.unitsProduced > 0 && (
              <div className="rounded-lg border border-border bg-muted/30 px-4 py-3 text-sm">
                Kostnad per enhet: <span className="font-semibold">{fmtDec((form.materialCost + form.laborCost + form.overheadCost) / form.unitsProduced)} kr</span>
              </div>
            )}
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
