'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { ModuleWorkspaceShell } from '@/components/modules/ModuleWorkspaceShell'
import { EmptyModuleState } from '@/components/modules/shared/EmptyModuleState'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Plus, Pencil, Trash2, Loader2, Search, Link2 } from 'lucide-react'

interface ModuleWorkspaceProps { module: { slug: string; name: string; cat: string; desc: string; longDesc: string }; sectorSlug: string; settingsHref: string }
interface BatchEntry { id: string; batchNumber: string; product: string; supplier: string; receivedDate: string; expiryDate: string; quantity: string; supplyChain: string; recallReady: boolean }

const EMPTY_FORM = { batchNumber: '', product: '', supplier: '', receivedDate: '', expiryDate: '', quantity: '', supplyChain: '', recallReady: false }

export function SparbarhetWorkspace({ module: mod, sectorSlug, settingsHref }: ModuleWorkspaceProps) {
  const supabase = createClient()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [entries, setEntries] = useState<BatchEntry[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<BatchEntry | null>(null)
  const [form, setForm] = useState(EMPTY_FORM)

  const saveData = useCallback(async (items: BatchEntry[]) => {
    setSaving(true); const { data: { user } } = await supabase.auth.getUser(); if (!user) { setSaving(false); return }
    await supabase.from('module_configs').upsert({ user_id: user.id, sector_slug: sectorSlug, module_slug: mod.slug, config_key: 'batches', config_value: items }, { onConflict: 'user_id,sector_slug,module_slug,config_key' }); setSaving(false)
  }, [supabase, sectorSlug, mod.slug])

  const fetchData = useCallback(async () => {
    setLoading(true); const { data: { user } } = await supabase.auth.getUser(); if (!user) { setLoading(false); return }
    const { data } = await supabase.from('module_configs').select('config_value').eq('user_id', user.id).eq('sector_slug', sectorSlug).eq('module_slug', mod.slug).eq('config_key', 'batches').maybeSingle()
    if (data?.config_value && Array.isArray(data.config_value)) setEntries(data.config_value as BatchEntry[]); setLoading(false)
  }, [supabase, sectorSlug, mod.slug])

  useEffect(() => { fetchData() }, [fetchData])

  const filtered = searchQuery.trim() ? entries.filter(e => { const q = searchQuery.toLowerCase(); return e.batchNumber.toLowerCase().includes(q) || e.product.toLowerCase().includes(q) || e.supplier.toLowerCase().includes(q) }) : entries

  function openNew() { setEditing(null); setForm({ ...EMPTY_FORM }); setDialogOpen(true) }
  function openEdit(e: BatchEntry) { setEditing(e); setForm({ batchNumber: e.batchNumber, product: e.product, supplier: e.supplier, receivedDate: e.receivedDate, expiryDate: e.expiryDate, quantity: e.quantity, supplyChain: e.supplyChain, recallReady: e.recallReady }); setDialogOpen(true) }
  async function handleSave() { const entry: BatchEntry = { id: editing?.id ?? crypto.randomUUID(), ...form }; const updated = editing ? entries.map(e => e.id === editing.id ? entry : e) : [...entries, entry]; setEntries(updated); setDialogOpen(false); await saveData(updated) }
  async function handleDelete(id: string) { const updated = entries.filter(e => e.id !== id); setEntries(updated); await saveData(updated) }

  return (
    <>
      <ModuleWorkspaceShell title={mod.name} description={mod.desc} category="operativ" sectorName="Jordbruk & Livsmedel" backHref={`/m/${sectorSlug}`} settingsHref={settingsHref}
        actions={<Button onClick={openNew}><Plus className="mr-2 h-4 w-4" />Ny batch</Button>}>
        {loading ? <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div> : (
          <div className="space-y-6">
            <div className="flex items-center gap-3">
              <div className="relative flex-1 max-w-sm"><Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" /><Input placeholder="Sök batchnummer, produkt, leverantör..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="pl-9" /></div>
              {saving && <div className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" />Sparar...</div>}
            </div>
            {filtered.length === 0 ? <EmptyModuleState icon={Link2} title="Inga batcher" description="Registrera batcher med nummer, leveranskedja och återkallningsberedskap." actionLabel="Ny batch" onAction={openNew} /> : (
              <div className="rounded-xl border border-border overflow-hidden">
                <Table><TableHeader><TableRow className="bg-muted/50"><TableHead className="font-medium">Batchnr</TableHead><TableHead className="font-medium">Produkt</TableHead><TableHead className="font-medium">Leverantör</TableHead><TableHead className="font-medium">Mottagen</TableHead><TableHead className="font-medium">Bäst före</TableHead><TableHead className="font-medium">Återkallning</TableHead><TableHead className="font-medium text-right">Åtgärder</TableHead></TableRow></TableHeader>
                  <TableBody>{filtered.map(e => (
                    <TableRow key={e.id}><TableCell className="font-mono font-medium">{e.batchNumber}</TableCell><TableCell>{e.product}</TableCell><TableCell>{e.supplier}</TableCell><TableCell>{e.receivedDate}</TableCell><TableCell>{e.expiryDate}</TableCell><TableCell><Badge variant={e.recallReady ? 'default' : 'secondary'}>{e.recallReady ? 'Redo' : 'Ej redo'}</Badge></TableCell>
                      <TableCell className="text-right"><div className="flex items-center justify-end gap-1"><Button variant="ghost" size="icon" onClick={() => openEdit(e)}><Pencil className="h-4 w-4" /></Button><Button variant="ghost" size="icon" className="text-red-600" onClick={() => handleDelete(e.id)}><Trash2 className="h-4 w-4" /></Button></div></TableCell></TableRow>
                  ))}</TableBody></Table></div>
            )}
          </div>
        )}
      </ModuleWorkspaceShell>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}><DialogContent className="max-w-md"><DialogHeader><DialogTitle>{editing ? 'Redigera' : 'Ny batch'}</DialogTitle><DialogDescription>Spårbarhetsuppgifter för livsmedel.</DialogDescription></DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="grid grid-cols-2 gap-4"><div className="grid gap-2"><Label>Batchnummer *</Label><Input value={form.batchNumber} onChange={e => setForm(f => ({ ...f, batchNumber: e.target.value }))} placeholder="B2025-001" /></div><div className="grid gap-2"><Label>Produkt *</Label><Input value={form.product} onChange={e => setForm(f => ({ ...f, product: e.target.value }))} placeholder="Mjölk" /></div></div>
          <div className="grid grid-cols-2 gap-4"><div className="grid gap-2"><Label>Leverantör</Label><Input value={form.supplier} onChange={e => setForm(f => ({ ...f, supplier: e.target.value }))} /></div><div className="grid gap-2"><Label>Kvantitet</Label><Input value={form.quantity} onChange={e => setForm(f => ({ ...f, quantity: e.target.value }))} placeholder="100 liter" /></div></div>
          <div className="grid grid-cols-2 gap-4"><div className="grid gap-2"><Label>Mottagen</Label><Input type="date" value={form.receivedDate} onChange={e => setForm(f => ({ ...f, receivedDate: e.target.value }))} /></div><div className="grid gap-2"><Label>Bäst före</Label><Input type="date" value={form.expiryDate} onChange={e => setForm(f => ({ ...f, expiryDate: e.target.value }))} /></div></div>
          <div className="grid gap-2"><Label>Leveranskedja</Label><Input value={form.supplyChain} onChange={e => setForm(f => ({ ...f, supplyChain: e.target.value }))} placeholder="Gård -> Mejeri -> Butik" /></div>
          <Button type="button" variant={form.recallReady ? 'default' : 'outline'} size="sm" onClick={() => setForm(f => ({ ...f, recallReady: !f.recallReady }))}>{form.recallReady ? 'Återkallningsklar: JA' : 'Återkallningsklar: NEJ'}</Button>
        </div>
        <DialogFooter><Button variant="outline" onClick={() => setDialogOpen(false)}>Avbryt</Button><Button onClick={handleSave} disabled={!form.batchNumber.trim() || !form.product.trim()}>{editing ? 'Uppdatera' : 'Lägg till'}</Button></DialogFooter></DialogContent></Dialog>
    </>
  )
}
