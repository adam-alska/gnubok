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
import { Plus, Pencil, Trash2, Loader2, AlertTriangle } from 'lucide-react'
import { Badge } from '@/components/ui/badge'

interface ModuleWorkspaceProps {
  module: { slug: string; name: string; cat: string; desc: string; longDesc: string }
  sectorSlug: string
  settingsHref: string
}

interface VarianceRecord {
  id: string
  product: string
  period: string
  standardCost: number
  actualCost: number
  variance: number
  variancePct: number
  varianceAccount: string
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
  standardCost: 0,
  actualCost: 0,
  varianceAccount: '4900',
}

export function ProduktionsavvikelseWorkspace({ module: mod, sectorSlug, settingsHref }: ModuleWorkspaceProps) {
  const supabase = createClient()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [records, setRecords] = useState<VarianceRecord[]>([])
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingRecord, setEditingRecord] = useState<VarianceRecord | null>(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [recordToDelete, setRecordToDelete] = useState<VarianceRecord | null>(null)

  const saveRecords = useCallback(async (newRecords: VarianceRecord[]) => {
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setSaving(false); return }
    await supabase.from('module_configs').upsert(
      { user_id: user.id, sector_slug: sectorSlug, module_slug: mod.slug, config_key: 'variance_records', config_value: newRecords },
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
      .eq('config_key', 'variance_records').maybeSingle()
    if (data?.config_value && Array.isArray(data.config_value)) {
      setRecords(data.config_value as VarianceRecord[])
    }
    setLoading(false)
  }, [supabase, sectorSlug, mod.slug])

  useEffect(() => { fetchData() }, [fetchData])

  const totalVariance = records.reduce((s, r) => s + r.variance, 0)
  const totalStandard = records.reduce((s, r) => s + r.standardCost, 0)
  const totalActual = records.reduce((s, r) => s + r.actualCost, 0)
  const overallVariancePct = totalStandard > 0 ? ((totalActual - totalStandard) / totalStandard) * 100 : 0

  function openNew() {
    setEditingRecord(null)
    setForm({ ...EMPTY_FORM, period: new Date().toISOString().slice(0, 7) })
    setDialogOpen(true)
  }

  function openEdit(record: VarianceRecord) {
    setEditingRecord(record)
    setForm({ product: record.product, period: record.period, standardCost: record.standardCost, actualCost: record.actualCost, varianceAccount: record.varianceAccount })
    setDialogOpen(true)
  }

  async function handleSave() {
    const variance = form.actualCost - form.standardCost
    const variancePct = form.standardCost > 0 ? (variance / form.standardCost) * 100 : 0
    const newRecord: VarianceRecord = {
      id: editingRecord?.id ?? crypto.randomUUID(),
      product: form.product.trim(),
      period: form.period,
      standardCost: form.standardCost,
      actualCost: form.actualCost,
      variance,
      variancePct,
      varianceAccount: form.varianceAccount,
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
        actions={<Button onClick={openNew}><Plus className="mr-2 h-4 w-4" />Ny avvikelse</Button>}
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
              <EmptyModuleState icon={AlertTriangle} title="Inga produktionsavvikelser" description="Registrera standardkostnad vs verklig kostnad för att analysera produktionsavvikelser. Avvikelser bokförs på konto 4900." actionLabel="Ny avvikelse" onAction={openNew} />
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <KPICard label="Total avvikelse" value={fmt(totalVariance)} unit="kr" trend={totalVariance > 0 ? 'down' : totalVariance < 0 ? 'up' : 'neutral'} />
                <KPICard label="Avvikelse %" value={fmtPct(overallVariancePct)} unit="%" />
                <KPICard label="Standardkostnad" value={fmt(totalStandard)} unit="kr" />
                <KPICard label="Verklig kostnad" value={fmt(totalActual)} unit="kr" />
              </div>
            )}
          </TabsContent>

          <TabsContent value="detaljer" className="space-y-4">
            {loading ? (
              <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
            ) : records.length === 0 ? (
              <EmptyModuleState icon={AlertTriangle} title="Inga avvikelser registrerade" description="Lägg till produktionsavvikelser för detaljerad analys." actionLabel="Ny avvikelse" onAction={openNew} />
            ) : (
              <div className="rounded-xl border border-border overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-muted/50 border-b border-border">
                      <th className="text-left px-4 py-3 font-medium text-muted-foreground">Produkt</th>
                      <th className="text-left px-4 py-3 font-medium text-muted-foreground">Period</th>
                      <th className="text-right px-4 py-3 font-medium text-muted-foreground">Standard (kr)</th>
                      <th className="text-right px-4 py-3 font-medium text-muted-foreground">Verklig (kr)</th>
                      <th className="text-right px-4 py-3 font-medium text-muted-foreground">Avvikelse (kr)</th>
                      <th className="text-right px-4 py-3 font-medium text-muted-foreground">Avvikelse %</th>
                      <th className="text-left px-4 py-3 font-medium text-muted-foreground">Konto</th>
                      <th className="text-right px-4 py-3 font-medium text-muted-foreground">Åtgärder</th>
                    </tr>
                  </thead>
                  <tbody>
                    {records.map(r => (
                      <tr key={r.id} className="border-b border-border last:border-0">
                        <td className="px-4 py-3 font-medium">{r.product}</td>
                        <td className="px-4 py-3">{r.period}</td>
                        <td className="px-4 py-3 text-right tabular-nums">{fmt(r.standardCost)}</td>
                        <td className="px-4 py-3 text-right tabular-nums">{fmt(r.actualCost)}</td>
                        <td className="px-4 py-3 text-right tabular-nums">
                          <Badge variant="secondary" className={r.variance > 0 ? 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400' : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400'}>
                            {r.variance > 0 ? '+' : ''}{fmt(r.variance)}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums">{fmtPct(r.variancePct)}%</td>
                        <td className="px-4 py-3 font-mono">{r.varianceAccount}</td>
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
            <DialogTitle>{editingRecord ? 'Redigera avvikelse' : 'Ny produktionsavvikelse'}</DialogTitle>
            <DialogDescription>Ange standardkostnad och verklig kostnad. Avvikelsen beräknas automatiskt.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2"><Label>Produkt *</Label><Input value={form.product} onChange={e => setForm(f => ({ ...f, product: e.target.value }))} placeholder="Produkt A" /></div>
              <div className="grid gap-2"><Label>Period *</Label><Input type="month" value={form.period} onChange={e => setForm(f => ({ ...f, period: e.target.value }))} /></div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2"><Label>Standardkostnad (kr)</Label><Input type="number" min={0} value={form.standardCost} onChange={e => setForm(f => ({ ...f, standardCost: parseFloat(e.target.value) || 0 }))} /></div>
              <div className="grid gap-2"><Label>Verklig kostnad (kr)</Label><Input type="number" min={0} value={form.actualCost} onChange={e => setForm(f => ({ ...f, actualCost: parseFloat(e.target.value) || 0 }))} /></div>
            </div>
            <div className="grid gap-2"><Label>Avvikelsekonto</Label><Input value={form.varianceAccount} onChange={e => setForm(f => ({ ...f, varianceAccount: e.target.value }))} placeholder="4900" /></div>
            {form.standardCost > 0 && (
              <div className="rounded-lg border border-border bg-muted/30 px-4 py-3 text-sm">
                <p>Beräknad avvikelse: <span className="font-semibold">{fmt(form.actualCost - form.standardCost)} kr</span> ({fmtPct(((form.actualCost - form.standardCost) / form.standardCost) * 100)}%)</p>
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
          <DialogHeader>
            <DialogTitle>Ta bort avvikelse</DialogTitle>
            <DialogDescription>Är du säker på att du vill ta bort avvikelsepost för <span className="font-semibold">{recordToDelete?.product}</span>?</DialogDescription>
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
