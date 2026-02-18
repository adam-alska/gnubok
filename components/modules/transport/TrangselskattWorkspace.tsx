'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { ModuleWorkspaceShell } from '@/components/modules/ModuleWorkspaceShell'
import { EmptyModuleState } from '@/components/modules/shared/EmptyModuleState'
import { KPICard } from '@/components/modules/shared/KPICard'
import { DateRangeFilter } from '@/components/modules/shared/DateRangeFilter'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
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
  Receipt,
} from 'lucide-react'

interface ModuleWorkspaceProps {
  module: { slug: string; name: string; cat: string; desc: string; longDesc: string }
  sectorSlug: string
  settingsHref: string
}

interface TaxEntry {
  id: string
  vehicle_name: string
  reg_number: string
  date: string
  amount: number
  passage_point: string
  account: string
}

const EMPTY_FORM = {
  vehicle_name: '',
  reg_number: '',
  date: '',
  amount: 0,
  passage_point: '',
  account: '5615',
}

function fmt(n: number): string {
  return new Intl.NumberFormat('sv-SE', { maximumFractionDigits: 0 }).format(n)
}

function startOfMonth(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}

function todayStr(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function TrangselskattWorkspace({ module: mod, sectorSlug, settingsHref }: ModuleWorkspaceProps) {
  const supabase = createClient()

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [entries, setEntries] = useState<TaxEntry[]>([])
  const [from, setFrom] = useState(startOfMonth)
  const [to, setTo] = useState(todayStr)

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingEntry, setEditingEntry] = useState<TaxEntry | null>(null)
  const [form, setForm] = useState(EMPTY_FORM)

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [entryToDelete, setEntryToDelete] = useState<TaxEntry | null>(null)

  const saveEntries = useCallback(async (items: TaxEntry[]) => {
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setSaving(false); return }

    await supabase.from('module_configs').upsert(
      {
        user_id: user.id,
        sector_slug: sectorSlug,
        module_slug: mod.slug,
        config_key: 'tax_entries',
        config_value: items,
      },
      { onConflict: 'user_id,sector_slug,module_slug,config_key' }
    )
    setSaving(false)
  }, [supabase, sectorSlug, mod.slug])

  const fetchEntries = useCallback(async () => {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); return }

    const { data } = await supabase
      .from('module_configs')
      .select('config_value')
      .eq('user_id', user.id)
      .eq('sector_slug', sectorSlug)
      .eq('module_slug', mod.slug)
      .eq('config_key', 'tax_entries')
      .maybeSingle()

    if (data?.config_value && Array.isArray(data.config_value)) {
      setEntries(data.config_value as TaxEntry[])
    }
    setLoading(false)
  }, [supabase, sectorSlug, mod.slug])

  useEffect(() => { fetchEntries() }, [fetchEntries])

  const filteredEntries = useMemo(() => {
    return entries
      .filter((e) => e.date >= from && e.date <= to)
      .sort((a, b) => b.date.localeCompare(a.date))
  }, [entries, from, to])

  const vehicleSummary = useMemo(() => {
    const map: Record<string, { vehicle_name: string; reg_number: string; total: number; count: number }> = {}
    for (const e of filteredEntries) {
      if (!map[e.reg_number]) {
        map[e.reg_number] = { vehicle_name: e.vehicle_name, reg_number: e.reg_number, total: 0, count: 0 }
      }
      map[e.reg_number].total += e.amount
      map[e.reg_number].count += 1
    }
    return Object.values(map).sort((a, b) => b.total - a.total)
  }, [filteredEntries])

  const totalAmount = useMemo(() => filteredEntries.reduce((s, e) => s + e.amount, 0), [filteredEntries])
  const avgPerEntry = useMemo(() => filteredEntries.length > 0 ? totalAmount / filteredEntries.length : 0, [totalAmount, filteredEntries])

  function openNew() {
    setEditingEntry(null)
    setForm({ ...EMPTY_FORM, date: todayStr() })
    setDialogOpen(true)
  }

  function openEdit(entry: TaxEntry) {
    setEditingEntry(entry)
    setForm({
      vehicle_name: entry.vehicle_name,
      reg_number: entry.reg_number,
      date: entry.date,
      amount: entry.amount,
      passage_point: entry.passage_point,
      account: entry.account,
    })
    setDialogOpen(true)
  }

  async function handleSave() {
    const item: TaxEntry = {
      id: editingEntry?.id || crypto.randomUUID(),
      vehicle_name: form.vehicle_name.trim(),
      reg_number: form.reg_number.trim().toUpperCase(),
      date: form.date,
      amount: form.amount,
      passage_point: form.passage_point.trim(),
      account: form.account.trim(),
    }

    let updated: TaxEntry[]
    if (editingEntry) {
      updated = entries.map((e) => e.id === editingEntry.id ? item : e)
    } else {
      updated = [...entries, item]
    }

    setEntries(updated)
    setDialogOpen(false)
    await saveEntries(updated)
  }

  function openDeleteConfirmation(entry: TaxEntry) {
    setEntryToDelete(entry)
    setDeleteDialogOpen(true)
  }

  async function handleDelete() {
    if (!entryToDelete) return
    const updated = entries.filter((e) => e.id !== entryToDelete.id)
    setEntries(updated)
    setDeleteDialogOpen(false)
    setEntryToDelete(null)
    await saveEntries(updated)
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
          <div className="flex items-center gap-3">
            <DateRangeFilter from={from} to={to} onFromChange={setFrom} onToChange={setTo} />
            <Button onClick={openNew}>
              <Plus className="mr-2 h-4 w-4" />
              Ny post
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
              <TabsTrigger value="oversikt">Översikt</TabsTrigger>
              <TabsTrigger value="per-fordon">Per fordon</TabsTrigger>
              <TabsTrigger value="detalj">Detaljlista</TabsTrigger>
            </TabsList>

            <TabsContent value="oversikt" className="space-y-6">
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <KPICard label="Total trängselskatt" value={fmt(totalAmount)} unit="kr" />
                <KPICard label="Antal passager" value={String(filteredEntries.length)} />
                <KPICard label="Snitt per passage" value={fmt(avgPerEntry)} unit="kr" />
                <KPICard label="Antal fordon" value={String(vehicleSummary.length)} />
              </div>

              {filteredEntries.length === 0 && (
                <EmptyModuleState
                  icon={Receipt}
                  title="Inga poster i perioden"
                  description="Registrera trängselskatt som avdragsgill kostnad på konto 5615."
                  actionLabel="Ny post"
                  onAction={openNew}
                />
              )}
            </TabsContent>

            <TabsContent value="per-fordon" className="space-y-4">
              {vehicleSummary.length === 0 ? (
                <EmptyModuleState
                  icon={Receipt}
                  title="Ingen data per fordon"
                  description="Lägg till trängselskatteposter för att se sammanställning per fordon."
                />
              ) : (
                <div className="rounded-xl border border-border overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/50">
                        <TableHead className="font-medium">Fordon</TableHead>
                        <TableHead className="font-medium">Regnr</TableHead>
                        <TableHead className="font-medium text-right">Antal passager</TableHead>
                        <TableHead className="font-medium text-right">Total kostnad</TableHead>
                        <TableHead className="font-medium text-right">Snitt/passage</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {vehicleSummary.map((v) => (
                        <TableRow key={v.reg_number}>
                          <TableCell className="font-medium">{v.vehicle_name}</TableCell>
                          <TableCell className="font-mono">{v.reg_number}</TableCell>
                          <TableCell className="text-right tabular-nums">{v.count}</TableCell>
                          <TableCell className="text-right tabular-nums font-medium">{fmt(v.total)} kr</TableCell>
                          <TableCell className="text-right tabular-nums">{fmt(v.total / v.count)} kr</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </TabsContent>

            <TabsContent value="detalj" className="space-y-4">
              {filteredEntries.length === 0 ? (
                <EmptyModuleState
                  icon={Receipt}
                  title="Inga poster"
                  description="Lägg till trängselskatteposter för att se detaljlistan."
                  actionLabel="Ny post"
                  onAction={openNew}
                />
              ) : (
                <div className="rounded-xl border border-border overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/50">
                        <TableHead className="font-medium">Datum</TableHead>
                        <TableHead className="font-medium">Fordon</TableHead>
                        <TableHead className="font-medium">Regnr</TableHead>
                        <TableHead className="font-medium">Passage</TableHead>
                        <TableHead className="font-medium text-right">Belopp</TableHead>
                        <TableHead className="font-medium font-mono">Konto</TableHead>
                        <TableHead className="font-medium text-right">Åtgärder</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredEntries.map((e) => (
                        <TableRow key={e.id}>
                          <TableCell>{e.date}</TableCell>
                          <TableCell className="font-medium">{e.vehicle_name}</TableCell>
                          <TableCell className="font-mono">{e.reg_number}</TableCell>
                          <TableCell>{e.passage_point}</TableCell>
                          <TableCell className="text-right tabular-nums">{fmt(e.amount)} kr</TableCell>
                          <TableCell className="font-mono">{e.account}</TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-1">
                              <Button variant="ghost" size="icon" onClick={() => openEdit(e)} title="Redigera">
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <Button variant="ghost" size="icon" className="text-red-600 hover:text-red-700" onClick={() => openDeleteConfirmation(e)} title="Ta bort">
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
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingEntry ? 'Redigera trängselskatt' : 'Ny trängselskatt'}</DialogTitle>
            <DialogDescription>
              {editingEntry
                ? 'Uppdatera posten nedan.'
                : 'Registrera en ny trängselskatteavgift.'}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Fordon *</Label>
                <Input value={form.vehicle_name} onChange={(e) => setForm((f) => ({ ...f, vehicle_name: e.target.value }))} placeholder="Volvo FH16" />
              </div>
              <div className="grid gap-2">
                <Label>Regnr *</Label>
                <Input value={form.reg_number} onChange={(e) => setForm((f) => ({ ...f, reg_number: e.target.value }))} placeholder="ABC 123" />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="grid gap-2">
                <Label>Datum *</Label>
                <Input type="date" value={form.date} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} />
              </div>
              <div className="grid gap-2">
                <Label>Belopp (kr) *</Label>
                <Input type="number" min={0} step={1} value={form.amount || ''} onChange={(e) => setForm((f) => ({ ...f, amount: parseFloat(e.target.value) || 0 }))} />
              </div>
              <div className="grid gap-2">
                <Label>Konto</Label>
                <Input value={form.account} onChange={(e) => setForm((f) => ({ ...f, account: e.target.value }))} placeholder="5615" maxLength={4} />
              </div>
            </div>

            <div className="grid gap-2">
              <Label>Passagepunkt</Label>
              <Input value={form.passage_point} onChange={(e) => setForm((f) => ({ ...f, passage_point: e.target.value }))} placeholder="Essingeleden, Lidingövägen..." />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Avbryt</Button>
            <Button onClick={handleSave} disabled={!form.vehicle_name.trim() || !form.reg_number.trim() || !form.date || !form.amount}>
              {editingEntry ? 'Uppdatera' : 'Lägg till'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Ta bort post</DialogTitle>
            <DialogDescription>
              Är du säker på att du vill ta bort denna trängselskattpost ({entryToDelete?.date}, {entryToDelete?.reg_number})?
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
