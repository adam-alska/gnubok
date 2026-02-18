'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { ModuleWorkspaceShell } from '@/components/modules/ModuleWorkspaceShell'
import { EmptyModuleState } from '@/components/modules/shared/EmptyModuleState'
import { KPICard } from '@/components/modules/shared/KPICard'
import { DateRangeFilter } from '@/components/modules/shared/DateRangeFilter'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
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
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import {
  Plus,
  Pencil,
  Trash2,
  Loader2,
  Search,
  Calendar,
  Clock,
  MessageSquare,
  Users,
} from 'lucide-react'

interface ModuleWorkspaceProps {
  module: { slug: string; name: string; cat: string; desc: string; longDesc: string }
  sectorSlug: string
  settingsHref: string
}

type BookingStatus = 'confirmed' | 'pending' | 'cancelled' | 'completed' | 'no_show'
type BookingType = 'Nybesök' | 'Återbesök' | 'Akut' | 'Vaccination' | 'Provtagning' | 'Telefonkonsultation'

interface Booking {
  id: string
  patientName: string
  patientRef: string
  practitioner: string
  date: string
  time: string
  duration: number
  type: BookingType
  status: BookingStatus
  smsReminder: boolean
  onlineBooked: boolean
  notes: string
}

interface WaitlistEntry {
  id: string
  patientName: string
  patientRef: string
  requestedDate: string
  preferredPractitioner: string
  type: BookingType
  priority: 'normal' | 'hög' | 'akut'
  addedDate: string
  notes: string
}

const BOOKING_TYPES: BookingType[] = ['Nybesök', 'Återbesök', 'Akut', 'Vaccination', 'Provtagning', 'Telefonkonsultation']

const STATUS_LABELS: Record<BookingStatus, string> = {
  confirmed: 'Bekräftad',
  pending: 'Väntande',
  cancelled: 'Avbokad',
  completed: 'Genomförd',
  no_show: 'Uteblev',
}

const STATUS_COLORS: Record<BookingStatus, string> = {
  confirmed: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400',
  pending: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
  cancelled: 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400',
  completed: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400',
  no_show: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
}

const PRIORITY_COLORS: Record<string, string> = {
  normal: 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400',
  hög: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400',
  akut: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
}

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
}

