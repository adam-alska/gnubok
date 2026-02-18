'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { ModuleWorkspaceShell } from '@/components/modules/ModuleWorkspaceShell'
import { KPICard } from '@/components/modules/shared/KPICard'
import { EmptyModuleState } from '@/components/modules/shared/EmptyModuleState'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Plus, Pencil, Trash2, Loader2, Cog } from 'lucide-react'

interface ModuleWorkspaceProps {
  module: { slug: string; name: string; cat: string; desc: string; longDesc: string }
  sectorSlug: string
  settingsHref: string
}

interface Machine {
  id: string
  name: string
  acquisitionDate: string
  acquisitionCost: number
  residualValue: number
  usefulLifeYears: number
  method: 'Linjär' | 'Degressiv'
  accountAsset: string
  accountDepreciation: string
}

function fmt(n: number): string {
  return new Intl.NumberFormat('sv-SE', { maximumFractionDigits: 0 }).format(n)
}

function calcAnnualDepreciation(m: Machine): number {
  if (m.usefulLifeYears <= 0) return 0
  return (m.acquisitionCost - m.residualValue) / m.usefulLifeYears
}

function calcAccumulatedDepreciation(m: Machine): number {
  const years = Math.min(
    m.usefulLifeYears,
    Math.max(0, (new Date().getFullYear() - new Date(m.acquisitionDate).getFullYear()))
  )
  return calcAnnualDepreciation(m) * years
}

function calcBookValue(m: Machine): number {
  return Math.max(m.residualValue, m.acquisitionCost - calcAccumulatedDepreciation(m))
}

const EMPTY_FORM = {
  name: '',
  acquisitionDate: '',
  acquisitionCost: 0,
  residualValue: 0,
  usefulLifeYears: 5,
  method: 'Linjär' as 'Linjär' | 'Degressiv',
  accountAsset: '1210',
  accountDepreciation: '7831',
}

