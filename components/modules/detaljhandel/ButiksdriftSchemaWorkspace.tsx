'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { ModuleWorkspaceShell } from '@/components/modules/ModuleWorkspaceShell'
import { KPICard } from '@/components/modules/shared/KPICard'
import { EmptyModuleState } from '@/components/modules/shared/EmptyModuleState'
import { StatusBadge } from '@/components/modules/shared/StatusBadge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { Plus, Pencil, Trash2, Loader2, CalendarDays, Clock, Users, Save } from 'lucide-react'
import { cn } from '@/lib/utils'

interface ModuleWorkspaceProps {
  module: { slug: string; name: string; cat: string; desc: string; longDesc: string }
  sectorSlug: string
  settingsHref: string
}

interface ShiftEntry {
  id: string
  staffName: string
  role: string
  date: string
  startTime: string
  endTime: string
  breakMinutes: number
  hoursWorked: number
  status: 'planerad' | 'genomford' | 'sjuk' | 'ledig'
}

interface WeekBudget {
  weekNumber: string
  budgetHours: number
  actualHours: number
  budgetCostKr: number
  actualCostKr: number
}

const ROLES = [
  { value: 'butikschef', label: 'Butikschef' },
  { value: 'kassapersonal', label: 'Kassapersonal' },
  { value: 'lagerarbetare', label: 'Lagerarbetare' },
  { value: 'chark', label: 'Charkpersonal' },
  { value: 'saljare', label: 'Säljare' },
  { value: 'deltid', label: 'Deltid/Extra' },
]

const STATUSES: Array<{ value: ShiftEntry['status']; label: string }> = [
  { value: 'planerad', label: 'Planerad' },
  { value: 'genomford', label: 'Genomförd' },
  { value: 'sjuk', label: 'Sjuk' },
  { value: 'ledig', label: 'Ledig' },
]

const STATUS_VARIANTS: Record<string, 'success' | 'warning' | 'danger' | 'info' | 'neutral'> = {
  planerad: 'info',
  genomford: 'success',
  sjuk: 'danger',
  ledig: 'neutral',
}

