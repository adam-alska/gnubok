'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { ModuleWorkspaceShell } from '@/components/modules/ModuleWorkspaceShell'
import { StatusBadge } from '@/components/modules/shared/StatusBadge'
import { EmptyModuleState } from '@/components/modules/shared/EmptyModuleState'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
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
import { cn } from '@/lib/utils'
import {
  Wine,
  Package,
  Plus,
  Pencil,
  Trash2,
  Loader2,
  ArrowDownToLine,
  ArrowUpFromLine,
  FileText,
  BarChart3,
  Calculator,
  Warehouse,
} from 'lucide-react'

// --- Types ---

interface ModuleWorkspaceProps {
  module: { slug: string; name: string; cat: string; desc: string; longDesc: string }
  sectorSlug: string
  settingsHref: string
}

type AlcoholType = 'ol' | 'vin' | 'sprit' | 'cider'

interface AlcoholProduct {
  id: string
  name: string
  type: AlcoholType
  volume: number       // liters per unit
  abv: number          // alcohol by volume, 0-100
  quantity: number     // units in stock
  excisePerUnit: number // auto-calculated SEK
}

type MovementDirection = 'in' | 'out'

interface InventoryMovement {
  id: string
  date: string
  productId: string
  productName: string
  direction: MovementDirection
  quantity: number
  exciseAmount: number
  note: string
}

// --- Constants ---

const ALCOHOL_TYPES: { value: AlcoholType; label: string }[] = [
  { value: 'ol', label: 'Öl' },
  { value: 'vin', label: 'Vin' },
  { value: 'sprit', label: 'Sprit' },
  { value: 'cider', label: 'Cider' },
]

const TYPE_LABELS: Record<AlcoholType, string> = {
  ol: 'Öl',
  vin: 'Vin',
  sprit: 'Sprit',
  cider: 'Cider',
}

// Simplified Swedish excise rates
// Öl: ~2.32 SEK per liter per % ABV over 2.8%
// Vin (still wine 8.5-15%): ~30.67 SEK per liter
// Sprit: ~526.98 SEK per liter pure alcohol
// Cider: treated similarly to vin for simplification
function calculateExcise(type: AlcoholType, volumeLiters: number, abv: number): number {
  switch (type) {
    case 'ol': {
      const taxableAbv = Math.max(0, abv - 2.8)
      return volumeLiters * taxableAbv * 2.32
    }
    case 'vin': {
      return volumeLiters * 30.67
    }
    case 'sprit': {
      const pureAlcoholLiters = volumeLiters * (abv / 100)
      return pureAlcoholLiters * 526.98
    }
    case 'cider': {
      return volumeLiters * 30.67
    }
    default:
      return 0
  }
}

// --- Helpers ---

function todayISO(): string {
  return new Date().toISOString().split('T')[0]
}

