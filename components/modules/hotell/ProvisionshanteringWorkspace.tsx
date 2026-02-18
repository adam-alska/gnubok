'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { ModuleWorkspaceShell } from '@/components/modules/ModuleWorkspaceShell'
import { EmptyModuleState } from '@/components/modules/shared/EmptyModuleState'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
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
  Search,
  Globe,
} from 'lucide-react'

interface ModuleWorkspaceProps {
  module: { slug: string; name: string; cat: string; desc: string; longDesc: string }
  sectorSlug: string
  settingsHref: string
}

type Channel = 'Booking.com' | 'Expedia' | 'Airbnb' | 'Hotels.com' | 'Direkt' | 'Ovrigt'

interface OtaBooking {
  id: string
  channel: Channel
  bookingRef: string
  guestName: string
  checkinDate: string
  checkoutDate: string
  grossAmount: number
  commissionPct: number
  commissionAmount: number
  netAmount: number
  month: string
}

const CHANNELS: Channel[] = ['Booking.com', 'Expedia', 'Airbnb', 'Hotels.com', 'Direkt', 'Ovrigt']

const CHANNEL_COLORS: Record<Channel, string> = {
  'Booking.com': 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
  'Expedia': 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
  'Airbnb': 'bg-rose-100 text-rose-800 dark:bg-rose-900/30 dark:text-rose-400',
  'Hotels.com': 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400',
  'Direkt': 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400',
  'Ovrigt': 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400',
}

const DEFAULT_COMMISSION: Record<Channel, number> = {
  'Booking.com': 15,
  'Expedia': 18,
  'Airbnb': 3,
  'Hotels.com': 20,
  'Direkt': 0,
  'Ovrigt': 10,
}

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7)
}

