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
import { Plus, Pencil, Trash2, Loader2, Receipt, Calculator } from 'lucide-react'

interface ModuleWorkspaceProps {
  module: { slug: string; name: string; cat: string; desc: string; longDesc: string }
  sectorSlug: string
  settingsHref: string
}

type ScheduleType = 'Heltid' | 'Deltid 75%' | 'Deltid 50%' | 'Deltid 25%'

interface ChildEntry {
  id: string
  childName: string
  guardianName: string
  householdIncome: number
  siblingOrder: number
  scheduleType: ScheduleType
  monthlyFee: number
}

const SCHEDULE_TYPES: ScheduleType[] = ['Heltid', 'Deltid 75%', 'Deltid 50%', 'Deltid 25%']
const SCHEDULE_FACTOR: Record<ScheduleType, number> = {
  'Heltid': 1.0,
  'Deltid 75%': 0.75,
  'Deltid 50%': 0.5,
  'Deltid 25%': 0.25,
}

const MAXTAXA_CEILING = 56250
const SIBLING_RATES = [0.03, 0.02, 0.01]

function calcMaxtaxa(income: number, siblingOrder: number, schedule: ScheduleType): number {
  const cappedIncome = Math.min(income, MAXTAXA_CEILING)
  const rate = SIBLING_RATES[Math.min(siblingOrder - 1, 2)] ?? 0.01
  const baseFee = cappedIncome * rate
  const scheduleFactor = SCHEDULE_FACTOR[schedule]
  return Math.round(baseFee * scheduleFactor)
}

function fmt(n: number): string {
  return new Intl.NumberFormat('sv-SE', { maximumFractionDigits: 0 }).format(n)
}

const EMPTY_FORM = {
  childName: '',
  guardianName: '',
  householdIncome: 0,
  siblingOrder: 1,
  scheduleType: 'Heltid' as ScheduleType,
}

