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
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
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
  Package,
  Save,
} from 'lucide-react'

interface ModuleWorkspaceProps {
  module: { slug: string; name: string; cat: string; desc: string; longDesc: string }
  sectorSlug: string
  settingsHref: string
}

type ValuationMethod = 'FIFO' | 'Vägt genomsnitt'

interface InventoryItem {
  id: string
  sku: string
  name: string
  qty: number
  unitCost: number
  totalValue: number
  method: ValuationMethod
  lastUpdated: string
}

interface Settings {
  defaultMethod: ValuationMethod
  obsolescenceThresholdDays: number
}

const DEFAULT_SETTINGS: Settings = {
  defaultMethod: 'FIFO',
  obsolescenceThresholdDays: 180,
}

const DEFAULT_ITEMS: InventoryItem[] = [
  { id: '1', sku: 'SKU-001', name: 'T-shirt Basic', qty: 150, unitCost: 89, totalValue: 13350, method: 'FIFO', lastUpdated: '2025-01-15' },
  { id: '2', sku: 'SKU-002', name: 'Hoodie Premium', qty: 45, unitCost: 249, totalValue: 11205, method: 'FIFO', lastUpdated: '2025-01-10' },
  { id: '3', sku: 'SKU-003', name: 'Mössa Vinter', qty: 200, unitCost: 55, totalValue: 11000, method: 'Vägt genomsnitt', lastUpdated: '2024-11-20' },
  { id: '4', sku: 'SKU-004', name: 'Ryggsäck 25L', qty: 30, unitCost: 320, totalValue: 9600, method: 'FIFO', lastUpdated: '2025-01-08' },
  { id: '5', sku: 'SKU-005', name: 'Solglasögon Sport', qty: 80, unitCost: 145, totalValue: 11600, method: 'Vägt genomsnitt', lastUpdated: '2024-08-05' },
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
  qty: '',
  unitCost: '',
  method: 'FIFO' as ValuationMethod,
}

