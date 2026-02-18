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
import { Plus, Pencil, Trash2, Loader2, Package } from 'lucide-react'

interface ModuleWorkspaceProps {
  module: { slug: string; name: string; cat: string; desc: string; longDesc: string }
  sectorSlug: string
  settingsHref: string
}

interface BomComponent {
  name: string
  quantity: number
  unitCost: number
}

interface BomProduct {
  id: string
  name: string
  components: BomComponent[]
  laborCost: number
  ohMarkupPct: number
  stockQuantity: number
}

function fmt(n: number): string {
  return new Intl.NumberFormat('sv-SE', { maximumFractionDigits: 0 }).format(n)
}

function calcUnitCost(p: BomProduct): number {
  const materialCost = p.components.reduce((s, c) => s + c.quantity * c.unitCost, 0)
  const subtotal = materialCost + p.laborCost
  return subtotal * (1 + p.ohMarkupPct / 100)
}

const EMPTY_FORM = {
  name: '',
  components: [{ name: '', quantity: 1, unitCost: 0 }] as BomComponent[],
  laborCost: 0,
  ohMarkupPct: 0,
  stockQuantity: 0,
}

export function BomKalkylLagervardeWorkspace({ module: mod, sectorSlug, settingsHref }: ModuleWorkspaceProps) {
  const supabase = createClient()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [products, setProducts] = useState<BomProduct[]>([])
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingProduct, setEditingProduct] = useState<BomProduct | null>(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [productToDelete, setProductToDelete] = useState<BomProduct | null>(null)

  const saveProducts = useCallback(async (newProducts: BomProduct[]) => {
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setSaving(false); return }
    await supabase.from('module_configs').upsert(
      { user_id: user.id, sector_slug: sectorSlug, module_slug: mod.slug, config_key: 'bom_products', config_value: newProducts },
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
      .eq('config_key', 'bom_products').maybeSingle()
    if (data?.config_value && Array.isArray(data.config_value)) {
      setProducts(data.config_value as BomProduct[])
    }
    setLoading(false)
  }, [supabase, sectorSlug, mod.slug])

  useEffect(() => { fetchData() }, [fetchData])

  const totalStockValue = products.reduce((s, p) => s + calcUnitCost(p) * p.stockQuantity, 0)

  function openNew() {
    setEditingProduct(null)
    setForm({ ...EMPTY_FORM, components: [{ name: '', quantity: 1, unitCost: 0 }] })
    setDialogOpen(true)
  }

  function openEdit(product: BomProduct) {
    setEditingProduct(product)
    setForm({ name: product.name, components: [...product.components], laborCost: product.laborCost, ohMarkupPct: product.ohMarkupPct, stockQuantity: product.stockQuantity })
    setDialogOpen(true)
  }

  async function handleSave() {
    const newProduct: BomProduct = {
      id: editingProduct?.id ?? crypto.randomUUID(),
      name: form.name.trim(),
      components: form.components.filter(c => c.name.trim()),
      laborCost: form.laborCost,
      ohMarkupPct: form.ohMarkupPct,
      stockQuantity: form.stockQuantity,
    }
    const updated = editingProduct ? products.map(p => p.id === editingProduct.id ? newProduct : p) : [...products, newProduct]
    setProducts(updated)
    setDialogOpen(false)
    await saveProducts(updated)
  }

  async function handleDelete() {
    if (!productToDelete) return
    const updated = products.filter(p => p.id !== productToDelete.id)
    setProducts(updated)
    setDeleteDialogOpen(false)
    setProductToDelete(null)
    await saveProducts(updated)
  }

  function addComponent() {
    setForm(f => ({ ...f, components: [...f.components, { name: '', quantity: 1, unitCost: 0 }] }))
  }

  function updateComponent(idx: number, field: keyof BomComponent, value: string | number) {
    setForm(f => {
      const comps = [...f.components]
      comps[idx] = { ...comps[idx], [field]: value }
      return { ...f, components: comps }
    })
  }

  function removeComponent(idx: number) {
    setForm(f => ({ ...f, components: f.components.filter((_, i) => i !== idx) }))
  }

  return (
    <>
      <ModuleWorkspaceShell
        title={mod.name} description={mod.desc} category="bokforing" sectorName="Tillverkning"
        backHref={`/m/${sectorSlug}`} settingsHref={settingsHref}
        actions={<Button onClick={openNew}><Plus className="mr-2 h-4 w-4" />Ny produkt</Button>}
      >
        <Tabs defaultValue="oversikt" className="space-y-6">
          <TabsList>
            <TabsTrigger value="oversikt">Översikt</TabsTrigger>
            <TabsTrigger value="produkter">Produkter</TabsTrigger>
          </TabsList>

          <TabsContent value="oversikt" className="space-y-6">
            {loading ? (
              <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
            ) : products.length === 0 ? (
              <EmptyModuleState icon={Package} title="Inga produkter" description="Lägg till produkter med strukturlista (BOM) för att beräkna enhetskostnad och lagervärde." actionLabel="Ny produkt" onAction={openNew} />
            ) : (
              <>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  <KPICard label="Totalt lagervärde" value={fmt(totalStockValue)} unit="kr" />
                  <KPICard label="Antal produkter" value={String(products.length)} unit="st" />
                  <KPICard label="Snitt enhetskostnad" value={fmt(products.length > 0 ? products.reduce((s, p) => s + calcUnitCost(p), 0) / products.length : 0)} unit="kr" />
                </div>
              </>
            )}
          </TabsContent>

          <TabsContent value="produkter" className="space-y-4">
            {loading ? (
              <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
            ) : products.length === 0 ? (
              <EmptyModuleState icon={Package} title="Inga produkter" description="Skapa din första BOM-produkt." actionLabel="Ny produkt" onAction={openNew} />
            ) : (
              <div className="rounded-xl border border-border overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-muted/50 border-b border-border">
                      <th className="text-left px-4 py-3 font-medium text-muted-foreground">Produkt</th>
                      <th className="text-right px-4 py-3 font-medium text-muted-foreground">Material (kr)</th>
                      <th className="text-right px-4 py-3 font-medium text-muted-foreground">Arbete (kr)</th>
                      <th className="text-right px-4 py-3 font-medium text-muted-foreground">OH %</th>
                      <th className="text-right px-4 py-3 font-medium text-muted-foreground">Enhetskost. (kr)</th>
                      <th className="text-right px-4 py-3 font-medium text-muted-foreground">Lager</th>
                      <th className="text-right px-4 py-3 font-medium text-muted-foreground">Lagervärde (kr)</th>
                      <th className="text-right px-4 py-3 font-medium text-muted-foreground">Åtgärder</th>
                    </tr>
                  </thead>
                  <tbody>
                    {products.map(p => {
                      const matCost = p.components.reduce((s, c) => s + c.quantity * c.unitCost, 0)
                      const uc = calcUnitCost(p)
                      return (
                        <tr key={p.id} className="border-b border-border last:border-0">
                          <td className="px-4 py-3 font-medium">{p.name}</td>
                          <td className="px-4 py-3 text-right tabular-nums">{fmt(matCost)}</td>
                          <td className="px-4 py-3 text-right tabular-nums">{fmt(p.laborCost)}</td>
                          <td className="px-4 py-3 text-right tabular-nums">{p.ohMarkupPct}%</td>
                          <td className="px-4 py-3 text-right tabular-nums font-medium">{fmt(uc)}</td>
                          <td className="px-4 py-3 text-right tabular-nums">{p.stockQuantity}</td>
                          <td className="px-4 py-3 text-right tabular-nums font-medium">{fmt(uc * p.stockQuantity)}</td>
                          <td className="px-4 py-3 text-right">
                            <div className="flex items-center justify-end gap-1">
                              <Button variant="ghost" size="icon" onClick={() => openEdit(p)}><Pencil className="h-4 w-4" /></Button>
                              <Button variant="ghost" size="icon" className="text-red-600 hover:text-red-700" onClick={() => { setProductToDelete(p); setDeleteDialogOpen(true) }}><Trash2 className="h-4 w-4" /></Button>
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
            {saving && <div className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" />Sparar...</div>}
          </TabsContent>
        </Tabs>
      </ModuleWorkspaceShell>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingProduct ? 'Redigera produkt' : 'Ny BOM-produkt'}</DialogTitle>
            <DialogDescription>{editingProduct ? 'Uppdatera produktens strukturlista och kostnader.' : 'Definiera materialkomponenter, arbete och OH-pålägg.'}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-2">
              <Label>Produktnamn *</Label>
              <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Produkt A" />
            </div>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label>Materialkomponenter</Label>
                <Button variant="outline" size="sm" onClick={addComponent}><Plus className="mr-1 h-3 w-3" />Lägg till</Button>
              </div>
              {form.components.map((comp, idx) => (
                <div key={idx} className="flex items-end gap-2">
                  <div className="flex-1 grid gap-1">
                    <Input placeholder="Komponent" value={comp.name} onChange={e => updateComponent(idx, 'name', e.target.value)} />
                  </div>
                  <div className="w-20 grid gap-1">
                    <Input type="number" min={0} placeholder="Antal" value={comp.quantity} onChange={e => updateComponent(idx, 'quantity', parseFloat(e.target.value) || 0)} />
                  </div>
                  <div className="w-24 grid gap-1">
                    <Input type="number" min={0} step="0.01" placeholder="kr/st" value={comp.unitCost} onChange={e => updateComponent(idx, 'unitCost', parseFloat(e.target.value) || 0)} />
                  </div>
                  <Button variant="ghost" size="icon" className="text-red-600" onClick={() => removeComponent(idx)}><Trash2 className="h-4 w-4" /></Button>
                </div>
              ))}
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="grid gap-2">
                <Label>Arbetskostnad (kr)</Label>
                <Input type="number" min={0} value={form.laborCost} onChange={e => setForm(f => ({ ...f, laborCost: parseFloat(e.target.value) || 0 }))} />
              </div>
              <div className="grid gap-2">
                <Label>OH-pålägg (%)</Label>
                <Input type="number" min={0} value={form.ohMarkupPct} onChange={e => setForm(f => ({ ...f, ohMarkupPct: parseFloat(e.target.value) || 0 }))} />
              </div>
              <div className="grid gap-2">
                <Label>Lagersaldo (st)</Label>
                <Input type="number" min={0} value={form.stockQuantity} onChange={e => setForm(f => ({ ...f, stockQuantity: parseInt(e.target.value) || 0 }))} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Avbryt</Button>
            <Button onClick={handleSave} disabled={!form.name.trim()}>{editingProduct ? 'Uppdatera' : 'Skapa'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Ta bort produkt</DialogTitle>
            <DialogDescription>Är du säker på att du vill ta bort <span className="font-semibold">{productToDelete?.name}</span>?</DialogDescription>
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
