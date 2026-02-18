'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { ModuleWorkspaceShell } from '@/components/modules/ModuleWorkspaceShell'
import { StatusBadge } from '@/components/modules/shared/StatusBadge'
import { EmptyModuleState } from '@/components/modules/shared/EmptyModuleState'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
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
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Plus,
  Users,
  Pencil,
  Trash2,
  AlertTriangle,
} from 'lucide-react'

// --- Types ---

interface ModuleWorkspaceProps {
  module: { slug: string; name: string; cat: string; desc: string; longDesc: string }
  sectorSlug: string
  settingsHref: string
}

interface StaffMember {
  id: string
  name: string
  email: string
  phone: string
  role: string
  hourly_rate: number
  is_active: boolean
}

interface Shift {
  id: string
  staff_member_id: string
  date: string
  time_start: string
  time_end: string
  role: string
  status: string
  notes: string
}

// --- Constants ---

const WEEKDAYS = ['Mån', 'Tis', 'Ons', 'Tor', 'Fre', 'Lör', 'Sön']

const ROLES = [
  { value: 'kock', label: 'Kock' },
  { value: 'servitor', label: 'Servitör' },
  { value: 'diskare', label: 'Diskare' },
  { value: 'bartender', label: 'Bartender' },
  { value: 'hovmastare', label: 'Hovmästare' },
]

const SHIFT_STATUSES = [
  { value: 'scheduled', label: 'Schemalagd' },
  { value: 'confirmed', label: 'Bekräftad' },
  { value: 'completed', label: 'Slutförd' },
  { value: 'cancelled', label: 'Avbokad' },
]

const STATUS_LABELS: Record<string, string> = {
  scheduled: 'Schemalagd',
  confirmed: 'Bekräftad',
  completed: 'Slutförd',
  cancelled: 'Avbokad',
}

const STATUS_VARIANTS: Record<string, 'success' | 'warning' | 'danger' | 'info' | 'neutral'> = {
  scheduled: 'neutral',
  confirmed: 'info',
  completed: 'success',
  cancelled: 'danger',
}

// --- Helpers ---

function calculateHours(timeStart: string, timeEnd: string): number {
  const [startH, startM] = timeStart.split(':').map(Number)
  const [endH, endM] = timeEnd.split(':').map(Number)
  let hours = endH - startH + (endM - startM) / 60
  if (hours < 0) hours += 24
  return hours
}

function getMonday(date: Date): Date {
  const d = new Date(date)
  const day = d.getDay()
  const diff = d.getDate() - day + (day === 0 ? -6 : 1)
  d.setDate(diff)
  d.setHours(0, 0, 0, 0)
  return d
}

function formatDate(date: Date): string {
  return date.toISOString().split('T')[0]
}

function formatDateShort(date: Date): string {
  return `${date.getDate()}/${date.getMonth() + 1}`
}

function getISOWeekNumber(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
  const dayNum = d.getUTCDay() || 7
  d.setUTCDate(d.getUTCDate() + 4 - dayNum)
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7)
}

// --- Component ---