export function MaxtaxaFaktureringWorkspace({ module: mod, sectorSlug, settingsHref }: ModuleWorkspaceProps) {
  const supabase = createClient()

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [children, setChildren] = useState<ChildEntry[]>([])
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingChild, setEditingChild] = useState<ChildEntry | null>(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [childToDelete, setChildToDelete] = useState<ChildEntry | null>(null)

  const saveChildren = useCallback(async (items: ChildEntry[]) => {
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setSaving(false); return }

    await supabase.from('module_configs').upsert(
      {
        user_id: user.id,
        sector_slug: sectorSlug,
        module_slug: mod.slug,
        config_key: 'children',
        config_value: items,
      },
      { onConflict: 'user_id,sector_slug,module_slug,config_key' }
    )
    setSaving(false)
  }, [supabase, sectorSlug, mod.slug])

  const fetchChildren = useCallback(async () => {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); return }

    const { data } = await supabase
      .from('module_configs')
      .select('config_value')
      .eq('user_id', user.id)
      .eq('sector_slug', sectorSlug)
      .eq('module_slug', mod.slug)
      .eq('config_key', 'children')
      .maybeSingle()

    if (data?.config_value && Array.isArray(data.config_value)) {
      setChildren(data.config_value as ChildEntry[])
    }
    setLoading(false)
  }, [supabase, sectorSlug, mod.slug])

  useEffect(() => { fetchChildren() }, [fetchChildren])

  const totalMonthlyFees = useMemo(() => children.reduce((s, c) => s + c.monthlyFee, 0), [children])
  const avgFee = useMemo(() => children.length > 0 ? totalMonthlyFees / children.length : 0, [children, totalMonthlyFees])
  const siblingDiscountCount = useMemo(() => children.filter(c => c.siblingOrder > 1).length, [children])

  function openNew() {
    setEditingChild(null)
    setForm({ ...EMPTY_FORM })
    setDialogOpen(true)
  }

  function openEdit(child: ChildEntry) {
    setEditingChild(child)
    setForm({
      childName: child.childName,
      guardianName: child.guardianName,
      householdIncome: child.householdIncome,
      siblingOrder: child.siblingOrder,
      scheduleType: child.scheduleType,
    })
    setDialogOpen(true)
  }

  async function handleSave() {
    const fee = calcMaxtaxa(form.householdIncome, form.siblingOrder, form.scheduleType)
    const entry: ChildEntry = {
      id: editingChild?.id ?? crypto.randomUUID(),
      childName: form.childName.trim(),
      guardianName: form.guardianName.trim(),
      householdIncome: form.householdIncome,
      siblingOrder: form.siblingOrder,
      scheduleType: form.scheduleType,
      monthlyFee: fee,
    }

    let updated: ChildEntry[]
    if (editingChild) {
      updated = children.map((c) => c.id === editingChild.id ? entry : c)
    } else {
      updated = [...children, entry]
    }

    setChildren(updated)
    setDialogOpen(false)
    await saveChildren(updated)
  }

  async function handleDelete() {
    if (!childToDelete) return
    const updated = children.filter((c) => c.id !== childToDelete.id)
    setChildren(updated)
    setDeleteDialogOpen(false)
    setChildToDelete(null)
    await saveChildren(updated)
  }

  return (
    <>
      <ModuleWorkspaceShell
        title={mod.name}
        description={mod.desc}
        category="bokforing"
        sectorName="Utbildning & Förskola"
        backHref={`/m/${sectorSlug}`}
        settingsHref={settingsHref}
        actions={
          <Button onClick={openNew}>
            <Plus className="mr-2 h-4 w-4" />
            Nytt barn
          </Button>
        }
      >
        <Tabs defaultValue="berakning" className="space-y-6">
          <TabsList>
            <TabsTrigger value="berakning">Avgiftsberäkning</TabsTrigger>
            <TabsTrigger value="regler">Regler</TabsTrigger>
          </TabsList>

          <TabsContent value="berakning" className="space-y-6">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  <KPICard label="Antal barn" value={children.length} />
                  <KPICard label="Total månadsavgift" value={fmt(totalMonthlyFees)} unit="kr" />
                  <KPICard label="Genomsnittlig avgift" value={fmt(avgFee)} unit="kr" />
                  <KPICard label="Syskonrabatt" value={siblingDiscountCount} unit="barn" />
                </div>

                {children.length === 0 ? (
                  <EmptyModuleState
                    icon={Calculator}
                    title="Inga barn registrerade"
                    description="Lägg till barn för att beräkna maxtaxa-avgifter med inkomstkontroll och syskonrabatt."
                    actionLabel="Nytt barn"
                    onAction={openNew}
                  />
                ) : (
                  <div className="rounded-xl border border-border overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-muted/50">
                          <TableHead className="font-medium">Barn</TableHead>
                          <TableHead className="font-medium">Vårdnadshavare</TableHead>
                          <TableHead className="font-medium text-right">Hushållsinkomst</TableHead>
                          <TableHead className="font-medium">Syskon nr</TableHead>
                          <TableHead className="font-medium">Schema</TableHead>
                          <TableHead className="font-medium text-right">Månadsavgift</TableHead>
                          <TableHead className="font-medium text-right">Åtgärder</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {children.map((child) => (
                          <TableRow key={child.id}>
                            <TableCell className="font-medium">{child.childName}</TableCell>
                            <TableCell>{child.guardianName}</TableCell>
                            <TableCell className="text-right tabular-nums">{fmt(child.householdIncome)} kr</TableCell>
                            <TableCell>
                              <Badge variant={child.siblingOrder > 1 ? 'secondary' : 'outline'}>
                                {child.siblingOrder === 1 ? 'Barn 1' : `Syskon ${child.siblingOrder}`}
                              </Badge>
                            </TableCell>
                            <TableCell>{child.scheduleType}</TableCell>
                            <TableCell className="text-right tabular-nums font-medium">{fmt(child.monthlyFee)} kr</TableCell>
                            <TableCell className="text-right">
                              <div className="flex items-center justify-end gap-1">
                                <Button variant="ghost" size="icon" onClick={() => openEdit(child)}><Pencil className="h-4 w-4" /></Button>
                                <Button variant="ghost" size="icon" className="text-red-600 hover:text-red-700" onClick={() => { setChildToDelete(child); setDeleteDialogOpen(true) }}><Trash2 className="h-4 w-4" /></Button>
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
              </>
            )}
          </TabsContent>

          <TabsContent value="regler" className="space-y-4">
            <div className="rounded-xl border border-border bg-card p-6 max-w-lg space-y-3">
              <h3 className="text-sm font-semibold">Maxtaxa-regler</h3>
              <ul className="text-sm text-muted-foreground space-y-2 list-disc pl-4">
                <li>Inkomsttak: <strong>{fmt(MAXTAXA_CEILING)} kr/mån</strong></li>
                <li>Barn 1: 3% av hushållsinkomst (max {fmt(MAXTAXA_CEILING * 0.03)} kr)</li>
                <li>Barn 2 (syskon): 2% av hushållsinkomst (max {fmt(MAXTAXA_CEILING * 0.02)} kr)</li>
                <li>Barn 3+ (syskon): 1% av hushållsinkomst (max {fmt(MAXTAXA_CEILING * 0.01)} kr)</li>
                <li>Avgiften reduceras vid deltidsschema (75%, 50%, 25%)</li>
              </ul>
            </div>
          </TabsContent>
        </Tabs>
      </ModuleWorkspaceShell>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingChild ? 'Redigera barn' : 'Nytt barn'}</DialogTitle>
            <DialogDescription>{editingChild ? 'Uppdatera barnets uppgifter nedan.' : 'Fyll i uppgifterna för att beräkna avgift.'}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Barnets namn *</Label>
                <Input value={form.childName} onChange={(e) => setForm(f => ({ ...f, childName: e.target.value }))} placeholder="Anna Svensson" />
              </div>
              <div className="grid gap-2">
                <Label>Vårdnadshavare *</Label>
                <Input value={form.guardianName} onChange={(e) => setForm(f => ({ ...f, guardianName: e.target.value }))} placeholder="Erik Svensson" />
              </div>
            </div>
            <div className="grid gap-2">
              <Label>Hushållets bruttoinkomst (kr/mån) *</Label>
              <Input type="number" value={form.householdIncome || ''} onChange={(e) => setForm(f => ({ ...f, householdIncome: parseFloat(e.target.value) || 0 }))} placeholder="45000" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Syskonordning *</Label>
                <Select value={String(form.siblingOrder)} onValueChange={(v) => setForm(f => ({ ...f, siblingOrder: parseInt(v) }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">Barn 1 (3%)</SelectItem>
                    <SelectItem value="2">Syskon 2 (2%)</SelectItem>
                    <SelectItem value="3">Syskon 3+ (1%)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label>Schema *</Label>
                <Select value={form.scheduleType} onValueChange={(v) => setForm(f => ({ ...f, scheduleType: v as ScheduleType }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {SCHEDULE_TYPES.map(s => (<SelectItem key={s} value={s}>{s}</SelectItem>))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="rounded-lg border border-border bg-muted/30 p-3">
              <p className="text-xs text-muted-foreground">Beräknad avgift:</p>
              <p className="text-lg font-semibold">{fmt(calcMaxtaxa(form.householdIncome, form.siblingOrder, form.scheduleType))} kr/mån</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Avbryt</Button>
            <Button onClick={handleSave} disabled={!form.childName.trim() || !form.guardianName.trim()}>
              {editingChild ? 'Uppdatera' : 'Lägg till'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Ta bort barn</DialogTitle>
            <DialogDescription>
              Är du säker på att du vill ta bort {childToDelete?.childName}? Denna åtgärd kan inte ångras.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>Avbryt</Button>
            <Button variant="destructive" onClick={handleDelete}><Trash2 className="mr-2 h-4 w-4" />Ta bort</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
