'use client'

import { useState, useMemo } from 'react'
import type { WorkspaceComponentProps } from '@/lib/extensions/workspace-registry'
import { useExtensionData } from '@/lib/extensions/use-extension-data'
import KPICard from '@/components/extensions/shared/KPICard'
import CsvImportWizard from '@/components/extensions/shared/CsvImportWizard'
import ExtensionLoadingSkeleton from '@/components/extensions/shared/ExtensionLoadingSkeleton'
import ConfirmDeleteDialog from '@/components/extensions/shared/ConfirmDeleteDialog'
import EditEntryDialog from '@/components/extensions/shared/EditEntryDialog'
import DataEntryForm from '@/components/extensions/shared/DataEntryForm'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { Pencil, Trash2, AlertTriangle, ChevronLeft, ChevronRight } from 'lucide-react'

interface DailySale {
  date: string
  total: number
  cash: number
  card: number
  swish: number
  vat: number
}

interface ImportRecord {
  id: string
  date: string
  fileName: string
  rowCount: number
}

const PAGE_SIZE = 20

const TARGET_FIELDS = [
  { key: 'date', label: 'Datum', required: true },
  { key: 'total', label: 'Totalt', required: true },
  { key: 'cash', label: 'Kontant' },
  { key: 'card', label: 'Kort' },
  { key: 'swish', label: 'Swish' },
  { key: 'vat', label: 'Moms' },
]

const DEFAULT_MAPPINGS: Record<string, string> = {
  date: 'Datum',
  total: 'Total',
  cash: 'Kontant',
  card: 'Kort',
  swish: 'Swish',
  vat: 'Moms',
}

const parseNum = (v?: string) => {
  if (!v) return 0
  return Math.round(parseFloat(v.replace(/\s/g, '').replace(',', '.')) * 100) / 100 || 0
}

