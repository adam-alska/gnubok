'use client'

import { useState, useMemo, useCallback } from 'react'
import type { WorkspaceComponentProps } from '@/lib/extensions/workspace-registry'
import { useExtensionData } from '@/lib/extensions/use-extension-data'
import KPICard from '@/components/extensions/shared/KPICard'
import DateRangeFilter from '@/components/extensions/shared/DateRangeFilter'
import SetupPrompt from '@/components/extensions/shared/SetupPrompt'
import DataEntryForm from '@/components/extensions/shared/DataEntryForm'
import ExtensionLoadingSkeleton from '@/components/extensions/shared/ExtensionLoadingSkeleton'
import ConfirmDeleteDialog from '@/components/extensions/shared/ConfirmDeleteDialog'
import EditEntryDialog from '@/components/extensions/shared/EditEntryDialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog'
import { Pencil, Plus, Trash2, ArrowUp, ArrowDown, Minus, TrendingUp } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Channel {
  name: string
  color: string
}

interface RevenueEntry {
  id: string
  month: string
  channel: string
  revenue: number
  orderCount: number
}

const DEFAULT_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899']

const COLOR_PRESETS = [
  '#3b82f6', '#10b981', '#f59e0b', '#ef4444',
  '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16',
]

type SortMode = 'revenue' | 'growth'

function formatCurrency(value: number): string {
  return Math.round(value * 100) / 100 === 0
    ? '0'
    : (Math.round(value * 100) / 100).toLocaleString('sv-SE')
}

function formatAOV(revenue: number, orders: number): string {
  if (orders <= 0) return '-'
  return Math.round(revenue / orders).toLocaleString('sv-SE')
}

function GrowthIndicator({ current, previous }: { current: number; previous: number }) {
  if (previous === 0 && current === 0) {
    return (
      <span className="inline-flex items-center gap-0.5 text-xs text-muted-foreground">
        <Minus className="h-3 w-3" />
        <span>0%</span>
      </span>
    )
  }
  if (previous === 0) {
    return (
      <span className="inline-flex items-center gap-0.5 text-xs text-green-600">
        <ArrowUp className="h-3 w-3" />
        <span>Ny</span>
      </span>
    )
  }
  const pctChange = Math.round(((current - previous) / previous) * 1000) / 10
  if (pctChange === 0) {
    return (
      <span className="inline-flex items-center gap-0.5 text-xs text-muted-foreground">
        <Minus className="h-3 w-3" />
        <span>0%</span>
      </span>
    )
  }
  const improving = pctChange > 0
  return (
    <span className={cn(
      'inline-flex items-center gap-0.5 text-xs',
      improving ? 'text-green-600' : 'text-red-600'
    )}>
      {improving
        ? <ArrowUp className="h-3 w-3" />
        : <ArrowDown className="h-3 w-3" />
      }
      <span>{pctChange > 0 ? '+' : ''}{pctChange}%</span>
    </span>
  )
}