function currentYearMonth(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

function generateId(): string {
  return crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`
}

function formatSEK(amount: number): string {
  return amount.toLocaleString('sv-SE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' kr'
}

function getQuarterLabel(q: number, year: number): string {
  const monthRanges = ['januari - mars', 'april - juni', 'juli - september', 'oktober - december']
  return `Q${q} ${year} (${monthRanges[q - 1]})`
}

function getQuarterMonths(q: number, year: number): string[] {
  const startMonth = (q - 1) * 3 + 1
  return [
    `${year}-${String(startMonth).padStart(2, '0')}`,
    `${year}-${String(startMonth + 1).padStart(2, '0')}`,
    `${year}-${String(startMonth + 2).padStart(2, '0')}`,
  ]
}

// --- Component ---

export function AlkoholpunktskattWorkspace({ module: mod, sectorSlug, settingsHref }: ModuleWorkspaceProps) {
  const supabase = useMemo(() => createClient(), [])

  // State
  const [activeTab, setActiveTab] = useState('produkter')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  // Products
  const [products, setProducts] = useState<AlcoholProduct[]>([])

  // Movements for current month
  const [movementsMonth, setMovementsMonth] = useState(currentYearMonth())
  const [movements, setMovements] = useState<InventoryMovement[]>([])
  const [movementsLoading, setMovementsLoading] = useState(false)

  // Period report
  const [reportType, setReportType] = useState<'month' | 'quarter'>('month')
  const [reportMonth, setReportMonth] = useState(currentYearMonth())
  const [reportQuarter, setReportQuarter] = useState(() => {
    const now = new Date()
    return `${now.getFullYear()}-Q${Math.ceil((now.getMonth() + 1) / 3)}`
  })
  const [reportData, setReportData] = useState<{
    openingStock: number
    purchases: number
    sales: number
    closingStock: number
    totalExcise: number
    details: { productName: string; opening: number; inQty: number; outQty: number; closing: number; excise: number }[]
  } | null>(null)
  const [reportLoading, setReportLoading] = useState(false)

  // Product dialog
  const [productDialogOpen, setProductDialogOpen] = useState(false)
  const [editingProduct, setEditingProduct] = useState<AlcoholProduct | null>(null)
  const [productForm, setProductForm] = useState({
    name: '',
    type: 'ol' as AlcoholType,
    volume: 0.33,
    abv: 5.0,
    quantity: 0,
  })

  // Movement dialog
  const [movementDialogOpen, setMovementDialogOpen] = useState(false)
  const [movementForm, setMovementForm] = useState({
    productId: '',
    direction: 'in' as MovementDirection,
    quantity: 1,
    note: '',
  })

  // --- Supabase helpers ---

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
      .single()

    return data?.config_value ?? null
  }, [supabase, sectorSlug, mod.slug])

  const saveConfig = useCallback(async (configKey: string, configValue: unknown) => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    await supabase
      .from('module_configs')
      .upsert(
        {
          user_id: user.id,
          sector_slug: sectorSlug,
          module_slug: mod.slug,
          config_key: configKey,
          config_value: configValue,
        },
        { onConflict: 'user_id,sector_slug,module_slug,config_key' }
      )
  }, [supabase, sectorSlug, mod.slug])

  // --- Data fetching ---

  const fetchProducts = useCallback(async () => {
    const data = await loadConfig('alkohol_products')
    if (data && Array.isArray(data)) {
      setProducts(data as AlcoholProduct[])
    }
  }, [loadConfig])

  const fetchMovements = useCallback(async (yearMonth: string) => {
    setMovementsLoading(true)
    const data = await loadConfig(`alkohol_movements_${yearMonth}`)
    if (data && Array.isArray(data)) {
      setMovements(data as InventoryMovement[])
    } else {
      setMovements([])
    }
    setMovementsLoading(false)
  }, [loadConfig])

  useEffect(() => {
    async function load() {
      setLoading(true)
      await fetchProducts()
      await fetchMovements(movementsMonth)
      setLoading(false)
    }
    load()
  }, [fetchProducts, fetchMovements, movementsMonth])

  useEffect(() => {
    if (activeTab === 'lagerrapport') {
      fetchMovements(movementsMonth)
    }
  }, [activeTab, movementsMonth, fetchMovements])

  // --- Save helpers ---

  const saveProducts = useCallback(async (productList: AlcoholProduct[]) => {
    await saveConfig('alkohol_products', productList)
  }, [saveConfig])

  const saveMovements = useCallback(async (yearMonth: string, movementList: InventoryMovement[]) => {
    await saveConfig(`alkohol_movements_${yearMonth}`, movementList)
  }, [saveConfig])

  // --- Product CRUD ---

  function openNewProduct() {
    setEditingProduct(null)
    setProductForm({ name: '', type: 'ol', volume: 0.33, abv: 5.0, quantity: 0 })
    setProductDialogOpen(true)
  }

  function openEditProduct(product: AlcoholProduct) {
    setEditingProduct(product)
    setProductForm({
      name: product.name,
      type: product.type,
      volume: product.volume,
      abv: product.abv,
      quantity: product.quantity,
    })
    setProductDialogOpen(true)
  }

  async function handleSaveProduct() {
    setSaving(true)
    const excisePerUnit = calculateExcise(productForm.type, productForm.volume, productForm.abv)

    let updatedProducts: AlcoholProduct[]
    if (editingProduct) {
      updatedProducts = products.map(p =>
        p.id === editingProduct.id
          ? {
              ...p,
              name: productForm.name.trim(),
              type: productForm.type,
              volume: productForm.volume,
              abv: productForm.abv,
              quantity: productForm.quantity,
              excisePerUnit,
            }
          : p
      )
    } else {
      const newProduct: AlcoholProduct = {
        id: generateId(),
        name: productForm.name.trim(),
        type: productForm.type,
        volume: productForm.volume,
        abv: productForm.abv,
        quantity: productForm.quantity,
        excisePerUnit,
      }
      updatedProducts = [...products, newProduct]
    }

    setProducts(updatedProducts)
    await saveProducts(updatedProducts)
    setSaving(false)
    setProductDialogOpen(false)
  }

  async function handleDeleteProduct(id: string) {
    const updatedProducts = products.filter(p => p.id !== id)
    setProducts(updatedProducts)
    await saveProducts(updatedProducts)
  }

  // --- Movement CRUD ---

  function openNewMovement(direction: MovementDirection = 'in') {
    setMovementForm({
      productId: products.length > 0 ? products[0].id : '',
      direction,
      quantity: 1,
      note: '',
    })
    setMovementDialogOpen(true)
  }

  async function handleSaveMovement() {
    setSaving(true)
    const product = products.find(p => p.id === movementForm.productId)
    if (!product) { setSaving(false); return }

    const exciseAmount = product.excisePerUnit * movementForm.quantity

    const newMovement: InventoryMovement = {
      id: generateId(),
      date: todayISO(),
      productId: product.id,
      productName: product.name,
      direction: movementForm.direction,
      quantity: movementForm.quantity,
      exciseAmount,
      note: movementForm.note,
    }

    // Update movements
    const updatedMovements = [...movements, newMovement]
    setMovements(updatedMovements)
    await saveMovements(movementsMonth, updatedMovements)

    // Update product stock
    const quantityChange = movementForm.direction === 'in' ? movementForm.quantity : -movementForm.quantity
    const updatedProducts = products.map(p =>
      p.id === product.id
        ? { ...p, quantity: Math.max(0, p.quantity + quantityChange) }
        : p
    )
    setProducts(updatedProducts)
    await saveProducts(updatedProducts)

    setSaving(false)
    setMovementDialogOpen(false)
  }

  async function handleDeleteMovement(movementId: string) {
    const movement = movements.find(m => m.id === movementId)
    if (!movement) return

    // Reverse the stock change
    const quantityChange = movement.direction === 'in' ? -movement.quantity : movement.quantity
    const updatedProducts = products.map(p =>
      p.id === movement.productId
        ? { ...p, quantity: Math.max(0, p.quantity + quantityChange) }
        : p
    )
    setProducts(updatedProducts)
    await saveProducts(updatedProducts)

    const updatedMovements = movements.filter(m => m.id !== movementId)
    setMovements(updatedMovements)
    await saveMovements(movementsMonth, updatedMovements)
  }

  // --- Period report ---

  const generateReport = useCallback(async () => {
    setReportLoading(true)

    let months: string[] = []
    if (reportType === 'month') {
      months = [reportMonth]
    } else {
      const [yearStr, qStr] = reportQuarter.split('-Q')
      months = getQuarterMonths(parseInt(qStr), parseInt(yearStr))
    }

    // Collect all movements for the period
    const periodMovements: InventoryMovement[] = []
    for (const m of months) {
      const data = await loadConfig(`alkohol_movements_${m}`)
      if (data && Array.isArray(data)) {
        periodMovements.push(...(data as InventoryMovement[]))
      }
    }

    // Build report per product
    const productDetails: Record<string, { productName: string; inQty: number; outQty: number; exciseIn: number; exciseOut: number }> = {}

    for (const mov of periodMovements) {
      if (!productDetails[mov.productId]) {
        productDetails[mov.productId] = { productName: mov.productName, inQty: 0, outQty: 0, exciseIn: 0, exciseOut: 0 }
      }
      if (mov.direction === 'in') {
        productDetails[mov.productId].inQty += mov.quantity
        productDetails[mov.productId].exciseIn += mov.exciseAmount
      } else {
        productDetails[mov.productId].outQty += mov.quantity
        productDetails[mov.productId].exciseOut += mov.exciseAmount
      }
    }

    // Calculate opening/closing stock (approximate: closing = current stock, opening = closing - in + out)
    const details = products.map(p => {
      const d = productDetails[p.id] || { productName: p.name, inQty: 0, outQty: 0, exciseIn: 0, exciseOut: 0 }
      const closing = p.quantity
      const opening = closing - d.inQty + d.outQty
      return {
        productName: p.name,
        opening: Math.max(0, opening),
        inQty: d.inQty,
        outQty: d.outQty,
        closing,
        excise: d.exciseIn,
      }
    })

    const totalOpeningStock = details.reduce((sum, d) => sum + d.opening, 0)
    const totalPurchases = details.reduce((sum, d) => sum + d.inQty, 0)
    const totalSales = details.reduce((sum, d) => sum + d.outQty, 0)
    const totalClosingStock = details.reduce((sum, d) => sum + d.closing, 0)
    const totalExcise = details.reduce((sum, d) => sum + d.excise, 0)

    setReportData({
      openingStock: totalOpeningStock,
      purchases: totalPurchases,
      sales: totalSales,
      closingStock: totalClosingStock,
      totalExcise,
      details: details.filter(d => d.inQty > 0 || d.outQty > 0 || d.closing > 0),
    })

    setReportLoading(false)
  }, [reportType, reportMonth, reportQuarter, products, loadConfig])

  useEffect(() => {
    if (activeTab === 'periodrapport') {
      generateReport()
    }
  }, [activeTab, generateReport])

  // --- Computed ---

  const totalProducts = products.length
  const totalStockUnits = useMemo(() => products.reduce((sum, p) => sum + p.quantity, 0), [products])
  const totalExciseLiability = useMemo(() => {
    return products.reduce((sum, p) => sum + p.excisePerUnit * p.quantity, 0)
  }, [products])

  const totalInventoryValue = useMemo(() => {
    return movements
      .filter(m => m.direction === 'in')
      .reduce((sum, m) => sum + m.exciseAmount, 0)
  }, [movements])

  // Preview excise in product form
  const previewExcise = useMemo(() => {
    return calculateExcise(productForm.type, productForm.volume, productForm.abv)
  }, [productForm.type, productForm.volume, productForm.abv])

  // --- Render ---

  if (loading) {
    return (
      <ModuleWorkspaceShell
        title={mod.name}
        description={mod.desc}
        category="bokforing"
        sectorName={sectorSlug}
        backHref={`/m/${sectorSlug}`}
        settingsHref={settingsHref}
      >
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </ModuleWorkspaceShell>
    )
  }

  const tabsContent = (
    <Tabs value={activeTab} onValueChange={setActiveTab}>
      <TabsList>
        <TabsTrigger value="produkter">
          <Wine className="mr-1.5 h-3.5 w-3.5" />
          Produkter
        </TabsTrigger>
        <TabsTrigger value="lagerrapport">
          <Warehouse className="mr-1.5 h-3.5 w-3.5" />
          Lagerrapport
        </TabsTrigger>
        <TabsTrigger value="periodrapport">
          <FileText className="mr-1.5 h-3.5 w-3.5" />
          Periodrapport
        </TabsTrigger>
      </TabsList>

      {/* ===== PRODUKTER ===== */}
      <TabsContent value="produkter" className="space-y-6">
        {/* Summary cards */}
        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Antal produkter</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <Package className="h-5 w-5 text-violet-600" />
                <span className="text-2xl font-bold">{totalProducts}</span>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Totalt i lager</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <Warehouse className="h-5 w-5 text-blue-600" />
                <span className="text-2xl font-bold">{totalStockUnits}</span>
                <span className="text-sm text-muted-foreground">enheter</span>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Total punktskatt (lager)</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <Calculator className="h-5 w-5 text-amber-600" />
                <span className="text-2xl font-bold">{formatSEK(totalExciseLiability)}</span>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Products table */}
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-medium">Alkoholprodukter</h2>
          <Button size="sm" onClick={openNewProduct}>
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            Ny produkt
          </Button>
        </div>

        {products.length === 0 ? (
          <EmptyModuleState
            icon={Wine}
            title="Inga produkter registrerade"
            description="Lägg till alkoholprodukter för att beräkna och spåra punktskatt."
            actionLabel="Ny produkt"
            onAction={openNewProduct}
          />
        ) : (
          <div className="rounded-lg border border-border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead>Produkt</TableHead>
                  <TableHead>Typ</TableHead>
                  <TableHead className="text-right">Volym (l)</TableHead>
                  <TableHead className="text-right">ABV %</TableHead>
                  <TableHead className="text-right">I lager</TableHead>
                  <TableHead className="text-right">Punktskatt/enhet</TableHead>
                  <TableHead className="text-right">Total punktskatt</TableHead>
                  <TableHead className="text-right">Åtgärder</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {products.map((product) => (
                  <TableRow key={product.id}>
                    <TableCell className="font-medium">{product.name}</TableCell>
                    <TableCell>
                      <StatusBadge
                        label={TYPE_LABELS[product.type]}
                        variant={
                          product.type === 'ol' ? 'warning'
                          : product.type === 'vin' ? 'danger'
                          : product.type === 'sprit' ? 'info'
                          : 'neutral'
                        }
                      />
                    </TableCell>
                    <TableCell className="text-right font-mono">{product.volume.toFixed(2)}</TableCell>
                    <TableCell className="text-right font-mono">{product.abv.toFixed(1)}%</TableCell>
                    <TableCell className="text-right">
                      <span className={cn('font-medium', product.quantity === 0 && 'text-red-600')}>
                        {product.quantity}
                      </span>
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm">{formatSEK(product.excisePerUnit)}</TableCell>
                    <TableCell className="text-right font-mono text-sm font-medium">
                      {formatSEK(product.excisePerUnit * product.quantity)}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => openEditProduct(product)}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-destructive hover:text-destructive"
                          onClick={() => handleDeleteProduct(product.id)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                <TableRow className="bg-muted/30 font-medium">
                  <TableCell colSpan={4}>Totalt</TableCell>
                  <TableCell className="text-right">{totalStockUnits}</TableCell>
                  <TableCell />
                  <TableCell className="text-right font-mono">{formatSEK(totalExciseLiability)}</TableCell>
                  <TableCell />
                </TableRow>
              </TableBody>
            </Table>
          </div>
        )}
      </TabsContent>

      {/* ===== LAGERRAPPORT ===== */}
      <TabsContent value="lagerrapport" className="space-y-6">
        {/* Inventory summary */}
        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Lagervärde (punktskatt)</CardTitle>
            </CardHeader>
            <CardContent>
              <span className="text-2xl font-bold">{formatSEK(totalExciseLiability)}</span>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Rörelser denna månad</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-1.5">
                  <ArrowDownToLine className="h-4 w-4 text-emerald-600" />
                  <span className="font-medium">
                    {movements.filter(m => m.direction === 'in').reduce((s, m) => s + m.quantity, 0)} in
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <ArrowUpFromLine className="h-4 w-4 text-red-600" />
                  <span className="font-medium">
                    {movements.filter(m => m.direction === 'out').reduce((s, m) => s + m.quantity, 0)} ut
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Controls */}
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-2">
            <Label htmlFor="movements-month">Period</Label>
            <Input
              id="movements-month"
              type="month"
              value={movementsMonth}
              onChange={(e) => setMovementsMonth(e.target.value)}
              className="w-auto"
            />
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => openNewMovement('in')}>
              <ArrowDownToLine className="mr-1.5 h-3.5 w-3.5" />
              Inleverans
            </Button>
            <Button variant="outline" size="sm" onClick={() => openNewMovement('out')}>
              <ArrowUpFromLine className="mr-1.5 h-3.5 w-3.5" />
              Försäljning / Svinn
            </Button>
          </div>
        </div>

        {/* Current stock levels */}
        <div>
          <h3 className="text-sm font-medium mb-3">Aktuella lagernivåer</h3>
          <div className="rounded-lg border border-border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead>Produkt</TableHead>
                  <TableHead>Typ</TableHead>
                  <TableHead className="text-right">I lager</TableHead>
                  <TableHead className="text-right">Punktskatt totalt</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {products.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                      Inga produkter registrerade.
                    </TableCell>
                  </TableRow>
                ) : (
                  <>
                    {products.map(p => (
                      <TableRow key={p.id}>
                        <TableCell className="font-medium">{p.name}</TableCell>
                        <TableCell>{TYPE_LABELS[p.type]}</TableCell>
                        <TableCell className="text-right">
                          <span className={cn('font-medium', p.quantity === 0 && 'text-red-600', p.quantity <= 5 && p.quantity > 0 && 'text-amber-600')}>
                            {p.quantity}
                          </span>
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm">{formatSEK(p.excisePerUnit * p.quantity)}</TableCell>
                      </TableRow>
                    ))}
                    <TableRow className="bg-muted/30 font-medium">
                      <TableCell colSpan={2}>Totalt</TableCell>
                      <TableCell className="text-right">{totalStockUnits}</TableCell>
                      <TableCell className="text-right font-mono">{formatSEK(totalExciseLiability)}</TableCell>
                    </TableRow>
                  </>
                )}
              </TableBody>
            </Table>
          </div>
        </div>

        <Separator />

        {/* Movement log */}
        <div>
          <h3 className="text-sm font-medium mb-3">Rörelselogg</h3>
          {movementsLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : movements.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <BarChart3 className="h-8 w-8 text-muted-foreground mb-3" />
              <p className="text-sm text-muted-foreground">Inga rörelser denna månad.</p>
            </div>
          ) : (
            <div className="rounded-lg border border-border overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead>Datum</TableHead>
                    <TableHead>Produkt</TableHead>
                    <TableHead>Riktning</TableHead>
                    <TableHead className="text-right">Antal</TableHead>
                    <TableHead className="text-right">Punktskatt</TableHead>
                    <TableHead>Anteckning</TableHead>
                    <TableHead className="text-right">Ta bort</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {movements
                    .sort((a, b) => b.date.localeCompare(a.date))
                    .map((mov) => (
                      <TableRow key={mov.id}>
                        <TableCell className="font-mono text-sm">{mov.date}</TableCell>
                        <TableCell className="font-medium">{mov.productName}</TableCell>
                        <TableCell>
                          {mov.direction === 'in' ? (
                            <span className="inline-flex items-center gap-1 text-emerald-600">
                              <ArrowDownToLine className="h-3.5 w-3.5" />
                              Inleverans
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-red-600">
                              <ArrowUpFromLine className="h-3.5 w-3.5" />
                              Utgång
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="text-right font-medium">{mov.quantity}</TableCell>
                        <TableCell className="text-right font-mono text-sm">{formatSEK(mov.exciseAmount)}</TableCell>
                        <TableCell className="text-muted-foreground text-sm">{mov.note || '-'}</TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-destructive hover:text-destructive"
                            onClick={() => handleDeleteMovement(mov.id)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      </TabsContent>

      {/* ===== PERIODRAPPORT ===== */}
      <TabsContent value="periodrapport" className="space-y-6">
        {/* Controls */}
        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-2">
            <Label>Typ</Label>
            <Select value={reportType} onValueChange={(v) => setReportType(v as 'month' | 'quarter')}>
              <SelectTrigger className="w-[140px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="month">Månad</SelectItem>
                <SelectItem value="quarter">Kvartal</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {reportType === 'month' ? (
            <div className="flex items-center gap-2">
              <Label>Månad</Label>
              <Input
                type="month"
                value={reportMonth}
                onChange={(e) => setReportMonth(e.target.value)}
                className="w-auto"
              />
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <Label>Kvartal</Label>
              <Select value={reportQuarter} onValueChange={setReportQuarter}>
                <SelectTrigger className="w-[200px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(() => {
                    const year = new Date().getFullYear()
                    const options = []
                    for (let y = year; y >= year - 1; y--) {
                      for (let q = 4; q >= 1; q--) {
                        options.push(
                          <SelectItem key={`${y}-Q${q}`} value={`${y}-Q${q}`}>
                            {getQuarterLabel(q, y)}
                          </SelectItem>
                        )
                      }
                    }
                    return options
                  })()}
                </SelectContent>
              </Select>
            </div>
          )}
          <Button variant="outline" size="sm" onClick={generateReport}>
            <BarChart3 className="mr-1.5 h-3.5 w-3.5" />
            Generera rapport
          </Button>
        </div>

        {reportLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : !reportData ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <FileText className="h-8 w-8 text-muted-foreground mb-3" />
            <p className="text-sm text-muted-foreground">Välj period och generera rapport.</p>
          </div>
        ) : (
          <>
            {/* Summary cards */}
            <div className="grid gap-4 md:grid-cols-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">Ingående lager</CardTitle>
                </CardHeader>
                <CardContent>
                  <span className="text-2xl font-bold">{reportData.openingStock}</span>
                  <span className="text-sm text-muted-foreground ml-1">enheter</span>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">Inköp</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-1.5">
                    <ArrowDownToLine className="h-4 w-4 text-emerald-600" />
                    <span className="text-2xl font-bold">{reportData.purchases}</span>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">Försäljning / Svinn</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-1.5">
                    <ArrowUpFromLine className="h-4 w-4 text-red-600" />
                    <span className="text-2xl font-bold">{reportData.sales}</span>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">Utgående lager</CardTitle>
                </CardHeader>
                <CardContent>
                  <span className="text-2xl font-bold">{reportData.closingStock}</span>
                  <span className="text-sm text-muted-foreground ml-1">enheter</span>
                </CardContent>
              </Card>
            </div>

            {/* Total excise */}
            <Card className="border-amber-200 bg-amber-50/50">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-amber-800">Total alkoholskatt för perioden</CardTitle>
              </CardHeader>
              <CardContent>
                <span className="text-3xl font-bold text-amber-900">{formatSEK(reportData.totalExcise)}</span>
                <p className="text-sm text-amber-700 mt-1">
                  Belopp att deklarera till Tullverket
                </p>
              </CardContent>
            </Card>

            {/* Detail table */}
            {reportData.details.length > 0 && (
              <div>
                <h3 className="text-sm font-medium mb-3">Detaljer per produkt</h3>
                <div className="rounded-lg border border-border overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/50">
                        <TableHead>Produkt</TableHead>
                        <TableHead className="text-right">Ingående</TableHead>
                        <TableHead className="text-right">Inköp</TableHead>
                        <TableHead className="text-right">Utgång</TableHead>
                        <TableHead className="text-right">Utgående</TableHead>
                        <TableHead className="text-right">Punktskatt</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {reportData.details.map((d, i) => (
                        <TableRow key={i}>
                          <TableCell className="font-medium">{d.productName}</TableCell>
                          <TableCell className="text-right">{d.opening}</TableCell>
                          <TableCell className="text-right text-emerald-600">+{d.inQty}</TableCell>
                          <TableCell className="text-right text-red-600">-{d.outQty}</TableCell>
                          <TableCell className="text-right font-medium">{d.closing}</TableCell>
                          <TableCell className="text-right font-mono text-sm">{formatSEK(d.excise)}</TableCell>
                        </TableRow>
                      ))}
                      <TableRow className="bg-muted/30 font-medium">
                        <TableCell>Totalt</TableCell>
                        <TableCell className="text-right">{reportData.openingStock}</TableCell>
                        <TableCell className="text-right text-emerald-600">+{reportData.purchases}</TableCell>
                        <TableCell className="text-right text-red-600">-{reportData.sales}</TableCell>
                        <TableCell className="text-right">{reportData.closingStock}</TableCell>
                        <TableCell className="text-right font-mono">{formatSEK(reportData.totalExcise)}</TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </div>
              </div>
            )}

            {/* Tullverket note */}
            <div className="rounded-lg border border-border bg-muted/30 p-4">
              <h4 className="text-sm font-medium mb-2">Information om rapportering</h4>
              <p className="text-sm text-muted-foreground">
                Denna rapport sammanställer underlag för deklaration av alkoholskatt (punktskatt) till Tullverket.
                Deklaration ska normalt lämnas per kalendermånad senast den 12:e i andra månaden efter redovisningsperioden.
                Kontrollera alltid aktuella skattesatser på Tullverkets hemsida.
              </p>
            </div>
          </>
        )}
      </TabsContent>
    </Tabs>
  )

  return (
    <>
      <ModuleWorkspaceShell
        title={mod.name}
        description={mod.desc}
        category="bokforing"
        sectorName={sectorSlug}
        backHref={`/m/${sectorSlug}`}
        settingsHref={settingsHref}
        actions={
          <Button size="sm" onClick={openNewProduct}>
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            Ny produkt
          </Button>
        }
        tabs={tabsContent}
      >
        {tabsContent}
      </ModuleWorkspaceShell>

      {/* ===== PRODUCT DIALOG ===== */}
      <Dialog open={productDialogOpen} onOpenChange={setProductDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingProduct ? 'Redigera produkt' : 'Ny alkoholprodukt'}</DialogTitle>
            <DialogDescription>
              {editingProduct
                ? 'Uppdatera produktens information nedan.'
                : 'Fyll i uppgifter för den nya alkoholprodukten. Punktskatten beräknas automatiskt.'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Produktnamn *</Label>
              <Input
                value={productForm.name}
                onChange={(e) => setProductForm(f => ({ ...f, name: e.target.value }))}
                placeholder="t.ex. Mariestads Export 5.3%"
              />
            </div>

            <div className="space-y-2">
              <Label>Typ</Label>
              <Select
                value={productForm.type}
                onValueChange={(v) => setProductForm(f => ({ ...f, type: v as AlcoholType }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ALCOHOL_TYPES.map(t => (
                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Volym per enhet (liter)</Label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={productForm.volume}
                  onChange={(e) => setProductForm(f => ({ ...f, volume: parseFloat(e.target.value) || 0 }))}
                />
              </div>
              <div className="space-y-2">
                <Label>Alkoholhalt (ABV %)</Label>
                <Input
                  type="number"
                  step="0.1"
                  min="0"
                  max="100"
                  value={productForm.abv}
                  onChange={(e) => setProductForm(f => ({ ...f, abv: parseFloat(e.target.value) || 0 }))}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Antal i lager</Label>
              <Input
                type="number"
                min="0"
                value={productForm.quantity}
                onChange={(e) => setProductForm(f => ({ ...f, quantity: parseInt(e.target.value) || 0 }))}
              />
            </div>

            {/* Excise preview */}
            <div className="rounded-lg border border-amber-200 bg-amber-50/50 p-3">
              <div className="flex items-center gap-2 mb-1">
                <Calculator className="h-4 w-4 text-amber-700" />
                <span className="text-sm font-medium text-amber-800">Beräknad punktskatt</span>
              </div>
              <p className="text-lg font-bold text-amber-900">{formatSEK(previewExcise)} / enhet</p>
              <p className="text-xs text-amber-700 mt-1">
                {productForm.type === 'ol' && `Öl: 2,32 kr/liter per % ABV over 2,8% (${productForm.volume}l x ${Math.max(0, productForm.abv - 2.8).toFixed(1)}%)`}
                {productForm.type === 'vin' && `Vin: 30,67 kr/liter (${productForm.volume}l)`}
                {productForm.type === 'sprit' && `Sprit: 526,98 kr/liter ren alkohol (${productForm.volume}l x ${productForm.abv}%)`}
                {productForm.type === 'cider' && `Cider: 30,67 kr/liter (${productForm.volume}l)`}
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setProductDialogOpen(false)}>
              Avbryt
            </Button>
            <Button onClick={handleSaveProduct} disabled={saving || !productForm.name.trim()}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {editingProduct ? 'Uppdatera' : 'Lägg till'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ===== MOVEMENT DIALOG ===== */}
      <Dialog open={movementDialogOpen} onOpenChange={setMovementDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {movementForm.direction === 'in' ? 'Registrera inleverans' : 'Registrera utgång'}
            </DialogTitle>
            <DialogDescription>
              {movementForm.direction === 'in'
                ? 'Registrera nya varor som kommer in i lagret.'
                : 'Registrera försäljning, svinn eller annat uttag ur lagret.'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Riktning</Label>
              <Select
                value={movementForm.direction}
                onValueChange={(v) => setMovementForm(f => ({ ...f, direction: v as MovementDirection }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="in">Inleverans</SelectItem>
                  <SelectItem value="out">Försäljning / Svinn</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Produkt</Label>
              <Select
                value={movementForm.productId}
                onValueChange={(v) => setMovementForm(f => ({ ...f, productId: v }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Välj produkt" />
                </SelectTrigger>
                <SelectContent>
                  {products.map(p => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name} ({TYPE_LABELS[p.type]}, {p.quantity} i lager)
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Antal enheter</Label>
              <Input
                type="number"
                min="1"
                value={movementForm.quantity}
                onChange={(e) => setMovementForm(f => ({ ...f, quantity: parseInt(e.target.value) || 1 }))}
              />
              {movementForm.productId && (() => {
                const product = products.find(p => p.id === movementForm.productId)
                if (product) {
                  const excise = product.excisePerUnit * movementForm.quantity
                  return (
                    <p className="text-xs text-muted-foreground">
                      Punktskatt: {formatSEK(excise)} ({formatSEK(product.excisePerUnit)} x {movementForm.quantity})
                    </p>
                  )
                }
                return null
              })()}
            </div>

            <div className="space-y-2">
              <Label>Anteckning</Label>
              <Input
                value={movementForm.note}
                onChange={(e) => setMovementForm(f => ({ ...f, note: e.target.value }))}
                placeholder={movementForm.direction === 'in' ? 'Leverantör, fakturanr...' : 'Orsak, svinn...'}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMovementDialogOpen(false)}>
              Avbryt
            </Button>
            <Button
              onClick={handleSaveMovement}
              disabled={saving || !movementForm.productId || movementForm.quantity < 1}
            >
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {movementForm.direction === 'in' ? (
                <>
                  <ArrowDownToLine className="mr-1.5 h-3.5 w-3.5" />
                  Registrera inleverans
                </>
              ) : (
                <>
                  <ArrowUpFromLine className="mr-1.5 h-3.5 w-3.5" />
                  Registrera utgång
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
