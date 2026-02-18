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
import { Plus, Pencil, Trash2, Loader2, MapPin } from 'lucide-react'
import { Switch } from '@/components/ui/switch'

interface ModuleWorkspaceProps { module: { slug: string; name: string; cat: string; desc: string; longDesc: string }; sectorSlug: string; settingsHref: string }

interface PerDiemRecord { id: string; consultant: string; date: string; dayType: 'Hel dag' | 'Halv dag'; mealReduction: number; taxFreeAmount: number; benefitValue: number; destination: string }

const FULL_DAY_RATE = 260
const HALF_DAY_RATE = 130

function fmt(n: number): string { return new Intl.NumberFormat('sv-SE', { maximumFractionDigits: 0 }).format(n) }

const EMPTY_FORM = { consultant: '', date: '', dayType: 'Hel dag' as 'Hel dag' | 'Halv dag', mealReduction: 0, destination: '' }

export function TraktamenteWorkspace({ module: mod, sectorSlug, settingsHref }: ModuleWorkspaceProps) {
  const supabase = createClient()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [records, setRecords] = useState<PerDiemRecord[]>([])
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingRecord, setEditingRecord] = useState<PerDiemRecord | null>(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [recordToDelete, setRecordToDelete] = useState<PerDiemRecord | null>(null)

  const saveRecords = useCallback(async (r: PerDiemRecord[]) => {
    setSaving(true); const { data: { user } } = await supabase.auth.getUser(); if (!user) { setSaving(false); return }
    await supabase.from('module_configs').upsert({ user_id: user.id, sector_slug: sectorSlug, module_slug: mod.slug, config_key: 'perdiem_records', config_value: r }, { onConflict: 'user_id,sector_slug,module_slug,config_key' }); setSaving(false)
  }, [supabase, sectorSlug, mod.slug])

  const fetchData = useCallback(async () => {
    setLoading(true); const { data: { user } } = await supabase.auth.getUser(); if (!user) { setLoading(false); return }
    const { data } = await supabase.from('module_configs').select('config_value').eq('user_id', user.id).eq('sector_slug', sectorSlug).eq('module_slug', mod.slug).eq('config_key', 'perdiem_records').maybeSingle()
    if (data?.config_value && Array.isArray(data.config_value)) setRecords(data.config_value as PerDiemRecord[]); setLoading(false)
  }, [supabase, sectorSlug, mod.slug])

  useEffect(() => { fetchData() }, [fetchData])

  const totalTaxFree = records.reduce((s, r) => s + r.taxFreeAmount, 0)
  const totalBenefit = records.reduce((s, r) => s + r.benefitValue, 0)

  function openNew() { setEditingRecord(null); setForm({ ...EMPTY_FORM, date: new Date().toISOString().split('T')[0] }); setDialogOpen(true) }
  function openEdit(r: PerDiemRecord) { setEditingRecord(r); setForm({ consultant: r.consultant, date: r.date, dayType: r.dayType, mealReduction: r.mealReduction, destination: r.destination }); setDialogOpen(true) }

  async function handleSave() {
    const rate = form.dayType === 'Hel dag' ? FULL_DAY_RATE : HALF_DAY_RATE
    const taxFreeAmount = Math.max(0, rate - form.mealReduction)
    const benefitValue = form.mealReduction
    const newRecord: PerDiemRecord = { id: editingRecord?.id ?? crypto.randomUUID(), consultant: form.consultant.trim(), date: form.date, dayType: form.dayType, mealReduction: form.mealReduction, taxFreeAmount, benefitValue, destination: form.destination.trim() }
    const updated = editingRecord ? records.map(r => r.id === editingRecord.id ? newRecord : r) : [...records, newRecord]
    setRecords(updated); setDialogOpen(false); await saveRecords(updated)
  }

  async function handleDelete() { if (!recordToDelete) return; const updated = records.filter(r => r.id !== recordToDelete.id); setRecords(updated); setDeleteDialogOpen(false); setRecordToDelete(null); await saveRecords(updated) }

  return (
    <>
      <ModuleWorkspaceShell title={mod.name} description={mod.desc} category="bokforing" sectorName="Konsult" backHref={`/m/${sectorSlug}`} settingsHref={settingsHref} actions={<Button onClick={openNew}><Plus className="mr-2 h-4 w-4" />Nytt traktamente</Button>}>
        <Tabs defaultValue="oversikt" className="space-y-6">
          <TabsList><TabsTrigger value="oversikt">Översikt</TabsTrigger><TabsTrigger value="poster">Poster</TabsTrigger></TabsList>
          <TabsContent value="oversikt" className="space-y-6">
            {loading ? <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div> : records.length === 0 ? <EmptyModuleState icon={MapPin} title="Inga traktamenten" description="Registrera traktamenten med beräkning av skattefri del, måltidsavdrag och förmånsvärde." actionLabel="Nytt traktamente" onAction={openNew} /> : (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <KPICard label="Antal poster" value={String(records.length)} unit="st" />
                <KPICard label="Skattefri del" value={fmt(totalTaxFree)} unit="kr" />
                <KPICard label="Förmånsvärde" value={fmt(totalBenefit)} unit="kr" />
                <KPICard label="Heldagar" value={String(records.filter(r => r.dayType === 'Hel dag').length)} unit="st" />
              </div>
            )}
          </TabsContent>
          <TabsContent value="poster" className="space-y-4">
            {loading ? <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div> : records.length === 0 ? <EmptyModuleState icon={MapPin} title="Inga poster" description="Lägg till traktamentsposter." actionLabel="Nytt traktamente" onAction={openNew} /> : (
              <div className="rounded-xl border border-border overflow-hidden"><table className="w-full text-sm"><thead><tr className="bg-muted/50 border-b border-border"><th className="text-left px-4 py-3 font-medium text-muted-foreground">Konsult</th><th className="text-left px-4 py-3 font-medium text-muted-foreground">Datum</th><th className="text-left px-4 py-3 font-medium text-muted-foreground">Destination</th><th className="text-left px-4 py-3 font-medium text-muted-foreground">Typ</th><th className="text-right px-4 py-3 font-medium text-muted-foreground">Skattefritt (kr)</th><th className="text-right px-4 py-3 font-medium text-muted-foreground">Förmån (kr)</th><th className="text-right px-4 py-3 font-medium text-muted-foreground">Åtgärder</th></tr></thead><tbody>
                {records.sort((a, b) => b.date.localeCompare(a.date)).map(r => (<tr key={r.id} className="border-b border-border last:border-0"><td className="px-4 py-3 font-medium">{r.consultant}</td><td className="px-4 py-3">{r.date}</td><td className="px-4 py-3">{r.destination}</td><td className="px-4 py-3">{r.dayType}</td><td className="px-4 py-3 text-right tabular-nums">{fmt(r.taxFreeAmount)}</td><td className="px-4 py-3 text-right tabular-nums">{fmt(r.benefitValue)}</td><td className="px-4 py-3 text-right"><div className="flex items-center justify-end gap-1"><Button variant="ghost" size="icon" onClick={() => openEdit(r)}><Pencil className="h-4 w-4" /></Button><Button variant="ghost" size="icon" className="text-red-600 hover:text-red-700" onClick={() => { setRecordToDelete(r); setDeleteDialogOpen(true) }}><Trash2 className="h-4 w-4" /></Button></div></td></tr>))}
              </tbody></table></div>
            )}
            {saving && <div className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" />Sparar...</div>}
          </TabsContent>
        </Tabs>
      </ModuleWorkspaceShell>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}><DialogContent className="max-w-md"><DialogHeader><DialogTitle>{editingRecord ? 'Redigera traktamente' : 'Nytt traktamente'}</DialogTitle><DialogDescription>Beräkna traktamente med skattefri del och måltidsavdrag.</DialogDescription></DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="grid grid-cols-2 gap-4"><div className="grid gap-2"><Label>Konsult *</Label><Input value={form.consultant} onChange={e => setForm(f => ({ ...f, consultant: e.target.value }))} placeholder="Anna Andersson" /></div><div className="grid gap-2"><Label>Datum *</Label><Input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} /></div></div>
          <div className="grid grid-cols-2 gap-4"><div className="grid gap-2"><Label>Typ</Label><Select value={form.dayType} onValueChange={val => setForm(f => ({ ...f, dayType: val as 'Hel dag' | 'Halv dag' }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="Hel dag">Hel dag ({FULL_DAY_RATE} kr)</SelectItem><SelectItem value="Halv dag">Halv dag ({HALF_DAY_RATE} kr)</SelectItem></SelectContent></Select></div><div className="grid gap-2"><Label>Måltidsavdrag (kr)</Label><Input type="number" min={0} value={form.mealReduction} onChange={e => setForm(f => ({ ...f, mealReduction: parseFloat(e.target.value) || 0 }))} /></div></div>
          <div className="grid gap-2"><Label>Destination</Label><Input value={form.destination} onChange={e => setForm(f => ({ ...f, destination: e.target.value }))} placeholder="Göteborg" /></div>
          <div className="rounded-lg border border-border bg-muted/30 px-4 py-3 text-sm"><p>Skattefri del: <span className="font-semibold">{fmt(Math.max(0, (form.dayType === 'Hel dag' ? FULL_DAY_RATE : HALF_DAY_RATE) - form.mealReduction))} kr</span></p></div>
        </div>
        <DialogFooter><Button variant="outline" onClick={() => setDialogOpen(false)}>Avbryt</Button><Button onClick={handleSave} disabled={!form.consultant.trim() || !form.date}>{editingRecord ? 'Uppdatera' : 'Skapa'}</Button></DialogFooter></DialogContent></Dialog>

      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}><DialogContent className="max-w-sm"><DialogHeader><DialogTitle>Ta bort traktamente</DialogTitle><DialogDescription>Är du säker?</DialogDescription></DialogHeader><DialogFooter><Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>Avbryt</Button><Button variant="destructive" onClick={handleDelete}><Trash2 className="mr-2 h-4 w-4" />Ta bort</Button></DialogFooter></DialogContent></Dialog>
    </>
  )
}
