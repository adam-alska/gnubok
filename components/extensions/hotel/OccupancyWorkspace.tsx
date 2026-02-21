'use client'

import { useState, useMemo } from 'react'
import type { WorkspaceComponentProps } from '@/lib/extensions/workspace-registry'
import { useExtensionData } from '@/lib/extensions/use-extension-data'
import KPICard from '@/components/extensions/shared/KPICard'
import DateRangeFilter from '@/components/extensions/shared/DateRangeFilter'
import DataEntryForm from '@/components/extensions/shared/DataEntryForm'
import SetupPrompt from '@/components/extensions/shared/SetupPrompt'
import ExtensionLoadingSkeleton from '@/components/extensions/shared/ExtensionLoadingSkeleton'
import ConfirmDeleteDialog from '@/components/extensions/shared/ConfirmDeleteDialog'
import EditEntryDialog from '@/components/extensions/shared/EditEntryDialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { cn } from '@/lib/utils'
import { Pencil, Trash2, ArrowUp, ArrowDown, Minus, Settings } from 'lucide-react'

const OOO_REASONS = ['Underhall', 'Renovering', 'Blockerat', 'Ovrigt'] as const
type OooReason = typeof OOO_REASONS[number]

function getOccupancyColor(pct: number): string {
  if (pct >= 80) return 'bg-green-500'
  if (pct >= 50) return 'bg-yellow-500'
  if (pct > 0) return 'bg-red-500'
  return 'bg-muted'
}

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
  // For occupancy: higher is better, so positive delta = green (improving)
  const improving = delta > 0
  return (
    <span className={cn(
      'inline-flex items-center gap-0.5 text-xs',
      improving ? 'text-green-600' : 'text-red-600'
    )}>
      {delta > 0
        ? <ArrowUp className="h-3 w-3" />
        : <ArrowDown className="h-3 w-3" />
      }
      <span>{delta > 0 ? '+' : ''}{delta} pp</span>
    </span>
  )
}

interface DailyEntry {
  date: string
  roomsOccupied: number
  roomsOutOfOrder: number
  reason?: OooReason
}

