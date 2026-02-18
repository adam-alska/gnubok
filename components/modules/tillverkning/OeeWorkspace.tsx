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
import { Plus, Pencil, Trash2, Loader2, Activity } from 'lucide-react'
import { Badge } from '@/components/ui/badge'

interface ModuleWorkspaceProps {
  module: { slug: string; name: string; cat: string; desc: string; longDesc: string }
  sectorSlug: string
  settingsHref: string
}

interface OeeRecord {
  id: string
  machine: string
  date: string
  plannedMinutes: number
  runMinutes: number
  idealCycleTime: number
  totalPieces: number
  goodPieces: number
  availability: number
  performance: number
  quality: number
  oee: number
}

function fmtPct(n: number): string {
  return isFinite(n) ? n.toFixed(1) : '0.0'
}

const EMPTY_FORM = {
  machine: '',
  date: '',
  plannedMinutes: 480,
  runMinutes: 0,
  idealCycleTime: 1,
  totalPieces: 0,
  goodPieces: 0,
}

export function OeeWorkspace({ module: mod, sectorSlug, settingsHref }: ModuleWorkspaceProps) {
  const supabase = createClient()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [records, setRecords] = useState<OeeRecord[]>([])
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingRecord, setEditingRecord] = useState<OeeRecord | null>(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [recordToDelete, setRecordToDelete] = useState<OeeRecord | null>(null)

  const saveRecords = useCallback(async (newRecords: OeeRecord[]) => {
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setSaving(false); return }
    await supabase.from('module_configs').upsert(
      { user_id: user.id, sector_slug: sectorSlug, module_slug: mod.slug, config_key: 'oee_records', config_value: newRecords },
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
      .eq('config_key', 'oee_records').maybeSingle()
    if (data?.config_value && Array.isArray(data.config_value)) {
      setRecords(data.config_value as OeeRecord[])
    }
    setLoading(false)
  }, [supabase, sectorSlug, mod.slug])

  useEffect(() => { fetchData() }, [fetchData])

  const avgOee = records.length > 0 ? records.reduce((s, r) => s + r.oee, 0) / records.length : 0
  const avgAvailability = records.length > 0 ? records.reduce((s, r) => s + r.availability, 0) / records.length : 0
  const avgPerformance = records.length > 0 ? records.reduce((s, r) => s + r.performance, 0) / records.length : 0
  const avgQuality = records.length > 0 ? records.reduce((s, r) => s + r.quality, 0) / records.length : 0

  function openNew() {
    setEditingRecord(null)
    setForm({ ...EMPTY_FORM, date: new Date().toISOString().split('T')[0] })
    setDialogOpen(true)
  }

  function openEdit(record: OeeRecord) {
    setEditingRecord(record)
    setForm({ machine: record.machine, date: record.date, plannedMinutes: record.plannedMinutes, runMinutes: record.runMinutes, idealCycleTime: record.idealCycleTime, totalPieces: record.totalPieces, goodPieces: record.goodPieces })
    setDialogOpen(true)
  }

  async function handleSave() {
    const availability = form.plannedMinutes > 0 ? (form.runMinutes / form.plannedMinutes) * 100 : 0
    const performance = form.runMinutes > 0 && form.idealCycleTime > 0 ? ((form.idealCycleTime * form.totalPieces) / form.runMinutes) * 100 : 0
    const quality = form.totalPieces > 0 ? (form.goodPieces / form.totalPieces) * 100 : 0
    const oee = (availability / 100) * (performance / 100) * (quality / 100) * 100
    const newRecord: OeeRecord = {
      id: editingRecord?.id ?? crypto.randomUUID(),
      machine: form.machine.trim(),
      date: form.date,
      plannedMinutes: form.plannedMinutes,
      runMinutes: form.runMinutes,
      idealCycleTime: form.idealCycleTime,
      totalPieces: form.totalPieces,
      goodPieces: form.goodPieces,
      availability,
      performance: Math.min(performance, 100),
      quality,
      oee: Math.min(oee, 100),
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

  function oeeColor(val: number): string {
    if (val >= 85) return 'bg-emerald-100 text-emerald-800'
    if (val >= 60) return 'bg-amber-100 text-amber-800'
    return 'bg-red-100 text-red-800'
  }

  return (
    <>
      <ModuleWorkspaceShell
        title={mod.name} description={mod.desc} category="rapport" sectorName="Tillverkning"
        backHref={`/m/${sectorSlug}`} settingsHref={settingsHref}
        actions={<Button onClick={openNew}><Plus className="mr-2 h-4 w-4" />Ny mätning</Button>}
      >
        <Tabs defaultValue="oversikt" className="space-y-6">
          <TabsList>
            <TabsTrigger value="oversikt">Översikt</TabsTrigger>
            <TabsTrigger value="matningar">Mätningar</TabsTrigger>
          </TabsList>

          <TabsContent value="oversikt" className="space-y-6">
            {loading ? (
              <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
            ) : records.length === 0 ? (
              <EmptyModuleState icon={Activity} title="Inga OEE-mätningar" description="OEE = Tillgänglighet x Prestanda x Kvalitet. Registrera mätningar för att beräkna maskineffektivitet." actionLabel="Ny mätning" onAction={openNew} />
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <KPICard label="OEE" value={fmtPct(avgOee)} unit="%" trend={avgOee >= 85 ? 'up' : avgOee >= 60 ? 'neutral' : 'down'} trendLabel={avgOee >= 85 ? 'Världsklass' : avgOee >= 60 ? 'Medel' : 'Förbättringspotential'} />
                <KPICard label="Tillgänglighet" value={fmtPct(avgAvailability)} unit="%" />
                <KPICard label="Prestanda" value={fmtPct(avgPerformance)} unit="%" />
                <KPICard label="Kvalitet" value={fmtPct(avgQuality)} unit="%" />
              </div>
            )}
          </TabsContent>

          <TabsContent value="matningar" className="space-y-4">
            {loading ? (
              <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
            ) : records.length === 0 ? (
              <EmptyModuleState icon={Activity} title="Inga mätningar" description="Lägg till OEE-mätningar." actionLabel="Ny mätning" onAction={openNew} />
            ) : (
              <div className="rounded-xl border border-border overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-muted/50 border-b border-border">
                      <th className="text-left px-4 py-3 font-medium text-muted-foreground">Maskin</th>
                      <th className="text-left px-4 py-3 font-medium text-muted-foreground">Datum</th>
                      <th className="text-right px-4 py-3 font-medium text-muted-foreground">Tillgänglighet</th>
                      <th className="text-right px-4 py-3 font-medium text-muted-foreground">Prestanda</th>
                      <th className="text-right px-4 py-3 font-medium text-muted-foreground">Kvalitet</th>
                      <th className="text-right px-4 py-3 font-medium text-muted-foreground">OEE</th>
                      <th className="text-right px-4 py-3 font-medium text-muted-foreground">Åtgärder</th>
                    </tr>
                  </thead>
                  <tbody>
                    {records.sort((a, b) => b.date.localeCompare(a.date)).map(r => (
                      <tr key={r.id} className="border-b border-border last:border-0">
                        <td className="px-4 py-3 font-medium">{r.machine}</td>
                        <td className="px-4 py-3">{r.date}</td>
                        <td className="px-4 py-3 text-right tabular-nums">{fmtPct(r.availability)}%</td>
                        <td className="px-4 py-3 text-right tabular-nums">{fmtPct(r.performance)}%</td>
                        <td className="px-4 py-3 text-right tabular-nums">{fmtPct(r.quality)}%</td>
                        <td className="px-4 py-3 text-right"><Badge variant="secondary" className={oeeColor(r.oee)}>{fmtPct(r.oee)}%</Badge></td>
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
            <DialogTitle>{editingRecord ? 'Redigera OEE-mätning' : 'Ny OEE-mätning'}</DialogTitle>
            <DialogDescription>OEE = Tillgänglighet x Prestanda x Kvalitet. Ange maskindata nedan.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2"><Label>Maskin *</Label><Input value={form.machine} onChange={e => setForm(f => ({ ...f, machine: e.target.value }))} placeholder="CNC-1" /></div>
              <div className="grid gap-2"><Label>Datum *</Label><Input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} /></div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2"><Label>Planerad tid (min)</Label><Input type="number" min={0} value={form.plannedMinutes} onChange={e => setForm(f => ({ ...f, plannedMinutes: parseInt(e.target.value) || 0 }))} /></div>
              <div className="grid gap-2"><Label>Drifttid (min)</Label><Input type="number" min={0} value={form.runMinutes} onChange={e => setForm(f => ({ ...f, runMinutes: parseInt(e.target.value) || 0 }))} /></div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="grid gap-2"><Label>Ideal cykeltid (min/st)</Label><Input type="number" min={0} step="0.01" value={form.idealCycleTime} onChange={e => setForm(f => ({ ...f, idealCycleTime: parseFloat(e.target.value) || 0 }))} /></div>
              <div className="grid gap-2"><Label>Totalt producerade</Label><Input type="number" min={0} value={form.totalPieces} onChange={e => setForm(f => ({ ...f, totalPieces: parseInt(e.target.value) || 0 }))} /></div>
              <div className="grid gap-2"><Label>Godkända</Label><Input type="number" min={0} value={form.goodPieces} onChange={e => setForm(f => ({ ...f, goodPieces: parseInt(e.target.value) || 0 }))} /></div>
            </div>
            {form.plannedMinutes > 0 && (
              <div className="rounded-lg border border-border bg-muted/30 px-4 py-3 text-sm space-y-1">
                <p>Tillgänglighet: {fmtPct(form.plannedMinutes > 0 ? (form.runMinutes / form.plannedMinutes) * 100 : 0)}%</p>
                <p>Prestanda: {fmtPct(form.runMinutes > 0 && form.idealCycleTime > 0 ? Math.min(((form.idealCycleTime * form.totalPieces) / form.runMinutes) * 100, 100) : 0)}%</p>
                <p>Kvalitet: {fmtPct(form.totalPieces > 0 ? (form.goodPieces / form.totalPieces) * 100 : 0)}%</p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Avbryt</Button>
            <Button onClick={handleSave} disabled={!form.machine.trim() || !form.date}>{editingRecord ? 'Uppdatera' : 'Skapa'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Ta bort mätning</DialogTitle><DialogDescription>Är du säker?</DialogDescription></DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>Avbryt</Button>
            <Button variant="destructive" onClick={handleDelete}><Trash2 className="mr-2 h-4 w-4" />Ta bort</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
