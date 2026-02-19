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
import { Textarea } from '@/components/ui/textarea'
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
  CalendarDays,
  BedDouble,
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface ModuleWorkspaceProps {
  module: { slug: string; name: string; cat: string; desc: string; longDesc: string }
  sectorSlug: string
  settingsHref: string
}

type RoomType = 'Standard' | 'Superior' | 'Svit' | 'Familj' | 'Budget'
type BookingStatus = 'bekraftad' | 'incheckad' | 'utcheckad' | 'avbokad'

interface Room {
  id: string
  number: string
  type: RoomType
  floor: number
  pricePerNight: number
}

interface Booking {
  id: string
  roomId: string
  guestName: string
  guestEmail: string
  guestPhone: string
  checkinDate: string
  checkoutDate: string
  roomType: RoomType
  pricePerNight: number
  totalPrice: number
  status: BookingStatus
  notes: string
}

const ROOM_TYPES: RoomType[] = ['Standard', 'Superior', 'Svit', 'Familj', 'Budget']
const BOOKING_STATUSES: BookingStatus[] = ['bekraftad', 'incheckad', 'utcheckad', 'avbokad']

const STATUS_MAP: Record<BookingStatus, { label: string; color: string }> = {
  bekraftad: { label: 'Bekräftad', color: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400' },
  incheckad: { label: 'Incheckad', color: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400' },
  utcheckad: { label: 'Utcheckad', color: 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400' },
  avbokad: { label: 'Avbokad', color: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400' },
}

const DEFAULT_ROOMS: Room[] = [
  { id: '101', number: '101', type: 'Standard', floor: 1, pricePerNight: 990 },
  { id: '102', number: '102', type: 'Standard', floor: 1, pricePerNight: 990 },
  { id: '103', number: '103', type: 'Superior', floor: 1, pricePerNight: 1490 },
  { id: '201', number: '201', type: 'Superior', floor: 2, pricePerNight: 1490 },
  { id: '202', number: '202', type: 'Svit', floor: 2, pricePerNight: 2490 },
  { id: '203', number: '203', type: 'Familj', floor: 2, pricePerNight: 1790 },
  { id: '301', number: '301', type: 'Standard', floor: 3, pricePerNight: 990 },
  { id: '302', number: '302', type: 'Budget', floor: 3, pricePerNight: 690 },
]

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7)
}

function fmt(n: number): string {
  return new Intl.NumberFormat('sv-SE', { maximumFractionDigits: 0 }).format(n)
}

function todayStr(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function daysBetween(d1: string, d2: string): number {
  const diff = new Date(d2).getTime() - new Date(d1).getTime()
  return Math.max(1, Math.ceil(diff / (1000 * 60 * 60 * 24)))
}

export function RumsbokningWorkspace({ module: mod, sectorSlug, settingsHref }: ModuleWorkspaceProps) {
  const supabase = createClient()

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [rooms, setRooms] = useState<Room[]>([])
  const [bookings, setBookings] = useState<Booking[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [filterStatus, setFilterStatus] = useState<BookingStatus | 'all'>('all')

  // Booking dialog
  const [bookingDialogOpen, setBookingDialogOpen] = useState(false)
  const [editingBooking, setEditingBooking] = useState<Booking | null>(null)
  const [bookingForm, setBookingForm] = useState({
    roomId: '',
    guestName: '',
    guestEmail: '',
    guestPhone: '',
    checkinDate: todayStr(),
    checkoutDate: '',
    roomType: 'Standard' as RoomType,
    pricePerNight: 990,
    status: 'bekraftad' as BookingStatus,
    notes: '',
  })

  // Room dialog
  const [roomDialogOpen, setRoomDialogOpen] = useState(false)
  const [editingRoom, setEditingRoom] = useState<Room | null>(null)
  const [roomForm, setRoomForm] = useState({ number: '', type: 'Standard' as RoomType, floor: 1, pricePerNight: 990 })

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [bookingToDelete, setBookingToDelete] = useState<Booking | null>(null)

  // Calendar date
  const [calendarDate, setCalendarDate] = useState(todayStr())

  const saveData = useCallback(async (newRooms: Room[], newBookings: Booking[]) => {
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setSaving(false); return }

    await Promise.all([
      supabase.from('module_configs').upsert(
        { user_id: user.id, sector_slug: sectorSlug, module_slug: mod.slug, config_key: 'rooms', config_value: newRooms },
        { onConflict: 'user_id,sector_slug,module_slug,config_key' }
      ),
      supabase.from('module_configs').upsert(
        { user_id: user.id, sector_slug: sectorSlug, module_slug: mod.slug, config_key: 'bookings', config_value: newBookings },
        { onConflict: 'user_id,sector_slug,module_slug,config_key' }
      ),
    ])
    setSaving(false)
  }, [supabase, sectorSlug, mod.slug])

  const fetchData = useCallback(async () => {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); return }

    const { data: rows } = await supabase
      .from('module_configs')
      .select('config_key, config_value')
      .eq('user_id', user.id)
      .eq('sector_slug', sectorSlug)
      .eq('module_slug', mod.slug)
      .in('config_key', ['rooms', 'bookings'])

    let loadedRooms = DEFAULT_ROOMS
    let loadedBookings: Booking[] = []

    for (const row of rows ?? []) {
      if (row.config_key === 'rooms' && Array.isArray(row.config_value) && row.config_value.length > 0) {
        loadedRooms = row.config_value as Room[]
      }
      if (row.config_key === 'bookings' && Array.isArray(row.config_value)) {
        loadedBookings = row.config_value as Booking[]
      }
    }

    setRooms(loadedRooms)
    setBookings(loadedBookings)

    if (!(rows ?? []).find(r => r.config_key === 'rooms')) {
      await supabase.from('module_configs').upsert(
        { user_id: user.id, sector_slug: sectorSlug, module_slug: mod.slug, config_key: 'rooms', config_value: DEFAULT_ROOMS },
        { onConflict: 'user_id,sector_slug,module_slug,config_key' }
      )
    }

    setLoading(false)
  }, [supabase, sectorSlug, mod.slug])

  useEffect(() => { fetchData() }, [fetchData])

  const filteredBookings = useMemo(() => {
    let result = bookings
    if (filterStatus !== 'all') result = result.filter(b => b.status === filterStatus)
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      result = result.filter(b => b.guestName.toLowerCase().includes(q) || b.roomId.includes(q))
    }
    return result.sort((a, b) => a.checkinDate.localeCompare(b.checkinDate))
  }, [bookings, filterStatus, searchQuery])

  // Room availability for a given date
  function isRoomAvailable(roomId: string, checkin: string, checkout: string, excludeBookingId?: string): boolean {
    return !bookings.some(b =>
      b.roomId === roomId &&
      b.status !== 'avbokad' &&
      b.status !== 'utcheckad' &&
      b.id !== excludeBookingId &&
      b.checkinDate < checkout &&
      b.checkoutDate > checkin
    )
  }

  // Calendar data: rooms with booking status for selected date
  const calendarData = useMemo(() => {
    return rooms.map(room => {
      const booking = bookings.find(b =>
        b.roomId === room.id &&
        b.status !== 'avbokad' &&
        b.status !== 'utcheckad' &&
        b.checkinDate <= calendarDate &&
        b.checkoutDate > calendarDate
      )
      return { room, booking, available: !booking }
    })
  }, [rooms, bookings, calendarDate])

  // Booking CRUD
  function openNewBooking(preselectedRoomId?: string) {
    setEditingBooking(null)
    const room = preselectedRoomId ? rooms.find(r => r.id === preselectedRoomId) : rooms[0]
    setBookingForm({
      roomId: room?.id ?? '',
      guestName: '',
      guestEmail: '',
      guestPhone: '',
      checkinDate: todayStr(),
      checkoutDate: '',
      roomType: room?.type ?? 'Standard',
      pricePerNight: room?.pricePerNight ?? 990,
      status: 'bekraftad',
      notes: '',
    })
    setBookingDialogOpen(true)
  }

  function openEditBooking(booking: Booking) {
    setEditingBooking(booking)
    setBookingForm({
      roomId: booking.roomId,
      guestName: booking.guestName,
      guestEmail: booking.guestEmail,
      guestPhone: booking.guestPhone,
      checkinDate: booking.checkinDate,
      checkoutDate: booking.checkoutDate,
      roomType: booking.roomType,
      pricePerNight: booking.pricePerNight,
      status: booking.status,
      notes: booking.notes,
    })
    setBookingDialogOpen(true)
  }

  async function handleSaveBooking() {
    const nights = daysBetween(bookingForm.checkinDate, bookingForm.checkoutDate)
    const totalPrice = bookingForm.pricePerNight * nights

    const item: Booking = {
      id: editingBooking?.id ?? generateId(),
      roomId: bookingForm.roomId,
      guestName: bookingForm.guestName.trim(),
      guestEmail: bookingForm.guestEmail.trim(),
      guestPhone: bookingForm.guestPhone.trim(),
      checkinDate: bookingForm.checkinDate,
      checkoutDate: bookingForm.checkoutDate,
      roomType: bookingForm.roomType,
      pricePerNight: bookingForm.pricePerNight,
      totalPrice,
      status: bookingForm.status,
      notes: bookingForm.notes.trim(),
    }

    let updated: Booking[]
    if (editingBooking) {
      updated = bookings.map(b => b.id === editingBooking.id ? item : b)
    } else {
      updated = [...bookings, item]
    }
    setBookings(updated)
    setBookingDialogOpen(false)
    await saveData(rooms, updated)
  }

  async function handleDeleteBooking() {
    if (!bookingToDelete) return
    const updated = bookings.filter(b => b.id !== bookingToDelete.id)
    setBookings(updated)
    setDeleteDialogOpen(false)
    setBookingToDelete(null)
    await saveData(rooms, updated)
  }

  // Room CRUD
  function openNewRoom() {
    setEditingRoom(null)
    setRoomForm({ number: '', type: 'Standard', floor: 1, pricePerNight: 990 })
    setRoomDialogOpen(true)
  }

  function openEditRoom(room: Room) {
    setEditingRoom(room)
    setRoomForm({ number: room.number, type: room.type, floor: room.floor, pricePerNight: room.pricePerNight })
    setRoomDialogOpen(true)
  }

  async function handleSaveRoom() {
    const item: Room = {
      id: editingRoom?.id ?? generateId(),
      number: roomForm.number.trim(),
      type: roomForm.type,
      floor: roomForm.floor,
      pricePerNight: roomForm.pricePerNight,
    }
    let updated: Room[]
    if (editingRoom) {
      updated = rooms.map(r => r.id === editingRoom.id ? item : r)
    } else {
      updated = [...rooms, item]
    }
    setRooms(updated)
    setRoomDialogOpen(false)
    await saveData(updated, bookings)
  }

  async function handleDeleteRoom(id: string) {
    const updated = rooms.filter(r => r.id !== id)
    setRooms(updated)
    await saveData(updated, bookings)
  }

  return (
    <>
      <ModuleWorkspaceShell
        title={mod.name}
        description={mod.desc}
        category="operativ"
        sectorName="Hotell & Boende"
        backHref={`/m/${sectorSlug}`}
        settingsHref={settingsHref}
        actions={
          <Button onClick={() => openNewBooking()}>
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
          <Tabs defaultValue="kalender" className="space-y-6">
            <TabsList>
              <TabsTrigger value="kalender">Rumskalender</TabsTrigger>
              <TabsTrigger value="bokningar">Bokningslista</TabsTrigger>
              <TabsTrigger value="rum">Hantera rum</TabsTrigger>
            </TabsList>

            {/* Calendar tab */}
            <TabsContent value="kalender" className="space-y-6">
              <div className="flex items-center gap-3">
                <Label>Datum:</Label>
                <Input type="date" value={calendarDate} onChange={e => setCalendarDate(e.target.value)} className="w-44" />
              </div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {calendarData.map(({ room, booking, available }) => (
                  <Card key={room.id} className={cn('cursor-pointer transition-colors', available ? 'hover:border-emerald-500/50' : 'border-red-500/30')}>
                    <CardHeader className="pb-2 flex flex-row items-center justify-between">
                      <CardTitle className="text-base">Rum {room.number}</CardTitle>
                      <Badge variant="secondary" className={available ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'}>
                        {available ? 'Ledigt' : 'Belagt'}
                      </Badge>
                    </CardHeader>
                    <CardContent className="text-sm space-y-1">
                      <p className="text-muted-foreground">{room.type} - Vån. {room.floor}</p>
                      <p className="font-mono">{fmt(room.pricePerNight)} kr/natt</p>
                      {booking && (
                        <div className="pt-1 border-t border-border mt-2">
                          <p className="font-medium">{booking.guestName}</p>
                          <p className="text-xs text-muted-foreground">{booking.checkinDate} - {booking.checkoutDate}</p>
                        </div>
                      )}
                      {available && (
                        <Button variant="outline" size="sm" className="mt-2 w-full" onClick={() => openNewBooking(room.id)}>
                          <Plus className="mr-1 h-3 w-3" />Boka
                        </Button>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            </TabsContent>

            {/* Bookings tab */}
            <TabsContent value="bokningar" className="space-y-6">
              <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
                <div className="relative flex-1 max-w-sm">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input placeholder="Sök gäst eller rum..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="pl-9" />
                </div>
                <Select value={filterStatus} onValueChange={val => setFilterStatus(val as BookingStatus | 'all')}>
                  <SelectTrigger className="w-[180px]"><SelectValue placeholder="Filtrera status" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Alla statusar</SelectItem>
                    {BOOKING_STATUSES.map(s => <SelectItem key={s} value={s}>{STATUS_MAP[s].label}</SelectItem>)}
                  </SelectContent>
                </Select>
                {saving && <div className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" />Sparar...</div>}
              </div>

              {filteredBookings.length === 0 ? (
                <EmptyModuleState icon={CalendarDays} title="Inga bokningar" description="Skapa en bokning för att komma igång." actionLabel="Ny bokning" onAction={() => openNewBooking()} />
              ) : (
                <div className="rounded-xl border border-border overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/50">
                        <TableHead className="font-medium">Gäst</TableHead>
                        <TableHead className="font-medium">Rum</TableHead>
                        <TableHead className="font-medium">Incheckning</TableHead>
                        <TableHead className="font-medium">Utcheckning</TableHead>
                        <TableHead className="font-medium text-right">Totalt</TableHead>
                        <TableHead className="font-medium">Status</TableHead>
                        <TableHead className="font-medium text-right">Åtgärder</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredBookings.map(b => (
                        <TableRow key={b.id}>
                          <TableCell className="font-medium">{b.guestName}</TableCell>
                          <TableCell>Rum {b.roomId} ({b.roomType})</TableCell>
                          <TableCell>{b.checkinDate}</TableCell>
                          <TableCell>{b.checkoutDate}</TableCell>
                          <TableCell className="text-right font-mono">{fmt(b.totalPrice)} kr</TableCell>
                          <TableCell>
                            <Badge variant="secondary" className={STATUS_MAP[b.status].color}>{STATUS_MAP[b.status].label}</Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-1">
                              <Button variant="ghost" size="icon" onClick={() => openEditBooking(b)} title="Redigera"><Pencil className="h-4 w-4" /></Button>
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

            {/* Rooms tab */}
            <TabsContent value="rum" className="space-y-6">
              <div className="flex justify-end">
                <Button onClick={openNewRoom} size="sm"><Plus className="mr-2 h-4 w-4" />Nytt rum</Button>
              </div>
              <div className="rounded-xl border border-border overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead className="font-medium">Rumsnr</TableHead>
                      <TableHead className="font-medium">Typ</TableHead>
                      <TableHead className="font-medium">Våning</TableHead>
                      <TableHead className="font-medium text-right">Pris/natt</TableHead>
                      <TableHead className="font-medium text-right">Åtgärder</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rooms.map(room => (
                      <TableRow key={room.id}>
                        <TableCell className="font-mono font-medium">{room.number}</TableCell>
                        <TableCell>{room.type}</TableCell>
                        <TableCell>{room.floor}</TableCell>
                        <TableCell className="text-right font-mono">{fmt(room.pricePerNight)} kr</TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button variant="ghost" size="icon" onClick={() => openEditRoom(room)} title="Redigera"><Pencil className="h-4 w-4" /></Button>
                            <Button variant="ghost" size="icon" className="text-red-600 hover:text-red-700" onClick={() => handleDeleteRoom(room.id)} title="Ta bort"><Trash2 className="h-4 w-4" /></Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </TabsContent>
          </Tabs>
        )}
      </ModuleWorkspaceShell>

      {/* Booking Dialog */}
      <Dialog open={bookingDialogOpen} onOpenChange={setBookingDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingBooking ? 'Redigera bokning' : 'Ny bokning'}</DialogTitle>
            <DialogDescription>Fyll i gästuppgifter och välj rum.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2 max-h-[60vh] overflow-y-auto">
            <div className="grid gap-2">
              <Label>Gästnamn *</Label>
              <Input value={bookingForm.guestName} onChange={e => setBookingForm(f => ({ ...f, guestName: e.target.value }))} placeholder="Anna Andersson" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>E-post</Label>
                <Input type="email" value={bookingForm.guestEmail} onChange={e => setBookingForm(f => ({ ...f, guestEmail: e.target.value }))} placeholder="anna@example.com" />
              </div>
              <div className="grid gap-2">
                <Label>Telefon</Label>
                <Input value={bookingForm.guestPhone} onChange={e => setBookingForm(f => ({ ...f, guestPhone: e.target.value }))} placeholder="070-123 45 67" />
              </div>
            </div>
            <div className="grid gap-2">
              <Label>Rum *</Label>
              <Select value={bookingForm.roomId} onValueChange={val => {
                const room = rooms.find(r => r.id === val)
                setBookingForm(f => ({ ...f, roomId: val, roomType: room?.type ?? f.roomType, pricePerNight: room?.pricePerNight ?? f.pricePerNight }))
              }}>
                <SelectTrigger><SelectValue placeholder="Välj rum" /></SelectTrigger>
                <SelectContent>
                  {rooms.map(r => <SelectItem key={r.id} value={r.id}>Rum {r.number} - {r.type} ({fmt(r.pricePerNight)} kr/natt)</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Incheckning *</Label>
                <Input type="date" value={bookingForm.checkinDate} onChange={e => setBookingForm(f => ({ ...f, checkinDate: e.target.value }))} />
              </div>
              <div className="grid gap-2">
                <Label>Utcheckning *</Label>
                <Input type="date" value={bookingForm.checkoutDate} onChange={e => setBookingForm(f => ({ ...f, checkoutDate: e.target.value }))} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Pris/natt (kr)</Label>
                <Input type="number" min={0} value={bookingForm.pricePerNight || ''} onChange={e => setBookingForm(f => ({ ...f, pricePerNight: parseFloat(e.target.value) || 0 }))} />
              </div>
              <div className="grid gap-2">
                <Label>Status</Label>
                <Select value={bookingForm.status} onValueChange={val => setBookingForm(f => ({ ...f, status: val as BookingStatus }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{BOOKING_STATUSES.map(s => <SelectItem key={s} value={s}>{STATUS_MAP[s].label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            {bookingForm.checkinDate && bookingForm.checkoutDate && bookingForm.checkoutDate > bookingForm.checkinDate && (
              <div className="rounded-lg bg-muted/50 p-3 text-sm space-y-1">
                <div className="flex justify-between"><span className="text-muted-foreground">Nätter:</span><span>{daysBetween(bookingForm.checkinDate, bookingForm.checkoutDate)}</span></div>
                <div className="flex justify-between font-semibold"><span>Totalt:</span><span className="font-mono">{fmt(bookingForm.pricePerNight * daysBetween(bookingForm.checkinDate, bookingForm.checkoutDate))} kr</span></div>
              </div>
            )}
            <div className="grid gap-2">
              <Label>Anteckningar</Label>
              <Textarea value={bookingForm.notes} onChange={e => setBookingForm(f => ({ ...f, notes: e.target.value }))} rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBookingDialogOpen(false)}>Avbryt</Button>
            <Button onClick={handleSaveBooking} disabled={!bookingForm.guestName.trim() || !bookingForm.roomId || !bookingForm.checkinDate || !bookingForm.checkoutDate}>
              {editingBooking ? 'Uppdatera' : 'Skapa bokning'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Room Dialog */}
      <Dialog open={roomDialogOpen} onOpenChange={setRoomDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{editingRoom ? 'Redigera rum' : 'Nytt rum'}</DialogTitle>
            <DialogDescription>Ange rumsinformation.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Rumsnummer *</Label>
                <Input value={roomForm.number} onChange={e => setRoomForm(f => ({ ...f, number: e.target.value }))} placeholder="101" />
              </div>
              <div className="grid gap-2">
                <Label>Våning</Label>
                <Input type="number" min={1} value={roomForm.floor} onChange={e => setRoomForm(f => ({ ...f, floor: parseInt(e.target.value) || 1 }))} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Rumstyp</Label>
                <Select value={roomForm.type} onValueChange={val => setRoomForm(f => ({ ...f, type: val as RoomType }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{ROOM_TYPES.map(rt => <SelectItem key={rt} value={rt}>{rt}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label>Pris/natt (kr)</Label>
                <Input type="number" min={0} value={roomForm.pricePerNight || ''} onChange={e => setRoomForm(f => ({ ...f, pricePerNight: parseFloat(e.target.value) || 0 }))} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRoomDialogOpen(false)}>Avbryt</Button>
            <Button onClick={handleSaveRoom} disabled={!roomForm.number.trim()}>{editingRoom ? 'Uppdatera' : 'Skapa rum'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Ta bort bokning</DialogTitle>
            <DialogDescription>Är du säker på att du vill ta bort bokningen för {bookingToDelete?.guestName}?</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>Avbryt</Button>
            <Button variant="destructive" onClick={handleDeleteBooking}><Trash2 className="mr-2 h-4 w-4" />Ta bort</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
