'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { ModuleWorkspaceShell } from '@/components/modules/ModuleWorkspaceShell'
import { KPICard } from '@/components/modules/shared/KPICard'
import { EmptyModuleState } from '@/components/modules/shared/EmptyModuleState'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Plus, Pencil, Trash2, Loader2, Search, MapPin } from 'lucide-react'
import { Badge } from '@/components/ui/badge'

interface ModuleWorkspaceProps { module: { slug: string; name: string; cat: string; desc: string; longDesc: string }; sectorSlug: string; settingsHref: string }
type PropertyType = 'Bostadshus' | 'Kontorsfastighet' | 'Lager/Industri' | 'Handel' | 'Mark' | 'Blandat'
interface PropertyObject { id: string; name: string; address: string; type: PropertyType; totalArea: number; units: number; buildYear: number; taxValue: number; purchasePrice: number; notes: string }
function fmt(n: number): string { return new Intl.NumberFormat('sv-SE', { maximumFractionDigits: 0 }).format(n) }
const PROPERTY_TYPES: PropertyType[] = ['Bostadshus', 'Kontorsfastighet', 'Lager/Industri', 'Handel', 'Mark', 'Blandat']
const EMPTY_FORM = { name: '', address: '', type: 'Bostadshus' as PropertyType, totalArea: 0, units: 0, buildYear: 0, taxValue: 0, purchasePrice: 0, notes: '' }

