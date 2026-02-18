'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { ModuleWorkspaceShell } from '@/components/modules/ModuleWorkspaceShell'
import { EmptyModuleState } from '@/components/modules/shared/EmptyModuleState'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog'
import { Plus, Pencil, Trash2, Loader2, Search, Link2 } from 'lucide-react'

interface ModuleWorkspaceProps {
  module: { slug: string; name: string; cat: string; desc: string; longDesc: string }
  sectorSlug: string
  settingsHref: string
}

interface BatchRecord {
  id: string
  batchNumber: string
  product: string
  productionDate: string
  rawMaterialBatches: string
  supplier: string
  quantity: number
  expiryDate: string
  recallStatus: 'Aktiv' | 'Återkallad' | 'Spärrad'
  notes: string
}

const EMPTY_FORM = { batchNumber: '', product: '', productionDate: '', rawMaterialBatches: '', supplier: '', quantity: 0, expiryDate: '', recallStatus: 'Aktiv' as 'Aktiv' | 'Återkallad' | 'Spärrad', notes: '' }

export function SparbarhetBatchWorkspace({ module: mod, sectorSlug, settingsHref }: ModuleWorkspaceProps) {
  const supabase = createClient()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [records, setRecords] = useState<BatchRecord[]>([])
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingRecord, setEditingRecord] = useState<BatchRecord | null>(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [recordToDelete, setRecordToDelete] = useState<BatchRecord | null>(null)
  const [searchQuery, setSearchQuery] = useState('')

  const saveRecords = useCallback(async (newRecords: BatchRecord[]) => {
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setSaving(false); return }
    await supabase.from('module_configs').upsert(
      { user_id: user.id, sector_slug: sectorSlug, module_slug: mod.slug, config_key: 'batch_records', config_value: newRecords },
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
      .eq('config_key', 'batch_records').maybeSingle()
    if (data?.config_value && Array.isArray(data.config_value)) setRecords(data.config_value as BatchRecord[])
    setLoading(false)
  }, [supabase, sectorSlug, mod.slug])

  useEffect(() => { fetchData() }, [fetchData])

  const filtered = searchQuery.trim() ? records.filter(r => {
    const q = searchQuery.toLowerCase()
    return r.batchNumber.toLowerCase().includes(q) || r.product.toLowerCase().includes(q) || r.rawMaterialBatches.toLowerCase().includes(q) || r.supplier.toLowerCase().includes(q)
  }) : records

  function openNew() { setEditingRecord(null); setForm({ ...EMPTY_FORM, productionDate: new Date().toISOString().split('T')[0] }); setDialogOpen(true) }
  function openEdit(record: BatchRecord) { setEditingRecord(record); setForm({ batchNumber: record.batchNumber, product: record.product, productionDate: record.productionDate, rawMaterialBatches: record.rawMaterialBatches, supplier: record.supplier, quantity: record.quantity, expiryDate: record.expiryDate, recallStatus: record.recallStatus, notes: record.notes }); setDialogOpen(true) }

  async function handleSave() {
    const newRecord: BatchRecord = { id: editingRecord?.id ?? crypto.randomUUID(), ...form, batchNumber: form.batchNumber.trim(), product: form.product.trim(), rawMaterialBatches: form.rawMaterialBatches.trim(), supplier: form.supplier.trim(), notes: form.notes.trim() }
    const updated = editingRecord ? records.map(r => r.id === editingRecord.id ? newRecord : r) : [...records, newRecord]
    setRecords(updated); setDialogOpen(false); await saveRecords(updated)
  }

  async function handleDelete() {
    if (!recordToDelete) return
    const updated = records.filter(r => r.id !== recordToDelete.id)
    setRecords(updated); setDeleteDialogOpen(false); setRecordToDelete(null); await saveRecords(updated)
  }

  return (
    <>
      <ModuleWorkspaceShell
        title={mod.name} description={mod.desc} category="operativ" sectorName="Tillverkning"
        backHref={`/m/${sectorSlug}`} settingsHref={settingsHref}
        actions={<Button onClick={openNew}><Plus className="mr-2 h-4 w-4" />Ny batch</Button>}
      >
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Sök batch, produkt, leverantör..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="pl-9" />
            </div>
            {saving && <div className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" />Sparar...</div>}
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
          ) : filtered.length === 0 ? (
            <EmptyModuleState icon={Link2} title="Inga batchposter" description="Registrera batchnummer för spårbarhet från råmaterial till färdig produkt. Viktigt vid eventuell återkallelse." actionLabel="Ny batch" onAction={openNew} />
          ) : (
            <div className="rounded-xl border border-border overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-muted/50 border-b border-border">
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Batchnr</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Produkt</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Prod.datum</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Råmaterialbatch</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Leverantör</th>
                    <th className="text-right px-4 py-3 font-medium text-muted-foreground">Antal</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Status</th>
                    <th className="text-right px-4 py-3 font-medium text-muted-foreground">Åtgärder</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.sort((a, b) => b.productionDate.localeCompare(a.productionDate)).map(r => (
                    <tr key={r.id} className="border-b border-border last:border-0">
                      <td className="px-4 py-3 font-mono font-medium">{r.batchNumber}</td>
                      <td className="px-4 py-3">{r.product}</td>
                      <td className="px-4 py-3">{r.productionDate}</td>
                      <td className="px-4 py-3 text-xs">{r.rawMaterialBatches}</td>
                      <td className="px-4 py-3">{r.supplier}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{r.quantity}</td>
                      <td className="px-4 py-3">
                        <span className={`text-xs font-medium ${r.recallStatus === 'Aktiv' ? 'text-emerald-600' : r.recallStatus === 'Återkallad' ? 'text-red-600' : 'text-amber-600'}`}>{r.recallStatus}</span>
                      </td>
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
        </div>
      </ModuleWorkspaceShell>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{editingRecord ? 'Redigera batch' : 'Ny batchregistrering'}</DialogTitle><DialogDescription>Registrera batchinformation för fullständig spårbarhet.</DialogDescription></DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2"><Label>Batchnummer *</Label><Input value={form.batchNumber} onChange={e => setForm(f => ({ ...f, batchNumber: e.target.value }))} placeholder="B-2024-001" /></div>
              <div className="grid gap-2"><Label>Produkt *</Label><Input value={form.product} onChange={e => setForm(f => ({ ...f, product: e.target.value }))} placeholder="Produkt A" /></div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2"><Label>Produktionsdatum</Label><Input type="date" value={form.productionDate} onChange={e => setForm(f => ({ ...f, productionDate: e.target.value }))} /></div>
              <div className="grid gap-2"><Label>Utgångsdatum</Label><Input type="date" value={form.expiryDate} onChange={e => setForm(f => ({ ...f, expiryDate: e.target.value }))} /></div>
            </div>
            <div className="grid gap-2"><Label>Råmaterialbatch(er)</Label><Input value={form.rawMaterialBatches} onChange={e => setForm(f => ({ ...f, rawMaterialBatches: e.target.value }))} placeholder="RM-001, RM-002" /></div>
            <div className="grid grid-cols-3 gap-4">
              <div className="grid gap-2"><Label>Leverantör</Label><Input value={form.supplier} onChange={e => setForm(f => ({ ...f, supplier: e.target.value }))} /></div>
              <div className="grid gap-2"><Label>Antal</Label><Input type="number" min={0} value={form.quantity} onChange={e => setForm(f => ({ ...f, quantity: parseInt(e.target.value) || 0 }))} /></div>
              <div className="grid gap-2"><Label>Status</Label>
                <select className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm" value={form.recallStatus} onChange={e => setForm(f => ({ ...f, recallStatus: e.target.value as BatchRecord['recallStatus'] }))}>
                  <option value="Aktiv">Aktiv</option>
                  <option value="Spärrad">Spärrad</option>
                  <option value="Återkallad">Återkallad</option>
                </select>
              </div>
            </div>
            <div className="grid gap-2"><Label>Anteckningar</Label><Input value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Särskild information..." /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Avbryt</Button>
            <Button onClick={handleSave} disabled={!form.batchNumber.trim() || !form.product.trim()}>{editingRecord ? 'Uppdatera' : 'Skapa'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Ta bort batch</DialogTitle><DialogDescription>Är du säker?</DialogDescription></DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>Avbryt</Button>
            <Button variant="destructive" onClick={handleDelete}><Trash2 className="mr-2 h-4 w-4" />Ta bort</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
