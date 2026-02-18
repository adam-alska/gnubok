'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { ModuleWorkspaceShell } from '@/components/modules/ModuleWorkspaceShell'
import { EmptyModuleState } from '@/components/modules/shared/EmptyModuleState'
import { KPICard } from '@/components/modules/shared/KPICard'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Plus,
  Pencil,
  Trash2,
  Loader2,
  Search,
  ShoppingBag,
  ImageIcon,
} from 'lucide-react'

interface ModuleWorkspaceProps {
  module: { slug: string; name: string; cat: string; desc: string; longDesc: string }
  sectorSlug: string
  settingsHref: string
}

type ProductStatus = 'Aktiv' | 'Utkast' | 'Arkiverad'

interface Product {
  id: string
  sku: string
  name: string
  description: string
  category: string
  price: number
  compareAtPrice: number
  weight: number
  status: ProductStatus
  imageCount: number
  attributes: { key: string; value: string }[]
  updatedAt: string
}

const PRODUCT_STATUSES: ProductStatus[] = ['Aktiv', 'Utkast', 'Arkiverad']
const CATEGORIES = ['Kläder', 'Skor', 'Accessoarer', 'Elektronik', 'Heminredning', 'Sport', 'Övrigt']

const STATUS_COLORS: Record<ProductStatus, string> = {
  'Aktiv': 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400',
  'Utkast': 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400',
  'Arkiverad': 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400',
}

const DEFAULT_PRODUCTS: Product[] = [
  { id: '1', sku: 'SKU-001', name: 'T-shirt Basic', description: 'Klassisk t-shirt i 100% bomull. Finns i flera färger.', category: 'Kläder', price: 199, compareAtPrice: 249, weight: 0.2, status: 'Aktiv', imageCount: 4, attributes: [{ key: 'Material', value: '100% Bomull' }, { key: 'Färg', value: 'Svart, Vit, Grå' }], updatedAt: '2025-01-15' },
  { id: '2', sku: 'SKU-002', name: 'Hoodie Premium', description: 'Varm och bekväm hoodie med dragkedja. Fleece-foder.', category: 'Kläder', price: 499, compareAtPrice: 599, weight: 0.5, status: 'Aktiv', imageCount: 6, attributes: [{ key: 'Material', value: '80% Bomull, 20% Polyester' }, { key: 'Storlek', value: 'S, M, L, XL' }], updatedAt: '2025-01-14' },
  { id: '3', sku: 'SKU-003', name: 'Mössa Vinter', description: 'Varm vintermössa i merinoull.', category: 'Accessoarer', price: 55, compareAtPrice: 0, weight: 0.1, status: 'Aktiv', imageCount: 2, attributes: [{ key: 'Material', value: 'Merinoull' }], updatedAt: '2025-01-10' },
  { id: '4', sku: 'SKU-004', name: 'Ryggsäck 25L', description: 'Vattentålig ryggsäck med laptopfack.', category: 'Accessoarer', price: 649, compareAtPrice: 799, weight: 0.8, status: 'Aktiv', imageCount: 5, attributes: [{ key: 'Volym', value: '25L' }, { key: 'Vattentålig', value: 'Ja' }], updatedAt: '2025-01-08' },
  { id: '5', sku: 'SKU-005', name: 'Solglasögon Sport', description: 'Polariserade sportsolglasögon med UV-skydd.', category: 'Accessoarer', price: 299, compareAtPrice: 0, weight: 0.05, status: 'Utkast', imageCount: 3, attributes: [{ key: 'UV-skydd', value: 'UV400' }, { key: 'Polariserade', value: 'Ja' }], updatedAt: '2025-01-05' },
  { id: '6', sku: 'SKU-006', name: 'Löparskor Trail', description: 'Trail-löparskor med bra grepp.', category: 'Skor', price: 1299, compareAtPrice: 1499, weight: 0.7, status: 'Utkast', imageCount: 0, attributes: [], updatedAt: '2024-12-20' },
]

function fmt(n: number): string {
  return new Intl.NumberFormat('sv-SE', { maximumFractionDigits: 0 }).format(n)
}

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
}

