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
import {
  Plus,
  Pencil,
  Trash2,
  Loader2,
  Search,
  PieChart,
} from 'lucide-react'

interface ModuleWorkspaceProps {
  module: { slug: string; name: string; cat: string; desc: string; longDesc: string }
  sectorSlug: string
  settingsHref: string
}

type AtaType = 'Ändring' | 'Tillägg' | 'Avgående'
type AtaApprovalStatus = 'Väntande' | 'Godkänd' | 'Avslagen'

interface AtaEntry {
  id: string
  ataNumber: string
  project: string
  type: AtaType
  description: string
  originalEstimate: number
  ataAmount: number
  approvalStatus: AtaApprovalStatus
  date: string
}

const EMPTY_FORM = {
  ataNumber: '',
  project: '',
  type: 'Tillägg' as AtaType,
  description: '',
  originalEstimate: 0,
  ataAmount: 0,
  approvalStatus: 'Väntande' as AtaApprovalStatus,
  date: new Date().toISOString().slice(0, 10),
}

const TYPE_COLORS: Record<AtaType, string> = {
  'Ändring': 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
  'Tillägg': 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400',
  'Avgående': 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
}

const STATUS_COLORS: Record<AtaApprovalStatus, string> = {
  'Väntande': 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400',
  'Godkänd': 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400',
  'Avslagen': 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
}

function fmt(n: number): string {
  return new Intl.NumberFormat('sv-SE', { maximumFractionDigits: 0 }).format(n)
}

function fmtPct(n: number): string {
  return isFinite(n) ? n.toFixed(1) : '0.0'
}

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
}

