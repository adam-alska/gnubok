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
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
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
  AlertTriangle,
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface ModuleWorkspaceProps {
  module: { slug: string; name: string; cat: string; desc: string; longDesc: string }
  sectorSlug: string
  settingsHref: string
}

interface StaffMember {
  id: string
  name: string
  role: string
  team: string
  hoursPerWeek: number
}

interface Allocation {
  id: string
  staffId: string
  projectName: string
  client: string
  hoursPerWeek: number
  startDate: string
  endDate: string
}

const DEFAULT_STAFF: StaffMember[] = [
  { id: 's1', name: 'Anna Svensson', role: 'Frontend-utvecklare', team: 'Frontend', hoursPerWeek: 40 },
  { id: 's2', name: 'Erik Lindberg', role: 'Backend-utvecklare', team: 'Backend', hoursPerWeek: 40 },
  { id: 's3', name: 'Maria Karlsson', role: 'Fullstack-utvecklare', team: 'Frontend', hoursPerWeek: 40 },
  { id: 's4', name: 'Johan Nilsson', role: 'DevOps-ingenjor', team: 'DevOps', hoursPerWeek: 40 },
  { id: 's5', name: 'Sara Johansson', role: 'Projektledare', team: 'Projektledning', hoursPerWeek: 40 },
]

const DEFAULT_ALLOCATIONS: Allocation[] = [
  { id: 'a1', staffId: 's1', projectName: 'Webbplattform v2', client: 'Acme AB', hoursPerWeek: 32, startDate: '2024-03-01', endDate: '2024-09-30' },
  { id: 'a2', staffId: 's1', projectName: 'Intern utbildning', client: 'Intern', hoursPerWeek: 8, startDate: '2024-06-01', endDate: '2024-06-30' },
  { id: 'a3', staffId: 's2', projectName: 'Webbplattform v2', client: 'Acme AB', hoursPerWeek: 24, startDate: '2024-03-01', endDate: '2024-09-30' },
  { id: 'a4', staffId: 's2', projectName: 'Mobilapp Beta', client: 'Beta Corp', hoursPerWeek: 16, startDate: '2024-07-01', endDate: '2024-12-31' },
  { id: 'a5', staffId: 's3', projectName: 'Webbplattform v2', client: 'Acme AB', hoursPerWeek: 40, startDate: '2024-04-01', endDate: '2024-08-31' },
  { id: 'a6', staffId: 's4', projectName: 'IT-drift migration', client: 'Gamma Gruppen', hoursPerWeek: 20, startDate: '2024-01-15', endDate: '2024-04-30' },
  { id: 'a7', staffId: 's4', projectName: 'Webbplattform v2', client: 'Acme AB', hoursPerWeek: 8, startDate: '2024-03-01', endDate: '2024-09-30' },
  { id: 'a8', staffId: 's5', projectName: 'Webbplattform v2', client: 'Acme AB', hoursPerWeek: 16, startDate: '2024-03-01', endDate: '2024-09-30' },
  { id: 'a9', staffId: 's5', projectName: 'Mobilapp Beta', client: 'Beta Corp', hoursPerWeek: 24, startDate: '2024-07-01', endDate: '2024-12-31' },
]

function fmt(n: number): string {
  return new Intl.NumberFormat('sv-SE', { maximumFractionDigits: 0 }).format(n)
}

function fmtPct(n: number): string {
  return isFinite(n) ? n.toFixed(1) : '0.0'
}

function isActiveAllocation(a: Allocation): boolean {
  const now = new Date()
  return new Date(a.startDate) <= now && new Date(a.endDate) >= now
}

