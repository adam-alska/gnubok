'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { ModuleWorkspaceShell } from '@/components/modules/ModuleWorkspaceShell'
import { EmptyModuleState } from '@/components/modules/shared/EmptyModuleState'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog'
import { Plus, Pencil, Trash2, Loader2, ListTree, ChevronDown, ChevronRight } from 'lucide-react'

interface ModuleWorkspaceProps {
  module: { slug: string; name: string; cat: string; desc: string; longDesc: string }
  sectorSlug: string
  settingsHref: string
}

interface BomComponent {
  id: string
  name: string
  articleNumber: string
  quantity: number
  unit: string
  level: number
  alternativePart: string
}

interface BomProduct {
  id: string
  name: string
  articleNumber: string
  components: BomComponent[]
}

const EMPTY_PRODUCT_FORM = { name: '', articleNumber: '' }
const EMPTY_COMP_FORM = { name: '', articleNumber: '', quantity: 1, unit: 'st', level: 1, alternativePart: '' }

export function StrukturlistaBomWorkspace({ module: mod, sectorSlug, settingsHref }: ModuleWorkspaceProps) {
  const supabase = createClient()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [products, setProducts] = useState<BomProduct[]>([])
  const [expandedProduct, setExpandedProduct] = useState<string | null>(null)
  const [productDialogOpen, setProductDialogOpen] = useState(false)
  const [editingProduct, setEditingProduct] = useState<BomProduct | null>(null)
  const [productForm, setProductForm] = useState(EMPTY_PRODUCT_FORM)
  const [compDialogOpen, setCompDialogOpen] = useState(false)
  const [editingComp, setEditingComp] = useState<BomComponent | null>(null)
  const [compForm, setCompForm] = useState(EMPTY_COMP_FORM)
  const [activeProductId, setActiveProductId] = useState<string | null>(null)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<{ type: 'product' | 'component'; id: string; productId?: string; name: string } | null>(null)

  const saveProducts = useCallback(async (newProducts: BomProduct[]) => {
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setSaving(false); return }
    await supabase.from('module_configs').upsert(
      { user_id: user.id, sector_slug: sectorSlug, module_slug: mod.slug, config_key: 'bom_structures', config_value: newProducts },
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
      .eq('config_key', 'bom_structures').maybeSingle()
    if (data?.config_value && Array.isArray(data.config_value)) setProducts(data.config_value as BomProduct[])
    setLoading(false)
  }, [supabase, sectorSlug, mod.slug])

  useEffect(() => { fetchData() }, [fetchData])

  function openNewProduct() { setEditingProduct(null); setProductForm({ ...EMPTY_PRODUCT_FORM }); setProductDialogOpen(true) }
  function openEditProduct(p: BomProduct) { setEditingProduct(p); setProductForm({ name: p.name, articleNumber: p.articleNumber }); setProductDialogOpen(true) }

  async function handleSaveProduct() {
    const newP: BomProduct = { id: editingProduct?.id ?? crypto.randomUUID(), name: productForm.name.trim(), articleNumber: productForm.articleNumber.trim(), components: editingProduct?.components ?? [] }
    const updated = editingProduct ? products.map(p => p.id === editingProduct.id ? newP : p) : [...products, newP]
    setProducts(updated); setProductDialogOpen(false); await saveProducts(updated)
  }

  function openNewComp(productId: string) { setActiveProductId(productId); setEditingComp(null); setCompForm({ ...EMPTY_COMP_FORM }); setCompDialogOpen(true) }
  function openEditComp(productId: string, comp: BomComponent) { setActiveProductId(productId); setEditingComp(comp); setCompForm({ name: comp.name, articleNumber: comp.articleNumber, quantity: comp.quantity, unit: comp.unit, level: comp.level, alternativePart: comp.alternativePart }); setCompDialogOpen(true) }

  async function handleSaveComp() {
    if (!activeProductId) return
    const newComp: BomComponent = { id: editingComp?.id ?? crypto.randomUUID(), name: compForm.name.trim(), articleNumber: compForm.articleNumber.trim(), quantity: compForm.quantity, unit: compForm.unit, level: compForm.level, alternativePart: compForm.alternativePart.trim() }
    const updated = products.map(p => {
      if (p.id !== activeProductId) return p
      const comps = editingComp ? p.components.map(c => c.id === editingComp.id ? newComp : c) : [...p.components, newComp]
      return { ...p, components: comps }
    })
    setProducts(updated); setCompDialogOpen(false); await saveProducts(updated)
  }

  async function handleDelete() {
    if (!deleteTarget) return
    let updated: BomProduct[]
    if (deleteTarget.type === 'product') {
      updated = products.filter(p => p.id !== deleteTarget.id)
    } else {
      updated = products.map(p => p.id === deleteTarget.productId ? { ...p, components: p.components.filter(c => c.id !== deleteTarget.id) } : p)
    }
    setProducts(updated); setDeleteDialogOpen(false); setDeleteTarget(null); await saveProducts(updated)
  }

  return (
    <>
      <ModuleWorkspaceShell
        title={mod.name} description={mod.desc} category="operativ" sectorName="Tillverkning"
        backHref={`/m/${sectorSlug}`} settingsHref={settingsHref}
        actions={<Button onClick={openNewProduct}><Plus className="mr-2 h-4 w-4" />Ny produkt</Button>}
      >
        {loading ? (
          <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : products.length === 0 ? (
          <EmptyModuleState icon={ListTree} title="Inga strukturlistor" description="Skapa produkter och lägg till komponenter för att bygga strukturlistor (BOM). Definiera nivåer och alternativa delar." actionLabel="Ny produkt" onAction={openNewProduct} />
        ) : (
          <div className="space-y-3">
            {products.map(product => (
              <div key={product.id} className="rounded-xl border border-border bg-card overflow-hidden">
                <div className="flex items-center justify-between px-5 py-4 cursor-pointer" onClick={() => setExpandedProduct(expandedProduct === product.id ? null : product.id)}>
                  <div className="flex items-center gap-3">
                    {expandedProduct === product.id ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                    <div><span className="font-medium text-sm">{product.name}</span><span className="text-xs text-muted-foreground ml-2">{product.articleNumber}</span></div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">{product.components.length} komponenter</span>
                    <Button variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); openEditProduct(product) }}><Pencil className="h-4 w-4" /></Button>
                    <Button variant="ghost" size="icon" className="text-red-600 hover:text-red-700" onClick={(e) => { e.stopPropagation(); setDeleteTarget({ type: 'product', id: product.id, name: product.name }); setDeleteDialogOpen(true) }}><Trash2 className="h-4 w-4" /></Button>
                  </div>
                </div>
                {expandedProduct === product.id && (
                  <div className="border-t border-border px-5 py-4 space-y-3 bg-muted/20">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Komponenter</span>
                      <Button variant="outline" size="sm" onClick={() => openNewComp(product.id)}><Plus className="mr-1 h-3 w-3" />Lägg till</Button>
                    </div>
                    {product.components.length === 0 ? (
                      <p className="text-sm text-muted-foreground py-4 text-center">Inga komponenter. Lägg till den första.</p>
                    ) : (
                      <div className="rounded-lg border overflow-hidden">
                        <table className="w-full text-sm">
                          <thead><tr className="bg-muted/50 border-b">
                            <th className="text-left px-3 py-2 font-medium text-muted-foreground">Nivå</th>
                            <th className="text-left px-3 py-2 font-medium text-muted-foreground">Artikelnr</th>
                            <th className="text-left px-3 py-2 font-medium text-muted-foreground">Komponent</th>
                            <th className="text-right px-3 py-2 font-medium text-muted-foreground">Antal</th>
                            <th className="text-left px-3 py-2 font-medium text-muted-foreground">Enhet</th>
                            <th className="text-left px-3 py-2 font-medium text-muted-foreground">Alt. del</th>
                            <th className="text-right px-3 py-2 font-medium text-muted-foreground">Åtgärder</th>
                          </tr></thead>
                          <tbody>
                            {product.components.sort((a, b) => a.level - b.level).map(comp => (
                              <tr key={comp.id} className="border-b last:border-0">
                                <td className="px-3 py-2" style={{ paddingLeft: `${comp.level * 12 + 12}px` }}>{comp.level}</td>
                                <td className="px-3 py-2 font-mono text-xs">{comp.articleNumber}</td>
                                <td className="px-3 py-2">{comp.name}</td>
                                <td className="px-3 py-2 text-right tabular-nums">{comp.quantity}</td>
                                <td className="px-3 py-2">{comp.unit}</td>
                                <td className="px-3 py-2 text-xs text-muted-foreground">{comp.alternativePart || '-'}</td>
                                <td className="px-3 py-2 text-right">
                                  <div className="flex items-center justify-end gap-1">
                                    <Button variant="ghost" size="icon" onClick={() => openEditComp(product.id, comp)}><Pencil className="h-3.5 w-3.5" /></Button>
                                    <Button variant="ghost" size="icon" className="text-red-600" onClick={() => { setDeleteTarget({ type: 'component', id: comp.id, productId: product.id, name: comp.name }); setDeleteDialogOpen(true) }}><Trash2 className="h-3.5 w-3.5" /></Button>
                                  </div>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
            {saving && <div className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" />Sparar...</div>}
          </div>
        )}
      </ModuleWorkspaceShell>

      <Dialog open={productDialogOpen} onOpenChange={setProductDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{editingProduct ? 'Redigera produkt' : 'Ny produkt'}</DialogTitle><DialogDescription>Ange produktens grunduppgifter.</DialogDescription></DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-2"><Label>Produktnamn *</Label><Input value={productForm.name} onChange={e => setProductForm(f => ({ ...f, name: e.target.value }))} placeholder="Slutprodukt A" /></div>
            <div className="grid gap-2"><Label>Artikelnummer</Label><Input value={productForm.articleNumber} onChange={e => setProductForm(f => ({ ...f, articleNumber: e.target.value }))} placeholder="ART-001" /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setProductDialogOpen(false)}>Avbryt</Button>
            <Button onClick={handleSaveProduct} disabled={!productForm.name.trim()}>{editingProduct ? 'Uppdatera' : 'Skapa'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={compDialogOpen} onOpenChange={setCompDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{editingComp ? 'Redigera komponent' : 'Ny komponent'}</DialogTitle><DialogDescription>Definiera komponent med nivå och eventuell alternativ del.</DialogDescription></DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2"><Label>Komponentnamn *</Label><Input value={compForm.name} onChange={e => setCompForm(f => ({ ...f, name: e.target.value }))} placeholder="Deldel B" /></div>
              <div className="grid gap-2"><Label>Artikelnummer</Label><Input value={compForm.articleNumber} onChange={e => setCompForm(f => ({ ...f, articleNumber: e.target.value }))} placeholder="ART-002" /></div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="grid gap-2"><Label>Antal</Label><Input type="number" min={0} step="0.01" value={compForm.quantity} onChange={e => setCompForm(f => ({ ...f, quantity: parseFloat(e.target.value) || 0 }))} /></div>
              <div className="grid gap-2"><Label>Enhet</Label><Input value={compForm.unit} onChange={e => setCompForm(f => ({ ...f, unit: e.target.value }))} placeholder="st" /></div>
              <div className="grid gap-2"><Label>Nivå</Label><Input type="number" min={1} value={compForm.level} onChange={e => setCompForm(f => ({ ...f, level: parseInt(e.target.value) || 1 }))} /></div>
            </div>
            <div className="grid gap-2"><Label>Alternativ del</Label><Input value={compForm.alternativePart} onChange={e => setCompForm(f => ({ ...f, alternativePart: e.target.value }))} placeholder="Alternativt artikelnr" /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCompDialogOpen(false)}>Avbryt</Button>
            <Button onClick={handleSaveComp} disabled={!compForm.name.trim()}>{editingComp ? 'Uppdatera' : 'Lägg till'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Ta bort {deleteTarget?.type === 'product' ? 'produkt' : 'komponent'}</DialogTitle><DialogDescription>Är du säker på att du vill ta bort <span className="font-semibold">{deleteTarget?.name}</span>?</DialogDescription></DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>Avbryt</Button>
            <Button variant="destructive" onClick={handleDelete}><Trash2 className="mr-2 h-4 w-4" />Ta bort</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
