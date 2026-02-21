'use client'

import { useState, useMemo, useCallback } from 'react'
import type { WorkspaceComponentProps } from '@/lib/extensions/workspace-registry'
import { useExtensionData } from '@/lib/extensions/use-extension-data'
import KPICard from '@/components/extensions/shared/KPICard'
import MonthlyTrendTable from '@/components/extensions/shared/MonthlyTrendTable'
import DataEntryForm from '@/components/extensions/shared/DataEntryForm'
import SetupPrompt from '@/components/extensions/shared/SetupPrompt'
import ExtensionLoadingSkeleton from '@/components/extensions/shared/ExtensionLoadingSkeleton'
import ConfirmDeleteDialog from '@/components/extensions/shared/ConfirmDeleteDialog'
import EditEntryDialog from '@/components/extensions/shared/EditEntryDialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription,
} from '@/components/ui/dialog'
import { Pencil, Plus, Trash2, Settings, ChevronLeft, ChevronRight, Archive, CheckCircle } from 'lucide-react'

// --- Types ---

type ProjectStatus = 'active' | 'completed' | 'archived'

interface TimeEntry {
  id: string
  date: string
  projectId: string
  projectName: string
  hours: number
  billable: boolean
  description: string
}

interface Project {
  id: string
  name: string
  active: boolean
  client?: string
  hourlyRate?: number
  status?: ProjectStatus
}

// --- Helpers ---

function getMonday(d: Date): Date {
  const copy = new Date(d)
  const day = copy.getDay()
  const diff = day === 0 ? -6 : 1 - day
  copy.setDate(copy.getDate() + diff)
  copy.setHours(0, 0, 0, 0)
  return copy
}

function addDays(d: Date, n: number): Date {
  const copy = new Date(d)
  copy.setDate(copy.getDate() + n)
  return copy
}

function formatDateStr(d: Date): string {
  return d.toISOString().slice(0, 10)
}

const DAY_LABELS = ['Man', 'Tis', 'Ons', 'Tor', 'Fre', 'Lor', 'Son']

function getProjectStatus(p: { active: boolean; status?: ProjectStatus }): ProjectStatus {
  return p.status ?? (p.active ? 'active' : 'completed')
}

function getEffectiveRate(project: Project | undefined, globalRate: number): number {
  if (project?.hourlyRate && project.hourlyRate > 0) return project.hourlyRate
  return globalRate
}

function statusLabel(status: ProjectStatus): string {
  switch (status) {
    case 'active': return 'Aktiv'
    case 'completed': return 'Avslutad'
    case 'archived': return 'Arkiverad'
  }
}

function statusBadgeVariant(status: ProjectStatus): 'default' | 'secondary' | 'outline' {
  switch (status) {
    case 'active': return 'default'
    case 'completed': return 'secondary'
    case 'archived': return 'outline'
  }
}

// --- Component ---

