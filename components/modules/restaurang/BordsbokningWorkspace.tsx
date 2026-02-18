'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { ModuleWorkspaceShell } from '@/components/modules/ModuleWorkspaceShell'
import { StatusBadge } from '@/components/modules/shared/StatusBadge'
import { EmptyModuleState } from '@/components/modules/shared/EmptyModuleState'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
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
  CalendarDays,
  Clock,
  Users,
  Plus,
  Pencil,
  Trash2,
  Loader2,
  Armchair,
} from 'lucide-react'

interface ModuleWorkspaceProps {
  module: { slug: string; name: string; cat: string; desc: string; longDesc: string }
  sectorSlug: string
  settingsHref: string
}

interface Reservation {
  id: string
  user_id: string
  guest_name: string
  guest_phone: string | null
  guest_email: string | null
  party_size: number
  date: string
  time_start: string
  time_end: string | null
  table_id: string | null
  notes: string | null
  status: string
  restaurant_tables?: RestaurantTable | null
}

interface RestaurantTable {
  id: string
  user_id: string
  name: string
  capacity: number
  zone: string | null
  is_active: boolean
}

type ReservationStatus = 'confirmed' | 'seated' | 'completed' | 'no_show' | 'cancelled'

const STATUS_VARIANT_MAP: Record<ReservationStatus, 'success' | 'warning' | 'danger' | 'info' | 'neutral'> = {
  confirmed: 'info',
  seated: 'warning',
  completed: 'success',
  no_show: 'danger',
  cancelled: 'neutral',
}

const STATUS_LABELS: Record<ReservationStatus, string> = {
  confirmed: 'Bekr\u00e4ftad',
  seated: 'Sittande',
  completed: 'Klar',
  no_show: 'No-show',
  cancelled: 'Avbokad',
}

const EMPTY_RESERVATION_FORM = {
  guest_name: '',
  guest_phone: '',
  guest_email: '',
  party_size: 2,
  date: '',
  time_start: '',
  time_end: '',
  table_id: '',
  notes: '',
}

const EMPTY_TABLE_FORM = {
  name: '',
  capacity: 4,
  zone: '',
  is_active: true,
}

function todayISO(): string {
  return new Date().toISOString().split('T')[0]
}

