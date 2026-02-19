'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { ModuleWorkspaceShell } from '@/components/modules/ModuleWorkspaceShell'
import { EmptyModuleState } from '@/components/modules/shared/EmptyModuleState'
import { KPICard } from '@/components/modules/shared/KPICard'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
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
import {
  Plus,
  Pencil,
  Trash2,
  Loader2,
  FlaskConical,
  Calculator,
} from 'lucide-react'

interface ModuleWorkspaceProps {
  module: { slug: string; name: string; cat: string; desc: string; longDesc: string }
  sectorSlug: string
  settingsHref: string
}

interface Employee {
  id: string
  name: string
  monthlySalary: number
  totalHoursPerMonth: number
  rndHoursPerMonth: number
}

// Swedish employer contribution rate
const EMPLOYER_CONTRIBUTION_RATE = 0.3142
// R&D reduction rate (reduced employer contributions for R&D staff)
const RND_REDUCTION_RATE = 0.10

const DEFAULT_EMPLOYEES: Employee[] = [
  { id: '1', name: 'Anna Svensson', monthlySalary: 55000, totalHoursPerMonth: 168, rndHoursPerMonth: 120 },
  { id: '2', name: 'Erik Lindberg', monthlySalary: 52000, totalHoursPerMonth: 168, rndHoursPerMonth: 100 },
  { id: '3', name: 'Maria Karlsson', monthlySalary: 48000, totalHoursPerMonth: 168, rndHoursPerMonth: 168 },
]

function fmt(n: number): string {
  return new Intl.NumberFormat('sv-SE', { maximumFractionDigits: 0 }).format(n)
}

function fmtPct(n: number): string {
  return isFinite(n) ? n.toFixed(1) : '0.0'
}

const EMPTY_FORM = {
  name: '',
  monthlySalary: 0,
  totalHoursPerMonth: 168,
  rndHoursPerMonth: 0,
}

