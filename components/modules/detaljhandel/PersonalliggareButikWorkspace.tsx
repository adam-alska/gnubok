'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { ModuleWorkspaceShell } from '@/components/modules/ModuleWorkspaceShell'
import { StatusBadge } from '@/components/modules/shared/StatusBadge'
import { EmptyModuleState } from '@/components/modules/shared/EmptyModuleState'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Separator } from '@/components/ui/separator'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
  ClipboardList, Clock, Users, Plus, Pencil, Trash2, Loader2,
  LogIn, LogOut, CalendarDays, UserCheck, Timer, History, Download,
} from 'lucide-react'

interface ModuleWorkspaceProps {
  module: { slug: string; name: string; cat: string; desc: string; longDesc: string }
  sectorSlug: string
  settingsHref: string
}

interface StaffMember {
  id: string
  name: string
  role: string
  personnummer4: string
  active: boolean
}

interface AttendanceEntry {
  staffId: string
  name: string
  role: string
  checkIn: string | null
  checkOut: string | null
}

const ROLES = [
  { value: 'butikschef', label: 'Butikschef' },
  { value: 'kassapersonal', label: 'Kassapersonal' },
  { value: 'lagerarbetare', label: 'Lagerarbetare' },
  { value: 'chark', label: 'Charkpersonal' },
  { value: 'frukt-gront', label: 'Frukt & Gront' },
  { value: 'saljare', label: 'Saljare' },
  { value: 'deltid', label: 'Deltid/Extra' },
]

