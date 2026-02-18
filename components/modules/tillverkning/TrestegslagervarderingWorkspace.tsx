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
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Plus, Pencil, Trash2, Loader2, Layers, Save } from 'lucide-react'

interface ModuleWorkspaceProps {
  module: { slug: string; name: string; cat: string; desc: string; longDesc: string }
  sectorSlug: string
  settingsHref: string
}

type InventoryLevel = 'Råmaterial' | 'PIA' | 'Färdigvaror'

interface InventoryItem {
  id: string
  name: string
  level: InventoryLevel
  quantity: number
  unitCost: number
  totalValue: number
}

const LEVELS: InventoryLevel[] = ['Råmaterial', 'PIA', 'Färdigvaror']

const EMPTY_ITEM_FORM = {
  name: '',
  level: 'Råmaterial' as InventoryLevel,
  quantity: 0,
  unitCost: 0,
}

function fmt(n: number): string {
  return new Intl.NumberFormat('sv-SE', { maximumFractionDigits: 0 }).format(n)
}

export function TrestegslagervarderingWorkspace({ module: mod, sectorSlug, settingsHref }: ModuleWorkspaceProps) {
  const supabase = createClient()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [items, setItems] = useState<InventoryItem[]>([])
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingItem, setEditingItem] = useState<InventoryItem | null>(null)
  const [form, setForm] = useState(EMPTY_ITEM_FORM)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [itemToDelete, setItemToDelete] = useState<InventoryItem | null>(null)
  const [valuationMethod, setValuationMethod] = useState('FIFO')

  const saveItems = useCallback(async (newItems: InventoryItem[]) => {
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setSaving(false); return }
    await supabase.from('module_configs').upsert(
      { user_id: user.id, sector_slug: sectorSlug, module_slug: mod.slug, config_key: 'inventory_items', config_value: newItems },
      { onConflict: 'user_id,sector_slug,module_slug,config_key' }
    )
    setSaving(false)
  }, [supabase, sectorSlug, mod.slug])

  const saveMethod = useCallback(async (method: string) => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    await supabase.from('module_configs').upsert(
      { user_id: user.id, sector_slug: sectorSlug, module_slug: mod.slug, config_key: 'valuation_method', config_value: method },
      { onConflict: 'user_id,sector_slug,module_slug,config_key' }
    )
  }, [supabase, sectorSlug, mod.slug])

  const fetchData = useCallback(async () => {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); return }

    const { data: itemsData } = await supabase.from('module_configs').select('config_value')
      .eq('user_id', user.id).eq('sector_slug', sectorSlug).eq('module_slug', mod.slug)
      .eq('config_key', 'inventory_items').maybeSingle()

    if (itemsData?.config_value && Array.isArray(itemsData.config_value)) {
      setItems(itemsData.config_value as InventoryItem[])
    }

    const { data: methodData } = await supabase.from('module_configs').select('config_value')
      .eq('user_id', user.id).eq('sector_slug', sectorSlug).eq('module_slug', mod.slug)
      .eq('config_key', 'valuation_method').maybeSingle()

    if (methodData?.config_value) setValuationMethod(String(methodData.config_value))
    setLoading(false)
  }, [supabase, sectorSlug, mod.slug])

  useEffect(() => { fetchData() }, [fetchData])

  const levelTotals = LEVELS.map(level => {
    const levelItems = items.filter(i => i.level === level)
    return { level, count: levelItems.length, value: levelItems.reduce((s, i) => s + i.totalValue, 0) }
  })
  const grandTotal = levelTotals.reduce((s, l) => s + l.value, 0)

  function openNew() {
    setEditingItem(null)
    setForm({ ...EMPTY_ITEM_FORM })
    setDialogOpen(true)
  }

  function openEdit(item: InventoryItem) {
    setEditingItem(item)
    setForm({ name: item.name, level: item.level, quantity: item.quantity, unitCost: item.unitCost })
    setDialogOpen(true)
  }

  async function handleSave() {
    const newItem: InventoryItem = {
      id: editingItem?.id ?? crypto.randomUUID(),
      name: form.name.trim(),
      level: form.level,
      quantity: form.quantity,
      unitCost: form.unitCost,
      totalValue: form.quantity * form.unitCost,
    }
    const updated = editingItem ? items.map(i => i.id === editingItem.id ? newItem : i) : [...items, newItem]
    setItems(updated)
    setDialogOpen(false)
    await saveItems(updated)
  }

  async function handleDelete() {
    if (!itemToDelete) return
    const updated = items.filter(i => i.id !== itemToDelete.id)
    setItems(updated)
    setDeleteDialogOpen(false)
    setItemToDelete(null)
    await saveItems(updated)
  }

  return (
    <>
      <ModuleWorkspaceShell
        title={mod.name}
        description={mod.desc}
        category="bokforing"
        sectorName="Tillverkning"
        backHref={`/m/${sectorSlug}`}
        settingsHref={settingsHref}
        actions={<Button onClick={openNew}><Plus className="mr-2 h-4 w-4" />Ny artikel</Button>}
      >
        <Tabs defaultValue="oversikt" className="space-y-6">
          <TabsList>
            <TabsTrigger value="oversikt">Översikt</TabsTrigger>
            <TabsTrigger value="artiklar">Artiklar</TabsTrigger>
            <TabsTrigger value="installningar">Inställningar</TabsTrigger>
          </TabsList>

          <TabsContent value="oversikt" className="space-y-6">
            {loading ? (
              <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
            ) : items.length === 0 ? (
              <EmptyModuleState icon={Layers} title="Inga lagerartiklar" description="Lägg till artiklar för att se trestegslagervärdering med FIFO-metod." actionLabel="Ny artikel" onAction={openNew} />
            ) : (
              <>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  <KPICard label="Totalt lagervärde" value={fmt(grandTotal)} unit="kr" />
                  {levelTotals.map(l => (
                    <KPICard key={l.level} label={l.level} value={fmt(l.value)} unit="kr" />
                  ))}
                </div>
                <div className="rounded-xl border border-border overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-muted/50 border-b border-border">
                        <th className="text-left px-4 py-3 font-medium text-muted-foreground">Nivå</th>
                        <th className="text-right px-4 py-3 font-medium text-muted-foreground">Artiklar</th>
                        <th className="text-right px-4 py-3 font-medium text-muted-foreground">Värde (kr)</th>
                        <th className="text-right px-4 py-3 font-medium text-muted-foreground">Andel %</th>
                      </tr>
                    </thead>
                    <tbody>
                      {levelTotals.map(l => (
                        <tr key={l.level} className="border-b border-border last:border-0">
                          <td className="px-4 py-3 font-medium">{l.level}</td>
                          <td className="px-4 py-3 text-right tabular-nums">{l.count}</td>
                          <td className="px-4 py-3 text-right tabular-nums">{fmt(l.value)}</td>
                          <td className="px-4 py-3 text-right tabular-nums">{grandTotal > 0 ? ((l.value / grandTotal) * 100).toFixed(1) : '0.0'}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </TabsContent>

          <TabsContent value="artiklar" className="space-y-4">
            {loading ? (
              <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
            ) : items.length === 0 ? (
              <EmptyModuleState icon={Layers} title="Inga artiklar" description="Lägg till lagerartiklar för att börja beräkna lagervärde." actionLabel="Ny artikel" onAction={openNew} />
            ) : (
              <div className="rounded-xl border border-border overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-muted/50 border-b border-border">
                      <th className="text-left px-4 py-3 font-medium text-muted-foreground">Artikel</th>
                      <th className="text-left px-4 py-3 font-medium text-muted-foreground">Nivå</th>
                      <th className="text-right px-4 py-3 font-medium text-muted-foreground">Antal</th>
                      <th className="text-right px-4 py-3 font-medium text-muted-foreground">Á-pris (kr)</th>
                      <th className="text-right px-4 py-3 font-medium text-muted-foreground">Värde (kr)</th>
                      <th className="text-right px-4 py-3 font-medium text-muted-foreground">Åtgärder</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map(item => (
                      <tr key={item.id} className="border-b border-border last:border-0">
                        <td className="px-4 py-3 font-medium">{item.name}</td>
                        <td className="px-4 py-3">{item.level}</td>
                        <td className="px-4 py-3 text-right tabular-nums">{item.quantity}</td>
                        <td className="px-4 py-3 text-right tabular-nums">{fmt(item.unitCost)}</td>
                        <td className="px-4 py-3 text-right tabular-nums font-medium">{fmt(item.totalValue)}</td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button variant="ghost" size="icon" onClick={() => openEdit(item)}><Pencil className="h-4 w-4" /></Button>
                            <Button variant="ghost" size="icon" className="text-red-600 hover:text-red-700" onClick={() => { setItemToDelete(item); setDeleteDialogOpen(true) }}><Trash2 className="h-4 w-4" /></Button>
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

          <TabsContent value="installningar" className="space-y-6">
            <div className="rounded-xl border border-border bg-card p-6 max-w-md space-y-4">
              <h3 className="text-sm font-semibold">Värderingsmetod</h3>
              <p className="text-xs text-muted-foreground">Välj vilken metod som ska användas för lagervärdering per nivå.</p>
              <Select value={valuationMethod} onValueChange={async (val) => { setValuationMethod(val); await saveMethod(val) }}>
                <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="FIFO">FIFO</SelectItem>
                  <SelectItem value="Vägt genomsnitt">Vägt genomsnitt</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </TabsContent>
        </Tabs>
      </ModuleWorkspaceShell>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingItem ? 'Redigera artikel' : 'Ny lagerartikel'}</DialogTitle>
            <DialogDescription>{editingItem ? 'Uppdatera artikelns uppgifter.' : 'Fyll i uppgifterna för den nya lagerartikeln.'}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-2">
              <Label>Artikelnamn *</Label>
              <Input value={form.name} onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Stålplåt 2mm" />
            </div>
            <div className="grid gap-2">
              <Label>Lagernivå *</Label>
              <Select value={form.level} onValueChange={(val) => setForm(f => ({ ...f, level: val as InventoryLevel }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{LEVELS.map(l => <SelectItem key={l} value={l}>{l}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Antal</Label>
                <Input type="number" min={0} value={form.quantity} onChange={(e) => setForm(f => ({ ...f, quantity: parseFloat(e.target.value) || 0 }))} />
              </div>
              <div className="grid gap-2">
                <Label>Styckpris (kr)</Label>
                <Input type="number" min={0} step="0.01" value={form.unitCost} onChange={(e) => setForm(f => ({ ...f, unitCost: parseFloat(e.target.value) || 0 }))} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Avbryt</Button>
            <Button onClick={handleSave} disabled={!form.name.trim()}>{editingItem ? 'Uppdatera' : 'Skapa'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Ta bort artikel</DialogTitle>
            <DialogDescription>Är du säker på att du vill ta bort <span className="font-semibold">{itemToDelete?.name}</span>?</DialogDescription>
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
