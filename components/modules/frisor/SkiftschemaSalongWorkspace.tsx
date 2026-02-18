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
  CalendarDays,
  Users,
  Clock,
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface ModuleWorkspaceProps {
  module: { slug: string; name: string; cat: string; desc: string; longDesc: string }
  sectorSlug: string
  settingsHref: string
}

type ShiftStatus = 'scheduled' | 'confirmed' | 'leave_request' | 'approved_leave'

interface StaffMember {
  id: string
  name: string
  station: string
}

interface Shift {
  id: string
  staffId: string
  staffName: string
  station: string
  date: string
  startTime: string
  endTime: string
  status: ShiftStatus
  note: string
}

interface LeaveRequest {
  id: string
  staffId: string
  staffName: string
  fromDate: string
  toDate: string
  reason: string
  status: 'pending' | 'approved' | 'denied'
}

const SHIFT_STATUS: { value: ShiftStatus; label: string; variant: 'success' | 'info' | 'warning' | 'neutral' }[] = [
  { value: 'scheduled', label: 'Schemalagd', variant: 'neutral' },
  { value: 'confirmed', label: 'Bekräftad', variant: 'success' },
  { value: 'leave_request', label: 'Ledigansökan', variant: 'warning' },
  { value: 'approved_leave', label: 'Ledig', variant: 'info' },
]

const STATUS_MAP = Object.fromEntries(SHIFT_STATUS.map((s) => [s.value, s]))

const WEEKDAYS = ['Mån', 'Tis', 'Ons', 'Tor', 'Fre', 'Lör', 'Sön']

