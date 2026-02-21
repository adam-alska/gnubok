'use client'

import { useState, useMemo } from 'react'
import type { WorkspaceComponentProps } from '@/lib/extensions/workspace-registry'
import { useExtensionData } from '@/lib/extensions/use-extension-data'
import KPICard from '@/components/extensions/shared/KPICard'
import CsvImportWizard from '@/components/extensions/shared/CsvImportWizard'
import MonthlyTrendTable from '@/components/extensions/shared/MonthlyTrendTable'
import ExtensionLoadingSkeleton from '@/components/extensions/shared/ExtensionLoadingSkeleton'
import ConfirmDeleteDialog from '@/components/extensions/shared/ConfirmDeleteDialog'
import EditEntryDialog from '@/components/extensions/shared/EditEntryDialog'
import DataEntryForm from '@/components/extensions/shared/DataEntryForm'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Pencil, Trash2, ChevronLeft, ChevronRight } from 'lucide-react'

interface ShopifyOrder {
  id: string
  name: string
  createdAt: string
  total: number
  subtotal: number
  shipping: number
  taxes: number
  paymentMethod: string
  fulfillmentStatus: string
}

interface ImportRecord {
  id: string
  date: string
  rowCount: number
}

const TARGET_FIELDS = [
  { key: 'name', label: 'Order', required: true },
  { key: 'createdAt', label: 'Datum', required: true },
  { key: 'total', label: 'Total', required: true },
  { key: 'subtotal', label: 'Subtotal' },
  { key: 'shipping', label: 'Frakt' },
  { key: 'taxes', label: 'Moms' },
  { key: 'paymentMethod', label: 'Betalmetod' },
  { key: 'fulfillmentStatus', label: 'Leveransstatus' },
]

const DEFAULT_MAPPINGS: Record<string, string> = {
  name: 'Name',
  createdAt: 'Created at',
  total: 'Total',
  subtotal: 'Subtotal',
  shipping: 'Shipping',
  taxes: 'Taxes',
  paymentMethod: 'Payment Method',
  fulfillmentStatus: 'Fulfillment Status',
}

const PAGES_SIZE = 20