export function PersonalschemaWorkspace({ module: mod, sectorSlug, settingsHref }: ModuleWorkspaceProps) {
  const supabase = useMemo(() => createClient(), [])

  // State
  const [activeTab, setActiveTab] = useState('veckoschema')
  const [weekStart, setWeekStart] = useState(() => getMonday(new Date()))
  const [staff, setStaff] = useState<StaffMember[]>([])
  const [shifts, setShifts] = useState<Shift[]>([])
  const [loading, setLoading] = useState(true)

  // Shift dialog
  const [shiftDialogOpen, setShiftDialogOpen] = useState(false)
  const [editingShift, setEditingShift] = useState<Shift | null>(null)
  const [shiftForm, setShiftForm] = useState({
    staff_member_id: '',
    date: '',
    time_start: '08:00',
    time_end: '16:00',
    role: 'kock',
    status: 'scheduled',
    notes: '',
  })

  // Staff dialog
  const [staffDialogOpen, setStaffDialogOpen] = useState(false)
  const [editingStaff, setEditingStaff] = useState<StaffMember | null>(null)
  const [staffForm, setStaffForm] = useState({
    name: '',
    email: '',
    phone: '',
    role: 'kock',
    hourly_rate: 0,
    is_active: true,
  })

  // Computed
  const weekDates = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(weekStart)
      d.setDate(d.getDate() + i)
      return d
    })
  }, [weekStart])

  const weekLabel = useMemo(() => {
    const start = weekDates[0]
    const end = weekDates[6]
    const weekNum = getISOWeekNumber(start)
    return `Vecka ${weekNum} (${formatDateShort(start)} - ${formatDateShort(end)})`
  }, [weekDates])

  // Data fetching
  const fetchStaff = useCallback(async () => {
    const { data } = await supabase
      .from('staff_members')
      .select('*')
      .order('name')
    if (data) setStaff(data)
  }, [supabase])

  const fetchShifts = useCallback(async () => {
    const startStr = formatDate(weekDates[0])
    const endStr = formatDate(weekDates[6])
    const { data } = await supabase
      .from('shifts')
      .select('*')
      .gte('date', startStr)
      .lte('date', endStr)
    if (data) setShifts(data)
  }, [supabase, weekDates])

  useEffect(() => {
    async function load() {
      setLoading(true)
      await Promise.all([fetchStaff(), fetchShifts()])
      setLoading(false)
    }
    load()
  }, [fetchStaff, fetchShifts])

  // Week navigation
  function prevWeek() {
    setWeekStart((prev) => {
      const d = new Date(prev)
      d.setDate(d.getDate() - 7)
      return d
    })
  }

  function nextWeek() {
    setWeekStart((prev) => {
      const d = new Date(prev)
      d.setDate(d.getDate() + 7)
      return d
    })
  }

  function goToToday() {
    setWeekStart(getMonday(new Date()))
  }

  // Shift CRUD
  function openNewShift(staffMemberId?: string, date?: string) {
    setEditingShift(null)
    setShiftForm({
      staff_member_id: staffMemberId || (activeStaff.length > 0 ? activeStaff[0].id : ''),
      date: date || formatDate(new Date()),
      time_start: '08:00',
      time_end: '16:00',
      role: 'kock',
      status: 'scheduled',
      notes: '',
    })
    setShiftDialogOpen(true)
  }

  function openEditShift(shift: Shift) {
    setEditingShift(shift)
    setShiftForm({
      staff_member_id: shift.staff_member_id,
      date: shift.date,
      time_start: shift.time_start,
      time_end: shift.time_end,
      role: shift.role,
      status: shift.status,
      notes: shift.notes || '',
    })
    setShiftDialogOpen(true)
  }

  async function saveShift() {
    const payload = {
      staff_member_id: shiftForm.staff_member_id,
      date: shiftForm.date,
      time_start: shiftForm.time_start,
      time_end: shiftForm.time_end,
      role: shiftForm.role,
      status: shiftForm.status,
      notes: shiftForm.notes,
    }
    if (editingShift) {
      await supabase.from('shifts').update(payload).eq('id', editingShift.id)
    } else {
      await supabase.from('shifts').insert(payload)
    }
    setShiftDialogOpen(false)
    fetchShifts()
  }

  async function deleteShift(shiftId: string) {
    await supabase.from('shifts').delete().eq('id', shiftId)
    setShiftDialogOpen(false)
    fetchShifts()
  }

  // Staff CRUD
  function openNewStaff() {
    setEditingStaff(null)
    setStaffForm({
      name: '',
      email: '',
      phone: '',
      role: 'kock',
      hourly_rate: 0,
      is_active: true,
    })
    setStaffDialogOpen(true)
  }

  function openEditStaff(member: StaffMember) {
    setEditingStaff(member)
    setStaffForm({
      name: member.name,
      email: member.email || '',
      phone: member.phone || '',
      role: member.role,
      hourly_rate: member.hourly_rate || 0,
      is_active: member.is_active,
    })
    setStaffDialogOpen(true)
  }

  async function saveStaff() {
    const payload = {
      name: staffForm.name,
      email: staffForm.email,
      phone: staffForm.phone,
      role: staffForm.role,
      hourly_rate: staffForm.hourly_rate,
      is_active: staffForm.is_active,
    }
    if (editingStaff) {
      await supabase.from('staff_members').update(payload).eq('id', editingStaff.id)
    } else {
      await supabase.from('staff_members').insert(payload)
    }
    setStaffDialogOpen(false)
    fetchStaff()
  }

  async function deleteStaff(id: string) {
    await supabase.from('staff_members').delete().eq('id', id)
    fetchStaff()
  }

  // Grid helpers
  const activeStaff = useMemo(() => staff.filter((s) => s.is_active), [staff])

  function getShiftsForCell(staffId: string, date: string): Shift[] {
    return shifts.filter((s) => s.staff_member_id === staffId && s.date === date)
  }

  function getWeeklyHours(staffId: string): number {
    return shifts
      .filter((s) => s.staff_member_id === staffId && s.status !== 'cancelled')
      .reduce((sum, s) => sum + calculateHours(s.time_start, s.time_end), 0)
  }

  // --- Render ---

  const tabsContent = (
    <Tabs value={activeTab} onValueChange={setActiveTab}>
      <TabsList>
        <TabsTrigger value="veckoschema">
          <CalendarDays className="mr-1.5 h-3.5 w-3.5" />
          Veckoschema
        </TabsTrigger>
        <TabsTrigger value="personal">
          <Users className="mr-1.5 h-3.5 w-3.5" />
          Personal
        </TabsTrigger>
      </TabsList>

      {/* ===== VECKOSCHEMA ===== */}
      <TabsContent value="veckoschema" className="space-y-4">
        {/* Week navigation */}
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-2">
            <Button variant="outline" size="icon" onClick={prevWeek}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="icon" onClick={nextWeek}>
              <ChevronRight className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="sm" onClick={goToToday}>
              Idag
            </Button>
          </div>
          <span className="text-sm font-medium">{weekLabel}</span>
          <Input
            type="date"
            className="w-auto"
            value={formatDate(weekStart)}
            onChange={(e) => {
              if (e.target.value) {
                setWeekStart(getMonday(new Date(e.target.value)))
              }
            }}
          />
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
            Laddar schema...
          </div>
        ) : activeStaff.length === 0 ? (
          <EmptyModuleState
            icon={Users}
            title="Inga aktiva medarbetare"
            description="Lägg till personal under fliken Personal för att börja schemalägga."
            actionLabel="Lägg till personal"
            onAction={() => {
              setActiveTab('personal')
              openNewStaff()
            }}
          />
        ) : (
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="sticky left-0 z-10 bg-muted/50 px-3 py-2 text-left font-medium min-w-[140px]">
                    Personal
                  </th>
                  {weekDates.map((d, i) => (
                    <th
                      key={i}
                      className={cn(
                        'px-2 py-2 text-center font-medium min-w-[120px]',
                        formatDate(d) === formatDate(new Date()) && 'bg-primary/5'
                      )}
                    >
                      <div>{WEEKDAYS[i]}</div>
                      <div className="text-xs text-muted-foreground font-normal">
                        {formatDateShort(d)}
                      </div>
                    </th>
                  ))}
                  <th className="px-3 py-2 text-center font-medium min-w-[80px]">
                    Timmar
                  </th>
                </tr>
              </thead>
              <tbody>
                {activeStaff.map((member) => {
                  const weeklyHours = getWeeklyHours(member.id)
                  const isOvertime = weeklyHours > 40

                  return (
                    <tr key={member.id} className="border-b last:border-b-0">
                      <td className="sticky left-0 z-10 bg-background px-3 py-2 font-medium">
                        <div>{member.name}</div>
                        <div className="text-xs text-muted-foreground capitalize">
                          {member.role}
                        </div>
                      </td>
                      {weekDates.map((d, i) => {
                        const dateStr = formatDate(d)
                        const cellShifts = getShiftsForCell(member.id, dateStr)
                        return (
                          <td
                            key={i}
                            className={cn(
                              'px-1 py-1 align-top cursor-pointer hover:bg-muted/30 transition-colors border-l',
                              formatDate(d) === formatDate(new Date()) && 'bg-primary/5'
                            )}
                            onClick={() => {
                              if (cellShifts.length === 0) {
                                openNewShift(member.id, dateStr)
                              }
                            }}
                          >
                            {cellShifts.length === 0 ? (
                              <div className="flex items-center justify-center h-12 text-muted-foreground/40">
                                <Plus className="h-3.5 w-3.5" />
                              </div>
                            ) : (
                              <div className="space-y-1">
                                {cellShifts.map((shift) => (
                                  <button
                                    key={shift.id}
                                    className="w-full rounded px-1.5 py-1 text-left text-xs bg-secondary/60 hover:bg-secondary transition-colors"
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      openEditShift(shift)
                                    }}
                                  >
                                    <div className="font-medium">
                                      {shift.time_start}-{shift.time_end}
                                    </div>
                                    <StatusBadge
                                      label={STATUS_LABELS[shift.status] || shift.status}
                                      variant={STATUS_VARIANTS[shift.status] || 'neutral'}
                                      className="mt-0.5 text-[10px] px-1 py-0"
                                    />
                                  </button>
                                ))}
                              </div>
                            )}
                          </td>
                        )
                      })}
                      <td className="px-3 py-2 text-center border-l">
                        <div className={cn('font-medium', isOvertime && 'text-amber-600')}>
                          {weeklyHours.toFixed(1)}h
                        </div>
                        {isOvertime && (
                          <div className="flex items-center justify-center gap-1 text-xs text-amber-600 mt-0.5">
                            <AlertTriangle className="h-3 w-3" />
                            Övertid
                          </div>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </TabsContent>

      {/* ===== PERSONAL ===== */}
      <TabsContent value="personal" className="space-y-4">
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Hantera personal och deras roller.
          </p>
          <Button size="sm" onClick={openNewStaff}>
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            Ny personal
          </Button>
        </div>

        {staff.length === 0 ? (
          <EmptyModuleState
            icon={Users}
            title="Ingen personal"
            description="Lägg till din första medarbetare för att komma igång med schemaläggning."
            actionLabel="Lägg till personal"
            onAction={openNewStaff}
          />
        ) : (
          <div className="rounded-lg border border-border overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="px-4 py-2.5 text-left font-medium">Namn</th>
                  <th className="px-4 py-2.5 text-left font-medium">Roll</th>
                  <th className="px-4 py-2.5 text-left font-medium">E-post</th>
                  <th className="px-4 py-2.5 text-left font-medium">Telefon</th>
                  <th className="px-4 py-2.5 text-right font-medium">Timlön</th>
                  <th className="px-4 py-2.5 text-center font-medium">Status</th>
                  <th className="px-4 py-2.5 text-right font-medium">Åtgärder</th>
                </tr>
              </thead>
              <tbody>
                {staff.map((member) => (
                  <tr key={member.id} className="border-b last:border-b-0">
                    <td className="px-4 py-2.5 font-medium">{member.name}</td>
                    <td className="px-4 py-2.5 capitalize">{member.role}</td>
                    <td className="px-4 py-2.5 text-muted-foreground">
                      {member.email || '-'}
                    </td>
                    <td className="px-4 py-2.5 text-muted-foreground">
                      {member.phone || '-'}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      {member.hourly_rate ? `${member.hourly_rate} kr` : '-'}
                    </td>
                    <td className="px-4 py-2.5 text-center">
                      <Badge variant={member.is_active ? 'default' : 'secondary'}>
                        {member.is_active ? 'Aktiv' : 'Inaktiv'}
                      </Badge>
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => openEditStaff(member)}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-destructive hover:text-destructive"
                          onClick={() => deleteStaff(member.id)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </TabsContent>
    </Tabs>
  )

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
          <Button size="sm" onClick={() => openNewShift()}>
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            Nytt skift
          </Button>
        }
        tabs={tabsContent}
      >
        {tabsContent}
      </ModuleWorkspaceShell>

      {/* ===== SHIFT DIALOG ===== */}
      <Dialog open={shiftDialogOpen} onOpenChange={setShiftDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingShift ? 'Redigera skift' : 'Nytt skift'}</DialogTitle>
            <DialogDescription>
              {editingShift
                ? 'Uppdatera skiftets information nedan.'
                : 'Fyll i uppgifter för det nya skiftet.'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Personal</Label>
              <Select
                value={shiftForm.staff_member_id}
                onValueChange={(v) => setShiftForm((f) => ({ ...f, staff_member_id: v }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Välj personal" />
                </SelectTrigger>
                <SelectContent>
                  {activeStaff.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Datum</Label>
              <Input
                type="date"
                value={shiftForm.date}
                onChange={(e) => setShiftForm((f) => ({ ...f, date: e.target.value }))}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Starttid</Label>
                <Input
                  type="time"
                  value={shiftForm.time_start}
                  onChange={(e) => setShiftForm((f) => ({ ...f, time_start: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label>Sluttid</Label>
                <Input
                  type="time"
                  value={shiftForm.time_end}
                  onChange={(e) => setShiftForm((f) => ({ ...f, time_end: e.target.value }))}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Roll</Label>
              <Select
                value={shiftForm.role}
                onValueChange={(v) => setShiftForm((f) => ({ ...f, role: v }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ROLES.map((r) => (
                    <SelectItem key={r.value} value={r.value}>
                      {r.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Status</Label>
              <Select
                value={shiftForm.status}
                onValueChange={(v) => setShiftForm((f) => ({ ...f, status: v }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SHIFT_STATUSES.map((s) => (
                    <SelectItem key={s.value} value={s.value}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Anteckningar</Label>
              <Input
                value={shiftForm.notes}
                onChange={(e) => setShiftForm((f) => ({ ...f, notes: e.target.value }))}
                placeholder="Valfria anteckningar..."
              />
            </div>
          </div>
          <DialogFooter>
            {editingShift && (
              <Button
                variant="destructive"
                size="sm"
                onClick={() => deleteShift(editingShift.id)}
                className="mr-auto"
              >
                <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                Ta bort
              </Button>
            )}
            <Button variant="outline" onClick={() => setShiftDialogOpen(false)}>
              Avbryt
            </Button>
            <Button onClick={saveShift}>
              {editingShift ? 'Uppdatera' : 'Skapa skift'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ===== STAFF DIALOG ===== */}
      <Dialog open={staffDialogOpen} onOpenChange={setStaffDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editingStaff ? 'Redigera personal' : 'Ny personal'}
            </DialogTitle>
            <DialogDescription>
              {editingStaff
                ? 'Uppdatera personalens information nedan.'
                : 'Fyll i uppgifter för den nya medarbetaren.'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Namn</Label>
              <Input
                value={staffForm.name}
                onChange={(e) => setStaffForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="Förnamn Efternamn"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>E-post</Label>
                <Input
                  type="email"
                  value={staffForm.email}
                  onChange={(e) => setStaffForm((f) => ({ ...f, email: e.target.value }))}
                  placeholder="namn@exempel.se"
                />
              </div>
              <div className="space-y-2">
                <Label>Telefon</Label>
                <Input
                  value={staffForm.phone}
                  onChange={(e) => setStaffForm((f) => ({ ...f, phone: e.target.value }))}
                  placeholder="070-123 45 67"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Roll</Label>
              <Select
                value={staffForm.role}
                onValueChange={(v) => setStaffForm((f) => ({ ...f, role: v }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ROLES.map((r) => (
                    <SelectItem key={r.value} value={r.value}>
                      {r.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Timlön (kr)</Label>
              <Input
                type="number"
                value={staffForm.hourly_rate || ''}
                onChange={(e) =>
                  setStaffForm((f) => ({ ...f, hourly_rate: parseFloat(e.target.value) || 0 }))
                }
                placeholder="0"
              />
            </div>

            <div className="flex items-center gap-2">
              <Label>Aktiv</Label>
              <Button
                type="button"
                variant={staffForm.is_active ? 'default' : 'outline'}
                size="sm"
                onClick={() => setStaffForm((f) => ({ ...f, is_active: !f.is_active }))}
              >
                {staffForm.is_active ? 'Aktiv' : 'Inaktiv'}
              </Button>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setStaffDialogOpen(false)}>
              Avbryt
            </Button>
            <Button onClick={saveStaff} disabled={!staffForm.name.trim()}>
              {editingStaff ? 'Uppdatera' : 'Lägg till'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
