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
  Package,
  Save,
  AlertTriangle,
} from 'lucide-react'

interface ModuleWorkspaceProps {
  module: { slug: string; name: string; cat: string; desc: string; longDesc: string }
  sectorSlug: string
  settingsHref: string
}

type ValuationMethod = 'FIFO' | 'Vagt genomsnitt'

interface InventoryItem {
  id: string
  name: string
  sku: string
  category: string
  quantity: number
  unitCost: number
  totalValue: number
  method: ValuationMethod
  obsolescenceRisk: 'Lag' | 'Medel' | 'Hog'
  lastUpdated: string
}

interface MonthlyClosing {
  month: string
  totalValue: number
  itemCount: number
  obsolescenceProvision: number
  closedAt: string
}

function generateId(): string {
  return crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`
}

function fmt(n: number): string {
  return new Intl.NumberFormat('sv-SE', { maximumFractionDigits: 0 }).format(n)
}

function fmtDec(n: number): string {
  return new Intl.NumberFormat('sv-SE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)
}

function todayStr(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function currentMonthStr(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

const CATEGORIES = ['Livsmedel', 'Dryck', 'Frukt & Gront', 'Mejeri', 'Kott & Chark', 'Non-food', 'Ovrigt']
const RISK_COLORS: Record<string, string> = {
  'Lag': 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400',
  'Medel': 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400',
  'Hog': 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
}

const EMPTY_ITEM_FORM = {
  name: '',
  sku: '',
  category: 'Livsmedel',
  quantity: 0,
  unitCost: 0,
  method: 'FIFO' as ValuationMethod,
  obsolescenceRisk: 'Lag' as 'Lag' | 'Medel' | 'Hog',
}

export function LagervaderingWorkspace({ module: mod, sectorSlug, settingsHref }: ModuleWorkspaceProps) {
  const supabase = createClient()

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [items, setItems] = useState<InventoryItem[]>([])
  const [closings, setClosings] = useState<MonthlyClosing[]>([])

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingItem, setEditingItem] = useState<InventoryItem | null>(null)
  const [itemForm, setItemForm] = useState(EMPTY_ITEM_FORM)

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [itemToDelete, setItemToDelete] = useState<InventoryItem | null>(null)

  const loadConfig = useCallback(async (configKey: string) => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return null
    const { data } = await supabase
      .from('module_configs')
      .select('config_value')
      .eq('user_id', user.id)
      .eq('sector_slug', sectorSlug)
      .eq('module_slug', mod.slug)
      .eq('config_key', configKey)
      .maybeSingle()
    return data?.config_value ?? null
  }, [supabase, sectorSlug, mod.slug])

  const saveConfig = useCallback(async (configKey: string, configValue: unknown) => {
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setSaving(false); return }
    await supabase.from('module_configs').upsert(
      {
        user_id: user.id,
        sector_slug: sectorSlug,
        module_slug: mod.slug,
        config_key: configKey,
        config_value: configValue,
      },
      { onConflict: 'user_id,sector_slug,module_slug,config_key' }
    )
    setSaving(false)
  }, [supabase, sectorSlug, mod.slug])

  const fetchData = useCallback(async () => {
    setLoading(true)
    const [itemsData, closingsData] = await Promise.all([
      loadConfig('inventory_items'),
      loadConfig('monthly_closings'),
    ])
    if (itemsData && Array.isArray(itemsData)) setItems(itemsData as InventoryItem[])
    if (closingsData && Array.isArray(closingsData)) setClosings(closingsData as MonthlyClosing[])
    setLoading(false)
  }, [loadConfig])

  useEffect(() => { fetchData() }, [fetchData])

  const totalValue = useMemo(() => items.reduce((s, i) => s + i.totalValue, 0), [items])
  const obsolescenceProvision = useMemo(() =>
    items.reduce((s, i) => {
      if (i.obsolescenceRisk === 'Hog') return s + i.totalValue * 0.2
      if (i.obsolescenceRisk === 'Medel') return s + i.totalValue * 0.05
      return s
    }, 0), [items])
  const highRiskCount = useMemo(() => items.filter(i => i.obsolescenceRisk === 'Hog').length, [items])

  function openNewItem() {
    setEditingItem(null)
    setItemForm({ ...EMPTY_ITEM_FORM })
    setDialogOpen(true)
  }

  function openEditItem(item: InventoryItem) {
    setEditingItem(item)
    setItemForm({
      name: item.name,
      sku: item.sku,
      category: item.category,
      quantity: item.quantity,
      unitCost: item.unitCost,
      method: item.method,
      obsolescenceRisk: item.obsolescenceRisk,
    })
    setDialogOpen(true)
  }

  async function handleSaveItem() {
    const newItem: InventoryItem = {
      id: editingItem?.id ?? generateId(),
      name: itemForm.name.trim(),
      sku: itemForm.sku.trim(),
      category: itemForm.category,
      quantity: itemForm.quantity,
      unitCost: itemForm.unitCost,
      totalValue: itemForm.quantity * itemForm.unitCost,
      method: itemForm.method,
      obsolescenceRisk: itemForm.obsolescenceRisk,
      lastUpdated: todayStr(),
    }

    let updated: InventoryItem[]
    if (editingItem) {
      updated = items.map(i => i.id === editingItem.id ? newItem : i)
    } else {
      updated = [...items, newItem]
    }

    setItems(updated)
    setDialogOpen(false)
    await saveConfig('inventory_items', updated)
  }

  async function handleDeleteItem() {
    if (!itemToDelete) return
    const updated = items.filter(i => i.id !== itemToDelete.id)
    setItems(updated)
    setDeleteDialogOpen(false)
    setItemToDelete(null)
    await saveConfig('inventory_items', updated)
  }

  async function handleMonthlyClosing() {
    const month = currentMonthStr()
    const closing: MonthlyClosing = {
      month,
      totalValue,
      itemCount: items.length,
      obsolescenceProvision,
      closedAt: new Date().toISOString(),
    }
    const updated = [...closings.filter(c => c.month !== month), closing].sort((a, b) => b.month.localeCompare(a.month))
    setClosings(updated)
    await saveConfig('monthly_closings', updated)
  }

  return (
    <>
      <ModuleWorkspaceShell
        title={mod.name}
        description={mod.desc}
        category="bokforing"
        sectorName="Detaljhandel"
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
            <TabsTrigger value="lager">Lagervarden</TabsTrigger>
            <TabsTrigger value="bokslut">Manadsavslut</TabsTrigger>
          </TabsList>

          <TabsContent value="lager" className="space-y-6">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  <KPICard label="Totalt lagervarde" value={fmt(totalValue)} unit="kr" />
                  <KPICard label="Antal artiklar" value={String(items.length)} unit="st" />
                  <KPICard label="Inkuransavsattning" value={fmt(obsolescenceProvision)} unit="kr" />
                  <KPICard
                    label="Hog inkuransrisk"
                    value={String(highRiskCount)}
                    unit="artiklar"
                    trend={highRiskCount > 0 ? 'down' : 'up'}
                    trendLabel={highRiskCount > 0 ? 'Krav atgard' : 'Bra'}
                  />
                </div>

                {items.length === 0 ? (
                  <EmptyModuleState
                    icon={Package}
                    title="Inga lagerartiklar"
                    description="Lagg till artiklar for att borja med lagervardering. Konto 1400 anvands for lagertillgangar."
                    actionLabel="Ny artikel"
                    onAction={openNewItem}
                  />
                ) : (
                  <div className="rounded-xl border border-border overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-muted/50">
                          <TableHead className="font-medium">SKU</TableHead>
                          <TableHead className="font-medium">Artikel</TableHead>
                          <TableHead className="font-medium">Kategori</TableHead>
                          <TableHead className="font-medium text-right">Antal</TableHead>
                          <TableHead className="font-medium text-right">Enhetskostn.</TableHead>
                          <TableHead className="font-medium text-right">Totalt</TableHead>
                          <TableHead className="font-medium">Metod</TableHead>
                          <TableHead className="font-medium">Inkurans</TableHead>
                          <TableHead className="font-medium text-right">Atgarder</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {items.map((item) => (
                          <TableRow key={item.id}>
                            <TableCell className="font-mono text-xs">{item.sku}</TableCell>
                            <TableCell className="font-medium">{item.name}</TableCell>
                            <TableCell><Badge variant="outline">{item.category}</Badge></TableCell>
                            <TableCell className="text-right tabular-nums">{item.quantity}</TableCell>
                            <TableCell className="text-right tabular-nums">{fmtDec(item.unitCost)}</TableCell>
                            <TableCell className="text-right tabular-nums font-medium">{fmt(item.totalValue)}</TableCell>
                            <TableCell><Badge variant="secondary">{item.method}</Badge></TableCell>
                            <TableCell>
                              <Badge variant="secondary" className={RISK_COLORS[item.obsolescenceRisk]}>
                                {item.obsolescenceRisk}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="flex items-center justify-end gap-1">
                                <Button variant="ghost" size="icon" onClick={() => openEditItem(item)} title="Redigera">
                                  <Pencil className="h-4 w-4" />
                                </Button>
                                <Button variant="ghost" size="icon" className="text-red-600 hover:text-red-700" onClick={() => { setItemToDelete(item); setDeleteDialogOpen(true) }} title="Ta bort">
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

                {saving && (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Sparar...
                  </div>
                )}
              </>
            )}
          </TabsContent>

          <TabsContent value="bokslut" className="space-y-6">
            <div className="rounded-xl border border-border bg-card p-6 max-w-lg space-y-4">
              <h3 className="text-sm font-semibold">Manadsavslut lager</h3>
              <p className="text-xs text-muted-foreground">
                Gor ett manadsavslut for att spara lagervarde per manad. Bokfors pa konto 1400.
                Inkuransavsattning beraknas automatiskt baserat pa riskklass.
              </p>
              <div className="flex items-center gap-4 text-sm">
                <span>Period: <strong>{currentMonthStr()}</strong></span>
                <span>Lagervarde: <strong>{fmt(totalValue)} kr</strong></span>
                <span>Inkurans: <strong>{fmt(obsolescenceProvision)} kr</strong></span>
              </div>
              <Button onClick={handleMonthlyClosing} disabled={saving || items.length === 0}>
                {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                Genomfor manadsavslut
              </Button>
            </div>

            {closings.length > 0 && (
              <div className="rounded-xl border border-border overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead className="font-medium">Manad</TableHead>
                      <TableHead className="font-medium text-right">Lagervarde</TableHead>
                      <TableHead className="font-medium text-right">Artiklar</TableHead>
                      <TableHead className="font-medium text-right">Inkuransavsattning</TableHead>
                      <TableHead className="font-medium">Avslutad</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {closings.map((c) => (
                      <TableRow key={c.month}>
                        <TableCell className="font-medium">{c.month}</TableCell>
                        <TableCell className="text-right tabular-nums">{fmt(c.totalValue)} kr</TableCell>
                        <TableCell className="text-right tabular-nums">{c.itemCount}</TableCell>
                        <TableCell className="text-right tabular-nums">{fmt(c.obsolescenceProvision)} kr</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{new Date(c.closedAt).toLocaleString('sv-SE')}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </ModuleWorkspaceShell>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingItem ? 'Redigera artikel' : 'Ny artikel'}</DialogTitle>
            <DialogDescription>
              {editingItem ? 'Uppdatera artikelinformation nedan.' : 'Lagg till en ny lagerartikel.'}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>SKU *</Label>
                <Input value={itemForm.sku} onChange={(e) => setItemForm(f => ({ ...f, sku: e.target.value }))} placeholder="ART-001" />
              </div>
              <div className="grid gap-2">
                <Label>Artikelnamn *</Label>
                <Input value={itemForm.name} onChange={(e) => setItemForm(f => ({ ...f, name: e.target.value }))} placeholder="Mjolk 3%" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Kategori</Label>
                <Select value={itemForm.category} onValueChange={(val) => setItemForm(f => ({ ...f, category: val }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label>Varderingsmetod</Label>
                <Select value={itemForm.method} onValueChange={(val) => setItemForm(f => ({ ...f, method: val as ValuationMethod }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="FIFO">FIFO</SelectItem>
                    <SelectItem value="Vagt genomsnitt">Vagt genomsnitt</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="grid gap-2">
                <Label>Antal</Label>
                <Input type="number" min={0} value={itemForm.quantity} onChange={(e) => setItemForm(f => ({ ...f, quantity: Number(e.target.value) || 0 }))} />
              </div>
              <div className="grid gap-2">
                <Label>Enhetskostnad (kr)</Label>
                <Input type="number" min={0} step="0.01" value={itemForm.unitCost} onChange={(e) => setItemForm(f => ({ ...f, unitCost: Number(e.target.value) || 0 }))} />
              </div>
              <div className="grid gap-2">
                <Label>Inkuransrisk</Label>
                <Select value={itemForm.obsolescenceRisk} onValueChange={(val) => setItemForm(f => ({ ...f, obsolescenceRisk: val as 'Lag' | 'Medel' | 'Hog' }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Lag">Lag</SelectItem>
                    <SelectItem value="Medel">Medel</SelectItem>
                    <SelectItem value="Hog">Hog</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Avbryt</Button>
            <Button onClick={handleSaveItem} disabled={!itemForm.name.trim() || !itemForm.sku.trim()}>
              {editingItem ? 'Uppdatera' : 'Lagg till'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Ta bort artikel</DialogTitle>
            <DialogDescription>
              Ar du saker pa att du vill ta bort{' '}
              <span className="font-semibold">{itemToDelete?.name}</span>? Denna atgard kan inte angras.
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
