'use client'

import { useState, useCallback, useRef, useEffect, useMemo } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { useToast } from '@/components/ui/use-toast'
import { Save, SplitSquareHorizontal, Plus, Loader2 } from 'lucide-react'
import BudgetDistributionDialog from './BudgetDistributionDialog'
import AccountGroupRow from './AccountGroupRow'
import { MONTH_NAMES_SV, ACCOUNT_CLASS_LABELS } from '@/types/budget-costcenters'
import type { BudgetEntry } from '@/types/budget-costcenters'

interface BudgetSpreadsheetProps {
  budgetId: string
  entries: BudgetEntry[]
  isLocked: boolean
  onSave: (entries: Array<{ id: string; [key: string]: unknown }>) => Promise<void>
  onAddEntry?: () => void
}

const MONTH_KEYS = [
  'month_1', 'month_2', 'month_3', 'month_4',
  'month_5', 'month_6', 'month_7', 'month_8',
  'month_9', 'month_10', 'month_11', 'month_12',
] as const

type MonthKey = typeof MONTH_KEYS[number]

interface CellPosition {
  rowIndex: number
  colIndex: number
}

function formatNumber(n: number): string {
  return new Intl.NumberFormat('sv-SE', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(Math.round(n))
}

function parseInputNumber(value: string): number {
  // Handle Swedish format (comma as decimal separator, space as thousands)
  const cleaned = value.replace(/\s/g, '').replace(',', '.')
  return parseFloat(cleaned) || 0
}

export default function BudgetSpreadsheet({
  budgetId,
  entries: initialEntries,
  isLocked,
  onSave,
  onAddEntry,
}: BudgetSpreadsheetProps) {
  const [entries, setEntries] = useState<BudgetEntry[]>(initialEntries)
  const [modifiedEntries, setModifiedEntries] = useState<Set<string>>(new Set())
  const [activeCell, setActiveCell] = useState<CellPosition | null>(null)
  const [editValue, setEditValue] = useState<string>('')
  const [isSaving, setIsSaving] = useState(false)
  const [distributionDialog, setDistributionDialog] = useState<{
    open: boolean
    entryIndex: number
  }>({ open: false, entryIndex: 0 })

  const { toast } = useToast()
  const inputRef = useRef<HTMLInputElement>(null)
  const tableRef = useRef<HTMLDivElement>(null)

  // Keep entries in sync when initialEntries changes
  useEffect(() => {
    setEntries(initialEntries)
    setModifiedEntries(new Set())
  }, [initialEntries])

  // Focus input when active cell changes
  useEffect(() => {
    if (activeCell && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [activeCell])

  // Group entries by account class
  const groupedEntries = useMemo(() => {
    const groups = new Map<number, { entries: BudgetEntry[]; originalIndices: number[] }>()

    entries.forEach((entry, index) => {
      const cls = entry.account_class || parseInt(entry.account_number[0]) || 0
      if (!groups.has(cls)) {
        groups.set(cls, { entries: [], originalIndices: [] })
      }
      groups.get(cls)!.entries.push(entry)
      groups.get(cls)!.originalIndices.push(index)
    })

    // Sort groups by class, entries by account_number within each group
    const sorted = [...groups.entries()].sort((a, b) => a[0] - b[0])
    return sorted.map(([cls, group]) => {
      const sortedPairs = group.entries
        .map((e, i) => ({ entry: e, originalIndex: group.originalIndices[i] }))
        .sort((a, b) => a.entry.account_number.localeCompare(b.entry.account_number))

      return {
        accountClass: cls,
        title: ACCOUNT_CLASS_LABELS[cls] || `Klass ${cls}`,
        entries: sortedPairs.map(p => p.entry),
        originalIndices: sortedPairs.map(p => p.originalIndex),
        subtotal: sortedPairs.reduce((sum, p) => sum + (p.entry.annual_total || 0), 0),
      }
    })
  }, [entries])

  // Build a flat list of (originalIndex) for keyboard navigation
  const flatIndices = useMemo(() => {
    const result: number[] = []
    for (const group of groupedEntries) {
      result.push(...group.originalIndices)
    }
    return result
  }, [groupedEntries])

  const getCellValue = useCallback((entryIndex: number, monthIndex: number): number => {
    const entry = entries[entryIndex]
    if (!entry) return 0
    return Number(entry[MONTH_KEYS[monthIndex]]) || 0
  }, [entries])

  const setCellValue = useCallback((entryIndex: number, monthIndex: number, value: number) => {
    setEntries(prev => {
      const updated = [...prev]
      const entry = { ...updated[entryIndex] }
      const key = MONTH_KEYS[monthIndex]
      entry[key] = value

      // Recalculate annual total
      entry.annual_total = MONTH_KEYS.reduce(
        (sum, k) => sum + (Number(entry[k]) || 0),
        0
      )

      updated[entryIndex] = entry
      return updated
    })
    setModifiedEntries(prev => new Set(prev).add(entries[entryIndex].id))
  }, [entries])

  const handleCellClick = useCallback((rowIndex: number, colIndex: number) => {
    if (isLocked) return
    const entryIndex = flatIndices[rowIndex]
    if (entryIndex === undefined) return
    setActiveCell({ rowIndex, colIndex })
    setEditValue(getCellValue(entryIndex, colIndex).toString())
  }, [isLocked, flatIndices, getCellValue])

  const commitEdit = useCallback(() => {
    if (!activeCell) return
    const entryIndex = flatIndices[activeCell.rowIndex]
    if (entryIndex === undefined) return
    const value = parseInputNumber(editValue)
    setCellValue(entryIndex, activeCell.colIndex, value)
  }, [activeCell, flatIndices, editValue, setCellValue])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (!activeCell) return

    switch (e.key) {
      case 'Tab': {
        e.preventDefault()
        commitEdit()
        const nextCol = e.shiftKey
          ? activeCell.colIndex - 1
          : activeCell.colIndex + 1

        if (nextCol >= 0 && nextCol < 12) {
          const entryIndex = flatIndices[activeCell.rowIndex]
          if (entryIndex === undefined) return
          setActiveCell({ rowIndex: activeCell.rowIndex, colIndex: nextCol })
          setEditValue(getCellValue(entryIndex, nextCol).toString())
        } else if (nextCol >= 12 && activeCell.rowIndex < flatIndices.length - 1) {
          // Move to next row, first month
          const nextRowIndex = activeCell.rowIndex + 1
          const nextEntryIndex = flatIndices[nextRowIndex]
          if (nextEntryIndex === undefined) return
          setActiveCell({ rowIndex: nextRowIndex, colIndex: 0 })
          setEditValue(getCellValue(nextEntryIndex, 0).toString())
        } else if (nextCol < 0 && activeCell.rowIndex > 0) {
          // Move to previous row, last month
          const prevRowIndex = activeCell.rowIndex - 1
          const prevEntryIndex = flatIndices[prevRowIndex]
          if (prevEntryIndex === undefined) return
          setActiveCell({ rowIndex: prevRowIndex, colIndex: 11 })
          setEditValue(getCellValue(prevEntryIndex, 11).toString())
        }
        break
      }
      case 'Enter': {
        e.preventDefault()
        commitEdit()
        // Move down
        if (activeCell.rowIndex < flatIndices.length - 1) {
          const nextRowIndex = activeCell.rowIndex + 1
          const nextEntryIndex = flatIndices[nextRowIndex]
          if (nextEntryIndex === undefined) return
          setActiveCell({ rowIndex: nextRowIndex, colIndex: activeCell.colIndex })
          setEditValue(getCellValue(nextEntryIndex, activeCell.colIndex).toString())
        } else {
          setActiveCell(null)
        }
        break
      }
      case 'Escape': {
        setActiveCell(null)
        break
      }
      case 'ArrowUp': {
        if (activeCell.rowIndex > 0) {
          e.preventDefault()
          commitEdit()
          const prevRowIndex = activeCell.rowIndex - 1
          const prevEntryIndex = flatIndices[prevRowIndex]
          if (prevEntryIndex === undefined) return
          setActiveCell({ rowIndex: prevRowIndex, colIndex: activeCell.colIndex })
          setEditValue(getCellValue(prevEntryIndex, activeCell.colIndex).toString())
        }
        break
      }
      case 'ArrowDown': {
        if (activeCell.rowIndex < flatIndices.length - 1) {
          e.preventDefault()
          commitEdit()
          const nextRowIndex = activeCell.rowIndex + 1
          const nextEntryIndex = flatIndices[nextRowIndex]
          if (nextEntryIndex === undefined) return
          setActiveCell({ rowIndex: nextRowIndex, colIndex: activeCell.colIndex })
          setEditValue(getCellValue(nextEntryIndex, activeCell.colIndex).toString())
        }
        break
      }
    }
  }, [activeCell, commitEdit, flatIndices, getCellValue])

  const handleBlur = useCallback(() => {
    commitEdit()
    setActiveCell(null)
  }, [commitEdit])

  const handleSave = async () => {
    if (modifiedEntries.size === 0) {
      toast({ title: 'Inga ändringar', description: 'Inga budgetposter har ändrats' })
      return
    }

    setIsSaving(true)
    try {
      const entriesToSave = entries
        .filter(e => modifiedEntries.has(e.id))
        .map(e => ({
          id: e.id,
          month_1: e.month_1,
          month_2: e.month_2,
          month_3: e.month_3,
          month_4: e.month_4,
          month_5: e.month_5,
          month_6: e.month_6,
          month_7: e.month_7,
          month_8: e.month_8,
          month_9: e.month_9,
          month_10: e.month_10,
          month_11: e.month_11,
          month_12: e.month_12,
          annual_total: e.annual_total,
        }))

      await onSave(entriesToSave)
      setModifiedEntries(new Set())
      toast({
        title: 'Sparat',
        description: `${entriesToSave.length} budgetpost${entriesToSave.length > 1 ? 'er' : ''} uppdaterade`,
      })
    } catch {
      toast({
        title: 'Fel',
        description: 'Kunde inte spara ändringar',
        variant: 'destructive',
      })
    } finally {
      setIsSaving(false)
    }
  }

  const handleDistribute = (entryIndex: number, months: number[]) => {
    setEntries(prev => {
      const updated = [...prev]
      const entry = { ...updated[entryIndex] }
      MONTH_KEYS.forEach((key, i) => {
        entry[key] = months[i]
      })
      entry.annual_total = months.reduce((s, v) => s + v, 0)
      updated[entryIndex] = entry
      return updated
    })
    setModifiedEntries(prev => new Set(prev).add(entries[entryIndex].id))
  }

  // Track the flat row index for rendering
  let flatRowIndex = 0

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {modifiedEntries.size > 0 && (
            <Badge variant="warning" className="text-xs">
              {modifiedEntries.size} osparade {modifiedEntries.size === 1 ? 'ändring' : 'ändringar'}
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          {onAddEntry && !isLocked && (
            <Button variant="outline" size="sm" onClick={onAddEntry}>
              <Plus className="mr-1.5 h-3.5 w-3.5" />
              Ny rad
            </Button>
          )}
          <Button
            size="sm"
            onClick={handleSave}
            disabled={modifiedEntries.size === 0 || isSaving || isLocked}
          >
            {isSaving ? (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            ) : (
              <Save className="mr-1.5 h-3.5 w-3.5" />
            )}
            Spara
          </Button>
        </div>
      </div>

      {/* Spreadsheet */}
      <div ref={tableRef} className="border rounded-lg overflow-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-muted/50 border-b">
              <th className="text-left px-3 py-2 font-medium text-muted-foreground sticky left-0 bg-muted/50 z-10 min-w-[200px]">
                Konto
              </th>
              {MONTH_NAMES_SV.map((month, i) => (
                <th
                  key={i}
                  className="text-right px-2 py-2 font-medium text-muted-foreground min-w-[90px]"
                >
                  {month}
                </th>
              ))}
              <th className="text-right px-3 py-2 font-medium text-muted-foreground min-w-[100px] bg-muted/80">
                Helår
              </th>
              {!isLocked && (
                <th className="w-10 px-1 py-2" />
              )}
            </tr>
          </thead>
          <tbody>
            {groupedEntries.map((group) => {
              const groupStartIndex = flatRowIndex
              const rows = group.entries.map((entry, localIdx) => {
                const currentFlatRow = groupStartIndex + localIdx
                const entryIndex = group.originalIndices[localIdx]
                const isModified = modifiedEntries.has(entry.id)

                const row = (
                  <tr
                    key={entry.id}
                    className={cn(
                      'border-b last:border-b-0 transition-colors',
                      isModified && 'bg-amber-50/50 dark:bg-amber-950/10'
                    )}
                  >
                    {/* Account cell */}
                    <td className="px-3 py-1.5 sticky left-0 bg-background z-10 border-r">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs text-muted-foreground">{entry.account_number}</span>
                        <span className="text-sm truncate max-w-[150px]">{entry.account_name || entry.account_number}</span>
                        {isModified && <span className="h-1.5 w-1.5 rounded-full bg-amber-500 flex-shrink-0" />}
                      </div>
                    </td>

                    {/* Month cells */}
                    {MONTH_KEYS.map((_, monthIdx) => {
                      const isActive = activeCell?.rowIndex === currentFlatRow && activeCell?.colIndex === monthIdx
                      const value = getCellValue(entryIndex, monthIdx)

                      return (
                        <td
                          key={monthIdx}
                          className={cn(
                            'px-0 py-0 text-right cursor-cell transition-colors',
                            isActive
                              ? 'ring-2 ring-primary ring-inset bg-primary/5'
                              : 'hover:bg-muted/30'
                          )}
                          onClick={() => handleCellClick(currentFlatRow, monthIdx)}
                        >
                          {isActive ? (
                            <input
                              ref={inputRef}
                              type="text"
                              value={editValue}
                              onChange={(e) => setEditValue(e.target.value)}
                              onKeyDown={handleKeyDown}
                              onBlur={handleBlur}
                              className="w-full h-full px-2 py-1.5 text-right text-sm font-mono tabular-nums bg-transparent outline-none"
                            />
                          ) : (
                            <div className="px-2 py-1.5 text-sm font-mono tabular-nums">
                              {value !== 0 ? formatNumber(value) : <span className="text-muted-foreground/40">0</span>}
                            </div>
                          )}
                        </td>
                      )
                    })}

                    {/* Annual total */}
                    <td className="px-3 py-1.5 text-right font-semibold text-sm tabular-nums bg-muted/30 font-mono">
                      {formatNumber(entry.annual_total || 0)}
                    </td>

                    {/* Actions */}
                    {!isLocked && (
                      <td className="px-1 py-1.5">
                        <button
                          onClick={() => setDistributionDialog({ open: true, entryIndex })}
                          className="h-7 w-7 flex items-center justify-center rounded hover:bg-muted transition-colors"
                          title="Fördela jämnt"
                        >
                          <SplitSquareHorizontal className="h-3.5 w-3.5 text-muted-foreground" />
                        </button>
                      </td>
                    )}
                  </tr>
                )

                flatRowIndex++
                return row
              })

              return (
                <AccountGroupRow
                  key={group.accountClass}
                  title={group.title}
                  subtotal={group.subtotal}
                >
                  {rows}
                </AccountGroupRow>
              )
            })}

            {entries.length === 0 && (
              <tr>
                <td
                  colSpan={15}
                  className="text-center py-12 text-muted-foreground"
                >
                  Inga budgetposter. Klicka "Ny rad" for att lägga till.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Distribution dialog */}
      {distributionDialog.open && entries[distributionDialog.entryIndex] && (
        <BudgetDistributionDialog
          open={distributionDialog.open}
          onOpenChange={(open) => setDistributionDialog({ ...distributionDialog, open })}
          accountNumber={entries[distributionDialog.entryIndex].account_number}
          accountName={entries[distributionDialog.entryIndex].account_name || ''}
          currentAnnualTotal={entries[distributionDialog.entryIndex].annual_total || 0}
          onDistribute={(months) =>
            handleDistribute(distributionDialog.entryIndex, months)
          }
        />
      )}
    </div>
  )
}
