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
  Users,
  Search,
} from 'lucide-react'

interface ModuleWorkspaceProps {
  module: { slug: string; name: string; cat: string; desc: string; longDesc: string }
  sectorSlug: string
  settingsHref: string
}

type DriverStatus = 'active' | 'on_leave' | 'inactive'

interface Driver {
  id: string
  name: string
  phone: string
  email: string
  license_class: string
  license_expires: string
  ykb_expires: string
  employment_type: string
  hourly_rate: number
  status: DriverStatus
  notes: string
}

interface TimeReport {
  id: string
  driver_id: string
  date: string
  hours: number
  overtime_hours: number
  vehicle_reg: string
  route: string
  notes: string
}

const DRIVER_STATUS_LABELS: Record<DriverStatus, string> = {
  active: 'Aktiv',
  on_leave: 'Ledig',
  inactive: 'Inaktiv',
}

const DRIVER_STATUS_VARIANTS: Record<DriverStatus, 'success' | 'warning' | 'danger' | 'info' | 'neutral'> = {
  active: 'success',
  on_leave: 'warning',
  inactive: 'neutral',
}

const LICENSE_CLASSES = ['B', 'BE', 'C', 'CE', 'D', 'DE']

const EMPTY_DRIVER_FORM = {
  name: '',
  phone: '',
  email: '',
  license_class: 'CE',
  license_expires: '',
  ykb_expires: '',
  employment_type: 'fast',
  hourly_rate: 0,
  status: 'active' as DriverStatus,
  notes: '',
}

const EMPTY_TIME_FORM = {
  driver_id: '',
  date: '',
  hours: 8,
  overtime_hours: 0,
  vehicle_reg: '',
  route: '',
  notes: '',
}

function fmt(n: number): string {
  return new Intl.NumberFormat('sv-SE', { maximumFractionDigits: 0 }).format(n)
}

function daysUntil(dateStr: string): number | null {
  if (!dateStr) return null
  const diff = new Date(dateStr).getTime() - new Date().getTime()
  return Math.ceil(diff / (1000 * 60 * 60 * 24))
}