export default function OccupancyWorkspace({}: WorkspaceComponentProps) {
  const now = new Date()
  const [dateRange, setDateRange] = useState({
    start: new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10),
    end: new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10),
  })

  const prevPeriod = useMemo(
    () => computePreviousPeriod(dateRange.start, dateRange.end),
    [dateRange.start, dateRange.end]
  )

  const { data, save, remove, refresh, isLoading } = useExtensionData('hotel', 'occupancy')
  const settings = data.find(d => d.key === 'settings')?.value as { totalRooms?: number } | undefined
  const totalRooms = settings?.totalRooms ?? 0

  const allDailyEntries = useMemo(() =>
    data.filter(d => d.key.startsWith('daily:'))
      .map(d => ({
        date: d.key.replace('daily:', ''),
        ...(d.value as { roomsOccupied: number; roomsOutOfOrder: number; reason?: OooReason }),
      }))
  , [data])

  const entries = useMemo(() =>
    allDailyEntries
      .filter(e => e.date >= dateRange.start && e.date <= dateRange.end)
      .sort((a, b) => b.date.localeCompare(a.date))
  , [allDailyEntries, dateRange])

  const prevEntries = useMemo(() =>
    allDailyEntries
      .filter(e => e.date >= prevPeriod.start && e.date <= prevPeriod.end)
  , [allDailyEntries, prevPeriod])

  // Form state
  const [entryDate, setEntryDate] = useState(now.toISOString().slice(0, 10))
  const [roomsOccupied, setRoomsOccupied] = useState('')
  const [roomsOutOfOrder, setRoomsOutOfOrder] = useState('')
  const [oooReason, setOooReason] = useState<OooReason>('Underhall')
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Edit dialog state
  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [editDate, setEditDate] = useState('')
  const [editOccupied, setEditOccupied] = useState('')
  const [editOoo, setEditOoo] = useState('')
  const [editReason, setEditReason] = useState<OooReason>('Underhall')
  const [isSavingEdit, setIsSavingEdit] = useState(false)

  // Delete dialog state
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [deleteDate, setDeleteDate] = useState('')
  const [isDeleting, setIsDeleting] = useState(false)

  // Settings dialog state
  const [settingsDialogOpen, setSettingsDialogOpen] = useState(false)
  const [newTotalRooms, setNewTotalRooms] = useState('')
  const [isSavingSettings, setIsSavingSettings] = useState(false)

  // --- Validation ---
  const formOccupied = parseInt(roomsOccupied) || 0
  const formOoo = parseInt(roomsOutOfOrder) || 0
  const formExceedsTotal = totalRooms > 0 && (formOccupied + formOoo) > totalRooms
  const formIsValid = roomsOccupied !== '' && !isNaN(parseInt(roomsOccupied)) && !formExceedsTotal

  const editOccupiedNum = parseInt(editOccupied) || 0
  const editOooNum = parseInt(editOoo) || 0
  const editExceedsTotal = totalRooms > 0 && (editOccupiedNum + editOooNum) > totalRooms
  const editIsValid = editOccupied !== '' && !isNaN(parseInt(editOccupied)) && !editExceedsTotal

  // --- Current period KPIs ---
  const totalOccupied = entries.reduce((s, e) => s + e.roomsOccupied, 0)
  const totalOutOfOrder = entries.reduce((s, e) => s + e.roomsOutOfOrder, 0)
  const daysInRange = entries.length
  const totalAvailable = totalRooms * daysInRange

  const occupancyPct = totalAvailable > 0
    ? Math.round((totalOccupied / totalAvailable) * 10000) / 100
    : 0
  const avgOccupied = daysInRange > 0 ? Math.round(totalOccupied / daysInRange) : 0
  const avgOutOfOrder = daysInRange > 0 ? Math.round((totalOutOfOrder / daysInRange) * 10) / 10 : 0
  const avgAvailable = daysInRange > 0
    ? Math.round(((totalRooms * daysInRange - totalOccupied - totalOutOfOrder) / daysInRange) * 10) / 10
    : totalRooms

  // --- Previous period KPIs ---
  const prevTotalOccupied = prevEntries.reduce((s, e) => s + e.roomsOccupied, 0)
  const prevDaysInRange = prevEntries.length
  const prevTotalAvailable = totalRooms * prevDaysInRange

  const prevOccupancyPct = prevTotalAvailable > 0
    ? Math.round((prevTotalOccupied / prevTotalAvailable) * 10000) / 100
    : 0

  // Calendar heatmap for current month view
  const calendarData = useMemo(() => {
    const entryMap = new Map(entries.map(e => [e.date, e]))
    const start = new Date(dateRange.start)
    const end = new Date(dateRange.end)
    const days: { date: string; occupancyPct: number; dayOfWeek: number }[] = []

    const current = new Date(start)
    while (current <= end) {
      const dateStr = current.toISOString().slice(0, 10)
      const entry = entryMap.get(dateStr)
      const pct = entry && totalRooms > 0
        ? Math.round((entry.roomsOccupied / totalRooms) * 100)
        : 0
      days.push({ date: dateStr, occupancyPct: pct, dayOfWeek: current.getDay() })
      current.setDate(current.getDate() + 1)
    }
    return days
  }, [entries, dateRange, totalRooms])

  // --- Handlers ---

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const occupied = parseInt(roomsOccupied)
    const outOfOrder = parseInt(roomsOutOfOrder) || 0
    if (isNaN(occupied)) return
    if (totalRooms > 0 && (occupied + outOfOrder) > totalRooms) return
    setIsSubmitting(true)
    await save(`daily:${entryDate}`, {
      roomsOccupied: occupied,
      roomsOutOfOrder: outOfOrder,
      reason: outOfOrder > 0 ? oooReason : undefined,
    })
    setRoomsOccupied('')
    setRoomsOutOfOrder('')
    setOooReason('Underhall')
    await refresh()
    setIsSubmitting(false)
  }

  const openEditDialog = (entry: DailyEntry) => {
    setEditDate(entry.date)
    setEditOccupied(String(entry.roomsOccupied))
    setEditOoo(String(entry.roomsOutOfOrder))
    setEditReason(entry.reason ?? 'Underhall')
    setEditDialogOpen(true)
  }

  const handleSaveEdit = async () => {
    const occupied = parseInt(editOccupied)
    const outOfOrder = parseInt(editOoo) || 0
    if (isNaN(occupied)) return
    if (totalRooms > 0 && (occupied + outOfOrder) > totalRooms) return
    setIsSavingEdit(true)
    await save(`daily:${editDate}`, {
      roomsOccupied: occupied,
      roomsOutOfOrder: outOfOrder,
      reason: outOfOrder > 0 ? editReason : undefined,
    })
    await refresh()
    setIsSavingEdit(false)
  }

  const openDeleteDialog = (date: string) => {
    setDeleteDate(date)
    setDeleteDialogOpen(true)
  }

  const handleDelete = async () => {
    setIsDeleting(true)
    await remove(`daily:${deleteDate}`)
    setIsDeleting(false)
  }

  const handleSetup = async (values: Record<string, string>) => {
    await save('settings', { totalRooms: parseInt(values.totalRooms) || 0 })
  }

  const openSettingsDialog = () => {
    setNewTotalRooms(String(totalRooms))
    setSettingsDialogOpen(true)
  }

  const handleSaveSettings = async () => {
    const rooms = parseInt(newTotalRooms)
    if (isNaN(rooms) || rooms <= 0) return
    setIsSavingSettings(true)
    await save('settings', { totalRooms: rooms })
    await refresh()
    setIsSavingSettings(false)
  }

  if (isLoading) return <ExtensionLoadingSkeleton />

  if (!totalRooms) {
    return (
      <SetupPrompt
        title="Konfigurera belaggning"
        description="Ange antal rum pa hotellet for att borja spara belaggning."
        fields={[{ key: 'totalRooms', label: 'Antal rum', type: 'number', placeholder: 'T.ex. 50' }]}
        onSave={handleSetup}
      />
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <DateRangeFilter onRangeChange={(start, end) => setDateRange({ start, end })} />
        <Button variant="outline" size="sm" onClick={openSettingsDialog}>
          <Settings className="h-4 w-4 mr-1.5" />
          {totalRooms} rum
        </Button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard label="Belaggning" value={occupancyPct} suffix="%" />
        <KPICard label="Snitt belagda rum" value={avgOccupied} suffix={`/ ${totalRooms}`} />
        <KPICard label="Snitt ur drift" value={avgOutOfOrder} suffix="rum" />
        <KPICard label="Snitt lediga rum" value={avgAvailable} suffix="rum" />
      </div>

      {/* Period comparison */}
      <div className="rounded-xl border p-4">
        <h3 className="text-sm font-semibold mb-3">Periodjamforelse</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">Belaggning (nuvarande)</p>
            <div className="flex items-center gap-2">
              <span className="text-lg font-semibold tabular-nums">{occupancyPct}%</span>
              <DeltaArrow current={occupancyPct} previous={prevOccupancyPct} />
            </div>
          </div>
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">Belaggning (foregaende)</p>
            <span className="text-lg font-semibold tabular-nums">{prevOccupancyPct}%</span>
          </div>
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">Foregaende period</p>
            <span className="text-sm tabular-nums">{prevPeriod.start} — {prevPeriod.end}</span>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-3 pt-3 border-t">
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">Belagda rum (foregaende)</p>
            <span className="text-sm tabular-nums">
              {prevDaysInRange > 0
                ? Math.round(prevTotalOccupied / prevDaysInRange)
                : 0} snitt / dag
            </span>
          </div>
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">Dagar med data (foregaende)</p>
            <span className="text-sm tabular-nums">{prevDaysInRange} dagar</span>
          </div>
        </div>
      </div>

      {/* Entry form */}
      <DataEntryForm
        title="Registrera daglig belaggning"
        onSubmit={handleSubmit}
        submitLabel="Registrera"
        isSubmitting={isSubmitting || !formIsValid}
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="space-y-2">
            <Label htmlFor="occ-date">Datum</Label>
            <Input id="occ-date" type="date" value={entryDate} onChange={e => setEntryDate(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="occ-occupied">Belagda rum</Label>
            <Input
              id="occ-occupied"
              type="number"
              min="0"
              max={totalRooms}
              placeholder="0"
              value={roomsOccupied}
              onChange={e => setRoomsOccupied(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="occ-ooo">Ur drift</Label>
            <Input
              id="occ-ooo"
              type="number"
              min="0"
              placeholder="0"
              value={roomsOutOfOrder}
              onChange={e => setRoomsOutOfOrder(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="occ-reason">Orsak (ur drift)</Label>
            <Select value={oooReason} onValueChange={(val) => setOooReason(val as OooReason)}>
              <SelectTrigger id="occ-reason">
                <SelectValue placeholder="Valj orsak" />
              </SelectTrigger>
              <SelectContent>
                {OOO_REASONS.map(r => (
                  <SelectItem key={r} value={r}>{r}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        {formExceedsTotal && (
          <p className="text-sm text-red-600">
            Belagda rum ({formOccupied}) + ur drift ({formOoo}) = {formOccupied + formOoo} overstiger totalt antal rum ({totalRooms}).
          </p>
        )}
      </DataEntryForm>

      {/* Calendar heatmap */}
      {calendarData.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold mb-3">Belaggningskalender</h3>
          <div className="rounded-xl border p-4">
            <div className="grid grid-cols-7 gap-1 text-xs text-muted-foreground mb-2">
              {['Man', 'Tis', 'Ons', 'Tor', 'Fre', 'Lor', 'Son'].map(d => (
                <div key={d} className="text-center">{d}</div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-1">
              {/* Offset for first day of month */}
              {calendarData.length > 0 && Array.from({ length: (calendarData[0].dayOfWeek + 6) % 7 }).map((_, i) => (
                <div key={`empty-${i}`} className="aspect-square" />
              ))}
              {calendarData.map(day => (
                <div
                  key={day.date}
                  className={cn(
                    'aspect-square rounded-sm flex items-center justify-center text-xs',
                    getOccupancyColor(day.occupancyPct),
                    day.occupancyPct > 0 ? 'text-white' : 'text-muted-foreground'
                  )}
                  title={`${day.date}: ${day.occupancyPct}%`}
                >
                  {parseInt(day.date.slice(-2))}
                </div>
              ))}
            </div>
            <div className="flex items-center gap-4 mt-3 text-xs text-muted-foreground">
              <div className="flex items-center gap-1">
                <div className="w-3 h-3 rounded-sm bg-green-500" /> 80%+
              </div>
              <div className="flex items-center gap-1">
                <div className="w-3 h-3 rounded-sm bg-yellow-500" /> 50-79%
              </div>
              <div className="flex items-center gap-1">
                <div className="w-3 h-3 rounded-sm bg-red-500" /> 1-49%
              </div>
              <div className="flex items-center gap-1">
                <div className="w-3 h-3 rounded-sm bg-muted" /> Ingen data
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Daily data table */}
      <div>
        <h3 className="text-sm font-semibold mb-3">Daglig data</h3>
        {entries.length === 0 ? (
          <p className="text-sm text-muted-foreground">Ingen data registrerad i vald period.</p>
        ) : (
          <div className="rounded-xl border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Datum</TableHead>
                  <TableHead className="text-right">Belagda</TableHead>
                  <TableHead className="text-right">Ur drift</TableHead>
                  <TableHead>Orsak</TableHead>
                  <TableHead className="text-right">Lediga</TableHead>
                  <TableHead className="text-right">Belaggning</TableHead>
                  <TableHead className="w-20"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {entries.map(e => {
                  const pct = totalRooms > 0 ? Math.round((e.roomsOccupied / totalRooms) * 100) : 0
                  const available = totalRooms - e.roomsOccupied - e.roomsOutOfOrder
                  return (
                    <TableRow key={e.date}>
                      <TableCell className="font-medium">{e.date}</TableCell>
                      <TableCell className="text-right tabular-nums">{e.roomsOccupied} / {totalRooms}</TableCell>
                      <TableCell className="text-right tabular-nums">{e.roomsOutOfOrder}</TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {e.roomsOutOfOrder > 0 ? (e.reason ?? '-') : '-'}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{available}</TableCell>
                      <TableCell className="text-right tabular-nums">{pct}%</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-0.5">
                          <Button variant="ghost" size="sm" onClick={() => openEditDialog(e)}>
                            <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => openDeleteDialog(e.date)}>
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
        )}
      </div>

      {/* Edit entry dialog */}
      <EditEntryDialog
        open={editDialogOpen}
        onOpenChange={setEditDialogOpen}
        title="Redigera belaggning"
        description={`Andrar data for ${editDate}`}
        onSave={handleSaveEdit}
        isSaving={isSavingEdit}
      >
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="edit-date">Datum</Label>
            <Input id="edit-date" type="date" value={editDate} disabled />
          </div>
          <div className="space-y-2">
            <Label htmlFor="edit-occupied">Belagda rum</Label>
            <Input
              id="edit-occupied"
              type="number"
              min="0"
              max={totalRooms}
              value={editOccupied}
              onChange={e => setEditOccupied(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="edit-ooo">Ur drift</Label>
            <Input
              id="edit-ooo"
              type="number"
              min="0"
              value={editOoo}
              onChange={e => setEditOoo(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="edit-reason">Orsak (ur drift)</Label>
            <Select value={editReason} onValueChange={(val) => setEditReason(val as OooReason)}>
              <SelectTrigger id="edit-reason">
                <SelectValue placeholder="Valj orsak" />
              </SelectTrigger>
              <SelectContent>
                {OOO_REASONS.map(r => (
                  <SelectItem key={r} value={r}>{r}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {editExceedsTotal && (
            <p className="text-sm text-red-600">
              Belagda rum ({editOccupiedNum}) + ur drift ({editOooNum}) = {editOccupiedNum + editOooNum} overstiger totalt antal rum ({totalRooms}).
            </p>
          )}
        </div>
      </EditEntryDialog>

      {/* Confirm delete dialog */}
      <ConfirmDeleteDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        title="Ta bort belaggningsdata"
        description={`Vill du ta bort belaggningsdata for ${deleteDate}? Atgarden kan inte angras.`}
        onConfirm={handleDelete}
        isDeleting={isDeleting}
      />

      {/* Settings dialog */}
      <EditEntryDialog
        open={settingsDialogOpen}
        onOpenChange={setSettingsDialogOpen}
        title="Andra antal rum"
        description={`Nuvarande antal rum: ${totalRooms}`}
        onSave={handleSaveSettings}
        isSaving={isSavingSettings}
      >
        <div className="space-y-2">
          <Label htmlFor="settings-rooms">Totalt antal rum</Label>
          <Input
            id="settings-rooms"
            type="number"
            min="1"
            value={newTotalRooms}
            onChange={e => setNewTotalRooms(e.target.value)}
          />
        </div>
      </EditEntryDialog>
    </div>
  )
}