export function MaskinavskrivningIndustriWorkspace({ module: mod, sectorSlug, settingsHref }: ModuleWorkspaceProps) {
  const supabase = createClient()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [machines, setMachines] = useState<Machine[]>([])
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingMachine, setEditingMachine] = useState<Machine | null>(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [machineToDelete, setMachineToDelete] = useState<Machine | null>(null)

  const saveMachines = useCallback(async (newMachines: Machine[]) => {
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setSaving(false); return }
    await supabase.from('module_configs').upsert(
      { user_id: user.id, sector_slug: sectorSlug, module_slug: mod.slug, config_key: 'machines', config_value: newMachines },
      { onConflict: 'user_id,sector_slug,module_slug,config_key' }
    )
    setSaving(false)
  }, [supabase, sectorSlug, mod.slug])

  const fetchData = useCallback(async () => {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); return }
    const { data } = await supabase.from('module_configs').select('config_value')
      .eq('user_id', user.id).eq('sector_slug', sectorSlug).eq('module_slug', mod.slug)
      .eq('config_key', 'machines').maybeSingle()
    if (data?.config_value && Array.isArray(data.config_value)) {
      setMachines(data.config_value as Machine[])
    }
    setLoading(false)
  }, [supabase, sectorSlug, mod.slug])

  useEffect(() => { fetchData() }, [fetchData])

  const totalAcquisition = machines.reduce((s, m) => s + m.acquisitionCost, 0)
  const totalBookValue = machines.reduce((s, m) => s + calcBookValue(m), 0)
  const totalAnnualDep = machines.reduce((s, m) => s + calcAnnualDepreciation(m), 0)

  function openNew() {
    setEditingMachine(null)
    setForm({ ...EMPTY_FORM })
    setDialogOpen(true)
  }

  function openEdit(machine: Machine) {
    setEditingMachine(machine)
    setForm({ name: machine.name, acquisitionDate: machine.acquisitionDate, acquisitionCost: machine.acquisitionCost, residualValue: machine.residualValue, usefulLifeYears: machine.usefulLifeYears, method: machine.method, accountAsset: machine.accountAsset, accountDepreciation: machine.accountDepreciation })
    setDialogOpen(true)
  }

  async function handleSave() {
    const newMachine: Machine = {
      id: editingMachine?.id ?? crypto.randomUUID(),
      ...form,
      name: form.name.trim(),
    }
    const updated = editingMachine ? machines.map(m => m.id === editingMachine.id ? newMachine : m) : [...machines, newMachine]
    setMachines(updated)
    setDialogOpen(false)
    await saveMachines(updated)
  }

  async function handleDelete() {
    if (!machineToDelete) return
    const updated = machines.filter(m => m.id !== machineToDelete.id)
    setMachines(updated)
    setDeleteDialogOpen(false)
    setMachineToDelete(null)
    await saveMachines(updated)
  }

  return (
    <>
      <ModuleWorkspaceShell
        title={mod.name} description={mod.desc} category="bokforing" sectorName="Tillverkning"
        backHref={`/m/${sectorSlug}`} settingsHref={settingsHref}
        actions={<Button onClick={openNew}><Plus className="mr-2 h-4 w-4" />Ny maskin</Button>}
      >
        <Tabs defaultValue="oversikt" className="space-y-6">
          <TabsList>
            <TabsTrigger value="oversikt">Översikt</TabsTrigger>
            <TabsTrigger value="maskiner">Maskiner</TabsTrigger>
          </TabsList>

          <TabsContent value="oversikt" className="space-y-6">
            {loading ? (
              <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
            ) : machines.length === 0 ? (
              <EmptyModuleState icon={Cog} title="Inga maskiner registrerade" description="Lägg till maskiner för att beräkna avskrivningsplaner. Använd konto 1210 för tillgångar och 7831 för avskrivningar." actionLabel="Ny maskin" onAction={openNew} />
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <KPICard label="Antal maskiner" value={String(machines.length)} unit="st" />
                <KPICard label="Anskaffningsvärde" value={fmt(totalAcquisition)} unit="kr" />
                <KPICard label="Bokfört värde" value={fmt(totalBookValue)} unit="kr" />
                <KPICard label="Årlig avskrivning" value={fmt(totalAnnualDep)} unit="kr" />
              </div>
            )}
          </TabsContent>

          <TabsContent value="maskiner" className="space-y-4">
            {loading ? (
              <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
            ) : machines.length === 0 ? (
              <EmptyModuleState icon={Cog} title="Inga maskiner" description="Lägg till din första maskin." actionLabel="Ny maskin" onAction={openNew} />
            ) : (
              <div className="rounded-xl border border-border overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-muted/50 border-b border-border">
                      <th className="text-left px-4 py-3 font-medium text-muted-foreground">Maskin</th>
                      <th className="text-left px-4 py-3 font-medium text-muted-foreground">Anskaffad</th>
                      <th className="text-right px-4 py-3 font-medium text-muted-foreground">Anskaff.värde</th>
                      <th className="text-right px-4 py-3 font-medium text-muted-foreground">Restvärde</th>
                      <th className="text-right px-4 py-3 font-medium text-muted-foreground">Bokfört värde</th>
                      <th className="text-right px-4 py-3 font-medium text-muted-foreground">Årlig avskr.</th>
                      <th className="text-left px-4 py-3 font-medium text-muted-foreground">Konton</th>
                      <th className="text-right px-4 py-3 font-medium text-muted-foreground">Åtgärder</th>
                    </tr>
                  </thead>
                  <tbody>
                    {machines.map(m => (
                      <tr key={m.id} className="border-b border-border last:border-0">
                        <td className="px-4 py-3 font-medium">{m.name}</td>
                        <td className="px-4 py-3">{m.acquisitionDate}</td>
                        <td className="px-4 py-3 text-right tabular-nums">{fmt(m.acquisitionCost)}</td>
                        <td className="px-4 py-3 text-right tabular-nums">{fmt(m.residualValue)}</td>
                        <td className="px-4 py-3 text-right tabular-nums font-medium">{fmt(calcBookValue(m))}</td>
                        <td className="px-4 py-3 text-right tabular-nums">{fmt(calcAnnualDepreciation(m))}</td>
                        <td className="px-4 py-3 font-mono text-xs">{m.accountAsset}/{m.accountDepreciation}</td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button variant="ghost" size="icon" onClick={() => openEdit(m)}><Pencil className="h-4 w-4" /></Button>
                            <Button variant="ghost" size="icon" className="text-red-600 hover:text-red-700" onClick={() => { setMachineToDelete(m); setDeleteDialogOpen(true) }}><Trash2 className="h-4 w-4" /></Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {saving && <div className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" />Sparar...</div>}
          </TabsContent>
        </Tabs>
      </ModuleWorkspaceShell>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingMachine ? 'Redigera maskin' : 'Ny maskin'}</DialogTitle>
            <DialogDescription>{editingMachine ? 'Uppdatera maskinens avskrivningsuppgifter.' : 'Fyll i uppgifter om maskinen och avskrivningsplan.'}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2"><Label>Maskinnamn *</Label><Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="CNC-fräs" /></div>
              <div className="grid gap-2"><Label>Anskaffningsdatum *</Label><Input type="date" value={form.acquisitionDate} onChange={e => setForm(f => ({ ...f, acquisitionDate: e.target.value }))} /></div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="grid gap-2"><Label>Anskaff.värde (kr)</Label><Input type="number" min={0} value={form.acquisitionCost} onChange={e => setForm(f => ({ ...f, acquisitionCost: parseFloat(e.target.value) || 0 }))} /></div>
              <div className="grid gap-2"><Label>Restvärde (kr)</Label><Input type="number" min={0} value={form.residualValue} onChange={e => setForm(f => ({ ...f, residualValue: parseFloat(e.target.value) || 0 }))} /></div>
              <div className="grid gap-2"><Label>Livslängd (år)</Label><Input type="number" min={1} value={form.usefulLifeYears} onChange={e => setForm(f => ({ ...f, usefulLifeYears: parseInt(e.target.value) || 1 }))} /></div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="grid gap-2">
                <Label>Metod</Label>
                <Select value={form.method} onValueChange={val => setForm(f => ({ ...f, method: val as 'Linjär' | 'Degressiv' }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Linjär">Linjär</SelectItem>
                    <SelectItem value="Degressiv">Degressiv</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2"><Label>Tillgångskonto</Label><Input value={form.accountAsset} onChange={e => setForm(f => ({ ...f, accountAsset: e.target.value }))} placeholder="1210" /></div>
              <div className="grid gap-2"><Label>Avskr.konto</Label><Input value={form.accountDepreciation} onChange={e => setForm(f => ({ ...f, accountDepreciation: e.target.value }))} placeholder="7831" /></div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Avbryt</Button>
            <Button onClick={handleSave} disabled={!form.name.trim() || !form.acquisitionDate}>{editingMachine ? 'Uppdatera' : 'Skapa'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Ta bort maskin</DialogTitle>
            <DialogDescription>Är du säker på att du vill ta bort <span className="font-semibold">{machineToDelete?.name}</span>?</DialogDescription>
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
