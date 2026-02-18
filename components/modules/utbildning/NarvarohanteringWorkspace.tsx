'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { ModuleWorkspaceShell } from '@/components/modules/ModuleWorkspaceShell'
import { EmptyModuleState } from '@/components/modules/shared/EmptyModuleState'
import { KPICard } from '@/components/modules/shared/KPICard'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { Loader2, CheckCircle, XCircle, Clock, CalendarDays } from 'lucide-react'
import { cn } from '@/lib/utils'

interface ModuleWorkspaceProps {
  module: { slug: string; name: string; cat: string; desc: string; longDesc: string }
  sectorSlug: string
  settingsHref: string
}

type AttendanceStatus = 'present' | 'absent' | 'late' | 'notReported'
interface AttendanceRecord { studentId: string; studentName: string; status: AttendanceStatus; note: string }
interface DayRecord { date: string; records: AttendanceRecord[] }

const STATUS_LABELS: Record<AttendanceStatus, string> = { present: 'Närvarande', absent: 'Frånvarande', late: 'Sen', notReported: 'Ej rapporterat' }
const STATUS_COLORS: Record<AttendanceStatus, string> = {
  present: 'bg-emerald-100 text-emerald-800', absent: 'bg-red-100 text-red-800', late: 'bg-amber-100 text-amber-800', notReported: 'bg-gray-100 text-gray-600',
}

function todayISO(): string { return new Date().toISOString().split('T')[0] }
function fmtPct(n: number): string { return isFinite(n) ? n.toFixed(1) : '0.0' }

export function NarvarohanteringWorkspace({ module: mod, sectorSlug, settingsHref }: ModuleWorkspaceProps) {
  const supabase = createClient()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [days, setDays] = useState<DayRecord[]>([])
  const [selectedDate, setSelectedDate] = useState(todayISO())
  const [students, setStudents] = useState<{ id: string; name: string }[]>([])

  const saveDays = useCallback(async (items: DayRecord[]) => {
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setSaving(false); return }
    await supabase.from('module_configs').upsert(
      { user_id: user.id, sector_slug: sectorSlug, module_slug: mod.slug, config_key: 'attendance', config_value: items },
      { onConflict: 'user_id,sector_slug,module_slug,config_key' }
    )
    setSaving(false)
  }, [supabase, sectorSlug, mod.slug])

  const fetchData = useCallback(async () => {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); return }

    const { data: attData } = await supabase.from('module_configs').select('config_value')
      .eq('user_id', user.id).eq('sector_slug', sectorSlug).eq('module_slug', mod.slug).eq('config_key', 'attendance').maybeSingle()
    if (attData?.config_value && Array.isArray(attData.config_value)) setDays(attData.config_value as DayRecord[])

    const { data: studentData } = await supabase.from('module_configs').select('config_value')
      .eq('user_id', user.id).eq('sector_slug', sectorSlug).eq('module_slug', 'elevregister').eq('config_key', 'students').maybeSingle()
    if (studentData?.config_value && Array.isArray(studentData.config_value)) {
      setStudents((studentData.config_value as { id: string; firstName: string; lastName: string }[]).map(s => ({ id: s.id, name: `${s.firstName} ${s.lastName}` })))
    }
    setLoading(false)
  }, [supabase, sectorSlug, mod.slug])

  useEffect(() => { fetchData() }, [fetchData])

  const currentDay = useMemo(() => days.find(d => d.date === selectedDate), [days, selectedDate])
  const currentRecords = useMemo(() => {
    if (currentDay) return currentDay.records
    return students.map(s => ({ studentId: s.id, studentName: s.name, status: 'notReported' as AttendanceStatus, note: '' }))
  }, [currentDay, students])

  const stats = useMemo(() => {
    const allRecords = days.flatMap(d => d.records)
    const total = allRecords.length
    const present = allRecords.filter(r => r.status === 'present').length
    const absent = allRecords.filter(r => r.status === 'absent').length
    return { total, present, absent, pct: total > 0 ? (present / total) * 100 : 0 }
  }, [days])

  async function updateStatus(studentId: string, status: AttendanceStatus) {
    const newRecords = currentRecords.map(r => r.studentId === studentId ? { ...r, status } : r)
    const newDay: DayRecord = { date: selectedDate, records: newRecords }
    const updated = days.some(d => d.date === selectedDate) ? days.map(d => d.date === selectedDate ? newDay : d) : [...days, newDay]
    setDays(updated)
    await saveDays(updated)
  }

  return (
    <ModuleWorkspaceShell title={mod.name} description={mod.desc} category="operativ" sectorName="Utbildning & Förskola" backHref={`/m/${sectorSlug}`} settingsHref={settingsHref}>
      <Tabs defaultValue="daglig" className="space-y-6">
        <TabsList>
          <TabsTrigger value="daglig">Daglig närvaro</TabsTrigger>
          <TabsTrigger value="statistik">Statistik</TabsTrigger>
        </TabsList>

        <TabsContent value="daglig" className="space-y-6">
          {loading ? (
            <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
          ) : (
            <>
              <div className="flex items-center gap-3">
                <Input type="date" value={selectedDate} onChange={e => setSelectedDate(e.target.value)} className="w-auto" />
                <Button variant="outline" size="sm" onClick={() => setSelectedDate(todayISO())}>Idag</Button>
                {saving && <div className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" />Sparar...</div>}
              </div>

              {students.length === 0 ? (
                <EmptyModuleState icon={CalendarDays} title="Inga elever" description="Lägg till elever i elevregistret först, sedan kan du rapportera närvaro." />
              ) : (
                <div className="rounded-xl border border-border overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/50">
                        <TableHead className="font-medium">Elev</TableHead>
                        <TableHead className="font-medium">Status</TableHead>
                        <TableHead className="font-medium text-right">Snabbval</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {currentRecords.map(r => (
                        <TableRow key={r.studentId}>
                          <TableCell className="font-medium">{r.studentName}</TableCell>
                          <TableCell><Badge className={STATUS_COLORS[r.status]}>{STATUS_LABELS[r.status]}</Badge></TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-1">
                              <Button variant={r.status === 'present' ? 'default' : 'ghost'} size="icon" className="h-8 w-8" onClick={() => updateStatus(r.studentId, 'present')} title="Närvarande"><CheckCircle className="h-4 w-4" /></Button>
                              <Button variant={r.status === 'absent' ? 'default' : 'ghost'} size="icon" className="h-8 w-8" onClick={() => updateStatus(r.studentId, 'absent')} title="Frånvarande"><XCircle className="h-4 w-4" /></Button>
                              <Button variant={r.status === 'late' ? 'default' : 'ghost'} size="icon" className="h-8 w-8" onClick={() => updateStatus(r.studentId, 'late')} title="Sen"><Clock className="h-4 w-4" /></Button>
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

        <TabsContent value="statistik" className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <KPICard label="Registrerade dagar" value={days.length} />
            <KPICard label="Närvaro %" value={fmtPct(stats.pct)} unit="%" trend={stats.pct > 90 ? 'up' : 'down'} />
            <KPICard label="Totalt närvarande" value={stats.present} />
            <KPICard label="Totalt frånvarande" value={stats.absent} />
          </div>
        </TabsContent>
      </Tabs>
    </ModuleWorkspaceShell>
  )
}
