'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { ModuleWorkspaceShell } from '@/components/modules/ModuleWorkspaceShell'
import { EmptyModuleState } from '@/components/modules/shared/EmptyModuleState'
import { KPICard } from '@/components/modules/shared/KPICard'
import { ImportDropzone } from '@/components/modules/shared/ImportDropzone'
import { StatusBadge } from '@/components/modules/shared/StatusBadge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
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
  Trash2,
  Loader2,
  Search,
  FileUp,
  Save,
} from 'lucide-react'

interface ModuleWorkspaceProps {
  module: { slug: string; name: string; cat: string; desc: string; longDesc: string }
  sectorSlug: string
  settingsHref: string
}

type ImportSource = 'Shopify' | 'WooCommerce'

interface ImportedOrder {
  id: string
  orderId: string
  date: string
  source: ImportSource
  customerName: string
  totalAmount: number
  vatAmount: number
  shippingAmount: number
  discountAmount: number
  status: 'Importerad' | 'Bokförd' | 'Fel'
  importedAt: string
}

interface ImportBatch {
  id: string
  fileName: string
  source: ImportSource
  importedAt: string
  orderCount: number
  totalAmount: number
  status: 'Komplett' | 'Delvis' | 'Fel'
}

interface Settings {
  salesAccount: string
  vatAccount: string
  shippingAccount: string
  discountAccount: string
  defaultSource: ImportSource
}

const DEFAULT_SETTINGS: Settings = {
  salesAccount: '3001',
  vatAccount: '2610',
  shippingAccount: '3540',
  discountAccount: '3731',
  defaultSource: 'Shopify',
}

const DEFAULT_BATCHES: ImportBatch[] = [
  { id: '1', fileName: 'shopify_export_jan2025.csv', source: 'Shopify', importedAt: '2025-01-15 14:30', orderCount: 45, totalAmount: 67500, status: 'Komplett' },
  { id: '2', fileName: 'woo_orders_dec2024.csv', source: 'WooCommerce', importedAt: '2025-01-02 09:15', orderCount: 120, totalAmount: 189000, status: 'Komplett' },
  { id: '3', fileName: 'shopify_export_dec2024.csv', source: 'Shopify', importedAt: '2024-12-31 16:45', orderCount: 88, totalAmount: 132000, status: 'Delvis' },
]

const DEFAULT_ORDERS: ImportedOrder[] = [
  { id: '1', orderId: 'SH-4501', date: '2025-01-15', source: 'Shopify', customerName: 'Anna Svensson', totalAmount: 1299, vatAmount: 259.80, shippingAmount: 49, discountAmount: 0, status: 'Bokförd', importedAt: '2025-01-15 14:30' },
  { id: '2', orderId: 'SH-4502', date: '2025-01-15', source: 'Shopify', customerName: 'Erik Lindberg', totalAmount: 599, vatAmount: 119.80, shippingAmount: 49, discountAmount: 50, status: 'Bokförd', importedAt: '2025-01-15 14:30' },
  { id: '3', orderId: 'WC-8810', date: '2025-01-14', source: 'WooCommerce', customerName: 'Maria Karlsson', totalAmount: 2499, vatAmount: 499.80, shippingAmount: 0, discountAmount: 0, status: 'Importerad', importedAt: '2025-01-14 10:00' },
  { id: '4', orderId: 'SH-4503', date: '2025-01-14', source: 'Shopify', customerName: 'Olof Nilsson', totalAmount: 899, vatAmount: 179.80, shippingAmount: 49, discountAmount: 100, status: 'Importerad', importedAt: '2025-01-14 11:30' },
  { id: '5', orderId: 'WC-8811', date: '2025-01-13', source: 'WooCommerce', customerName: 'Lisa Bergström', totalAmount: 449, vatAmount: 89.80, shippingAmount: 49, discountAmount: 0, status: 'Fel', importedAt: '2025-01-13 08:00' },
]

