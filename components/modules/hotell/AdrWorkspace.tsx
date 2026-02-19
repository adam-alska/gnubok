'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { ModuleWorkspaceShell } from '@/components/modules/ModuleWorkspaceShell'
import { KPICard } from '@/components/modules/shared/KPICard'
import { EmptyModuleState } from '@/components/modules/shared/EmptyModuleState'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog'
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
  Plus,
  Pencil,
  Trash2,
  Loader2,
  TrendingUp,
  BedDouble,
} from 'lucide-react'

interface ModuleWorkspaceProps {
  module: { slug: string; name: string; cat: string; desc: string; longDesc: string }
  sectorSlug: string
  settingsHref: string
}

type RoomType = 'Standard' | 'Superior' | 'Svit' | 'Familj' | 'Budget' | 'Ovrigt'
type Channel = 'Direkt' | 'Booking.com' | 'Expedia' | 'Airbnb' | 'Ovrigt'
type Season = 'Hogsasong' | 'Lagsasong' | 'Mellansasong'

interface AdrEntry {
  id: string
  month: string
  roomType: RoomType
  channel: Channel
  season: Season
  roomsSold: number
  revenue: number
  adr: number
}

const ROOM_TYPES: RoomType[] = ['Standard', 'Superior', 'Svit', 'Familj', 'Budget', 'Ovrigt']
const CHANNELS: Channel[] = ['Direkt', 'Booking.com', 'Expedia', 'Airbnb', 'Ovrigt']
const SEASONS: Season[] = ['Hogsasong', 'Lagsasong', 'Mellansasong']

const ROOM_TYPE_COLORS: Record<RoomType, string> = {
  'Standard': 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
  'Superior': 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400',
  'Svit': 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400',
  'Familj': 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400',
  'Budget': 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400',
  'Ovrigt': 'bg-rose-100 text-rose-800 dark:bg-rose-900/30 dark:text-rose-400',
}

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7)
}