export function ObjektregisterWorkspace({ module: mod, sectorSlug, settingsHref }: ModuleWorkspaceProps) {
  const supabase = createClient()
  const [loading, setLoading] = useState(true); const [saving, setSaving] = useState(false); const [objects, setObjects] = useState<PropertyObject[]>([]); const [searchQuery, setSearchQuery] = useState(''); const [dialogOpen, setDialogOpen] = useState(false); const [editing, setEditing] = useState<PropertyObject | null>(null); const [form, setForm] = useState(EMPTY_FORM); const [deleteDialogOpen, setDeleteDialogOpen] = useState(false); const [toDelete, setToDelete] = useState<PropertyObject | null>(null)

  const saveItems = useCallback(async (items: PropertyObject[]) => { setSaving(true); const { data: { user } } = await supabase.auth.getUser(); if (!user) { setSaving(false); return }; await supabase.from('module_configs').upsert({ user_id: user.id, sector_slug: sectorSlug, module_slug: mod.slug, config_key: 'property_objects', config_value: items }, { onConflict: 'user_id,sector_slug,module_slug,config_key' }); setSaving(false) }, [supabase, sectorSlug, mod.slug])
  const fetchData = useCallback(async () => { setLoading(true); const { data: { user } } = await supabase.auth.getUser(); if (!user) { setLoading(false); return }; const { data } = await supabase.from('module_configs').select('config_value').eq('user_id', user.id).eq('sector_slug', sectorSlug).eq('module_slug', mod.slug).eq('config_key', 'property_objects').maybeSingle(); if (data?.config_value && Array.isArray(data.config_value)) setObjects(data.config_value as PropertyObject[]); setLoading(false) }, [supabase, sectorSlug, mod.slug])
  useEffect(() => { fetchData() }, [fetchData])

  const filtered = useMemo(() => { if (!searchQuery.trim()) return objects; const q = searchQuery.toLowerCase(); return objects.filter(o => o.name.toLowerCase().includes(q) || o.address.toLowerCase().includes(q)) }, [objects, searchQuery])
  const totalArea = objects.reduce((s, o) => s + o.totalArea, 0)
  const totalUnits = objects.reduce((s, o) => s + o.units, 0)
  const totalValue = objects.reduce((s, o) => s + o.purchasePrice, 0)

  function openNew() { setEditing(null); setForm({ ...EMPTY_FORM }); setDialogOpen(true) }
  function openEdit(o: PropertyObject) { setEditing(o); setForm({ name: o.name, address: o.address, type: o.type, totalArea: o.totalArea, units: o.units, buildYear: o.buildYear, taxValue: o.taxValue, purchasePrice: o.purchasePrice, notes: o.notes }); setDialogOpen(true) }
  async function handleSave() { const item: PropertyObject = { id: editing?.id ?? crypto.randomUUID(), ...form, name: form.name.trim(), address: form.address.trim(), notes: form.notes.trim() }; const updated = editing ? objects.map(o => o.id === editing.id ? item : o) : [...objects, item]; setObjects(updated); setDialogOpen(false); await saveItems(updated) }
  async function handleDelete() { if (!toDelete) return; const updated = objects.filter(o => o.id !== toDelete.id); setObjects(updated); setDeleteDialogOpen(false); setToDelete(null); await saveItems(updated) }

  return (
    <>
      <ModuleWorkspaceShell title={mod.name} description={mod.desc} category="operativ" sectorName="Fastighet" backHref={`/m/${sectorSlug}`} settingsHref={settingsHref} actions={<Button onClick={openNew}><Plus className="mr-2 h-4 w-4" />Nytt objekt</Button>}>
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"><KPICard label="Fastigheter" value={String(objects.length)} unit="st" /><KPICard label="Total yta" value={fmt(totalArea)} unit="m²" /><KPICard label="Totalt enheter" value={String(totalUnits)} unit="st" /><KPICard label="Totalt värde" value={fmt(totalValue)} unit="kr" /></div>
          <div className="flex items-center gap-3"><div className="relative flex-1 max-w-sm"><Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" /><Input placeholder="Sök fastighet..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="pl-9" /></div>{saving && <div className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" />Sparar...</div>}</div>
          {loading ? <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div> : filtered.length === 0 ? <EmptyModuleState icon={MapPin} title="Inga fastigheter" description="Registrera fastigheter med adress, typ, yta, enheter och värde." actionLabel="Nytt objekt" onAction={openNew} /> : (
            <div className="space-y-3">{filtered.map(o => (
              <div key={o.id} className="flex items-center justify-between gap-4 rounded-xl border border-border bg-card px-5 py-4">
                <div className="flex flex-col min-w-0"><div className="flex items-center gap-2"><span className="font-medium text-sm">{o.name}</span><Badge variant="outline">{o.type}</Badge></div><div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5"><span>{o.address}</span><span>{fmt(o.totalArea)} m²</span><span>{o.units} enheter</span>{o.buildYear > 0 && <span>Byggt {o.buildYear}</span>}<span>Taxvärde: {fmt(o.taxValue)} kr</span></div></div>
                <div className="flex items-center gap-2 flex-shrink-0"><Button variant="ghost" size="icon" onClick={() => openEdit(o)}><Pencil className="h-4 w-4" /></Button><Button variant="ghost" size="icon" className="text-red-600" onClick={() => { setToDelete(o); setDeleteDialogOpen(true) }}><Trash2 className="h-4 w-4" /></Button></div>
              </div>
            ))}</div>
          )}
        </div>
      </ModuleWorkspaceShell>
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}><DialogContent className="max-w-md"><DialogHeader><DialogTitle>{editing ? 'Redigera fastighet' : 'Ny fastighet'}</DialogTitle><DialogDescription>Ange fastighetsuppgifter.</DialogDescription></DialogHeader><div className="grid gap-4 py-2"><div className="grid grid-cols-2 gap-4"><div className="grid gap-2"><Label>Namn *</Label><Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} /></div><div className="grid gap-2"><Label>Adress *</Label><Input value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} /></div></div><div className="grid grid-cols-2 gap-4"><div className="grid gap-2"><Label>Typ</Label><Select value={form.type} onValueChange={val => setForm(f => ({ ...f, type: val as PropertyType }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{PROPERTY_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent></Select></div><div className="grid gap-2"><Label>Byggår</Label><Input type="number" min={1800} value={form.buildYear || ''} onChange={e => setForm(f => ({ ...f, buildYear: parseInt(e.target.value) || 0 }))} /></div></div><div className="grid grid-cols-3 gap-4"><div className="grid gap-2"><Label>Yta (m²)</Label><Input type="number" min={0} value={form.totalArea} onChange={e => setForm(f => ({ ...f, totalArea: parseFloat(e.target.value) || 0 }))} /></div><div className="grid gap-2"><Label>Enheter</Label><Input type="number" min={0} value={form.units} onChange={e => setForm(f => ({ ...f, units: parseInt(e.target.value) || 0 }))} /></div><div className="grid gap-2"><Label>Taxvärde (kr)</Label><Input type="number" min={0} value={form.taxValue} onChange={e => setForm(f => ({ ...f, taxValue: parseFloat(e.target.value) || 0 }))} /></div></div><div className="grid gap-2"><Label>Inköpspris (kr)</Label><Input type="number" min={0} value={form.purchasePrice} onChange={e => setForm(f => ({ ...f, purchasePrice: parseFloat(e.target.value) || 0 }))} /></div><div className="grid gap-2"><Label>Anteckningar</Label><Input value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} /></div></div><DialogFooter><Button variant="outline" onClick={() => setDialogOpen(false)}>Avbryt</Button><Button onClick={handleSave} disabled={!form.name.trim() || !form.address.trim()}>{editing ? 'Uppdatera' : 'Skapa'}</Button></DialogFooter></DialogContent></Dialog>
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}><DialogContent className="max-w-sm"><DialogHeader><DialogTitle>Ta bort fastighet</DialogTitle><DialogDescription>Är du säker?</DialogDescription></DialogHeader><DialogFooter><Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>Avbryt</Button><Button variant="destructive" onClick={handleDelete}><Trash2 className="mr-2 h-4 w-4" />Ta bort</Button></DialogFooter></DialogContent></Dialog>
    </>
  )
}
