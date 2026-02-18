'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { ModuleWorkspaceShell } from '@/components/modules/ModuleWorkspaceShell'
import { EmptyModuleState } from '@/components/modules/shared/EmptyModuleState'
import { StatusBadge } from '@/components/modules/shared/StatusBadge'
import { KPICard } from '@/components/modules/shared/KPICard'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
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
  Calendar,
  Clock,
  Bell,
  Users,
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface ModuleWorkspaceProps {
  module: { slug: string; name: string; cat: string; desc: string; longDesc: string }
  sectorSlug: string
  settingsHref: string
}

type BookingStatus = 'confirmed' | 'completed' | 'cancelled' | 'no_show' | 'waiting'

interface Booking {
  id: string
  customerName: string
  customerPhone: string
  stylistName: string
  service: string
  date: string
  time: string
  duration: number
  status: BookingStatus
  smsReminder: boolean
  notes: string
}

const BOOKING_STATUS: { value: BookingStatus; label: string; variant: 'success' | 'info' | 'danger' | 'warning' | 'neutral' }[] = [
  { value: 'confirmed', label: 'Bekräftad', variant: 'success' },
  { value: 'completed', label: 'Genomförd', variant: 'info' },
  { value: 'cancelled', label: 'Avbokad', variant: 'danger' },
  { value: 'no_show', label: 'Utebliven', variant: 'danger' },
  { value: 'waiting', label: 'Väntelista', variant: 'warning' },
]

const STATUS_MAP = Object.fromEntries(BOOKING_STATUS.map((s) => [s.value, s]))

const SERVICES = [
  'Klippning dam',
  'Klippning herr',
  'Klippning barn',
  'Färgning',
  'Slingor',
  'Permanent',
  'Blowdry',
  'Behandling',
  'Brud/fest',
  'Skägg',
  'Övrigt',
]