export default function MultichannelRevenueWorkspace({}: WorkspaceComponentProps) {
  const now = new Date()
  const [dateRange, setDateRange] = useState({
    start: new Date(now.getFullYear(), 0, 1).toISOString().slice(0, 10),
    end: new Date(now.getFullYear(), 11, 31).toISOString().slice(0, 10),
  })

  const { data, save, remove, refresh, isLoading } = useExtensionData('ecommerce', 'multichannel-revenue')

  const channels = useMemo(() => {
    const s = data.find(d => d.key === 'settings')?.value as { channels?: Channel[] } | undefined
    return s?.channels ?? []
  }, [data])

  // All entries (unfiltered by date, needed for previous period comparison)
  const allEntries = useMemo(() =>
    data.filter(d => d.key.startsWith('entry:'))
      .map(d => ({
        id: d.key.replace('entry:', ''),
        ...(d.value as Omit<RevenueEntry, 'id'>),
      }))
  , [data])

  // Entries filtered to current date range
  const entries = useMemo(() =>
    allEntries
      .filter(e => {
        const eStart = e.month + '-01'
        const eEnd = e.month + '-31'
        return eEnd >= dateRange.start && eStart <= dateRange.end
      })
      .sort((a, b) => b.month.localeCompare(a.month))
  , [allEntries, dateRange])

  // Previous year entries for the same period
  const prevYearEntries = useMemo(() => {
    const startDate = new Date(dateRange.start + 'T00:00:00')
    const endDate = new Date(dateRange.end + 'T00:00:00')
    const prevStart = new Date(startDate)
    prevStart.setFullYear(prevStart.getFullYear() - 1)
    const prevEnd = new Date(endDate)
    prevEnd.setFullYear(prevEnd.getFullYear() - 1)
    const prevStartStr = prevStart.toISOString().slice(0, 10)
    const prevEndStr = prevEnd.toISOString().slice(0, 10)
    return allEntries.filter(e => {
      const eStart = e.month + '-01'
      const eEnd = e.month + '-31'
      return eEnd >= prevStartStr && eStart <= prevEndStr
    })
  }, [allEntries, dateRange])

  // Form state
  const [entryMonth, setEntryMonth] = useState(now.toISOString().slice(0, 7))
  const [selectedChannel, setEntryChannel] = useState('')
  const entryChannel = selectedChannel || (channels.length > 0 ? channels[0].name : '')
  const [entryRevenue, setEntryRevenue] = useState('')
  const [entryOrders, setEntryOrders] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Channel management
  const [newChannelName, setNewChannelName] = useState('')
  const [sortMode, setSortMode] = useState<SortMode>('revenue')

  // Duplicate confirmation dialog state
  const [duplicateDialogOpen, setDuplicateDialogOpen] = useState(false)
  const [pendingEntry, setPendingEntry] = useState<{
    month: string; channel: string; revenue: number; orderCount: number; existingId: string
  } | null>(null)

  // Edit entry dialog state
  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [editingEntry, setEditingEntry] = useState<RevenueEntry | null>(null)
  const [editMonth, setEditMonth] = useState('')
  const [editChannel, setEditChannel] = useState('')
  const [editRevenue, setEditRevenue] = useState('')
  const [editOrders, setEditOrders] = useState('')
  const [isSavingEdit, setIsSavingEdit] = useState(false)

  // Delete entry dialog state
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [deletingEntryId, setDeletingEntryId] = useState<string | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)

  // Rename channel dialog state
  const [renameDialogOpen, setRenameDialogOpen] = useState(false)
  const [renamingChannel, setRenamingChannel] = useState<string | null>(null)
  const [newName, setNewName] = useState('')
  const [isSavingRename, setIsSavingRename] = useState(false)

  // Color picker state
  const [colorPickerChannel, setColorPickerChannel] = useState<string | null>(null)

  // ---- Computed values ----

  const totalRevenue = entries.reduce((s, e) => s + e.revenue, 0)
  const totalOrders = entries.reduce((s, e) => s + e.orderCount, 0)
  const overallAOV = totalOrders > 0 ? Math.round(totalRevenue / totalOrders) : 0

  const prevYearTotalRevenue = prevYearEntries.reduce((s, e) => s + e.revenue, 0)

  // Channel totals for current period
  const channelTotals = useMemo(() => {
    const map = new Map<string, { revenue: number; orders: number }>()
    for (const e of entries) {
      const existing = map.get(e.channel) ?? { revenue: 0, orders: 0 }
      existing.revenue += e.revenue
      existing.orders += e.orderCount
      map.set(e.channel, existing)
    }
    return Array.from(map.entries())
      .map(([channel, d]) => ({ channel, ...d }))
  }, [entries])

  // Channel totals for previous year period
  const prevYearChannelTotals = useMemo(() => {
    const map = new Map<string, { revenue: number; orders: number }>()
    for (const e of prevYearEntries) {
      const existing = map.get(e.channel) ?? { revenue: 0, orders: 0 }
      existing.revenue += e.revenue
      existing.orders += e.orderCount
      map.set(e.channel, existing)
    }
    return map
  }, [prevYearEntries])

  // Growth rate per channel
  const channelGrowth = useMemo(() => {
    const growth = new Map<string, number>()
    for (const ct of channelTotals) {
      const prev = prevYearChannelTotals.get(ct.channel)
      const prevRev = prev?.revenue ?? 0
      if (prevRev > 0) {
        growth.set(ct.channel, ((ct.revenue - prevRev) / prevRev) * 100)
      } else if (ct.revenue > 0) {
        growth.set(ct.channel, Infinity) // New channel
      } else {
        growth.set(ct.channel, 0)
      }
    }
    return growth
  }, [channelTotals, prevYearChannelTotals])

  // Sorted channel totals based on sort mode
  const sortedChannelTotals = useMemo(() => {
    const sorted = [...channelTotals]
    if (sortMode === 'growth') {
      sorted.sort((a, b) => {
        const growthA = channelGrowth.get(a.channel) ?? 0
        const growthB = channelGrowth.get(b.channel) ?? 0
        // Infinity (new channels) goes to the top
        if (growthA === Infinity && growthB !== Infinity) return -1
        if (growthB === Infinity && growthA !== Infinity) return 1
        return growthB - growthA
      })
    } else {
      sorted.sort((a, b) => b.revenue - a.revenue)
    }
    return sorted
  }, [channelTotals, sortMode, channelGrowth])

  const bestChannel = useMemo(() => {
    const sorted = [...channelTotals].sort((a, b) => b.revenue - a.revenue)
    return sorted[0]?.channel ?? '-'
  }, [channelTotals])

  // Monthly comparison (months as rows, channels as columns)
  const monthlyComparison = useMemo(() => {
    const monthMap = new Map<string, Map<string, { revenue: number; orders: number }>>()
    for (const e of entries) {
      if (!monthMap.has(e.month)) monthMap.set(e.month, new Map())
      const channelMap = monthMap.get(e.month)!
      const existing = channelMap.get(e.channel) ?? { revenue: 0, orders: 0 }
      existing.revenue += e.revenue
      existing.orders += e.orderCount
      channelMap.set(e.channel, existing)
    }
    return Array.from(monthMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, channelData]) => ({
        month,
        channels: Object.fromEntries(
          Array.from(channelData.entries()).map(([ch, d]) => [ch, d])
        ) as Record<string, { revenue: number; orders: number }>,
        total: Array.from(channelData.values()).reduce((s, v) => s + v.revenue, 0),
        totalOrders: Array.from(channelData.values()).reduce((s, v) => s + v.orders, 0),
      }))
  }, [entries])

  // Channel bar chart (CSS-based)
  const maxChannelRevenue = Math.max(...sortedChannelTotals.map(c => c.revenue), 1)

  // ---- Handlers ----

  const findDuplicateEntry = useCallback((month: string, channel: string) => {
    return allEntries.find(e => e.month === month && e.channel === channel) ?? null
  }, [allEntries])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const rev = parseFloat(entryRevenue)
    const orders = parseInt(entryOrders) || 0
    if (isNaN(rev) || rev <= 0 || !entryChannel) return

    // Check for duplicate
    const existing = findDuplicateEntry(entryMonth, entryChannel)
    if (existing) {
      setPendingEntry({
        month: entryMonth,
        channel: entryChannel,
        revenue: rev,
        orderCount: orders,
        existingId: existing.id,
      })
      setDuplicateDialogOpen(true)
      return
    }

    setIsSubmitting(true)
    const id = crypto.randomUUID()
    await save(`entry:${id}`, {
      month: entryMonth,
      channel: entryChannel,
      revenue: rev,
      orderCount: orders,
    })
    setEntryRevenue('')
    setEntryOrders('')
    await refresh()
    setIsSubmitting(false)
  }

  const handleDuplicateUpdate = async () => {
    if (!pendingEntry) return
    setIsSubmitting(true)
    await save(`entry:${pendingEntry.existingId}`, {
      month: pendingEntry.month,
      channel: pendingEntry.channel,
      revenue: pendingEntry.revenue,
      orderCount: pendingEntry.orderCount,
    })
    setEntryRevenue('')
    setEntryOrders('')
    setDuplicateDialogOpen(false)
    setPendingEntry(null)
    await refresh()
    setIsSubmitting(false)
  }

  const handleDuplicateCreateNew = async () => {
    if (!pendingEntry) return
    setIsSubmitting(true)
    const id = crypto.randomUUID()
    await save(`entry:${id}`, {
      month: pendingEntry.month,
      channel: pendingEntry.channel,
      revenue: pendingEntry.revenue,
      orderCount: pendingEntry.orderCount,
    })
    setEntryRevenue('')
    setEntryOrders('')
    setDuplicateDialogOpen(false)
    setPendingEntry(null)
    await refresh()
    setIsSubmitting(false)
  }

  const handleAddChannel = async () => {
    if (!newChannelName.trim()) return
    const color = DEFAULT_COLORS[channels.length % DEFAULT_COLORS.length]
    const updated = [...channels, { name: newChannelName.trim(), color }]
    await save('settings', { channels: updated })
    setNewChannelName('')
  }

  const handleRemoveChannel = async (name: string) => {
    const updated = channels.filter(c => c.name !== name)
    await save('settings', { channels: updated })
  }

  const handleChangeChannelColor = async (channelName: string, color: string) => {
    const updated = channels.map(c =>
      c.name === channelName ? { ...c, color } : c
    )
    await save('settings', { channels: updated })
    setColorPickerChannel(null)
  }

  const handleStartRename = (channelName: string) => {
    setRenamingChannel(channelName)
    setNewName(channelName)
    setRenameDialogOpen(true)
  }

  const handleRenameChannel = async () => {
    if (!renamingChannel || !newName.trim() || newName.trim() === renamingChannel) return
    setIsSavingRename(true)
    const trimmedName = newName.trim()

    // Update channel settings
    const updatedChannels = channels.map(c =>
      c.name === renamingChannel ? { ...c, name: trimmedName } : c
    )
    await save('settings', { channels: updatedChannels })

    // Update all entries that reference the old channel name
    const entriesToUpdate = allEntries.filter(e => e.channel === renamingChannel)
    for (const entry of entriesToUpdate) {
      await save(`entry:${entry.id}`, {
        month: entry.month,
        channel: trimmedName,
        revenue: entry.revenue,
        orderCount: entry.orderCount,
      })
    }

    setIsSavingRename(false)
    setRenameDialogOpen(false)
    setRenamingChannel(null)
    setNewName('')
    await refresh()
  }

  const handleStartEdit = (entry: RevenueEntry) => {
    setEditingEntry(entry)
    setEditMonth(entry.month)
    setEditChannel(entry.channel)
    setEditRevenue(String(entry.revenue))
    setEditOrders(String(entry.orderCount))
    setEditDialogOpen(true)
  }

  const handleSaveEdit = async () => {
    if (!editingEntry) return
    const rev = parseFloat(editRevenue)
    const orders = parseInt(editOrders) || 0
    if (isNaN(rev) || rev <= 0 || !editChannel) return
    setIsSavingEdit(true)
    await save(`entry:${editingEntry.id}`, {
      month: editMonth,
      channel: editChannel,
      revenue: rev,
      orderCount: orders,
    })
    setIsSavingEdit(false)
    setEditDialogOpen(false)
    setEditingEntry(null)
    await refresh()
  }

  const handleStartDelete = (entryId: string) => {
    setDeletingEntryId(entryId)
    setDeleteDialogOpen(true)
  }

  const handleConfirmDelete = async () => {
    if (!deletingEntryId) return
    setIsDeleting(true)
    await remove(`entry:${deletingEntryId}`)
    setIsDeleting(false)
    setDeleteDialogOpen(false)
    setDeletingEntryId(null)
  }

  const handleSetup = async (values: Record<string, string>) => {
    const names = values.channels.split(',').map(n => n.trim()).filter(Boolean)
    const channelList = names.map((name, i) => ({
      name,
      color: DEFAULT_COLORS[i % DEFAULT_COLORS.length],
    }))
    await save('settings', { channels: channelList })
  }

  if (isLoading) return <ExtensionLoadingSkeleton />

  if (channels.length === 0) {
    return (
      <SetupPrompt
        title="Konfigurera kanaler"
        description="Ange dina forsaljningskanaler (kommaseparerade, t.ex. Webshop, Amazon, Fysisk butik)."
        fields={[{ key: 'channels', label: 'Kanaler', type: 'text', placeholder: 'Webshop, Amazon, Fysisk butik' }]}
        onSave={handleSetup}
      />
    )
  }

  return (
    <div className="space-y-6">
      <DateRangeFilter onRangeChange={(start, end) => setDateRange({ start, end })} />

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <KPICard
          label="Total intakt"
          value={formatCurrency(totalRevenue)}
          suffix="kr"
          trend={prevYearTotalRevenue > 0 ? {
            value: Math.round(((totalRevenue - prevYearTotalRevenue) / prevYearTotalRevenue) * 1000) / 10,
            label: 'mot fg ar',
          } : undefined}
        />
        <KPICard label="Basta kanal" value={bestChannel} />
        <KPICard
          label="Genomsnittligt ordervarde"
          value={overallAOV > 0 ? overallAOV.toLocaleString('sv-SE') : '-'}
          suffix={overallAOV > 0 ? 'kr' : undefined}
        />
        <KPICard label="Antal kanaler" value={channels.length} />
      </div>

      {/* Channel management */}
      <div className="rounded-xl border p-4">
        <h3 className="text-sm font-semibold mb-3">Kanaler</h3>
        <div className="flex flex-wrap gap-2 mb-3">
          {channels.map(ch => (
            <div key={ch.name} className="relative flex items-center gap-1.5 rounded-md border px-2 py-1 text-sm">
              {/* Color swatch - clickable for color picker */}
              <button
                type="button"
                className="w-3 h-3 rounded-full border border-black/10 cursor-pointer hover:ring-2 hover:ring-offset-1 hover:ring-primary/30"
                style={{ backgroundColor: ch.color }}
                onClick={() => setColorPickerChannel(
                  colorPickerChannel === ch.name ? null : ch.name
                )}
                title="Byt farg"
              />
              <span>{ch.name}</span>
              <Button
                variant="ghost"
                size="sm"
                className="h-5 w-5 p-0"
                onClick={() => handleStartRename(ch.name)}
                title="Byt namn"
              >
                <Pencil className="h-3 w-3 text-muted-foreground" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-5 w-5 p-0"
                onClick={() => handleRemoveChannel(ch.name)}
                title="Ta bort kanal"
              >
                <Trash2 className="h-3 w-3 text-muted-foreground" />
              </Button>

              {/* Color picker dropdown */}
              {colorPickerChannel === ch.name && (
                <div className="absolute top-full left-0 mt-1 z-10 rounded-md border bg-popover p-2 shadow-md">
                  <div className="grid grid-cols-4 gap-1.5">
                    {COLOR_PRESETS.map(color => (
                      <button
                        key={color}
                        type="button"
                        className={cn(
                          'w-6 h-6 rounded-full border-2 cursor-pointer hover:scale-110 transition-transform',
                          ch.color === color ? 'border-foreground' : 'border-transparent'
                        )}
                        style={{ backgroundColor: color }}
                        onClick={() => handleChangeChannelColor(ch.name, color)}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
        <div className="flex gap-2">
          <Input
            placeholder="Ny kanal"
            value={newChannelName}
            onChange={e => setNewChannelName(e.target.value)}
            className="max-w-xs"
            onKeyDown={e => {
              if (e.key === 'Enter') {
                e.preventDefault()
                handleAddChannel()
              }
            }}
          />
          <Button size="sm" variant="outline" onClick={handleAddChannel} disabled={!newChannelName.trim()}>
            <Plus className="h-4 w-4 mr-1" /> Lagg till
          </Button>
        </div>
      </div>

      {/* Entry form */}
      <DataEntryForm
        title="Registrera manadsdata"
        onSubmit={handleSubmit}
        submitLabel="Registrera"
        isSubmitting={isSubmitting}
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Manad</Label>
            <Input type="month" value={entryMonth} onChange={e => setEntryMonth(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Kanal</Label>
            <Select value={entryChannel} onValueChange={setEntryChannel}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {channels.map(c => <SelectItem key={c.name} value={c.name}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Intakt (kr)</Label>
            <Input type="number" min="0" placeholder="0" value={entryRevenue} onChange={e => setEntryRevenue(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Antal ordrar</Label>
            <Input type="number" min="0" placeholder="0" value={entryOrders} onChange={e => setEntryOrders(e.target.value)} />
          </div>
        </div>
      </DataEntryForm>

      {/* Duplicate confirmation dialog */}
      <Dialog open={duplicateDialogOpen} onOpenChange={setDuplicateDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Post finns redan</DialogTitle>
            <DialogDescription>
              Det finns redan en post for {pendingEntry?.channel} i {pendingEntry?.month}.
              Vill du uppdatera den befintliga posten eller skapa en ny?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-col gap-2 sm:flex-row">
            <Button variant="outline" onClick={() => setDuplicateDialogOpen(false)} disabled={isSubmitting}>
              Avbryt
            </Button>
            <Button variant="secondary" onClick={handleDuplicateCreateNew} disabled={isSubmitting}>
              Skapa ny
            </Button>
            <Button onClick={handleDuplicateUpdate} disabled={isSubmitting}>
              {isSubmitting ? 'Sparar...' : 'Uppdatera befintlig'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Channel comparison bar chart */}
      {sortedChannelTotals.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold">Kanaljamforelse</h3>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Sortera:</span>
              <Button
                size="sm"
                variant={sortMode === 'revenue' ? 'default' : 'outline'}
                className="h-7 text-xs px-2"
                onClick={() => setSortMode('revenue')}
              >
                Intakt
              </Button>
              <Button
                size="sm"
                variant={sortMode === 'growth' ? 'default' : 'outline'}
                className="h-7 text-xs px-2"
                onClick={() => setSortMode('growth')}
              >
                <TrendingUp className="h-3 w-3 mr-1" />
                Tillvaxt
              </Button>
            </div>
          </div>
          <div className="rounded-xl border p-4 space-y-3">
            {sortedChannelTotals.map(ct => {
              const channelConfig = channels.find(c => c.name === ct.channel)
              const barWidth = Math.round((ct.revenue / maxChannelRevenue) * 100)
              const prevData = prevYearChannelTotals.get(ct.channel)
              const prevRev = prevData?.revenue ?? 0
              const aov = ct.orders > 0 ? Math.round(ct.revenue / ct.orders) : 0
              return (
                <div key={ct.channel} className="space-y-1">
                  <div className="flex justify-between text-sm">
                    <span className="font-medium">{ct.channel}</span>
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-muted-foreground">
                        AOV: {aov > 0 ? aov.toLocaleString('sv-SE') + ' kr' : '-'}
                      </span>
                      <GrowthIndicator current={ct.revenue} previous={prevRev} />
                      <span className="tabular-nums">{formatCurrency(ct.revenue)} kr</span>
                    </div>
                  </div>
                  <div className="h-6 w-full rounded bg-muted overflow-hidden">
                    <div
                      className="h-full rounded transition-all"
                      style={{
                        width: `${barWidth}%`,
                        backgroundColor: channelConfig?.color ?? '#3b82f6',
                      }}
                    />
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Entries table with edit/delete */}
      {entries.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold mb-3">Registrerade poster</h3>
          <div className="rounded-xl border overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Manad</TableHead>
                  <TableHead>Kanal</TableHead>
                  <TableHead className="text-right">Intakt</TableHead>
                  <TableHead className="text-right">Ordrar</TableHead>
                  <TableHead className="text-right">AOV</TableHead>
                  <TableHead className="text-right w-[80px]">Atgarder</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {entries.map(entry => {
                  const channelConfig = channels.find(c => c.name === entry.channel)
                  return (
                    <TableRow
                      key={entry.id}
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => handleStartEdit(entry)}
                    >
                      <TableCell className="font-medium">{entry.month}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1.5">
                          <div
                            className="w-2.5 h-2.5 rounded-full"
                            style={{ backgroundColor: channelConfig?.color ?? '#3b82f6' }}
                          />
                          {entry.channel}
                        </div>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatCurrency(entry.revenue)} kr
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {entry.orderCount}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatAOV(entry.revenue, entry.orderCount)} {entry.orderCount > 0 ? 'kr' : ''}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1" onClick={e => e.stopPropagation()}>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0"
                            onClick={() => handleStartEdit(entry)}
                            title="Redigera"
                          >
                            <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0"
                            onClick={() => handleStartDelete(entry.id)}
                            title="Ta bort"
                          >
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
        </div>
      )}

      {/* Monthly comparison table */}
      {monthlyComparison.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold mb-3">Manadsjamforelse</h3>
          <div className="rounded-xl border overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Manad</TableHead>
                  {channels.map(ch => (
                    <TableHead key={ch.name} className="text-right">{ch.name}</TableHead>
                  ))}
                  <TableHead className="text-right font-semibold">Total</TableHead>
                  <TableHead className="text-right">AOV</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {monthlyComparison.map(row => (
                  <TableRow key={row.month}>
                    <TableCell className="font-medium">{row.month}</TableCell>
                    {channels.map(ch => {
                      const chData = row.channels[ch.name]
                      return (
                        <TableCell key={ch.name} className="text-right tabular-nums">
                          {chData ? formatCurrency(chData.revenue) : '0'}
                        </TableCell>
                      )
                    })}
                    <TableCell className="text-right tabular-nums font-semibold">
                      {formatCurrency(row.total)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {row.totalOrders > 0
                        ? Math.round(row.total / row.totalOrders).toLocaleString('sv-SE') + ' kr'
                        : '-'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      {/* Period comparison: previous year */}
      {(prevYearEntries.length > 0 || channelTotals.length > 0) && (
        <div>
          <h3 className="text-sm font-semibold mb-3">Arsjamforelse per kanal</h3>
          <div className="rounded-xl border overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Kanal</TableHead>
                  <TableHead className="text-right">Nuvarande period</TableHead>
                  <TableHead className="text-right">Foregaende ar</TableHead>
                  <TableHead className="text-right">Tillvaxt</TableHead>
                  <TableHead className="text-right">AOV (nu)</TableHead>
                  <TableHead className="text-right">AOV (fg ar)</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedChannelTotals.map(ct => {
                  const prevData = prevYearChannelTotals.get(ct.channel)
                  const prevRev = prevData?.revenue ?? 0
                  const prevOrd = prevData?.orders ?? 0
                  return (
                    <TableRow key={ct.channel}>
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-1.5">
                          <div
                            className="w-2.5 h-2.5 rounded-full"
                            style={{ backgroundColor: channels.find(c => c.name === ct.channel)?.color ?? '#3b82f6' }}
                          />
                          {ct.channel}
                        </div>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatCurrency(ct.revenue)} kr
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {prevRev > 0 ? formatCurrency(prevRev) + ' kr' : '-'}
                      </TableCell>
                      <TableCell className="text-right">
                        <GrowthIndicator current={ct.revenue} previous={prevRev} />
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatAOV(ct.revenue, ct.orders)} {ct.orders > 0 ? 'kr' : ''}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatAOV(prevRev, prevOrd)} {prevOrd > 0 ? 'kr' : ''}
                      </TableCell>
                    </TableRow>
                  )
                })}
                {/* Totals row */}
                <TableRow className="border-t-2 font-semibold">
                  <TableCell>Totalt</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatCurrency(totalRevenue)} kr
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {prevYearTotalRevenue > 0 ? formatCurrency(prevYearTotalRevenue) + ' kr' : '-'}
                  </TableCell>
                  <TableCell className="text-right">
                    <GrowthIndicator current={totalRevenue} previous={prevYearTotalRevenue} />
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {overallAOV > 0 ? overallAOV.toLocaleString('sv-SE') + ' kr' : '-'}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {(() => {
                      const prevTotalOrders = prevYearEntries.reduce((s, e) => s + e.orderCount, 0)
                      return prevTotalOrders > 0
                        ? Math.round(prevYearTotalRevenue / prevTotalOrders).toLocaleString('sv-SE') + ' kr'
                        : '-'
                    })()}
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      {/* Edit entry dialog */}
      <EditEntryDialog
        open={editDialogOpen}
        onOpenChange={setEditDialogOpen}
        title="Redigera post"
        description={editingEntry ? `${editingEntry.channel} - ${editingEntry.month}` : undefined}
        onSave={handleSaveEdit}
        isSaving={isSavingEdit}
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="edit-month">Manad</Label>
            <Input
              id="edit-month"
              type="month"
              value={editMonth}
              onChange={e => setEditMonth(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="edit-channel">Kanal</Label>
            <Select value={editChannel} onValueChange={setEditChannel}>
              <SelectTrigger id="edit-channel"><SelectValue /></SelectTrigger>
              <SelectContent>
                {channels.map(c => (
                  <SelectItem key={c.name} value={c.name}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="edit-revenue">Intakt (kr)</Label>
            <Input
              id="edit-revenue"
              type="number"
              min="0"
              value={editRevenue}
              onChange={e => setEditRevenue(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="edit-orders">Antal ordrar</Label>
            <Input
              id="edit-orders"
              type="number"
              min="0"
              value={editOrders}
              onChange={e => setEditOrders(e.target.value)}
            />
          </div>
        </div>
      </EditEntryDialog>

      {/* Delete confirmation dialog */}
      <ConfirmDeleteDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        title="Ta bort post"
        description="Ar du saker pa att du vill ta bort denna intaktspost? Atgarden kan inte angras."
        onConfirm={handleConfirmDelete}
        isDeleting={isDeleting}
      />

      {/* Rename channel dialog */}
      <EditEntryDialog
        open={renameDialogOpen}
        onOpenChange={setRenameDialogOpen}
        title="Byt namn pa kanal"
        description={`Nuvarande namn: ${renamingChannel ?? ''}. Alla registrerade poster uppdateras automatiskt.`}
        onSave={handleRenameChannel}
        isSaving={isSavingRename}
      >
        <div className="space-y-2">
          <Label htmlFor="rename-channel">Nytt namn</Label>
          <Input
            id="rename-channel"
            value={newName}
            onChange={e => setNewName(e.target.value)}
            placeholder="Kanalnamn"
          />
        </div>
      </EditEntryDialog>
    </div>
  )
}