function todayISO(): string { return new Date().toISOString().split('T')[0] }
function nowTimeString(): string { return new Date().toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' }) }
function generateId(): string { return crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2, 11)}` }
function calculateHoursBetween(checkIn: string | null, checkOut: string | null): number {
  if (!checkIn || !checkOut) return 0
  const [inH, inM] = checkIn.split(':').map(Number)
  const [outH, outM] = checkOut.split(':').map(Number)
  let hours = outH - inH + (outM - inM) / 60
  if (hours < 0) hours += 24
  return hours
}
function formatDateSwedish(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00')
  return d.toLocaleDateString('sv-SE', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
}

export function PersonalliggareButikWorkspace({ module: mod, sectorSlug, settingsHref }: ModuleWorkspaceProps) {
  const supabase = useMemo(() => createClient(), [])

  const [activeTab, setActiveTab] = useState('idag')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [staff, setStaff] = useState<StaffMember[]>([])
  const [todayEntries, setTodayEntries] = useState<AttendanceEntry[]>([])

  const [historyDate, setHistoryDate] = useState(todayISO())
  const [historyEntries, setHistoryEntries] = useState<AttendanceEntry[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)
  const [monthSummaryDate, setMonthSummaryDate] = useState(() => {
    const now = new Date()
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  })
  const [monthlySummary, setMonthlySummary] = useState<{ staffId: string; name: string; totalHours: number }[]>([])
  const [monthlySummaryLoading, setMonthlySummaryLoading] = useState(false)
  const [datesIndex, setDatesIndex] = useState<string[]>([])
  const [currentTime, setCurrentTime] = useState(nowTimeString())

  const [staffDialogOpen, setStaffDialogOpen] = useState(false)
  const [editingStaff, setEditingStaff] = useState<StaffMember | null>(null)
  const [staffForm, setStaffForm] = useState({ name: '', role: 'kassapersonal', personnummer4: '', active: true })

  const [timeOverrideDialogOpen, setTimeOverrideDialogOpen] = useState(false)
  const [timeOverrideTarget, setTimeOverrideTarget] = useState<{ staffId: string; field: 'checkIn' | 'checkOut' } | null>(null)
  const [timeOverrideValue, setTimeOverrideValue] = useState('')

  const [addPersonDialogOpen, setAddPersonDialogOpen] = useState(false)
  const [addPersonForm, setAddPersonForm] = useState({ name: '', role: 'kassapersonal', personnummer4: '' })

  useEffect(() => {
    const interval = setInterval(() => setCurrentTime(nowTimeString()), 1000)
    return () => clearInterval(interval)
  }, [])

  const loadConfig = useCallback(async (configKey: string) => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return null
    const { data } = await supabase
      .from('module_configs').select('config_value')
      .eq('user_id', user.id).eq('sector_slug', sectorSlug).eq('module_slug', mod.slug).eq('config_key', configKey)
      .maybeSingle()
    return data?.config_value ?? null
  }, [supabase, sectorSlug, mod.slug])

  const saveConfig = useCallback(async (configKey: string, configValue: unknown) => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    await supabase.from('module_configs').upsert(
      { user_id: user.id, sector_slug: sectorSlug, module_slug: mod.slug, config_key: configKey, config_value: configValue },
      { onConflict: 'user_id,sector_slug,module_slug,config_key' }
    )
  }, [supabase, sectorSlug, mod.slug])

  const fetchStaff = useCallback(async () => {
    const data = await loadConfig('personalliggare_butik_staff')
    if (data && Array.isArray(data)) setStaff(data as StaffMember[])
  }, [loadConfig])

  const fetchTodayEntries = useCallback(async () => {
    const today = todayISO()
    const data = await loadConfig(`personalliggare_butik_${today}`)
    if (data && Array.isArray(data)) setTodayEntries(data as AttendanceEntry[])
    else setTodayEntries([])
  }, [loadConfig])

  const fetchDatesIndex = useCallback(async () => {
    const data = await loadConfig('personalliggare_butik_dates')
    if (data && Array.isArray(data)) setDatesIndex(data as string[])
  }, [loadConfig])

  useEffect(() => {
    async function load() {
      setLoading(true)
      await Promise.all([fetchStaff(), fetchTodayEntries(), fetchDatesIndex()])
      setLoading(false)
    }
    load()
  }, [fetchStaff, fetchTodayEntries, fetchDatesIndex])

  const saveTodayEntries = useCallback(async (entries: AttendanceEntry[]) => {
    const today = todayISO()
    await saveConfig(`personalliggare_butik_${today}`, entries)
    const newDatesIndex = datesIndex.includes(today) ? datesIndex : [...datesIndex, today].sort()
    if (!datesIndex.includes(today)) {
      setDatesIndex(newDatesIndex)
      await saveConfig('personalliggare_butik_dates', newDatesIndex)
    }
  }, [saveConfig, datesIndex])

  const saveStaffList = useCallback(async (staffList: StaffMember[]) => {
    await saveConfig('personalliggare_butik_staff', staffList)
  }, [saveConfig])

  async function handleCheckIn(staffId: string) {
    const member = staff.find(s => s.id === staffId)
    if (!member) return
    const existing = todayEntries.find(e => e.staffId === staffId)
    let updatedEntries: AttendanceEntry[]
    if (existing) {
      updatedEntries = todayEntries.map(e => e.staffId === staffId ? { ...e, checkIn: nowTimeString(), checkOut: null } : e)
    } else {
      updatedEntries = [...todayEntries, { staffId: member.id, name: member.name, role: member.role, checkIn: nowTimeString(), checkOut: null }]
    }
    setTodayEntries(updatedEntries)
    await saveTodayEntries(updatedEntries)
  }

  async function handleCheckOut(staffId: string) {
    const updatedEntries = todayEntries.map(e => e.staffId === staffId ? { ...e, checkOut: nowTimeString() } : e)
    setTodayEntries(updatedEntries)
    await saveTodayEntries(updatedEntries)
  }

  function openTimeOverride(staffId: string, field: 'checkIn' | 'checkOut') {
    const entry = todayEntries.find(e => e.staffId === staffId)
    setTimeOverrideTarget({ staffId, field })
    setTimeOverrideValue(entry?.[field] ?? nowTimeString())
    setTimeOverrideDialogOpen(true)
  }

  async function handleTimeOverrideSave() {
    if (!timeOverrideTarget) return
    let updatedEntries = todayEntries.map(e => {
      if (e.staffId === timeOverrideTarget.staffId) return { ...e, [timeOverrideTarget.field]: timeOverrideValue }
      return e
    })
    if (!updatedEntries.find(e => e.staffId === timeOverrideTarget.staffId)) {
      const member = staff.find(s => s.id === timeOverrideTarget.staffId)
      if (member) {
        updatedEntries.push({
          staffId: member.id, name: member.name, role: member.role,
          checkIn: timeOverrideTarget.field === 'checkIn' ? timeOverrideValue : null,
          checkOut: timeOverrideTarget.field === 'checkOut' ? timeOverrideValue : null,
        })
      }
    }
    setTodayEntries(updatedEntries)
    await saveTodayEntries(updatedEntries)
    setTimeOverrideDialogOpen(false)
  }

  async function handleQuickAddPerson() {
    if (!addPersonForm.name.trim()) return
    const newMember: StaffMember = { id: generateId(), name: addPersonForm.name.trim(), role: addPersonForm.role, personnummer4: addPersonForm.personnummer4, active: true }
    const updatedStaff = [...staff, newMember]
    setStaff(updatedStaff)
    await saveStaffList(updatedStaff)
    const newEntry: AttendanceEntry = { staffId: newMember.id, name: newMember.name, role: newMember.role, checkIn: nowTimeString(), checkOut: null }
    const updatedEntries = [...todayEntries, newEntry]
    setTodayEntries(updatedEntries)
    await saveTodayEntries(updatedEntries)
    setAddPersonDialogOpen(false)
    setAddPersonForm({ name: '', role: 'kassapersonal', personnummer4: '' })
  }

  function openNewStaff() { setEditingStaff(null); setStaffForm({ name: '', role: 'kassapersonal', personnummer4: '', active: true }); setStaffDialogOpen(true) }
  function openEditStaff(member: StaffMember) {
    setEditingStaff(member)
    setStaffForm({ name: member.name, role: member.role, personnummer4: member.personnummer4, active: member.active })
    setStaffDialogOpen(true)
  }

  async function handleSaveStaff() {
    setSaving(true)
    let updatedStaff: StaffMember[]
    if (editingStaff) {
      updatedStaff = staff.map(s => s.id === editingStaff.id ? { ...s, name: staffForm.name, role: staffForm.role, personnummer4: staffForm.personnummer4, active: staffForm.active } : s)
    } else {
      updatedStaff = [...staff, { id: generateId(), name: staffForm.name.trim(), role: staffForm.role, personnummer4: staffForm.personnummer4, active: staffForm.active }]
    }
    setStaff(updatedStaff)
    await saveStaffList(updatedStaff)
    setSaving(false)
    setStaffDialogOpen(false)
  }

  async function handleDeleteStaff(id: string) {
    const updatedStaff = staff.filter(s => s.id !== id)
    setStaff(updatedStaff)
    await saveStaffList(updatedStaff)
  }

  async function handleToggleStaffActive(id: string) {
    const updatedStaff = staff.map(s => s.id === id ? { ...s, active: !s.active } : s)
    setStaff(updatedStaff)
    await saveStaffList(updatedStaff)
  }

  const fetchHistoryEntries = useCallback(async (date: string) => {
    setHistoryLoading(true)
    const data = await loadConfig(`personalliggare_butik_${date}`)
    if (data && Array.isArray(data)) setHistoryEntries(data as AttendanceEntry[])
    else setHistoryEntries([])
    setHistoryLoading(false)
  }, [loadConfig])

  useEffect(() => {
    if (activeTab === 'historik' && historyDate) fetchHistoryEntries(historyDate)
  }, [activeTab, historyDate, fetchHistoryEntries])

  const fetchMonthlySummary = useCallback(async (yearMonth: string) => {
    setMonthlySummaryLoading(true)
    const summaryMap: Record<string, { name: string; totalHours: number }> = {}
    const monthDates = datesIndex.filter(d => d.startsWith(yearMonth))
    for (const dateStr of monthDates) {
      const data = await loadConfig(`personalliggare_butik_${dateStr}`)
      if (data && Array.isArray(data)) {
        for (const entry of data as AttendanceEntry[]) {
          if (!summaryMap[entry.staffId]) summaryMap[entry.staffId] = { name: entry.name, totalHours: 0 }
          summaryMap[entry.staffId].totalHours += calculateHoursBetween(entry.checkIn, entry.checkOut)
        }
      }
    }
    setMonthlySummary(Object.entries(summaryMap).map(([staffId, val]) => ({ staffId, name: val.name, totalHours: val.totalHours })))
    setMonthlySummaryLoading(false)
  }, [loadConfig, datesIndex])

  useEffect(() => {
    if (activeTab === 'historik') fetchMonthlySummary(monthSummaryDate)
  }, [activeTab, monthSummaryDate, fetchMonthlySummary])

  function handleExportSkatteverket() {
    const rows = [['Namn', 'Personnummer (sista 4)', 'Roll', 'Datum', 'In', 'Ut', 'Timmar']]
    for (const entry of todayEntries) {
      const member = staff.find(s => s.id === entry.staffId)
      const hours = calculateHoursBetween(entry.checkIn, entry.checkOut)
      rows.push([entry.name, member?.personnummer4 ?? '', entry.role, todayISO(), entry.checkIn ?? '', entry.checkOut ?? '', hours.toFixed(1)])
    }
    const csv = rows.map(r => r.join(';')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `personalliggare_butik_${todayISO()}.csv`
    link.click()
    URL.revokeObjectURL(url)
  }

  const activeStaff = useMemo(() => staff.filter(s => s.active), [staff])
  const checkedInCount = useMemo(() => todayEntries.filter(e => e.checkIn && !e.checkOut).length, [todayEntries])
  const totalHoursToday = useMemo(() => todayEntries.reduce((sum, e) => {
    if (e.checkIn) { const co = e.checkOut ?? nowTimeString(); return sum + calculateHoursBetween(e.checkIn, co) }
    return sum
  }, 0), [todayEntries, currentTime])

  function getEntryStatus(entry: AttendanceEntry): { label: string; variant: 'success' | 'warning' | 'danger' | 'info' | 'neutral' } {
    if (entry.checkIn && entry.checkOut) return { label: 'Utcheckad', variant: 'neutral' }
    if (entry.checkIn) return { label: 'Incheckad', variant: 'success' }
    return { label: 'Ej anland', variant: 'danger' }
  }

  const todayRegister = useMemo(() => {
    const entries: Array<{ staff: StaffMember; entry: AttendanceEntry | null }> = []
    for (const member of activeStaff) {
      const entry = todayEntries.find(e => e.staffId === member.id)
      entries.push({ staff: member, entry: entry ?? null })
    }
    for (const entry of todayEntries) {
      if (!activeStaff.find(s => s.id === entry.staffId)) {
        const member = staff.find(s => s.id === entry.staffId)
        if (member) entries.push({ staff: member, entry })
      }
    }
    return entries
  }, [activeStaff, todayEntries, staff])

  if (loading) {
    return (
      <ModuleWorkspaceShell title={mod.name} description={mod.desc} category="bokforing" sectorName="Detaljhandel" backHref={`/m/${sectorSlug}`} settingsHref={settingsHref}>
        <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      </ModuleWorkspaceShell>
    )
  }

  const tabsContent = (
    <Tabs value={activeTab} onValueChange={setActiveTab}>
      <TabsList>
        <TabsTrigger value="idag"><ClipboardList className="mr-1.5 h-3.5 w-3.5" />Dagens liggare</TabsTrigger>
        <TabsTrigger value="personal"><Users className="mr-1.5 h-3.5 w-3.5" />Personal</TabsTrigger>
        <TabsTrigger value="historik"><History className="mr-1.5 h-3.5 w-3.5" />Historik</TabsTrigger>
      </TabsList>

      <TabsContent value="idag" className="space-y-6">
        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Incheckade just nu</CardTitle></CardHeader>
            <CardContent><div className="flex items-center gap-2"><UserCheck className="h-5 w-5 text-emerald-600" /><span className="text-2xl font-bold">{checkedInCount}</span><span className="text-sm text-muted-foreground">av {activeStaff.length} forvantade</span></div></CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Totala timmar idag</CardTitle></CardHeader>
            <CardContent><div className="flex items-center gap-2"><Timer className="h-5 w-5 text-blue-600" /><span className="text-2xl font-bold">{totalHoursToday.toFixed(1)}h</span></div></CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Klockan</CardTitle></CardHeader>
            <CardContent><div className="flex items-center gap-2"><Clock className="h-5 w-5 text-amber-600" /><span className="text-2xl font-bold font-mono">{currentTime}</span></div></CardContent>
          </Card>
        </div>

        <div className="flex items-center justify-between">
          <h2 className="text-lg font-medium capitalize">{formatDateSwedish(todayISO())}</h2>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={handleExportSkatteverket}>
              <Download className="mr-1.5 h-3.5 w-3.5" />Exportera Skatteverket
            </Button>
            <Button variant="outline" size="sm" onClick={() => setAddPersonDialogOpen(true)}>
              <Plus className="mr-1.5 h-3.5 w-3.5" />Lagg till person
            </Button>
          </div>
        </div>

        {todayRegister.length === 0 ? (
          <EmptyModuleState icon={ClipboardList} title="Inga registrerade personer" description="Lagg till personal under fliken Personal eller lagg till en person direkt." actionLabel="Lagg till personal" onAction={() => { setActiveTab('personal'); openNewStaff() }} />
        ) : (
          <div className="rounded-lg border border-border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead>Namn</TableHead><TableHead>Roll</TableHead><TableHead>Incheckning</TableHead><TableHead>Utcheckning</TableHead><TableHead>Timmar</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Atgarder</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {todayRegister.map(({ staff: member, entry }) => {
                  const status = entry ? getEntryStatus(entry) : { label: 'Ej anland', variant: 'danger' as const }
                  const hours = entry ? calculateHoursBetween(entry.checkIn, entry.checkOut ?? (entry.checkIn ? nowTimeString() : null)) : 0
                  return (
                    <TableRow key={member.id}>
                      <TableCell className="font-medium"><div>{member.name}</div><div className="text-xs text-muted-foreground">{member.personnummer4 ? `****-${member.personnummer4}` : ''}</div></TableCell>
                      <TableCell className="capitalize">{member.role}</TableCell>
                      <TableCell>{entry?.checkIn ? (<button className="font-mono text-sm hover:underline cursor-pointer" onClick={() => openTimeOverride(member.id, 'checkIn')}>{entry.checkIn}</button>) : <span className="text-muted-foreground">--:--</span>}</TableCell>
                      <TableCell>{entry?.checkOut ? (<button className="font-mono text-sm hover:underline cursor-pointer" onClick={() => openTimeOverride(member.id, 'checkOut')}>{entry.checkOut}</button>) : <span className="text-muted-foreground">--:--</span>}</TableCell>
                      <TableCell>{hours > 0 ? <span className="font-mono text-sm">{hours.toFixed(1)}h</span> : <span className="text-muted-foreground">-</span>}</TableCell>
                      <TableCell><StatusBadge label={status.label} variant={status.variant} /></TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          {(!entry || !entry.checkIn) && <Button variant="outline" size="sm" className="text-emerald-600 border-emerald-200 hover:bg-emerald-50" onClick={() => handleCheckIn(member.id)}><LogIn className="mr-1.5 h-3.5 w-3.5" />Checka in</Button>}
                          {entry?.checkIn && !entry.checkOut && <Button variant="outline" size="sm" className="text-amber-600 border-amber-200 hover:bg-amber-50" onClick={() => handleCheckOut(member.id)}><LogOut className="mr-1.5 h-3.5 w-3.5" />Checka ut</Button>}
                          {entry?.checkOut && <Button variant="outline" size="sm" onClick={() => handleCheckIn(member.id)} title="Checka in igen"><LogIn className="mr-1.5 h-3.5 w-3.5" />Ny incheckning</Button>}
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

      <TabsContent value="personal" className="space-y-4">
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">Hantera registrerade medarbetare for personalliggaren.</p>
          <Button size="sm" onClick={openNewStaff}><Plus className="mr-1.5 h-3.5 w-3.5" />Ny personal</Button>
        </div>
        {staff.length === 0 ? (
          <EmptyModuleState icon={Users} title="Ingen personal registrerad" description="Lagg till personal som ska registreras i personalliggaren." actionLabel="Lagg till personal" onAction={openNewStaff} />
        ) : (
          <div className="rounded-lg border border-border overflow-hidden">
            <Table>
              <TableHeader><TableRow className="bg-muted/50"><TableHead>Namn</TableHead><TableHead>Roll</TableHead><TableHead>Personnummer (sista 4)</TableHead><TableHead className="text-center">Aktiv</TableHead><TableHead className="text-right">Atgarder</TableHead></TableRow></TableHeader>
              <TableBody>
                {staff.map((member) => (
                  <TableRow key={member.id}>
                    <TableCell className="font-medium">{member.name}</TableCell>
                    <TableCell className="capitalize">{member.role}</TableCell>
                    <TableCell>{member.personnummer4 ? `****-${member.personnummer4}` : '-'}</TableCell>
                    <TableCell className="text-center"><Switch checked={member.active} onCheckedChange={() => handleToggleStaffActive(member.id)} /></TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEditStaff(member)}><Pencil className="h-3.5 w-3.5" /></Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => handleDeleteStaff(member.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
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
        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-2"><Label>Datum</Label><Input type="date" value={historyDate} onChange={(e) => setHistoryDate(e.target.value)} className="w-auto" /></div>
        </div>
        <div>
          <h3 className="text-sm font-medium mb-3 capitalize">{formatDateSwedish(historyDate)}</h3>
          {historyLoading ? (
            <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
          ) : historyEntries.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center"><CalendarDays className="h-8 w-8 text-muted-foreground mb-3" /><p className="text-sm text-muted-foreground">Inga poster for detta datum.</p></div>
          ) : (
            <div className="rounded-lg border border-border overflow-hidden">
              <Table>
                <TableHeader><TableRow className="bg-muted/50"><TableHead>Namn</TableHead><TableHead>Roll</TableHead><TableHead>Incheckning</TableHead><TableHead>Utcheckning</TableHead><TableHead>Timmar</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
                <TableBody>
                  {historyEntries.map((entry, i) => {
                    const status = getEntryStatus(entry)
                    const hours = calculateHoursBetween(entry.checkIn, entry.checkOut)
                    return (
                      <TableRow key={`${entry.staffId}-${i}`}>
                        <TableCell className="font-medium">{entry.name}</TableCell>
                        <TableCell className="capitalize">{entry.role}</TableCell>
                        <TableCell className="font-mono text-sm">{entry.checkIn ?? '--:--'}</TableCell>
                        <TableCell className="font-mono text-sm">{entry.checkOut ?? '--:--'}</TableCell>
                        <TableCell className="font-mono text-sm">{hours > 0 ? `${hours.toFixed(1)}h` : '-'}</TableCell>
                        <TableCell><StatusBadge label={status.label} variant={status.variant} /></TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </div>

        <Separator />

        <div className="space-y-4">
          <div className="flex items-center gap-4">
            <h3 className="text-lg font-medium">Manadssammanfattning</h3>
            <Input type="month" value={monthSummaryDate} onChange={(e) => setMonthSummaryDate(e.target.value)} className="w-auto" />
          </div>
          {monthlySummaryLoading ? (
            <div className="flex items-center justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
          ) : monthlySummary.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4">Inga poster for denna manad.</p>
          ) : (
            <div className="rounded-lg border border-border overflow-hidden">
              <Table>
                <TableHeader><TableRow className="bg-muted/50"><TableHead>Namn</TableHead><TableHead className="text-right">Totala timmar</TableHead></TableRow></TableHeader>
                <TableBody>
                  {monthlySummary.sort((a, b) => b.totalHours - a.totalHours).map((row) => (
                    <TableRow key={row.staffId}><TableCell className="font-medium">{row.name}</TableCell><TableCell className="text-right font-mono">{row.totalHours.toFixed(1)}h</TableCell></TableRow>
                  ))}
                  <TableRow className="bg-muted/30 font-medium"><TableCell>Totalt</TableCell><TableCell className="text-right font-mono">{monthlySummary.reduce((sum, r) => sum + r.totalHours, 0).toFixed(1)}h</TableCell></TableRow>
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      </TabsContent>
    </Tabs>
  )

  return (
    <>
      <ModuleWorkspaceShell title={mod.name} description={mod.desc} category="bokforing" sectorName="Detaljhandel" backHref={`/m/${sectorSlug}`} settingsHref={settingsHref}
        actions={<Button size="sm" onClick={() => setAddPersonDialogOpen(true)}><Plus className="mr-1.5 h-3.5 w-3.5" />Checka in person</Button>}
        tabs={tabsContent}>{tabsContent}</ModuleWorkspaceShell>

      <Dialog open={staffDialogOpen} onOpenChange={setStaffDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{editingStaff ? 'Redigera personal' : 'Ny personal'}</DialogTitle><DialogDescription>{editingStaff ? 'Uppdatera personalens information nedan.' : 'Fyll i uppgifter for den nya medarbetaren.'}</DialogDescription></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2"><Label>Namn *</Label><Input value={staffForm.name} onChange={(e) => setStaffForm(f => ({ ...f, name: e.target.value }))} placeholder="Fornamn Efternamn" /></div>
            <div className="space-y-2"><Label>Roll</Label><Select value={staffForm.role} onValueChange={(v) => setStaffForm(f => ({ ...f, role: v }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{ROLES.map(r => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}</SelectContent></Select></div>
            <div className="space-y-2"><Label>Personnummer (sista 4 siffror)</Label><Input value={staffForm.personnummer4} onChange={(e) => { const val = e.target.value.replace(/\D/g, '').slice(0, 4); setStaffForm(f => ({ ...f, personnummer4: val })) }} placeholder="1234" maxLength={4} /><p className="text-xs text-muted-foreground">Anvands for identifiering enligt Skatteverkets krav.</p></div>
            <div className="flex items-center gap-3"><Switch id="staff-active" checked={staffForm.active} onCheckedChange={(checked) => setStaffForm(f => ({ ...f, active: checked }))} /><Label htmlFor="staff-active">Aktiv</Label></div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setStaffDialogOpen(false)}>Avbryt</Button><Button onClick={handleSaveStaff} disabled={saving || !staffForm.name.trim()}>{saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{editingStaff ? 'Uppdatera' : 'Lagg till'}</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={timeOverrideDialogOpen} onOpenChange={setTimeOverrideDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Andra tid manuellt</DialogTitle><DialogDescription>Ange korrekt tid for {timeOverrideTarget?.field === 'checkIn' ? 'incheckning' : 'utcheckning'}.</DialogDescription></DialogHeader>
          <div className="space-y-4 py-2"><div className="space-y-2"><Label>{timeOverrideTarget?.field === 'checkIn' ? 'Incheckningstid' : 'Utcheckningstid'}</Label><Input type="time" value={timeOverrideValue} onChange={(e) => setTimeOverrideValue(e.target.value)} /></div></div>
          <DialogFooter><Button variant="outline" onClick={() => setTimeOverrideDialogOpen(false)}>Avbryt</Button><Button onClick={handleTimeOverrideSave} disabled={!timeOverrideValue}>Spara</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={addPersonDialogOpen} onOpenChange={setAddPersonDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Lagg till person och checka in</DialogTitle><DialogDescription>Registrera en ny person i personalliggaren. Personen checkas in automatiskt.</DialogDescription></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2"><Label>Namn *</Label><Input value={addPersonForm.name} onChange={(e) => setAddPersonForm(f => ({ ...f, name: e.target.value }))} placeholder="Fornamn Efternamn" /></div>
            <div className="space-y-2"><Label>Roll</Label><Select value={addPersonForm.role} onValueChange={(v) => setAddPersonForm(f => ({ ...f, role: v }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{ROLES.map(r => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}</SelectContent></Select></div>
            <div className="space-y-2"><Label>Personnummer (sista 4 siffror)</Label><Input value={addPersonForm.personnummer4} onChange={(e) => { const val = e.target.value.replace(/\D/g, '').slice(0, 4); setAddPersonForm(f => ({ ...f, personnummer4: val })) }} placeholder="1234" maxLength={4} /></div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setAddPersonDialogOpen(false)}>Avbryt</Button><Button onClick={handleQuickAddPerson} disabled={!addPersonForm.name.trim()}><LogIn className="mr-1.5 h-3.5 w-3.5" />Lagg till och checka in</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
