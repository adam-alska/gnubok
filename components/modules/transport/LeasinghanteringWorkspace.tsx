'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { ModuleWorkspaceShell } from '@/components/modules/ModuleWorkspaceShell'
import { EmptyModuleState } from '@/components/modules/shared/EmptyModuleState'
import { KPICard } from '@/components/modules/shared/KPICard'
import { StatusBadge } from '@/components/modules/shared/StatusBadge'
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
  FileText,
} from 'lucide-react'

interface ModuleWorkspaceProps {
  module: { slug: string; name: string; cat: string; desc: string; longDesc: string }
  sectorSlug: string
  settingsHref: string
}

type LeasingType = 'operationell' | 'finansiell'

interface LeasingContract {
  id: string
  vehicle_name: string
  reg_number: string
  leasing_type: LeasingType
  monthly_cost: number
  start_date: string
  end_date: string
  total_contract_value: number
  residual_value: number
  lessor: string
  account: string
  notes: string
}

const LEASING_TYPE_LABELS: Record<LeasingType, string> = {
  operationell: 'Operationell',
  finansiell: 'Finansiell',
}

const EMPTY_FORM = {
  vehicle_name: '',
  reg_number: '',
  leasing_type: 'operationell' as LeasingType,
  monthly_cost: 0,
  start_date: '',
  end_date: '',
  total_contract_value: 0,
  residual_value: 0,
  lessor: '',
  account: '5620',
  notes: '',
}

function fmt(n: number): string {
  return new Intl.NumberFormat('sv-SE', { maximumFractionDigits: 0 }).format(n)
}

function monthsBetween(start: string, end: string): number {
  const s = new Date(start)
  const e = new Date(end)
  return (e.getFullYear() - s.getFullYear()) * 12 + (e.getMonth() - s.getMonth())
}