function todayStr(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function generateId(): string {
  return Math.random().toString(36).substring(2, 11)
}

const EMPTY_FORM = {
  customerName: '',
  customerPhone: '',
  stylistName: '',
  service: 'Klippning dam',
  date: todayStr(),
  time: '10:00',
  duration: 60,
  status: 'confirmed' as BookingStatus,
  smsReminder: true,
  notes: '',
}

export function TidsbokningWorkspace({ module: mod, sectorSlug, settingsHref }: ModuleWorkspaceProps) {
  const supabase = createClient()

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [bookings, setBookings] = useState<Booking[]>([])
  const [filterDate, setFilterDate] = useState(todayStr)

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingBooking, setEditingBooking] = useState<Booking | null>(null)
  const [form, setForm] = useState(EMPTY_FORM)

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [bookingToDelete, setBookingToDelete] = useState<Booking | null>(null)

  const saveData = useCallback(async (data: Booking[]) => {
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setSaving(false); return }

    await supabase.from('module_configs').upsert(
      {
        user_id: user.id,
        sector_slug: sectorSlug,
        module_slug: mod.slug,
        config_key: 'bookings',
        config_value: data,
      },
      { onConflict: 'user_id,sector_slug,module_slug,config_key' }
    )
    setSaving(false)
  }, [supabase, sectorSlug, mod.slug])

  const fetchData = useCallback(async () => {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); return }

    const { data } = await supabase
      .from('module_configs')
      .select('config_value')
      .eq('user_id', user.id)
      .eq('sector_slug', sectorSlug)
      .eq('module_slug', mod.slug)
      .eq('config_key', 'bookings')
      .maybeSingle()

    if (data?.config_value && Array.isArray(data.config_value)) {
      setBookings(data.config_value as Booking[])
    }

    setLoading(false)
  }, [supabase, sectorSlug, mod.slug])

  useEffect(() => { fetchData() }, [fetchData])

  const todayBookings = useMemo(() => {
    return bookings
      .filter((b) => b.date === filterDate)
      .sort((a, b) => a.time.localeCompare(b.time))
  }, [bookings, filterDate])

  const waitingList = useMemo(() => {
    return bookings.filter((b) => b.status === 'waiting').sort((a, b) => a.date.localeCompare(b.date))
  }, [bookings])

  const kpis = useMemo(() => {
    const today = bookings.filter((b) => b.date === todayStr())
    const confirmed = today.filter((b) => b.status === 'confirmed').length
    const completed = today.filter((b) => b.status === 'completed').length
    const withReminder = today.filter((b) => b.smsReminder).length
    return { confirmed, completed, total: today.length, withReminder, waitingCount: waitingList.length }
  }, [bookings, waitingList])

  function openNew() {
    setEditingBooking(null)
    setForm({ ...EMPTY_FORM, date: filterDate })
    setDialogOpen(true)
  }

  function openEdit(booking: Booking) {
    setEditingBooking(booking)
    setForm({
      customerName: booking.customerName,
      customerPhone: booking.customerPhone,
      stylistName: booking.stylistName,
      service: booking.service,
      date: booking.date,
      time: booking.time,
      duration: booking.duration,
      status: booking.status,
      smsReminder: booking.smsReminder,
      notes: booking.notes,
    })
    setDialogOpen(true)
  }

  async function handleSave() {
    const newBooking: Booking = {
      id: editingBooking?.id ?? generateId(),
      customerName: form.customerName.trim(),
      customerPhone: form.customerPhone.trim(),
      stylistName: form.stylistName.trim(),
      service: form.service,
      date: form.date,
      time: form.time,
      duration: form.duration,
      status: form.status,
      smsReminder: form.smsReminder,
      notes: form.notes.trim(),
    }

    let updated: Booking[]
    if (editingBooking) {
      updated = bookings.map((b) => b.id === editingBooking.id ? newBooking : b)
    } else {
      updated = [...bookings, newBooking]
    }

    setBookings(updated)
    setDialogOpen(false)
    await saveData(updated)
  }

  function openDelete(booking: Booking) {
    setBookingToDelete(booking)
    setDeleteDialogOpen(true)
  }

  async function handleDelete() {
    if (!bookingToDelete) return
    const updated = bookings.filter((b) => b.id !== bookingToDelete.id)
    setBookings(updated)
    setDeleteDialogOpen(false)
    setBookingToDelete(null)
    await saveData(updated)
  }

  return (
    <>
      <ModuleWorkspaceShell
        title={mod.name}
        description={mod.desc}
        category="operativ"
        sectorName="Frisör & Skönhet"
        backHref={`/m/${sectorSlug}`}
        settingsHref={settingsHref}
        actions={
          <div className="flex items-center gap-2">
            <Input
              type="date"
              value={filterDate}
              onChange={(e) => setFilterDate(e.target.value)}
              className="h-9 w-44"
            />
            <Button onClick={openNew}>
              <Plus className="mr-2 h-4 w-4" />
              Ny bokning
            </Button>
          </div>
        }
      >
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <Tabs defaultValue="kalender" className="space-y-6">
            <TabsList>
              <TabsTrigger value="kalender">Dagsvy</TabsTrigger>
              <TabsTrigger value="vantelista">Väntelista ({kpis.waitingCount})</TabsTrigger>
            </TabsList>

            <TabsContent value="kalender" className="space-y-6">
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <KPICard label="Bokningar idag" value={String(kpis.total)} unit="st" />
                <KPICard label="Bekräftade" value={String(kpis.confirmed)} unit="st" />
                <KPICard label="Genomförda" value={String(kpis.completed)} unit="st" />
                <KPICard label="SMS-påminnelse" value={String(kpis.withReminder)} unit="st" />
              </div>

              {todayBookings.length === 0 ? (
                <EmptyModuleState
                  icon={Calendar}
                  title="Inga bokningar"
                  description={`Inga bokningar registrerade för ${filterDate}.`}
                  actionLabel="Ny bokning"
                  onAction={openNew}
                />
              ) : (
                <div className="space-y-3">
                  {todayBookings.map((booking) => (
                    <Card key={booking.id} className={cn(
                      'transition-colors',
                      booking.status === 'cancelled' || booking.status === 'no_show' ? 'opacity-60' : ''
                    )}>
                      <CardContent className="py-4">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-4">
                            <div className="text-center min-w-[60px]">
                              <p className="text-lg font-semibold tabular-nums">{booking.time}</p>
                              <p className="text-xs text-muted-foreground">{booking.duration} min</p>
                            </div>
                            <div className="border-l border-border pl-4">
                              <p className="font-medium">{booking.customerName}</p>
                              <p className="text-sm text-muted-foreground">{booking.service} - {booking.stylistName}</p>
                              {booking.customerPhone && (
                                <p className="text-xs text-muted-foreground">{booking.customerPhone}</p>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-3">
                            {booking.smsReminder && (
                              <Bell className="h-3.5 w-3.5 text-muted-foreground" />
                            )}
                            <StatusBadge
                              label={STATUS_MAP[booking.status]?.label ?? booking.status}
                              variant={STATUS_MAP[booking.status]?.variant ?? 'neutral'}
                            />
                            <div className="flex items-center gap-1">
                              <Button variant="ghost" size="icon" onClick={() => openEdit(booking)} title="Redigera">
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <Button variant="ghost" size="icon" className="text-red-600 hover:text-red-700" onClick={() => openDelete(booking)} title="Ta bort">
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>
                        </div>
                        {booking.notes && (
                          <p className="text-xs text-muted-foreground mt-2 ml-[76px] pl-4 border-l border-border">{booking.notes}</p>
                        )}
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}

              {saving && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Sparar...
                </div>
              )}
            </TabsContent>

            <TabsContent value="vantelista" className="space-y-6">
              {waitingList.length === 0 ? (
                <EmptyModuleState
                  icon={Users}
                  title="Väntelistan är tom"
                  description="Kunder på väntelistan visas här. Skapa en bokning med status 'Väntelista' för att lägga till."
                />
              ) : (
                <div className="rounded-xl border border-border overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/50">
                        <TableHead className="font-medium">Kund</TableHead>
                        <TableHead className="font-medium">Telefon</TableHead>
                        <TableHead className="font-medium">Tjänst</TableHead>
                        <TableHead className="font-medium">Önskat datum</TableHead>
                        <TableHead className="font-medium">Stylist</TableHead>
                        <TableHead className="font-medium text-right">Åtgärd</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {waitingList.map((b) => (
                        <TableRow key={b.id}>
                          <TableCell className="font-medium">{b.customerName}</TableCell>
                          <TableCell>{b.customerPhone || '-'}</TableCell>
                          <TableCell>{b.service}</TableCell>
                          <TableCell>{b.date}</TableCell>
                          <TableCell>{b.stylistName || '-'}</TableCell>
                          <TableCell className="text-right">
                            <Button variant="outline" size="sm" onClick={() => openEdit(b)}>
                              Boka in
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
        )}
      </ModuleWorkspaceShell>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingBooking ? 'Redigera bokning' : 'Ny bokning'}</DialogTitle>
            <DialogDescription>
              {editingBooking ? 'Uppdatera bokningens uppgifter.' : 'Fyll i uppgifter för den nya bokningen.'}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="bk-name">Kundnamn *</Label>
                <Input
                  id="bk-name"
                  value={form.customerName}
                  onChange={(e) => setForm((f) => ({ ...f, customerName: e.target.value }))}
                  placeholder="Anna Andersson"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="bk-phone">Telefon</Label>
                <Input
                  id="bk-phone"
                  value={form.customerPhone}
                  onChange={(e) => setForm((f) => ({ ...f, customerPhone: e.target.value }))}
                  placeholder="070-123 45 67"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="bk-service">Tjänst *</Label>
                <Select
                  value={form.service}
                  onValueChange={(val) => setForm((f) => ({ ...f, service: val }))}
                >
                  <SelectTrigger id="bk-service">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SERVICES.map((s) => (
                      <SelectItem key={s} value={s}>{s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="bk-stylist">Stylist</Label>
                <Input
                  id="bk-stylist"
                  value={form.stylistName}
                  onChange={(e) => setForm((f) => ({ ...f, stylistName: e.target.value }))}
                  placeholder="Lisa"
                />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="bk-date">Datum *</Label>
                <Input
                  id="bk-date"
                  type="date"
                  value={form.date}
                  onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="bk-time">Tid *</Label>
                <Input
                  id="bk-time"
                  type="time"
                  value={form.time}
                  onChange={(e) => setForm((f) => ({ ...f, time: e.target.value }))}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="bk-dur">Längd (min)</Label>
                <Input
                  id="bk-dur"
                  type="number"
                  min={15}
                  step={15}
                  value={form.duration}
                  onChange={(e) => setForm((f) => ({ ...f, duration: Number(e.target.value) }))}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="bk-status">Status</Label>
                <Select
                  value={form.status}
                  onValueChange={(val) => setForm((f) => ({ ...f, status: val as BookingStatus }))}
                >
                  <SelectTrigger id="bk-status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {BOOKING_STATUS.map((s) => (
                      <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="bk-notes">Anteckning</Label>
                <Input
                  id="bk-notes"
                  value={form.notes}
                  onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                  placeholder="Valfri notering"
                />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                id="bk-sms"
                checked={form.smsReminder}
                onCheckedChange={(checked) => setForm((f) => ({ ...f, smsReminder: !!checked }))}
              />
              <Label htmlFor="bk-sms" className="text-sm cursor-pointer">Skicka SMS-påminnelse</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Avbryt</Button>
            <Button onClick={handleSave} disabled={!form.customerName.trim()}>
              {editingBooking ? 'Uppdatera' : 'Skapa bokning'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Ta bort bokning</DialogTitle>
            <DialogDescription>
              Är du säker på att du vill ta bort bokningen för {bookingToDelete?.customerName} ({bookingToDelete?.date} {bookingToDelete?.time})?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>Avbryt</Button>
            <Button variant="destructive" onClick={handleDelete}>
              <Trash2 className="mr-2 h-4 w-4" />
              Ta bort
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