function todayStr(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function startOfWeek(dateStr?: string): string {
  const d = dateStr ? new Date(dateStr) : new Date()
  const day = d.getDay()
  const diff = d.getDate() - day + (day === 0 ? -6 : 1)
  const monday = new Date(d.setDate(diff))
  return `${monday.getFullYear()}-${String(monday.getMonth() + 1).padStart(2, '0')}-${String(monday.getDate()).padStart(2, '0')}`
}

function getWeekDates(mondayStr: string): string[] {
  const dates: string[] = []
  const d = new Date(mondayStr)
  for (let i = 0; i < 7; i++) {
    const dd = new Date(d)
    dd.setDate(d.getDate() + i)
    dates.push(`${dd.getFullYear()}-${String(dd.getMonth() + 1).padStart(2, '0')}-${String(dd.getDate()).padStart(2, '0')}`)
  }
  return dates
}

function generateId(): string {
  return Math.random().toString(36).substring(2, 11)
}

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr)
  d.setDate(d.getDate() + days)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function SkiftschemaSalongWorkspace({ module: mod, sectorSlug, settingsHref }: ModuleWorkspaceProps) {
  const supabase = createClient()

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [staff, setStaff] = useState<StaffMember[]>([])
  const [shifts, setShifts] = useState<Shift[]>([])
  const [leaveRequests, setLeaveRequests] = useState<LeaveRequest[]>([])
  const [weekStart, setWeekStart] = useState(() => startOfWeek())

  const [staffDialogOpen, setStaffDialogOpen] = useState(false)
  const [staffForm, setStaffForm] = useState({ name: '', station: '' })

  const [shiftDialogOpen, setShiftDialogOpen] = useState(false)
  const [shiftForm, setShiftForm] = useState({
    staffId: '',
    date: todayStr(),
    startTime: '09:00',
    endTime: '17:00',
    station: '',
    note: '',
  })

  const [leaveDialogOpen, setLeaveDialogOpen] = useState(false)
  const [leaveForm, setLeaveForm] = useState({
    staffId: '',
    fromDate: todayStr(),
    toDate: todayStr(),
    reason: '',
  })

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [shiftToDelete, setShiftToDelete] = useState<Shift | null>(null)

  const saveData = useCallback(async (key: string, value: unknown) => {
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setSaving(false); return }

    await supabase.from('module_configs').upsert(
      {
        user_id: user.id,
        sector_slug: sectorSlug,
        module_slug: mod.slug,
        config_key: key,
        config_value: value,
      },
      { onConflict: 'user_id,sector_slug,module_slug,config_key' }
    )
    setSaving(false)
  }, [supabase, sectorSlug, mod.slug])

  const fetchData = useCallback(async () => {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); return }

    const { data: staffData } = await supabase
      .from('module_configs')
      .select('config_value')
      .eq('user_id', user.id)
      .eq('sector_slug', sectorSlug)
      .eq('module_slug', mod.slug)
      .eq('config_key', 'schedule_staff')
      .maybeSingle()

    if (staffData?.config_value && Array.isArray(staffData.config_value)) {
      setStaff(staffData.config_value as StaffMember[])
    }

    const { data: shiftData } = await supabase
      .from('module_configs')
      .select('config_value')
      .eq('user_id', user.id)
      .eq('sector_slug', sectorSlug)
      .eq('module_slug', mod.slug)
      .eq('config_key', 'shifts')
      .maybeSingle()

    if (shiftData?.config_value && Array.isArray(shiftData.config_value)) {
      setShifts(shiftData.config_value as Shift[])
    }

    const { data: leaveData } = await supabase
      .from('module_configs')
      .select('config_value')
      .eq('user_id', user.id)
      .eq('sector_slug', sectorSlug)
      .eq('module_slug', mod.slug)
      .eq('config_key', 'leave_requests')
      .maybeSingle()

    if (leaveData?.config_value && Array.isArray(leaveData.config_value)) {
      setLeaveRequests(leaveData.config_value as LeaveRequest[])
    }

    setLoading(false)
  }, [supabase, sectorSlug, mod.slug])

  useEffect(() => { fetchData() }, [fetchData])

  const weekDates = useMemo(() => getWeekDates(weekStart), [weekStart])

  const weekShifts = useMemo(() => {
    return shifts.filter((s) => s.date >= weekDates[0] && s.date <= weekDates[6])
  }, [shifts, weekDates])

  const kpis = useMemo(() => {
    const totalHours = weekShifts.reduce((s, sh) => {
      const [startH, startM] = sh.startTime.split(':').map(Number)
      const [endH, endM] = sh.endTime.split(':').map(Number)
      return s + ((endH + endM / 60) - (startH + startM / 60))
    }, 0)
    const staffWithShifts = new Set(weekShifts.map((s) => s.staffId)).size
    const pendingLeave = leaveRequests.filter((l) => l.status === 'pending').length
    return { totalHours: Math.round(totalHours), staffWithShifts, totalShifts: weekShifts.length, pendingLeave }
  }, [weekShifts, leaveRequests])

  function navigateWeek(direction: number) {
    setWeekStart((prev) => addDays(prev, direction * 7))
  }

  async function handleSaveStaff() {
    const newStaff: StaffMember = {
      id: generateId(),
      name: staffForm.name.trim(),
      station: staffForm.station.trim(),
    }
    const updated = [...staff, newStaff]
    setStaff(updated)
    setStaffDialogOpen(false)
    setStaffForm({ name: '', station: '' })
    await saveData('schedule_staff', updated)
  }

  async function handleSaveShift() {
    const staffMember = staff.find((s) => s.id === shiftForm.staffId)
    if (!staffMember) return

    const newShift: Shift = {
      id: generateId(),
      staffId: staffMember.id,
      staffName: staffMember.name,
      station: shiftForm.station || staffMember.station,
      date: shiftForm.date,
      startTime: shiftForm.startTime,
      endTime: shiftForm.endTime,
      status: 'scheduled',
      note: shiftForm.note,
    }

    const updated = [...shifts, newShift]
    setShifts(updated)
    setShiftDialogOpen(false)
    setShiftForm({ staffId: '', date: todayStr(), startTime: '09:00', endTime: '17:00', station: '', note: '' })
    await saveData('shifts', updated)
  }

  async function handleSaveLeave() {
    const staffMember = staff.find((s) => s.id === leaveForm.staffId)
    if (!staffMember) return

    const newLeave: LeaveRequest = {
      id: generateId(),
      staffId: staffMember.id,
      staffName: staffMember.name,
      fromDate: leaveForm.fromDate,
      toDate: leaveForm.toDate,
      reason: leaveForm.reason.trim(),
      status: 'pending',
    }

    const updated = [...leaveRequests, newLeave]
    setLeaveRequests(updated)
    setLeaveDialogOpen(false)
    setLeaveForm({ staffId: '', fromDate: todayStr(), toDate: todayStr(), reason: '' })
    await saveData('leave_requests', updated)
  }

  async function updateLeaveStatus(id: string, status: 'approved' | 'denied') {
    const updated = leaveRequests.map((l) =>
      l.id === id ? { ...l, status } : l
    )
    setLeaveRequests(updated)
    await saveData('leave_requests', updated)
  }

  function openDeleteShift(shift: Shift) {
    setShiftToDelete(shift)
    setDeleteDialogOpen(true)
  }

  async function handleDeleteShift() {
    if (!shiftToDelete) return
    const updated = shifts.filter((s) => s.id !== shiftToDelete.id)
    setShifts(updated)
    setDeleteDialogOpen(false)
    setShiftToDelete(null)
    await saveData('shifts', updated)
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
            <Button variant="outline" size="sm" onClick={() => navigateWeek(-1)}>Förra veckan</Button>
            <Button variant="outline" size="sm" onClick={() => setWeekStart(startOfWeek())}>Idag</Button>
            <Button variant="outline" size="sm" onClick={() => navigateWeek(1)}>Nästa vecka</Button>
          </div>
        }
      >
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <Tabs defaultValue="schema" className="space-y-6">
            <TabsList>
              <TabsTrigger value="schema">Veckoschema</TabsTrigger>
              <TabsTrigger value="personal">Personal</TabsTrigger>
              <TabsTrigger value="ledighet">Ledighetsansökningar ({kpis.pendingLeave})</TabsTrigger>
            </TabsList>

            <TabsContent value="schema" className="space-y-6">
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <KPICard label="Skift denna vecka" value={String(kpis.totalShifts)} unit="st" />
                <KPICard label="Personal schemalagd" value={String(kpis.staffWithShifts)} unit={`av ${staff.length}`} />
                <KPICard label="Totala timmar" value={String(kpis.totalHours)} unit="h" />
                <KPICard label="Väntande ledighet" value={String(kpis.pendingLeave)} unit="st" />
              </div>

              <div className="flex items-center justify-between">
                <p className="text-sm font-medium">
                  Vecka: {weekDates[0]} - {weekDates[6]}
                </p>
                <div className="flex items-center gap-2">
                  <Button onClick={() => { setShiftForm((f) => ({ ...f, staffId: staff[0]?.id ?? '' })); setShiftDialogOpen(true) }} disabled={staff.length === 0}>
                    <Plus className="mr-2 h-4 w-4" />
                    Nytt skift
                  </Button>
                </div>
              </div>

              {staff.length === 0 ? (
                <EmptyModuleState
                  icon={Users}
                  title="Ingen personal"
                  description="Lägg till personal för att börja schemalägga skift."
                  actionLabel="Ny personal"
                  onAction={() => setStaffDialogOpen(true)}
                />
              ) : (
                <div className="rounded-xl border border-border overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/50">
                        <TableHead className="font-medium min-w-[120px]">Personal</TableHead>
                        {weekDates.map((date, idx) => (
                          <TableHead key={date} className={cn(
                            'font-medium text-center min-w-[100px]',
                            date === todayStr() ? 'bg-primary/5' : ''
                          )}>
                            <div>{WEEKDAYS[idx]}</div>
                            <div className="text-xs text-muted-foreground">{date.slice(5)}</div>
                          </TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {staff.map((s) => (
                        <TableRow key={s.id}>
                          <TableCell className="font-medium">
                            <div>
                              <p className="text-sm">{s.name}</p>
                              {s.station && <p className="text-xs text-muted-foreground">{s.station}</p>}
                            </div>
                          </TableCell>
                          {weekDates.map((date) => {
                            const dayShifts = weekShifts.filter((sh) => sh.staffId === s.id && sh.date === date)
                            return (
                              <TableCell key={date} className={cn(
                                'text-center',
                                date === todayStr() ? 'bg-primary/5' : ''
                              )}>
                                {dayShifts.length === 0 ? (
                                  <span className="text-xs text-muted-foreground">-</span>
                                ) : (
                                  <div className="space-y-1">
                                    {dayShifts.map((sh) => (
                                      <div key={sh.id} className="group relative">
                                        <Badge
                                          variant="secondary"
                                          className={cn(
                                            'text-xs cursor-pointer',
                                            sh.status === 'confirmed' ? 'bg-emerald-100 dark:bg-emerald-900/30' : '',
                                            sh.status === 'approved_leave' ? 'bg-blue-100 dark:bg-blue-900/30' : ''
                                          )}
                                        >
                                          {sh.startTime}-{sh.endTime}
                                        </Badge>
                                        <Button
                                          variant="ghost"
                                          size="icon"
                                          className="h-5 w-5 absolute -top-1 -right-1 opacity-0 group-hover:opacity-100 transition-opacity"
                                          onClick={() => openDeleteShift(sh)}
                                        >
                                          <Trash2 className="h-3 w-3 text-red-500" />
                                        </Button>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </TableCell>
                            )
                          })}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}

              {saving && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Sparar...
                </div>
              )}
            </TabsContent>

            <TabsContent value="personal" className="space-y-6">
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">
                  Hantera personal och stationstilldelning.
                </p>
                <Button onClick={() => setStaffDialogOpen(true)}>
                  <Plus className="mr-2 h-4 w-4" />
                  Ny personal
                </Button>
              </div>

              {staff.length === 0 ? (
                <EmptyModuleState
                  icon={Users}
                  title="Ingen personal"
                  description="Lägg till personal för att börja schemalägga."
                  actionLabel="Ny personal"
                  onAction={() => setStaffDialogOpen(true)}
                />
              ) : (
                <div className="rounded-xl border border-border overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/50">
                        <TableHead className="font-medium">Namn</TableHead>
                        <TableHead className="font-medium">Station</TableHead>
                        <TableHead className="font-medium text-right">Skift denna vecka</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {staff.map((s) => {
                        const count = weekShifts.filter((sh) => sh.staffId === s.id).length
                        return (
                          <TableRow key={s.id}>
                            <TableCell className="font-medium">{s.name}</TableCell>
                            <TableCell>{s.station || '-'}</TableCell>
                            <TableCell className="text-right tabular-nums">{count} skift</TableCell>
                          </TableRow>
                        )
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </TabsContent>

            <TabsContent value="ledighet" className="space-y-6">
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">
                  Hantera ledighetsansökningar.
                </p>
                <Button variant="outline" onClick={() => { setLeaveForm((f) => ({ ...f, staffId: staff[0]?.id ?? '' })); setLeaveDialogOpen(true) }} disabled={staff.length === 0}>
                  <Plus className="mr-2 h-4 w-4" />
                  Ny ansökan
                </Button>
              </div>

              {leaveRequests.length === 0 ? (
                <EmptyModuleState
                  icon={CalendarDays}
                  title="Inga ledighetsansökningar"
                  description="Ledighetsansökningar från personal visas här."
                />
              ) : (
                <div className="rounded-xl border border-border overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/50">
                        <TableHead className="font-medium">Personal</TableHead>
                        <TableHead className="font-medium">Från</TableHead>
                        <TableHead className="font-medium">Till</TableHead>
                        <TableHead className="font-medium">Anledning</TableHead>
                        <TableHead className="font-medium">Status</TableHead>
                        <TableHead className="font-medium text-right">Åtgärd</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {leaveRequests.map((req) => (
                        <TableRow key={req.id}>
                          <TableCell className="font-medium">{req.staffName}</TableCell>
                          <TableCell>{req.fromDate}</TableCell>
                          <TableCell>{req.toDate}</TableCell>
                          <TableCell className="text-sm">{req.reason || '-'}</TableCell>
                          <TableCell>
                            <StatusBadge
                              label={req.status === 'pending' ? 'Väntande' : req.status === 'approved' ? 'Godkänd' : 'Nekad'}
                              variant={req.status === 'pending' ? 'warning' : req.status === 'approved' ? 'success' : 'danger'}
                            />
                          </TableCell>
                          <TableCell className="text-right">
                            {req.status === 'pending' && (
                              <div className="flex items-center justify-end gap-1">
                                <Button variant="outline" size="sm" onClick={() => updateLeaveStatus(req.id, 'approved')}>Godkänn</Button>
                                <Button variant="ghost" size="sm" className="text-red-600" onClick={() => updateLeaveStatus(req.id, 'denied')}>Neka</Button>
                              </div>
                            )}
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

      {/* Staff dialog */}
      <Dialog open={staffDialogOpen} onOpenChange={setStaffDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Ny personal</DialogTitle>
            <DialogDescription>Lägg till personal med stationstilldelning.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-2">
              <Label htmlFor="sch-name">Namn *</Label>
              <Input
                id="sch-name"
                value={staffForm.name}
                onChange={(e) => setStaffForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="Anna Andersson"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="sch-station">Station/Stol</Label>
              <Input
                id="sch-station"
                value={staffForm.station}
                onChange={(e) => setStaffForm((f) => ({ ...f, station: e.target.value }))}
                placeholder="Stol 1"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setStaffDialogOpen(false)}>Avbryt</Button>
            <Button onClick={handleSaveStaff} disabled={!staffForm.name.trim()}>Lägg till</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Shift dialog */}
      <Dialog open={shiftDialogOpen} onOpenChange={setShiftDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Nytt skift</DialogTitle>
            <DialogDescription>Schemalägg ett nytt skift med stationstilldelning.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="sh-staff">Personal *</Label>
                <Select
                  value={shiftForm.staffId}
                  onValueChange={(val) => {
                    const s = staff.find((st) => st.id === val)
                    setShiftForm((f) => ({ ...f, staffId: val, station: s?.station ?? f.station }))
                  }}
                >
                  <SelectTrigger id="sh-staff">
                    <SelectValue placeholder="Välj personal" />
                  </SelectTrigger>
                  <SelectContent>
                    {staff.map((s) => (
                      <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="sh-date">Datum *</Label>
                <Input
                  id="sh-date"
                  type="date"
                  value={shiftForm.date}
                  onChange={(e) => setShiftForm((f) => ({ ...f, date: e.target.value }))}
                />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="sh-start">Start</Label>
                <Input
                  id="sh-start"
                  type="time"
                  value={shiftForm.startTime}
                  onChange={(e) => setShiftForm((f) => ({ ...f, startTime: e.target.value }))}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="sh-end">Slut</Label>
                <Input
                  id="sh-end"
                  type="time"
                  value={shiftForm.endTime}
                  onChange={(e) => setShiftForm((f) => ({ ...f, endTime: e.target.value }))}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="sh-station">Station</Label>
                <Input
                  id="sh-station"
                  value={shiftForm.station}
                  onChange={(e) => setShiftForm((f) => ({ ...f, station: e.target.value }))}
                  placeholder="Stol 1"
                />
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="sh-note">Anteckning</Label>
              <Input
                id="sh-note"
                value={shiftForm.note}
                onChange={(e) => setShiftForm((f) => ({ ...f, note: e.target.value }))}
                placeholder="Valfri notering"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShiftDialogOpen(false)}>Avbryt</Button>
            <Button onClick={handleSaveShift} disabled={!shiftForm.staffId}>Lägg till skift</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Leave dialog */}
      <Dialog open={leaveDialogOpen} onOpenChange={setLeaveDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Ny ledighetsansökan</DialogTitle>
            <DialogDescription>Registrera en ledighetsansökan.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-2">
              <Label htmlFor="lv-staff">Personal *</Label>
              <Select
                value={leaveForm.staffId}
                onValueChange={(val) => setLeaveForm((f) => ({ ...f, staffId: val }))}
              >
                <SelectTrigger id="lv-staff">
                  <SelectValue placeholder="Välj personal" />
                </SelectTrigger>
                <SelectContent>
                  {staff.map((s) => (
                    <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="lv-from">Från</Label>
                <Input
                  id="lv-from"
                  type="date"
                  value={leaveForm.fromDate}
                  onChange={(e) => setLeaveForm((f) => ({ ...f, fromDate: e.target.value }))}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="lv-to">Till</Label>
                <Input
                  id="lv-to"
                  type="date"
                  value={leaveForm.toDate}
                  onChange={(e) => setLeaveForm((f) => ({ ...f, toDate: e.target.value }))}
                />
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="lv-reason">Anledning</Label>
              <Input
                id="lv-reason"
                value={leaveForm.reason}
                onChange={(e) => setLeaveForm((f) => ({ ...f, reason: e.target.value }))}
                placeholder="Semester, VAB, etc."
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setLeaveDialogOpen(false)}>Avbryt</Button>
            <Button onClick={handleSaveLeave} disabled={!leaveForm.staffId}>Skicka ansökan</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete shift dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Ta bort skift</DialogTitle>
            <DialogDescription>
              Är du säker på att du vill ta bort skiftet för {shiftToDelete?.staffName} den {shiftToDelete?.date}?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>Avbryt</Button>
            <Button variant="destructive" onClick={handleDeleteShift}>
              <Trash2 className="mr-2 h-4 w-4" />
              Ta bort
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