function fmtDec(n: number): string {
  return new Intl.NumberFormat('sv-SE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)
}

function fmt(n: number): string {
  return new Intl.NumberFormat('sv-SE', { maximumFractionDigits: 0 }).format(n)
}

function currentMonth(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

export function AdrWorkspace({ module: mod, sectorSlug, settingsHref }: ModuleWorkspaceProps) {
  const supabase = createClient()

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [entries, setEntries] = useState<AdrEntry[]>([])
  const [filterRoomType, setFilterRoomType] = useState<RoomType | 'all'>('all')
  const [filterChannel, setFilterChannel] = useState<Channel | 'all'>('all')
  const [filterSeason, setFilterSeason] = useState<Season | 'all'>('all')

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingEntry, setEditingEntry] = useState<AdrEntry | null>(null)
  const [form, setForm] = useState({
    month: currentMonth(),
    roomType: 'Standard' as RoomType,
    channel: 'Direkt' as Channel,
    season: 'Mellansasong' as Season,
    roomsSold: 0,
    revenue: 0,
  })

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [entryToDelete, setEntryToDelete] = useState<AdrEntry | null>(null)

  const saveEntries = useCallback(async (newEntries: AdrEntry[]) => {
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setSaving(false); return }

    await supabase.from('module_configs').upsert(
      { user_id: user.id, sector_slug: sectorSlug, module_slug: mod.slug, config_key: 'adr_entries', config_value: newEntries },
      { onConflict: 'user_id,sector_slug,module_slug,config_key' }
    )
    setSaving(false)
  }, [supabase, sectorSlug, mod.slug])

  const fetchEntries = useCallback(async () => {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); return }

    const { data } = await supabase
      .from('module_configs')
      .select('config_value')
      .eq('user_id', user.id)
      .eq('sector_slug', sectorSlug)
      .eq('module_slug', mod.slug)
      .eq('config_key', 'adr_entries')
      .maybeSingle()

    if (data?.config_value && Array.isArray(data.config_value)) {
      setEntries(data.config_value as AdrEntry[])
    }
    setLoading(false)
  }, [supabase, sectorSlug, mod.slug])

  useEffect(() => { fetchEntries() }, [fetchEntries])

  const filteredEntries = useMemo(() => {
    let result = entries
    if (filterRoomType !== 'all') result = result.filter(e => e.roomType === filterRoomType)
    if (filterChannel !== 'all') result = result.filter(e => e.channel === filterChannel)
    if (filterSeason !== 'all') result = result.filter(e => e.season === filterSeason)
    return result.sort((a, b) => b.month.localeCompare(a.month))
  }, [entries, filterRoomType, filterChannel, filterSeason])

  // Summary by room type
  const byRoomType = useMemo(() => {
    const map: Record<RoomType, { sold: number; revenue: number }> = {} as any
    for (const rt of ROOM_TYPES) map[rt] = { sold: 0, revenue: 0 }
    for (const e of entries) {
      map[e.roomType].sold += e.roomsSold
      map[e.roomType].revenue += e.revenue
    }
    return map
  }, [entries])

  // Summary by channel
  const byChannel = useMemo(() => {
    const map: Record<Channel, { sold: number; revenue: number }> = {} as any
    for (const ch of CHANNELS) map[ch] = { sold: 0, revenue: 0 }
    for (const e of entries) {
      map[e.channel].sold += e.roomsSold
      map[e.channel].revenue += e.revenue
    }
    return map
  }, [entries])

  // Overall ADR
  const overallAdr = useMemo(() => {
    const totalSold = entries.reduce((s, e) => s + e.roomsSold, 0)
    const totalRevenue = entries.reduce((s, e) => s + e.revenue, 0)
    return totalSold > 0 ? totalRevenue / totalSold : 0
  }, [entries])

  function openNew() {
    setEditingEntry(null)
    setForm({ month: currentMonth(), roomType: 'Standard', channel: 'Direkt', season: 'Mellansasong', roomsSold: 0, revenue: 0 })
    setDialogOpen(true)
  }

  function openEdit(entry: AdrEntry) {
    setEditingEntry(entry)
    setForm({ month: entry.month, roomType: entry.roomType, channel: entry.channel, season: entry.season, roomsSold: entry.roomsSold, revenue: entry.revenue })
    setDialogOpen(true)
  }

  async function handleSave() {
    const adr = form.roomsSold > 0 ? form.revenue / form.roomsSold : 0
    const item: AdrEntry = {
      id: editingEntry?.id ?? generateId(),
      month: form.month,
      roomType: form.roomType,
      channel: form.channel,
      season: form.season,
      roomsSold: form.roomsSold,
      revenue: form.revenue,
      adr,
    }
    let updated: AdrEntry[]
    if (editingEntry) {
      updated = entries.map(e => e.id === editingEntry.id ? item : e)
    } else {
      updated = [...entries, item]
    }
    setEntries(updated)
    setDialogOpen(false)
    await saveEntries(updated)
  }

  async function handleDelete() {
    if (!entryToDelete) return
    const updated = entries.filter(e => e.id !== entryToDelete.id)
    setEntries(updated)
    setDeleteDialogOpen(false)
    setEntryToDelete(null)
    await saveEntries(updated)
  }

  return (
    <>
      <ModuleWorkspaceShell
        title={mod.name}
        description={mod.desc}
        category="rapport"
        sectorName="Hotell & Boende"
        backHref={`/m/${sectorSlug}`}
        settingsHref={settingsHref}
        actions={
          <Button onClick={openNew}>
            <Plus className="mr-2 h-4 w-4" />
            Ny ADR-post
          </Button>
        }
      >
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <Tabs defaultValue="data" className="space-y-6">
            <TabsList>
              <TabsTrigger value="data">Data</TabsTrigger>
              <TabsTrigger value="rumstyp">Per rumstyp</TabsTrigger>
              <TabsTrigger value="kanal">Per kanal</TabsTrigger>
            </TabsList>

            <TabsContent value="data" className="space-y-6">
              {/* KPI */}
              <div className="grid gap-4 sm:grid-cols-3">
                <KPICard label="Overall ADR" value={fmtDec(overallAdr)} unit="kr" />
                <KPICard label="Totalt sålda rum" value={fmt(entries.reduce((s, e) => s + e.roomsSold, 0))} unit="st" />
                <KPICard label="Total rumsintakt" value={fmt(entries.reduce((s, e) => s + e.revenue, 0))} unit="kr" />
              </div>

              {/* Filters */}
              <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
                <Select value={filterRoomType} onValueChange={val => setFilterRoomType(val as RoomType | 'all')}>
                  <SelectTrigger className="w-[160px]"><SelectValue placeholder="Rumstyp" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Alla rumstyper</SelectItem>
                    {ROOM_TYPES.map(rt => <SelectItem key={rt} value={rt}>{rt}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Select value={filterChannel} onValueChange={val => setFilterChannel(val as Channel | 'all')}>
                  <SelectTrigger className="w-[160px]"><SelectValue placeholder="Kanal" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Alla kanaler</SelectItem>
                    {CHANNELS.map(ch => <SelectItem key={ch} value={ch}>{ch}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Select value={filterSeason} onValueChange={val => setFilterSeason(val as Season | 'all')}>
                  <SelectTrigger className="w-[160px]"><SelectValue placeholder="Säsong" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Alla säsonger</SelectItem>
                    {SEASONS.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
                {saving && <div className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" />Sparar...</div>}
              </div>

              {filteredEntries.length === 0 ? (
                <EmptyModuleState icon={BedDouble} title="Ingen ADR-data" description="Lägg till data för att analysera Average Daily Rate." actionLabel="Lägg till" onAction={openNew} />
              ) : (
                <div className="rounded-xl border border-border overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/50">
                        <TableHead className="font-medium">Månad</TableHead>
                        <TableHead className="font-medium">Rumstyp</TableHead>
                        <TableHead className="font-medium">Kanal</TableHead>
                        <TableHead className="font-medium">Säsong</TableHead>
                        <TableHead className="font-medium text-right">Sålda</TableHead>
                        <TableHead className="font-medium text-right">Intakt</TableHead>
                        <TableHead className="font-medium text-right">ADR</TableHead>
                        <TableHead className="font-medium text-right">Åtgärder</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredEntries.map(entry => (
                        <TableRow key={entry.id}>
                          <TableCell className="font-medium">{entry.month}</TableCell>
                          <TableCell><Badge variant="secondary" className={ROOM_TYPE_COLORS[entry.roomType]}>{entry.roomType}</Badge></TableCell>
                          <TableCell>{entry.channel}</TableCell>
                          <TableCell>{entry.season}</TableCell>
                          <TableCell className="text-right">{fmt(entry.roomsSold)}</TableCell>
                          <TableCell className="text-right font-mono">{fmt(entry.revenue)} kr</TableCell>
                          <TableCell className="text-right font-mono font-semibold">{fmtDec(entry.adr)} kr</TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-1">
                              <Button variant="ghost" size="icon" onClick={() => openEdit(entry)} title="Redigera"><Pencil className="h-4 w-4" /></Button>
                              <Button variant="ghost" size="icon" className="text-red-600 hover:text-red-700" onClick={() => { setEntryToDelete(entry); setDeleteDialogOpen(true) }} title="Ta bort"><Trash2 className="h-4 w-4" /></Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </TabsContent>

            <TabsContent value="rumstyp" className="space-y-4">
              <div className="rounded-xl border border-border overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead className="font-medium">Rumstyp</TableHead>
                      <TableHead className="font-medium text-right">Sålda rum</TableHead>
                      <TableHead className="font-medium text-right">Intakt (kr)</TableHead>
                      <TableHead className="font-medium text-right">ADR (kr)</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {ROOM_TYPES.filter(rt => byRoomType[rt].sold > 0).map(rt => (
                      <TableRow key={rt}>
                        <TableCell><Badge variant="secondary" className={ROOM_TYPE_COLORS[rt]}>{rt}</Badge></TableCell>
                        <TableCell className="text-right">{fmt(byRoomType[rt].sold)}</TableCell>
                        <TableCell className="text-right font-mono">{fmt(byRoomType[rt].revenue)}</TableCell>
                        <TableCell className="text-right font-mono font-semibold">{fmtDec(byRoomType[rt].revenue / byRoomType[rt].sold)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </TabsContent>

            <TabsContent value="kanal" className="space-y-4">
              <div className="rounded-xl border border-border overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead className="font-medium">Kanal</TableHead>
                      <TableHead className="font-medium text-right">Sålda rum</TableHead>
                      <TableHead className="font-medium text-right">Intakt (kr)</TableHead>
                      <TableHead className="font-medium text-right">ADR (kr)</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {CHANNELS.filter(ch => byChannel[ch].sold > 0).map(ch => (
                      <TableRow key={ch}>
                        <TableCell className="font-medium">{ch}</TableCell>
                        <TableCell className="text-right">{fmt(byChannel[ch].sold)}</TableCell>
                        <TableCell className="text-right font-mono">{fmt(byChannel[ch].revenue)}</TableCell>
                        <TableCell className="text-right font-mono font-semibold">{fmtDec(byChannel[ch].revenue / byChannel[ch].sold)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </TabsContent>
          </Tabs>
        )}
      </ModuleWorkspaceShell>

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingEntry ? 'Redigera ADR-post' : 'Ny ADR-post'}</DialogTitle>
            <DialogDescription>Registrera rumstyp, kanal, säsong och försäljningsdata.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-2">
              <Label>Månad *</Label>
              <Input type="month" value={form.month} onChange={e => setForm(f => ({ ...f, month: e.target.value }))} />
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="grid gap-2">
                <Label>Rumstyp</Label>
                <Select value={form.roomType} onValueChange={val => setForm(f => ({ ...f, roomType: val as RoomType }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{ROOM_TYPES.map(rt => <SelectItem key={rt} value={rt}>{rt}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label>Kanal</Label>
                <Select value={form.channel} onValueChange={val => setForm(f => ({ ...f, channel: val as Channel }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{CHANNELS.map(ch => <SelectItem key={ch} value={ch}>{ch}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label>Säsong</Label>
                <Select value={form.season} onValueChange={val => setForm(f => ({ ...f, season: val as Season }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{SEASONS.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Rum sålda *</Label>
                <Input type="number" min={0} value={form.roomsSold || ''} onChange={e => setForm(f => ({ ...f, roomsSold: parseInt(e.target.value) || 0 }))} />
              </div>
              <div className="grid gap-2">
                <Label>Intakt (kr) *</Label>
                <Input type="number" min={0} step="0.01" value={form.revenue || ''} onChange={e => setForm(f => ({ ...f, revenue: parseFloat(e.target.value) || 0 }))} />
              </div>
            </div>
            {form.roomsSold > 0 && (
              <div className="rounded-lg bg-muted/50 p-3 text-sm">
                <span className="text-muted-foreground">ADR: </span>
                <span className="font-mono font-semibold">{fmtDec(form.revenue / form.roomsSold)} kr</span>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Avbryt</Button>
            <Button onClick={handleSave} disabled={!form.month || form.roomsSold <= 0}>{editingEntry ? 'Uppdatera' : 'Spara'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Ta bort ADR-post</DialogTitle>
            <DialogDescription>Är du säker på att du vill ta bort denna post?</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>Avbryt</Button>
            <Button variant="destructive" onClick={handleDelete}><Trash2 className="mr-2 h-4 w-4" />Ta bort</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
