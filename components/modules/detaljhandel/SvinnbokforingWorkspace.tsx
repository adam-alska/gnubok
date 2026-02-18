'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { ModuleWorkspaceShell } from '@/components/modules/ModuleWorkspaceShell'
import { KPICard } from '@/components/modules/shared/KPICard'
import { DateRangeFilter } from '@/components/modules/shared/DateRangeFilter'
import { EmptyModuleState } from '@/components/modules/shared/EmptyModuleState'
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
import { Plus, Trash2, Loader2, AlertTriangle } from 'lucide-react'

interface ModuleWorkspaceProps {
  module: { slug: string; name: string; cat: string; desc: string; longDesc: string }
  sectorSlug: string
  settingsHref: string
}

interface ShrinkageEntry {
  id: string
  date: string
  category: string
  product: string
  quantity: number
  unitCost: number
  totalCost: number
  reason: string
}

const CATEGORIES = ['Livsmedel', 'Dryck', 'Frukt & Gront', 'Mejeri', 'Kott & Chark', 'Non-food', 'Ovrigt']
const REASONS = ['Utgangsdatum', 'Skadat', 'Stold', 'Svinn vid hantering', 'Felaktigt', 'Ovrigt']

function generateId(): string {
  return crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`
}

function todayStr(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function startOfMonth(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}

function fmt(n: number): string {
  return new Intl.NumberFormat('sv-SE', { maximumFractionDigits: 0 }).format(n)
}

const EMPTY_FORM = {
  date: todayStr(),
  category: 'Livsmedel',
  product: '',
  quantity: 1,
  unitCost: 0,
  reason: 'Utgangsdatum',
}

export function SvinnbokforingWorkspace({ module: mod, sectorSlug, settingsHref }: ModuleWorkspaceProps) {
  const supabase = createClient()

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [entries, setEntries] = useState<ShrinkageEntry[]>([])
  const [from, setFrom] = useState(startOfMonth)
  const [to, setTo] = useState(todayStr)

  const [dialogOpen, setDialogOpen] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [entryToDelete, setEntryToDelete] = useState<ShrinkageEntry | null>(null)

  const saveEntries = useCallback(async (newEntries: ShrinkageEntry[]) => {
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setSaving(false); return }
    await supabase.from('module_configs').upsert(
      { user_id: user.id, sector_slug: sectorSlug, module_slug: mod.slug, config_key: 'shrinkage_entries', config_value: newEntries },
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
      .eq('config_key', 'shrinkage_entries')
      .maybeSingle()
    if (data?.config_value && Array.isArray(data.config_value)) setEntries(data.config_value as ShrinkageEntry[])
    setLoading(false)
  }, [supabase, sectorSlug, mod.slug])

  useEffect(() => { fetchEntries() }, [fetchEntries])

  const filteredEntries = useMemo(() => {
    return entries
      .filter(e => e.date >= from && e.date <= to)
      .sort((a, b) => b.date.localeCompare(a.date))
  }, [entries, from, to])

  const totalCost = useMemo(() => filteredEntries.reduce((s, e) => s + e.totalCost, 0), [filteredEntries])
  const categoryBreakdown = useMemo(() => {
    const map: Record<string, number> = {}
    for (const e of filteredEntries) {
      map[e.category] = (map[e.category] ?? 0) + e.totalCost
    }
    return Object.entries(map).sort((a, b) => b[1] - a[1])
  }, [filteredEntries])
  const reasonBreakdown = useMemo(() => {
    const map: Record<string, number> = {}
    for (const e of filteredEntries) {
      map[e.reason] = (map[e.reason] ?? 0) + e.totalCost
    }
    return Object.entries(map).sort((a, b) => b[1] - a[1])
  }, [filteredEntries])

  async function handleSaveEntry() {
    const entry: ShrinkageEntry = {
      id: generateId(),
      date: form.date,
      category: form.category,
      product: form.product.trim(),
      quantity: form.quantity,
      unitCost: form.unitCost,
      totalCost: form.quantity * form.unitCost,
      reason: form.reason,
    }
    const updated = [...entries, entry]
    setEntries(updated)
    setDialogOpen(false)
    setForm({ ...EMPTY_FORM, date: todayStr() })
    await saveEntries(updated)
  }

  async function handleDeleteEntry() {
    if (!entryToDelete) return
    const updated = entries.filter(e => e.id !== entryToDelete.id)
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
        sectorName="Detaljhandel"
        backHref={`/m/${sectorSlug}`}
        settingsHref={settingsHref}
        actions={
          <div className="flex items-center gap-3">
            <DateRangeFilter from={from} to={to} onFromChange={setFrom} onToChange={setTo} />
            <Button onClick={() => { setForm({ ...EMPTY_FORM, date: todayStr() }); setDialogOpen(true) }}>
              <Plus className="mr-2 h-4 w-4" />
              Registrera svinn
            </Button>
          </div>
        }
      >
        <Tabs defaultValue="oversikt" className="space-y-6">
          <TabsList>
            <TabsTrigger value="oversikt">Oversikt</TabsTrigger>
            <TabsTrigger value="poster">Poster</TabsTrigger>
            <TabsTrigger value="analys">Analys</TabsTrigger>
          </TabsList>

          <TabsContent value="oversikt" className="space-y-6">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <KPICard label="Total svinnskostnad" value={fmt(totalCost)} unit="kr" />
                <KPICard label="Antal poster" value={String(filteredEntries.length)} unit="st" />
                <KPICard label="Storsta kategori" value={categoryBreakdown[0]?.[0] ?? '-'} />
                <KPICard label="Vanligaste orsak" value={reasonBreakdown[0]?.[0] ?? '-'} />
              </div>
            )}
          </TabsContent>

          <TabsContent value="poster" className="space-y-4">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : filteredEntries.length === 0 ? (
              <EmptyModuleState
                icon={AlertTriangle}
                title="Inga svinnposter"
                description="Registrera svinn for att spara pa konto 4730. Alla poster bokfors som kostnad."
                actionLabel="Registrera svinn"
                onAction={() => { setForm({ ...EMPTY_FORM, date: todayStr() }); setDialogOpen(true) }}
              />
            ) : (
              <div className="rounded-xl border border-border overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead className="font-medium">Datum</TableHead>
                      <TableHead className="font-medium">Produkt</TableHead>
                      <TableHead className="font-medium">Kategori</TableHead>
                      <TableHead className="font-medium">Orsak</TableHead>
                      <TableHead className="font-medium text-right">Antal</TableHead>
                      <TableHead className="font-medium text-right">Kostnad</TableHead>
                      <TableHead className="font-medium text-right">Atgarder</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredEntries.map((entry) => (
                      <TableRow key={entry.id}>
                        <TableCell>{entry.date}</TableCell>
                        <TableCell className="font-medium">{entry.product}</TableCell>
                        <TableCell><Badge variant="outline">{entry.category}</Badge></TableCell>
                        <TableCell><Badge variant="secondary">{entry.reason}</Badge></TableCell>
                        <TableCell className="text-right tabular-nums">{entry.quantity}</TableCell>
                        <TableCell className="text-right tabular-nums font-medium">{fmt(entry.totalCost)} kr</TableCell>
                        <TableCell className="text-right">
                          <Button variant="ghost" size="icon" className="text-red-600 hover:text-red-700"
                            onClick={() => { setEntryToDelete(entry); setDeleteDialogOpen(true) }}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                    <TableRow className="bg-muted/30 font-medium">
                      <TableCell colSpan={5}>Totalt</TableCell>
                      <TableCell className="text-right tabular-nums">{fmt(totalCost)} kr</TableCell>
                      <TableCell />
                    </TableRow>
                  </TableBody>
                </Table>
              </div>
            )}
          </TabsContent>

          <TabsContent value="analys" className="space-y-6">
            <div className="grid gap-6 lg:grid-cols-2">
              <div className="rounded-xl border border-border bg-card p-5 space-y-4">
                <h3 className="text-sm font-semibold">Per kategori</h3>
                {categoryBreakdown.length === 0 ? (
                  <p className="text-xs text-muted-foreground">Ingen data for vald period.</p>
                ) : (
                  <div className="space-y-2">
                    {categoryBreakdown.map(([cat, cost]) => (
                      <div key={cat} className="flex items-center justify-between">
                        <span className="text-sm">{cat}</span>
                        <span className="text-sm font-medium tabular-nums">{fmt(cost)} kr</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div className="rounded-xl border border-border bg-card p-5 space-y-4">
                <h3 className="text-sm font-semibold">Per orsak</h3>
                {reasonBreakdown.length === 0 ? (
                  <p className="text-xs text-muted-foreground">Ingen data for vald period.</p>
                ) : (
                  <div className="space-y-2">
                    {reasonBreakdown.map(([reason, cost]) => (
                      <div key={reason} className="flex items-center justify-between">
                        <span className="text-sm">{reason}</span>
                        <span className="text-sm font-medium tabular-nums">{fmt(cost)} kr</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <p className="text-xs text-muted-foreground">Svinnkostnad bokfors pa konto 4730.</p>
          </TabsContent>
        </Tabs>
      </ModuleWorkspaceShell>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Registrera svinn</DialogTitle>
            <DialogDescription>Registrera en svinnpost som bokfors pa konto 4730.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Datum *</Label>
                <Input type="date" value={form.date} onChange={(e) => setForm(f => ({ ...f, date: e.target.value }))} />
              </div>
              <div className="grid gap-2">
                <Label>Kategori *</Label>
                <Select value={form.category} onValueChange={(val) => setForm(f => ({ ...f, category: val }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid gap-2">
              <Label>Produkt *</Label>
              <Input value={form.product} onChange={(e) => setForm(f => ({ ...f, product: e.target.value }))} placeholder="T.ex. Mjolk 3% 1L" />
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="grid gap-2">
                <Label>Antal</Label>
                <Input type="number" min={1} value={form.quantity} onChange={(e) => setForm(f => ({ ...f, quantity: Number(e.target.value) || 1 }))} />
              </div>
              <div className="grid gap-2">
                <Label>Enhetskostnad (kr)</Label>
                <Input type="number" min={0} step="0.01" value={form.unitCost} onChange={(e) => setForm(f => ({ ...f, unitCost: Number(e.target.value) || 0 }))} />
              </div>
              <div className="grid gap-2">
                <Label>Orsak</Label>
                <Select value={form.reason} onValueChange={(val) => setForm(f => ({ ...f, reason: val }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {REASONS.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">Total kostnad: <strong>{fmt(form.quantity * form.unitCost)} kr</strong></p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Avbryt</Button>
            <Button onClick={handleSaveEntry} disabled={!form.product.trim() || form.unitCost <= 0}>
              Registrera
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Ta bort svinnpost</DialogTitle>
            <DialogDescription>
              Ar du saker pa att du vill ta bort denna svinnpost ({entryToDelete?.product})?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>Avbryt</Button>
            <Button variant="destructive" onClick={handleDeleteEntry}>
              <Trash2 className="mr-2 h-4 w-4" />Ta bort
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
