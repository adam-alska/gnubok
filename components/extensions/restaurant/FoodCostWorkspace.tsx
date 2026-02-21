'use client'

import { useState, useMemo, useCallback } from 'react'
import type { WorkspaceComponentProps } from '@/lib/extensions/workspace-registry'
import { useAccountTotals } from '@/lib/extensions/use-account-totals'
import { useExtensionData } from '@/lib/extensions/use-extension-data'
import KPICard from '@/components/extensions/shared/KPICard'
import DateRangeFilter from '@/components/extensions/shared/DateRangeFilter'
import MonthlyTrendTable from '@/components/extensions/shared/MonthlyTrendTable'
import ExtensionLoadingSkeleton from '@/components/extensions/shared/ExtensionLoadingSkeleton'
import ConfirmDeleteDialog from '@/components/extensions/shared/ConfirmDeleteDialog'
import EditEntryDialog from '@/components/extensions/shared/EditEntryDialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { ArrowUp, ArrowDown, Minus } from 'lucide-react'
import { cn } from '@/lib/utils'

const FOOD_CATEGORIES = ['Kott', 'Fisk', 'Gronsaker', 'Mejeri', 'Drycker', 'Ovrigt'] as const
type FoodCategory = typeof FOOD_CATEGORIES[number]

function computePreviousPeriod(start: string, end: string): { start: string; end: string } {
  const startDate = new Date(start + 'T00:00:00')
  const endDate = new Date(end + 'T00:00:00')
  const durationMs = endDate.getTime() - startDate.getTime()
  const prevEnd = new Date(startDate.getTime() - 1)
  const prevStart = new Date(prevEnd.getTime() - durationMs)
  return {
    start: prevStart.toISOString().slice(0, 10),
    end: prevEnd.toISOString().slice(0, 10),
  }
}

function DeltaArrow({ current, previous }: { current: number; previous: number }) {
  const delta = Math.round((current - previous) * 100) / 100
  if (delta === 0 || (previous === 0 && current === 0)) {
    return (
      <span className="inline-flex items-center gap-0.5 text-xs text-muted-foreground">
        <Minus className="h-3 w-3" />
        <span>0 pp</span>
      </span>
    )
  }
  // For food cost: lower is better, so negative delta = green (improving)
  const improving = delta < 0
  return (
    <span className={cn(
      'inline-flex items-center gap-0.5 text-xs',
      improving ? 'text-green-600' : 'text-red-600'
    )}>
      {delta < 0
        ? <ArrowDown className="h-3 w-3" />
        : <ArrowUp className="h-3 w-3" />
      }
      <span>{delta > 0 ? '+' : ''}{delta} pp</span>
    </span>
  )
}

