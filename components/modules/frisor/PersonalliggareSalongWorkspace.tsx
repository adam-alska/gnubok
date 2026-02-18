'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { ModuleWorkspaceShell } from '@/components/modules/ModuleWorkspaceShell'
import { EmptyModuleState } from '@/components/modules/shared/EmptyModuleState'
import { StatusBadge } from '@/components/modules/shared/StatusBadge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog'
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
  Users,
  LogIn,
  LogOut,
  Download,
  Clock,
} from 'lucide-react'

interface ModuleWorkspaceProps {
  module: { slug: string; name: string; cat: string; desc: string; longDesc: string }
  sectorSlug: string
  settingsHref: string
}

interface StaffEntry {
  id: string
  name: string
  personnummer: string
  role: string
  isActive: boolean
}

interface TimeEntry {
  id: string
  staffId: string
  staffName: string
  date: string
  checkIn: string
  checkOut: string | null
}

function todayStr(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function nowTime(): string {
  const d = new Date()
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

function generateId(): string {
  return Math.random().toString(36).substring(2, 11)
}

export function PersonalliggareSalongWorkspace({ module: mod, sectorSlug, settingsHref }: ModuleWorkspaceProps) {
  const supabase = createClient()

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [staff, setStaff] = useState<StaffEntry[]>([])
  const [timeEntries, setTimeEntries] = useState<TimeEntry[]>([])

  const [staffDialogOpen, setStaffDialogOpen] = useState(false)
  const [editingStaff, setEditingStaff] = useState<StaffEntry | null>(null)
  const [staffForm, setStaffForm] = useState({ name: '', personnummer: '', role: 'Frisör' })

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [staffToDelete, setStaffToDelete] = useState<StaffEntry | null>(null)

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
      .eq('config_key', 'staff')
      .maybeSingle()

    if (staffData?.config_value && Array.isArray(staffData.config_value)) {
      setStaff(staffData.config_value as StaffEntry[])
    }

    const { data: timeData } = await supabase
      .from('module_configs')
      .select('config_value')
      .eq('user_id', user.id)
      .eq('sector_slug', sectorSlug)
      .eq('module_slug', mod.slug)
      .eq('config_key', 'time_entries')
      .maybeSingle()

    if (timeData?.config_value && Array.isArray(timeData.config_value)) {
      setTimeEntries(timeData.config_value as TimeEntry[])
    }

    setLoading(false)
  }, [supabase, sectorSlug, mod.slug])

  useEffect(() => { fetchData() }, [fetchData])

  const todayEntries = useMemo(() => {
    return timeEntries.filter((e) => e.date === todayStr())
  }, [timeEntries])

  const checkedInStaff = useMemo(() => {
    return todayEntries.filter((e) => !e.checkOut).map((e) => e.staffId)
  }, [todayEntries])

  function openNewStaff() {
    setEditingStaff(null)
    setStaffForm({ name: '', personnummer: '', role: 'Frisör' })
    setStaffDialogOpen(true)
  }

  function openEditStaff(entry: StaffEntry) {
    setEditingStaff(entry)
    setStaffForm({ name: entry.name, personnummer: entry.personnummer, role: entry.role })
    setStaffDialogOpen(true)
  }

  async function handleSaveStaff() {
    const newEntry: StaffEntry = {
      id: editingStaff?.id ?? generateId(),
      name: staffForm.name.trim(),
      personnummer: staffForm.personnummer.trim(),
      role: staffForm.role.trim(),
      isActive: true,
    }

    let updated: StaffEntry[]
    if (editingStaff) {
      updated = staff.map((s) => s.id === editingStaff.id ? newEntry : s)
    } else {
      updated = [...staff, newEntry]
    }

    setStaff(updated)
    setStaffDialogOpen(false)
    await saveData('staff', updated)
  }

  function openDeleteStaff(entry: StaffEntry) {
    setStaffToDelete(entry)
    setDeleteDialogOpen(true)
  }

  async function handleDeleteStaff() {
    if (!staffToDelete) return
    const updated = staff.filter((s) => s.id !== staffToDelete.id)
    setStaff(updated)
    setDeleteDialogOpen(false)
    setStaffToDelete(null)
    await saveData('staff', updated)
  }

  async function handleCheckIn(staffEntry: StaffEntry) {
    const newTimeEntry: TimeEntry = {
      id: generateId(),
      staffId: staffEntry.id,
      staffName: staffEntry.name,
      date: todayStr(),
      checkIn: nowTime(),
      checkOut: null,
    }

    const updated = [...timeEntries, newTimeEntry]
    setTimeEntries(updated)
    await saveData('time_entries', updated)
  }

  async function handleCheckOut(staffId: string) {
    const updated = timeEntries.map((e) =>
      e.staffId === staffId && e.date === todayStr() && !e.checkOut
        ? { ...e, checkOut: nowTime() }
        : e
    )
    setTimeEntries(updated)
    await saveData('time_entries', updated)
  }

  function exportCSV() {
    const headers = ['Datum', 'Namn', 'Personnummer', 'Roll', 'Incheckning', 'Utcheckning']
    const rows = timeEntries
      .sort((a, b) => b.date.localeCompare(a.date))
      .map((e) => {
        const s = staff.find((st) => st.id === e.staffId)
        return [e.date, e.staffName, s?.personnummer ?? '', s?.role ?? '', e.checkIn, e.checkOut ?? '']
      })

    const csv = [headers, ...rows].map((r) => r.join(';')).join('\n')
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `personalliggare_${todayStr()}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <>
      <ModuleWorkspaceShell
        title={mod.name}
        description={mod.desc}
        category="bokforing"
        sectorName="Frisör & Skönhet"
        backHref={`/m/${sectorSlug}`}
        settingsHref={settingsHref}
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={exportCSV} disabled={timeEntries.length === 0}>
              <Download className="mr-2 h-4 w-4" />
              Exportera CSV
            </Button>
            <Button onClick={openNewStaff}>
              <Plus className="mr-2 h-4 w-4" />
              Ny personal
            </Button>
          </div>
        }
      >
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <Tabs defaultValue="idag" className="space-y-6">
            <TabsList>
              <TabsTrigger value="idag">Dagens registrering</TabsTrigger>
              <TabsTrigger value="personal">Personal</TabsTrigger>
              <TabsTrigger value="historik">Historik</TabsTrigger>
            </TabsList>

            <TabsContent value="idag" className="space-y-6">
              <div className="rounded-xl border border-border bg-card p-4">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="text-sm font-semibold">Personalliggare {todayStr()}</h3>
                    <p className="text-xs text-muted-foreground">Krav enligt Skatteverket. Registrera in- och utcheckning.</p>
                  </div>
                  <Badge variant="outline">
                    <Clock className="mr-1 h-3 w-3" />
                    {checkedInStaff.length} incheckade
                  </Badge>
                </div>

                {staff.filter((s) => s.isActive).length === 0 ? (
                  <EmptyModuleState
                    icon={Users}
                    title="Ingen personal registrerad"
                    description="Lägg till personal för att använda personalliggaren."
                    actionLabel="Ny personal"
                    onAction={openNewStaff}
                  />
                ) : (
                  <div className="rounded-lg border border-border overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-muted/50">
                          <TableHead className="font-medium">Namn</TableHead>
                          <TableHead className="font-medium">Roll</TableHead>
                          <TableHead className="font-medium">Status</TableHead>
                          <TableHead className="font-medium">Incheckning</TableHead>
                          <TableHead className="font-medium">Utcheckning</TableHead>
                          <TableHead className="font-medium text-right">Åtgärd</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {staff.filter((s) => s.isActive).map((s) => {
                          const isCheckedIn = checkedInStaff.includes(s.id)
                          const todayEntry = todayEntries.find((e) => e.staffId === s.id)
                          return (
                            <TableRow key={s.id}>
                              <TableCell className="font-medium">{s.name}</TableCell>
                              <TableCell>{s.role}</TableCell>
                              <TableCell>
                                <StatusBadge
                                  label={isCheckedIn ? 'Incheckad' : todayEntry?.checkOut ? 'Utcheckad' : 'Ej registrerad'}
                                  variant={isCheckedIn ? 'success' : todayEntry?.checkOut ? 'info' : 'neutral'}
                                />
                              </TableCell>
                              <TableCell className="tabular-nums">{todayEntry?.checkIn ?? '-'}</TableCell>
                              <TableCell className="tabular-nums">{todayEntry?.checkOut ?? '-'}</TableCell>
                              <TableCell className="text-right">
                                {!isCheckedIn && !todayEntry?.checkOut && (
                                  <Button size="sm" variant="outline" onClick={() => handleCheckIn(s)}>
                                    <LogIn className="mr-1 h-3.5 w-3.5" />
                                    Checka in
                                  </Button>
                                )}
                                {isCheckedIn && (
                                  <Button size="sm" variant="outline" onClick={() => handleCheckOut(s.id)}>
                                    <LogOut className="mr-1 h-3.5 w-3.5" />
                                    Checka ut
                                  </Button>
                                )}
                              </TableCell>
                            </TableRow>
                          )
                        })}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </div>

              {saving && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Sparar...
                </div>
              )}
            </TabsContent>

            <TabsContent value="personal" className="space-y-6">
              {staff.length === 0 ? (
                <EmptyModuleState
                  icon={Users}
                  title="Ingen personal"
                  description="Lägg till personal som ska registreras i personalliggaren."
                  actionLabel="Ny personal"
                  onAction={openNewStaff}
                />
              ) : (
                <div className="rounded-xl border border-border overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/50">
                        <TableHead className="font-medium">Namn</TableHead>
                        <TableHead className="font-medium">Personnummer</TableHead>
                        <TableHead className="font-medium">Roll</TableHead>
                        <TableHead className="font-medium">Status</TableHead>
                        <TableHead className="font-medium text-right">Åtgärder</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {staff.map((s) => (
                        <TableRow key={s.id}>
                          <TableCell className="font-medium">{s.name}</TableCell>
                          <TableCell className="font-mono text-sm">{s.personnummer}</TableCell>
                          <TableCell>{s.role}</TableCell>
                          <TableCell>
                            <StatusBadge
                              label={s.isActive ? 'Aktiv' : 'Inaktiv'}
                              variant={s.isActive ? 'success' : 'neutral'}
                            />
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-1">
                              <Button variant="ghost" size="icon" onClick={() => openEditStaff(s)} title="Redigera">
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <Button variant="ghost" size="icon" className="text-red-600 hover:text-red-700" onClick={() => openDeleteStaff(s)} title="Ta bort">
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
            </TabsContent>

            <TabsContent value="historik" className="space-y-6">
              {timeEntries.length === 0 ? (
                <EmptyModuleState
                  icon={Clock}
                  title="Ingen historik"
                  description="Tidsregistreringar visas här efter att personal checkar in och ut."
                />
              ) : (
                <div className="rounded-xl border border-border overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/50">
                        <TableHead className="font-medium">Datum</TableHead>
                        <TableHead className="font-medium">Namn</TableHead>
                        <TableHead className="font-medium">Incheckning</TableHead>
                        <TableHead className="font-medium">Utcheckning</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {[...timeEntries].sort((a, b) => b.date.localeCompare(a.date) || b.checkIn.localeCompare(a.checkIn)).map((e) => (
                        <TableRow key={e.id}>
                          <TableCell>{e.date}</TableCell>
                          <TableCell className="font-medium">{e.staffName}</TableCell>
                          <TableCell className="tabular-nums">{e.checkIn}</TableCell>
                          <TableCell className="tabular-nums">{e.checkOut ?? '-'}</TableCell>
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

      <Dialog open={staffDialogOpen} onOpenChange={setStaffDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingStaff ? 'Redigera personal' : 'Ny personal'}</DialogTitle>
            <DialogDescription>
              {editingStaff ? 'Uppdatera personalens uppgifter.' : 'Lägg till ny personal i personalliggaren enligt Skatteverkets krav.'}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-2">
              <Label htmlFor="staff-name">Namn *</Label>
              <Input
                id="staff-name"
                value={staffForm.name}
                onChange={(e) => setStaffForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="Anna Andersson"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="staff-pnr">Personnummer *</Label>
              <Input
                id="staff-pnr"
                value={staffForm.personnummer}
                onChange={(e) => setStaffForm((f) => ({ ...f, personnummer: e.target.value }))}
                placeholder="YYYYMMDD-XXXX"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="staff-role">Roll</Label>
              <Input
                id="staff-role"
                value={staffForm.role}
                onChange={(e) => setStaffForm((f) => ({ ...f, role: e.target.value }))}
                placeholder="Frisör"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setStaffDialogOpen(false)}>Avbryt</Button>
            <Button onClick={handleSaveStaff} disabled={!staffForm.name.trim() || !staffForm.personnummer.trim()}>
              {editingStaff ? 'Uppdatera' : 'Lägg till'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Ta bort personal</DialogTitle>
            <DialogDescription>
              Är du säker på att du vill ta bort {staffToDelete?.name}? Denna åtgärd kan inte ångras.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>Avbryt</Button>
            <Button variant="destructive" onClick={handleDeleteStaff}>
              <Trash2 className="mr-2 h-4 w-4" />
              Ta bort
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