function contractStatus(contract: LeasingContract): { label: string; variant: 'success' | 'warning' | 'danger' | 'info' | 'neutral' } {
  const now = new Date()
  const end = new Date(contract.end_date)
  const start = new Date(contract.start_date)
  if (now < start) return { label: 'Ej startad', variant: 'neutral' }
  if (now > end) return { label: 'Avslutad', variant: 'danger' }
  const daysLeft = Math.ceil((end.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
  if (daysLeft <= 90) return { label: `${daysLeft} dagar kvar`, variant: 'warning' }
  return { label: 'Aktiv', variant: 'success' }
}

export function LeasinghanteringWorkspace({ module: mod, sectorSlug, settingsHref }: ModuleWorkspaceProps) {
  const supabase = createClient()

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [contracts, setContracts] = useState<LeasingContract[]>([])

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingContract, setEditingContract] = useState<LeasingContract | null>(null)
  const [form, setForm] = useState(EMPTY_FORM)

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [contractToDelete, setContractToDelete] = useState<LeasingContract | null>(null)

  const saveContracts = useCallback(async (items: LeasingContract[]) => {
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setSaving(false); return }

    await supabase.from('module_configs').upsert(
      {
        user_id: user.id,
        sector_slug: sectorSlug,
        module_slug: mod.slug,
        config_key: 'contracts',
        config_value: items,
      },
      { onConflict: 'user_id,sector_slug,module_slug,config_key' }
    )
    setSaving(false)
  }, [supabase, sectorSlug, mod.slug])

  const fetchContracts = useCallback(async () => {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); return }

    const { data } = await supabase
      .from('module_configs')
      .select('config_value')
      .eq('user_id', user.id)
      .eq('sector_slug', sectorSlug)
      .eq('module_slug', mod.slug)
      .eq('config_key', 'contracts')
      .maybeSingle()

    if (data?.config_value && Array.isArray(data.config_value)) {
      setContracts(data.config_value as LeasingContract[])
    }
    setLoading(false)
  }, [supabase, sectorSlug, mod.slug])

  useEffect(() => { fetchContracts() }, [fetchContracts])

  const totals = useMemo(() => {
    const now = new Date()
    const active = contracts.filter((c) => {
      const start = new Date(c.start_date)
      const end = new Date(c.end_date)
      return now >= start && now <= end
    })
    const totalMonthly = active.reduce((s, c) => s + c.monthly_cost, 0)
    const totalContractValue = contracts.reduce((s, c) => s + c.total_contract_value, 0)
    const operationella = contracts.filter((c) => c.leasing_type === 'operationell').length
    const finansiella = contracts.filter((c) => c.leasing_type === 'finansiell').length
    return { totalMonthly, totalContractValue, activeCount: active.length, operationella, finansiella }
  }, [contracts])

  function openNew() {
    setEditingContract(null)
    setForm({ ...EMPTY_FORM })
    setDialogOpen(true)
  }

  function openEdit(contract: LeasingContract) {
    setEditingContract(contract)
    setForm({
      vehicle_name: contract.vehicle_name,
      reg_number: contract.reg_number,
      leasing_type: contract.leasing_type,
      monthly_cost: contract.monthly_cost,
      start_date: contract.start_date,
      end_date: contract.end_date,
      total_contract_value: contract.total_contract_value,
      residual_value: contract.residual_value,
      lessor: contract.lessor,
      account: contract.account,
      notes: contract.notes,
    })
    setDialogOpen(true)
  }

  async function handleSave() {
    const item: LeasingContract = {
      id: editingContract?.id || crypto.randomUUID(),
      vehicle_name: form.vehicle_name.trim(),
      reg_number: form.reg_number.trim().toUpperCase(),
      leasing_type: form.leasing_type,
      monthly_cost: form.monthly_cost,
      start_date: form.start_date,
      end_date: form.end_date,
      total_contract_value: form.total_contract_value,
      residual_value: form.residual_value,
      lessor: form.lessor.trim(),
      account: form.account.trim(),
      notes: form.notes.trim(),
    }

    let updated: LeasingContract[]
    if (editingContract) {
      updated = contracts.map((c) => c.id === editingContract.id ? item : c)
    } else {
      updated = [...contracts, item]
    }

    setContracts(updated)
    setDialogOpen(false)
    await saveContracts(updated)
  }

  function openDeleteConfirmation(contract: LeasingContract) {
    setContractToDelete(contract)
    setDeleteDialogOpen(true)
  }

  async function handleDelete() {
    if (!contractToDelete) return
    const updated = contracts.filter((c) => c.id !== contractToDelete.id)
    setContracts(updated)
    setDeleteDialogOpen(false)
    setContractToDelete(null)
    await saveContracts(updated)
  }

  return (
    <>
      <ModuleWorkspaceShell
        title={mod.name}
        description={mod.desc}
        category="bokforing"
        sectorName="Transport & Logistik"
        backHref={`/m/${sectorSlug}`}
        settingsHref={settingsHref}
        actions={
          <Button onClick={openNew}>
            <Plus className="mr-2 h-4 w-4" />
            Nytt leasingavtal
          </Button>
        }
      >
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <Tabs defaultValue="oversikt" className="space-y-6">
            <TabsList>
              <TabsTrigger value="oversikt">Översikt</TabsTrigger>
              <TabsTrigger value="avtal">Alla avtal</TabsTrigger>
            </TabsList>

            <TabsContent value="oversikt" className="space-y-6">
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
                <KPICard label="Aktiva avtal" value={String(totals.activeCount)} />
                <KPICard label="Månadskostnad" value={fmt(totals.totalMonthly)} unit="kr" />
                <KPICard label="Totalt avtalsvärde" value={fmt(totals.totalContractValue)} unit="kr" />
                <KPICard label="Operationella" value={String(totals.operationella)} />
                <KPICard label="Finansiella" value={String(totals.finansiella)} />
              </div>

              {contracts.length === 0 && (
                <EmptyModuleState
                  icon={FileText}
                  title="Inga leasingavtal"
                  description="Lägg till leasingavtal för att hantera operationell och finansiell leasing."
                  actionLabel="Nytt leasingavtal"
                  onAction={openNew}
                />
              )}
            </TabsContent>

            <TabsContent value="avtal" className="space-y-4">
              {contracts.length === 0 ? (
                <EmptyModuleState
                  icon={FileText}
                  title="Inga leasingavtal"
                  description="Lägg till ditt första leasingavtal för att komma igång."
                  actionLabel="Nytt leasingavtal"
                  onAction={openNew}
                />
              ) : (
                <div className="rounded-xl border border-border overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/50">
                        <TableHead className="font-medium">Fordon</TableHead>
                        <TableHead className="font-medium">Regnr</TableHead>
                        <TableHead className="font-medium">Typ</TableHead>
                        <TableHead className="font-medium">Leasegivare</TableHead>
                        <TableHead className="font-medium text-right">Månadsbetalning</TableHead>
                        <TableHead className="font-medium">Period</TableHead>
                        <TableHead className="font-medium">Status</TableHead>
                        <TableHead className="font-medium text-right">Åtgärder</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {contracts.map((c) => {
                        const status = contractStatus(c)
                        return (
                          <TableRow key={c.id}>
                            <TableCell className="font-medium">{c.vehicle_name}</TableCell>
                            <TableCell className="font-mono">{c.reg_number}</TableCell>
                            <TableCell>
                              <Badge variant="secondary">{LEASING_TYPE_LABELS[c.leasing_type]}</Badge>
                            </TableCell>
                            <TableCell>{c.lessor}</TableCell>
                            <TableCell className="text-right tabular-nums">{fmt(c.monthly_cost)} kr</TableCell>
                            <TableCell className="text-xs text-muted-foreground">
                              {c.start_date} - {c.end_date}
                              <br />
                              {monthsBetween(c.start_date, c.end_date)} mån
                            </TableCell>
                            <TableCell>
                              <StatusBadge label={status.label} variant={status.variant} />
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="flex items-center justify-end gap-1">
                                <Button variant="ghost" size="icon" onClick={() => openEdit(c)} title="Redigera">
                                  <Pencil className="h-4 w-4" />
                                </Button>
                                <Button variant="ghost" size="icon" className="text-red-600 hover:text-red-700" onClick={() => openDeleteConfirmation(c)} title="Ta bort">
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        )
                      })}
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
          </Tabs>
        )}
      </ModuleWorkspaceShell>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingContract ? 'Redigera leasingavtal' : 'Nytt leasingavtal'}</DialogTitle>
            <DialogDescription>
              {editingContract
                ? 'Uppdatera avtalets uppgifter nedan.'
                : 'Fyll i uppgifterna för det nya leasingavtalet.'}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Fordonsnamn *</Label>
                <Input value={form.vehicle_name} onChange={(e) => setForm((f) => ({ ...f, vehicle_name: e.target.value }))} placeholder="Volvo FH16" />
              </div>
              <div className="grid gap-2">
                <Label>Registreringsnummer *</Label>
                <Input value={form.reg_number} onChange={(e) => setForm((f) => ({ ...f, reg_number: e.target.value }))} placeholder="ABC 123" />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="grid gap-2">
                <Label>Leasingtyp *</Label>
                <Select value={form.leasing_type} onValueChange={(val) => setForm((f) => ({ ...f, leasing_type: val as LeasingType }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="operationell">Operationell</SelectItem>
                    <SelectItem value="finansiell">Finansiell</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label>Leasegivare</Label>
                <Input value={form.lessor} onChange={(e) => setForm((f) => ({ ...f, lessor: e.target.value }))} placeholder="Volvo Financial" />
              </div>
              <div className="grid gap-2">
                <Label>Konto</Label>
                <Input value={form.account} onChange={(e) => setForm((f) => ({ ...f, account: e.target.value }))} placeholder="5620" maxLength={4} />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="grid gap-2">
                <Label>Månadsbetalning (kr) *</Label>
                <Input type="number" min={0} value={form.monthly_cost || ''} onChange={(e) => setForm((f) => ({ ...f, monthly_cost: parseFloat(e.target.value) || 0 }))} />
              </div>
              <div className="grid gap-2">
                <Label>Totalt avtalsvärde (kr)</Label>
                <Input type="number" min={0} value={form.total_contract_value || ''} onChange={(e) => setForm((f) => ({ ...f, total_contract_value: parseFloat(e.target.value) || 0 }))} />
              </div>
              <div className="grid gap-2">
                <Label>Restvärde (kr)</Label>
                <Input type="number" min={0} value={form.residual_value || ''} onChange={(e) => setForm((f) => ({ ...f, residual_value: parseFloat(e.target.value) || 0 }))} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Startdatum *</Label>
                <Input type="date" value={form.start_date} onChange={(e) => setForm((f) => ({ ...f, start_date: e.target.value }))} />
              </div>
              <div className="grid gap-2">
                <Label>Slutdatum *</Label>
                <Input type="date" value={form.end_date} onChange={(e) => setForm((f) => ({ ...f, end_date: e.target.value }))} />
              </div>
            </div>

            <div className="grid gap-2">
              <Label>Anteckningar</Label>
              <Input value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} placeholder="Valfria anteckningar..." />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Avbryt</Button>
            <Button onClick={handleSave} disabled={!form.vehicle_name.trim() || !form.reg_number.trim() || !form.monthly_cost || !form.start_date || !form.end_date}>
              {editingContract ? 'Uppdatera' : 'Skapa avtal'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Ta bort leasingavtal</DialogTitle>
            <DialogDescription>
              Är du säker på att du vill ta bort leasingavtalet för{' '}
              <span className="font-semibold">{contractToDelete?.vehicle_name}</span>{' '}
              ({contractToDelete?.reg_number})? Denna åtgärd kan inte ångras.
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