export function BordsbokningWorkspace({ module: mod, sectorSlug, settingsHref }: ModuleWorkspaceProps) {
  const supabase = createClient()

  // Shared state
  const [activeTab, setActiveTab] = useState('idag')
  const [loading, setLoading] = useState(true)

  // Reservations state
  const [reservations, setReservations] = useState<Reservation[]>([])
  const [calendarDate, setCalendarDate] = useState(todayISO())
  const [calendarReservations, setCalendarReservations] = useState<Reservation[]>([])
  const [calendarLoading, setCalendarLoading] = useState(false)

  // Tables state
  const [tables, setTables] = useState<RestaurantTable[]>([])
  const [tablesLoading, setTablesLoading] = useState(true)

  // Reservation dialog
  const [reservationDialogOpen, setReservationDialogOpen] = useState(false)
  const [editingReservation, setEditingReservation] = useState<Reservation | null>(null)
  const [reservationForm, setReservationForm] = useState(EMPTY_RESERVATION_FORM)
  const [savingReservation, setSavingReservation] = useState(false)

  // Table dialog
  const [tableDialogOpen, setTableDialogOpen] = useState(false)
  const [editingTable, setEditingTable] = useState<RestaurantTable | null>(null)
  const [tableForm, setTableForm] = useState(EMPTY_TABLE_FORM)
  const [savingTable, setSavingTable] = useState(false)

  // ===== Data fetching =====
  const fetchTodayReservations = useCallback(async () => {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); return }

    const { data } = await supabase
      .from('reservations')
      .select('*, restaurant_tables(*)')
      .eq('user_id', user.id)
      .eq('date', todayISO())
      .order('time_start', { ascending: true })

    setReservations(data ?? [])
    setLoading(false)
  }, [supabase])

  const fetchReservationsForDate = useCallback(async (date: string) => {
    setCalendarLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setCalendarLoading(false); return }

    const { data } = await supabase
      .from('reservations')
      .select('*, restaurant_tables(*)')
      .eq('user_id', user.id)
      .eq('date', date)
      .order('time_start', { ascending: true })

    setCalendarReservations(data ?? [])
    setCalendarLoading(false)
  }, [supabase])

  const fetchTables = useCallback(async () => {
    setTablesLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setTablesLoading(false); return }

    const { data } = await supabase
      .from('restaurant_tables')
      .select('*')
      .eq('user_id', user.id)
      .order('name', { ascending: true })

    setTables(data ?? [])
    setTablesLoading(false)
  }, [supabase])

  useEffect(() => { fetchTodayReservations() }, [fetchTodayReservations])
  useEffect(() => { fetchTables() }, [fetchTables])

  useEffect(() => {
    if (activeTab === 'kalender' && calendarDate) {
      fetchReservationsForDate(calendarDate)
    }
  }, [activeTab, calendarDate, fetchReservationsForDate])

  // ===== Status change =====
  async function handleStatusChange(reservationId: string, newStatus: ReservationStatus) {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    await supabase
      .from('reservations')
      .update({ status: newStatus })
      .eq('id', reservationId)
      .eq('user_id', user.id)

    fetchTodayReservations()
    if (activeTab === 'kalender') fetchReservationsForDate(calendarDate)
  }

  // ===== Reservation CRUD =====
  function openNewReservation() {
    setEditingReservation(null)
    setReservationForm({ ...EMPTY_RESERVATION_FORM, date: todayISO() })
    setReservationDialogOpen(true)
  }

  function openEditReservation(reservation: Reservation) {
    setEditingReservation(reservation)
    setReservationForm({
      guest_name: reservation.guest_name,
      guest_phone: reservation.guest_phone ?? '',
      guest_email: reservation.guest_email ?? '',
      party_size: reservation.party_size,
      date: reservation.date,
      time_start: reservation.time_start,
      time_end: reservation.time_end ?? '',
      table_id: reservation.table_id ?? '',
      notes: reservation.notes ?? '',
    })
    setReservationDialogOpen(true)
  }

  async function handleSaveReservation() {
    setSavingReservation(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setSavingReservation(false); return }

    const payload = {
      user_id: user.id,
      guest_name: reservationForm.guest_name,
      guest_phone: reservationForm.guest_phone || null,
      guest_email: reservationForm.guest_email || null,
      party_size: reservationForm.party_size,
      date: reservationForm.date,
      time_start: reservationForm.time_start,
      time_end: reservationForm.time_end || null,
      table_id: reservationForm.table_id || null,
      notes: reservationForm.notes || null,
      status: editingReservation?.status ?? 'confirmed',
    }

    if (editingReservation) {
      await supabase
        .from('reservations')
        .update(payload)
        .eq('id', editingReservation.id)
        .eq('user_id', user.id)
    } else {
      await supabase.from('reservations').insert(payload)
    }

    setSavingReservation(false)
    setReservationDialogOpen(false)
    fetchTodayReservations()
    if (activeTab === 'kalender') fetchReservationsForDate(calendarDate)
  }

  async function handleDeleteReservation(id: string) {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    await supabase
      .from('reservations')
      .delete()
      .eq('id', id)
      .eq('user_id', user.id)

    fetchTodayReservations()
    if (activeTab === 'kalender') fetchReservationsForDate(calendarDate)
  }

  // ===== Table CRUD =====
  function openNewTable() {
    setEditingTable(null)
    setTableForm({ ...EMPTY_TABLE_FORM })
    setTableDialogOpen(true)
  }

  function openEditTable(table: RestaurantTable) {
    setEditingTable(table)
    setTableForm({
      name: table.name,
      capacity: table.capacity,
      zone: table.zone ?? '',
      is_active: table.is_active,
    })
    setTableDialogOpen(true)
  }

  async function handleSaveTable() {
    setSavingTable(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setSavingTable(false); return }

    const payload = {
      user_id: user.id,
      name: tableForm.name,
      capacity: tableForm.capacity,
      zone: tableForm.zone || null,
      is_active: tableForm.is_active,
    }

    if (editingTable) {
      await supabase
        .from('restaurant_tables')
        .update(payload)
        .eq('id', editingTable.id)
        .eq('user_id', user.id)
    } else {
      await supabase.from('restaurant_tables').insert(payload)
    }

    setSavingTable(false)
    setTableDialogOpen(false)
    fetchTables()
  }

  async function handleDeleteTable(id: string) {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    await supabase
      .from('restaurant_tables')
      .delete()
      .eq('id', id)
      .eq('user_id', user.id)

    fetchTables()
  }

  // ===== Reservation list renderer =====
  function renderReservationList(list: Reservation[], isLoading: boolean) {
    if (isLoading) {
      return (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      )
    }

    if (list.length === 0) {
      return (
        <EmptyModuleState
          icon={CalendarDays}
          title="Inga bokningar"
          description="Det finns inga bokningar f\u00f6r detta datum. Skapa en ny bokning f\u00f6r att komma ig\u00e5ng."
          actionLabel="Ny bokning"
          onAction={openNewReservation}
        />
      )
    }

    return (
      <div className="space-y-3">
        {list.map((r) => (
          <div
            key={r.id}
            className="flex items-center justify-between gap-4 rounded-xl border border-border bg-card px-5 py-4"
          >
            <div className="flex items-center gap-4 min-w-0">
              <div className="flex flex-col min-w-0">
                <span className="font-medium text-sm truncate">{r.guest_name}</span>
                <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
                  <span className="inline-flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {r.time_start}{r.time_end ? ` \u2013 ${r.time_end}` : ''}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <Users className="h-3 w-3" />
                    {r.party_size} g\u00e4ster
                  </span>
                  {r.restaurant_tables && (
                    <span className="inline-flex items-center gap-1">
                      <Armchair className="h-3 w-3" />
                      {r.restaurant_tables.name}
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 flex-shrink-0">
              <StatusBadge
                label={STATUS_LABELS[r.status as ReservationStatus] ?? r.status}
                variant={STATUS_VARIANT_MAP[r.status as ReservationStatus] ?? 'neutral'}
              />

              {r.status === 'confirmed' && (
                <Button variant="outline" size="sm" onClick={() => handleStatusChange(r.id, 'seated')}>
                  Placera
                </Button>
              )}
              {r.status === 'seated' && (
                <Button variant="outline" size="sm" onClick={() => handleStatusChange(r.id, 'completed')}>
                  Klar
                </Button>
              )}
              {(r.status === 'confirmed' || r.status === 'seated') && (
                <>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-red-600 hover:text-red-700 hover:bg-red-50"
                    onClick={() => handleStatusChange(r.id, 'no_show')}
                  >
                    No-show
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-muted-foreground"
                    onClick={() => handleStatusChange(r.id, 'cancelled')}
                  >
                    Avboka
                  </Button>
                </>
              )}

              <Button variant="ghost" size="icon" onClick={() => openEditReservation(r)}>
                <Pencil className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="text-red-600 hover:text-red-700"
                onClick={() => handleDeleteReservation(r.id)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </div>
        ))}
      </div>
    )
  }

  const activeTables = tables.filter((t) => t.is_active)

  // ===== Render =====
  return (
    <>
      <ModuleWorkspaceShell
        title={mod.name}
        description={mod.desc}
        category="operativ"
        sectorName={sectorSlug}
        backHref={`/m/${sectorSlug}`}
        settingsHref={settingsHref}
        actions={
          <Button onClick={openNewReservation}>
            <Plus className="mr-2 h-4 w-4" />
            Ny bokning
          </Button>
        }
        tabs={
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList>
              <TabsTrigger value="idag">Idag</TabsTrigger>
              <TabsTrigger value="kalender">Kalender</TabsTrigger>
              <TabsTrigger value="bord">Bord</TabsTrigger>
            </TabsList>

            {/* Idag */}
            <TabsContent value="idag" className="mt-6">
              {renderReservationList(reservations, loading)}
            </TabsContent>

            {/* Kalender */}
            <TabsContent value="kalender" className="mt-6 space-y-4">
              <div className="flex items-center gap-3">
                <Label htmlFor="calendar-date">Datum</Label>
                <Input
                  id="calendar-date"
                  type="date"
                  value={calendarDate}
                  onChange={(e) => setCalendarDate(e.target.value)}
                  className="w-auto"
                />
              </div>
              {renderReservationList(calendarReservations, calendarLoading)}
            </TabsContent>

            {/* Bord */}
            <TabsContent value="bord" className="mt-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-medium">Bordsinst\u00e4llningar</h2>
                <Button variant="outline" onClick={openNewTable}>
                  <Plus className="mr-2 h-4 w-4" />
                  Nytt bord
                </Button>
              </div>

              {tablesLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : tables.length === 0 ? (
                <EmptyModuleState
                  icon={Armchair}
                  title="Inga bord"
                  description="L\u00e4gg till bord f\u00f6r att kunna koppla bokningar till specifika platser."
                  actionLabel="Nytt bord"
                  onAction={openNewTable}
                />
              ) : (
                <div className="space-y-3">
                  {tables.map((table) => (
                    <div
                      key={table.id}
                      className="flex items-center justify-between gap-4 rounded-xl border border-border bg-card px-5 py-4"
                    >
                      <div className="flex flex-col">
                        <span className="font-medium text-sm">{table.name}</span>
                        <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
                          <span>{table.capacity} platser</span>
                          {table.zone && <span>Zon: {table.zone}</span>}
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <StatusBadge
                          label={table.is_active ? 'Aktiv' : 'Inaktiv'}
                          variant={table.is_active ? 'success' : 'neutral'}
                        />
                        <Button variant="ghost" size="icon" onClick={() => openEditTable(table)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-red-600 hover:text-red-700"
                          onClick={() => handleDeleteTable(table.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>
          </Tabs>
        }
      >
        {null}
      </ModuleWorkspaceShell>

      {/* ===== Reservation Dialog ===== */}
      <Dialog open={reservationDialogOpen} onOpenChange={setReservationDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingReservation ? 'Redigera bokning' : 'Ny bokning'}</DialogTitle>
            <DialogDescription>
              {editingReservation
                ? 'Uppdatera bokningsuppgifterna nedan.'
                : 'Fyll i uppgifterna f\u00f6r den nya bokningen.'}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-2">
            <div className="grid gap-2">
              <Label htmlFor="res-guest-name">G\u00e4stnamn *</Label>
              <Input
                id="res-guest-name"
                value={reservationForm.guest_name}
                onChange={(e) => setReservationForm((f) => ({ ...f, guest_name: e.target.value }))}
                placeholder="Anna Andersson"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="res-phone">Telefon</Label>
                <Input
                  id="res-phone"
                  type="tel"
                  value={reservationForm.guest_phone}
                  onChange={(e) => setReservationForm((f) => ({ ...f, guest_phone: e.target.value }))}
                  placeholder="070-123 45 67"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="res-email">E-post</Label>
                <Input
                  id="res-email"
                  type="email"
                  value={reservationForm.guest_email}
                  onChange={(e) => setReservationForm((f) => ({ ...f, guest_email: e.target.value }))}
                  placeholder="anna@example.com"
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="res-party-size">Antal g\u00e4ster *</Label>
                <Input
                  id="res-party-size"
                  type="number"
                  min={1}
                  value={reservationForm.party_size}
                  onChange={(e) => setReservationForm((f) => ({ ...f, party_size: parseInt(e.target.value) || 1 }))}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="res-date">Datum *</Label>
                <Input
                  id="res-date"
                  type="date"
                  value={reservationForm.date}
                  onChange={(e) => setReservationForm((f) => ({ ...f, date: e.target.value }))}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="res-table">Bord</Label>
                <Select
                  value={reservationForm.table_id}
                  onValueChange={(val) => setReservationForm((f) => ({ ...f, table_id: val }))}
                >
                  <SelectTrigger id="res-table">
                    <SelectValue placeholder="V\u00e4lj bord" />
                  </SelectTrigger>
                  <SelectContent>
                    {activeTables.map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.name} ({t.capacity} pl)
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="res-time-start">Starttid *</Label>
                <Input
                  id="res-time-start"
                  type="time"
                  value={reservationForm.time_start}
                  onChange={(e) => setReservationForm((f) => ({ ...f, time_start: e.target.value }))}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="res-time-end">Sluttid</Label>
                <Input
                  id="res-time-end"
                  type="time"
                  value={reservationForm.time_end}
                  onChange={(e) => setReservationForm((f) => ({ ...f, time_end: e.target.value }))}
                />
              </div>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="res-notes">Anteckningar</Label>
              <Input
                id="res-notes"
                value={reservationForm.notes}
                onChange={(e) => setReservationForm((f) => ({ ...f, notes: e.target.value }))}
                placeholder="Allergier, h\u00f6gtid, etc."
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setReservationDialogOpen(false)}>
              Avbryt
            </Button>
            <Button
              onClick={handleSaveReservation}
              disabled={savingReservation || !reservationForm.guest_name || !reservationForm.date || !reservationForm.time_start}
            >
              {savingReservation && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {editingReservation ? 'Uppdatera' : 'Skapa bokning'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ===== Table Dialog ===== */}
      <Dialog open={tableDialogOpen} onOpenChange={setTableDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingTable ? 'Redigera bord' : 'Nytt bord'}</DialogTitle>
            <DialogDescription>
              {editingTable
                ? '\u00c4ndra bordets egenskaper.'
                : 'L\u00e4gg till ett nytt bord i restaurangen.'}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-2">
            <div className="grid gap-2">
              <Label htmlFor="tbl-name">Bordsnamn *</Label>
              <Input
                id="tbl-name"
                value={tableForm.name}
                onChange={(e) => setTableForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="Bord 1, Terrass A, etc."
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="tbl-capacity">Antal platser *</Label>
                <Input
                  id="tbl-capacity"
                  type="number"
                  min={1}
                  value={tableForm.capacity}
                  onChange={(e) => setTableForm((f) => ({ ...f, capacity: parseInt(e.target.value) || 1 }))}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="tbl-zone">Zon</Label>
                <Input
                  id="tbl-zone"
                  value={tableForm.zone}
                  onChange={(e) => setTableForm((f) => ({ ...f, zone: e.target.value }))}
                  placeholder="Terrass, Inomhus, Bar"
                />
              </div>
            </div>

            <div className="flex items-center gap-3">
              <Switch
                id="tbl-active"
                checked={tableForm.is_active}
                onCheckedChange={(checked) => setTableForm((f) => ({ ...f, is_active: checked }))}
              />
              <Label htmlFor="tbl-active">Aktivt bord</Label>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setTableDialogOpen(false)}>
              Avbryt
            </Button>
            <Button
              onClick={handleSaveTable}
              disabled={savingTable || !tableForm.name}
            >
              {savingTable && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {editingTable ? 'Uppdatera' : 'Skapa bord'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