export function FouAvdragWorkspace({ module: mod, sectorSlug, settingsHref }: ModuleWorkspaceProps) {
  const supabase = createClient()

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [employees, setEmployees] = useState<Employee[]>([])

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<Employee | null>(null)
  const [form, setForm] = useState(EMPTY_FORM)

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [toDelete, setToDelete] = useState<Employee | null>(null)

  const saveData = useCallback(async (data: Employee[]) => {
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setSaving(false); return }

    await supabase.from('module_configs').upsert(
      {
        user_id: user.id,
        sector_slug: sectorSlug,
        module_slug: mod.slug,
        config_key: 'employees',
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
      .eq('config_key', 'employees')
      .maybeSingle()

    if (data?.config_value && Array.isArray(data.config_value) && data.config_value.length > 0) {
      setEmployees(data.config_value as Employee[])
    } else {
      setEmployees(DEFAULT_EMPLOYEES)
      await supabase.from('module_configs').upsert(
        {
          user_id: user.id,
          sector_slug: sectorSlug,
          module_slug: mod.slug,
          config_key: 'employees',
          config_value: DEFAULT_EMPLOYEES,
        },
        { onConflict: 'user_id,sector_slug,module_slug,config_key' }
      )
    }
    setLoading(false)
  }, [supabase, sectorSlug, mod.slug])

  useEffect(() => { fetchData() }, [fetchData])

  // Calculation per employee
  const calculations = useMemo(() => {
    return employees.map((e) => {
      const rndShare = e.totalHoursPerMonth > 0 ? e.rndHoursPerMonth / e.totalHoursPerMonth : 0
      const rndSalary = e.monthlySalary * rndShare
      const normalContribution = rndSalary * EMPLOYER_CONTRIBUTION_RATE
      const reduction = rndSalary * RND_REDUCTION_RATE
      const monthlyReduction = reduction
      const yearlyReduction = monthlyReduction * 12
      return {
        ...e,
        rndShare,
        rndSalary,
        normalContribution,
        monthlyReduction,
        yearlyReduction,
      }
    })
  }, [employees])

  const totals = useMemo(() => {
    const totalMonthlySalary = calculations.reduce((s, c) => s + c.rndSalary, 0)
    const totalMonthlyReduction = calculations.reduce((s, c) => s + c.monthlyReduction, 0)
    const totalYearlyReduction = calculations.reduce((s, c) => s + c.yearlyReduction, 0)
    const totalRndHours = employees.reduce((s, e) => s + e.rndHoursPerMonth, 0)
    const totalHours = employees.reduce((s, e) => s + e.totalHoursPerMonth, 0)
    const avgRndShare = totalHours > 0 ? (totalRndHours / totalHours) * 100 : 0
    return { totalMonthlySalary, totalMonthlyReduction, totalYearlyReduction, avgRndShare }
  }, [calculations, employees])

  function openNew() {
    setEditing(null)
    setForm({ ...EMPTY_FORM })
    setDialogOpen(true)
  }

  function openEdit(emp: Employee) {
    setEditing(emp)
    setForm({
      name: emp.name,
      monthlySalary: emp.monthlySalary,
      totalHoursPerMonth: emp.totalHoursPerMonth,
      rndHoursPerMonth: emp.rndHoursPerMonth,
    })
    setDialogOpen(true)
  }

  async function handleSave() {
    const emp: Employee = {
      id: editing?.id ?? crypto.randomUUID(),
      name: form.name.trim(),
      monthlySalary: form.monthlySalary,
      totalHoursPerMonth: form.totalHoursPerMonth,
      rndHoursPerMonth: form.rndHoursPerMonth,
    }

    let updated: Employee[]
    if (editing) {
      updated = employees.map((e) => (e.id === editing.id ? emp : e))
    } else {
      updated = [...employees, emp]
    }

    setEmployees(updated)
    setDialogOpen(false)
    await saveData(updated)
  }

  async function handleDelete() {
    if (!toDelete) return
    const updated = employees.filter((e) => e.id !== toDelete.id)
    setEmployees(updated)
    setDeleteDialogOpen(false)
    setToDelete(null)
    await saveData(updated)
  }

  return (
    <>
      <ModuleWorkspaceShell
        title={mod.name}
        description={mod.desc}
        category="bokforing"
        sectorName="Tech & IT"
        backHref={`/m/${sectorSlug}`}
        settingsHref={settingsHref}
        actions={
          <Button onClick={openNew}>
            <Plus className="mr-2 h-4 w-4" />
            Lägg till anställd
          </Button>
        }
      >
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-6">
            {/* KPI summary */}
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <KPICard label="Antal anställda i FoU" value={String(employees.length)} unit="st" />
              <KPICard label="Genomsnittlig FoU-andel" value={fmtPct(totals.avgRndShare)} unit="%" />
              <KPICard label="Månadsavdrag" value={fmt(totals.totalMonthlyReduction)} unit="kr" />
              <KPICard label="Årsavdrag (beräknat)" value={fmt(totals.totalYearlyReduction)} unit="kr" />
            </div>

            {/* Info card */}
            <Card>
              <CardHeader>
                <CardTitle className="text-sm flex items-center gap-2">
                  <Calculator className="h-4 w-4" />
                  Beräkningsmodell
                </CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground space-y-2">
                <p>FoU-avdraget ger en reduktion av arbetsgivaravgifterna för anställda som arbetar med forskning och utveckling.</p>
                <p>Aktuell reduktionssats: <span className="font-semibold text-foreground">{(RND_REDUCTION_RATE * 100).toFixed(0)}%</span> av FoU-lönekostnaden.</p>
                <p>Normala arbetsgivaravgifter: <span className="font-semibold text-foreground">{(EMPLOYER_CONTRIBUTION_RATE * 100).toFixed(2)}%</span>.</p>
              </CardContent>
            </Card>

            <Separator />

            {/* Employee list */}
            {employees.length === 0 ? (
              <EmptyModuleState
                icon={FlaskConical}
                title="Inga anställda registrerade"
                description="Lägg till anställda som arbetar med FoU för att beräkna avdrag."
                actionLabel="Lägg till anställd"
                onAction={openNew}
              />
            ) : (
              <div className="rounded-xl border border-border overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead className="font-medium">Namn</TableHead>
                      <TableHead className="font-medium text-right">Månadslön</TableHead>
                      <TableHead className="font-medium text-right">Tot timmar</TableHead>
                      <TableHead className="font-medium text-right">FoU timmar</TableHead>
                      <TableHead className="font-medium text-right">FoU-andel</TableHead>
                      <TableHead className="font-medium text-right">FoU-lön</TableHead>
                      <TableHead className="font-medium text-right">Månadsavdrag</TableHead>
                      <TableHead className="font-medium text-right">Årsavdrag</TableHead>
                      <TableHead className="font-medium text-right">Åtgärder</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {calculations.map((c) => (
                      <TableRow key={c.id}>
                        <TableCell className="font-medium">{c.name}</TableCell>
                        <TableCell className="text-right tabular-nums">{fmt(c.monthlySalary)}</TableCell>
                        <TableCell className="text-right tabular-nums">{c.totalHoursPerMonth}</TableCell>
                        <TableCell className="text-right tabular-nums">{c.rndHoursPerMonth}</TableCell>
                        <TableCell className="text-right tabular-nums">{fmtPct(c.rndShare * 100)}%</TableCell>
                        <TableCell className="text-right tabular-nums">{fmt(c.rndSalary)}</TableCell>
                        <TableCell className="text-right tabular-nums">{fmt(c.monthlyReduction)}</TableCell>
                        <TableCell className="text-right tabular-nums font-medium">{fmt(c.yearlyReduction)}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button variant="ghost" size="icon" onClick={() => openEdit(c)} title="Redigera">
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="icon" className="text-red-600 hover:text-red-700" onClick={() => { setToDelete(c); setDeleteDialogOpen(true) }} title="Ta bort">
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                    <TableRow className="bg-muted/30 font-semibold">
                      <TableCell>Totalt</TableCell>
                      <TableCell className="text-right tabular-nums">{fmt(employees.reduce((s, e) => s + e.monthlySalary, 0))}</TableCell>
                      <TableCell className="text-right tabular-nums">{employees.reduce((s, e) => s + e.totalHoursPerMonth, 0)}</TableCell>
                      <TableCell className="text-right tabular-nums">{employees.reduce((s, e) => s + e.rndHoursPerMonth, 0)}</TableCell>
                      <TableCell className="text-right tabular-nums">{fmtPct(totals.avgRndShare)}%</TableCell>
                      <TableCell className="text-right tabular-nums">{fmt(totals.totalMonthlySalary)}</TableCell>
                      <TableCell className="text-right tabular-nums">{fmt(totals.totalMonthlyReduction)}</TableCell>
                      <TableCell className="text-right tabular-nums">{fmt(totals.totalYearlyReduction)}</TableCell>
                      <TableCell />
                    </TableRow>
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
          </div>
        )}
      </ModuleWorkspaceShell>

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? 'Redigera anställd' : 'Ny anställd'}</DialogTitle>
            <DialogDescription>
              {editing ? 'Uppdatera uppgifterna nedan.' : 'Fyll i uppgifterna för den anställda.'}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-2">
              <Label>Namn *</Label>
              <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="Anna Svensson" />
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="grid gap-2">
                <Label>Månadslön (kr)</Label>
                <Input type="number" min={0} value={form.monthlySalary} onChange={(e) => setForm((f) => ({ ...f, monthlySalary: Number(e.target.value) }))} />
              </div>
              <div className="grid gap-2">
                <Label>Tot timmar/mån</Label>
                <Input type="number" min={0} value={form.totalHoursPerMonth} onChange={(e) => setForm((f) => ({ ...f, totalHoursPerMonth: Number(e.target.value) }))} />
              </div>
              <div className="grid gap-2">
                <Label>FoU timmar/mån</Label>
                <Input type="number" min={0} value={form.rndHoursPerMonth} onChange={(e) => setForm((f) => ({ ...f, rndHoursPerMonth: Number(e.target.value) }))} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Avbryt</Button>
            <Button onClick={handleSave} disabled={!form.name.trim()}>
              {editing ? 'Uppdatera' : 'Lägg till'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Ta bort anställd</DialogTitle>
            <DialogDescription>
              Är du säker på att du vill ta bort {toDelete?.name}? Denna åtgärd kan inte ångras.
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