function fmt(n: number): string {
  return new Intl.NumberFormat('sv-SE', { maximumFractionDigits: 2 }).format(n)
}

const STATUS_VARIANTS: Record<string, 'success' | 'info' | 'danger' | 'warning'> = {
  'Bokförd': 'success',
  'Importerad': 'info',
  'Fel': 'danger',
  'Komplett': 'success',
  'Delvis': 'warning',
}

export function ShopifyWooImportWorkspace({ module: mod, sectorSlug, settingsHref }: ModuleWorkspaceProps) {
  const supabase = createClient()

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [orders, setOrders] = useState<ImportedOrder[]>([])
  const [batches, setBatches] = useState<ImportBatch[]>([])
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS)

  const [searchQuery, setSearchQuery] = useState('')
  const [filterSource, setFilterSource] = useState<ImportSource | 'all'>('all')
  const [filterStatus, setFilterStatus] = useState<string>('all')

  const [salesAccountInput, setSalesAccountInput] = useState(DEFAULT_SETTINGS.salesAccount)
  const [vatAccountInput, setVatAccountInput] = useState(DEFAULT_SETTINGS.vatAccount)
  const [shippingAccountInput, setShippingAccountInput] = useState(DEFAULT_SETTINGS.shippingAccount)
  const [discountAccountInput, setDiscountAccountInput] = useState(DEFAULT_SETTINGS.discountAccount)

  const fetchData = useCallback(async () => {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); return }

    const fetchConfig = async (key: string) => {
      const { data } = await supabase
        .from('module_configs').select('config_value')
        .eq('user_id', user.id).eq('sector_slug', sectorSlug).eq('module_slug', mod.slug)
        .eq('config_key', key).maybeSingle()
      return data?.config_value
    }

    const seedConfig = async (key: string, value: unknown) => {
      await supabase.from('module_configs').upsert(
        { user_id: user.id, sector_slug: sectorSlug, module_slug: mod.slug, config_key: key, config_value: value },
        { onConflict: 'user_id,sector_slug,module_slug,config_key' }
      )
    }

    const ordData = await fetchConfig('imported_orders')
    if (ordData && Array.isArray(ordData) && ordData.length > 0) {
      setOrders(ordData as ImportedOrder[])
    } else {
      setOrders(DEFAULT_ORDERS)
      await seedConfig('imported_orders', DEFAULT_ORDERS)
    }

    const batchData = await fetchConfig('import_batches')
    if (batchData && Array.isArray(batchData)) {
      setBatches(batchData as ImportBatch[])
    } else {
      setBatches(DEFAULT_BATCHES)
      await seedConfig('import_batches', DEFAULT_BATCHES)
    }

    const sData = await fetchConfig('settings')
    if (sData) {
      const s = sData as Settings
      setSettings(s)
      setSalesAccountInput(s.salesAccount)
      setVatAccountInput(s.vatAccount)
      setShippingAccountInput(s.shippingAccount)
      setDiscountAccountInput(s.discountAccount)
    }

    setLoading(false)
  }, [supabase, sectorSlug, mod.slug])

  useEffect(() => { fetchData() }, [fetchData])

  const filteredOrders = useMemo(() => {
    let result = orders
    if (filterSource !== 'all') result = result.filter((o) => o.source === filterSource)
    if (filterStatus !== 'all') result = result.filter((o) => o.status === filterStatus)
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      result = result.filter((o) => o.orderId.toLowerCase().includes(q) || o.customerName.toLowerCase().includes(q))
    }
    return result.sort((a, b) => b.date.localeCompare(a.date))
  }, [orders, filterSource, filterStatus, searchQuery])

  const totalImported = useMemo(() => orders.length, [orders])
  const totalBooked = useMemo(() => orders.filter((o) => o.status === 'Bokförd').length, [orders])
  const totalAmount = useMemo(() => orders.reduce((s, o) => s + o.totalAmount, 0), [orders])
  const totalVat = useMemo(() => orders.reduce((s, o) => s + o.vatAmount, 0), [orders])

  async function handleFileSelect(file: File) {
    // Parse CSV file
    const text = await file.text()
    const lines = text.split('\n').filter((l) => l.trim())
    if (lines.length < 2) return

    const headers = lines[0].split(',').map((h) => h.trim().toLowerCase())
    const orderIdIdx = headers.findIndex((h) => h.includes('order'))
    const dateIdx = headers.findIndex((h) => h.includes('date') || h.includes('datum'))
    const nameIdx = headers.findIndex((h) => h.includes('name') || h.includes('kund') || h.includes('customer'))
    const totalIdx = headers.findIndex((h) => h.includes('total') || h.includes('belopp'))
    const vatIdx = headers.findIndex((h) => h.includes('vat') || h.includes('moms'))
    const shippingIdx = headers.findIndex((h) => h.includes('shipping') || h.includes('frakt'))
    const discountIdx = headers.findIndex((h) => h.includes('discount') || h.includes('rabatt'))

    const source: ImportSource = file.name.toLowerCase().includes('woo') ? 'WooCommerce' : 'Shopify'
    const now = new Date().toISOString().slice(0, 16).replace('T', ' ')

    const newOrders: ImportedOrder[] = []
    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split(',').map((c) => c.trim())
      if (cols.length < 2) continue

      newOrders.push({
        id: `${Date.now()}-${i}`,
        orderId: orderIdIdx >= 0 ? cols[orderIdIdx] : `IMP-${i}`,
        date: dateIdx >= 0 ? cols[dateIdx] : new Date().toISOString().slice(0, 10),
        source,
        customerName: nameIdx >= 0 ? cols[nameIdx] : 'Okänd',
        totalAmount: totalIdx >= 0 ? parseFloat(cols[totalIdx]) || 0 : 0,
        vatAmount: vatIdx >= 0 ? parseFloat(cols[vatIdx]) || 0 : 0,
        shippingAmount: shippingIdx >= 0 ? parseFloat(cols[shippingIdx]) || 0 : 0,
        discountAmount: discountIdx >= 0 ? parseFloat(cols[discountIdx]) || 0 : 0,
        status: 'Importerad',
        importedAt: now,
      })
    }

    const newBatch: ImportBatch = {
      id: Date.now().toString(36),
      fileName: file.name,
      source,
      importedAt: now,
      orderCount: newOrders.length,
      totalAmount: newOrders.reduce((s, o) => s + o.totalAmount, 0),
      status: 'Komplett',
    }

    const updatedOrders = [...newOrders, ...orders]
    const updatedBatches = [newBatch, ...batches]

    setOrders(updatedOrders)
    setBatches(updatedBatches)

    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      await supabase.from('module_configs').upsert(
        { user_id: user.id, sector_slug: sectorSlug, module_slug: mod.slug, config_key: 'imported_orders', config_value: updatedOrders },
        { onConflict: 'user_id,sector_slug,module_slug,config_key' }
      )
      await supabase.from('module_configs').upsert(
        { user_id: user.id, sector_slug: sectorSlug, module_slug: mod.slug, config_key: 'import_batches', config_value: updatedBatches },
        { onConflict: 'user_id,sector_slug,module_slug,config_key' }
      )
    }
  }

  async function handleBookOrders() {
    const updated = orders.map((o) => o.status === 'Importerad' ? { ...o, status: 'Bokförd' as const } : o)
    setOrders(updated)

    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      await supabase.from('module_configs').upsert(
        { user_id: user.id, sector_slug: sectorSlug, module_slug: mod.slug, config_key: 'imported_orders', config_value: updated },
        { onConflict: 'user_id,sector_slug,module_slug,config_key' }
      )
    }
  }

  async function handleSaveSettings() {
    setSaving(true)
    const newSettings: Settings = {
      ...settings,
      salesAccount: salesAccountInput,
      vatAccount: vatAccountInput,
      shippingAccount: shippingAccountInput,
      discountAccount: discountAccountInput,
    }
    setSettings(newSettings)
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      await supabase.from('module_configs').upsert(
        { user_id: user.id, sector_slug: sectorSlug, module_slug: mod.slug, config_key: 'settings', config_value: newSettings },
        { onConflict: 'user_id,sector_slug,module_slug,config_key' }
      )
    }
    setSaving(false)
  }

  const pendingBooking = useMemo(() => orders.filter((o) => o.status === 'Importerad').length, [orders])

  return (
    <ModuleWorkspaceShell
      title={mod.name}
      description={mod.desc}
      category="import"
      sectorName="E-handel"
      backHref={`/m/${sectorSlug}`}
      settingsHref={settingsHref}
      actions={
        pendingBooking > 0 ? (
          <Button onClick={handleBookOrders}>
            Bokför {pendingBooking} ordrar
          </Button>
        ) : undefined
      }
    >
      <Tabs defaultValue="import" className="space-y-6">
        <TabsList>
          <TabsTrigger value="import">Import</TabsTrigger>
          <TabsTrigger value="ordrar">Ordrar ({orders.length})</TabsTrigger>
          <TabsTrigger value="historik">Importhistorik</TabsTrigger>
          <TabsTrigger value="installningar">Inställningar</TabsTrigger>
        </TabsList>

        <TabsContent value="import" className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <KPICard label="Importerade ordrar" value={String(totalImported)} unit="st" />
            <KPICard label="Bokförda" value={String(totalBooked)} unit="st" />
            <KPICard label="Totalbelopp" value={fmt(totalAmount)} unit="kr" />
            <KPICard label="Moms totalt" value={fmt(totalVat)} unit="kr" />
          </div>

          <ImportDropzone
            accept=".csv"
            onFileSelect={handleFileSelect}
            label="Dra och släpp en Shopify/WooCommerce-export"
            description="CSV-format med kolumner: order, datum, kund, total, moms, frakt, rabatt"
          />
        </TabsContent>

        <TabsContent value="ordrar" className="space-y-6">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <>
              <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
                <div className="relative flex-1 max-w-sm">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input placeholder="Sök order-ID eller kund..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-9" />
                </div>
                <Select value={filterSource} onValueChange={(v) => setFilterSource(v as ImportSource | 'all')}>
                  <SelectTrigger className="w-[160px]"><SelectValue placeholder="Källa" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Alla källor</SelectItem>
                    <SelectItem value="Shopify">Shopify</SelectItem>
                    <SelectItem value="WooCommerce">WooCommerce</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={filterStatus} onValueChange={setFilterStatus}>
                  <SelectTrigger className="w-[160px]"><SelectValue placeholder="Status" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Alla statusar</SelectItem>
                    <SelectItem value="Importerad">Importerad</SelectItem>
                    <SelectItem value="Bokförd">Bokförd</SelectItem>
                    <SelectItem value="Fel">Fel</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {filteredOrders.length === 0 ? (
                <EmptyModuleState
                  icon={FileUp}
                  title="Inga ordrar"
                  description="Importera ordrar via CSV-upload ovan."
                />
              ) : (
                <div className="rounded-xl border border-border overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/50">
                        <TableHead className="font-medium">Order-ID</TableHead>
                        <TableHead className="font-medium">Datum</TableHead>
                        <TableHead className="font-medium">Källa</TableHead>
                        <TableHead className="font-medium">Kund</TableHead>
                        <TableHead className="font-medium text-right">Belopp</TableHead>
                        <TableHead className="font-medium text-right">Moms</TableHead>
                        <TableHead className="font-medium text-right">Frakt</TableHead>
                        <TableHead className="font-medium text-right">Rabatt</TableHead>
                        <TableHead className="font-medium">Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredOrders.map((o) => (
                        <TableRow key={o.id}>
                          <TableCell className="font-mono font-medium">{o.orderId}</TableCell>
                          <TableCell className="text-muted-foreground">{o.date}</TableCell>
                          <TableCell><Badge variant="outline">{o.source}</Badge></TableCell>
                          <TableCell>{o.customerName}</TableCell>
                          <TableCell className="text-right tabular-nums font-medium">{fmt(o.totalAmount)} kr</TableCell>
                          <TableCell className="text-right tabular-nums">{fmt(o.vatAmount)} kr</TableCell>
                          <TableCell className="text-right tabular-nums">{fmt(o.shippingAmount)} kr</TableCell>
                          <TableCell className="text-right tabular-nums">{fmt(o.discountAmount)} kr</TableCell>
                          <TableCell><StatusBadge label={o.status} variant={STATUS_VARIANTS[o.status]} /></TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </>
          )}
        </TabsContent>

        <TabsContent value="historik" className="space-y-6">
          {batches.length === 0 ? (
            <EmptyModuleState icon={FileUp} title="Ingen importhistorik" description="Inga filer har importerats ännu." />
          ) : (
            <div className="rounded-xl border border-border overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead className="font-medium">Filnamn</TableHead>
                    <TableHead className="font-medium">Källa</TableHead>
                    <TableHead className="font-medium">Importerad</TableHead>
                    <TableHead className="font-medium text-right">Ordrar</TableHead>
                    <TableHead className="font-medium text-right">Totalbelopp</TableHead>
                    <TableHead className="font-medium">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {batches.map((b) => (
                    <TableRow key={b.id}>
                      <TableCell className="font-mono text-sm">{b.fileName}</TableCell>
                      <TableCell><Badge variant="outline">{b.source}</Badge></TableCell>
                      <TableCell className="text-muted-foreground">{b.importedAt}</TableCell>
                      <TableCell className="text-right tabular-nums">{b.orderCount}</TableCell>
                      <TableCell className="text-right tabular-nums">{fmt(b.totalAmount)} kr</TableCell>
                      <TableCell><StatusBadge label={b.status} variant={STATUS_VARIANTS[b.status]} /></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>

        <TabsContent value="installningar" className="space-y-6">
          <div className="rounded-xl border border-border bg-card p-6 max-w-md space-y-4">
            <h3 className="text-sm font-semibold">Bokföringskonton</h3>
            <p className="text-xs text-muted-foreground">
              Ange BAS-konton för automatisk bokföring vid import.
            </p>
            <div className="grid gap-3">
              <div className="flex items-center gap-3">
                <span className="text-sm w-32">Försäljning</span>
                <Input value={salesAccountInput} onChange={(e) => setSalesAccountInput(e.target.value)} className="h-8 w-24 font-mono" />
              </div>
              <div className="flex items-center gap-3">
                <span className="text-sm w-32">Moms</span>
                <Input value={vatAccountInput} onChange={(e) => setVatAccountInput(e.target.value)} className="h-8 w-24 font-mono" />
              </div>
              <div className="flex items-center gap-3">
                <span className="text-sm w-32">Frakt</span>
                <Input value={shippingAccountInput} onChange={(e) => setShippingAccountInput(e.target.value)} className="h-8 w-24 font-mono" />
              </div>
              <div className="flex items-center gap-3">
                <span className="text-sm w-32">Rabatt</span>
                <Input value={discountAccountInput} onChange={(e) => setDiscountAccountInput(e.target.value)} className="h-8 w-24 font-mono" />
              </div>
            </div>
            <Button size="sm" onClick={handleSaveSettings} disabled={saving}>
              {saving ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <Save className="mr-2 h-3.5 w-3.5" />}
              Spara
            </Button>
          </div>
        </TabsContent>
      </Tabs>
    </ModuleWorkspaceShell>
  )
}
