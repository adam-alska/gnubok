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
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { Pencil, Trash2, ArrowUp, ArrowDown, Minus, Settings } from 'lucide-react'
import { validateMaxNumber, validatePositiveNumber } from '@/lib/extensions/validation'
import { cn } from '@/lib/utils'

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

function DeltaArrow({ current, previous, higherIsBetter = true }: {
  current: number
  previous: number
  higherIsBetter?: boolean
}) {
  const delta = Math.round((current - previous) * 100) / 100
  if (delta === 0 || (previous === 0 && current === 0)) {
    return (
      <span className="inline-flex items-center gap-0.5 text-xs text-muted-foreground">
        <Minus className="h-3 w-3" />
        <span>0</span>
      </span>
    )
  }
  const improving = higherIsBetter ? delta > 0 : delta < 0
  return (
    <span className={cn(
      'inline-flex items-center gap-0.5 text-xs',
      improving ? 'text-green-600' : 'text-red-600'
    )}>
      {delta > 0
        ? <ArrowUp className="h-3 w-3" />
        : <ArrowDown className="h-3 w-3" />
      }
      <span>{delta > 0 ? '+' : ''}{delta.toLocaleString('sv-SE')}</span>
    </span>
  )
}

interface DailyEntry {
  date: string
  roomsSold: number
  roomRevenue: number
}

function computeKPIs(entries: DailyEntry[], totalRooms: number) {
  const totalRevenue = entries.reduce((s, e) => s + e.roomRevenue, 0)
  const totalRoomsSold = entries.reduce((s, e) => s + e.roomsSold, 0)
  const daysInRange = entries.length
  const totalAvailableRooms = totalRooms * daysInRange

  const revpar = totalAvailableRooms > 0
    ? Math.round((totalRevenue / totalAvailableRooms) * 100) / 100
    : 0
  const adr = totalRoomsSold > 0
    ? Math.round((totalRevenue / totalRoomsSold) * 100) / 100
    : 0
  const occupancyPct = totalAvailableRooms > 0
    ? Math.round((totalRoomsSold / totalAvailableRooms) * 10000) / 100
    : 0

  return { totalRevenue, totalRoomsSold, revpar, adr, occupancyPct }
}