const EMPTY_FORM = {
  sku: '',
  name: '',
  description: '',
  category: 'Kläder',
  price: '',
  compareAtPrice: '',
  weight: '',
  status: 'Utkast' as ProductStatus,
}

export function ProduktdatahanteringWorkspace({ module: mod, sectorSlug, settingsHref }: ModuleWorkspaceProps) {
  const supabase = createClient()

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [products, setProducts] = useState<Product[]>([])

  const [searchQuery, setSearchQuery] = useState('')
  const [filterStatus, setFilterStatus] = useState<ProductStatus | 'all'>('all')
  const [filterCategory, setFilterCategory] = useState('all')

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingProduct, setEditingProduct] = useState<Product | null>(null)
  const [form, setForm] = useState(EMPTY_FORM)

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [productToDelete, setProductToDelete] = useState<Product | null>(null)

  const saveProducts = useCallback(async (newProducts: Product[]) => {
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setSaving(false); return }

    await supabase.from('module_configs').upsert(
      { user_id: user.id, sector_slug: sectorSlug, module_slug: mod.slug, config_key: 'products', config_value: newProducts },
      { onConflict: 'user_id,sector_slug,module_slug,config_key' }
    )
    setSaving(false)
  }, [supabase, sectorSlug, mod.slug])

  const fetchData = useCallback(async () => {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); return }

    const { data } = await supabase
      .from('module_configs').select('config_value')
      .eq('user_id', user.id).eq('sector_slug', sectorSlug).eq('module_slug', mod.slug)
      .eq('config_key', 'products').maybeSingle()

    if (data?.config_value && Array.isArray(data.config_value) && data.config_value.length > 0) {
      setProducts(data.config_value as Product[])
    } else {
      setProducts(DEFAULT_PRODUCTS)
      await supabase.from('module_configs').upsert(
        { user_id: user.id, sector_slug: sectorSlug, module_slug: mod.slug, config_key: 'products', config_value: DEFAULT_PRODUCTS },
        { onConflict: 'user_id,sector_slug,module_slug,config_key' }
      )
    }

    setLoading(false)
  }, [supabase, sectorSlug, mod.slug])

  useEffect(() => { fetchData() }, [fetchData])

  const filteredProducts = useMemo(() => {
    let result = products
    if (filterStatus !== 'all') result = result.filter((p) => p.status === filterStatus)
    if (filterCategory !== 'all') result = result.filter((p) => p.category === filterCategory)
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      result = result.filter((p) => p.sku.toLowerCase().includes(q) || p.name.toLowerCase().includes(q) || p.description.toLowerCase().includes(q))
    }
    return result.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  }, [products, filterStatus, filterCategory, searchQuery])

  const activeCount = useMemo(() => products.filter((p) => p.status === 'Aktiv').length, [products])
  const draftCount = useMemo(() => products.filter((p) => p.status === 'Utkast').length, [products])
  const missingImages = useMemo(() => products.filter((p) => p.imageCount === 0 && p.status !== 'Arkiverad').length, [products])
  const missingDesc = useMemo(() => products.filter((p) => !p.description.trim() && p.status !== 'Arkiverad').length, [products])

  function openNewProduct() {
    setEditingProduct(null)
    setForm({ ...EMPTY_FORM })
    setDialogOpen(true)
  }

  function openEditProduct(product: Product) {
    setEditingProduct(product)
    setForm({
      sku: product.sku,
      name: product.name,
      description: product.description,
      category: product.category,
      price: String(product.price),
      compareAtPrice: String(product.compareAtPrice || ''),
      weight: String(product.weight),
      status: product.status,
    })
    setDialogOpen(true)
  }

  async function handleSaveProduct() {
    const price = parseFloat(form.price)
    if (!form.sku.trim() || !form.name.trim() || isNaN(price)) return

    const today = new Date().toISOString().slice(0, 10)
    const newProduct: Product = {
      id: editingProduct?.id ?? generateId(),
      sku: form.sku.trim(),
      name: form.name.trim(),
      description: form.description.trim(),
      category: form.category,
      price,
      compareAtPrice: parseFloat(form.compareAtPrice) || 0,
      weight: parseFloat(form.weight) || 0,
      status: form.status,
      imageCount: editingProduct?.imageCount ?? 0,
      attributes: editingProduct?.attributes ?? [],
      updatedAt: today,
    }

    let updated: Product[]
    if (editingProduct) {
      updated = products.map((p) => p.id === editingProduct.id ? newProduct : p)
    } else {
      if (products.some((p) => p.sku === newProduct.sku)) return
      updated = [...products, newProduct]
    }

    setProducts(updated)
    setDialogOpen(false)
    await saveProducts(updated)
  }

  async function handleDeleteProduct() {
    if (!productToDelete) return
    const updated = products.filter((p) => p.id !== productToDelete.id)
    setProducts(updated)
    setDeleteDialogOpen(false)
    setProductToDelete(null)
    await saveProducts(updated)
  }

  return (
    <>
      <ModuleWorkspaceShell
        title={mod.name}
        description={mod.desc}
        category="operativ"
        sectorName="E-handel"
        backHref={`/m/${sectorSlug}`}
        settingsHref={settingsHref}
        actions={
          <Button onClick={openNewProduct}>
            <Plus className="mr-2 h-4 w-4" />
            Ny produkt
          </Button>
        }
      >
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <KPICard label="Aktiva produkter" value={String(activeCount)} unit="st" />
              <KPICard label="Utkast" value={String(draftCount)} unit="st" />
              <KPICard label="Saknar bilder" value={String(missingImages)} unit="st" trend={missingImages > 0 ? 'down' : 'neutral'} trendLabel={missingImages > 0 ? 'Åtgärda' : 'OK'} />
              <KPICard label="Saknar beskrivning" value={String(missingDesc)} unit="st" trend={missingDesc > 0 ? 'down' : 'neutral'} />
            </div>

            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
              <div className="relative flex-1 max-w-sm">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Sök SKU, namn eller beskrivning..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-9" />
              </div>
              <Select value={filterStatus} onValueChange={(v) => setFilterStatus(v as ProductStatus | 'all')}>
                <SelectTrigger className="w-[160px]"><SelectValue placeholder="Status" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Alla statusar</SelectItem>
                  {PRODUCT_STATUSES.map((s) => (<SelectItem key={s} value={s}>{s}</SelectItem>))}
                </SelectContent>
              </Select>
              <Select value={filterCategory} onValueChange={setFilterCategory}>
                <SelectTrigger className="w-[160px]"><SelectValue placeholder="Kategori" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Alla kategorier</SelectItem>
                  {CATEGORIES.map((c) => (<SelectItem key={c} value={c}>{c}</SelectItem>))}
                </SelectContent>
              </Select>
              {saving && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Sparar...
                </div>
              )}
            </div>

            {filteredProducts.length === 0 ? (
              <EmptyModuleState
                icon={ShoppingBag}
                title="Inga produkter"
                description={searchQuery || filterStatus !== 'all' || filterCategory !== 'all' ? 'Inga produkter matchar filtret.' : 'Lägg till produkter för att hantera produktdata.'}
                actionLabel={!searchQuery && filterStatus === 'all' ? 'Ny produkt' : undefined}
                onAction={!searchQuery && filterStatus === 'all' ? openNewProduct : undefined}
              />
            ) : (
              <div className="rounded-xl border border-border overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead className="font-medium">SKU</TableHead>
                      <TableHead className="font-medium">Produktnamn</TableHead>
                      <TableHead className="font-medium">Kategori</TableHead>
                      <TableHead className="font-medium text-right">Pris</TableHead>
                      <TableHead className="font-medium text-right">Vikt</TableHead>
                      <TableHead className="font-medium text-center">Bilder</TableHead>
                      <TableHead className="font-medium">Status</TableHead>
                      <TableHead className="font-medium">Uppdaterad</TableHead>
                      <TableHead className="font-medium text-right">Åtgärder</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredProducts.map((p) => (
                      <TableRow key={p.id}>
                        <TableCell className="font-mono font-medium">{p.sku}</TableCell>
                        <TableCell>
                          <div>
                            <p className="font-medium">{p.name}</p>
                            {p.description && <p className="text-xs text-muted-foreground truncate max-w-[200px]">{p.description}</p>}
                          </div>
                        </TableCell>
                        <TableCell><Badge variant="outline">{p.category}</Badge></TableCell>
                        <TableCell className="text-right tabular-nums">
                          <div>
                            <span className="font-medium">{fmt(p.price)} kr</span>
                            {p.compareAtPrice > 0 && <span className="text-xs text-muted-foreground line-through ml-1">{fmt(p.compareAtPrice)}</span>}
                          </div>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{p.weight} kg</TableCell>
                        <TableCell className="text-center">
                          <div className="flex items-center justify-center gap-1">
                            <ImageIcon className={`h-3.5 w-3.5 ${p.imageCount > 0 ? 'text-emerald-600' : 'text-red-400'}`} />
                            <span className="tabular-nums">{p.imageCount}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary" className={STATUS_COLORS[p.status]}>{p.status}</Badge>
                        </TableCell>
                        <TableCell className="text-muted-foreground">{p.updatedAt}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button variant="ghost" size="icon" onClick={() => openEditProduct(p)} title="Redigera">
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="icon" className="text-red-600 hover:text-red-700" onClick={() => { setProductToDelete(p); setDeleteDialogOpen(true) }} title="Ta bort">
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        )}
      </ModuleWorkspaceShell>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingProduct ? 'Redigera produkt' : 'Ny produkt'}</DialogTitle>
            <DialogDescription>
              {editingProduct ? 'Uppdatera produktdata.' : 'Fyll i produktinformation.'}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>SKU *</Label>
                <Input value={form.sku} onChange={(e) => setForm((f) => ({ ...f, sku: e.target.value }))} placeholder="SKU-001" disabled={!!editingProduct} />
              </div>
              <div className="grid gap-2">
                <Label>Produktnamn *</Label>
                <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="T-shirt Basic" />
              </div>
            </div>
            <div className="grid gap-2">
              <Label>Beskrivning</Label>
              <Textarea value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} placeholder="Beskriv produkten..." rows={3} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Kategori *</Label>
                <Select value={form.category} onValueChange={(v) => setForm((f) => ({ ...f, category: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map((c) => (<SelectItem key={c} value={c}>{c}</SelectItem>))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label>Status</Label>
                <Select value={form.status} onValueChange={(v) => setForm((f) => ({ ...f, status: v as ProductStatus }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PRODUCT_STATUSES.map((s) => (<SelectItem key={s} value={s}>{s}</SelectItem>))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="grid gap-2">
                <Label>Pris (kr) *</Label>
                <Input type="number" min={0} value={form.price} onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))} placeholder="199" />
              </div>
              <div className="grid gap-2">
                <Label>Jämförpris (kr)</Label>
                <Input type="number" min={0} value={form.compareAtPrice} onChange={(e) => setForm((f) => ({ ...f, compareAtPrice: e.target.value }))} placeholder="249" />
              </div>
              <div className="grid gap-2">
                <Label>Vikt (kg)</Label>
                <Input type="number" min={0} step="0.01" value={form.weight} onChange={(e) => setForm((f) => ({ ...f, weight: e.target.value }))} placeholder="0.2" />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Avbryt</Button>
            <Button onClick={handleSaveProduct} disabled={!form.sku.trim() || !form.name.trim() || !form.price}>
              {editingProduct ? 'Uppdatera' : 'Skapa produkt'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Ta bort produkt</DialogTitle>
            <DialogDescription>
              Är du säker på att du vill ta bort{' '}
              <span className="font-semibold">{productToDelete?.name}</span> ({productToDelete?.sku})?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>Avbryt</Button>
            <Button variant="destructive" onClick={handleDeleteProduct}>
              <Trash2 className="mr-2 h-4 w-4" />
              Ta bort
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