export default function ShopifyImportWorkspace({}: WorkspaceComponentProps) {
  const { data, save, remove, refresh, isLoading } = useExtensionData('ecommerce', 'shopify-import')

  const orders = useMemo(() =>
    data.filter(d => d.key.startsWith('order:'))
      .map(d => ({ id: d.key.replace('order:', ''), ...(d.value as Omit<ShopifyOrder, 'id'>) }))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  , [data])

  const imports = useMemo(() =>
    data.filter(d => d.key.startsWith('import:'))
      .map(d => ({ id: d.key, ...(d.value as Omit<ImportRecord, 'id'>) }))
      .sort((a, b) => b.date.localeCompare(a.date))
  , [data])

  // ---------------------------------------------------------------------------
  // Filter state
  // ---------------------------------------------------------------------------

  const [searchQuery, setSearchQuery] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [paymentFilter, setPaymentFilter] = useState('__all__')
  const [fulfillmentFilter, setFulfillmentFilter] = useState('__all__')

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1)

  // Edit order dialog state
  const [editOrder, setEditOrder] = useState<ShopifyOrder | null>(null)
  const [editName, setEditName] = useState('')
  const [editDate, setEditDate] = useState('')
  const [editTotal, setEditTotal] = useState('')
  const [editSubtotal, setEditSubtotal] = useState('')
  const [editShipping, setEditShipping] = useState('')
  const [editTaxes, setEditTaxes] = useState('')
  const [editPaymentMethod, setEditPaymentMethod] = useState('')
  const [editFulfillmentStatus, setEditFulfillmentStatus] = useState('')
  const [isSavingEdit, setIsSavingEdit] = useState(false)

  // Delete order dialog state
  const [deleteOrderId, setDeleteOrderId] = useState<string | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)

  // Manual entry form state
  const [manualName, setManualName] = useState('')
  const [manualDate, setManualDate] = useState(new Date().toISOString().slice(0, 10))
  const [manualTotal, setManualTotal] = useState('')
  const [manualSubtotal, setManualSubtotal] = useState('')
  const [manualShipping, setManualShipping] = useState('')
  const [manualTaxes, setManualTaxes] = useState('')
  const [manualPaymentMethod, setManualPaymentMethod] = useState('')
  const [manualFulfillmentStatus, setManualFulfillmentStatus] = useState('')
  const [isSubmittingManual, setIsSubmittingManual] = useState(false)

  // ---------------------------------------------------------------------------
  // Distinct values for filter dropdowns
  // ---------------------------------------------------------------------------

  const paymentMethods = useMemo(() => {
    const set = new Set<string>()
    for (const o of orders) {
      if (o.paymentMethod) set.add(o.paymentMethod)
    }
    return Array.from(set).sort()
  }, [orders])

  const fulfillmentStatuses = useMemo(() => {
    const set = new Set<string>()
    for (const o of orders) {
      if (o.fulfillmentStatus) set.add(o.fulfillmentStatus)
    }
    return Array.from(set).sort()
  }, [orders])

  // ---------------------------------------------------------------------------
  // Active filter count
  // ---------------------------------------------------------------------------

  const activeFilterCount = useMemo(() => {
    let count = 0
    if (searchQuery.trim()) count++
    if (dateFrom) count++
    if (dateTo) count++
    if (paymentFilter !== '__all__') count++
    if (fulfillmentFilter !== '__all__') count++
    return count
  }, [searchQuery, dateFrom, dateTo, paymentFilter, fulfillmentFilter])

  // ---------------------------------------------------------------------------
  // CSV import handler
  // ---------------------------------------------------------------------------

  const handleImport = async (rows: Record<string, string>[]) => {
    const importId = crypto.randomUUID()
    let count = 0

    for (const row of rows) {
      const parseNum = (v?: string) => {
        if (!v) return 0
        return Math.round(parseFloat(v.replace(/\s/g, '').replace(',', '.')) * 100) / 100 || 0
      }

      const orderId = crypto.randomUUID()
      await save(`order:${orderId}`, {
        name: row.name ?? '',
        createdAt: row.createdAt ?? new Date().toISOString().slice(0, 10),
        total: parseNum(row.total),
        subtotal: parseNum(row.subtotal),
        shipping: parseNum(row.shipping),
        taxes: parseNum(row.taxes),
        paymentMethod: row.paymentMethod ?? '',
        fulfillmentStatus: row.fulfillmentStatus ?? '',
      })
      count++
    }

    await save(`import:${importId}`, {
      date: new Date().toISOString().slice(0, 10),
      rowCount: count,
    })

    await refresh()
  }

  // ---------------------------------------------------------------------------
  // Manual order entry handler
  // ---------------------------------------------------------------------------

  const handleManualSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!manualName.trim()) return
    const parseNum = (v: string) => Math.round(parseFloat(v.replace(/\s/g, '').replace(',', '.')) * 100) / 100 || 0

    setIsSubmittingManual(true)
    const orderId = crypto.randomUUID()
    await save(`order:${orderId}`, {
      name: manualName.trim(),
      createdAt: manualDate || new Date().toISOString().slice(0, 10),
      total: parseNum(manualTotal),
      subtotal: parseNum(manualSubtotal),
      shipping: parseNum(manualShipping),
      taxes: parseNum(manualTaxes),
      paymentMethod: manualPaymentMethod,
      fulfillmentStatus: manualFulfillmentStatus,
    })

    setManualName('')
    setManualDate(new Date().toISOString().slice(0, 10))
    setManualTotal('')
    setManualSubtotal('')
    setManualShipping('')
    setManualTaxes('')
    setManualPaymentMethod('')
    setManualFulfillmentStatus('')
    await refresh()
    setIsSubmittingManual(false)
  }

  // ---------------------------------------------------------------------------
  // Edit order handlers
  // ---------------------------------------------------------------------------

  const openEditOrder = (order: ShopifyOrder) => {
    setEditOrder(order)
    setEditName(order.name)
    setEditDate(order.createdAt)
    setEditTotal(String(order.total))
    setEditSubtotal(String(order.subtotal))
    setEditShipping(String(order.shipping))
    setEditTaxes(String(order.taxes))
    setEditPaymentMethod(order.paymentMethod)
    setEditFulfillmentStatus(order.fulfillmentStatus)
  }

  const handleSaveEdit = async () => {
    if (!editOrder) return
    const parseNum = (v: string) => Math.round(parseFloat(v.replace(/\s/g, '').replace(',', '.')) * 100) / 100 || 0

    setIsSavingEdit(true)
    await save(`order:${editOrder.id}`, {
      name: editName,
      createdAt: editDate || new Date().toISOString().slice(0, 10),
      total: parseNum(editTotal),
      subtotal: parseNum(editSubtotal),
      shipping: parseNum(editShipping),
      taxes: parseNum(editTaxes),
      paymentMethod: editPaymentMethod,
      fulfillmentStatus: editFulfillmentStatus,
    })
    await refresh()
    setIsSavingEdit(false)
  }

  // ---------------------------------------------------------------------------
  // Delete order handler
  // ---------------------------------------------------------------------------

  const handleConfirmDelete = async () => {
    if (!deleteOrderId) return
    setIsDeleting(true)
    await remove(`order:${deleteOrderId}`)
    await refresh()
    setIsDeleting(false)
  }

  // ---------------------------------------------------------------------------
  // Stats
  // ---------------------------------------------------------------------------

  const totalRevenue = orders.reduce((s, o) => s + o.total, 0)
  const aov = orders.length > 0 ? Math.round(totalRevenue / orders.length) : 0
  const totalTaxes = orders.reduce((s, o) => s + o.taxes, 0)
  const totalSubtotal = orders.reduce((s, o) => s + o.subtotal, 0)
  const avgVatRate = totalSubtotal > 0
    ? Math.round((totalTaxes / totalSubtotal) * 10000) / 100
    : 0

  // Monthly trend
  const monthlyTrend = useMemo(() => {
    const map = new Map<string, { revenue: number; count: number }>()
    for (const o of orders) {
      const month = o.createdAt.slice(0, 7)
      const existing = map.get(month) ?? { revenue: 0, count: 0 }
      existing.revenue += o.total
      existing.count++
      map.set(month, existing)
    }
    return Array.from(map.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, data]) => ({ month, value: data.revenue }))
  }, [orders])

  // Monthly VAT breakdown
  const monthlyVat = useMemo(() => {
    const map = new Map<string, { taxes: number; subtotal: number }>()
    for (const o of orders) {
      const month = o.createdAt.slice(0, 7)
      const existing = map.get(month) ?? { taxes: 0, subtotal: 0 }
      existing.taxes += o.taxes
      existing.subtotal += o.subtotal
      map.set(month, existing)
    }
    return Array.from(map.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, d]) => ({
        month,
        taxes: Math.round(d.taxes * 100) / 100,
        subtotal: Math.round(d.subtotal * 100) / 100,
        rate: d.subtotal > 0 ? Math.round((d.taxes / d.subtotal) * 10000) / 100 : 0,
      }))
  }, [orders])

  // Payment method breakdown
  const paymentBreakdown = useMemo(() => {
    const map = new Map<string, { count: number; total: number }>()
    for (const o of orders) {
      const method = o.paymentMethod || 'Okant'
      const existing = map.get(method) ?? { count: 0, total: 0 }
      existing.count++
      existing.total += o.total
      map.set(method, existing)
    }
    return Array.from(map.entries())
      .map(([method, data]) => ({ method, ...data }))
      .sort((a, b) => b.total - a.total)
  }, [orders])

  // Fulfillment breakdown
  const fulfillmentBreakdown = useMemo(() => {
    const map = new Map<string, number>()
    for (const o of orders) {
      const status = o.fulfillmentStatus || 'Okant'
      map.set(status, (map.get(status) ?? 0) + 1)
    }
    return Array.from(map.entries())
      .map(([status, count]) => ({ status, count }))
      .sort((a, b) => b.count - a.count)
  }, [orders])

  // ---------------------------------------------------------------------------
  // Filtered & paginated orders
  // ---------------------------------------------------------------------------

  const filteredOrders = useMemo(() => {
    let result = orders

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      result = result.filter(o =>
        o.name.toLowerCase().includes(q) ||
        o.paymentMethod.toLowerCase().includes(q) ||
        o.fulfillmentStatus.toLowerCase().includes(q)
      )
    }

    if (dateFrom) {
      result = result.filter(o => o.createdAt >= dateFrom)
    }

    if (dateTo) {
      result = result.filter(o => o.createdAt <= dateTo)
    }

    if (paymentFilter !== '__all__') {
      result = result.filter(o => o.paymentMethod === paymentFilter)
    }

    if (fulfillmentFilter !== '__all__') {
      result = result.filter(o => o.fulfillmentStatus === fulfillmentFilter)
    }

    return result
  }, [orders, searchQuery, dateFrom, dateTo, paymentFilter, fulfillmentFilter])

  const totalPages = Math.max(1, Math.ceil(filteredOrders.length / PAGES_SIZE))
  const safePage = Math.min(currentPage, totalPages)
  const paginatedOrders = filteredOrders.slice(
    (safePage - 1) * PAGES_SIZE,
    safePage * PAGES_SIZE
  )

  // Reset page when filters change
  const resetPage = () => setCurrentPage(1)

  // ---------------------------------------------------------------------------
  // Clear filters
  // ---------------------------------------------------------------------------

  const clearFilters = () => {
    setSearchQuery('')
    setDateFrom('')
    setDateTo('')
    setPaymentFilter('__all__')
    setFulfillmentFilter('__all__')
    setCurrentPage(1)
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  if (isLoading) return <ExtensionLoadingSkeleton />

  return (
    <div className="space-y-6">
      {/* Edit order dialog */}
      <EditEntryDialog
        open={editOrder !== null}
        onOpenChange={open => { if (!open) setEditOrder(null) }}
        title="Redigera order"
        description="Andra uppgifterna for denna order."
        onSave={handleSaveEdit}
        isSaving={isSavingEdit}
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Order</Label>
            <Input value={editName} onChange={e => setEditName(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Datum</Label>
            <Input type="date" value={editDate} onChange={e => setEditDate(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Total</Label>
            <Input type="number" step="0.01" min="0" value={editTotal} onChange={e => setEditTotal(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Subtotal</Label>
            <Input type="number" step="0.01" min="0" value={editSubtotal} onChange={e => setEditSubtotal(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Frakt</Label>
            <Input type="number" step="0.01" min="0" value={editShipping} onChange={e => setEditShipping(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Moms</Label>
            <Input type="number" step="0.01" min="0" value={editTaxes} onChange={e => setEditTaxes(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Betalmetod</Label>
            <Input value={editPaymentMethod} onChange={e => setEditPaymentMethod(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Leveransstatus</Label>
            <Input value={editFulfillmentStatus} onChange={e => setEditFulfillmentStatus(e.target.value)} />
          </div>
        </div>
      </EditEntryDialog>

      {/* Delete order dialog */}
      <ConfirmDeleteDialog
        open={deleteOrderId !== null}
        onOpenChange={open => { if (!open) setDeleteOrderId(null) }}
        title="Ta bort order"
        description="Ar du saker pa att du vill ta bort denna order? Atgarden kan inte angras."
        onConfirm={handleConfirmDelete}
        isDeleting={isDeleting}
      />

      <Tabs defaultValue="import">
        <TabsList>
          <TabsTrigger value="import">Import</TabsTrigger>
          <TabsTrigger value="orders">Ordrar</TabsTrigger>
          <TabsTrigger value="stats">Statistik</TabsTrigger>
        </TabsList>

        {/* ------------------------------------------------------------------ */}
        {/* Import tab                                                          */}
        {/* ------------------------------------------------------------------ */}
        <TabsContent value="import" className="space-y-6 mt-4">
          <CsvImportWizard
            targetFields={TARGET_FIELDS}
            defaultMappings={DEFAULT_MAPPINGS}
            onImport={handleImport}
          />

          {/* Manual order entry */}
          <DataEntryForm
            title="Lagg till order manuellt"
            onSubmit={handleManualSubmit}
            submitLabel="Lagg till"
            isSubmitting={isSubmittingManual}
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="manual-name">Order *</Label>
                <Input
                  id="manual-name"
                  value={manualName}
                  onChange={e => setManualName(e.target.value)}
                  placeholder="t.ex. #1001"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="manual-date">Datum *</Label>
                <Input
                  id="manual-date"
                  type="date"
                  value={manualDate}
                  onChange={e => setManualDate(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="manual-total">Total</Label>
                <Input
                  id="manual-total"
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="0"
                  value={manualTotal}
                  onChange={e => setManualTotal(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="manual-subtotal">Subtotal</Label>
                <Input
                  id="manual-subtotal"
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="0"
                  value={manualSubtotal}
                  onChange={e => setManualSubtotal(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="manual-shipping">Frakt</Label>
                <Input
                  id="manual-shipping"
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="0"
                  value={manualShipping}
                  onChange={e => setManualShipping(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="manual-taxes">Moms</Label>
                <Input
                  id="manual-taxes"
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="0"
                  value={manualTaxes}
                  onChange={e => setManualTaxes(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="manual-payment">Betalmetod</Label>
                <Input
                  id="manual-payment"
                  value={manualPaymentMethod}
                  onChange={e => setManualPaymentMethod(e.target.value)}
                  placeholder="t.ex. Stripe"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="manual-fulfillment">Leveransstatus</Label>
                <Input
                  id="manual-fulfillment"
                  value={manualFulfillmentStatus}
                  onChange={e => setManualFulfillmentStatus(e.target.value)}
                  placeholder="t.ex. fulfilled"
                />
              </div>
            </div>
          </DataEntryForm>

          {imports.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold mb-3">Importhistorik</h3>
              <div className="rounded-xl border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Datum</TableHead>
                      <TableHead className="text-right">Ordrar</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {imports.map(imp => (
                      <TableRow key={imp.id}>
                        <TableCell>{imp.date}</TableCell>
                        <TableCell className="text-right tabular-nums">{imp.rowCount}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}
        </TabsContent>

        {/* ------------------------------------------------------------------ */}
        {/* Orders tab                                                          */}
        {/* ------------------------------------------------------------------ */}
        <TabsContent value="orders" className="space-y-6 mt-4">
          {/* Filters */}
          <div className="space-y-3">
            <div className="flex flex-wrap items-end gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Sok</Label>
                <Input
                  placeholder="Sok ordrar..."
                  value={searchQuery}
                  onChange={e => { setSearchQuery(e.target.value); resetPage() }}
                  className="w-48"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Fran datum</Label>
                <Input
                  type="date"
                  value={dateFrom}
                  onChange={e => { setDateFrom(e.target.value); resetPage() }}
                  className="w-40"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Till datum</Label>
                <Input
                  type="date"
                  value={dateTo}
                  onChange={e => { setDateTo(e.target.value); resetPage() }}
                  className="w-40"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Betalmetod</Label>
                <Select value={paymentFilter} onValueChange={v => { setPaymentFilter(v); resetPage() }}>
                  <SelectTrigger className="w-40">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">Alla</SelectItem>
                    {paymentMethods.map(m => (
                      <SelectItem key={m} value={m}>{m}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Leveransstatus</Label>
                <Select value={fulfillmentFilter} onValueChange={v => { setFulfillmentFilter(v); resetPage() }}>
                  <SelectTrigger className="w-40">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">Alla</SelectItem>
                    {fulfillmentStatuses.map(s => (
                      <SelectItem key={s} value={s}>{s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {activeFilterCount > 0 && (
              <div className="flex items-center gap-2">
                <Badge variant="secondary">{activeFilterCount} aktiva filter</Badge>
                <Button variant="ghost" size="sm" className="text-xs" onClick={clearFilters}>
                  Rensa filter
                </Button>
              </div>
            )}
          </div>

          {filteredOrders.length === 0 ? (
            <p className="text-sm text-muted-foreground">Inga ordrar hittades.</p>
          ) : (
            <>
              <div className="rounded-xl border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Order</TableHead>
                      <TableHead>Datum</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                      <TableHead className="text-right">Frakt</TableHead>
                      <TableHead className="text-right">Moms</TableHead>
                      <TableHead>Betalning</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="w-20"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paginatedOrders.map(o => (
                      <TableRow key={o.id}>
                        <TableCell className="font-medium">{o.name}</TableCell>
                        <TableCell>{o.createdAt}</TableCell>
                        <TableCell className="text-right tabular-nums">{o.total.toLocaleString('sv-SE')} kr</TableCell>
                        <TableCell className="text-right tabular-nums">{o.shipping.toLocaleString('sv-SE')} kr</TableCell>
                        <TableCell className="text-right tabular-nums">{o.taxes.toLocaleString('sv-SE')} kr</TableCell>
                        <TableCell>{o.paymentMethod}</TableCell>
                        <TableCell>
                          <Badge variant={o.fulfillmentStatus === 'fulfilled' ? 'default' : 'secondary'}>
                            {o.fulfillmentStatus || 'Okant'}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <Button variant="ghost" size="sm" onClick={() => openEditOrder(o)}>
                              <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
                            </Button>
                            <Button variant="ghost" size="sm" onClick={() => setDeleteOrderId(o.id)}>
                              <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {/* Pagination */}
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">
                  {filteredOrders.length} ordrar totalt
                </p>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={safePage <= 1}
                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  >
                    <ChevronLeft className="h-4 w-4 mr-1" />
                    Foregaende
                  </Button>
                  <span className="text-sm tabular-nums">
                    Sida {safePage} av {totalPages}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={safePage >= totalPages}
                    onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  >
                    Nasta
                    <ChevronRight className="h-4 w-4 ml-1" />
                  </Button>
                </div>
              </div>
            </>
          )}
        </TabsContent>

        {/* ------------------------------------------------------------------ */}
        {/* Stats tab                                                           */}
        {/* ------------------------------------------------------------------ */}
        <TabsContent value="stats" className="space-y-6 mt-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <KPICard label="Antal ordrar" value={orders.length} />
            <KPICard label="Total intakt" value={totalRevenue.toLocaleString('sv-SE')} suffix="kr" />
            <KPICard label="AOV" value={aov.toLocaleString('sv-SE')} suffix="kr" />
          </div>

          {/* VAT analytics */}
          <div>
            <h3 className="text-sm font-semibold mb-3">Momsanalys</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
              <KPICard
                label="Total moms"
                value={(Math.round(totalTaxes * 100) / 100).toLocaleString('sv-SE')}
                suffix="kr"
              />
              <KPICard
                label="Genomsnittlig momssats"
                value={avgVatRate}
                suffix="%"
              />
            </div>

            {monthlyVat.length > 0 && (
              <div className="rounded-xl border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Manad</TableHead>
                      <TableHead className="text-right">Subtotal</TableHead>
                      <TableHead className="text-right">Moms</TableHead>
                      <TableHead className="text-right">Momssats</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {monthlyVat.map(m => (
                      <TableRow key={m.month}>
                        <TableCell className="font-medium">{m.month}</TableCell>
                        <TableCell className="text-right tabular-nums">{m.subtotal.toLocaleString('sv-SE')} kr</TableCell>
                        <TableCell className="text-right tabular-nums">{m.taxes.toLocaleString('sv-SE')} kr</TableCell>
                        <TableCell className="text-right tabular-nums">{m.rate}%</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>

          {monthlyTrend.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold mb-3">Intakt per manad</h3>
              <MonthlyTrendTable rows={monthlyTrend} valueLabel="Intakt" />
            </div>
          )}

          {paymentBreakdown.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold mb-3">Per betalmetod</h3>
              <div className="rounded-xl border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Betalmetod</TableHead>
                      <TableHead className="text-right">Ordrar</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paymentBreakdown.map(p => (
                      <TableRow key={p.method}>
                        <TableCell className="font-medium">{p.method}</TableCell>
                        <TableCell className="text-right tabular-nums">{p.count}</TableCell>
                        <TableCell className="text-right tabular-nums">{p.total.toLocaleString('sv-SE')} kr</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}

          {fulfillmentBreakdown.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold mb-3">Per leveransstatus</h3>
              <div className="rounded-xl border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Ordrar</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {fulfillmentBreakdown.map(f => (
                      <TableRow key={f.status}>
                        <TableCell className="font-medium">{f.status}</TableCell>
                        <TableCell className="text-right tabular-nums">{f.count}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}
