'use client'

import { useState, useMemo, useCallback } from 'react'
import type { WorkspaceComponentProps } from '@/lib/extensions/workspace-registry'
import { useExtensionData } from '@/lib/extensions/use-extension-data'
import KPICard from '@/components/extensions/shared/KPICard'
import DateRangeFilter from '@/components/extensions/shared/DateRangeFilter'
import MonthlyTrendTable from '@/components/extensions/shared/MonthlyTrendTable'
import DataEntryForm from '@/components/extensions/shared/DataEntryForm'
import ExtensionLoadingSkeleton from '@/components/extensions/shared/ExtensionLoadingSkeleton'
import ConfirmDeleteDialog from '@/components/extensions/shared/ConfirmDeleteDialog'
import EditEntryDialog from '@/components/extensions/shared/EditEntryDialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { Pencil, Plus, Trash2, Download, ChevronDown, ChevronUp } from 'lucide-react'

interface Employee {
  id: string
  name: string
  active: boolean
}

interface TipEntry {
  id: string
  date: string
  shift: string
  employeeId: string
  employeeName: string
  amount: number
}

type SplitMethod = 'equal' | 'hours' | 'custom'

const SHIFTS = ['Lunch', 'Kväll', 'Heldag']

export default function TipTrackingWorkspace({}: WorkspaceComponentProps) {
  const now = new Date()
  const [dateRange, setDateRange] = useState({
    start: new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10),
    end: new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10),
  })

  const { data, save, remove, refresh, isLoading } = useExtensionData('restaurant', 'tip-tracking')

  // ---------------------------------------------------------------------------
  // Derived data
  // ---------------------------------------------------------------------------

  const employees = useMemo(() =>
    data.filter(d => d.key.startsWith('employee:'))
      .map(d => ({
        id: d.key.replace('employee:', ''),
        ...(d.value as { name: string; active: boolean }),
      }))
  , [data])

  const entries = useMemo(() =>
    data.filter(d => d.key.startsWith('entry:'))
      .map(d => ({
        id: d.key,
        ...(d.value as Omit<TipEntry, 'id'>),
      }))
      .filter(e => e.date >= dateRange.start && e.date <= dateRange.end)
      .sort((a, b) => b.date.localeCompare(a.date))
  , [data, dateRange])

  const activeEmployees = employees.filter(e => e.active)

  // Settings
  const settings = useMemo(() => {
    const rec = data.find(d => d.key === 'settings')
    return (rec?.value ?? {}) as Record<string, unknown>
  }, [data])

  // ---------------------------------------------------------------------------
  // Register tab – form state
  // ---------------------------------------------------------------------------

  const [entryDate, setEntryDate] = useState(now.toISOString().slice(0, 10))
  const [shift, setShift] = useState(SHIFTS[0])
  const [selectedEmployeeId, setEmployeeId] = useState('')
  const employeeId = selectedEmployeeId || (activeEmployees.length > 0 ? activeEmployees[0].id : '')
  const [amount, setAmount] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  // New employee form
  const [newEmployeeName, setNewEmployeeName] = useState('')

  // Edit entry dialog
  const [editEntry, setEditEntry] = useState<TipEntry | null>(null)
  const [editDate, setEditDate] = useState('')
  const [editShift, setEditShift] = useState('')
  const [editEmployeeId, setEditEmployeeId] = useState('')
  const [editAmount, setEditAmount] = useState('')
  const [isSavingEdit, setIsSavingEdit] = useState(false)

  // Delete confirmation dialog
  const [deleteKey, setDeleteKey] = useState<string | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)

  // Edit employee dialog
  const [editEmployee, setEditEmployee] = useState<Employee | null>(null)
  const [editEmployeeName, setEditEmployeeName] = useState('')
  const [isSavingEmployee, setIsSavingEmployee] = useState(false)

  // Per-employee expanded view in overview
  const [expandedEmployeeId, setExpandedEmployeeId] = useState<string | null>(null)

  // Tip pool state
  const [poolAmount, setPoolAmount] = useState('')
  const [poolSelectedIds, setPoolSelectedIds] = useState<Set<string>>(new Set())
  const [splitMethod, setSplitMethod] = useState<SplitMethod>('equal')
  const [hoursMap, setHoursMap] = useState<Record<string, string>>({})
  const [customPctMap, setCustomPctMap] = useState<Record<string, string>>({})

  // ---------------------------------------------------------------------------
  // Analytics
  // ---------------------------------------------------------------------------

  const totalTips = entries.reduce((s, e) => s + e.amount, 0)
  const avgPerShift = entries.length > 0 ? Math.round(totalTips / entries.length) : 0

  const monthlyTrend = useMemo(() => {
    const map = new Map<string, number>()
    for (const e of entries) {
      const month = e.date.slice(0, 7)
      map.set(month, (map.get(month) ?? 0) + e.amount)
    }
    return Array.from(map.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, value]) => ({ month, value }))
  }, [entries])

  const employeeTotals = useMemo(() => {
    const map = new Map<string, { name: string; total: number; count: number }>()
    for (const e of entries) {
      const existing = map.get(e.employeeId) ?? { name: e.employeeName, total: 0, count: 0 }
      existing.total += e.amount
      existing.count++
      map.set(e.employeeId, existing)
    }
    return Array.from(map.entries())
      .map(([id, d]) => ({ id, ...d }))
      .sort((a, b) => b.total - a.total)
  }, [entries])

  // Per-employee entries for expanded view
  const expandedEmployeeEntries = useMemo(() => {
    if (!expandedEmployeeId) return []
    return entries
      .filter(e => e.employeeId === expandedEmployeeId)
      .sort((a, b) => b.date.localeCompare(a.date))
  }, [entries, expandedEmployeeId])

  // ---------------------------------------------------------------------------
  // Tip pool calculations
  // ---------------------------------------------------------------------------

  const poolTotal = parseFloat(poolAmount) || 0
  const poolSelectedEmployees = activeEmployees.filter(e => poolSelectedIds.has(e.id))

  const poolDistribution = useMemo((): { id: string; name: string; share: number }[] => {
    if (poolSelectedEmployees.length === 0 || poolTotal <= 0) return []

    if (splitMethod === 'equal') {
      const share = Math.round((poolTotal / poolSelectedEmployees.length) * 100) / 100
      return poolSelectedEmployees.map(e => ({ id: e.id, name: e.name, share }))
    }

    if (splitMethod === 'hours') {
      const totalHours = poolSelectedEmployees.reduce((sum, e) => {
        return sum + (parseFloat(hoursMap[e.id] ?? '0') || 0)
      }, 0)
      if (totalHours <= 0) return poolSelectedEmployees.map(e => ({ id: e.id, name: e.name, share: 0 }))
      return poolSelectedEmployees.map(e => {
        const h = parseFloat(hoursMap[e.id] ?? '0') || 0
        const share = Math.round((poolTotal * (h / totalHours)) * 100) / 100
        return { id: e.id, name: e.name, share }
      })
    }

    // custom
    return poolSelectedEmployees.map(e => {
      const pct = parseFloat(customPctMap[e.id] ?? '0') || 0
      const share = Math.round((poolTotal * (pct / 100)) * 100) / 100
      return { id: e.id, name: e.name, share }
    })
  }, [poolTotal, poolSelectedEmployees, splitMethod, hoursMap, customPctMap])

  const customPctTotal = useMemo(() => {
    return poolSelectedEmployees.reduce((sum, e) => {
      return sum + (parseFloat(customPctMap[e.id] ?? '0') || 0)
    }, 0)
  }, [poolSelectedEmployees, customPctMap])

  // ---------------------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------------------

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const val = parseFloat(amount)
    if (isNaN(val) || val <= 0 || !employeeId) return
    setIsSubmitting(true)
    const emp = employees.find(em => em.id === employeeId)
    const id = crypto.randomUUID()
    await save(`entry:${id}`, {
      date: entryDate,
      shift,
      employeeId,
      employeeName: emp?.name ?? '',
      amount: val,
    })
    setAmount('')
    await refresh()
    setIsSubmitting(false)
  }

  const openEditEntry = (entry: TipEntry) => {
    setEditEntry(entry)
    setEditDate(entry.date)
    setEditShift(entry.shift)
    setEditEmployeeId(entry.employeeId)
    setEditAmount(String(entry.amount))
  }

  const handleSaveEdit = async () => {
    if (!editEntry) return
    const val = parseFloat(editAmount)
    if (isNaN(val) || val <= 0 || !editEmployeeId) return
    setIsSavingEdit(true)
    const emp = employees.find(em => em.id === editEmployeeId)
    await save(editEntry.id, {
      date: editDate,
      shift: editShift,
      employeeId: editEmployeeId,
      employeeName: emp?.name ?? '',
      amount: val,
    })
    await refresh()
    setIsSavingEdit(false)
  }

  const handleConfirmDelete = async () => {
    if (!deleteKey) return
    setIsDeleting(true)
    await remove(deleteKey)
    setIsDeleting(false)
  }

  const handleAddEmployee = async () => {
    if (!newEmployeeName.trim()) return
    const id = crypto.randomUUID()
    await save(`employee:${id}`, { name: newEmployeeName.trim(), active: true })
    setNewEmployeeName('')
    await refresh()
  }

  const handleToggleEmployee = async (emp: Employee) => {
    await save(`employee:${emp.id}`, { name: emp.name, active: !emp.active })
    await refresh()
  }

  const openEditEmployee = (emp: Employee) => {
    setEditEmployee(emp)
    setEditEmployeeName(emp.name)
  }

  const handleSaveEmployee = async () => {
    if (!editEmployee || !editEmployeeName.trim()) return
    setIsSavingEmployee(true)
    await save(`employee:${editEmployee.id}`, {
      name: editEmployeeName.trim(),
      active: editEmployee.active,
    })
    // Also update employeeName on existing entries for this employee
    const empEntries = data
      .filter(d => d.key.startsWith('entry:'))
      .filter(d => (d.value as { employeeId?: string }).employeeId === editEmployee.id)
    for (const rec of empEntries) {
      const val = rec.value as Record<string, unknown>
      await save(rec.key, { ...val, employeeName: editEmployeeName.trim() })
    }
    await refresh()
    setIsSavingEmployee(false)
  }

  const handleTogglePooling = async () => {
    const newVal = !settings.poolingEnabled
    await save('settings', { ...settings, poolingEnabled: newVal })
    await refresh()
  }

  const togglePoolEmployee = (empId: string) => {
    setPoolSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(empId)) {
        next.delete(empId)
      } else {
        next.add(empId)
      }
      return next
    })
  }

  const toggleExpandedEmployee = (empId: string) => {
    setExpandedEmployeeId(prev => prev === empId ? null : empId)
  }

  // ---------------------------------------------------------------------------
  // CSV export
  // ---------------------------------------------------------------------------

  const handleExportCsv = useCallback(() => {
    if (entries.length === 0) return

    const header = 'Datum,Skift,Anstalld,Belopp (kr)'
    const rows = entries.map(e =>
      `${e.date},${e.shift},${e.employeeName.replace(/,/g, ' ')},${e.amount}`
    )
    const csv = [header, ...rows].join('\n')
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `dricks_${dateRange.start}_${dateRange.end}.csv`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }, [entries, dateRange])

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  if (isLoading) return <ExtensionLoadingSkeleton />

  return (
    <div className="space-y-6">
      {/* Edit entry dialog */}
      <EditEntryDialog
        open={editEntry !== null}
        onOpenChange={open => { if (!open) setEditEntry(null) }}
        title="Redigera dricksregistrering"
        description="Andra uppgifterna for denna registrering."
        onSave={handleSaveEdit}
        isSaving={isSavingEdit}
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Datum</Label>
            <Input type="date" value={editDate} onChange={e => setEditDate(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Skift</Label>
            <Select value={editShift} onValueChange={setEditShift}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {SHIFTS.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Anstalld</Label>
            <Select value={editEmployeeId} onValueChange={setEditEmployeeId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {activeEmployees.map(e => (
                  <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Belopp (kr)</Label>
            <Input type="number" step="1" min="0" value={editAmount} onChange={e => setEditAmount(e.target.value)} />
          </div>
        </div>
      </EditEntryDialog>

      {/* Delete confirmation dialog */}
      <ConfirmDeleteDialog
        open={deleteKey !== null}
        onOpenChange={open => { if (!open) setDeleteKey(null) }}
        title="Ta bort registrering"
        description="Ar du saker pa att du vill ta bort denna dricksregistrering? Atgarden kan inte angras."
        onConfirm={handleConfirmDelete}
        isDeleting={isDeleting}
      />

      {/* Edit employee dialog */}
      <EditEntryDialog
        open={editEmployee !== null}
        onOpenChange={open => { if (!open) setEditEmployee(null) }}
        title="Redigera anstalld"
        description="Andra namn pa den anstallda."
        onSave={handleSaveEmployee}
        isSaving={isSavingEmployee}
      >
        <div className="space-y-2">
          <Label>Namn</Label>
          <Input value={editEmployeeName} onChange={e => setEditEmployeeName(e.target.value)} />
        </div>
      </EditEntryDialog>

      <Tabs defaultValue="register">
        <TabsList>
          <TabsTrigger value="register">Registrera</TabsTrigger>
          <TabsTrigger value="overview">Oversikt</TabsTrigger>
          <TabsTrigger value="employees">Anstallda</TabsTrigger>
          <TabsTrigger value="pool">Drickspool</TabsTrigger>
        </TabsList>

        {/* ------------------------------------------------------------------ */}
        {/* Register tab                                                        */}
        {/* ------------------------------------------------------------------ */}
        <TabsContent value="register" className="space-y-6 mt-4">
          {activeEmployees.length === 0 ? (
            <div className="rounded-xl border p-6 text-center">
              <p className="text-sm text-muted-foreground">
                Lagg till anstallda under fliken &quot;Anstallda&quot; for att borja registrera dricks.
              </p>
            </div>
          ) : (
            <DataEntryForm
              title="Registrera dricks"
              onSubmit={handleSubmit}
              submitLabel="Registrera"
              isSubmitting={isSubmitting}
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="tip-date">Datum</Label>
                  <Input id="tip-date" type="date" value={entryDate} onChange={e => setEntryDate(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="tip-shift">Skift</Label>
                  <Select value={shift} onValueChange={setShift}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {SHIFTS.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="tip-employee">Anstalld</Label>
                  <Select value={employeeId} onValueChange={setEmployeeId}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {activeEmployees.map(e => (
                        <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="tip-amount">Belopp (kr)</Label>
                  <Input id="tip-amount" type="number" step="1" min="0" placeholder="0" value={amount} onChange={e => setAmount(e.target.value)} />
                </div>
              </div>
            </DataEntryForm>
          )}

          {/* Recent entries */}
          <div>
            <h3 className="text-sm font-semibold mb-3">Senaste registreringar</h3>
            {entries.length === 0 ? (
              <p className="text-sm text-muted-foreground">Inga registreringar i vald period.</p>
            ) : (
              <div className="rounded-xl border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Datum</TableHead>
                      <TableHead>Skift</TableHead>
                      <TableHead>Anstalld</TableHead>
                      <TableHead className="text-right">Belopp</TableHead>
                      <TableHead className="w-20"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {entries.slice(0, 20).map(e => (
                      <TableRow key={e.id}>
                        <TableCell>{e.date}</TableCell>
                        <TableCell>{e.shift}</TableCell>
                        <TableCell>{e.employeeName}</TableCell>
                        <TableCell className="text-right tabular-nums">{e.amount.toLocaleString('sv-SE')} kr</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <Button variant="ghost" size="sm" onClick={() => openEditEntry(e)}>
                              <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
                            </Button>
                            <Button variant="ghost" size="sm" onClick={() => setDeleteKey(e.id)}>
                              <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        </TabsContent>

        {/* ------------------------------------------------------------------ */}
        {/* Overview tab                                                        */}
        {/* ------------------------------------------------------------------ */}
        <TabsContent value="overview" className="space-y-6 mt-4">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <DateRangeFilter onRangeChange={(start, end) => setDateRange({ start, end })} />
            <Button variant="outline" size="sm" onClick={handleExportCsv} disabled={entries.length === 0}>
              <Download className="h-4 w-4 mr-1" />
              Exportera CSV
            </Button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <KPICard label="Total dricks" value={totalTips.toLocaleString('sv-SE')} suffix="kr" />
            <KPICard label="Snitt per skift" value={avgPerShift.toLocaleString('sv-SE')} suffix="kr" />
            <KPICard label="Antal registreringar" value={entries.length} />
          </div>

          {monthlyTrend.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold mb-3">Manadstrend</h3>
              <MonthlyTrendTable rows={monthlyTrend} valueLabel="Total dricks" />
            </div>
          )}

          {employeeTotals.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold mb-3">Per anstalld</h3>
              <div className="rounded-xl border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Anstalld</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                      <TableHead className="text-right">Antal skift</TableHead>
                      <TableHead className="text-right">Snitt/skift</TableHead>
                      <TableHead className="w-10"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {employeeTotals.map(e => {
                      const isExpanded = expandedEmployeeId === e.id
                      return (
                        <TableRow key={e.id} className="group">
                          <TableCell>
                            <button
                              type="button"
                              className="flex items-center gap-1 font-medium text-left hover:underline"
                              onClick={() => toggleExpandedEmployee(e.id)}
                            >
                              {isExpanded
                                ? <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" />
                                : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                              }
                              {e.name}
                            </button>
                          </TableCell>
                          <TableCell className="text-right tabular-nums">{e.total.toLocaleString('sv-SE')} kr</TableCell>
                          <TableCell className="text-right tabular-nums">{e.count}</TableCell>
                          <TableCell className="text-right tabular-nums">{Math.round(e.total / e.count).toLocaleString('sv-SE')} kr</TableCell>
                          <TableCell />
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </div>

              {/* Expanded employee detail */}
              {expandedEmployeeId && expandedEmployeeEntries.length > 0 && (
                <div className="mt-3 ml-4">
                  <h4 className="text-sm font-medium mb-2">
                    Drickshistorik for {employeeTotals.find(e => e.id === expandedEmployeeId)?.name}
                  </h4>
                  <div className="rounded-xl border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Datum</TableHead>
                          <TableHead>Skift</TableHead>
                          <TableHead className="text-right">Belopp</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {expandedEmployeeEntries.map(e => (
                          <TableRow key={e.id}>
                            <TableCell>{e.date}</TableCell>
                            <TableCell>{e.shift}</TableCell>
                            <TableCell className="text-right tabular-nums">{e.amount.toLocaleString('sv-SE')} kr</TableCell>
                          </TableRow>
                        ))}
                        <TableRow className="font-medium border-t-2">
                          <TableCell colSpan={2}>Totalt / Snitt</TableCell>
                          <TableCell className="text-right tabular-nums">
                            {expandedEmployeeEntries.reduce((s, e) => s + e.amount, 0).toLocaleString('sv-SE')} kr
                            {' '}({Math.round(expandedEmployeeEntries.reduce((s, e) => s + e.amount, 0) / expandedEmployeeEntries.length).toLocaleString('sv-SE')} kr/skift)
                          </TableCell>
                        </TableRow>
                      </TableBody>
                    </Table>
                  </div>
                </div>
              )}
            </div>
          )}
        </TabsContent>

        {/* ------------------------------------------------------------------ */}
        {/* Employees tab                                                       */}
        {/* ------------------------------------------------------------------ */}
        <TabsContent value="employees" className="space-y-6 mt-4">
          <div className="flex gap-2">
            <Input
              placeholder="Namn pa anstalld"
              value={newEmployeeName}
              onChange={e => setNewEmployeeName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleAddEmployee()}
              className="max-w-xs"
            />
            <Button size="sm" onClick={handleAddEmployee} disabled={!newEmployeeName.trim()}>
              <Plus className="h-4 w-4 mr-1" /> Lagg till
            </Button>
          </div>

          {employees.length === 0 ? (
            <p className="text-sm text-muted-foreground">Inga anstallda tillagda annu.</p>
          ) : (
            <div className="rounded-xl border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Namn</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="w-32"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {employees.map(emp => (
                    <TableRow key={emp.id}>
                      <TableCell className="font-medium">{emp.name}</TableCell>
                      <TableCell>
                        <Badge variant={emp.active ? 'default' : 'secondary'}>
                          {emp.active ? 'Aktiv' : 'Inaktiv'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Button variant="ghost" size="sm" onClick={() => openEditEmployee(emp)}>
                            <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => handleToggleEmployee(emp)}>
                            {emp.active ? 'Inaktivera' : 'Aktivera'}
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>

        {/* ------------------------------------------------------------------ */}
        {/* Tip pool tab                                                        */}
        {/* ------------------------------------------------------------------ */}
        <TabsContent value="pool" className="space-y-6 mt-4">
          <div className="rounded-xl border p-4 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold">Drickspool</h3>
                <p className="text-sm text-muted-foreground">
                  Fordela dricks fran en gemensam pool till utvalda anstallda.
                </p>
              </div>
              <Button
                variant={settings.poolingEnabled ? 'default' : 'outline'}
                size="sm"
                onClick={handleTogglePooling}
              >
                {settings.poolingEnabled ? 'Aktiverad' : 'Inaktiverad'}
              </Button>
            </div>

            {Boolean(settings.poolingEnabled) && (
              <div className="space-y-6">
                {/* Pool amount */}
                <div className="space-y-2">
                  <Label htmlFor="pool-amount">Total poolbelopp (kr)</Label>
                  <Input
                    id="pool-amount"
                    type="number"
                    step="1"
                    min="0"
                    placeholder="0"
                    value={poolAmount}
                    onChange={e => setPoolAmount(e.target.value)}
                    className="max-w-xs"
                  />
                </div>

                {/* Select employees */}
                <div className="space-y-2">
                  <Label>Valj anstallda</Label>
                  {activeEmployees.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Inga aktiva anstallda.</p>
                  ) : (
                    <div className="space-y-2">
                      {activeEmployees.map(emp => (
                        <div key={emp.id} className="flex items-center gap-2">
                          <Checkbox
                            id={`pool-emp-${emp.id}`}
                            checked={poolSelectedIds.has(emp.id)}
                            onCheckedChange={() => togglePoolEmployee(emp.id)}
                          />
                          <label htmlFor={`pool-emp-${emp.id}`} className="text-sm cursor-pointer">
                            {emp.name}
                          </label>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Split method */}
                {poolSelectedEmployees.length > 0 && (
                  <div className="space-y-2">
                    <Label>Fordelningsmetod</Label>
                    <Select value={splitMethod} onValueChange={v => setSplitMethod(v as SplitMethod)}>
                      <SelectTrigger className="max-w-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="equal">Lika</SelectItem>
                        <SelectItem value="hours">Per timmar</SelectItem>
                        <SelectItem value="custom">Anpassad %</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {/* Hours input (when split by hours) */}
                {splitMethod === 'hours' && poolSelectedEmployees.length > 0 && (
                  <div className="space-y-3">
                    <Label>Timmar per anstalld</Label>
                    {poolSelectedEmployees.map(emp => (
                      <div key={emp.id} className="flex items-center gap-3">
                        <span className="text-sm w-32 truncate">{emp.name}</span>
                        <Input
                          type="number"
                          step="0.5"
                          min="0"
                          placeholder="0"
                          className="max-w-24"
                          value={hoursMap[emp.id] ?? ''}
                          onChange={e => setHoursMap(prev => ({ ...prev, [emp.id]: e.target.value }))}
                        />
                        <span className="text-sm text-muted-foreground">timmar</span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Custom percentage input */}
                {splitMethod === 'custom' && poolSelectedEmployees.length > 0 && (
                  <div className="space-y-3">
                    <Label>Procent per anstalld</Label>
                    {poolSelectedEmployees.map(emp => (
                      <div key={emp.id} className="flex items-center gap-3">
                        <span className="text-sm w-32 truncate">{emp.name}</span>
                        <Input
                          type="number"
                          step="1"
                          min="0"
                          max="100"
                          placeholder="0"
                          className="max-w-24"
                          value={customPctMap[emp.id] ?? ''}
                          onChange={e => setCustomPctMap(prev => ({ ...prev, [emp.id]: e.target.value }))}
                        />
                        <span className="text-sm text-muted-foreground">%</span>
                      </div>
                    ))}
                    <p className={`text-xs ${Math.abs(customPctTotal - 100) < 0.01 ? 'text-muted-foreground' : 'text-red-600'}`}>
                      Summa: {customPctTotal}% {Math.abs(customPctTotal - 100) >= 0.01 && '(maste vara 100%)'}
                    </p>
                  </div>
                )}

                {/* Distribution result */}
                {poolDistribution.length > 0 && poolTotal > 0 && (
                  <div>
                    <h4 className="text-sm font-semibold mb-2">Fordelningsresultat</h4>
                    <div className="rounded-xl border">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Anstalld</TableHead>
                            <TableHead className="text-right">Andel (kr)</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {poolDistribution.map(d => (
                            <TableRow key={d.id}>
                              <TableCell className="font-medium">{d.name}</TableCell>
                              <TableCell className="text-right tabular-nums">{d.share.toLocaleString('sv-SE')} kr</TableCell>
                            </TableRow>
                          ))}
                          <TableRow className="font-medium border-t-2">
                            <TableCell>Totalt</TableCell>
                            <TableCell className="text-right tabular-nums">
                              {poolDistribution.reduce((s, d) => s + d.share, 0).toLocaleString('sv-SE')} kr
                            </TableCell>
                          </TableRow>
                        </TableBody>
                      </Table>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}