export function LagervaderingEhandelWorkspace({ module: mod, sectorSlug, settingsHref }: ModuleWorkspaceProps) {
  const supabase = createClient()

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [items, setItems] = useState<InventoryItem[]>([])
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS)

  const [searchQuery, setSearchQuery] = useState('')
  const [filterMethod, setFilterMethod] = useState<ValuationMethod | 'all'>('all')

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingItem, setEditingItem] = useState<InventoryItem | null>(null)
  const [form, setForm] = useState(EMPTY_FORM)

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [itemToDelete, setItemToDelete] = useState<InventoryItem | null>(null)

  const [methodInput, setMethodInput] = useState<ValuationMethod>(DEFAULT_SETTINGS.defaultMethod)
  const [thresholdInput, setThresholdInput] = useState(String(DEFAULT_SETTINGS.obsolescenceThresholdDays))

  const saveItems = useCallback(async (newItems: InventoryItem[]) => {
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setSaving(false); return }

    await supabase.from('module_configs').upsert(
      {
        user_id: user.id,
        sector_slug: sectorSlug,
        module_slug: mod.slug,
        config_key: 'inventory_items',
        config_value: newItems,
      },
      { onConflict: 'user_id,sector_slug,module_slug,config_key' }
    )
    setSaving(false)
  }, [supabase, sectorSlug, mod.slug])

  const saveSettings = useCallback(async (newSettings: Settings) => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    await supabase.from('module_configs').upsert(
      {
        user_id: user.id,
        sector_slug: sectorSlug,
        module_slug: mod.slug,
        config_key: 'settings',
        config_value: newSettings,
      },
      { onConflict: 'user_id,sector_slug,module_slug,config_key' }
    )
  }, [supabase, sectorSlug, mod.slug])

  const fetchData = useCallback(async () => {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); return }

    const { data: itemsData } = await supabase
      .from('module_configs')
      .select('config_value')
      .eq('user_id', user.id)
      .eq('sector_slug', sectorSlug)
      .eq('module_slug', mod.slug)
      .eq('config_key', 'inventory_items')
      .maybeSingle()

    if (itemsData?.config_value && Array.isArray(itemsData.config_value) && itemsData.config_value.length > 0) {
      setItems(itemsData.config_value as InventoryItem[])
    } else {
      setItems(DEFAULT_ITEMS)
      await supabase.from('module_configs').upsert(
        {
          user_id: user.id,
          sector_slug: sectorSlug,
          module_slug: mod.slug,
          config_key: 'inventory_items',
          config_value: DEFAULT_ITEMS,
        },
        { onConflict: 'user_id,sector_slug,module_slug,config_key' }
      )
    }

    const { data: settingsData } = await supabase
      .from('module_configs')
      .select('config_value')
      .eq('user_id', user.id)
      .eq('sector_slug', sectorSlug)
      .eq('module_slug', mod.slug)
      .eq('config_key', 'settings')
      .maybeSingle()

    if (settingsData?.config_value) {
      const s = settingsData.config_value as Settings
      setSettings(s)
      setMethodInput(s.defaultMethod)
      setThresholdInput(String(s.obsolescenceThresholdDays))
    }

    setLoading(false)
  }, [supabase, sectorSlug, mod.slug])

  useEffect(() => { fetchData() }, [fetchData])

  const filteredItems = useMemo(() => {
    let result = items
    if (filterMethod !== 'all') {
      result = result.filter((i) => i.method === filterMethod)
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      result = result.filter(
        (i) =>
          i.sku.toLowerCase().includes(q) ||
          i.name.toLowerCase().includes(q)
      )
    }
    return result.sort((a, b) => b.totalValue - a.totalValue)
  }, [items, filterMethod, searchQuery])

  const totalValue = useMemo(() => items.reduce((s, i) => s + i.totalValue, 0), [items])
  const totalQty = useMemo(() => items.reduce((s, i) => s + i.qty, 0), [items])
  const avgUnitCost = useMemo(() => totalQty > 0 ? totalValue / totalQty : 0, [totalValue, totalQty])

  const obsoleteItems = useMemo(() => {
    const threshold = new Date()
    threshold.setDate(threshold.getDate() - settings.obsolescenceThresholdDays)
    return items.filter((i) => new Date(i.lastUpdated) < threshold)
  }, [items, settings.obsolescenceThresholdDays])

  function openNewItem() {
    setEditingItem(null)
    setForm({ ...EMPTY_FORM, method: settings.defaultMethod })
    setDialogOpen(true)
  }

  function openEditItem(item: InventoryItem) {
    setEditingItem(item)
    setForm({
      sku: item.sku,
      name: item.name,
      qty: String(item.qty),
      unitCost: String(item.unitCost),
      method: item.method,
    })
    setDialogOpen(true)
  }

  async function handleSaveItem() {
    const qty = parseInt(form.qty, 10)
    const unitCost = parseFloat(form.unitCost)
    if (!form.sku.trim() || !form.name.trim() || isNaN(qty) || isNaN(unitCost)) return

    const today = new Date().toISOString().slice(0, 10)
    const newItem: InventoryItem = {
      id: editingItem?.id ?? generateId(),
      sku: form.sku.trim(),
      name: form.name.trim(),
      qty,
      unitCost,
      totalValue: qty * unitCost,
      method: form.method,
      lastUpdated: today,
    }

    let updated: InventoryItem[]
    if (editingItem) {
      updated = items.map((i) => i.id === editingItem.id ? newItem : i)
    } else {
      if (items.some((i) => i.sku === newItem.sku)) return
      updated = [...items, newItem]
    }

    setItems(updated)
    setDialogOpen(false)
    await saveItems(updated)
  }

  function openDeleteConfirmation(item: InventoryItem) {
    setItemToDelete(item)
    setDeleteDialogOpen(true)
  }

  async function handleDeleteItem() {
    if (!itemToDelete) return
    const updated = items.filter((i) => i.id !== itemToDelete.id)
    setItems(updated)
    setDeleteDialogOpen(false)
    setItemToDelete(null)
    await saveItems(updated)
  }

  async function handleSaveSettings() {
    setSaving(true)
    const newSettings: Settings = {
      defaultMethod: methodInput,
      obsolescenceThresholdDays: parseInt(thresholdInput, 10) || 180,
    }
    setSettings(newSettings)
    await saveSettings(newSettings)
    setSaving(false)
  }

  return (
    <>
      <ModuleWorkspaceShell
        title={mod.name}
        description={mod.desc}
        category="bokforing"
        sectorName="E-handel"
        backHref={`/m/${sectorSlug}`}
        settingsHref={settingsHref}
        actions={
          <Button onClick={openNewItem}>
            <Plus className="mr-2 h-4 w-4" />
            Ny artikel
          </Button>
        }
      >
        <Tabs defaultValue="lager" className="space-y-6">
          <TabsList>
            <TabsTrigger value="lager">Lagervärde</TabsTrigger>
            <TabsTrigger value="inkurans">Inkurans</TabsTrigger>
            <TabsTrigger value="installningar">Inställningar</TabsTrigger>
          </TabsList>

          <TabsContent value="lager" className="space-y-6">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  <KPICard label="Totalt lagervärde" value={fmt(totalValue)} unit="kr" />
                  <KPICard label="Antal artiklar" value={String(items.length)} unit="st" />
                  <KPICard label="Totalt antal enheter" value={fmt(totalQty)} unit="st" />
                  <KPICard label="Snitt enhetskostnad" value={fmt(avgUnitCost)} unit="kr" />
                </div>

                <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
                  <div className="relative flex-1 max-w-sm">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Sök SKU eller namn..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-9"
                    />
                  </div>
                  <Select
                    value={filterMethod}
                    onValueChange={(val) => setFilterMethod(val as ValuationMethod | 'all')}
                  >
                    <SelectTrigger className="w-[200px]">
                      <SelectValue placeholder="Filtrera metod" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Alla metoder</SelectItem>
                      <SelectItem value="FIFO">FIFO</SelectItem>
                      <SelectItem value="Vägt genomsnitt">Vägt genomsnitt</SelectItem>
                    </SelectContent>
                  </Select>
                  {saving && (
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      Sparar...
                    </div>
                  )}
                </div>

                {filteredItems.length === 0 ? (
                  <EmptyModuleState
                    icon={Package}
                    title="Inga artiklar hittades"
                    description={
                      searchQuery || filterMethod !== 'all'
                        ? 'Inga artiklar matchar filtret.'
                        : 'Lägg till artiklar för att börja lagervärdering.'
                    }
                    actionLabel={!searchQuery && filterMethod === 'all' ? 'Ny artikel' : undefined}
                    onAction={!searchQuery && filterMethod === 'all' ? openNewItem : undefined}
                  />
                ) : (
                  <div className="rounded-xl border border-border overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-muted/50">
                          <TableHead className="font-medium">SKU</TableHead>
                          <TableHead className="font-medium">Artikel</TableHead>
                          <TableHead className="font-medium text-right">Antal</TableHead>
                          <TableHead className="font-medium text-right">Enhetskostnad</TableHead>
                          <TableHead className="font-medium text-right">Lagervärde</TableHead>
                          <TableHead className="font-medium">Metod</TableHead>
                          <TableHead className="font-medium">Senast uppdaterad</TableHead>
                          <TableHead className="font-medium text-right">Åtgärder</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredItems.map((item) => (
                          <TableRow key={item.id}>
                            <TableCell className="font-mono font-medium">{item.sku}</TableCell>
                            <TableCell>{item.name}</TableCell>
                            <TableCell className="text-right tabular-nums">{fmt(item.qty)}</TableCell>
                            <TableCell className="text-right tabular-nums">{fmt(item.unitCost)} kr</TableCell>
                            <TableCell className="text-right tabular-nums font-medium">{fmt(item.totalValue)} kr</TableCell>
                            <TableCell>
                              <Badge variant="secondary">{item.method}</Badge>
                            </TableCell>
                            <TableCell className="text-muted-foreground">{item.lastUpdated}</TableCell>
                            <TableCell className="text-right">
                              <div className="flex items-center justify-end gap-1">
                                <Button variant="ghost" size="icon" onClick={() => openEditItem(item)} title="Redigera">
                                  <Pencil className="h-4 w-4" />
                                </Button>
                                <Button variant="ghost" size="icon" className="text-red-600 hover:text-red-700" onClick={() => openDeleteConfirmation(item)} title="Ta bort">
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
              </>
            )}
          </TabsContent>

          <TabsContent value="inkurans" className="space-y-6">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : obsoleteItems.length === 0 ? (
              <EmptyModuleState
                icon={Package}
                title="Ingen inkuransrisk"
                description={`Inga artiklar har varit orörda i mer än ${settings.obsolescenceThresholdDays} dagar.`}
              />
            ) : (
              <>
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      Inkuransrisk ({'>'}
                      {settings.obsolescenceThresholdDays} dagar)
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <span className="text-2xl font-semibold tracking-tight">{obsoleteItems.length}</span>
                    <span className="text-sm text-muted-foreground ml-1.5">artiklar</span>
                    <p className="text-sm text-muted-foreground mt-1">
                      Totalt värde: {fmt(obsoleteItems.reduce((s, i) => s + i.totalValue, 0))} kr
                    </p>
                  </CardContent>
                </Card>

                <div className="rounded-xl border border-border overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/50">
                        <TableHead className="font-medium">SKU</TableHead>
                        <TableHead className="font-medium">Artikel</TableHead>
                        <TableHead className="font-medium text-right">Antal</TableHead>
                        <TableHead className="font-medium text-right">Lagervärde</TableHead>
                        <TableHead className="font-medium">Senast uppdaterad</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {obsoleteItems.map((item) => (
                        <TableRow key={item.id}>
                          <TableCell className="font-mono font-medium">{item.sku}</TableCell>
                          <TableCell>{item.name}</TableCell>
                          <TableCell className="text-right tabular-nums">{fmt(item.qty)}</TableCell>
                          <TableCell className="text-right tabular-nums font-medium">{fmt(item.totalValue)} kr</TableCell>
                          <TableCell className="text-muted-foreground">{item.lastUpdated}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </>
            )}
          </TabsContent>

          <TabsContent value="installningar" className="space-y-6">
            <div className="rounded-xl border border-border bg-card p-6 max-w-md space-y-4">
              <h3 className="text-sm font-semibold">Värderingsmetod</h3>
              <p className="text-xs text-muted-foreground">
                Standardmetod för nya artiklar. FIFO (First In, First Out) eller vägt genomsnitt.
              </p>
              <Select value={methodInput} onValueChange={(v) => setMethodInput(v as ValuationMethod)}>
                <SelectTrigger className="w-48">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="FIFO">FIFO</SelectItem>
                  <SelectItem value="Vägt genomsnitt">Vägt genomsnitt</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="rounded-xl border border-border bg-card p-6 max-w-md space-y-4">
              <h3 className="text-sm font-semibold">Inkuransgräns</h3>
              <p className="text-xs text-muted-foreground">
                Antal dagar utan rörelse innan en artikel flaggas som inkuransrisk.
              </p>
              <div className="flex items-end gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Dagar</Label>
                  <Input
                    type="number"
                    min={30}
                    max={730}
                    value={thresholdInput}
                    onChange={(e) => setThresholdInput(e.target.value)}
                    className="h-9 w-32"
                  />
                </div>
                <Button size="sm" onClick={handleSaveSettings} disabled={saving}>
                  {saving ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <Save className="mr-2 h-3.5 w-3.5" />}
                  Spara
                </Button>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </ModuleWorkspaceShell>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingItem ? 'Redigera artikel' : 'Ny artikel'}</DialogTitle>
            <DialogDescription>
              {editingItem ? 'Uppdatera artikelns uppgifter.' : 'Fyll i uppgifterna för den nya artikeln.'}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>SKU *</Label>
                <Input value={form.sku} onChange={(e) => setForm((f) => ({ ...f, sku: e.target.value }))} placeholder="SKU-001" disabled={!!editingItem} />
              </div>
              <div className="grid gap-2">
                <Label>Artikelnamn *</Label>
                <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="T-shirt Basic" />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="grid gap-2">
                <Label>Antal *</Label>
                <Input type="number" min={0} value={form.qty} onChange={(e) => setForm((f) => ({ ...f, qty: e.target.value }))} placeholder="100" />
              </div>
              <div className="grid gap-2">
                <Label>Enhetskostnad (kr) *</Label>
                <Input type="number" min={0} step="0.01" value={form.unitCost} onChange={(e) => setForm((f) => ({ ...f, unitCost: e.target.value }))} placeholder="89" />
              </div>
              <div className="grid gap-2">
                <Label>Metod *</Label>
                <Select value={form.method} onValueChange={(v) => setForm((f) => ({ ...f, method: v as ValuationMethod }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="FIFO">FIFO</SelectItem>
                    <SelectItem value="Vägt genomsnitt">Vägt genomsnitt</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Avbryt</Button>
            <Button onClick={handleSaveItem} disabled={!form.sku.trim() || !form.name.trim() || !form.qty || !form.unitCost}>
              {editingItem ? 'Uppdatera' : 'Lägg till'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Ta bort artikel</DialogTitle>
            <DialogDescription>
              Är du säker på att du vill ta bort{' '}
              <span className="font-semibold">{itemToDelete?.name}</span> ({itemToDelete?.sku})?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>Avbryt</Button>
            <Button variant="destructive" onClick={handleDeleteItem}>
              <Trash2 className="mr-2 h-4 w-4" />
              Ta bort
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