function fmt(n: number): string {
  return new Intl.NumberFormat('sv-SE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)
}

function currentMonth(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function todayStr(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function ProvisionshanteringWorkspace({ module: mod, sectorSlug, settingsHref }: ModuleWorkspaceProps) {
  const supabase = createClient()

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [bookings, setBookings] = useState<OtaBooking[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [filterChannel, setFilterChannel] = useState<Channel | 'all'>('all')
  const [filterMonth, setFilterMonth] = useState(currentMonth())

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingBooking, setEditingBooking] = useState<OtaBooking | null>(null)
  const [form, setForm] = useState({
    channel: 'Booking.com' as Channel,
    bookingRef: '',
    guestName: '',
    checkinDate: todayStr(),
    checkoutDate: '',
    grossAmount: 0,
    commissionPct: 15,
  })

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [bookingToDelete, setBookingToDelete] = useState<OtaBooking | null>(null)

  const saveBookings = useCallback(async (newBookings: OtaBooking[]) => {
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setSaving(false); return }

    await supabase.from('module_configs').upsert(
      { user_id: user.id, sector_slug: sectorSlug, module_slug: mod.slug, config_key: 'ota_bookings', config_value: newBookings },
      { onConflict: 'user_id,sector_slug,module_slug,config_key' }
    )
    setSaving(false)
  }, [supabase, sectorSlug, mod.slug])

  const fetchBookings = useCallback(async () => {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); return }

    const { data } = await supabase
      .from('module_configs')
      .select('config_value')
      .eq('user_id', user.id)
      .eq('sector_slug', sectorSlug)
      .eq('module_slug', mod.slug)
      .eq('config_key', 'ota_bookings')
      .maybeSingle()

    if (data?.config_value && Array.isArray(data.config_value)) {
      setBookings(data.config_value as OtaBooking[])
    }
    setLoading(false)
  }, [supabase, sectorSlug, mod.slug])

  useEffect(() => { fetchBookings() }, [fetchBookings])

  const filteredBookings = useMemo(() => {
    let result = bookings
    if (filterChannel !== 'all') {
      result = result.filter(b => b.channel === filterChannel)
    }
    if (filterMonth) {
      result = result.filter(b => b.month === filterMonth)
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      result = result.filter(b => b.guestName.toLowerCase().includes(q) || b.bookingRef.toLowerCase().includes(q))
    }
    return result.sort((a, b) => b.checkinDate.localeCompare(a.checkinDate))
  }, [bookings, filterChannel, filterMonth, searchQuery])

  // Monthly summary by channel
  const monthlySummary = useMemo(() => {
    const monthBookings = bookings.filter(b => b.month === filterMonth)
    const summary: Record<Channel, { count: number; gross: number; commission: number; net: number }> = {} as any
    for (const ch of CHANNELS) {
      const chBookings = monthBookings.filter(b => b.channel === ch)
      summary[ch] = {
        count: chBookings.length,
        gross: chBookings.reduce((s, b) => s + b.grossAmount, 0),
        commission: chBookings.reduce((s, b) => s + b.commissionAmount, 0),
        net: chBookings.reduce((s, b) => s + b.netAmount, 0),
      }
    }
    const total = {
      count: monthBookings.length,
      gross: monthBookings.reduce((s, b) => s + b.grossAmount, 0),
      commission: monthBookings.reduce((s, b) => s + b.commissionAmount, 0),
      net: monthBookings.reduce((s, b) => s + b.netAmount, 0),
    }
    return { byChannel: summary, total }
  }, [bookings, filterMonth])

  // Available months
  const availableMonths = useMemo(() => {
    const months = new Set(bookings.map(b => b.month))
    months.add(currentMonth())
    return Array.from(months).sort().reverse()
  }, [bookings])

  function openNew() {
    setEditingBooking(null)
    setForm({
      channel: 'Booking.com',
      bookingRef: '',
      guestName: '',
      checkinDate: todayStr(),
      checkoutDate: '',
      grossAmount: 0,
      commissionPct: DEFAULT_COMMISSION['Booking.com'],
    })
    setDialogOpen(true)
  }

  function openEdit(booking: OtaBooking) {
    setEditingBooking(booking)
    setForm({
      channel: booking.channel,
      bookingRef: booking.bookingRef,
      guestName: booking.guestName,
      checkinDate: booking.checkinDate,
      checkoutDate: booking.checkoutDate,
      grossAmount: booking.grossAmount,
      commissionPct: booking.commissionPct,
    })
    setDialogOpen(true)
  }

  async function handleSave() {
    const commissionAmount = form.grossAmount * (form.commissionPct / 100)
    const netAmount = form.grossAmount - commissionAmount
    const month = form.checkinDate.substring(0, 7)

    const item: OtaBooking = {
      id: editingBooking?.id ?? generateId(),
      channel: form.channel,
      bookingRef: form.bookingRef.trim(),
      guestName: form.guestName.trim(),
      checkinDate: form.checkinDate,
      checkoutDate: form.checkoutDate,
      grossAmount: form.grossAmount,
      commissionPct: form.commissionPct,
      commissionAmount,
      netAmount,
      month,
    }

    let updated: OtaBooking[]
    if (editingBooking) {
      updated = bookings.map(b => b.id === editingBooking.id ? item : b)
    } else {
      updated = [...bookings, item]
    }
    setBookings(updated)
    setDialogOpen(false)
    await saveBookings(updated)
  }

  async function handleDelete() {
    if (!bookingToDelete) return
    const updated = bookings.filter(b => b.id !== bookingToDelete.id)
    setBookings(updated)
    setDeleteDialogOpen(false)
    setBookingToDelete(null)
    await saveBookings(updated)
  }

  return (
    <>
      <ModuleWorkspaceShell
        title={mod.name}
        description={mod.desc}
        category="bokforing"
        sectorName="Hotell & Boende"
        backHref={`/m/${sectorSlug}`}
        settingsHref={settingsHref}
        actions={
          <Button onClick={openNew}>
            <Plus className="mr-2 h-4 w-4" />
            Ny bokning
          </Button>
        }
      >
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <Tabs defaultValue="bokningar" className="space-y-6">
            <TabsList>
              <TabsTrigger value="bokningar">Bokningar</TabsTrigger>
              <TabsTrigger value="sammanstallning">Manadssammanstallning</TabsTrigger>
            </TabsList>

            <TabsContent value="bokningar" className="space-y-6">
              {/* Summary cards */}
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <Card>
                  <CardHeader className="pb-2"><CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Brutto denna manad</CardTitle></CardHeader>
                  <CardContent><span className="text-2xl font-semibold tracking-tight">{fmt(monthlySummary.total.gross)}</span><span className="text-sm text-muted-foreground ml-1.5">kr</span></CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2"><CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Provision</CardTitle></CardHeader>
                  <CardContent><span className="text-2xl font-semibold tracking-tight">{fmt(monthlySummary.total.commission)}</span><span className="text-sm text-muted-foreground ml-1.5">kr</span></CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2"><CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Netto</CardTitle></CardHeader>
                  <CardContent><span className="text-2xl font-semibold tracking-tight">{fmt(monthlySummary.total.net)}</span><span className="text-sm text-muted-foreground ml-1.5">kr</span></CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2"><CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Antal bokningar</CardTitle></CardHeader>
                  <CardContent><span className="text-2xl font-semibold tracking-tight">{monthlySummary.total.count}</span><span className="text-sm text-muted-foreground ml-1.5">st</span></CardContent>
                </Card>
              </div>

              {/* Filters */}
              <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
                <div className="relative flex-1 max-w-sm">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input placeholder="Sok gast eller bokningsref..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="pl-9" />
                </div>
                <Select value={filterChannel} onValueChange={val => setFilterChannel(val as Channel | 'all')}>
                  <SelectTrigger className="w-[180px]"><SelectValue placeholder="Filtrera kanal" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Alla kanaler</SelectItem>
                    {CHANNELS.map(ch => <SelectItem key={ch} value={ch}>{ch}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Select value={filterMonth} onValueChange={setFilterMonth}>
                  <SelectTrigger className="w-[160px]"><SelectValue placeholder="Manad" /></SelectTrigger>
                  <SelectContent>
                    {availableMonths.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                  </SelectContent>
                </Select>
                {saving && (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />Sparar...
                  </div>
                )}
              </div>

              {/* Bookings table */}
              {filteredBookings.length === 0 ? (
                <EmptyModuleState
                  icon={Globe}
                  title="Inga bokningar"
                  description="Registrera bokningar fran OTA-kanaler for att spara provisioner."
                  actionLabel="Ny bokning"
                  onAction={openNew}
                />
              ) : (
                <div className="rounded-xl border border-border overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/50">
                        <TableHead className="font-medium">Kanal</TableHead>
                        <TableHead className="font-medium">Gast</TableHead>
                        <TableHead className="font-medium">Ref</TableHead>
                        <TableHead className="font-medium">Incheckning</TableHead>
                        <TableHead className="font-medium text-right">Brutto</TableHead>
                        <TableHead className="font-medium text-right">Prov. %</TableHead>
                        <TableHead className="font-medium text-right">Provision</TableHead>
                        <TableHead className="font-medium text-right">Netto</TableHead>
                        <TableHead className="font-medium text-right">Atgarder</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredBookings.map(b => (
                        <TableRow key={b.id}>
                          <TableCell>
                            <Badge variant="secondary" className={CHANNEL_COLORS[b.channel]}>{b.channel}</Badge>
                          </TableCell>
                          <TableCell className="font-medium">{b.guestName}</TableCell>
                          <TableCell className="font-mono text-sm">{b.bookingRef}</TableCell>
                          <TableCell>{b.checkinDate}</TableCell>
                          <TableCell className="text-right font-mono">{fmt(b.grossAmount)}</TableCell>
                          <TableCell className="text-right font-mono">{b.commissionPct}%</TableCell>
                          <TableCell className="text-right font-mono">{fmt(b.commissionAmount)}</TableCell>
                          <TableCell className="text-right font-mono font-semibold">{fmt(b.netAmount)}</TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-1">
                              <Button variant="ghost" size="icon" onClick={() => openEdit(b)} title="Redigera"><Pencil className="h-4 w-4" /></Button>
                              <Button variant="ghost" size="icon" className="text-red-600 hover:text-red-700" onClick={() => { setBookingToDelete(b); setDeleteDialogOpen(true) }} title="Ta bort"><Trash2 className="h-4 w-4" /></Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </TabsContent>

            {/* Monthly summary tab */}
            <TabsContent value="sammanstallning" className="space-y-6">
              <div className="flex items-center gap-3">
                <Label>Manad:</Label>
                <Select value={filterMonth} onValueChange={setFilterMonth}>
                  <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {availableMonths.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="rounded-xl border border-border overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead className="font-medium">Kanal</TableHead>
                      <TableHead className="font-medium text-right">Antal</TableHead>
                      <TableHead className="font-medium text-right">Brutto (kr)</TableHead>
                      <TableHead className="font-medium text-right">Provision (kr)</TableHead>
                      <TableHead className="font-medium text-right">Netto (kr)</TableHead>
                      <TableHead className="font-medium text-right">Snitt prov. %</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {CHANNELS.filter(ch => monthlySummary.byChannel[ch].count > 0).map(ch => {
                      const s = monthlySummary.byChannel[ch]
                      const avgPct = s.gross > 0 ? (s.commission / s.gross) * 100 : 0
                      return (
                        <TableRow key={ch}>
                          <TableCell><Badge variant="secondary" className={CHANNEL_COLORS[ch]}>{ch}</Badge></TableCell>
                          <TableCell className="text-right">{s.count}</TableCell>
                          <TableCell className="text-right font-mono">{fmt(s.gross)}</TableCell>
                          <TableCell className="text-right font-mono">{fmt(s.commission)}</TableCell>
                          <TableCell className="text-right font-mono">{fmt(s.net)}</TableCell>
                          <TableCell className="text-right font-mono">{avgPct.toFixed(1)}%</TableCell>
                        </TableRow>
                      )
                    })}
                    <TableRow className="bg-muted/30 font-semibold">
                      <TableCell>Totalt</TableCell>
                      <TableCell className="text-right">{monthlySummary.total.count}</TableCell>
                      <TableCell className="text-right font-mono">{fmt(monthlySummary.total.gross)}</TableCell>
                      <TableCell className="text-right font-mono">{fmt(monthlySummary.total.commission)}</TableCell>
                      <TableCell className="text-right font-mono">{fmt(monthlySummary.total.net)}</TableCell>
                      <TableCell className="text-right font-mono">{monthlySummary.total.gross > 0 ? ((monthlySummary.total.commission / monthlySummary.total.gross) * 100).toFixed(1) : '0.0'}%</TableCell>
                    </TableRow>
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
            <DialogTitle>{editingBooking ? 'Redigera bokning' : 'Ny OTA-bokning'}</DialogTitle>
            <DialogDescription>Registrera en bokning med kanalens provision.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Kanal *</Label>
                <Select value={form.channel} onValueChange={val => { setForm(f => ({ ...f, channel: val as Channel, commissionPct: DEFAULT_COMMISSION[val as Channel] })) }}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CHANNELS.map(ch => <SelectItem key={ch} value={ch}>{ch}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label>Bokningsref</Label>
                <Input value={form.bookingRef} onChange={e => setForm(f => ({ ...f, bookingRef: e.target.value }))} placeholder="BC-12345" />
              </div>
            </div>
            <div className="grid gap-2">
              <Label>Gastnamn *</Label>
              <Input value={form.guestName} onChange={e => setForm(f => ({ ...f, guestName: e.target.value }))} placeholder="Anna Andersson" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Incheckning</Label>
                <Input type="date" value={form.checkinDate} onChange={e => setForm(f => ({ ...f, checkinDate: e.target.value }))} />
              </div>
              <div className="grid gap-2">
                <Label>Utcheckning</Label>
                <Input type="date" value={form.checkoutDate} onChange={e => setForm(f => ({ ...f, checkoutDate: e.target.value }))} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Bruttobelopp (kr) *</Label>
                <Input type="number" min={0} step="0.01" value={form.grossAmount || ''} onChange={e => setForm(f => ({ ...f, grossAmount: parseFloat(e.target.value) || 0 }))} />
              </div>
              <div className="grid gap-2">
                <Label>Provision (%)</Label>
                <Input type="number" min={0} max={100} step={0.5} value={form.commissionPct} onChange={e => setForm(f => ({ ...f, commissionPct: parseFloat(e.target.value) || 0 }))} />
              </div>
            </div>
            {form.grossAmount > 0 && (
              <div className="rounded-lg bg-muted/50 p-3 text-sm space-y-1">
                <div className="flex justify-between"><span className="text-muted-foreground">Provision:</span><span className="font-mono">{fmt(form.grossAmount * form.commissionPct / 100)} kr</span></div>
                <div className="flex justify-between font-semibold"><span>Netto:</span><span className="font-mono">{fmt(form.grossAmount - form.grossAmount * form.commissionPct / 100)} kr</span></div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Avbryt</Button>
            <Button onClick={handleSave} disabled={!form.guestName.trim() || form.grossAmount <= 0}>
              {editingBooking ? 'Uppdatera' : 'Registrera'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Ta bort bokning</DialogTitle>
            <DialogDescription>Ar du saker pa att du vill ta bort bokningen for {bookingToDelete?.guestName}?</DialogDescription>
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