export default function FoodCostWorkspace({}: WorkspaceComponentProps) {
  const now = new Date()
  const [dateRange, setDateRange] = useState({
    start: new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10),
    end: new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10),
  })

  const prevPeriod = useMemo(
    () => computePreviousPeriod(dateRange.start, dateRange.end),
    [dateRange.start, dateRange.end]
  )

  // Yearly range for monthly trend
  const yearStart = `${now.getFullYear()}-01-01`
  const yearEnd = `${now.getFullYear()}-12-31`

  const { data: extData, save, remove, isLoading: settingsLoading } = useExtensionData('restaurant', 'food-cost')
  const settings = extData.find(d => d.key === 'settings')?.value as { targetPct?: number } | undefined

  const [targetPctInput, setTargetPct] = useState<string | null>(null)
  const [editingTarget, setEditingTarget] = useState(false)
  const targetPct = targetPctInput ?? (settings?.targetPct != null ? String(settings.targetPct) : '')

  // Category assignments from extension_data (key = "category:{accountNumber}")
  const categoryMap = useMemo(() => {
    const map: Record<string, FoodCategory> = {}
    for (const d of extData) {
      if (d.key.startsWith('category:')) {
        const account = d.key.replace('category:', '')
        map[account] = (d.value as { category: FoodCategory }).category
      }
    }
    return map
  }, [extData])

  // Notes from extension_data (key = "note:YYYY-MM")
  const currentMonth = dateRange.start.slice(0, 7)
  const currentNote = extData.find(d => d.key === `note:${currentMonth}`)?.value as { text: string } | undefined
  const [noteText, setNoteText] = useState('')
  const [editingNote, setEditingNote] = useState(false)
  const [savingNote, setSavingNote] = useState(false)
  const [deleteNoteOpen, setDeleteNoteOpen] = useState(false)
  const [deletingNote, setDeletingNote] = useState(false)

  // Target edit dialog state
  const [editTargetDialogOpen, setEditTargetDialogOpen] = useState(false)
  const [newTargetInput, setNewTargetInput] = useState('')
  const [savingTarget, setSavingTarget] = useState(false)

  // --- Current period account totals ---
  const { totals: purchaseTotals, isLoading: purchasesLoading } = useAccountTotals({
    from: '4000', to: '4999',
    dateFrom: dateRange.start, dateTo: dateRange.end,
  })
  const { totals: revenueTotals, isLoading: revenueLoading } = useAccountTotals({
    from: '3000', to: '3999',
    dateFrom: dateRange.start, dateTo: dateRange.end,
  })

  // --- Previous period account totals ---
  const { totals: prevPurchaseTotals, isLoading: prevPurchasesLoading } = useAccountTotals({
    from: '4000', to: '4999',
    dateFrom: prevPeriod.start, dateTo: prevPeriod.end,
  })
  const { totals: prevRevenueTotals, isLoading: prevRevenueLoading } = useAccountTotals({
    from: '3000', to: '3999',
    dateFrom: prevPeriod.start, dateTo: prevPeriod.end,
  })

  // Monthly trend data
  const { monthly: purchaseMonthly } = useAccountTotals({
    from: '4000', to: '4999',
    dateFrom: yearStart, dateTo: yearEnd,
    groupBy: 'month',
  })
  const { monthly: revenueMonthly } = useAccountTotals({
    from: '3000', to: '3999',
    dateFrom: yearStart, dateTo: yearEnd,
    groupBy: 'month',
  })

  // Current period calculations
  const totalPurchases = purchaseTotals.reduce((sum, t) => sum + t.debit, 0)
  const totalRevenue = revenueTotals.reduce((sum, t) => sum + t.credit, 0)
  const foodCostPct = totalRevenue > 0
    ? Math.round((totalPurchases / totalRevenue) * 10000) / 100
    : 0

  // Previous period calculations
  const prevTotalPurchases = prevPurchaseTotals.reduce((sum, t) => sum + t.debit, 0)
  const prevTotalRevenue = prevRevenueTotals.reduce((sum, t) => sum + t.credit, 0)
  const prevFoodCostPct = prevTotalRevenue > 0
    ? Math.round((prevTotalPurchases / prevTotalRevenue) * 10000) / 100
    : 0

  const target = settings?.targetPct ?? 30

  // Monthly trend rows
  const monthlyTrend = useMemo(() => {
    const months = new Set([
      ...purchaseMonthly.map(m => m.month),
      ...revenueMonthly.map(m => m.month),
    ])
    return Array.from(months).sort().map(month => {
      const purch = purchaseMonthly.filter(m => m.month === month).reduce((s, m) => s + m.debit, 0)
      const rev = revenueMonthly.filter(m => m.month === month).reduce((s, m) => s + m.credit, 0)
      const pct = rev > 0 ? Math.round((purch / rev) * 10000) / 100 : 0
      return { month, value: pct }
    })
  }, [purchaseMonthly, revenueMonthly])

  // Category breakdown
  const categoryBreakdown = useMemo(() => {
    const groups: Record<string, { category: FoodCategory; total: number; accounts: string[] }> = {}
    for (const cat of FOOD_CATEGORIES) {
      groups[cat] = { category: cat, total: 0, accounts: [] }
    }
    let uncategorizedTotal = 0
    const uncategorizedAccounts: string[] = []

    for (const t of purchaseTotals) {
      const cat = categoryMap[t.account_number]
      if (cat && groups[cat]) {
        groups[cat].total += t.debit
        groups[cat].accounts.push(t.account_number)
      } else {
        uncategorizedTotal += t.debit
        uncategorizedAccounts.push(t.account_number)
      }
    }

    const result = FOOD_CATEGORIES
      .map(cat => groups[cat])
      .filter(g => g.total > 0 || g.accounts.length > 0)

    if (uncategorizedTotal > 0) {
      result.push({ category: 'Ovrigt' as FoodCategory, total: uncategorizedTotal, accounts: uncategorizedAccounts })
    }

    return result
  }, [purchaseTotals, categoryMap])

  // --- Handlers ---

  const saveTarget = async () => {
    const val = parseFloat(targetPct)
    if (!isNaN(val)) {
      // Save target history before changing
      const oldTarget = settings?.targetPct
      if (oldTarget != null && oldTarget !== val) {
        await save(`target-history:${Date.now()}`, {
          previousTarget: oldTarget,
          newTarget: val,
          changedAt: new Date().toISOString(),
        })
      }
      await save('settings', { targetPct: val })
      setEditingTarget(false)
    }
  }

  const handleSaveTargetDialog = async () => {
    setSavingTarget(true)
    const val = parseFloat(newTargetInput)
    if (!isNaN(val)) {
      const oldTarget = settings?.targetPct
      if (oldTarget != null && oldTarget !== val) {
        await save(`target-history:${Date.now()}`, {
          previousTarget: oldTarget,
          newTarget: val,
          changedAt: new Date().toISOString(),
        })
      }
      await save('settings', { targetPct: val })
    }
    setSavingTarget(false)
  }

  const handleCategoryChange = useCallback(async (accountNumber: string, category: string) => {
    if (category === '__none__') {
      await remove(`category:${accountNumber}`)
    } else {
      await save(`category:${accountNumber}`, { category })
    }
  }, [save, remove])

  const handleSaveNote = async () => {
    setSavingNote(true)
    await save(`note:${currentMonth}`, { text: noteText })
    setEditingNote(false)
    setSavingNote(false)
  }

  const handleDeleteNote = async () => {
    setDeletingNote(true)
    await remove(`note:${currentMonth}`)
    setNoteText('')
    setEditingNote(false)
    setDeletingNote(false)
  }

  const startEditNote = () => {
    setNoteText(currentNote?.text ?? '')
    setEditingNote(true)
  }

  const isLoading = purchasesLoading || revenueLoading || prevPurchasesLoading || prevRevenueLoading || settingsLoading

  if (isLoading) return <ExtensionLoadingSkeleton />

  return (
    <div className="space-y-6">
      <DateRangeFilter onRangeChange={(start, end) => setDateRange({ start, end })} />

      {/* KPI Cards with period comparison */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <KPICard
          label="Food Cost %"
          value={foodCostPct}
          suffix="%"
          className={cn(
            foodCostPct <= target ? 'border-green-200' : 'border-red-200'
          )}
        />
        <KPICard
          label="Varuinkop"
          value={totalPurchases.toLocaleString('sv-SE')}
          suffix="kr"
        />
        <KPICard
          label="Livsmedelsintakter"
          value={totalRevenue.toLocaleString('sv-SE')}
          suffix="kr"
        />
      </div>

      {/* Period comparison */}
      <div className="rounded-xl border p-4">
        <h3 className="text-sm font-semibold mb-3">Periodjamforelse</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">Food Cost % (nuvarande)</p>
            <div className="flex items-center gap-2">
              <span className="text-lg font-semibold tabular-nums">{foodCostPct}%</span>
              <DeltaArrow current={foodCostPct} previous={prevFoodCostPct} />
            </div>
          </div>
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">Food Cost % (foregaende)</p>
            <span className="text-lg font-semibold tabular-nums">{prevFoodCostPct}%</span>
          </div>
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">Foregaende period</p>
            <span className="text-sm tabular-nums">{prevPeriod.start} — {prevPeriod.end}</span>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-3 pt-3 border-t">
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">Varuinkop (foregaende)</p>
            <span className="text-sm tabular-nums">{prevTotalPurchases.toLocaleString('sv-SE')} kr</span>
          </div>
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">Intakter (foregaende)</p>
            <span className="text-sm tabular-nums">{prevTotalRevenue.toLocaleString('sv-SE')} kr</span>
          </div>
        </div>
      </div>

      {/* Target setting */}
      <div className="rounded-xl border p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium">Malvarde</p>
            <p className="text-xs text-muted-foreground">
              Riktvarde for food cost (vanligtvis 25-35%)
            </p>
          </div>
          {editingTarget ? (
            <div className="flex items-center gap-2">
              <Input
                type="number"
                step="0.1"
                value={targetPct}
                onChange={e => setTargetPct(e.target.value)}
                className="w-20 h-8 text-sm"
              />
              <Label className="text-sm">%</Label>
              <Button size="sm" variant="outline" onClick={saveTarget}>Spara</Button>
              <Button size="sm" variant="ghost" onClick={() => setEditingTarget(false)}>Avbryt</Button>
            </div>
          ) : (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setNewTargetInput(String(target))
                setEditTargetDialogOpen(true)
              }}
            >
              {target}% — Andra
            </Button>
          )}
        </div>
      </div>

      {/* Edit target dialog (saves history) */}
      <EditEntryDialog
        open={editTargetDialogOpen}
        onOpenChange={setEditTargetDialogOpen}
        title="Andra malvarde"
        description={`Nuvarande malvarde: ${target}%. Andringshistorik sparas automatiskt.`}
        onSave={handleSaveTargetDialog}
        isSaving={savingTarget}
      >
        <div className="space-y-2">
          <Label htmlFor="new-target">Nytt malvarde (%)</Label>
          <Input
            id="new-target"
            type="number"
            step="0.1"
            value={newTargetInput}
            onChange={e => setNewTargetInput(e.target.value)}
            className="w-32"
          />
        </div>
      </EditEntryDialog>

      {/* Notes per period */}
      <div className="rounded-xl border p-4">
        <div className="flex items-center justify-between mb-2">
          <div>
            <p className="text-sm font-medium">Anteckningar for {currentMonth}</p>
            <p className="text-xs text-muted-foreground">
              Notera avvikelser och forklaringar for perioden
            </p>
          </div>
          {!editingNote && (
            <Button size="sm" variant="ghost" onClick={startEditNote}>
              {currentNote?.text ? 'Redigera' : 'Lagg till'}
            </Button>
          )}
        </div>
        {editingNote ? (
          <div className="space-y-3">
            <Textarea
              value={noteText}
              onChange={e => setNoteText(e.target.value)}
              placeholder="Beskriv avvikelser, t.ex. menyandring, leverantorsbyte..."
              rows={3}
            />
            <div className="flex items-center gap-2">
              <Button size="sm" onClick={handleSaveNote} disabled={savingNote}>
                {savingNote ? 'Sparar...' : 'Spara'}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setEditingNote(false)}>
                Avbryt
              </Button>
              {currentNote?.text && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-red-600 hover:text-red-700"
                  onClick={() => setDeleteNoteOpen(true)}
                >
                  Ta bort
                </Button>
              )}
            </div>
          </div>
        ) : currentNote?.text ? (
          <p className="text-sm whitespace-pre-wrap">{currentNote.text}</p>
        ) : (
          <p className="text-sm text-muted-foreground">Inga anteckningar for denna period.</p>
        )}
      </div>

      <ConfirmDeleteDialog
        open={deleteNoteOpen}
        onOpenChange={setDeleteNoteOpen}
        title="Ta bort anteckning"
        description={`Vill du ta bort anteckningen for ${currentMonth}?`}
        onConfirm={handleDeleteNote}
        isDeleting={deletingNote}
      />

      {/* Monthly trend */}
      <div>
        <h3 className="text-sm font-semibold mb-3">Manadstrend {now.getFullYear()}</h3>
        <MonthlyTrendTable
          rows={monthlyTrend}
          valueLabel="Food Cost %"
          valueSuffix="%"
        />
      </div>

      {/* Category breakdown */}
      {categoryBreakdown.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold mb-3">Varuinkop per kategori</h3>
          <div className="rounded-xl border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Kategori</TableHead>
                  <TableHead className="text-right">Belopp</TableHead>
                  <TableHead className="text-right">Andel av inkop</TableHead>
                  <TableHead className="text-right">Andel av intakter</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {categoryBreakdown.map(g => (
                  <TableRow key={g.category}>
                    <TableCell className="font-medium">{g.category}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {(Math.round(g.total * 100) / 100).toLocaleString('sv-SE')} kr
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {totalPurchases > 0
                        ? Math.round((g.total / totalPurchases) * 100)
                        : 0}%
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {totalRevenue > 0
                        ? Math.round((g.total / totalRevenue) * 10000) / 100
                        : 0}%
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      {/* Account breakdown with category assignment */}
      {purchaseTotals.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold mb-3">Varuinkop per konto</h3>
          <div className="rounded-xl border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Konto</TableHead>
                  <TableHead>Kategori</TableHead>
                  <TableHead className="text-right">Debet</TableHead>
                  <TableHead className="text-right">Andel</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {purchaseTotals.map(t => (
                  <TableRow key={t.account_number}>
                    <TableCell className="font-medium">{t.account_number}</TableCell>
                    <TableCell>
                      <Select
                        value={categoryMap[t.account_number] ?? '__none__'}
                        onValueChange={(val) => handleCategoryChange(t.account_number, val)}
                      >
                        <SelectTrigger className="h-8 w-[130px] text-xs">
                          <SelectValue placeholder="Valj kategori" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none__">Ingen</SelectItem>
                          {FOOD_CATEGORIES.map(cat => (
                            <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {t.debit.toLocaleString('sv-SE')} kr
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {totalPurchases > 0
                        ? Math.round((t.debit / totalPurchases) * 100)
                        : 0}%
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}
    </div>
  )
}