export default function BillableHoursWorkspace({}: WorkspaceComponentProps) {
  const { data, save, remove, refresh, isLoading } = useExtensionData('tech', 'billable-hours')
  const settings = data.find(d => d.key === 'settings')?.value as { hourlyRate?: number } | undefined
  const hourlyRate = settings?.hourlyRate ?? 0

  // --- Derived data ---

  const projects = useMemo(() =>
    data.filter(d => d.key.startsWith('project:'))
      .map(d => ({
        id: d.key.replace('project:', ''),
        ...(d.value as Omit<Project, 'id'>),
      }))
  , [data])

  const entries = useMemo(() =>
    data.filter(d => d.key.startsWith('entry:'))
      .map(d => ({ id: d.key.replace('entry:', ''), ...(d.value as Omit<TimeEntry, 'id'>) }))
      .sort((a, b) => b.date.localeCompare(a.date))
  , [data])

  // --- Form state ---

  const todayStr = useMemo(() => new Date().toISOString().slice(0, 10), [])
  const currentMonth = useMemo(() => new Date().toISOString().slice(0, 7), [])
  const [entryDate, setEntryDate] = useState(todayStr)
  const [selectedProjectId, setProjectId] = useState('')
  const activeProjects = projects.filter(p => getProjectStatus(p) === 'active')
  const projectId = selectedProjectId || (activeProjects.length > 0 ? activeProjects[0].id : '')
  const [hours, setHours] = useState('')
  const [billable, setBillable] = useState(true)
  const [description, setDescription] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  // New project dialog
  const [newProjectName, setNewProjectName] = useState('')
  const [newProjectClient, setNewProjectClient] = useState('')
  const [newProjectRate, setNewProjectRate] = useState('')
  const [showNewProject, setShowNewProject] = useState(false)

  // Edit entry dialog
  const [editEntry, setEditEntry] = useState<TimeEntry | null>(null)
  const [editDate, setEditDate] = useState('')
  const [editProjectId, setEditProjectId] = useState('')
  const [editHours, setEditHours] = useState('')
  const [editBillable, setEditBillable] = useState(true)
  const [editDescription, setEditDescription] = useState('')
  const [isSavingEdit, setIsSavingEdit] = useState(false)

  // Delete confirm
  const [deleteEntryId, setDeleteEntryId] = useState<string | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)

  // Show archived toggle
  const [showArchived, setShowArchived] = useState(false)

  // Settings dialog
  const [showSettings, setShowSettings] = useState(false)
  const [settingsRate, setSettingsRate] = useState('')

  // Weekly view state
  const [weekStart, setWeekStart] = useState(() => getMonday(new Date()))
  const [weekCellProject, setWeekCellProject] = useState<string | null>(null)
  const [weekCellDay, setWeekCellDay] = useState<number | null>(null)
  const [weekCellHours, setWeekCellHours] = useState('')

  // --- KPI calculations ---

  const monthEntries = useMemo(() =>
    entries.filter(e => e.date.startsWith(currentMonth))
  , [entries, currentMonth])
  const totalHours = monthEntries.reduce((s, e) => s + e.hours, 0)
  const billableHours = monthEntries.filter(e => e.billable).reduce((s, e) => s + e.hours, 0)
  const utilization = totalHours > 0 ? Math.round((billableHours / totalHours) * 100) : 0
  const effectiveRate = totalHours > 0 ? Math.round((billableHours * hourlyRate) / totalHours) : 0

  // Today's entries
  const todayEntries = entries.filter(e => e.date === todayStr)

  // Monthly trend (utilization %)
  const monthlyTrend = useMemo(() => {
    const map = new Map<string, { total: number; billable: number }>()
    for (const e of entries) {
      const month = e.date.slice(0, 7)
      const existing = map.get(month) ?? { total: 0, billable: 0 }
      existing.total += e.hours
      if (e.billable) existing.billable += e.hours
      map.set(month, existing)
    }
    return Array.from(map.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, d]) => ({
        month,
        value: d.total > 0 ? Math.round((d.billable / d.total) * 100) : 0,
      }))
  }, [entries])

  // Period summary: monthly totals for billable/non-billable + revenue
  const periodSummary = useMemo(() => {
    const map = new Map<string, { billable: number; nonBillable: number; revenue: number }>()
    for (const e of entries) {
      const month = e.date.slice(0, 7)
      const existing = map.get(month) ?? { billable: 0, nonBillable: 0, revenue: 0 }
      if (e.billable) {
        existing.billable += e.hours
        const proj = projects.find(p => p.id === e.projectId)
        const rate = getEffectiveRate(proj, hourlyRate)
        existing.revenue += Math.round(e.hours * rate * 100) / 100
      } else {
        existing.nonBillable += e.hours
      }
      map.set(month, existing)
    }
    return Array.from(map.entries())
      .sort(([a], [b]) => b.localeCompare(a))
      .map(([month, d]) => ({ month, ...d }))
  }, [entries, projects, hourlyRate])

  // Per-project stats
  const projectStats = useMemo(() => {
    const cm = new Date().toISOString().slice(0, 7)
    const filtered = entries.filter(e => e.date.startsWith(cm))
    const map = new Map<string, { total: number; billable: number }>()
    for (const e of filtered) {
      const existing = map.get(e.projectId) ?? { total: 0, billable: 0 }
      existing.total += e.hours
      if (e.billable) existing.billable += e.hours
      map.set(e.projectId, existing)
    }
    return projects.map(p => {
      const stats = map.get(p.id) ?? { total: 0, billable: 0 }
      return {
        ...p,
        ...stats,
        effectiveStatus: getProjectStatus(p),
        utilization: stats.total > 0 ? Math.round((stats.billable / stats.total) * 100) : 0,
      }
    })
  }, [projects, entries])

  // Weekly grid data
  const weekDays = useMemo(() =>
    Array.from({ length: 7 }, (_, i) => formatDateStr(addDays(weekStart, i)))
  , [weekStart])

  const weekLabel = useMemo(() => {
    const end = addDays(weekStart, 6)
    const startStr = weekStart.toLocaleDateString('sv-SE', { day: 'numeric', month: 'short' })
    const endStr = end.toLocaleDateString('sv-SE', { day: 'numeric', month: 'short' })
    return `${startStr} - ${endStr}`
  }, [weekStart])

  const weekGrid = useMemo(() => {
    const weekDateSet = new Set(weekDays)
    const weekEntries = entries.filter(e => weekDateSet.has(e.date))
    const grid = new Map<string, Map<number, number>>()
    for (const p of activeProjects) {
      const dayMap = new Map<number, number>()
      for (let i = 0; i < 7; i++) dayMap.set(i, 0)
      grid.set(p.id, dayMap)
    }
    for (const e of weekEntries) {
      const dayIndex = weekDays.indexOf(e.date)
      if (dayIndex < 0) continue
      const existing = grid.get(e.projectId)
      if (existing) {
        existing.set(dayIndex, (existing.get(dayIndex) ?? 0) + e.hours)
      }
    }
    return grid
  }, [activeProjects, entries, weekDays])

  const weekDayTotals = useMemo(() => {
    const totals = Array(7).fill(0)
    for (const dayMap of weekGrid.values()) {
      for (let i = 0; i < 7; i++) {
        totals[i] += dayMap.get(i) ?? 0
      }
    }
    return totals as number[]
  }, [weekGrid])

  const weekProjectTotals = useMemo(() => {
    const map = new Map<string, number>()
    for (const [projId, dayMap] of weekGrid.entries()) {
      let total = 0
      for (const h of dayMap.values()) total += h
      map.set(projId, total)
    }
    return map
  }, [weekGrid])

  const weekGrandTotal = weekDayTotals.reduce((s, v) => s + v, 0)

  // --- Handlers ---

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const h = parseFloat(hours)
    if (isNaN(h) || h <= 0 || !projectId) return
    setIsSubmitting(true)
    const proj = projects.find(p => p.id === projectId)
    const id = crypto.randomUUID()
    await save(`entry:${id}`, {
      date: entryDate,
      projectId,
      projectName: proj?.name ?? '',
      hours: h,
      billable,
      description,
    })
    setHours('')
    setDescription('')
    setBillable(true)
    await refresh()
    setIsSubmitting(false)
  }

  const handleAddProject = async () => {
    if (!newProjectName.trim()) return
    const id = crypto.randomUUID()
    const rateVal = parseFloat(newProjectRate)
    await save(`project:${id}`, {
      name: newProjectName.trim(),
      active: true,
      status: 'active' as ProjectStatus,
      client: newProjectClient.trim() || undefined,
      hourlyRate: (!isNaN(rateVal) && rateVal > 0) ? rateVal : undefined,
    })
    setNewProjectName('')
    setNewProjectClient('')
    setNewProjectRate('')
    setShowNewProject(false)
    await refresh()
  }

  const handleDeleteEntry = async () => {
    if (!deleteEntryId) return
    setIsDeleting(true)
    await remove(`entry:${deleteEntryId}`)
    await refresh()
    setIsDeleting(false)
    setDeleteEntryId(null)
  }

  const openEditEntry = useCallback((entry: TimeEntry) => {
    setEditEntry(entry)
    setEditDate(entry.date)
    setEditProjectId(entry.projectId)
    setEditHours(String(entry.hours))
    setEditBillable(entry.billable)
    setEditDescription(entry.description)
  }, [])

  const handleSaveEdit = async () => {
    if (!editEntry) return
    const h = parseFloat(editHours)
    if (isNaN(h) || h <= 0 || !editProjectId) return
    setIsSavingEdit(true)
    const proj = projects.find(p => p.id === editProjectId)
    await save(`entry:${editEntry.id}`, {
      date: editDate,
      projectId: editProjectId,
      projectName: proj?.name ?? editEntry.projectName,
      hours: h,
      billable: editBillable,
      description: editDescription,
    })
    await refresh()
    setIsSavingEdit(false)
    setEditEntry(null)
  }

  const handleProjectStatusChange = async (projectId: string, newStatus: ProjectStatus) => {
    const proj = projects.find(p => p.id === projectId)
    if (!proj) return
    await save(`project:${projectId}`, {
      name: proj.name,
      active: newStatus === 'active',
      status: newStatus,
      client: proj.client,
      hourlyRate: proj.hourlyRate,
    })
    await refresh()
  }

  const handleSetup = async (values: Record<string, string>) => {
    await save('settings', { hourlyRate: parseFloat(values.hourlyRate) || 0 })
  }

  const handleSaveSettings = async () => {
    const rate = parseFloat(settingsRate)
    if (isNaN(rate) || rate <= 0) return
    await save('settings', { hourlyRate: rate })
    await refresh()
    setShowSettings(false)
  }

  const handleWeekCellClick = (projId: string, dayIndex: number) => {
    setWeekCellProject(projId)
    setWeekCellDay(dayIndex)
    setWeekCellHours('')
  }

  const handleWeekCellSubmit = async () => {
    if (weekCellProject === null || weekCellDay === null) return
    const h = parseFloat(weekCellHours)
    if (isNaN(h) || h <= 0) {
      setWeekCellProject(null)
      setWeekCellDay(null)
      return
    }
    const proj = projects.find(p => p.id === weekCellProject)
    const id = crypto.randomUUID()
    await save(`entry:${id}`, {
      date: weekDays[weekCellDay],
      projectId: weekCellProject,
      projectName: proj?.name ?? '',
      hours: h,
      billable: true,
      description: '',
    })
    await refresh()
    setWeekCellProject(null)
    setWeekCellDay(null)
    setWeekCellHours('')
  }

  const handleWeekCellKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleWeekCellSubmit()
    } else if (e.key === 'Escape') {
      setWeekCellProject(null)
      setWeekCellDay(null)
    }
  }

  // --- Render ---

  if (isLoading) return <ExtensionLoadingSkeleton />

  if (!hourlyRate) {
    return (
      <SetupPrompt
        title="Konfigurera timpris"
        description="Ange ditt timpris for att borja spara debiterbar tid."
        fields={[{ key: 'hourlyRate', label: 'Timpris (kr/h)', type: 'number', placeholder: 'T.ex. 1000' }]}
        onSave={handleSetup}
      />
    )
  }

  const visibleProjectStats = showArchived
    ? projectStats
    : projectStats.filter(p => p.effectiveStatus !== 'archived')

  return (
    <div className="space-y-6">
      {/* Settings gear button */}
      <div className="flex justify-end">
        <Dialog open={showSettings} onOpenChange={(open) => {
          setShowSettings(open)
          if (open) setSettingsRate(String(hourlyRate))
        }}>
          <DialogTrigger asChild>
            <Button variant="ghost" size="sm">
              <Settings className="h-4 w-4 mr-1" />
              Installningar
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>Installningar</DialogTitle>
              <DialogDescription>Andra ditt globala timpris.</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Timpris (kr/h)</Label>
                <Input
                  type="number"
                  min="0"
                  value={settingsRate}
                  onChange={e => setSettingsRate(e.target.value)}
                  placeholder="T.ex. 1000"
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowSettings(false)}>Avbryt</Button>
              <Button onClick={handleSaveSettings} disabled={!settingsRate || parseFloat(settingsRate) <= 0}>
                Spara
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Tabs defaultValue="timesheet">
        <TabsList>
          <TabsTrigger value="timesheet">Tidrapport</TabsTrigger>
          <TabsTrigger value="weekly">Veckorapport</TabsTrigger>
          <TabsTrigger value="overview">Oversikt</TabsTrigger>
          <TabsTrigger value="projects">Projekt</TabsTrigger>
        </TabsList>

        {/* --- Timesheet Tab --- */}
        <TabsContent value="timesheet" className="space-y-6 mt-4">
          {activeProjects.length === 0 ? (
            <div className="rounded-xl border p-6 text-center">
              <p className="text-sm text-muted-foreground">
                Lagg till projekt under fliken &quot;Projekt&quot; for att borja rapportera tid.
              </p>
            </div>
          ) : (
            <DataEntryForm
              title="Registrera tid"
              onSubmit={handleSubmit}
              submitLabel="Registrera"
              isSubmitting={isSubmitting}
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Datum</Label>
                  <Input type="date" value={entryDate} onChange={e => setEntryDate(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Projekt</Label>
                  <Select value={projectId} onValueChange={setProjectId}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {activeProjects.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Timmar</Label>
                  <Input type="number" step="0.25" min="0" placeholder="0" value={hours} onChange={e => setHours(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Beskrivning</Label>
                  <Input placeholder="Vad jobbade du med?" value={description} onChange={e => setDescription(e.target.value)} />
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Switch checked={billable} onCheckedChange={setBillable} id="billable-switch" />
                <Label htmlFor="billable-switch" className="text-sm">Debiterbar</Label>
              </div>
            </DataEntryForm>
          )}

          {/* Today's entries */}
          <div>
            <h3 className="text-sm font-semibold mb-3">Idag ({todayStr})</h3>
            {todayEntries.length === 0 ? (
              <p className="text-sm text-muted-foreground">Ingen tid registrerad idag.</p>
            ) : (
              <div className="rounded-xl border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Projekt</TableHead>
                      <TableHead className="text-right">Timmar</TableHead>
                      <TableHead>Typ</TableHead>
                      <TableHead>Beskrivning</TableHead>
                      <TableHead className="w-20"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {todayEntries.map(e => (
                      <TableRow key={e.id}>
                        <TableCell className="font-medium">{e.projectName}</TableCell>
                        <TableCell className="text-right tabular-nums">{e.hours}h</TableCell>
                        <TableCell>{e.billable ? 'Debiterbar' : 'Intern'}</TableCell>
                        <TableCell className="text-muted-foreground">{e.description}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <Button variant="ghost" size="sm" onClick={() => openEditEntry(e)}>
                              <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
                            </Button>
                            <Button variant="ghost" size="sm" onClick={() => setDeleteEntryId(e.id)}>
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

        {/* --- Weekly Tab --- */}
        <TabsContent value="weekly" className="space-y-6 mt-4">
          {activeProjects.length === 0 ? (
            <div className="rounded-xl border p-6 text-center">
              <p className="text-sm text-muted-foreground">
                Lagg till projekt under fliken &quot;Projekt&quot; for att borja rapportera tid.
              </p>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setWeekStart(prev => addDays(prev, -7))}
                >
                  <ChevronLeft className="h-4 w-4 mr-1" />
                  Foregaende
                </Button>
                <span className="text-sm font-medium">{weekLabel}</span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setWeekStart(prev => addDays(prev, 7))}
                >
                  Nasta
                  <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              </div>

              <div className="rounded-xl border overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="min-w-[140px]">Projekt</TableHead>
                      {DAY_LABELS.map((label, i) => (
                        <TableHead key={i} className="text-center min-w-[80px]">
                          <div className="text-xs">{label}</div>
                          <div className="text-xs text-muted-foreground">{weekDays[i].slice(5)}</div>
                        </TableHead>
                      ))}
                      <TableHead className="text-right min-w-[70px]">Totalt</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {activeProjects.map(p => {
                      const dayMap = weekGrid.get(p.id)
                      const projTotal = weekProjectTotals.get(p.id) ?? 0
                      return (
                        <TableRow key={p.id}>
                          <TableCell className="font-medium text-sm">{p.name}</TableCell>
                          {Array.from({ length: 7 }, (_, i) => {
                            const cellHours = dayMap?.get(i) ?? 0
                            const isEditing = weekCellProject === p.id && weekCellDay === i
                            return (
                              <TableCell key={i} className="text-center p-1">
                                {isEditing ? (
                                  <Input
                                    type="number"
                                    step="0.25"
                                    min="0"
                                    className="h-8 w-16 mx-auto text-center text-sm"
                                    value={weekCellHours}
                                    onChange={e => setWeekCellHours(e.target.value)}
                                    onBlur={handleWeekCellSubmit}
                                    onKeyDown={handleWeekCellKeyDown}
                                    autoFocus
                                  />
                                ) : (
                                  <button
                                    type="button"
                                    className="w-full h-8 rounded text-sm tabular-nums hover:bg-muted transition-colors cursor-pointer"
                                    onClick={() => handleWeekCellClick(p.id, i)}
                                    title="Klicka for att registrera timmar"
                                  >
                                    {cellHours > 0 ? `${cellHours}h` : '-'}
                                  </button>
                                )}
                              </TableCell>
                            )
                          })}
                          <TableCell className="text-right tabular-nums font-medium">
                            {projTotal > 0 ? `${projTotal}h` : '-'}
                          </TableCell>
                        </TableRow>
                      )
                    })}
                    {/* Totals row */}
                    <TableRow className="border-t-2 font-semibold">
                      <TableCell>Totalt</TableCell>
                      {weekDayTotals.map((total, i) => (
                        <TableCell key={i} className="text-center tabular-nums">
                          {total > 0 ? `${total}h` : '-'}
                        </TableCell>
                      ))}
                      <TableCell className="text-right tabular-nums">
                        {weekGrandTotal > 0 ? `${weekGrandTotal}h` : '-'}
                      </TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </div>
            </>
          )}
        </TabsContent>

        {/* --- Overview Tab --- */}
        <TabsContent value="overview" className="space-y-6 mt-4">
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
            <KPICard label="Belaggningsgrad" value={utilization} suffix="%" />
            <KPICard label="Debiterbara timmar" value={billableHours} suffix="h" />
            <KPICard label="Totala timmar" value={totalHours} suffix="h" />
            <KPICard label="Effektivt timpris" value={effectiveRate.toLocaleString('sv-SE')} suffix="kr/h" />
          </div>

          {monthlyTrend.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold mb-3">Belaggning per manad</h3>
              <MonthlyTrendTable rows={monthlyTrend} valueLabel="Belaggning" valueSuffix="%" />
            </div>
          )}

          {/* Period summary */}
          {periodSummary.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold mb-3">Manatlig sammanstallning</h3>
              <div className="rounded-xl border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Period</TableHead>
                      <TableHead className="text-right">Debiterbara</TableHead>
                      <TableHead className="text-right">Icke-debiterbara</TableHead>
                      <TableHead className="text-right">Totalt</TableHead>
                      <TableHead className="text-right">Intakt</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {periodSummary.map(row => (
                      <TableRow key={row.month}>
                        <TableCell className="font-medium">{row.month}</TableCell>
                        <TableCell className="text-right tabular-nums">{row.billable}h</TableCell>
                        <TableCell className="text-right tabular-nums">{row.nonBillable}h</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {Math.round((row.billable + row.nonBillable) * 100) / 100}h
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {Math.round(row.revenue).toLocaleString('sv-SE')} kr
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}
        </TabsContent>

        {/* --- Projects Tab --- */}
        <TabsContent value="projects" className="space-y-6 mt-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <Dialog open={showNewProject} onOpenChange={setShowNewProject}>
              <DialogTrigger asChild>
                <Button size="sm" variant="outline">
                  <Plus className="h-4 w-4 mr-1" /> Nytt projekt
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Nytt projekt</DialogTitle>
                  <DialogDescription>Lagg till ett nytt projekt att rapportera tid pa.</DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label>Projektnamn</Label>
                    <Input
                      placeholder="T.ex. Kundprojekt A"
                      value={newProjectName}
                      onChange={e => setNewProjectName(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Kund (valfritt)</Label>
                    <Input
                      placeholder="T.ex. Foretag AB"
                      value={newProjectClient}
                      onChange={e => setNewProjectClient(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Timpris (kr/h, valfritt)</Label>
                    <Input
                      type="number"
                      min="0"
                      placeholder={`Standard: ${hourlyRate}`}
                      value={newProjectRate}
                      onChange={e => setNewProjectRate(e.target.value)}
                    />
                    <p className="text-xs text-muted-foreground">
                      Om tomt anvands det globala timpriset ({hourlyRate} kr/h).
                    </p>
                  </div>
                </div>
                <DialogFooter>
                  <Button onClick={handleAddProject} disabled={!newProjectName.trim()}>Skapa</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            <div className="flex items-center gap-2">
              <Switch
                checked={showArchived}
                onCheckedChange={setShowArchived}
                id="show-archived-switch"
              />
              <Label htmlFor="show-archived-switch" className="text-sm">Visa arkiverade</Label>
            </div>
          </div>

          {visibleProjectStats.length === 0 ? (
            <p className="text-sm text-muted-foreground">Inga projekt att visa.</p>
          ) : (
            <div className="rounded-xl border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Projekt</TableHead>
                    <TableHead>Kund</TableHead>
                    <TableHead className="text-right">Timpris</TableHead>
                    <TableHead className="text-right">Timmar (manad)</TableHead>
                    <TableHead className="text-right">Debiterbara</TableHead>
                    <TableHead className="text-right">Belaggning</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="w-28"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visibleProjectStats.map(p => {
                    const status = p.effectiveStatus
                    return (
                      <TableRow key={p.id} className={status === 'archived' ? 'opacity-60' : undefined}>
                        <TableCell className="font-medium">{p.name}</TableCell>
                        <TableCell className="text-muted-foreground">{p.client || '-'}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {p.hourlyRate ? `${p.hourlyRate} kr/h` : `${hourlyRate} kr/h`}
                          {p.hourlyRate ? (
                            <span className="text-xs text-muted-foreground ml-1">(projekt)</span>
                          ) : null}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{p.total}h</TableCell>
                        <TableCell className="text-right tabular-nums">{p.billable}h</TableCell>
                        <TableCell className="text-right tabular-nums">{p.utilization}%</TableCell>
                        <TableCell>
                          <Badge variant={statusBadgeVariant(status)}>
                            {statusLabel(status)}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            {status === 'active' && (
                              <Button
                                variant="ghost"
                                size="sm"
                                title="Markera som avslutad"
                                onClick={() => handleProjectStatusChange(p.id, 'completed')}
                              >
                                <CheckCircle className="h-3.5 w-3.5 text-muted-foreground" />
                              </Button>
                            )}
                            {status === 'completed' && (
                              <Button
                                variant="ghost"
                                size="sm"
                                title="Ateraktivera"
                                onClick={() => handleProjectStatusChange(p.id, 'active')}
                              >
                                <CheckCircle className="h-3.5 w-3.5 text-green-600" />
                              </Button>
                            )}
                            {status !== 'archived' && (
                              <Button
                                variant="ghost"
                                size="sm"
                                title="Arkivera"
                                onClick={() => handleProjectStatusChange(p.id, 'archived')}
                              >
                                <Archive className="h-3.5 w-3.5 text-muted-foreground" />
                              </Button>
                            )}
                            {status === 'archived' && (
                              <Button
                                variant="ghost"
                                size="sm"
                                title="Ateraktivera"
                                onClick={() => handleProjectStatusChange(p.id, 'active')}
                              >
                                <Archive className="h-3.5 w-3.5 text-green-600" />
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Edit Entry Dialog */}
      <EditEntryDialog
        open={editEntry !== null}
        onOpenChange={(open) => { if (!open) setEditEntry(null) }}
        title="Redigera tidpost"
        description="Andra uppgifterna for den registrerade tiden."
        onSave={handleSaveEdit}
        isSaving={isSavingEdit}
      >
        <div className="space-y-2">
          <Label>Datum</Label>
          <Input type="date" value={editDate} onChange={e => setEditDate(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label>Projekt</Label>
          <Select value={editProjectId} onValueChange={setEditProjectId}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {activeProjects.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Timmar</Label>
          <Input
            type="number"
            step="0.25"
            min="0"
            value={editHours}
            onChange={e => setEditHours(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label>Beskrivning</Label>
          <Input
            placeholder="Vad jobbade du med?"
            value={editDescription}
            onChange={e => setEditDescription(e.target.value)}
          />
        </div>
        <div className="flex items-center gap-2">
          <Switch checked={editBillable} onCheckedChange={setEditBillable} id="edit-billable-switch" />
          <Label htmlFor="edit-billable-switch" className="text-sm">Debiterbar</Label>
        </div>
      </EditEntryDialog>

      {/* Confirm Delete Dialog */}
      <ConfirmDeleteDialog
        open={deleteEntryId !== null}
        onOpenChange={(open) => { if (!open) setDeleteEntryId(null) }}
        title="Ta bort tidpost"
        description="Ar du saker pa att du vill ta bort denna tidpost? Atgarden kan inte angras."
        onConfirm={handleDeleteEntry}
        isDeleting={isDeleting}
      />
    </div>
  )
}
