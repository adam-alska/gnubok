'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { ModuleWorkspaceShell } from '@/components/modules/ModuleWorkspaceShell'
import { KPICard } from '@/components/modules/shared/KPICard'
import { EmptyModuleState } from '@/components/modules/shared/EmptyModuleState'
import { StatusBadge } from '@/components/modules/shared/StatusBadge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { Plus, Pencil, Trash2, Loader2, Package, Search, AlertTriangle } from 'lucide-react'
import { cn } from '@/lib/utils'

interface ModuleWorkspaceProps {
  module: { slug: string; name: string; cat: string; desc: string; longDesc: string }
  sectorSlug: string
  settingsHref: string
}

interface StockItem {
  id: string
  sku: string
  name: string
  category: string
  currentStock: number
  reorderPoint: number
  maxStock: number
  unit: string
  location: string
  lastReceived: string
}

const CATEGORIES = ['Livsmedel', 'Dryck', 'Frukt & Gront', 'Mejeri', 'Kott & Chark', 'Non-food', 'Brod & Bageri', 'Ovrigt']
const UNITS = ['st', 'kg', 'l', 'forpackning', 'kartong', 'pall']

function generateId(): string {
  return crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`
}

function todayStr(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const EMPTY_FORM = {
  sku: '',
  name: '',
  category: 'Livsmedel',
  currentStock: 0,
  reorderPoint: 10,
  maxStock: 100,
  unit: 'st',
  location: '',
}

export function LagerhanteringWorkspace({ module: mod, sectorSlug, settingsHref }: ModuleWorkspaceProps) {
  const supabase = createClient()

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [items, setItems] = useState<StockItem[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [filterCategory, setFilterCategory] = useState<string>('all')

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingItem, setEditingItem] = useState<StockItem | null>(null)
  const [form, setForm] = useState(EMPTY_FORM)

  const [receiveDialogOpen, setReceiveDialogOpen] = useState(false)
  const [receiveItem, setReceiveItem] = useState<StockItem | null>(null)
  const [receiveQty, setReceiveQty] = useState(0)

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [itemToDelete, setItemToDelete] = useState<StockItem | null>(null)

  const saveItems = useCallback(async (newItems: StockItem[]) => {
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setSaving(false); return }
    await supabase.from('module_configs').upsert(
      { user_id: user.id, sector_slug: sectorSlug, module_slug: mod.slug, config_key: 'stock_items', config_value: newItems },
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
      .eq('user_id', user.id).eq('sector_slug', sectorSlug).eq('module_slug', mod.slug).eq('config_key', 'stock_items')
      .maybeSingle()
    if (data?.config_value && Array.isArray(data.config_value)) setItems(data.config_value as StockItem[])
    setLoading(false)
  }, [supabase, sectorSlug, mod.slug])

  useEffect(() => { fetchData() }, [fetchData])

  const filteredItems = useMemo(() => {
    let result = items
    if (filterCategory !== 'all') result = result.filter(i => i.category === filterCategory)
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      result = result.filter(i => i.name.toLowerCase().includes(q) || i.sku.toLowerCase().includes(q))
    }
    return result.sort((a, b) => a.name.localeCompare(b.name))
  }, [items, filterCategory, searchQuery])

  const belowReorder = useMemo(() => items.filter(i => i.currentStock <= i.reorderPoint), [items])
  const outOfStock = useMemo(() => items.filter(i => i.currentStock === 0), [items])

  function getStockStatus(item: StockItem): { label: string; variant: 'success' | 'warning' | 'danger' | 'info' | 'neutral' } {
    if (item.currentStock === 0) return { label: 'Slut', variant: 'danger' }
    if (item.currentStock <= item.reorderPoint) return { label: 'Bestall', variant: 'warning' }
    return { label: 'I lager', variant: 'success' }
  }

  function openNewItem() { setEditingItem(null); setForm({ ...EMPTY_FORM }); setDialogOpen(true) }
  function openEditItem(item: StockItem) {
    setEditingItem(item)
    setForm({ sku: item.sku, name: item.name, category: item.category, currentStock: item.currentStock, reorderPoint: item.reorderPoint, maxStock: item.maxStock, unit: item.unit, location: item.location })
    setDialogOpen(true)
  }

  async function handleSaveItem() {
    const item: StockItem = {
      id: editingItem?.id ?? generateId(),
      sku: form.sku.trim(), name: form.name.trim(), category: form.category,
      currentStock: form.currentStock, reorderPoint: form.reorderPoint, maxStock: form.maxStock,
      unit: form.unit, location: form.location, lastReceived: editingItem?.lastReceived ?? '',
    }
    let updated: StockItem[]
    if (editingItem) updated = items.map(i => i.id === editingItem.id ? item : i)
    else updated = [...items, item]
    setItems(updated)
    setDialogOpen(false)
    await saveItems(updated)
  }

  async function handleReceive() {
    if (!receiveItem || receiveQty <= 0) return
    const updated = items.map(i => i.id === receiveItem.id ? { ...i, currentStock: i.currentStock + receiveQty, lastReceived: todayStr() } : i)
    setItems(updated)
    setReceiveDialogOpen(false)
    setReceiveItem(null)
    setReceiveQty(0)
    await saveItems(updated)
  }

  async function handleDeleteItem() {
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
        title={mod.name} description={mod.desc} category="operativ" sectorName="Detaljhandel"
        backHref={`/m/${sectorSlug}`} settingsHref={settingsHref}
        actions={<Button onClick={openNewItem}><Plus className="mr-2 h-4 w-4" />Ny artikel</Button>}
      >
        <Tabs defaultValue="lager" className="space-y-6">
          <TabsList>
            <TabsTrigger value="lager">Lagersaldo</TabsTrigger>
            <TabsTrigger value="bristlista">Bristlista ({belowReorder.length})</TabsTrigger>
          </TabsList>

          <TabsContent value="lager" className="space-y-6">
            {loading ? (
              <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
            ) : (
              <>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  <KPICard label="Antal artiklar" value={String(items.length)} unit="st" />
                  <KPICard label="Under bestallningspunkt" value={String(belowReorder.length)} unit="st" trend={belowReorder.length > 0 ? 'down' : 'up'} />
                  <KPICard label="Slut i lager" value={String(outOfStock.length)} unit="st" trend={outOfStock.length > 0 ? 'down' : 'up'} />
                  <KPICard label="Kategorier" value={String(new Set(items.map(i => i.category)).size)} unit="st" />
                </div>

                <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
                  <div className="relative flex-1 max-w-sm">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input placeholder="Sok artikel..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-9" />
                  </div>
                  <Select value={filterCategory} onValueChange={setFilterCategory}>
                    <SelectTrigger className="w-[180px]"><SelectValue placeholder="Alla kategorier" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Alla kategorier</SelectItem>
                      {CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>

                {filteredItems.length === 0 ? (
                  <EmptyModuleState icon={Package} title="Inga artiklar" description="Lagg till artiklar for att borja hantera lager." actionLabel="Ny artikel" onAction={openNewItem} />
                ) : (
                  <div className="rounded-xl border border-border overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-muted/50">
                          <TableHead className="font-medium">SKU</TableHead>
                          <TableHead className="font-medium">Artikel</TableHead>
                          <TableHead className="font-medium">Kategori</TableHead>
                          <TableHead className="font-medium text-right">Saldo</TableHead>
                          <TableHead className="font-medium text-right">Best.punkt</TableHead>
                          <TableHead className="font-medium">Status</TableHead>
                          <TableHead className="font-medium">Plats</TableHead>
                          <TableHead className="font-medium text-right">Atgarder</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredItems.map((item) => {
                          const status = getStockStatus(item)
                          return (
                            <TableRow key={item.id}>
                              <TableCell className="font-mono text-xs">{item.sku}</TableCell>
                              <TableCell className="font-medium">{item.name}</TableCell>
                              <TableCell><Badge variant="outline">{item.category}</Badge></TableCell>
                              <TableCell className="text-right tabular-nums font-medium">
                                <span className={cn(item.currentStock <= item.reorderPoint ? 'text-red-600' : '')}>{item.currentStock} {item.unit}</span>
                              </TableCell>
                              <TableCell className="text-right tabular-nums text-muted-foreground">{item.reorderPoint}</TableCell>
                              <TableCell><StatusBadge label={status.label} variant={status.variant} /></TableCell>
                              <TableCell className="text-xs text-muted-foreground">{item.location || '-'}</TableCell>
                              <TableCell className="text-right">
                                <div className="flex items-center justify-end gap-1">
                                  <Button variant="outline" size="sm" className="text-xs" onClick={() => { setReceiveItem(item); setReceiveQty(0); setReceiveDialogOpen(true) }}>Inleverans</Button>
                                  <Button variant="ghost" size="icon" onClick={() => openEditItem(item)}><Pencil className="h-4 w-4" /></Button>
                                  <Button variant="ghost" size="icon" className="text-red-600 hover:text-red-700" onClick={() => { setItemToDelete(item); setDeleteDialogOpen(true) }}><Trash2 className="h-4 w-4" /></Button>
                                </div>
                              </TableCell>
                            </TableRow>
                          )
                        })}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </>
            )}
          </TabsContent>

          <TabsContent value="bristlista" className="space-y-4">
            {belowReorder.length === 0 ? (
              <EmptyModuleState icon={AlertTriangle} title="Ingen brist" description="Alla artiklar ar over bestallningspunkten." />
            ) : (
              <div className="rounded-xl border border-border overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead className="font-medium">SKU</TableHead>
                      <TableHead className="font-medium">Artikel</TableHead>
                      <TableHead className="font-medium text-right">Saldo</TableHead>
                      <TableHead className="font-medium text-right">Best.punkt</TableHead>
                      <TableHead className="font-medium text-right">Brist</TableHead>
                      <TableHead className="font-medium text-right">Atgarder</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {belowReorder.sort((a, b) => (a.currentStock - a.reorderPoint) - (b.currentStock - b.reorderPoint)).map((item) => (
                      <TableRow key={item.id}>
                        <TableCell className="font-mono text-xs">{item.sku}</TableCell>
                        <TableCell className="font-medium">{item.name}</TableCell>
                        <TableCell className="text-right tabular-nums text-red-600 font-medium">{item.currentStock} {item.unit}</TableCell>
                        <TableCell className="text-right tabular-nums">{item.reorderPoint}</TableCell>
                        <TableCell className="text-right tabular-nums font-medium">{item.reorderPoint - item.currentStock} {item.unit}</TableCell>
                        <TableCell className="text-right">
                          <Button variant="outline" size="sm" className="text-xs" onClick={() => { setReceiveItem(item); setReceiveQty(item.reorderPoint - item.currentStock); setReceiveDialogOpen(true) }}>Inleverans</Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </TabsContent>
        </Tabs>
        {saving && <div className="flex items-center gap-2 text-xs text-muted-foreground mt-4"><Loader2 className="h-3.5 w-3.5 animate-spin" />Sparar...</div>}
      </ModuleWorkspaceShell>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{editingItem ? 'Redigera artikel' : 'Ny artikel'}</DialogTitle><DialogDescription>{editingItem ? 'Uppdatera artikelinformation.' : 'Lagg till en ny lagerartikel.'}</DialogDescription></DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2"><Label>SKU *</Label><Input value={form.sku} onChange={(e) => setForm(f => ({ ...f, sku: e.target.value }))} placeholder="ART-001" /></div>
              <div className="grid gap-2"><Label>Namn *</Label><Input value={form.name} onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Mjolk 3%" /></div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2"><Label>Kategori</Label><Select value={form.category} onValueChange={(v) => setForm(f => ({ ...f, category: v }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent></Select></div>
              <div className="grid gap-2"><Label>Enhet</Label><Select value={form.unit} onValueChange={(v) => setForm(f => ({ ...f, unit: v }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{UNITS.map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}</SelectContent></Select></div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="grid gap-2"><Label>Saldo</Label><Input type="number" min={0} value={form.currentStock} onChange={(e) => setForm(f => ({ ...f, currentStock: Number(e.target.value) || 0 }))} /></div>
              <div className="grid gap-2"><Label>Best.punkt</Label><Input type="number" min={0} value={form.reorderPoint} onChange={(e) => setForm(f => ({ ...f, reorderPoint: Number(e.target.value) || 0 }))} /></div>
              <div className="grid gap-2"><Label>Max</Label><Input type="number" min={0} value={form.maxStock} onChange={(e) => setForm(f => ({ ...f, maxStock: Number(e.target.value) || 0 }))} /></div>
            </div>
            <div className="grid gap-2"><Label>Lagerplats</Label><Input value={form.location} onChange={(e) => setForm(f => ({ ...f, location: e.target.value }))} placeholder="Hylla A3" /></div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setDialogOpen(false)}>Avbryt</Button><Button onClick={handleSaveItem} disabled={!form.name.trim() || !form.sku.trim()}>{editingItem ? 'Uppdatera' : 'Lagg till'}</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={receiveDialogOpen} onOpenChange={setReceiveDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Inleverans</DialogTitle><DialogDescription>Registrera inleverans for {receiveItem?.name}. Nuvarande saldo: {receiveItem?.currentStock} {receiveItem?.unit}.</DialogDescription></DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-2"><Label>Antal att leverera in</Label><Input type="number" min={1} value={receiveQty} onChange={(e) => setReceiveQty(Number(e.target.value) || 0)} /></div>
            {receiveQty > 0 && receiveItem && <p className="text-xs text-muted-foreground">Nytt saldo: <strong>{receiveItem.currentStock + receiveQty} {receiveItem.unit}</strong></p>}
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setReceiveDialogOpen(false)}>Avbryt</Button><Button onClick={handleReceive} disabled={receiveQty <= 0}>Bekrafta inleverans</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Ta bort artikel</DialogTitle><DialogDescription>Ar du saker pa att du vill ta bort {itemToDelete?.name}?</DialogDescription></DialogHeader>
          <DialogFooter><Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>Avbryt</Button><Button variant="destructive" onClick={handleDeleteItem}><Trash2 className="mr-2 h-4 w-4" />Ta bort</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
