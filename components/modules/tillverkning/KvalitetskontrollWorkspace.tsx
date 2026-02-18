'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { ModuleWorkspaceShell } from '@/components/modules/ModuleWorkspaceShell'
import { EmptyModuleState } from '@/components/modules/shared/EmptyModuleState'
import { StatusBadge } from '@/components/modules/shared/StatusBadge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Plus, Pencil, Trash2, Loader2, ClipboardCheck } from 'lucide-react'

interface ModuleWorkspaceProps {
  module: { slug: string; name: string; cat: string; desc: string; longDesc: string }
  sectorSlug: string
  settingsHref: string
}

type InspectionStatus = 'Godkänd' | 'Underkänd' | 'Villkorligt godkänd' | 'Väntar'
interface Inspection {
  id: string
  product: string
  batchNumber: string
  date: string
  inspector: string
  status: InspectionStatus
  measurements: string
  deviations: string
}

const STATUSES: InspectionStatus[] = ['Godkänd', 'Underkänd', 'Villkorligt godkänd', 'Väntar']
const STATUS_VARIANTS: Record<InspectionStatus, 'success' | 'danger' | 'warning' | 'info'> = {
  'Godkänd': 'success', 'Underkänd': 'danger', 'Villkorligt godkänd': 'warning', 'Väntar': 'info',
}

const EMPTY_FORM = { product: '', batchNumber: '', date: '', inspector: '', status: 'Väntar' as InspectionStatus, measurements: '', deviations: '' }