export function AtaAnalysWorkspace({ module: mod, sectorSlug, settingsHref }: ModuleWorkspaceProps) {
  const supabase = createClient()

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [entries, setEntries] = useState<AtaEntry[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [filterType, setFilterType] = useState<AtaType | 'all'>('all')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingEntry, setEditingEntry] = useState<AtaEntry | null>(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [entryToDelete, setEntryToDelete] = useState<AtaEntry | null>(null)

  const saveEntries = useCallback(async (items: AtaEntry[]) => {
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setSaving(false); return }
    await supabase.from('module_configs').upsert(
      { user_id: user.id, sector_slug: sectorSlug, module_slug: mod.slug, config_key: 'ata_entries', config_value: items },
      { onConflict: 'user_id,sector_slug,module_slug,config_key' }
    )
    setSaving(false)
  }, [supabase, sectorSlug, mod.slug])

  const fetchData = useCallback(async () => {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); return }
    const { data } = await supabase
      .from('module_configs').select('config_value')
      .eq('user_id', user.id).eq('sector_slug', sectorSlug)
      .eq('module_slug', mod.slug).eq('config_key', 'ata_entries')
      .maybeSingle()
    if (data?.config_value && Array.isArray(data.config_value)) {
      setEntries(data.config_value as AtaEntry[])
    }
    setLoading(false)
  }, [supabase, sectorSlug, mod.slug])

  useEffect(() => { fetchData() }, [fetchData])

  const filtered = useMemo(() => {
    let result = entries
    if (filterType !== 'all') result = result.filter((e) => e.type === filterType)
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      result = result.filter((e) =>
        e.ataNumber.toLowerCase().includes(q) ||
        e.project.toLowerCase().includes(q) ||
        e.description.toLowerCase().includes(q)
      )
    }
    return result.sort((a, b) => b.date.localeCompare(a.date))
  }, [entries, filterType, searchQuery])

  const stats = useMemo(() => {
    const totalOriginal = entries.reduce((s, e) => s + e.originalEstimate, 0)
    const totalAta = entries.reduce((s, e) => s + e.ataAmount, 0)
    const ataPct = totalOriginal > 0 ? (totalAta / totalOriginal) * 100 : 0
    const byType: Record<AtaType, number> = { 'Ändring': 0, 'Tillägg': 0, 'Avgående': 0 }
    entries.forEach(e => { byType[e.type] += e.ataAmount })
    const approved = entries.filter(e => e.approvalStatus === 'Godkänd').length
    const pending = entries.filter(e => e.approvalStatus === 'Väntande').length
    const rejected = entries.filter(e => e.approvalStatus === 'Avslagen').length
    return { totalOriginal, totalAta, ataPct, byType, approved, pending, rejected }
  }, [entries])

  // Project breakdown
  const projectBreakdown = useMemo(() => {
    const map: Record<string, { project: string; original: number; ata: number; count: number }> = {}
    entries.forEach(e => {
      if (!map[e.project]) map[e.project] = { project: e.project, original: 0, ata: 0, count: 0 }
      map[e.project].original = Math.max(map[e.project].original, e.originalEstimate)
      map[e.project].ata += e.ataAmount
      map[e.project].count++
    })
    return Object.values(map).sort((a, b) => b.ata - a.ata)
  }, [entries])

  function openNew() {
    setEditingEntry(null)
    setForm({ ...EMPTY_FORM })
    setDialogOpen(true)
  }

  function openEdit(e: AtaEntry) {
    setEditingEntry(e)
    setForm({ ...e })
    setDialogOpen(true)
  }

  async function handleSave() {
    const item: AtaEntry = {
      id: editingEntry?.id ?? generateId(),
      ...form,
      originalEstimate: Number(form.originalEstimate),
      ataAmount: Number(form.ataAmount),
    }
    let updated: AtaEntry[]
    if (editingEntry) {
      updated = entries.map((e) => e.id === editingEntry.id ? item : e)
    } else {
      updated = [...entries, item]
    }
    setEntries(updated)
    setDialogOpen(false)
    await saveEntries(updated)
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
        category="rapport"
        sectorName="Bygg & Entreprenad"
        backHref={`/m/${sectorSlug}`}
        settingsHref={settingsHref}
        actions={
          <Button onClick={openNew}>
            <Plus className="mr-2 h-4 w-4" />
            Ny ÄTA
          </Button>
        }
      >
        <Tabs defaultValue="oversikt" className="space-y-6">
          <TabsList>
            <TabsTrigger value="oversikt">Översikt</TabsTrigger>
            <TabsTrigger value="per-projekt">Per projekt</TabsTrigger>
            <TabsTrigger value="lista">Detaljlista</TabsTrigger>
          </TabsList>

          <TabsContent value="oversikt" className="space-y-6">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : entries.length === 0 ? (
              <EmptyModuleState
                icon={PieChart}
                title="Ingen ÄTA-data"
                description="Registrera ÄTA-ärenden för att analysera andel av ursprunglig kalkyl, per typ och godkännandestatus."
                actionLabel="Ny ÄTA"
                onAction={openNew}
              />
            ) : (
              <>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
                  <KPICard label="ÄTA som % av kalkyl" value={fmtPct(stats.ataPct)} unit="%" trend={stats.ataPct > 15 ? 'down' : stats.ataPct > 10 ? 'neutral' : 'up'} trendLabel={stats.ataPct > 15 ? 'Hög' : 'Normal'} />
                  <KPICard label="Total ÄTA" value={fmt(stats.totalAta)} unit="kr" />
                  <KPICard label="Godkända" value={String(stats.approved)} unit="st" />
                  <KPICard label="Väntande" value={String(stats.pending)} unit="st" />
                  <KPICard label="Avslagna" value={String(stats.rejected)} unit="st" />
                </div>

                <div className="grid gap-4 sm:grid-cols-3">
                  {(['Ändring', 'Tillägg', 'Avgående'] as AtaType[]).map(type => (
                    <div key={type} className="rounded-xl border border-border bg-card p-5 space-y-2">
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{type}</p>
                      <div className="flex items-baseline gap-1.5">
                        <span className="text-2xl font-semibold tracking-tight">{fmt(stats.byType[type])}</span>
                        <span className="text-sm text-muted-foreground">kr</span>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {stats.totalAta > 0 ? fmtPct((stats.byType[type] / stats.totalAta) * 100) : '0.0'}% av total ÄTA
                      </p>
                    </div>
                  ))}
                </div>
              </>
            )}
          </TabsContent>

          <TabsContent value="per-projekt" className="space-y-6">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : projectBreakdown.length === 0 ? (
              <EmptyModuleState icon={PieChart} title="Ingen projektdata" description="Registrera ÄTA med projektkoppling." />
            ) : (
              <div className="rounded-xl border border-border overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead className="font-medium">Projekt</TableHead>
                      <TableHead className="font-medium text-right">Ursprunglig kalkyl</TableHead>
                      <TableHead className="font-medium text-right">Total ÄTA</TableHead>
                      <TableHead className="font-medium text-right">ÄTA %</TableHead>
                      <TableHead className="font-medium text-right">Antal ÄTA</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {projectBreakdown.map((p) => {
                      const pct = p.original > 0 ? (p.ata / p.original) * 100 : 0
                      return (
                        <TableRow key={p.project}>
                          <TableCell className="font-medium">{p.project}</TableCell>
                          <TableCell className="text-right tabular-nums">{fmt(p.original)} kr</TableCell>
                          <TableCell className="text-right tabular-nums">{fmt(p.ata)} kr</TableCell>
                          <TableCell className="text-right">
                            <Badge variant="secondary" className={pct > 15 ? 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400' : pct > 10 ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400' : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400'}>
                              {fmtPct(pct)}%
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right tabular-nums">{p.count}</TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </TabsContent>

          <TabsContent value="lista" className="space-y-6">
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
              <div className="relative flex-1 max-w-sm">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Sök ÄTA..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-9" />
              </div>
              <Select value={filterType} onValueChange={(v) => setFilterType(v as AtaType | 'all')}>
                <SelectTrigger className="w-[180px]"><SelectValue placeholder="Filtrera typ" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Alla typer</SelectItem>
                  <SelectItem value="Ändring">Ändring</SelectItem>
                  <SelectItem value="Tillägg">Tillägg</SelectItem>
                  <SelectItem value="Avgående">Avgående</SelectItem>
                </SelectContent>
              </Select>
              {saving && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />Sparar...
                </div>
              )}
            </div>

            {filtered.length === 0 ? (
              <EmptyModuleState icon={PieChart} title="Inga ÄTA hittades" description="Inga ÄTA matchar dina sökkriterier." />
            ) : (
              <div className="rounded-xl border border-border overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead className="font-medium">ÄTA-nr</TableHead>
                      <TableHead className="font-medium">Projekt</TableHead>
                      <TableHead className="font-medium">Typ</TableHead>
                      <TableHead className="font-medium text-right">Belopp</TableHead>
                      <TableHead className="font-medium">Status</TableHead>
                      <TableHead className="font-medium">Datum</TableHead>
                      <TableHead className="font-medium text-right">Åtgärder</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map((e) => (
                      <TableRow key={e.id}>
                        <TableCell className="font-mono font-medium">{e.ataNumber}</TableCell>
                        <TableCell>{e.project}</TableCell>
                        <TableCell><Badge variant="secondary" className={TYPE_COLORS[e.type]}>{e.type}</Badge></TableCell>
                        <TableCell className="text-right tabular-nums">{fmt(e.ataAmount)} kr</TableCell>
                        <TableCell><Badge variant="secondary" className={STATUS_COLORS[e.approvalStatus]}>{e.approvalStatus}</Badge></TableCell>
                        <TableCell>{e.date}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button variant="ghost" size="icon" onClick={() => openEdit(e)} title="Redigera"><Pencil className="h-4 w-4" /></Button>
                            <Button variant="ghost" size="icon" className="text-red-600 hover:text-red-700" onClick={() => { setEntryToDelete(e); setDeleteDialogOpen(true) }} title="Ta bort"><Trash2 className="h-4 w-4" /></Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </ModuleWorkspaceShell>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingEntry ? 'Redigera ÄTA' : 'Ny ÄTA för analys'}</DialogTitle>
            <DialogDescription>Registrera ÄTA med ursprunglig kalkyl för att beräkna andel och analysera per typ.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>ÄTA-nummer *</Label>
                <Input value={form.ataNumber} onChange={(e) => setForm(f => ({ ...f, ataNumber: e.target.value }))} placeholder="ÄTA-001" />
              </div>
              <div className="grid gap-2">
                <Label>Projekt *</Label>
                <Input value={form.project} onChange={(e) => setForm(f => ({ ...f, project: e.target.value }))} placeholder="Projektnamn" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Typ *</Label>
                <Select value={form.type} onValueChange={(v) => setForm(f => ({ ...f, type: v as AtaType }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Ändring">Ändring</SelectItem>
                    <SelectItem value="Tillägg">Tillägg</SelectItem>
                    <SelectItem value="Avgående">Avgående</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label>Godkännandestatus</Label>
                <Select value={form.approvalStatus} onValueChange={(v) => setForm(f => ({ ...f, approvalStatus: v as AtaApprovalStatus }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Väntande">Väntande</SelectItem>
                    <SelectItem value="Godkänd">Godkänd</SelectItem>
                    <SelectItem value="Avslagen">Avslagen</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid gap-2">
              <Label>Beskrivning</Label>
              <Input value={form.description} onChange={(e) => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Beskrivning av ÄTA" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Ursprunglig kalkyl (kr)</Label>
                <Input type="number" value={form.originalEstimate || ''} onChange={(e) => setForm(f => ({ ...f, originalEstimate: Number(e.target.value) }))} placeholder="0" />
              </div>
              <div className="grid gap-2">
                <Label>ÄTA-belopp (kr) *</Label>
                <Input type="number" value={form.ataAmount || ''} onChange={(e) => setForm(f => ({ ...f, ataAmount: Number(e.target.value) }))} placeholder="0" />
              </div>
            </div>
            <div className="grid gap-2">
              <Label>Datum</Label>
              <Input type="date" value={form.date} onChange={(e) => setForm(f => ({ ...f, date: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Avbryt</Button>
            <Button onClick={handleSave} disabled={!form.ataNumber.trim() || !form.project.trim()}>
              {editingEntry ? 'Uppdatera' : 'Registrera'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Ta bort ÄTA</DialogTitle>
            <DialogDescription>Är du säker på att du vill ta bort {entryToDelete?.ataNumber}?</DialogDescription>
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