export function ResursplaneringWorkspace({ module: mod, sectorSlug, settingsHref }: ModuleWorkspaceProps) {
  const supabase = createClient()

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [staff, setStaff] = useState<StaffMember[]>([])
  const [allocations, setAllocations] = useState<Allocation[]>([])

  const [staffDialogOpen, setStaffDialogOpen] = useState(false)
  const [editingStaff, setEditingStaff] = useState<StaffMember | null>(null)
  const [staffForm, setStaffForm] = useState({ name: '', role: '', team: '', hoursPerWeek: 40 })

  const [allocDialogOpen, setAllocDialogOpen] = useState(false)
  const [editingAlloc, setEditingAlloc] = useState<Allocation | null>(null)
  const [allocForm, setAllocForm] = useState({ staffId: '', projectName: '', client: '', hoursPerWeek: 0, startDate: '', endDate: '' })

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<{ type: 'staff' | 'alloc'; id: string } | null>(null)

  const saveAll = useCallback(async (staffData: StaffMember[], allocData: Allocation[]) => {
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setSaving(false); return }

    await supabase.from('module_configs').upsert(
      {
        user_id: user.id,
        sector_slug: sectorSlug,
        module_slug: mod.slug,
        config_key: 'resource_staff',
        config_value: staffData,
      },
      { onConflict: 'user_id,sector_slug,module_slug,config_key' }
    )
    await supabase.from('module_configs').upsert(
      {
        user_id: user.id,
        sector_slug: sectorSlug,
        module_slug: mod.slug,
        config_key: 'resource_allocations',
        config_value: allocData,
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
      .eq('config_key', 'resource_staff')
      .maybeSingle()

    const { data: allocData } = await supabase
      .from('module_configs')
      .select('config_value')
      .eq('user_id', user.id)
      .eq('sector_slug', sectorSlug)
      .eq('module_slug', mod.slug)
      .eq('config_key', 'resource_allocations')
      .maybeSingle()

    if (staffData?.config_value && Array.isArray(staffData.config_value) && staffData.config_value.length > 0) {
      setStaff(staffData.config_value as StaffMember[])
    } else {
      setStaff(DEFAULT_STAFF)
    }

    if (allocData?.config_value && Array.isArray(allocData.config_value) && allocData.config_value.length > 0) {
      setAllocations(allocData.config_value as Allocation[])
    } else {
      setAllocations(DEFAULT_ALLOCATIONS)
    }

    // Seed defaults if needed
    if (!staffData?.config_value || !allocData?.config_value) {
      await supabase.from('module_configs').upsert(
        {
          user_id: user.id,
          sector_slug: sectorSlug,
          module_slug: mod.slug,
          config_key: 'resource_staff',
          config_value: DEFAULT_STAFF,
        },
        { onConflict: 'user_id,sector_slug,module_slug,config_key' }
      )
      await supabase.from('module_configs').upsert(
        {
          user_id: user.id,
          sector_slug: sectorSlug,
          module_slug: mod.slug,
          config_key: 'resource_allocations',
          config_value: DEFAULT_ALLOCATIONS,
        },
        { onConflict: 'user_id,sector_slug,module_slug,config_key' }
      )
    }

    setLoading(false)
  }, [supabase, sectorSlug, mod.slug])

  useEffect(() => { fetchData() }, [fetchData])

  // Utilization per staff member
  const staffUtilization = useMemo(() => {
    return staff.map((s) => {
      const activeAllocs = allocations.filter((a) => a.staffId === s.id && isActiveAllocation(a))
      const allocatedHours = activeAllocs.reduce((sum, a) => sum + a.hoursPerWeek, 0)
      const utilization = s.hoursPerWeek > 0 ? (allocatedHours / s.hoursPerWeek) * 100 : 0
      const isOverallocated = allocatedHours > s.hoursPerWeek
      return { ...s, activeAllocs, allocatedHours, utilization, isOverallocated }
    })
  }, [staff, allocations])

  // Overlap warnings
  const overlapWarnings = useMemo(() => {
    return staffUtilization
      .filter((s) => s.isOverallocated)
      .map((s) => ({
        name: s.name,
        allocatedHours: s.allocatedHours,
        availableHours: s.hoursPerWeek,
        excess: s.allocatedHours - s.hoursPerWeek,
        projects: s.activeAllocs.map((a) => `${a.projectName} (${a.hoursPerWeek}h)`),
      }))
  }, [staffUtilization])

  // KPIs
  const kpis = useMemo(() => {
    const totalCapacity = staff.reduce((s, m) => s + m.hoursPerWeek, 0)
    const totalAllocated = staffUtilization.reduce((s, m) => s + m.allocatedHours, 0)
    const avgUtilization = totalCapacity > 0 ? (totalAllocated / totalCapacity) * 100 : 0
    const overallocatedCount = staffUtilization.filter((s) => s.isOverallocated).length
    const underUtilized = staffUtilization.filter((s) => s.utilization < 50).length
    return { totalCapacity, totalAllocated, avgUtilization, overallocatedCount, underUtilized }
  }, [staff, staffUtilization])

  // Project-centric view
  const projectView = useMemo(() => {
    const projMap: Record<string, { project: string; client: string; allocations: (Allocation & { staffName: string })[] }> = {}
    for (const a of allocations.filter(isActiveAllocation)) {
      if (!projMap[a.projectName]) {
        projMap[a.projectName] = { project: a.projectName, client: a.client, allocations: [] }
      }
      const member = staff.find((s) => s.id === a.staffId)
      projMap[a.projectName].allocations.push({ ...a, staffName: member?.name ?? 'Okand' })
    }
    return Object.values(projMap)
  }, [allocations, staff])

  function openNewStaff() {
    setEditingStaff(null)
    setStaffForm({ name: '', role: '', team: '', hoursPerWeek: 40 })
    setStaffDialogOpen(true)
  }

  function openEditStaff(s: StaffMember) {
    setEditingStaff(s)
    setStaffForm({ name: s.name, role: s.role, team: s.team, hoursPerWeek: s.hoursPerWeek })
    setStaffDialogOpen(true)
  }

  async function handleSaveStaff() {
    const item: StaffMember = {
      id: editingStaff?.id ?? crypto.randomUUID(),
      name: staffForm.name.trim(),
      role: staffForm.role.trim(),
      team: staffForm.team.trim(),
      hoursPerWeek: staffForm.hoursPerWeek,
    }
    let updated: StaffMember[]
    if (editingStaff) {
      updated = staff.map((s) => (s.id === editingStaff.id ? item : s))
    } else {
      updated = [...staff, item]
    }
    setStaff(updated)
    setStaffDialogOpen(false)
    await saveAll(updated, allocations)
  }

  function openNewAlloc() {
    setEditingAlloc(null)
    setAllocForm({ staffId: staff[0]?.id ?? '', projectName: '', client: '', hoursPerWeek: 0, startDate: new Date().toISOString().slice(0, 10), endDate: '' })
    setAllocDialogOpen(true)
  }

  function openEditAlloc(a: Allocation) {
    setEditingAlloc(a)
    setAllocForm({ staffId: a.staffId, projectName: a.projectName, client: a.client, hoursPerWeek: a.hoursPerWeek, startDate: a.startDate, endDate: a.endDate })
    setAllocDialogOpen(true)
  }

  async function handleSaveAlloc() {
    const item: Allocation = {
      id: editingAlloc?.id ?? crypto.randomUUID(),
      staffId: allocForm.staffId,
      projectName: allocForm.projectName.trim(),
      client: allocForm.client.trim(),
      hoursPerWeek: allocForm.hoursPerWeek,
      startDate: allocForm.startDate,
      endDate: allocForm.endDate,
    }
    let updated: Allocation[]
    if (editingAlloc) {
      updated = allocations.map((a) => (a.id === editingAlloc.id ? item : a))
    } else {
      updated = [...allocations, item]
    }
    setAllocations(updated)
    setAllocDialogOpen(false)
    await saveAll(staff, updated)
  }

  async function handleDelete() {
    if (!deleteTarget) return
    if (deleteTarget.type === 'staff') {
      const updatedStaff = staff.filter((s) => s.id !== deleteTarget.id)
      const updatedAllocs = allocations.filter((a) => a.staffId !== deleteTarget.id)
      setStaff(updatedStaff)
      setAllocations(updatedAllocs)
      await saveAll(updatedStaff, updatedAllocs)
    } else {
      const updatedAllocs = allocations.filter((a) => a.id !== deleteTarget.id)
      setAllocations(updatedAllocs)
      await saveAll(staff, updatedAllocs)
    }
    setDeleteDialogOpen(false)
    setDeleteTarget(null)
  }

  return (
    <>
      <ModuleWorkspaceShell
        title={mod.name}
        description={mod.desc}
        category="operativ"
        sectorName="Tech & IT"
        backHref={`/m/${sectorSlug}`}
        settingsHref={settingsHref}
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={openNewStaff}>
              <Plus className="mr-2 h-4 w-4" />
              Ny person
            </Button>
            <Button onClick={openNewAlloc}>
              <Plus className="mr-2 h-4 w-4" />
              Ny allokering
            </Button>
          </div>
        }
      >
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <Tabs defaultValue="oversikt" className="space-y-6">
            <TabsList>
              <TabsTrigger value="oversikt">Oversikt</TabsTrigger>
              <TabsTrigger value="personal">Per person</TabsTrigger>
              <TabsTrigger value="projekt">Per projekt</TabsTrigger>
              <TabsTrigger value="varningar">Varningar</TabsTrigger>
            </TabsList>

            <TabsContent value="oversikt" className="space-y-6">
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
                <KPICard label="Antal personal" value={String(staff.length)} unit="st" />
                <KPICard label="Total kapacitet" value={fmt(kpis.totalCapacity)} unit="tim/v" />
                <KPICard label="Allokerade" value={fmt(kpis.totalAllocated)} unit="tim/v" />
                <KPICard
                  label="Belaggningsgrad"
                  value={fmtPct(kpis.avgUtilization)}
                  unit="%"
                  trend={kpis.avgUtilization >= 70 && kpis.avgUtilization <= 95 ? 'up' : 'down'}
                />
                <KPICard
                  label="Overallokerade"
                  value={String(kpis.overallocatedCount)}
                  unit="st"
                  trend={kpis.overallocatedCount > 0 ? 'down' : 'up'}
                />
              </div>

              {/* Utilization bars */}
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {staffUtilization.map((s) => (
                  <Card key={s.id} className={s.isOverallocated ? 'border-red-300 dark:border-red-800' : ''}>
                    <CardContent className="p-4 space-y-2">
                      <div className="flex items-center justify-between">
                        <div>
                          <h4 className="text-sm font-medium">{s.name}</h4>
                          <p className="text-xs text-muted-foreground">{s.role}</p>
                        </div>
                        <Badge variant="outline" className="text-xs">{s.team}</Badge>
                      </div>
                      <div className="w-full bg-muted rounded-full h-2.5">
                        <div
                          className={cn(
                            'h-2.5 rounded-full transition-all',
                            s.isOverallocated ? 'bg-red-500' : s.utilization >= 80 ? 'bg-emerald-500' : s.utilization >= 50 ? 'bg-blue-500' : 'bg-amber-400'
                          )}
                          style={{ width: `${Math.min(100, s.utilization)}%` }}
                        />
                      </div>
                      <div className="flex items-center justify-between text-xs">
                        <span className={cn('font-medium', s.isOverallocated ? 'text-red-500' : '')}>
                          {fmtPct(s.utilization)}% belagd
                        </span>
                        <span className="text-muted-foreground">{s.allocatedHours}/{s.hoursPerWeek} tim</span>
                      </div>
                      {s.isOverallocated && (
                        <div className="flex items-center gap-1 text-xs text-red-500">
                          <AlertTriangle className="h-3 w-3" />
                          Overallokerad med {s.allocatedHours - s.hoursPerWeek} tim
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            </TabsContent>

            <TabsContent value="personal" className="space-y-4">
              {staff.length === 0 ? (
                <EmptyModuleState
                  icon={Users}
                  title="Ingen personal"
                  description="Lagg till personal for att borja med resursplanering."
                  actionLabel="Ny person"
                  onAction={openNewStaff}
                />
              ) : (
                <div className="rounded-xl border border-border overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/50">
                        <TableHead className="font-medium">Namn</TableHead>
                        <TableHead className="font-medium">Roll</TableHead>
                        <TableHead className="font-medium">Team</TableHead>
                        <TableHead className="font-medium text-right">Kapacitet</TableHead>
                        <TableHead className="font-medium text-right">Allokerat</TableHead>
                        <TableHead className="font-medium text-right">Belaggning</TableHead>
                        <TableHead className="font-medium text-right">Atgarder</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {staffUtilization.map((s) => (
                        <TableRow key={s.id} className={s.isOverallocated ? 'bg-red-50/50 dark:bg-red-900/10' : ''}>
                          <TableCell className="font-medium">{s.name}</TableCell>
                          <TableCell>{s.role}</TableCell>
                          <TableCell><Badge variant="outline">{s.team}</Badge></TableCell>
                          <TableCell className="text-right tabular-nums">{s.hoursPerWeek}h</TableCell>
                          <TableCell className="text-right tabular-nums">{s.allocatedHours}h</TableCell>
                          <TableCell className="text-right tabular-nums">
                            <span className={cn('font-medium', s.isOverallocated ? 'text-red-500' : s.utilization >= 80 ? 'text-emerald-600' : '')}>
                              {fmtPct(s.utilization)}%
                            </span>
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-1">
                              <Button variant="ghost" size="icon" onClick={() => openEditStaff(s)} title="Redigera"><Pencil className="h-4 w-4" /></Button>
                              <Button variant="ghost" size="icon" className="text-red-600 hover:text-red-700" onClick={() => { setDeleteTarget({ type: 'staff', id: s.id }); setDeleteDialogOpen(true) }} title="Ta bort"><Trash2 className="h-4 w-4" /></Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
              {saving && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Sparar...</div>
              )}
            </TabsContent>

            <TabsContent value="projekt" className="space-y-6">
              {projectView.length === 0 ? (
                <EmptyModuleState
                  icon={Users}
                  title="Inga aktiva allokeringar"
                  description="Skapa allokeringar for att se resursfordelning per projekt."
                  actionLabel="Ny allokering"
                  onAction={openNewAlloc}
                />
              ) : (
                projectView.map((pv) => (
                  <Card key={pv.project}>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm flex items-center justify-between">
                        <span>{pv.project}</span>
                        <Badge variant="outline">{pv.client}</Badge>
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="rounded-xl border border-border overflow-hidden">
                        <Table>
                          <TableHeader>
                            <TableRow className="bg-muted/50">
                              <TableHead className="font-medium">Person</TableHead>
                              <TableHead className="font-medium text-right">Tim/vecka</TableHead>
                              <TableHead className="font-medium">Period</TableHead>
                              <TableHead className="font-medium text-right">Atgarder</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {pv.allocations.map((a) => (
                              <TableRow key={a.id}>
                                <TableCell className="font-medium">{a.staffName}</TableCell>
                                <TableCell className="text-right tabular-nums">{a.hoursPerWeek}h</TableCell>
                                <TableCell className="text-sm">{a.startDate} - {a.endDate}</TableCell>
                                <TableCell className="text-right">
                                  <div className="flex items-center justify-end gap-1">
                                    <Button variant="ghost" size="icon" onClick={() => openEditAlloc(a)} title="Redigera"><Pencil className="h-4 w-4" /></Button>
                                    <Button variant="ghost" size="icon" className="text-red-600 hover:text-red-700" onClick={() => { setDeleteTarget({ type: 'alloc', id: a.id }); setDeleteDialogOpen(true) }} title="Ta bort"><Trash2 className="h-4 w-4" /></Button>
                                  </div>
                                </TableCell>
                              </TableRow>
                            ))}
                            <TableRow className="bg-muted/30">
                              <TableCell className="font-semibold">Totalt</TableCell>
                              <TableCell className="text-right tabular-nums font-semibold">{pv.allocations.reduce((s, a) => s + a.hoursPerWeek, 0)}h</TableCell>
                              <TableCell colSpan={2} />
                            </TableRow>
                          </TableBody>
                        </Table>
                      </div>
                    </CardContent>
                  </Card>
                ))
              )}
            </TabsContent>

            <TabsContent value="varningar" className="space-y-6">
              {overlapWarnings.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center space-y-4">
                  <div className="p-3 rounded-full bg-emerald-100 dark:bg-emerald-900/30">
                    <Users className="h-8 w-8 text-emerald-600" />
                  </div>
                  <h3 className="text-lg font-medium">Inga varningar</h3>
                  <p className="text-sm text-muted-foreground">Alla medarbetare ar korrekt allokerade.</p>
                </div>
              ) : (
                overlapWarnings.map((w) => (
                  <Card key={w.name} className="border-red-300 dark:border-red-800">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm flex items-center gap-2 text-red-600">
                        <AlertTriangle className="h-4 w-4" />
                        {w.name} - overallokerad med {w.excess} timmar/vecka
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="text-sm space-y-2">
                      <p className="text-muted-foreground">
                        Kapacitet: {w.availableHours}h/vecka, Allokerat: {w.allocatedHours}h/vecka
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {w.projects.map((p, i) => (
                          <Badge key={i} variant="outline">{p}</Badge>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                ))
              )}
            </TabsContent>
          </Tabs>
        )}
      </ModuleWorkspaceShell>

      {/* Add/Edit Staff Dialog */}
      <Dialog open={staffDialogOpen} onOpenChange={setStaffDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingStaff ? 'Redigera person' : 'Ny person'}</DialogTitle>
            <DialogDescription>{editingStaff ? 'Uppdatera personaluppgifter.' : 'Lagg till en ny medarbetare.'}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2"><Label>Namn *</Label><Input value={staffForm.name} onChange={(e) => setStaffForm((f) => ({ ...f, name: e.target.value }))} placeholder="Anna Svensson" /></div>
              <div className="grid gap-2"><Label>Roll *</Label><Input value={staffForm.role} onChange={(e) => setStaffForm((f) => ({ ...f, role: e.target.value }))} placeholder="Frontend-utvecklare" /></div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2"><Label>Team</Label><Input value={staffForm.team} onChange={(e) => setStaffForm((f) => ({ ...f, team: e.target.value }))} placeholder="Frontend" /></div>
              <div className="grid gap-2"><Label>Timmar/vecka</Label><Input type="number" min={0} value={staffForm.hoursPerWeek} onChange={(e) => setStaffForm((f) => ({ ...f, hoursPerWeek: Number(e.target.value) }))} /></div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setStaffDialogOpen(false)}>Avbryt</Button>
            <Button onClick={handleSaveStaff} disabled={!staffForm.name.trim() || !staffForm.role.trim()}>{editingStaff ? 'Uppdatera' : 'Lagg till'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add/Edit Allocation Dialog */}
      <Dialog open={allocDialogOpen} onOpenChange={setAllocDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingAlloc ? 'Redigera allokering' : 'Ny allokering'}</DialogTitle>
            <DialogDescription>{editingAlloc ? 'Uppdatera allokeringen.' : 'Tilldela en person till ett projekt.'}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-2">
              <Label>Person *</Label>
              <Select value={allocForm.staffId} onValueChange={(v) => setAllocForm((f) => ({ ...f, staffId: v }))}>
                <SelectTrigger><SelectValue placeholder="Valj person" /></SelectTrigger>
                <SelectContent>
                  {staff.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2"><Label>Projekt *</Label><Input value={allocForm.projectName} onChange={(e) => setAllocForm((f) => ({ ...f, projectName: e.target.value }))} placeholder="Webbplattform v2" /></div>
              <div className="grid gap-2"><Label>Kund</Label><Input value={allocForm.client} onChange={(e) => setAllocForm((f) => ({ ...f, client: e.target.value }))} placeholder="Acme AB" /></div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="grid gap-2"><Label>Tim/vecka *</Label><Input type="number" min={0} value={allocForm.hoursPerWeek} onChange={(e) => setAllocForm((f) => ({ ...f, hoursPerWeek: Number(e.target.value) }))} /></div>
              <div className="grid gap-2"><Label>Startdatum</Label><Input type="date" value={allocForm.startDate} onChange={(e) => setAllocForm((f) => ({ ...f, startDate: e.target.value }))} /></div>
              <div className="grid gap-2"><Label>Slutdatum</Label><Input type="date" value={allocForm.endDate} onChange={(e) => setAllocForm((f) => ({ ...f, endDate: e.target.value }))} /></div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAllocDialogOpen(false)}>Avbryt</Button>
            <Button onClick={handleSaveAlloc} disabled={!allocForm.staffId || !allocForm.projectName.trim()}>{editingAlloc ? 'Uppdatera' : 'Lagg till'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Ta bort</DialogTitle>
            <DialogDescription>Ar du saker pa att du vill ta bort detta? Denna atgard kan inte angras.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>Avbryt</Button>
            <Button variant="destructive" onClick={handleDelete}><Trash2 className="mr-2 h-4 w-4" /> Ta bort</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