function todayStr(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function startOfWeek(): string {
  const d = new Date()
  const day = d.getDay()
  const diff = d.getDate() - day + (day === 0 ? -6 : 1)
  const monday = new Date(d.setDate(diff))
  return `${monday.getFullYear()}-${String(monday.getMonth() + 1).padStart(2, '0')}-${String(monday.getDate()).padStart(2, '0')}`
}

function endOfWeek(): string {
  const d = new Date()
  const day = d.getDay()
  const diff = d.getDate() - day + (day === 0 ? 0 : 7)
  const sunday = new Date(d.setDate(diff))
  return `${sunday.getFullYear()}-${String(sunday.getMonth() + 1).padStart(2, '0')}-${String(sunday.getDate()).padStart(2, '0')}`
}

export function PatientbokningWorkspace({ module: mod, sectorSlug, settingsHref }: ModuleWorkspaceProps) {
  const supabase = createClient()

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [bookings, setBookings] = useState<Booking[]>([])
  const [waitlist, setWaitlist] = useState<WaitlistEntry[]>([])
  const [from, setFrom] = useState(startOfWeek)
  const [to, setTo] = useState(endOfWeek)

  const [searchQuery, setSearchQuery] = useState('')
  const [filterStatus, setFilterStatus] = useState<BookingStatus | 'all'>('all')

  const [bookingDialogOpen, setBookingDialogOpen] = useState(false)
  const [editingBooking, setEditingBooking] = useState<Booking | null>(null)
  const [bookingForm, setBookingForm] = useState({
    patientName: '',
    patientRef: '',
    practitioner: '',
    date: todayStr(),
    time: '09:00',
    duration: 30,
    type: 'Nybesök' as BookingType,
    status: 'confirmed' as BookingStatus,
    smsReminder: true,
    onlineBooked: false,
    notes: '',
  })

  const [waitlistDialogOpen, setWaitlistDialogOpen] = useState(false)
  const [waitlistForm, setWaitlistForm] = useState({
    patientName: '',
    patientRef: '',
    requestedDate: todayStr(),
    preferredPractitioner: '',
    type: 'Nybesök' as BookingType,
    priority: 'normal' as 'normal' | 'hög' | 'akut',
    notes: '',
  })

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [bookingToDelete, setBookingToDelete] = useState<Booking | null>(null)

  const saveBookings = useCallback(async (newBookings: Booking[]) => {
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setSaving(false); return }

    await supabase.from('module_configs').upsert(
      {
        user_id: user.id,
        sector_slug: sectorSlug,
        module_slug: mod.slug,
        config_key: 'bookings',
        config_value: newBookings,
      },
      { onConflict: 'user_id,sector_slug,module_slug,config_key' }
    )
    setSaving(false)
  }, [supabase, sectorSlug, mod.slug])

  const saveWaitlist = useCallback(async (newWaitlist: WaitlistEntry[]) => {
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setSaving(false); return }

    await supabase.from('module_configs').upsert(
      {
        user_id: user.id,
        sector_slug: sectorSlug,
        module_slug: mod.slug,
        config_key: 'waitlist',
        config_value: newWaitlist,
      },
      { onConflict: 'user_id,sector_slug,module_slug,config_key' }
    )
    setSaving(false)
  }, [supabase, sectorSlug, mod.slug])

  const fetchData = useCallback(async () => {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); return }

    const { data: bData } = await supabase
      .from('module_configs')
      .select('config_value')
      .eq('user_id', user.id)
      .eq('sector_slug', sectorSlug)
      .eq('module_slug', mod.slug)
      .eq('config_key', 'bookings')
      .maybeSingle()

    if (bData?.config_value && Array.isArray(bData.config_value)) {
      setBookings(bData.config_value as Booking[])
    }

    const { data: wData } = await supabase
      .from('module_configs')
      .select('config_value')
      .eq('user_id', user.id)
      .eq('sector_slug', sectorSlug)
      .eq('module_slug', mod.slug)
      .eq('config_key', 'waitlist')
      .maybeSingle()

    if (wData?.config_value && Array.isArray(wData.config_value)) {
      setWaitlist(wData.config_value as WaitlistEntry[])
    }

    setLoading(false)
  }, [supabase, sectorSlug, mod.slug])

  useEffect(() => { fetchData() }, [fetchData])

  const filteredBookings = useMemo(() => {
    let result = bookings.filter((b) => b.date >= from && b.date <= to)
    if (filterStatus !== 'all') {
      result = result.filter((b) => b.status === filterStatus)
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      result = result.filter(
        (b) =>
          b.patientName.toLowerCase().includes(q) ||
          b.patientRef.toLowerCase().includes(q) ||
          b.practitioner.toLowerCase().includes(q)
      )
    }
    return result.sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time))
  }, [bookings, from, to, filterStatus, searchQuery])

  const stats = useMemo(() => {
    const periodBookings = bookings.filter((b) => b.date >= from && b.date <= to)
    return {
      total: periodBookings.length,
      confirmed: periodBookings.filter((b) => b.status === 'confirmed').length,
      completed: periodBookings.filter((b) => b.status === 'completed').length,
      cancelled: periodBookings.filter((b) => b.status === 'cancelled').length,
      noShow: periodBookings.filter((b) => b.status === 'no_show').length,
      smsEnabled: periodBookings.filter((b) => b.smsReminder).length,
      onlineBooked: periodBookings.filter((b) => b.onlineBooked).length,
      waitlistCount: waitlist.length,
    }
  }, [bookings, waitlist, from, to])

  function openNewBooking() {
    setEditingBooking(null)
    setBookingForm({
      patientName: '',
      patientRef: '',
      practitioner: '',
      date: todayStr(),
      time: '09:00',
      duration: 30,
      type: 'Nybesök',
      status: 'confirmed',
      smsReminder: true,
      onlineBooked: false,
      notes: '',
    })
    setBookingDialogOpen(true)
  }

  function openEditBooking(booking: Booking) {
    setEditingBooking(booking)
    setBookingForm({
      patientName: booking.patientName,
      patientRef: booking.patientRef,
      practitioner: booking.practitioner,
      date: booking.date,
      time: booking.time,
      duration: booking.duration,
      type: booking.type,
      status: booking.status,
      smsReminder: booking.smsReminder,
      onlineBooked: booking.onlineBooked,
      notes: booking.notes,
    })
    setBookingDialogOpen(true)
  }

  async function handleSaveBooking() {
    const newBooking: Booking = {
      id: editingBooking ? editingBooking.id : generateId(),
      patientName: bookingForm.patientName.trim(),
      patientRef: bookingForm.patientRef.trim(),
      practitioner: bookingForm.practitioner.trim(),
      date: bookingForm.date,
      time: bookingForm.time,
      duration: bookingForm.duration,
      type: bookingForm.type,
      status: bookingForm.status,
      smsReminder: bookingForm.smsReminder,
      onlineBooked: bookingForm.onlineBooked,
      notes: bookingForm.notes.trim(),
    }

    let updated: Booking[]
    if (editingBooking) {
      updated = bookings.map((b) => b.id === editingBooking.id ? newBooking : b)
    } else {
      updated = [...bookings, newBooking]
    }

    setBookings(updated)
    setBookingDialogOpen(false)
    await saveBookings(updated)
  }

  function openDeleteConfirmation(booking: Booking) {
    setBookingToDelete(booking)
    setDeleteDialogOpen(true)
  }

  async function handleDeleteBooking() {
    if (!bookingToDelete) return
    const updated = bookings.filter((b) => b.id !== bookingToDelete.id)
    setBookings(updated)
    setDeleteDialogOpen(false)
    setBookingToDelete(null)
    await saveBookings(updated)
  }

  function openWaitlistDialog() {
    setWaitlistForm({
      patientName: '',
      patientRef: '',
      requestedDate: todayStr(),
      preferredPractitioner: '',
      type: 'Nybesök',
      priority: 'normal',
      notes: '',
    })
    setWaitlistDialogOpen(true)
  }

  async function handleSaveWaitlist() {
    const entry: WaitlistEntry = {
      id: generateId(),
      patientName: waitlistForm.patientName.trim(),
      patientRef: waitlistForm.patientRef.trim(),
      requestedDate: waitlistForm.requestedDate,
      preferredPractitioner: waitlistForm.preferredPractitioner.trim(),
      type: waitlistForm.type,
      priority: waitlistForm.priority,
      addedDate: todayStr(),
      notes: waitlistForm.notes.trim(),
    }

    const updated = [...waitlist, entry]
    setWaitlist(updated)
    setWaitlistDialogOpen(false)
    await saveWaitlist(updated)
  }

  async function handleRemoveFromWaitlist(id: string) {
    const updated = waitlist.filter((w) => w.id !== id)
    setWaitlist(updated)
    await saveWaitlist(updated)
  }

  return (
    <>
      <ModuleWorkspaceShell
        title={mod.name}
        description={mod.desc}
        category="operativ"
        sectorName="Hälsa & Sjukvård"
        backHref={`/m/${sectorSlug}`}
        settingsHref={settingsHref}
        actions={
          <DateRangeFilter from={from} to={to} onFromChange={setFrom} onToChange={setTo} />
        }
      >
        <Tabs defaultValue="bokningar" className="space-y-6">
          <TabsList>
            <TabsTrigger value="bokningar">Bokningar</TabsTrigger>
            <TabsTrigger value="kalender">Kalendervy</TabsTrigger>
            <TabsTrigger value="vantelista">Väntelista ({waitlist.length})</TabsTrigger>
          </TabsList>

          <TabsContent value="bokningar" className="space-y-6">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  <KPICard label="Bokningar" value={stats.total.toString()} />
                  <KPICard label="Bekräftade" value={stats.confirmed.toString()} />
                  <KPICard label="Avbokade" value={stats.cancelled.toString()} trend={stats.cancelled > 0 ? 'down' : 'neutral'} />
                  <KPICard label="Väntelista" value={stats.waitlistCount.toString()} />
                </div>

                <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
                  <div className="relative flex-1 max-w-sm">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Sök patient eller behandlare..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-9"
                    />
                  </div>
                  <Select value={filterStatus} onValueChange={(val) => setFilterStatus(val as BookingStatus | 'all')}>
                    <SelectTrigger className="w-[180px]">
                      <SelectValue placeholder="Filtrera status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Alla statusar</SelectItem>
                      <SelectItem value="confirmed">Bekräftad</SelectItem>
                      <SelectItem value="pending">Väntande</SelectItem>
                      <SelectItem value="completed">Genomförd</SelectItem>
                      <SelectItem value="cancelled">Avbokad</SelectItem>
                      <SelectItem value="no_show">Uteblev</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button onClick={openNewBooking}>
                    <Plus className="mr-2 h-4 w-4" />
                    Ny bokning
                  </Button>
                  {saving && (
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      Sparar...
                    </div>
                  )}
                </div>

                {filteredBookings.length === 0 ? (
                  <EmptyModuleState
                    icon={Calendar}
                    title="Inga bokningar"
                    description="Det finns inga bokningar för den valda perioden."
                    actionLabel="Ny bokning"
                    onAction={openNewBooking}
                  />
                ) : (
                  <div className="rounded-xl border border-border overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-muted/50">
                          <TableHead className="font-medium">Datum</TableHead>
                          <TableHead className="font-medium">Tid</TableHead>
                          <TableHead className="font-medium">Patient</TableHead>
                          <TableHead className="font-medium">Behandlare</TableHead>
                          <TableHead className="font-medium">Typ</TableHead>
                          <TableHead className="font-medium">Status</TableHead>
                          <TableHead className="font-medium">SMS</TableHead>
                          <TableHead className="font-medium text-right">Åtgärder</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredBookings.map((booking) => (
                          <TableRow key={booking.id}>
                            <TableCell className="font-medium">{booking.date}</TableCell>
                            <TableCell className="font-mono">{booking.time} ({booking.duration} min)</TableCell>
                            <TableCell>
                              <div>
                                <span className="font-medium">{booking.patientName}</span>
                                <span className="text-xs text-muted-foreground ml-2">{booking.patientRef}</span>
                              </div>
                            </TableCell>
                            <TableCell>{booking.practitioner}</TableCell>
                            <TableCell>
                              <Badge variant="outline">{booking.type}</Badge>
                            </TableCell>
                            <TableCell>
                              <Badge variant="secondary" className={STATUS_COLORS[booking.status]}>
                                {STATUS_LABELS[booking.status]}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              {booking.smsReminder ? (
                                <MessageSquare className="h-4 w-4 text-emerald-600" />
                              ) : (
                                <span className="text-muted-foreground">-</span>
                              )}
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="flex items-center justify-end gap-1">
                                <Button variant="ghost" size="icon" onClick={() => openEditBooking(booking)} title="Redigera">
                                  <Pencil className="h-4 w-4" />
                                </Button>
                                <Button variant="ghost" size="icon" className="text-red-600 hover:text-red-700" onClick={() => openDeleteConfirmation(booking)} title="Ta bort">
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </>
            )}
          </TabsContent>

          <TabsContent value="kalender" className="space-y-6">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <div className="space-y-4">
                {(() => {
                  const dateMap: Record<string, Booking[]> = {}
                  for (const b of filteredBookings) {
                    if (!dateMap[b.date]) dateMap[b.date] = []
                    dateMap[b.date].push(b)
                  }
                  const dates = Object.keys(dateMap).sort()

                  if (dates.length === 0) {
                    return (
                      <EmptyModuleState
                        icon={Calendar}
                        title="Inga bokningar i perioden"
                        description="Justera datumfiltret eller skapa nya bokningar."
                      />
                    )
                  }

                  return dates.map((date) => (
                    <div key={date} className="rounded-xl border border-border overflow-hidden">
                      <div className="bg-muted/50 px-4 py-2 border-b border-border">
                        <h3 className="text-sm font-semibold">{date}</h3>
                        <p className="text-xs text-muted-foreground">{dateMap[date].length} bokningar</p>
                      </div>
                      <div className="divide-y divide-border">
                        {dateMap[date]
                          .sort((a, b) => a.time.localeCompare(b.time))
                          .map((booking) => (
                            <div key={booking.id} className="flex items-center gap-4 px-4 py-3">
                              <div className="font-mono text-sm font-medium w-20">{booking.time}</div>
                              <div className="flex-1">
                                <p className="text-sm font-medium">{booking.patientName}</p>
                                <p className="text-xs text-muted-foreground">{booking.practitioner} - {booking.type}</p>
                              </div>
                              <Badge variant="secondary" className={STATUS_COLORS[booking.status]}>
                                {STATUS_LABELS[booking.status]}
                              </Badge>
                              <span className="text-xs text-muted-foreground">{booking.duration} min</span>
                            </div>
                          ))}
                      </div>
                    </div>
                  ))
                })()}
              </div>
            )}
          </TabsContent>

          <TabsContent value="vantelista" className="space-y-6">
            <div className="flex items-center gap-3">
              <Button onClick={openWaitlistDialog}>
                <Plus className="mr-2 h-4 w-4" />
                Lägg till i väntelista
              </Button>
            </div>

            {waitlist.length === 0 ? (
              <EmptyModuleState
                icon={Users}
                title="Väntelistan är tom"
                description="Lägg till patienter som väntar på en ledig tid."
                actionLabel="Lägg till"
                onAction={openWaitlistDialog}
              />
            ) : (
              <div className="rounded-xl border border-border overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead className="font-medium">Patient</TableHead>
                      <TableHead className="font-medium">Önskat datum</TableHead>
                      <TableHead className="font-medium">Behandlare</TableHead>
                      <TableHead className="font-medium">Typ</TableHead>
                      <TableHead className="font-medium">Prioritet</TableHead>
                      <TableHead className="font-medium">Tillagd</TableHead>
                      <TableHead className="font-medium text-right">Åtgärder</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {waitlist
                      .sort((a, b) => {
                        const prio = { akut: 0, hög: 1, normal: 2 }
                        return (prio[a.priority] ?? 2) - (prio[b.priority] ?? 2)
                      })
                      .map((entry) => (
                        <TableRow key={entry.id}>
                          <TableCell className="font-medium">{entry.patientName}</TableCell>
                          <TableCell>{entry.requestedDate}</TableCell>
                          <TableCell>{entry.preferredPractitioner || '-'}</TableCell>
                          <TableCell><Badge variant="outline">{entry.type}</Badge></TableCell>
                          <TableCell>
                            <Badge variant="secondary" className={PRIORITY_COLORS[entry.priority]}>
                              {entry.priority.charAt(0).toUpperCase() + entry.priority.slice(1)}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">{entry.addedDate}</TableCell>
                          <TableCell className="text-right">
                            <Button variant="ghost" size="icon" className="text-red-600 hover:text-red-700" onClick={() => handleRemoveFromWaitlist(entry.id)} title="Ta bort">
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </ModuleWorkspaceShell>

      {/* Booking Dialog */}
      <Dialog open={bookingDialogOpen} onOpenChange={setBookingDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingBooking ? 'Redigera bokning' : 'Ny bokning'}</DialogTitle>
            <DialogDescription>
              {editingBooking ? 'Uppdatera bokningens uppgifter.' : 'Skapa en ny patientbokning.'}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="bk-name">Patientnamn *</Label>
                <Input id="bk-name" value={bookingForm.patientName} onChange={(e) => setBookingForm((f) => ({ ...f, patientName: e.target.value }))} placeholder="Anna Andersson" />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="bk-ref">Patientreferens</Label>
                <Input id="bk-ref" value={bookingForm.patientRef} onChange={(e) => setBookingForm((f) => ({ ...f, patientRef: e.target.value }))} placeholder="P-001" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="bk-pract">Behandlare *</Label>
                <Input id="bk-pract" value={bookingForm.practitioner} onChange={(e) => setBookingForm((f) => ({ ...f, practitioner: e.target.value }))} placeholder="Dr. Svensson" />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="bk-type">Bokningstyp *</Label>
                <Select value={bookingForm.type} onValueChange={(val) => setBookingForm((f) => ({ ...f, type: val as BookingType }))}>
                  <SelectTrigger id="bk-type"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {BOOKING_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="bk-date">Datum *</Label>
                <Input id="bk-date" type="date" value={bookingForm.date} onChange={(e) => setBookingForm((f) => ({ ...f, date: e.target.value }))} />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="bk-time">Tid *</Label>
                <Input id="bk-time" type="time" value={bookingForm.time} onChange={(e) => setBookingForm((f) => ({ ...f, time: e.target.value }))} />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="bk-dur">Längd (min)</Label>
                <Input id="bk-dur" type="number" min={5} step={5} value={bookingForm.duration} onChange={(e) => setBookingForm((f) => ({ ...f, duration: Number(e.target.value) }))} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="bk-status">Status</Label>
                <Select value={bookingForm.status} onValueChange={(val) => setBookingForm((f) => ({ ...f, status: val as BookingStatus }))}>
                  <SelectTrigger id="bk-status"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="confirmed">Bekräftad</SelectItem>
                    <SelectItem value="pending">Väntande</SelectItem>
                    <SelectItem value="completed">Genomförd</SelectItem>
                    <SelectItem value="cancelled">Avbokad</SelectItem>
                    <SelectItem value="no_show">Uteblev</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-3 justify-end">
                <div className="flex items-center gap-3">
                  <Switch checked={bookingForm.smsReminder} onCheckedChange={(c) => setBookingForm((f) => ({ ...f, smsReminder: c }))} />
                  <Label className="text-sm">SMS-påminnelse</Label>
                </div>
                <div className="flex items-center gap-3">
                  <Switch checked={bookingForm.onlineBooked} onCheckedChange={(c) => setBookingForm((f) => ({ ...f, onlineBooked: c }))} />
                  <Label className="text-sm">Onlinebokad</Label>
                </div>
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="bk-notes">Anteckning</Label>
              <Input id="bk-notes" value={bookingForm.notes} onChange={(e) => setBookingForm((f) => ({ ...f, notes: e.target.value }))} placeholder="Eventuella noteringar..." />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setBookingDialogOpen(false)}>Avbryt</Button>
            <Button onClick={handleSaveBooking} disabled={!bookingForm.patientName.trim() || !bookingForm.practitioner.trim()}>
              {editingBooking ? 'Uppdatera' : 'Skapa bokning'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Waitlist Dialog */}
      <Dialog open={waitlistDialogOpen} onOpenChange={setWaitlistDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Lägg till i väntelista</DialogTitle>
            <DialogDescription>Registrera en patient som väntar på en ledig tid.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Patientnamn *</Label>
                <Input value={waitlistForm.patientName} onChange={(e) => setWaitlistForm((f) => ({ ...f, patientName: e.target.value }))} />
              </div>
              <div className="grid gap-2">
                <Label>Patientreferens</Label>
                <Input value={waitlistForm.patientRef} onChange={(e) => setWaitlistForm((f) => ({ ...f, patientRef: e.target.value }))} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Önskat datum</Label>
                <Input type="date" value={waitlistForm.requestedDate} onChange={(e) => setWaitlistForm((f) => ({ ...f, requestedDate: e.target.value }))} />
              </div>
              <div className="grid gap-2">
                <Label>Prioritet</Label>
                <Select value={waitlistForm.priority} onValueChange={(val) => setWaitlistForm((f) => ({ ...f, priority: val as 'normal' | 'hög' | 'akut' }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="normal">Normal</SelectItem>
                    <SelectItem value="hög">Hög</SelectItem>
                    <SelectItem value="akut">Akut</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Önskad behandlare</Label>
                <Input value={waitlistForm.preferredPractitioner} onChange={(e) => setWaitlistForm((f) => ({ ...f, preferredPractitioner: e.target.value }))} />
              </div>
              <div className="grid gap-2">
                <Label>Typ</Label>
                <Select value={waitlistForm.type} onValueChange={(val) => setWaitlistForm((f) => ({ ...f, type: val as BookingType }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {BOOKING_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setWaitlistDialogOpen(false)}>Avbryt</Button>
            <Button onClick={handleSaveWaitlist} disabled={!waitlistForm.patientName.trim()}>Lägg till</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Ta bort bokning</DialogTitle>
            <DialogDescription>
              Är du säker på att du vill ta bort bokningen för{' '}
              <span className="font-semibold">{bookingToDelete?.patientName}</span>? Denna åtgärd kan inte ångras.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>Avbryt</Button>
            <Button variant="destructive" onClick={handleDeleteBooking}>
              <Trash2 className="mr-2 h-4 w-4" />
              Ta bort
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