export default function RevparWorkspace({}: WorkspaceComponentProps) {
  const now = new Date()
  const [dateRange, setDateRange] = useState({
    start: new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10),
    end: new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10),
  })

  const prevPeriod = useMemo(
    () => computePreviousPeriod(dateRange.start, dateRange.end),
    [dateRange.start, dateRange.end]
  )

  const { data, save, remove, refresh, isLoading } = useExtensionData('hotel', 'revpar')
  const settings = data.find(d => d.key === 'settings')?.value as { totalRooms?: number } | undefined
  const totalRooms = settings?.totalRooms ?? 0

  // All daily entries (unfiltered by date, for period comparison)
  const allEntries = useMemo(() =>
    data.filter(d => d.key.startsWith('daily:'))
      .map(d => ({
        date: d.key.replace('daily:', ''),
        ...(d.value as { roomsSold: number; roomRevenue: number }),
      }))
  , [data])

  // Current period entries
  const entries = useMemo(() =>
    allEntries
      .filter(e => e.date >= dateRange.start && e.date <= dateRange.end)
      .sort((a, b) => b.date.localeCompare(a.date))
  , [allEntries, dateRange])

  // Previous period entries
  const prevEntries = useMemo(() =>
    allEntries
      .filter(e => e.date >= prevPeriod.start && e.date <= prevPeriod.end)
  , [allEntries, prevPeriod])

  // Form state
  const [entryDate, setEntryDate] = useState(now.toISOString().slice(0, 10))
  const [roomsSold, setRoomsSold] = useState('')
  const [roomRevenue, setRoomRevenue] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Edit dialog state
  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [editDate, setEditDate] = useState('')
  const [editRoomsSold, setEditRoomsSold] = useState('')
  const [editRoomRevenue, setEditRoomRevenue] = useState('')
  const [isSavingEdit, setIsSavingEdit] = useState(false)

  // Delete dialog state
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [deleteDate, setDeleteDate] = useState('')
  const [isDeleting, setIsDeleting] = useState(false)

  // Settings dialog state
  const [settingsDialogOpen, setSettingsDialogOpen] = useState(false)
  const [settingsRoomCount, setSettingsRoomCount] = useState('')
  const [isSavingSettings, setIsSavingSettings] = useState(false)

  // Current period KPIs
  const current = computeKPIs(entries, totalRooms)

  // Previous period KPIs
  const prev = computeKPIs(prevEntries, totalRooms)

  // --- Input validation ---
  const roomsSoldNum = parseInt(roomsSold)
  const roomRevenueNum = parseFloat(roomRevenue)
  const roomsSoldError = roomsSold !== ''
    ? validateMaxNumber(roomsSold, totalRooms)
      ? `Kan inte overskrida ${totalRooms} rum`
      : null
    : null
  const roomRevenueError = roomRevenue !== ''
    ? validatePositiveNumber(roomRevenue)
    : null
  const formValid = !isNaN(roomsSoldNum)
    && roomsSoldNum >= 0
    && roomsSoldNum <= totalRooms
    && !isNaN(roomRevenueNum)
    && roomRevenueNum > 0

  // Edit dialog validation
  const editRoomsSoldNum = parseInt(editRoomsSold)
  const editRoomRevenueNum = parseFloat(editRoomRevenue)
  const editRoomsSoldError = editRoomsSold !== ''
    ? validateMaxNumber(editRoomsSold, totalRooms)
      ? `Kan inte overskrida ${totalRooms} rum`
      : null
    : null
  const editRoomRevenueError = editRoomRevenue !== ''
    ? validatePositiveNumber(editRoomRevenue)
    : null
  const editFormValid = !isNaN(editRoomsSoldNum)
    && editRoomsSoldNum >= 0
    && editRoomsSoldNum <= totalRooms
    && !isNaN(editRoomRevenueNum)
    && editRoomRevenueNum > 0

  // Settings validation
  const settingsRoomCountNum = parseInt(settingsRoomCount)
  const settingsValid = !isNaN(settingsRoomCountNum) && settingsRoomCountNum > 0

  // Monthly trend with all three metrics
  const monthlyTrend = useMemo(() => {
    const map = new Map<string, { revenue: number; rooms: number; days: number }>()
    for (const e of entries) {
      const month = e.date.slice(0, 7)
      const existing = map.get(month) ?? { revenue: 0, rooms: 0, days: 0 }
      existing.revenue += e.roomRevenue
      existing.rooms += e.roomsSold
      existing.days++
      map.set(month, existing)
    }
    return Array.from(map.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, d]) => {
        const available = totalRooms * d.days
        return {
          month,
          revpar: available > 0 ? Math.round((d.revenue / available) * 100) / 100 : 0,
          adr: d.rooms > 0 ? Math.round((d.revenue / d.rooms) * 100) / 100 : 0,
          occupancy: available > 0 ? Math.round((d.rooms / available) * 10000) / 100 : 0,
        }
      })
  }, [entries, totalRooms])

  // --- Handlers ---

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!formValid) return
    setIsSubmitting(true)
    await save(`daily:${entryDate}`, { roomsSold: roomsSoldNum, roomRevenue: roomRevenueNum })
    setRoomsSold('')
    setRoomRevenue('')
    await refresh()
    setIsSubmitting(false)
  }

  const openEditDialog = (entry: DailyEntry) => {
    setEditDate(entry.date)
    setEditRoomsSold(String(entry.roomsSold))
    setEditRoomRevenue(String(entry.roomRevenue))
    setEditDialogOpen(true)
  }

  const handleSaveEdit = async () => {
    if (!editFormValid) return
    setIsSavingEdit(true)
    await save(`daily:${editDate}`, {
      roomsSold: editRoomsSoldNum,
      roomRevenue: editRoomRevenueNum,
    })
    await refresh()
    setIsSavingEdit(false)
  }

  const openDeleteDialog = (date: string) => {
    setDeleteDate(date)
    setDeleteDialogOpen(true)
  }

  const handleConfirmDelete = async () => {
    setIsDeleting(true)
    await remove(`daily:${deleteDate}`)
    setIsDeleting(false)
  }

  const openSettingsDialog = () => {
    setSettingsRoomCount(String(totalRooms))
    setSettingsDialogOpen(true)
  }

  const handleSaveSettings = async () => {
    if (!settingsValid) return
    setIsSavingSettings(true)
    await save('settings', { totalRooms: settingsRoomCountNum })
    await refresh()
    setIsSavingSettings(false)
  }

  const handleSetup = async (values: Record<string, string>) => {
    await save('settings', { totalRooms: parseInt(values.totalRooms) || 0 })
  }

  if (isLoading) return <ExtensionLoadingSkeleton />

  if (!totalRooms) {
    return (
      <SetupPrompt
        title="Konfigurera RevPAR"
        description="Ange antal rum pa hotellet for att borja berakna RevPAR."
        fields={[{ key: 'totalRooms', label: 'Antal rum', type: 'number', placeholder: 'T.ex. 50' }]}
        onSave={handleSetup}
      />
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <DateRangeFilter onRangeChange={(start, end) => setDateRange({ start, end })} />
        <Button variant="ghost" size="sm" onClick={openSettingsDialog}>
          <Settings className="h-4 w-4 mr-1.5" />
          {totalRooms} rum
        </Button>
      </div>

      {/* KPI Cards with delta indicators */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <KPICard label="RevPAR" value={current.revpar.toLocaleString('sv-SE')} suffix="kr" />
        <KPICard label="ADR" value={current.adr.toLocaleString('sv-SE')} suffix="kr" />
        <KPICard label="Belaggning" value={current.occupancyPct} suffix="%" />
        <KPICard label="Total intakt" value={current.totalRevenue.toLocaleString('sv-SE')} suffix="kr" />
      </div>

      {/* Period comparison */}
      <div className="rounded-xl border p-4">
        <h3 className="text-sm font-semibold mb-3">Periodjamforelse</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">RevPAR</p>
            <div className="flex items-center gap-2">
              <span className="text-lg font-semibold tabular-nums">
                {current.revpar.toLocaleString('sv-SE')} kr
              </span>
              <DeltaArrow current={current.revpar} previous={prev.revpar} higherIsBetter />
            </div>
            <p className="text-xs text-muted-foreground">
              Foregaende: {prev.revpar.toLocaleString('sv-SE')} kr
            </p>
          </div>
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">ADR</p>
            <div className="flex items-center gap-2">
              <span className="text-lg font-semibold tabular-nums">
                {current.adr.toLocaleString('sv-SE')} kr
              </span>
              <DeltaArrow current={current.adr} previous={prev.adr} higherIsBetter />
            </div>
            <p className="text-xs text-muted-foreground">
              Foregaende: {prev.adr.toLocaleString('sv-SE')} kr
            </p>
          </div>
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">Belaggning</p>
            <div className="flex items-center gap-2">
              <span className="text-lg font-semibold tabular-nums">
                {current.occupancyPct}%
              </span>
              <DeltaArrow current={current.occupancyPct} previous={prev.occupancyPct} higherIsBetter />
            </div>
            <p className="text-xs text-muted-foreground">
              Foregaende: {prev.occupancyPct}%
            </p>
          </div>
        </div>
        <div className="mt-3 pt-3 border-t">
          <p className="text-xs text-muted-foreground">
            Foregaende period: {prevPeriod.start} — {prevPeriod.end}
          </p>
        </div>
      </div>

      {/* Data entry form with validation */}
      <DataEntryForm
        title="Registrera daglig data"
        onSubmit={handleSubmit}
        submitLabel="Registrera"
        isSubmitting={isSubmitting || !formValid}
      >
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="space-y-2">
            <Label htmlFor="revpar-date">Datum</Label>
            <Input
              id="revpar-date"
              type="date"
              value={entryDate}
              onChange={e => setEntryDate(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="revpar-rooms">Rum salda</Label>
            <Input
              id="revpar-rooms"
              type="number"
              min="0"
              max={totalRooms}
              placeholder="0"
              value={roomsSold}
              onChange={e => setRoomsSold(e.target.value)}
              className={cn(roomsSoldError && 'border-red-500')}
            />
            {roomsSoldError && (
              <p className="text-xs text-red-600">{roomsSoldError}</p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="revpar-revenue">Rumsintakt (kr)</Label>
            <Input
              id="revpar-revenue"
              type="number"
              min="0"
              step="0.01"
              placeholder="0"
              value={roomRevenue}
              onChange={e => setRoomRevenue(e.target.value)}
              className={cn(roomRevenueError && 'border-red-500')}
            />
            {roomRevenueError && (
              <p className="text-xs text-red-600">{roomRevenueError}</p>
            )}
          </div>
        </div>
      </DataEntryForm>

      {/* Monthly trend with RevPAR, ADR, Occupancy */}
      {monthlyTrend.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold mb-3">Manadstrend</h3>
          <div className="rounded-xl border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Period</TableHead>
                  <TableHead className="text-right">RevPAR</TableHead>
                  <TableHead className="text-right">ADR</TableHead>
                  <TableHead className="text-right">Belaggning</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {monthlyTrend.map(row => (
                  <TableRow key={row.month}>
                    <TableCell className="font-medium">{row.month}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {row.revpar.toLocaleString('sv-SE')} kr
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {row.adr.toLocaleString('sv-SE')} kr
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {row.occupancy}%
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      {/* Daily data table with edit and delete */}
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
                  <TableHead className="text-right">Rum salda</TableHead>
                  <TableHead className="text-right">Intakt</TableHead>
                  <TableHead className="text-right">ADR</TableHead>
                  <TableHead className="w-20"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {entries.map(e => (
                  <TableRow key={e.date}>
                    <TableCell className="font-medium">{e.date}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {e.roomsSold} / {totalRooms}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {e.roomRevenue.toLocaleString('sv-SE')} kr
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {e.roomsSold > 0
                        ? Math.round(e.roomRevenue / e.roomsSold).toLocaleString('sv-SE')
                        : 0} kr
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => openEditDialog(e)}
                        >
                          <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => openDeleteDialog(e.date)}
                        >
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

      {/* Edit entry dialog */}
      <EditEntryDialog
        open={editDialogOpen}
        onOpenChange={setEditDialogOpen}
        title="Redigera daglig data"
        description={`Redigera data for ${editDate}`}
        onSave={handleSaveEdit}
        isSaving={isSavingEdit}
      >
        <div className="grid grid-cols-1 gap-4">
          <div className="space-y-2">
            <Label htmlFor="edit-date">Datum</Label>
            <Input
              id="edit-date"
              type="date"
              value={editDate}
              disabled
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="edit-rooms">Rum salda</Label>
            <Input
              id="edit-rooms"
              type="number"
              min="0"
              max={totalRooms}
              value={editRoomsSold}
              onChange={e => setEditRoomsSold(e.target.value)}
              className={cn(editRoomsSoldError && 'border-red-500')}
            />
            {editRoomsSoldError && (
              <p className="text-xs text-red-600">{editRoomsSoldError}</p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="edit-revenue">Rumsintakt (kr)</Label>
            <Input
              id="edit-revenue"
              type="number"
              min="0"
              step="0.01"
              value={editRoomRevenue}
              onChange={e => setEditRoomRevenue(e.target.value)}
              className={cn(editRoomRevenueError && 'border-red-500')}
            />
            {editRoomRevenueError && (
              <p className="text-xs text-red-600">{editRoomRevenueError}</p>
            )}
          </div>
        </div>
      </EditEntryDialog>

      {/* Confirm delete dialog */}
      <ConfirmDeleteDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        title="Ta bort registrering"
        description={`Vill du ta bort data for ${deleteDate}? Atgarden kan inte angras.`}
        onConfirm={handleConfirmDelete}
        isDeleting={isDeleting}
      />

      {/* Settings dialog */}
      <EditEntryDialog
        open={settingsDialogOpen}
        onOpenChange={setSettingsDialogOpen}
        title="Installningar"
        description="Andra antal rum pa hotellet."
        onSave={handleSaveSettings}
        isSaving={isSavingSettings}
      >
        <div className="space-y-2">
          <Label htmlFor="settings-rooms">Antal rum</Label>
          <Input
            id="settings-rooms"
            type="number"
            min="1"
            value={settingsRoomCount}
            onChange={e => setSettingsRoomCount(e.target.value)}
          />
          {settingsRoomCount !== '' && !settingsValid && (
            <p className="text-xs text-red-600">Ange ett giltigt antal rum (minst 1)</p>
          )}
        </div>
      </EditEntryDialog>
    </div>
  )
}