export function KvalitetskontrollWorkspace({ module: mod, sectorSlug, settingsHref }: ModuleWorkspaceProps) {
  const supabase = createClient()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [inspections, setInspections] = useState<Inspection[]>([])
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingItem, setEditingItem] = useState<Inspection | null>(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [itemToDelete, setItemToDelete] = useState<Inspection | null>(null)

  const saveItems = useCallback(async (newItems: Inspection[]) => {
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setSaving(false); return }
    await supabase.from('module_configs').upsert(
      { user_id: user.id, sector_slug: sectorSlug, module_slug: mod.slug, config_key: 'inspections', config_value: newItems },
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
      .eq('config_key', 'inspections').maybeSingle()
    if (data?.config_value && Array.isArray(data.config_value)) setInspections(data.config_value as Inspection[])
    setLoading(false)
  }, [supabase, sectorSlug, mod.slug])

  useEffect(() => { fetchData() }, [fetchData])

  function openNew() { setEditingItem(null); setForm({ ...EMPTY_FORM, date: new Date().toISOString().split('T')[0] }); setDialogOpen(true) }
  function openEdit(item: Inspection) { setEditingItem(item); setForm({ product: item.product, batchNumber: item.batchNumber, date: item.date, inspector: item.inspector, status: item.status, measurements: item.measurements, deviations: item.deviations }); setDialogOpen(true) }

  async function handleSave() {
    const newItem: Inspection = { id: editingItem?.id ?? crypto.randomUUID(), ...form, product: form.product.trim(), batchNumber: form.batchNumber.trim(), inspector: form.inspector.trim(), measurements: form.measurements.trim(), deviations: form.deviations.trim() }
    const updated = editingItem ? inspections.map(i => i.id === editingItem.id ? newItem : i) : [...inspections, newItem]
    setInspections(updated); setDialogOpen(false); await saveItems(updated)
  }

  async function handleDelete() {
    if (!itemToDelete) return
    const updated = inspections.filter(i => i.id !== itemToDelete.id)
    setInspections(updated); setDeleteDialogOpen(false); setItemToDelete(null); await saveItems(updated)
  }

  const approved = inspections.filter(i => i.status === 'Godkänd').length
  const rejected = inspections.filter(i => i.status === 'Underkänd').length

  return (
    <>
      <ModuleWorkspaceShell
        title={mod.name} description={mod.desc} category="operativ" sectorName="Tillverkning"
        backHref={`/m/${sectorSlug}`} settingsHref={settingsHref}
        actions={<Button onClick={openNew}><Plus className="mr-2 h-4 w-4" />Ny kontroll</Button>}
      >
        <Tabs defaultValue="kontroller" className="space-y-6">
          <TabsList>
            <TabsTrigger value="kontroller">Kontroller</TabsTrigger>
            <TabsTrigger value="statistik">Statistik</TabsTrigger>
          </TabsList>

          <TabsContent value="kontroller" className="space-y-4">
            {loading ? (
              <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
            ) : inspections.length === 0 ? (
              <EmptyModuleState icon={ClipboardCheck} title="Inga kvalitetskontroller" description="Registrera kontroller med mätprotokoll och avvikelser för att följa produktkvalitet." actionLabel="Ny kontroll" onAction={openNew} />
            ) : (
              <div className="space-y-3">
                {inspections.sort((a, b) => b.date.localeCompare(a.date)).map(item => (
                  <div key={item.id} className="flex items-center justify-between gap-4 rounded-xl border border-border bg-card px-5 py-4">
                    <div className="flex flex-col min-w-0">
                      <span className="font-medium text-sm">{item.product}</span>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
                        <span>Batch: {item.batchNumber}</span>
                        <span>{item.date}</span>
                        <span>{item.inspector}</span>
                      </div>
                      {item.deviations && <p className="text-xs text-red-600 mt-1">Avvikelse: {item.deviations}</p>}
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <StatusBadge label={item.status} variant={STATUS_VARIANTS[item.status]} />
                      <Button variant="ghost" size="icon" onClick={() => openEdit(item)}><Pencil className="h-4 w-4" /></Button>
                      <Button variant="ghost" size="icon" className="text-red-600 hover:text-red-700" onClick={() => { setItemToDelete(item); setDeleteDialogOpen(true) }}><Trash2 className="h-4 w-4" /></Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
            {saving && <div className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" />Sparar...</div>}
          </TabsContent>

          <TabsContent value="statistik" className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-xl border border-border bg-card p-5"><p className="text-xs font-medium text-muted-foreground uppercase">Totalt</p><p className="text-2xl font-semibold mt-1">{inspections.length}</p></div>
              <div className="rounded-xl border border-border bg-card p-5"><p className="text-xs font-medium text-muted-foreground uppercase">Godkända</p><p className="text-2xl font-semibold mt-1 text-emerald-600">{approved}</p></div>
              <div className="rounded-xl border border-border bg-card p-5"><p className="text-xs font-medium text-muted-foreground uppercase">Underkända</p><p className="text-2xl font-semibold mt-1 text-red-600">{rejected}</p></div>
              <div className="rounded-xl border border-border bg-card p-5"><p className="text-xs font-medium text-muted-foreground uppercase">Godkänt %</p><p className="text-2xl font-semibold mt-1">{inspections.length > 0 ? ((approved / inspections.length) * 100).toFixed(1) : '0.0'}%</p></div>
            </div>
          </TabsContent>
        </Tabs>
      </ModuleWorkspaceShell>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{editingItem ? 'Redigera kontroll' : 'Ny kvalitetskontroll'}</DialogTitle><DialogDescription>Registrera kontrollresultat och eventuella avvikelser.</DialogDescription></DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2"><Label>Produkt *</Label><Input value={form.product} onChange={e => setForm(f => ({ ...f, product: e.target.value }))} /></div>
              <div className="grid gap-2"><Label>Batchnummer *</Label><Input value={form.batchNumber} onChange={e => setForm(f => ({ ...f, batchNumber: e.target.value }))} /></div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="grid gap-2"><Label>Datum *</Label><Input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} /></div>
              <div className="grid gap-2"><Label>Inspektör</Label><Input value={form.inspector} onChange={e => setForm(f => ({ ...f, inspector: e.target.value }))} /></div>
              <div className="grid gap-2"><Label>Status</Label>
                <Select value={form.status} onValueChange={val => setForm(f => ({ ...f, status: val as InspectionStatus }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid gap-2"><Label>Mätprotokoll</Label><Input value={form.measurements} onChange={e => setForm(f => ({ ...f, measurements: e.target.value }))} placeholder="Mätvärden, toleranser..." /></div>
            <div className="grid gap-2"><Label>Avvikelser</Label><Input value={form.deviations} onChange={e => setForm(f => ({ ...f, deviations: e.target.value }))} placeholder="Beskrivning av avvikelser..." /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Avbryt</Button>
            <Button onClick={handleSave} disabled={!form.product.trim() || !form.batchNumber.trim()}>{editingItem ? 'Uppdatera' : 'Skapa'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Ta bort kontroll</DialogTitle><DialogDescription>Är du säker?</DialogDescription></DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>Avbryt</Button>
            <Button variant="destructive" onClick={handleDelete}><Trash2 className="mr-2 h-4 w-4" />Ta bort</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