export default function PosImportWorkspace({}: WorkspaceComponentProps) {
  const { data, save, remove, refresh, isLoading } = useExtensionData('restaurant', 'pos-import')

  // Pagination
  const [page, setPage] = useState(0)

  // Manual entry form state
  const now = new Date()
  const [entryDate, setEntryDate] = useState(now.toISOString().slice(0, 10))
  const [entryTotal, setEntryTotal] = useState('')
  const [entryCash, setEntryCash] = useState('')
  const [entryCard, setEntryCard] = useState('')
  const [entrySwish, setEntrySwish] = useState('')
  const [entryVat, setEntryVat] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Edit dialog state
  const [editEntry, setEditEntry] = useState<DailySale | null>(null)
  const [editTotal, setEditTotal] = useState('')
  const [editCash, setEditCash] = useState('')
  const [editCard, setEditCard] = useState('')
  const [editSwish, setEditSwish] = useState('')
  const [editVat, setEditVat] = useState('')
  const [isSaving, setIsSaving] = useState(false)

  // Delete dialog state
  const [deleteEntry, setDeleteEntry] = useState<DailySale | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)

  const dailySales = useMemo(() =>
    data.filter(d => d.key.startsWith('daily:'))
      .map(d => ({ date: d.key.replace('daily:', ''), ...(d.value as Omit<DailySale, 'date'>) }))
      .sort((a, b) => b.date.localeCompare(a.date))
  , [data])

  const imports = useMemo(() =>
    data.filter(d => d.key.startsWith('import:'))
      .map(d => ({ id: d.key, ...(d.value as Omit<ImportRecord, 'id'>) }))
      .sort((a, b) => b.date.localeCompare(a.date))
  , [data])

  // Pagination calculations
  const totalPages = Math.max(1, Math.ceil(dailySales.length / PAGE_SIZE))
  const paginatedSales = dailySales.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)

  const handleImport = async (rows: Record<string, string>[]) => {
    const importId = crypto.randomUUID()
    let count = 0

    for (const row of rows) {
      const date = row.date
      if (!date) continue

      await save(`daily:${date}`, {
        total: parseNum(row.total),
        cash: parseNum(row.cash),
        card: parseNum(row.card),
        swish: parseNum(row.swish),
        vat: parseNum(row.vat),
      })
      count++
    }

    await save(`import:${importId}`, {
      date: new Date().toISOString().slice(0, 10),
      fileName: `CSV-import`,
      rowCount: count,
    })

    await refresh()
    setPage(0)
  }

  // Manual entry validation
  const manualPaymentSum = Math.round(
    ((parseFloat(entryCash) || 0) + (parseFloat(entryCard) || 0) + (parseFloat(entrySwish) || 0)) * 100
  ) / 100
  const manualTotal = Math.round((parseFloat(entryTotal) || 0) * 100) / 100
  const manualDiffPct = manualTotal > 0
    ? Math.round(Math.abs(manualPaymentSum - manualTotal) / manualTotal * 10000) / 100
    : 0
  const showManualWarning = manualTotal > 0 && manualPaymentSum > 0 && manualDiffPct > 5

  const handleManualSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!entryDate || !entryTotal) return
    setIsSubmitting(true)

    const total = Math.round((parseFloat(entryTotal) || 0) * 100) / 100
    const cash = Math.round((parseFloat(entryCash) || 0) * 100) / 100
    const card = Math.round((parseFloat(entryCard) || 0) * 100) / 100
    const swish = Math.round((parseFloat(entrySwish) || 0) * 100) / 100
    const vat = Math.round((parseFloat(entryVat) || 0) * 100) / 100

    await save(`daily:${entryDate}`, { total, cash, card, swish, vat })
    await refresh()

    setEntryTotal('')
    setEntryCash('')
    setEntryCard('')
    setEntrySwish('')
    setEntryVat('')
    setIsSubmitting(false)
    setPage(0)
  }

  // Edit handlers
  const openEdit = (entry: DailySale) => {
    setEditEntry(entry)
    setEditTotal(String(entry.total))
    setEditCash(String(entry.cash))
    setEditCard(String(entry.card))
    setEditSwish(String(entry.swish))
    setEditVat(String(entry.vat))
  }

  const handleEditSave = async () => {
    if (!editEntry) return
    setIsSaving(true)

    const total = Math.round((parseFloat(editTotal) || 0) * 100) / 100
    const cash = Math.round((parseFloat(editCash) || 0) * 100) / 100
    const card = Math.round((parseFloat(editCard) || 0) * 100) / 100
    const swish = Math.round((parseFloat(editSwish) || 0) * 100) / 100
    const vat = Math.round((parseFloat(editVat) || 0) * 100) / 100

    await save(`daily:${editEntry.date}`, { total, cash, card, swish, vat })
    await refresh()
    setIsSaving(false)
  }

  // Edit dialog validation
  const editPaymentSum = Math.round(
    ((parseFloat(editCash) || 0) + (parseFloat(editCard) || 0) + (parseFloat(editSwish) || 0)) * 100
  ) / 100
  const editTotalVal = Math.round((parseFloat(editTotal) || 0) * 100) / 100
  const editDiffPct = editTotalVal > 0
    ? Math.round(Math.abs(editPaymentSum - editTotalVal) / editTotalVal * 10000) / 100
    : 0
  const showEditWarning = editTotalVal > 0 && editPaymentSum > 0 && editDiffPct > 5

  // Delete handler
  const handleDelete = async () => {
    if (!deleteEntry) return
    setIsDeleting(true)
    await remove(`daily:${deleteEntry.date}`)
    await refresh()
    setIsDeleting(false)
  }

  // KPI calculations
  const totals = useMemo(() => {
    const total = dailySales.reduce((s, d) => s + d.total, 0)
    const cash = dailySales.reduce((s, d) => s + d.cash, 0)
    const card = dailySales.reduce((s, d) => s + d.card, 0)
    const swish = dailySales.reduce((s, d) => s + d.swish, 0)
    const vat = dailySales.reduce((s, d) => s + d.vat, 0)
    const avg = dailySales.length > 0 ? Math.round(total / dailySales.length) : 0
    return { total, cash, card, swish, vat, avg }
  }, [dailySales])

  // VAT analytics
  const vatPct = totals.total > 0
    ? Math.round(totals.vat / totals.total * 10000) / 100
    : 0
  const vatOutOfRange = vatPct > 0 && (vatPct < 20 || vatPct > 30)

  // Payment method monthly breakdown
  const paymentMonthly = useMemo(() => {
    const map = new Map<string, { cash: number; card: number; swish: number; total: number }>()
    for (const d of dailySales) {
      const month = d.date.slice(0, 7)
      const existing = map.get(month) ?? { cash: 0, card: 0, swish: 0, total: 0 }
      existing.cash += d.cash
      existing.card += d.card
      existing.swish += d.swish
      existing.total += d.total
      map.set(month, existing)
    }
    return Array.from(map.entries())
      .sort(([a], [b]) => b.localeCompare(a))
      .map(([month, vals]) => ({
        month,
        cashPct: vals.total > 0 ? Math.round(vals.cash / vals.total * 10000) / 100 : 0,
        cardPct: vals.total > 0 ? Math.round(vals.card / vals.total * 10000) / 100 : 0,
        swishPct: vals.total > 0 ? Math.round(vals.swish / vals.total * 10000) / 100 : 0,
        cash: vals.cash,
        card: vals.card,
        swish: vals.swish,
        total: vals.total,
      }))
  }, [dailySales])

  // VAT per month
  const vatMonthly = useMemo(() => {
    const map = new Map<string, { vat: number; total: number }>()
    for (const d of dailySales) {
      const month = d.date.slice(0, 7)
      const existing = map.get(month) ?? { vat: 0, total: 0 }
      existing.vat += d.vat
      existing.total += d.total
      map.set(month, existing)
    }
    return Array.from(map.entries())
      .sort(([a], [b]) => b.localeCompare(a))
      .map(([month, vals]) => ({
        month,
        vat: Math.round(vals.vat * 100) / 100,
        total: Math.round(vals.total * 100) / 100,
        vatPct: vals.total > 0 ? Math.round(vals.vat / vals.total * 10000) / 100 : 0,
      }))
  }, [dailySales])

  if (isLoading) return <ExtensionLoadingSkeleton />

  return (
    <div className="space-y-6">
      <Tabs defaultValue="import">
        <TabsList>
          <TabsTrigger value="import">Import</TabsTrigger>
          <TabsTrigger value="register">Registrera</TabsTrigger>
          <TabsTrigger value="history">Historik</TabsTrigger>
        </TabsList>

        {/* CSV Import tab */}
        <TabsContent value="import" className="space-y-6 mt-4">
          <CsvImportWizard
            targetFields={TARGET_FIELDS}
            defaultMappings={DEFAULT_MAPPINGS}
            onImport={handleImport}
          />
        </TabsContent>

        {/* Manual entry tab */}
        <TabsContent value="register" className="space-y-6 mt-4">
          <DataEntryForm
            title="Registrera dagskassa"
            onSubmit={handleManualSubmit}
            submitLabel="Registrera"
            isSubmitting={isSubmitting}
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="pos-date">Datum</Label>
                <Input
                  id="pos-date"
                  type="date"
                  value={entryDate}
                  onChange={e => setEntryDate(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="pos-total">Totalt (kr)</Label>
                <Input
                  id="pos-total"
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="0"
                  value={entryTotal}
                  onChange={e => setEntryTotal(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="pos-cash">Kontant (kr)</Label>
                <Input
                  id="pos-cash"
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="0"
                  value={entryCash}
                  onChange={e => setEntryCash(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="pos-card">Kort (kr)</Label>
                <Input
                  id="pos-card"
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="0"
                  value={entryCard}
                  onChange={e => setEntryCard(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="pos-swish">Swish (kr)</Label>
                <Input
                  id="pos-swish"
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="0"
                  value={entrySwish}
                  onChange={e => setEntrySwish(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="pos-vat">Moms (kr)</Label>
                <Input
                  id="pos-vat"
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="0"
                  value={entryVat}
                  onChange={e => setEntryVat(e.target.value)}
                />
              </div>
            </div>

            {showManualWarning && (
              <div className="flex items-center gap-2 rounded-lg border border-yellow-300 bg-yellow-50 p-3 text-sm text-yellow-800 dark:border-yellow-700 dark:bg-yellow-950/30 dark:text-yellow-200">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                <span>
                  Kontant + Kort + Swish ({manualPaymentSum.toLocaleString('sv-SE')} kr) avviker {manualDiffPct}% fran Totalt ({manualTotal.toLocaleString('sv-SE')} kr).
                </span>
              </div>
            )}
          </DataEntryForm>
        </TabsContent>

        {/* History tab */}
        <TabsContent value="history" className="space-y-6 mt-4">
          {/* KPI cards */}
          <div className="grid grid-cols-1 sm:grid-cols-5 gap-4">
            <KPICard label="Total forsaljning" value={totals.total.toLocaleString('sv-SE')} suffix="kr" />
            <KPICard label="Snitt per dag" value={totals.avg.toLocaleString('sv-SE')} suffix="kr" />
            <KPICard label="Kort" value={totals.card.toLocaleString('sv-SE')} suffix="kr" />
            <KPICard label="Swish" value={totals.swish.toLocaleString('sv-SE')} suffix="kr" />
            <KPICard
              label="Snitt momsandel"
              value={vatPct}
              suffix="%"
              className={vatOutOfRange ? 'border-yellow-300 dark:border-yellow-700' : ''}
            />
          </div>

          {/* VAT alert */}
          {vatOutOfRange && dailySales.length > 0 && (
            <div className="flex items-center gap-2 rounded-lg border border-yellow-300 bg-yellow-50 p-3 text-sm text-yellow-800 dark:border-yellow-700 dark:bg-yellow-950/30 dark:text-yellow-200">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <span>
                Momsandelen ({vatPct}%) ligger utanfor forvantat intervall (20-30%) for svenska restauranger. Kontrollera att moms registreras korrekt.
              </span>
            </div>
          )}

          {/* Import history */}
          {imports.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold mb-3">Importer</h3>
              <div className="rounded-xl border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Datum</TableHead>
                      <TableHead>Fil</TableHead>
                      <TableHead className="text-right">Rader</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {imports.map(imp => (
                      <TableRow key={imp.id}>
                        <TableCell>{imp.date}</TableCell>
                        <TableCell>{imp.fileName}</TableCell>
                        <TableCell className="text-right tabular-nums">{imp.rowCount}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}

          {/* VAT per month */}
          {vatMonthly.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold mb-3">Moms per manad</h3>
              <div className="rounded-xl border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Period</TableHead>
                      <TableHead className="text-right">Forsaljning</TableHead>
                      <TableHead className="text-right">Moms</TableHead>
                      <TableHead className="text-right">Momsandel</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {vatMonthly.map(row => (
                      <TableRow key={row.month}>
                        <TableCell className="font-medium">{row.month}</TableCell>
                        <TableCell className="text-right tabular-nums">{row.total.toLocaleString('sv-SE')} kr</TableCell>
                        <TableCell className="text-right tabular-nums">{row.vat.toLocaleString('sv-SE')} kr</TableCell>
                        <TableCell className="text-right tabular-nums">
                          <span className={row.vatPct > 0 && (row.vatPct < 20 || row.vatPct > 30) ? 'text-yellow-600 dark:text-yellow-400' : ''}>
                            {row.vatPct}%
                          </span>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}

          {/* Payment method trend */}
          {paymentMonthly.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold mb-3">Betalmetoder per manad</h3>
              <div className="rounded-xl border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Period</TableHead>
                      <TableHead className="text-right">Totalt</TableHead>
                      <TableHead className="text-right">Kontant</TableHead>
                      <TableHead className="text-right">% Kontant</TableHead>
                      <TableHead className="text-right">Kort</TableHead>
                      <TableHead className="text-right">% Kort</TableHead>
                      <TableHead className="text-right">Swish</TableHead>
                      <TableHead className="text-right">% Swish</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paymentMonthly.map(row => (
                      <TableRow key={row.month}>
                        <TableCell className="font-medium">{row.month}</TableCell>
                        <TableCell className="text-right tabular-nums">{row.total.toLocaleString('sv-SE')} kr</TableCell>
                        <TableCell className="text-right tabular-nums">{row.cash.toLocaleString('sv-SE')} kr</TableCell>
                        <TableCell className="text-right tabular-nums">{row.cashPct}%</TableCell>
                        <TableCell className="text-right tabular-nums">{row.card.toLocaleString('sv-SE')} kr</TableCell>
                        <TableCell className="text-right tabular-nums">{row.cardPct}%</TableCell>
                        <TableCell className="text-right tabular-nums">{row.swish.toLocaleString('sv-SE')} kr</TableCell>
                        <TableCell className="text-right tabular-nums">{row.swishPct}%</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}

          {/* Daily sales table with pagination */}
          <div>
            <h3 className="text-sm font-semibold mb-3">Daglig forsaljning</h3>
            {dailySales.length === 0 ? (
              <p className="text-sm text-muted-foreground">Ingen data importerad annu.</p>
            ) : (
              <>
                <div className="rounded-xl border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Datum</TableHead>
                        <TableHead className="text-right">Totalt</TableHead>
                        <TableHead className="text-right">Kontant</TableHead>
                        <TableHead className="text-right">Kort</TableHead>
                        <TableHead className="text-right">Swish</TableHead>
                        <TableHead className="text-right">Moms</TableHead>
                        <TableHead className="text-right">Moms %</TableHead>
                        <TableHead className="w-20"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {paginatedSales.map(d => {
                        const rowVatPct = d.total > 0
                          ? Math.round(d.vat / d.total * 10000) / 100
                          : 0
                        return (
                          <TableRow key={d.date}>
                            <TableCell className="font-medium">{d.date}</TableCell>
                            <TableCell className="text-right tabular-nums">{d.total.toLocaleString('sv-SE')}</TableCell>
                            <TableCell className="text-right tabular-nums">{d.cash.toLocaleString('sv-SE')}</TableCell>
                            <TableCell className="text-right tabular-nums">{d.card.toLocaleString('sv-SE')}</TableCell>
                            <TableCell className="text-right tabular-nums">{d.swish.toLocaleString('sv-SE')}</TableCell>
                            <TableCell className="text-right tabular-nums">{d.vat.toLocaleString('sv-SE')}</TableCell>
                            <TableCell className="text-right tabular-nums">
                              <span className={rowVatPct > 0 && (rowVatPct < 20 || rowVatPct > 30) ? 'text-yellow-600 dark:text-yellow-400' : ''}>
                                {rowVatPct}%
                              </span>
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center justify-end gap-1">
                                <Button variant="ghost" size="sm" onClick={() => openEdit(d)}>
                                  <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
                                </Button>
                                <Button variant="ghost" size="sm" onClick={() => setDeleteEntry(d)}>
                                  <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        )
                      })}
                    </TableBody>
                  </Table>
                </div>

                {/* Pagination */}
                {totalPages > 1 && (
                  <div className="flex items-center justify-between mt-4">
                    <p className="text-sm text-muted-foreground">
                      Visar {page * PAGE_SIZE + 1}-{Math.min((page + 1) * PAGE_SIZE, dailySales.length)} av {dailySales.length} rader
                    </p>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setPage(p => Math.max(0, p - 1))}
                        disabled={page === 0}
                      >
                        <ChevronLeft className="h-4 w-4 mr-1" />
                        Foregaende
                      </Button>
                      <span className="text-sm text-muted-foreground">
                        Sida {page + 1} av {totalPages}
                      </span>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                        disabled={page >= totalPages - 1}
                      >
                        Nasta
                        <ChevronRight className="h-4 w-4 ml-1" />
                      </Button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </TabsContent>
      </Tabs>

      {/* Edit dialog */}
      <EditEntryDialog
        open={!!editEntry}
        onOpenChange={open => { if (!open) setEditEntry(null) }}
        title="Redigera dagskassa"
        description={editEntry ? `Redigera data for ${editEntry.date}` : ''}
        onSave={handleEditSave}
        isSaving={isSaving}
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="edit-date">Datum</Label>
            <Input id="edit-date" type="date" value={editEntry?.date ?? ''} disabled />
          </div>
          <div className="space-y-2">
            <Label htmlFor="edit-total">Totalt (kr)</Label>
            <Input
              id="edit-total"
              type="number"
              step="0.01"
              min="0"
              value={editTotal}
              onChange={e => setEditTotal(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="edit-cash">Kontant (kr)</Label>
            <Input
              id="edit-cash"
              type="number"
              step="0.01"
              min="0"
              value={editCash}
              onChange={e => setEditCash(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="edit-card">Kort (kr)</Label>
            <Input
              id="edit-card"
              type="number"
              step="0.01"
              min="0"
              value={editCard}
              onChange={e => setEditCard(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="edit-swish">Swish (kr)</Label>
            <Input
              id="edit-swish"
              type="number"
              step="0.01"
              min="0"
              value={editSwish}
              onChange={e => setEditSwish(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="edit-vat">Moms (kr)</Label>
            <Input
              id="edit-vat"
              type="number"
              step="0.01"
              min="0"
              value={editVat}
              onChange={e => setEditVat(e.target.value)}
            />
          </div>
        </div>

        {showEditWarning && (
          <div className="flex items-center gap-2 rounded-lg border border-yellow-300 bg-yellow-50 p-3 text-sm text-yellow-800 dark:border-yellow-700 dark:bg-yellow-950/30 dark:text-yellow-200">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span>
              Kontant + Kort + Swish ({editPaymentSum.toLocaleString('sv-SE')} kr) avviker {editDiffPct}% fran Totalt ({editTotalVal.toLocaleString('sv-SE')} kr).
            </span>
          </div>
        )}
      </EditEntryDialog>

      {/* Delete confirmation dialog */}
      <ConfirmDeleteDialog
        open={!!deleteEntry}
        onOpenChange={open => { if (!open) setDeleteEntry(null) }}
        title="Ta bort dagskassa"
        description={deleteEntry ? `Vill du ta bort data for ${deleteEntry.date}? Atgarden kan inte angras.` : ''}
        onConfirm={handleDelete}
        isDeleting={isDeleting}
      />
    </div>
  )
}