export function ChauforshanteringWorkspace({ module: mod, sectorSlug, settingsHref }: ModuleWorkspaceProps) {
  const supabase = createClient()

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [drivers, setDrivers] = useState<Driver[]>([])
  const [timeReports, setTimeReports] = useState<TimeReport[]>([])
  const [searchQuery, setSearchQuery] = useState('')

  const [driverDialogOpen, setDriverDialogOpen] = useState(false)
  const [editingDriver, setEditingDriver] = useState<Driver | null>(null)
  const [driverForm, setDriverForm] = useState(EMPTY_DRIVER_FORM)

  const [timeDialogOpen, setTimeDialogOpen] = useState(false)
  const [editingTime, setEditingTime] = useState<TimeReport | null>(null)
  const [timeForm, setTimeForm] = useState(EMPTY_TIME_FORM)

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [driverToDelete, setDriverToDelete] = useState<Driver | null>(null)

  const saveData = useCallback(async (drvs: Driver[], times: TimeReport[]) => {
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setSaving(false); return }

    await Promise.all([
      supabase.from('module_configs').upsert(
        { user_id: user.id, sector_slug: sectorSlug, module_slug: mod.slug, config_key: 'drivers', config_value: drvs },
        { onConflict: 'user_id,sector_slug,module_slug,config_key' }
      ),
      supabase.from('module_configs').upsert(
        { user_id: user.id, sector_slug: sectorSlug, module_slug: mod.slug, config_key: 'time_reports', config_value: times },
        { onConflict: 'user_id,sector_slug,module_slug,config_key' }
      ),
    ])
    setSaving(false)
  }, [supabase, sectorSlug, mod.slug])

  const fetchData = useCallback(async () => {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); return }

    const { data } = await supabase
      .from('module_configs')
      .select('config_value, config_key')
      .eq('user_id', user.id)
      .eq('sector_slug', sectorSlug)
      .eq('module_slug', mod.slug)
      .in('config_key', ['drivers', 'time_reports'])

    if (data) {
      for (const row of data) {
        if (row.config_key === 'drivers' && Array.isArray(row.config_value)) {
          setDrivers(row.config_value as Driver[])
        }
        if (row.config_key === 'time_reports' && Array.isArray(row.config_value)) {
          setTimeReports(row.config_value as TimeReport[])
        }
      }
    }
    setLoading(false)
  }, [supabase, sectorSlug, mod.slug])

  useEffect(() => { fetchData() }, [fetchData])

  const filteredDrivers = useMemo(() => {
    if (!searchQuery.trim()) return drivers
    const q = searchQuery.toLowerCase()
    return drivers.filter((d) =>
      d.name.toLowerCase().includes(q) ||
      d.license_class.toLowerCase().includes(q) ||
      d.phone.includes(q)
    )
  }, [drivers, searchQuery])

  const expiringCerts = useMemo(() => {
    return drivers.filter((d) => {
      const lic = daysUntil(d.license_expires)
      const ykb = daysUntil(d.ykb_expires)
      return (lic != null && lic <= 90) || (ykb != null && ykb <= 90)
    })
  }, [drivers])

  const activeDrivers = useMemo(() => drivers.filter((d) => d.status === 'active'), [drivers])

  // Driver CRUD
  function openNewDriver() {
    setEditingDriver(null)
    setDriverForm({ ...EMPTY_DRIVER_FORM })
    setDriverDialogOpen(true)
  }

  function openEditDriver(driver: Driver) {
    setEditingDriver(driver)
    setDriverForm({
      name: driver.name,
      phone: driver.phone,
      email: driver.email,
      license_class: driver.license_class,
      license_expires: driver.license_expires,
      ykb_expires: driver.ykb_expires,
      employment_type: driver.employment_type,
      hourly_rate: driver.hourly_rate,
      status: driver.status,
      notes: driver.notes,
    })
    setDriverDialogOpen(true)
  }

  async function handleSaveDriver() {
    const item: Driver = {
      id: editingDriver?.id || crypto.randomUUID(),
      name: driverForm.name.trim(),
      phone: driverForm.phone.trim(),
      email: driverForm.email.trim(),
      license_class: driverForm.license_class,
      license_expires: driverForm.license_expires,
      ykb_expires: driverForm.ykb_expires,
      employment_type: driverForm.employment_type,
      hourly_rate: driverForm.hourly_rate,
      status: driverForm.status,
      notes: driverForm.notes.trim(),
    }

    let updatedDrivers: Driver[]
    if (editingDriver) {
      updatedDrivers = drivers.map((d) => d.id === editingDriver.id ? item : d)
    } else {
      updatedDrivers = [...drivers, item]
    }

    setDrivers(updatedDrivers)
    setDriverDialogOpen(false)
    await saveData(updatedDrivers, timeReports)
  }

  function openDeleteDriver(driver: Driver) {
    setDriverToDelete(driver)
    setDeleteDialogOpen(true)
  }

  async function handleDeleteDriver() {
    if (!driverToDelete) return
    const updatedDrivers = drivers.filter((d) => d.id !== driverToDelete.id)
    const updatedTimes = timeReports.filter((t) => t.driver_id !== driverToDelete.id)
    setDrivers(updatedDrivers)
    setTimeReports(updatedTimes)
    setDeleteDialogOpen(false)
    setDriverToDelete(null)
    await saveData(updatedDrivers, updatedTimes)
  }

  // Time report CRUD
  function openNewTime() {
    setEditingTime(null)
    setTimeForm({ ...EMPTY_TIME_FORM, date: new Date().toISOString().split('T')[0], driver_id: activeDrivers.length > 0 ? activeDrivers[0].id : '' })
    setTimeDialogOpen(true)
  }

  function openEditTime(tr: TimeReport) {
    setEditingTime(tr)
    setTimeForm({
      driver_id: tr.driver_id,
      date: tr.date,
      hours: tr.hours,
      overtime_hours: tr.overtime_hours,
      vehicle_reg: tr.vehicle_reg,
      route: tr.route,
      notes: tr.notes,
    })
    setTimeDialogOpen(true)
  }

  async function handleSaveTime() {
    const item: TimeReport = {
      id: editingTime?.id || crypto.randomUUID(),
      driver_id: timeForm.driver_id,
      date: timeForm.date,
      hours: timeForm.hours,
      overtime_hours: timeForm.overtime_hours,
      vehicle_reg: timeForm.vehicle_reg.trim().toUpperCase(),
      route: timeForm.route.trim(),
      notes: timeForm.notes.trim(),
    }

    let updatedTimes: TimeReport[]
    if (editingTime) {
      updatedTimes = timeReports.map((t) => t.id === editingTime.id ? item : t)
    } else {
      updatedTimes = [...timeReports, item]
    }

    setTimeReports(updatedTimes)
    setTimeDialogOpen(false)
    await saveData(drivers, updatedTimes)
  }

  async function handleDeleteTime(trId: string) {
    const updatedTimes = timeReports.filter((t) => t.id !== trId)
    setTimeReports(updatedTimes)
    await saveData(drivers, updatedTimes)
  }

  function getDriverName(driverId: string): string {
    return drivers.find((d) => d.id === driverId)?.name || 'Okänd'
  }

  const recentTimeReports = useMemo(() => {
    return [...timeReports].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 50)
  }, [timeReports])

  return (
    <>
      <ModuleWorkspaceShell
        title={mod.name}
        description={mod.desc}
        category="operativ"
        sectorName="Transport & Logistik"
        backHref={`/m/${sectorSlug}`}
        settingsHref={settingsHref}
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={openNewTime}>
              <Plus className="mr-2 h-4 w-4" />
              Ny tidrapport
            </Button>
            <Button onClick={openNewDriver}>
              <Plus className="mr-2 h-4 w-4" />
              Ny chaufför
            </Button>
          </div>
        }
      >
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <Tabs defaultValue="chaufforer" className="space-y-6">
            <TabsList>
              <TabsTrigger value="chaufforer">Chauffrörer</TabsTrigger>
              <TabsTrigger value="tidrapporter">Tidrapporter</TabsTrigger>
              <TabsTrigger value="certifikat">
                Certifikat
                {expiringCerts.length > 0 && (
                  <Badge variant="destructive" className="ml-1.5 h-5 w-5 p-0 flex items-center justify-center text-[10px]">
                    {expiringCerts.length}
                  </Badge>
                )}
              </TabsTrigger>
            </TabsList>

            <TabsContent value="chaufforer" className="space-y-6">
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <KPICard label="Totalt chauffrörer" value={String(drivers.length)} />
                <KPICard label="Aktiva" value={String(activeDrivers.length)} />
                <KPICard label="Certifikat som löper ut" value={String(expiringCerts.length)} trend={expiringCerts.length > 0 ? 'down' : 'neutral'} />
                <KPICard label="Tidrapporter" value={String(timeReports.length)} />
              </div>

              <div className="flex items-center gap-3">
                <div className="relative flex-1 max-w-sm">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input placeholder="Sök chaufför..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-9" />
                </div>
              </div>

              {filteredDrivers.length === 0 ? (
                <EmptyModuleState
                  icon={Users}
                  title="Inga chauffrörer"
                  description="Lägg till chauffrörer med körkortsklass, YKB-certifiering och tidrapporter."
                  actionLabel="Ny chaufför"
                  onAction={openNewDriver}
                />
              ) : (
                <div className="rounded-xl border border-border overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/50">
                        <TableHead className="font-medium">Namn</TableHead>
                        <TableHead className="font-medium">Telefon</TableHead>
                        <TableHead className="font-medium">Körkort</TableHead>
                        <TableHead className="font-medium">Körkort giltig t.o.m.</TableHead>
                        <TableHead className="font-medium">YKB giltig t.o.m.</TableHead>
                        <TableHead className="font-medium">Status</TableHead>
                        <TableHead className="font-medium text-right">Åtgärder</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredDrivers.map((d) => {
                        const licDays = daysUntil(d.license_expires)
                        const ykbDays = daysUntil(d.ykb_expires)
                        return (
                          <TableRow key={d.id}>
                            <TableCell>
                              <div className="font-medium">{d.name}</div>
                              {d.email && <div className="text-xs text-muted-foreground">{d.email}</div>}
                            </TableCell>
                            <TableCell>{d.phone || '-'}</TableCell>
                            <TableCell><Badge variant="outline">{d.license_class}</Badge></TableCell>
                            <TableCell>
                              <span className={licDays != null && licDays <= 90 ? 'text-amber-600 font-medium' : ''}>
                                {d.license_expires || '-'}
                              </span>
                            </TableCell>
                            <TableCell>
                              <span className={ykbDays != null && ykbDays <= 90 ? 'text-amber-600 font-medium' : ''}>
                                {d.ykb_expires || '-'}
                              </span>
                            </TableCell>
                            <TableCell><StatusBadge label={DRIVER_STATUS_LABELS[d.status]} variant={DRIVER_STATUS_VARIANTS[d.status]} /></TableCell>
                            <TableCell className="text-right">
                              <div className="flex items-center justify-end gap-1">
                                <Button variant="ghost" size="icon" onClick={() => openEditDriver(d)}><Pencil className="h-4 w-4" /></Button>
                                <Button variant="ghost" size="icon" className="text-red-600 hover:text-red-700" onClick={() => openDeleteDriver(d)}><Trash2 className="h-4 w-4" /></Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        )
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </TabsContent>

            <TabsContent value="tidrapporter" className="space-y-4">
              {recentTimeReports.length === 0 ? (
                <EmptyModuleState icon={Users} title="Inga tidrapporter" description="Registrera tidrapporter för chauffrörer." actionLabel="Ny tidrapport" onAction={openNewTime} />
              ) : (
                <div className="rounded-xl border border-border overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/50">
                        <TableHead className="font-medium">Chaufför</TableHead>
                        <TableHead className="font-medium">Datum</TableHead>
                        <TableHead className="font-medium text-right">Timmar</TableHead>
                        <TableHead className="font-medium text-right">Övertid</TableHead>
                        <TableHead className="font-medium">Fordon</TableHead>
                        <TableHead className="font-medium">Rutt</TableHead>
                        <TableHead className="font-medium text-right">Åtgärder</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {recentTimeReports.map((tr) => (
                        <TableRow key={tr.id}>
                          <TableCell className="font-medium">{getDriverName(tr.driver_id)}</TableCell>
                          <TableCell>{tr.date}</TableCell>
                          <TableCell className="text-right tabular-nums">{tr.hours}h</TableCell>
                          <TableCell className="text-right tabular-nums">{tr.overtime_hours > 0 ? `${tr.overtime_hours}h` : '-'}</TableCell>
                          <TableCell className="font-mono">{tr.vehicle_reg || '-'}</TableCell>
                          <TableCell>{tr.route || '-'}</TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-1">
                              <Button variant="ghost" size="icon" onClick={() => openEditTime(tr)}><Pencil className="h-4 w-4" /></Button>
                              <Button variant="ghost" size="icon" className="text-red-600 hover:text-red-700" onClick={() => handleDeleteTime(tr.id)}><Trash2 className="h-4 w-4" /></Button>
                            </div>
                          </TableCell>
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

            <TabsContent value="certifikat" className="space-y-4">
              {expiringCerts.length === 0 ? (
                <EmptyModuleState icon={Users} title="Inga utgående certifikat" description="Alla chauffrörer har giltiga körkort och YKB-certifieringar." />
              ) : (
                <div className="space-y-3">
                  {expiringCerts.map((d) => {
                    const licDays = daysUntil(d.license_expires)
                    const ykbDays = daysUntil(d.ykb_expires)
                    return (
                      <div key={d.id} className="rounded-xl border border-border bg-card px-5 py-4">
                        <div className="flex items-center justify-between mb-2">
                          <div>
                            <span className="font-medium text-sm">{d.name}</span>
                            <Badge variant="outline" className="ml-2">{d.license_class}</Badge>
                          </div>
                          <Button variant="ghost" size="sm" onClick={() => openEditDriver(d)}><Pencil className="h-3.5 w-3.5 mr-1" />Redigera</Button>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {licDays != null && licDays <= 90 && (
                            <StatusBadge label={`Körkort: ${licDays <= 0 ? 'Utgånget' : `${licDays} dagar kvar`}`} variant={licDays <= 0 ? 'danger' : 'warning'} />
                          )}
                          {ykbDays != null && ykbDays <= 90 && (
                            <StatusBadge label={`YKB: ${ykbDays <= 0 ? 'Utgånget' : `${ykbDays} dagar kvar`}`} variant={ykbDays <= 0 ? 'danger' : 'warning'} />
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </TabsContent>
          </Tabs>
        )}
      </ModuleWorkspaceShell>

      {/* Driver Dialog */}
      <Dialog open={driverDialogOpen} onOpenChange={setDriverDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingDriver ? 'Redigera chaufför' : 'Ny chaufför'}</DialogTitle>
            <DialogDescription>
              {editingDriver ? 'Uppdatera chaufförens information.' : 'Registrera en ny chaufför.'}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Namn *</Label>
                <Input value={driverForm.name} onChange={(e) => setDriverForm((f) => ({ ...f, name: e.target.value }))} placeholder="Erik Svensson" />
              </div>
              <div className="grid gap-2">
                <Label>Telefon</Label>
                <Input value={driverForm.phone} onChange={(e) => setDriverForm((f) => ({ ...f, phone: e.target.value }))} placeholder="070-123 45 67" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>E-post</Label>
                <Input value={driverForm.email} onChange={(e) => setDriverForm((f) => ({ ...f, email: e.target.value }))} placeholder="erik@example.com" />
              </div>
              <div className="grid gap-2">
                <Label>Körkortsklass *</Label>
                <Select value={driverForm.license_class} onValueChange={(v) => setDriverForm((f) => ({ ...f, license_class: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {LICENSE_CLASSES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Körkort giltigt t.o.m.</Label>
                <Input type="date" value={driverForm.license_expires} onChange={(e) => setDriverForm((f) => ({ ...f, license_expires: e.target.value }))} />
              </div>
              <div className="grid gap-2">
                <Label>YKB giltigt t.o.m.</Label>
                <Input type="date" value={driverForm.ykb_expires} onChange={(e) => setDriverForm((f) => ({ ...f, ykb_expires: e.target.value }))} />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="grid gap-2">
                <Label>Anställningsform</Label>
                <Select value={driverForm.employment_type} onValueChange={(v) => setDriverForm((f) => ({ ...f, employment_type: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="fast">Fast anställd</SelectItem>
                    <SelectItem value="visstid">Visstid</SelectItem>
                    <SelectItem value="inhyrd">Inhyrd</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label>Timlön (kr)</Label>
                <Input type="number" min={0} value={driverForm.hourly_rate || ''} onChange={(e) => setDriverForm((f) => ({ ...f, hourly_rate: parseFloat(e.target.value) || 0 }))} />
              </div>
              <div className="grid gap-2">
                <Label>Status</Label>
                <Select value={driverForm.status} onValueChange={(v) => setDriverForm((f) => ({ ...f, status: v as DriverStatus }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Aktiv</SelectItem>
                    <SelectItem value="on_leave">Ledig</SelectItem>
                    <SelectItem value="inactive">Inaktiv</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDriverDialogOpen(false)}>Avbryt</Button>
            <Button onClick={handleSaveDriver} disabled={!driverForm.name.trim()}>
              {editingDriver ? 'Uppdatera' : 'Lägg till'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Time Report Dialog */}
      <Dialog open={timeDialogOpen} onOpenChange={setTimeDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingTime ? 'Redigera tidrapport' : 'Ny tidrapport'}</DialogTitle>
            <DialogDescription>
              {editingTime ? 'Uppdatera tidrapporten.' : 'Registrera arbetstid för en chaufför.'}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-2">
            <div className="grid gap-2">
              <Label>Chaufför *</Label>
              <Select value={timeForm.driver_id} onValueChange={(v) => setTimeForm((f) => ({ ...f, driver_id: v }))}>
                <SelectTrigger><SelectValue placeholder="Välj chaufför" /></SelectTrigger>
                <SelectContent>
                  {activeDrivers.map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="grid gap-2">
                <Label>Datum *</Label>
                <Input type="date" value={timeForm.date} onChange={(e) => setTimeForm((f) => ({ ...f, date: e.target.value }))} />
              </div>
              <div className="grid gap-2">
                <Label>Timmar *</Label>
                <Input type="number" min={0} step={0.5} value={timeForm.hours} onChange={(e) => setTimeForm((f) => ({ ...f, hours: parseFloat(e.target.value) || 0 }))} />
              </div>
              <div className="grid gap-2">
                <Label>Övertid</Label>
                <Input type="number" min={0} step={0.5} value={timeForm.overtime_hours || ''} onChange={(e) => setTimeForm((f) => ({ ...f, overtime_hours: parseFloat(e.target.value) || 0 }))} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Fordon (regnr)</Label>
                <Input value={timeForm.vehicle_reg} onChange={(e) => setTimeForm((f) => ({ ...f, vehicle_reg: e.target.value }))} placeholder="ABC 123" />
              </div>
              <div className="grid gap-2">
                <Label>Rutt</Label>
                <Input value={timeForm.route} onChange={(e) => setTimeForm((f) => ({ ...f, route: e.target.value }))} placeholder="Stockholm - Göteborg" />
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setTimeDialogOpen(false)}>Avbryt</Button>
            <Button onClick={handleSaveTime} disabled={!timeForm.driver_id || !timeForm.date || !timeForm.hours}>
              {editingTime ? 'Uppdatera' : 'Lägg till'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Driver Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Ta bort chaufför</DialogTitle>
            <DialogDescription>
              Är du säker på att du vill ta bort{' '}
              <span className="font-semibold">{driverToDelete?.name}</span>? Alla tillhörande tidrapporter raderas också.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>Avbryt</Button>
            <Button variant="destructive" onClick={handleDeleteDriver}>
              <Trash2 className="mr-2 h-4 w-4" />
              Ta bort
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