function generateId(): string {
  return crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`
}

function todayStr(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function getWeekNumber(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00')
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7))
  const week1 = new Date(d.getFullYear(), 0, 4)
  const weekNum = 1 + Math.round(((d.getTime() - week1.getTime()) / 86400000 - 3 + ((week1.getDay() + 6) % 7)) / 7)
  return `${d.getFullYear()}-V${String(weekNum).padStart(2, '0')}`
}

function calcHours(start: string, end: string, breakMin: number): number {
  const [sh, sm] = start.split(':').map(Number)
  const [eh, em] = end.split(':').map(Number)
  let hours = (eh - sh) + (em - sm) / 60 - breakMin / 60
  if (hours < 0) hours += 24
  return Math.max(0, hours)
}

function fmt(n: number): string {
  return new Intl.NumberFormat('sv-SE', { maximumFractionDigits: 0 }).format(n)
}

function fmtDec(n: number): string {
  return isFinite(n) ? n.toFixed(1) : '0.0'
}

const EMPTY_FORM = {
  staffName: '',
  role: 'kassapersonal',
  date: todayStr(),
  startTime: '08:00',
  endTime: '17:00',
  breakMinutes: 60,
  status: 'planerad' as ShiftEntry['status'],
}

const EMPTY_BUDGET_FORM = {
  weekNumber: getWeekNumber(todayStr()),
  budgetHours: 0,
  budgetCostKr: 0,
}

export function ButiksdriftSchemaWorkspace({ module: mod, sectorSlug, settingsHref }: ModuleWorkspaceProps) {
  const supabase = createClient()

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [shifts, setShifts] = useState<ShiftEntry[]>([])
  const [budgets, setBudgets] = useState<WeekBudget[]>([])
  const [selectedWeek, setSelectedWeek] = useState(getWeekNumber(todayStr()))

  const [shiftDialogOpen, setShiftDialogOpen] = useState(false)
  const [editingShift, setEditingShift] = useState<ShiftEntry | null>(null)
  const [shiftForm, setShiftForm] = useState(EMPTY_FORM)

  const [budgetDialogOpen, setBudgetDialogOpen] = useState(false)
  const [budgetForm, setBudgetForm] = useState(EMPTY_BUDGET_FORM)

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [shiftToDelete, setShiftToDelete] = useState<ShiftEntry | null>(null)

  const saveConfig = useCallback(async (key: string, value: unknown) => {
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setSaving(false); return }
    await supabase.from('module_configs').upsert(
      { user_id: user.id, sector_slug: sectorSlug, module_slug: mod.slug, config_key: key, config_value: value },
      { onConflict: 'user_id,sector_slug,module_slug,config_key' }
    )
    setSaving(false)
  }, [supabase, sectorSlug, mod.slug])

  const fetchData = useCallback(async () => {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); return }
    const [shiftsRes, budgetsRes] = await Promise.all([
      supabase.from('module_configs').select('config_value').eq('user_id', user.id).eq('sector_slug', sectorSlug).eq('module_slug', mod.slug).eq('config_key', 'shifts').maybeSingle(),
      supabase.from('module_configs').select('config_value').eq('user_id', user.id).eq('sector_slug', sectorSlug).eq('module_slug', mod.slug).eq('config_key', 'week_budgets').maybeSingle(),
    ])
    if (shiftsRes.data?.config_value && Array.isArray(shiftsRes.data.config_value)) setShifts(shiftsRes.data.config_value as ShiftEntry[])
    if (budgetsRes.data?.config_value && Array.isArray(budgetsRes.data.config_value)) setBudgets(budgetsRes.data.config_value as WeekBudget[])
    setLoading(false)
  }, [supabase, sectorSlug, mod.slug])

  useEffect(() => { fetchData() }, [fetchData])

  const weekShifts = useMemo(() => {
    return shifts.filter(s => getWeekNumber(s.date) === selectedWeek).sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime))
  }, [shifts, selectedWeek])

  const totalHoursThisWeek = useMemo(() => weekShifts.reduce((s, sh) => s + sh.hoursWorked, 0), [weekShifts])
  const uniqueStaff = useMemo(() => new Set(weekShifts.map(s => s.staffName)).size, [weekShifts])
  const currentBudget = useMemo(() => budgets.find(b => b.weekNumber === selectedWeek), [budgets, selectedWeek])

  const availableWeeks = useMemo(() => {
    const weeks = new Set<string>()
    shifts.forEach(s => weeks.add(getWeekNumber(s.date)))
    weeks.add(getWeekNumber(todayStr()))
    return Array.from(weeks).sort().reverse()
  }, [shifts])

  function openNewShift() { setEditingShift(null); setShiftForm({ ...EMPTY_FORM }); setShiftDialogOpen(true) }
  function openEditShift(shift: ShiftEntry) {
    setEditingShift(shift)
    setShiftForm({ staffName: shift.staffName, role: shift.role, date: shift.date, startTime: shift.startTime, endTime: shift.endTime, breakMinutes: shift.breakMinutes, status: shift.status })
    setShiftDialogOpen(true)
  }

  async function handleSaveShift() {
    const hoursWorked = calcHours(shiftForm.startTime, shiftForm.endTime, shiftForm.breakMinutes)
    const shift: ShiftEntry = {
      id: editingShift?.id ?? generateId(),
      staffName: shiftForm.staffName.trim(), role: shiftForm.role, date: shiftForm.date,
      startTime: shiftForm.startTime, endTime: shiftForm.endTime, breakMinutes: shiftForm.breakMinutes,
      hoursWorked, status: shiftForm.status,
    }
    let updated: ShiftEntry[]
    if (editingShift) updated = shifts.map(s => s.id === editingShift.id ? shift : s)
    else updated = [...shifts, shift]
    setShifts(updated)
    setShiftDialogOpen(false)
    await saveConfig('shifts', updated)

    // Auto-update budget actuals
    const weekNum = getWeekNumber(shift.date)
    const weekHours = updated.filter(s => getWeekNumber(s.date) === weekNum).reduce((sum, s) => sum + s.hoursWorked, 0)
    const existingBudget = budgets.find(b => b.weekNumber === weekNum)
    if (existingBudget) {
      const updatedBudgets = budgets.map(b => b.weekNumber === weekNum ? { ...b, actualHours: weekHours } : b)
      setBudgets(updatedBudgets)
      await saveConfig('week_budgets', updatedBudgets)
    }
  }

  async function handleSaveBudget() {
    const budget: WeekBudget = {
      weekNumber: budgetForm.weekNumber,
      budgetHours: budgetForm.budgetHours,
      actualHours: weekShifts.reduce((s, sh) => s + sh.hoursWorked, 0),
      budgetCostKr: budgetForm.budgetCostKr,
      actualCostKr: 0,
    }
    const updated = [...budgets.filter(b => b.weekNumber !== budget.weekNumber), budget].sort((a, b) => b.weekNumber.localeCompare(a.weekNumber))
    setBudgets(updated)
    setBudgetDialogOpen(false)
    await saveConfig('week_budgets', updated)
  }

  async function handleDeleteShift() {
    if (!shiftToDelete) return
    const updated = shifts.filter(s => s.id !== shiftToDelete.id)
    setShifts(updated)
    setDeleteDialogOpen(false)
    setShiftToDelete(null)
    await saveConfig('shifts', updated)
  }

  return (
    <>
      <ModuleWorkspaceShell
        title={mod.name} description={mod.desc} category="operativ" sectorName="Detaljhandel"
        backHref={`/m/${sectorSlug}`} settingsHref={settingsHref}
        actions={<Button onClick={openNewShift}><Plus className="mr-2 h-4 w-4" />Nytt pass</Button>}
      >
        <Tabs defaultValue="schema" className="space-y-6">
          <TabsList>
            <TabsTrigger value="schema"><CalendarDays className="mr-1.5 h-3.5 w-3.5" />Schema</TabsTrigger>
            <TabsTrigger value="budget"><Clock className="mr-1.5 h-3.5 w-3.5" />Budgetjämförelse</TabsTrigger>
          </TabsList>

          <TabsContent value="schema" className="space-y-6">
            {loading ? (
              <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
            ) : (
              <>
                <div className="flex items-center gap-4">
                  <Select value={selectedWeek} onValueChange={setSelectedWeek}>
                    <SelectTrigger className="w-[200px]"><SelectValue placeholder="Välj vecka" /></SelectTrigger>
                    <SelectContent>{availableWeeks.map(w => <SelectItem key={w} value={w}>{w}</SelectItem>)}</SelectContent>
                  </Select>
                </div>

                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  <KPICard label="Timmar denna vecka" value={fmtDec(totalHoursThisWeek)} unit="h" />
                  <KPICard label="Antal pass" value={String(weekShifts.length)} unit="st" />
                  <KPICard label="Personal" value={String(uniqueStaff)} unit="personer" />
                  {currentBudget && (
                    <KPICard label="Budget" value={fmtDec(currentBudget.budgetHours)} unit="h"
                      trend={totalHoursThisWeek <= currentBudget.budgetHours ? 'up' : 'down'}
                      trendLabel={totalHoursThisWeek <= currentBudget.budgetHours ? 'Under budget' : 'Över budget'} />
                  )}
                </div>

                {weekShifts.length === 0 ? (
                  <EmptyModuleState icon={CalendarDays} title="Inga pass" description="Lägg till personalpass för denna vecka." actionLabel="Nytt pass" onAction={openNewShift} />
                ) : (
                  <div className="rounded-xl border border-border overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-muted/50">
                          <TableHead className="font-medium">Datum</TableHead>
                          <TableHead className="font-medium">Personal</TableHead>
                          <TableHead className="font-medium">Roll</TableHead>
                          <TableHead className="font-medium">Tid</TableHead>
                          <TableHead className="font-medium text-right">Rast (min)</TableHead>
                          <TableHead className="font-medium text-right">Timmar</TableHead>
                          <TableHead className="font-medium">Status</TableHead>
                          <TableHead className="font-medium text-right">Åtgärder</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {weekShifts.map((shift) => (
                          <TableRow key={shift.id}>
                            <TableCell>{shift.date}</TableCell>
                            <TableCell className="font-medium">{shift.staffName}</TableCell>
                            <TableCell className="capitalize">{shift.role}</TableCell>
                            <TableCell className="font-mono text-sm">{shift.startTime} - {shift.endTime}</TableCell>
                            <TableCell className="text-right tabular-nums">{shift.breakMinutes}</TableCell>
                            <TableCell className="text-right tabular-nums font-medium">{fmtDec(shift.hoursWorked)}</TableCell>
                            <TableCell><StatusBadge label={STATUSES.find(s => s.value === shift.status)?.label ?? shift.status} variant={STATUS_VARIANTS[shift.status] ?? 'neutral'} /></TableCell>
                            <TableCell className="text-right">
                              <div className="flex items-center justify-end gap-1">
                                <Button variant="ghost" size="icon" onClick={() => openEditShift(shift)}><Pencil className="h-4 w-4" /></Button>
                                <Button variant="ghost" size="icon" className="text-red-600 hover:text-red-700" onClick={() => { setShiftToDelete(shift); setDeleteDialogOpen(true) }}><Trash2 className="h-4 w-4" /></Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                        <TableRow className="bg-muted/30 font-medium">
                          <TableCell colSpan={5}>Totalt</TableCell>
                          <TableCell className="text-right tabular-nums">{fmtDec(totalHoursThisWeek)}h</TableCell>
                          <TableCell colSpan={2} />
                        </TableRow>
                      </TableBody>
                    </Table>
                  </div>
                )}
              </>
            )}
          </TabsContent>

          <TabsContent value="budget" className="space-y-6">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">Jämför schemalagda timmar mot personalbudget per vecka.</p>
              <Button variant="outline" onClick={() => { setBudgetForm({ weekNumber: selectedWeek, budgetHours: 0, budgetCostKr: 0 }); setBudgetDialogOpen(true) }}><Plus className="mr-2 h-4 w-4" />Sätt budget</Button>
            </div>

            {budgets.length === 0 ? (
              <EmptyModuleState icon={Clock} title="Ingen budget" description="Sätt en veckobudget för att jämföra mot faktiska timmar." actionLabel="Sätt budget" onAction={() => { setBudgetForm({ weekNumber: selectedWeek, budgetHours: 0, budgetCostKr: 0 }); setBudgetDialogOpen(true) }} />
            ) : (
              <div className="rounded-xl border border-border overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead className="font-medium">Vecka</TableHead>
                      <TableHead className="font-medium text-right">Budget (h)</TableHead>
                      <TableHead className="font-medium text-right">Faktiskt (h)</TableHead>
                      <TableHead className="font-medium text-right">Diff (h)</TableHead>
                      <TableHead className="font-medium text-right">Budget (kr)</TableHead>
                      <TableHead className="font-medium">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {budgets.map((b) => {
                      const diff = b.actualHours - b.budgetHours
                      return (
                        <TableRow key={b.weekNumber}>
                          <TableCell className="font-medium">{b.weekNumber}</TableCell>
                          <TableCell className="text-right tabular-nums">{fmtDec(b.budgetHours)}</TableCell>
                          <TableCell className="text-right tabular-nums">{fmtDec(b.actualHours)}</TableCell>
                          <TableCell className="text-right tabular-nums">
                            <span className={cn('font-medium', diff <= 0 ? 'text-emerald-600' : 'text-red-600')}>
                              {diff >= 0 ? '+' : ''}{fmtDec(diff)}
                            </span>
                          </TableCell>
                          <TableCell className="text-right tabular-nums">{fmt(b.budgetCostKr)} kr</TableCell>
                          <TableCell>
                            <StatusBadge label={diff <= 0 ? 'Under budget' : 'Över budget'} variant={diff <= 0 ? 'success' : 'danger'} />
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </TabsContent>
        </Tabs>
        {saving && <div className="flex items-center gap-2 text-xs text-muted-foreground mt-4"><Loader2 className="h-3.5 w-3.5 animate-spin" />Sparar...</div>}
      </ModuleWorkspaceShell>

      <Dialog open={shiftDialogOpen} onOpenChange={setShiftDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{editingShift ? 'Redigera pass' : 'Nytt pass'}</DialogTitle><DialogDescription>{editingShift ? 'Uppdatera passinformation.' : 'Schemalägg ett nytt personalpass.'}</DialogDescription></DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2"><Label>Personal *</Label><Input value={shiftForm.staffName} onChange={(e) => setShiftForm(f => ({ ...f, staffName: e.target.value }))} placeholder="Förnamn Efternamn" /></div>
              <div className="grid gap-2"><Label>Roll</Label><Select value={shiftForm.role} onValueChange={(v) => setShiftForm(f => ({ ...f, role: v }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{ROLES.map(r => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}</SelectContent></Select></div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="grid gap-2"><Label>Datum *</Label><Input type="date" value={shiftForm.date} onChange={(e) => setShiftForm(f => ({ ...f, date: e.target.value }))} /></div>
              <div className="grid gap-2"><Label>Start</Label><Input type="time" value={shiftForm.startTime} onChange={(e) => setShiftForm(f => ({ ...f, startTime: e.target.value }))} /></div>
              <div className="grid gap-2"><Label>Slut</Label><Input type="time" value={shiftForm.endTime} onChange={(e) => setShiftForm(f => ({ ...f, endTime: e.target.value }))} /></div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2"><Label>Rast (min)</Label><Input type="number" min={0} value={shiftForm.breakMinutes} onChange={(e) => setShiftForm(f => ({ ...f, breakMinutes: Number(e.target.value) || 0 }))} /></div>
              <div className="grid gap-2"><Label>Status</Label><Select value={shiftForm.status} onValueChange={(v) => setShiftForm(f => ({ ...f, status: v as ShiftEntry['status'] }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{STATUSES.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent></Select></div>
            </div>
            <p className="text-xs text-muted-foreground">Beräknade timmar: <strong>{fmtDec(calcHours(shiftForm.startTime, shiftForm.endTime, shiftForm.breakMinutes))}h</strong></p>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setShiftDialogOpen(false)}>Avbryt</Button><Button onClick={handleSaveShift} disabled={!shiftForm.staffName.trim()}>{editingShift ? 'Uppdatera' : 'Lägg till'}</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={budgetDialogOpen} onOpenChange={setBudgetDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Sätt veckobudget</DialogTitle><DialogDescription>Ange personalbudget för veckan.</DialogDescription></DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-2"><Label>Vecka</Label><Input value={budgetForm.weekNumber} onChange={(e) => setBudgetForm(f => ({ ...f, weekNumber: e.target.value }))} placeholder="2024-V05" /></div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2"><Label>Budget timmar</Label><Input type="number" min={0} value={budgetForm.budgetHours} onChange={(e) => setBudgetForm(f => ({ ...f, budgetHours: Number(e.target.value) || 0 }))} /></div>
              <div className="grid gap-2"><Label>Budget kostnad (kr)</Label><Input type="number" min={0} value={budgetForm.budgetCostKr} onChange={(e) => setBudgetForm(f => ({ ...f, budgetCostKr: Number(e.target.value) || 0 }))} /></div>
            </div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setBudgetDialogOpen(false)}>Avbryt</Button><Button onClick={handleSaveBudget} disabled={budgetForm.budgetHours <= 0}><Save className="mr-2 h-4 w-4" />Spara</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Ta bort pass</DialogTitle><DialogDescription>Är du säker på att du vill ta bort detta pass för {shiftToDelete?.staffName}?</DialogDescription></DialogHeader>
          <DialogFooter><Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>Avbryt</Button><Button variant="destructive" onClick={handleDeleteShift}><Trash2 className="mr-2 h-4 w-4" />Ta bort</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
