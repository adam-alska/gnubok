'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { ModuleWorkspaceShell } from '@/components/modules/ModuleWorkspaceShell'
import { KPICard } from '@/components/modules/shared/KPICard'
import { EmptyModuleState } from '@/components/modules/shared/EmptyModuleState'
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
import { Plus, Pencil, Trash2, Loader2, DollarSign, Search, History } from 'lucide-react'
import { cn } from '@/lib/utils'

interface ModuleWorkspaceProps {
  module: { slug: string; name: string; cat: string; desc: string; longDesc: string }
  sectorSlug: string
  settingsHref: string
}

interface PriceItem {
  id: string
  sku: string
  name: string
  category: string
  purchasePrice: number
  sellingPrice: number
  marginKr: number
  marginPct: number
  lastChanged: string
  changeLog: Array<{ date: string; oldPrice: number; newPrice: number; reason: string }>
}

const CATEGORIES = ['Livsmedel', 'Dryck', 'Frukt & Gront', 'Mejeri', 'Kott & Chark', 'Non-food', 'Brod & Bageri', 'Ovrigt']

function generateId(): string {
  return crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`
}

function todayStr(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function fmt(n: number): string {
  return new Intl.NumberFormat('sv-SE', { maximumFractionDigits: 2 }).format(n)
}

function fmtPct(n: number): string {
  return isFinite(n) ? n.toFixed(1) : '0.0'
}

const EMPTY_FORM = {
  sku: '',
  name: '',
  category: 'Livsmedel',
  purchasePrice: 0,
  sellingPrice: 0,
  changeReason: '',
}

export function PrishanteringWorkspace({ module: mod, sectorSlug, settingsHref }: ModuleWorkspaceProps) {
  const supabase = createClient()

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [items, setItems] = useState<PriceItem[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [filterCategory, setFilterCategory] = useState<string>('all')

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingItem, setEditingItem] = useState<PriceItem | null>(null)
  const [form, setForm] = useState(EMPTY_FORM)

  const [logDialogOpen, setLogDialogOpen] = useState(false)
  const [logItem, setLogItem] = useState<PriceItem | null>(null)

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [itemToDelete, setItemToDelete] = useState<PriceItem | null>(null)

  const saveItems = useCallback(async (newItems: PriceItem[]) => {
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setSaving(false); return }
    await supabase.from('module_configs').upsert(
      { user_id: user.id, sector_slug: sectorSlug, module_slug: mod.slug, config_key: 'price_items', config_value: newItems },
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
      .eq('user_id', user.id).eq('sector_slug', sectorSlug).eq('module_slug', mod.slug).eq('config_key', 'price_items')
      .maybeSingle()
    if (data?.config_value && Array.isArray(data.config_value)) setItems(data.config_value as PriceItem[])
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

  const avgMargin = useMemo(() => items.length > 0 ? items.reduce((s, i) => s + i.marginPct, 0) / items.length : 0, [items])
  const lowMarginCount = useMemo(() => items.filter(i => i.marginPct < 15).length, [items])
  const recentChanges = useMemo(() => {
    const weekAgo = new Date()
    weekAgo.setDate(weekAgo.getDate() - 7)
    const weekStr = `${weekAgo.getFullYear()}-${String(weekAgo.getMonth() + 1).padStart(2, '0')}-${String(weekAgo.getDate()).padStart(2, '0')}`
    return items.filter(i => i.lastChanged >= weekStr).length
  }, [items])

  function openNewItem() { setEditingItem(null); setForm({ ...EMPTY_FORM }); setDialogOpen(true) }
  function openEditItem(item: PriceItem) {
    setEditingItem(item)
    setForm({ sku: item.sku, name: item.name, category: item.category, purchasePrice: item.purchasePrice, sellingPrice: item.sellingPrice, changeReason: '' })
    setDialogOpen(true)
  }

  async function handleSaveItem() {
    const marginKr = form.sellingPrice - form.purchasePrice
    const marginPct = form.sellingPrice > 0 ? (marginKr / form.sellingPrice) * 100 : 0

    const changeLog = editingItem ? [...(editingItem.changeLog || [])] : []
    if (editingItem && editingItem.sellingPrice !== form.sellingPrice) {
      changeLog.push({ date: todayStr(), oldPrice: editingItem.sellingPrice, newPrice: form.sellingPrice, reason: form.changeReason || 'Prisjustering' })
    }

    const item: PriceItem = {
      id: editingItem?.id ?? generateId(),
      sku: form.sku.trim(), name: form.name.trim(), category: form.category,
      purchasePrice: form.purchasePrice, sellingPrice: form.sellingPrice,
      marginKr, marginPct, lastChanged: todayStr(), changeLog,
    }
    let updated: PriceItem[]
    if (editingItem) updated = items.map(i => i.id === editingItem.id ? item : i)
    else updated = [...items, item]
    setItems(updated)
    setDialogOpen(false)
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
        {loading ? (
          <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : (
          <div className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <KPICard label="Snittmarginal" value={fmtPct(avgMargin)} unit="%" trend={avgMargin >= 25 ? 'up' : avgMargin >= 15 ? 'neutral' : 'down'} />
              <KPICard label="Antal artiklar" value={String(items.length)} unit="st" />
              <KPICard label="Lag marginal (<15%)" value={String(lowMarginCount)} unit="st" trend={lowMarginCount > 0 ? 'down' : 'up'} />
              <KPICard label="Prisandringar (7 dgr)" value={String(recentChanges)} unit="st" />
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
              <EmptyModuleState icon={DollarSign} title="Inga artiklar" description="Lagg till artiklar for att hantera priser och marginaler." actionLabel="Ny artikel" onAction={openNewItem} />
            ) : (
              <div className="rounded-xl border border-border overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead className="font-medium">SKU</TableHead>
                      <TableHead className="font-medium">Artikel</TableHead>
                      <TableHead className="font-medium">Kategori</TableHead>
                      <TableHead className="font-medium text-right">Inkop (kr)</TableHead>
                      <TableHead className="font-medium text-right">Forsaljning (kr)</TableHead>
                      <TableHead className="font-medium text-right">Marginal</TableHead>
                      <TableHead className="font-medium">Senast andrad</TableHead>
                      <TableHead className="font-medium text-right">Atgarder</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredItems.map((item) => (
                      <TableRow key={item.id}>
                        <TableCell className="font-mono text-xs">{item.sku}</TableCell>
                        <TableCell className="font-medium">{item.name}</TableCell>
                        <TableCell><Badge variant="outline">{item.category}</Badge></TableCell>
                        <TableCell className="text-right tabular-nums">{fmt(item.purchasePrice)}</TableCell>
                        <TableCell className="text-right tabular-nums">{fmt(item.sellingPrice)}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          <span className={cn('font-medium', item.marginPct >= 25 ? 'text-emerald-600' : item.marginPct >= 15 ? 'text-amber-600' : 'text-red-600')}>
                            {fmtPct(item.marginPct)}%
                          </span>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">{item.lastChanged}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            {item.changeLog && item.changeLog.length > 0 && (
                              <Button variant="ghost" size="icon" onClick={() => { setLogItem(item); setLogDialogOpen(true) }} title="Prishistorik"><History className="h-4 w-4" /></Button>
                            )}
                            <Button variant="ghost" size="icon" onClick={() => openEditItem(item)}><Pencil className="h-4 w-4" /></Button>
                            <Button variant="ghost" size="icon" className="text-red-600 hover:text-red-700" onClick={() => { setItemToDelete(item); setDeleteDialogOpen(true) }}><Trash2 className="h-4 w-4" /></Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
            {saving && <div className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" />Sparar...</div>}
          </div>
        )}
      </ModuleWorkspaceShell>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{editingItem ? 'Redigera pris' : 'Ny artikel'}</DialogTitle><DialogDescription>{editingItem ? 'Uppdatera pris och marginal.' : 'Lagg till en ny artikel med prissattning.'}</DialogDescription></DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2"><Label>SKU *</Label><Input value={form.sku} onChange={(e) => setForm(f => ({ ...f, sku: e.target.value }))} placeholder="ART-001" disabled={!!editingItem} /></div>
              <div className="grid gap-2"><Label>Artikelnamn *</Label><Input value={form.name} onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))} /></div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="grid gap-2"><Label>Kategori</Label><Select value={form.category} onValueChange={(v) => setForm(f => ({ ...f, category: v }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent></Select></div>
              <div className="grid gap-2"><Label>Inkopspris (kr) *</Label><Input type="number" min={0} step="0.01" value={form.purchasePrice} onChange={(e) => setForm(f => ({ ...f, purchasePrice: Number(e.target.value) || 0 }))} /></div>
              <div className="grid gap-2"><Label>Forsaljningspris (kr) *</Label><Input type="number" min={0} step="0.01" value={form.sellingPrice} onChange={(e) => setForm(f => ({ ...f, sellingPrice: Number(e.target.value) || 0 }))} /></div>
            </div>
            {editingItem && editingItem.sellingPrice !== form.sellingPrice && (
              <div className="grid gap-2"><Label>Anledning till prisandring</Label><Input value={form.changeReason} onChange={(e) => setForm(f => ({ ...f, changeReason: e.target.value }))} placeholder="T.ex. leverantorshojning" /></div>
            )}
            {form.sellingPrice > 0 && (
              <p className="text-xs text-muted-foreground">
                Marginal: <strong className={cn((form.sellingPrice - form.purchasePrice) / form.sellingPrice * 100 >= 15 ? 'text-emerald-600' : 'text-red-600')}>
                  {fmt(form.sellingPrice - form.purchasePrice)} kr ({fmtPct((form.sellingPrice - form.purchasePrice) / form.sellingPrice * 100)}%)
                </strong>
              </p>
            )}
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setDialogOpen(false)}>Avbryt</Button><Button onClick={handleSaveItem} disabled={!form.name.trim() || !form.sku.trim() || form.sellingPrice <= 0}>{editingItem ? 'Uppdatera' : 'Lagg till'}</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={logDialogOpen} onOpenChange={setLogDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Prishistorik: {logItem?.name}</DialogTitle><DialogDescription>Alla prisandringar for denna artikel.</DialogDescription></DialogHeader>
          <div className="space-y-2 py-2 max-h-64 overflow-y-auto">
            {logItem?.changeLog?.length === 0 ? (
              <p className="text-sm text-muted-foreground">Inga prisandringar registrerade.</p>
            ) : (
              logItem?.changeLog?.map((log, i) => (
                <div key={i} className="flex items-center justify-between text-sm border-b border-border pb-2 last:border-0">
                  <div><span className="text-muted-foreground">{log.date}</span><span className="ml-2">{log.reason}</span></div>
                  <div className="tabular-nums"><span className="text-red-500 line-through mr-2">{fmt(log.oldPrice)}</span><span className="font-medium">{fmt(log.newPrice)} kr</span></div>
                </div>
              ))
            )}
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setLogDialogOpen(false)}>Stang</Button></DialogFooter>
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
