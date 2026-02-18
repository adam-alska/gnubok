'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { ModuleWorkspaceShell } from '@/components/modules/ModuleWorkspaceShell'
import { KPICard } from '@/components/modules/shared/KPICard'
import { EmptyModuleState } from '@/components/modules/shared/EmptyModuleState'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
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
  Trash2,
  Loader2,
  TrendingDown,
  Save,
} from 'lucide-react'

interface ModuleWorkspaceProps {
  module: { slug: string; name: string; cat: string; desc: string; longDesc: string }
  sectorSlug: string
  settingsHref: string
}

interface MonthlyChurn {
  month: string
  members_start: number
  members_end: number
  new_members: number
  cancelled: number
  churn_pct: number
  cause_breakdown: { cause: string; count: number }[]
}

function fmt(n: number): string { return new Intl.NumberFormat('sv-SE', { maximumFractionDigits: 0 }).format(n) }
function fmtPct(n: number): string { return isFinite(n) ? n.toFixed(1) : '0.0' }
function generateId(): string { return Date.now().toString(36) + Math.random().toString(36).substring(2, 7) }

const DEFAULT_DATA: MonthlyChurn[] = [
  { month: '2025-01', members_start: 500, members_end: 510, new_members: 30, cancelled: 20, churn_pct: 4.0, cause_breakdown: [{ cause: 'Flytt', count: 8 }, { cause: 'Pris', count: 5 }, { cause: 'Ej nyttjat', count: 7 }] },
  { month: '2025-02', members_start: 510, members_end: 515, new_members: 25, cancelled: 20, churn_pct: 3.9, cause_breakdown: [{ cause: 'Flytt', count: 6 }, { cause: 'Pris', count: 8 }, { cause: 'Ej nyttjat', count: 6 }] },
  { month: '2025-03', members_start: 515, members_end: 530, new_members: 35, cancelled: 20, churn_pct: 3.9, cause_breakdown: [{ cause: 'Flytt', count: 5 }, { cause: 'Pris', count: 7 }, { cause: 'Ej nyttjat', count: 8 }] },
]

const EMPTY_FORM = {
  month: '',
  members_start: '',
  members_end: '',
  new_members: '',
  cancelled: '',
  causes: [{ cause: '', count: '' }] as { cause: string; count: string }[],
}

export function ChurnRateWorkspace({ module: mod, sectorSlug, settingsHref }: ModuleWorkspaceProps) {
  const supabase = createClient()

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [data, setData] = useState<MonthlyChurn[]>([])
  const [dialogOpen, setDialogOpen] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [monthToDelete, setMonthToDelete] = useState<string | null>(null)
  const [targetInput, setTargetInput] = useState('')
  const [target, setTarget] = useState<number | null>(null)
  const [savingTarget, setSavingTarget] = useState(false)

  const saveData = useCallback(async (newData: MonthlyChurn[]) => {
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setSaving(false); return }
    await supabase.from('module_configs').upsert(
      { user_id: user.id, sector_slug: sectorSlug, module_slug: mod.slug, config_key: 'churn_data', config_value: newData },
      { onConflict: 'user_id,sector_slug,module_slug,config_key' }
    )
    setSaving(false)
  }, [supabase, sectorSlug, mod.slug])

  const fetchData = useCallback(async () => {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); return }

    const { data: churnData } = await supabase.from('module_configs').select('config_value').eq('user_id', user.id).eq('sector_slug', sectorSlug).eq('module_slug', mod.slug).eq('config_key', 'churn_data').maybeSingle()
    if (churnData?.config_value && Array.isArray(churnData.config_value) && churnData.config_value.length > 0) {
      setData(churnData.config_value as MonthlyChurn[])
    } else {
      setData(DEFAULT_DATA)
      await supabase.from('module_configs').upsert(
        { user_id: user.id, sector_slug: sectorSlug, module_slug: mod.slug, config_key: 'churn_data', config_value: DEFAULT_DATA },
        { onConflict: 'user_id,sector_slug,module_slug,config_key' }
      )
    }

    const { data: tgt } = await supabase.from('module_configs').select('config_value').eq('user_id', user.id).eq('sector_slug', sectorSlug).eq('module_slug', mod.slug).eq('config_key', 'churn_target').maybeSingle()
    if (tgt?.config_value != null) { setTarget(Number(tgt.config_value)); setTargetInput(String(tgt.config_value)) }

    setLoading(false)
  }, [supabase, sectorSlug, mod.slug])

  useEffect(() => { fetchData() }, [fetchData])

  const stats = useMemo(() => {
    if (data.length === 0) return { avgChurn: 0, latestChurn: 0, totalCancelled: 0, trend: 'neutral' as const }
    const avgChurn = data.reduce((s, d) => s + d.churn_pct, 0) / data.length
    const latest = data[data.length - 1]
    const prev = data.length > 1 ? data[data.length - 2] : null
    const trend = prev ? (latest.churn_pct < prev.churn_pct ? 'up' : latest.churn_pct > prev.churn_pct ? 'down' : 'neutral') : 'neutral'
    return { avgChurn, latestChurn: latest.churn_pct, totalCancelled: data.reduce((s, d) => s + d.cancelled, 0), trend: trend as 'up' | 'down' | 'neutral' }
  }, [data])

  const causeStats = useMemo(() => {
    const map: Record<string, number> = {}
    for (const d of data) for (const c of d.cause_breakdown) map[c.cause] = (map[c.cause] ?? 0) + c.count
    return Object.entries(map).sort(([, a], [, b]) => b - a).map(([cause, count]) => ({ cause, count }))
  }, [data])

  function openNew() { setForm({ ...EMPTY_FORM }); setDialogOpen(true) }

  function addCauseLine() { setForm((f) => ({ ...f, causes: [...f.causes, { cause: '', count: '' }] })) }
  function updateCause(idx: number, key: 'cause' | 'count', val: string) { setForm((f) => ({ ...f, causes: f.causes.map((c, i) => i === idx ? { ...c, [key]: val } : c) })) }
  function removeCause(idx: number) { setForm((f) => ({ ...f, causes: f.causes.filter((_, i) => i !== idx) })) }

  async function handleSave() {
    const cancelled = parseInt(form.cancelled) || 0
    const membersStart = parseInt(form.members_start) || 0
    const entry: MonthlyChurn = {
      month: form.month,
      members_start: membersStart,
      members_end: parseInt(form.members_end) || 0,
      new_members: parseInt(form.new_members) || 0,
      cancelled,
      churn_pct: membersStart > 0 ? (cancelled / membersStart) * 100 : 0,
      cause_breakdown: form.causes.filter((c) => c.cause && c.count).map((c) => ({ cause: c.cause, count: parseInt(c.count) || 0 })),
    }
    const updated = [...data.filter((d) => d.month !== entry.month), entry].sort((a, b) => a.month.localeCompare(b.month))
    setData(updated)
    setDialogOpen(false)
    await saveData(updated)
  }

  function openDeleteConfirmation(month: string) { setMonthToDelete(month); setDeleteDialogOpen(true) }

  async function handleDelete() {
    if (!monthToDelete) return
    const updated = data.filter((d) => d.month !== monthToDelete)
    setData(updated)
    setDeleteDialogOpen(false)
    setMonthToDelete(null)
    await saveData(updated)
  }

  async function handleSaveTarget() {
    const val = parseFloat(targetInput)
    if (isNaN(val)) return
    setSavingTarget(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      await supabase.from('module_configs').upsert(
        { user_id: user.id, sector_slug: sectorSlug, module_slug: mod.slug, config_key: 'churn_target', config_value: val },
        { onConflict: 'user_id,sector_slug,module_slug,config_key' }
      )
    }
    setTarget(val)
    setSavingTarget(false)
  }

  return (
    <>
      <ModuleWorkspaceShell title={mod.name} description={mod.desc} category="rapport" sectorName="Fitness & Sport" backHref={`/m/${sectorSlug}`} settingsHref={settingsHref} actions={<Button onClick={openNew}><Plus className="mr-2 h-4 w-4" />Ny månad</Button>}>
        {loading ? (
          <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : (
          <Tabs defaultValue="oversikt" className="space-y-6">
            <TabsList><TabsTrigger value="oversikt">Översikt</TabsTrigger><TabsTrigger value="trend">Trend</TabsTrigger><TabsTrigger value="orsaker">Orsaksanalys</TabsTrigger><TabsTrigger value="installningar">Inställningar</TabsTrigger></TabsList>

            <TabsContent value="oversikt" className="space-y-6">
              {data.length === 0 ? (
                <EmptyModuleState icon={TrendingDown} title="Ingen churn-data" description="Lägg till månadsdata för att analysera medlemstapp." actionLabel="Ny månad" onAction={openNew} />
              ) : (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  <KPICard label="Senaste churn %" value={fmtPct(stats.latestChurn)} unit="%" target={target ?? undefined} trend={stats.trend} trendLabel={stats.trend === 'up' ? 'Förbättring' : stats.trend === 'down' ? 'Försämring' : 'Stabilt'} />
                  <KPICard label="Snitt churn %" value={fmtPct(stats.avgChurn)} unit="%" />
                  <KPICard label="Totalt uppsagda" value={fmt(stats.totalCancelled)} unit="st" />
                  <KPICard label="Målvärde" value={target != null ? fmtPct(target) : '-'} unit="%" />
                </div>
              )}
            </TabsContent>

            <TabsContent value="trend" className="space-y-4">
              {data.length === 0 ? (
                <EmptyModuleState icon={TrendingDown} title="Ingen data" description="Lägg till månadsdata för att se trend." />
              ) : (
                <div className="rounded-xl border border-border overflow-hidden">
                  <Table>
                    <TableHeader><TableRow className="bg-muted/50"><TableHead className="font-medium">Månad</TableHead><TableHead className="font-medium text-right">Start</TableHead><TableHead className="font-medium text-right">Nya</TableHead><TableHead className="font-medium text-right">Uppsagda</TableHead><TableHead className="font-medium text-right">Slut</TableHead><TableHead className="font-medium text-right">Churn %</TableHead><TableHead className="font-medium text-right">Åtgärder</TableHead></TableRow></TableHeader>
                    <TableBody>
                      {data.map((d) => (
                        <TableRow key={d.month}><TableCell className="font-medium">{d.month}</TableCell><TableCell className="text-right tabular-nums">{fmt(d.members_start)}</TableCell><TableCell className="text-right tabular-nums text-emerald-600">+{fmt(d.new_members)}</TableCell><TableCell className="text-right tabular-nums text-red-600">-{fmt(d.cancelled)}</TableCell><TableCell className="text-right tabular-nums">{fmt(d.members_end)}</TableCell><TableCell className="text-right tabular-nums font-medium">{fmtPct(d.churn_pct)}%</TableCell><TableCell className="text-right"><Button variant="ghost" size="icon" className="text-red-600 hover:text-red-700" onClick={() => openDeleteConfirmation(d.month)} title="Ta bort"><Trash2 className="h-4 w-4" /></Button></TableCell></TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </TabsContent>

            <TabsContent value="orsaker" className="space-y-4">
              {causeStats.length === 0 ? (
                <EmptyModuleState icon={TrendingDown} title="Ingen orsaksdata" description="Lägg till orsaker vid registrering av månadsdata." />
              ) : (
                <div className="rounded-xl border border-border overflow-hidden">
                  <Table>
                    <TableHeader><TableRow className="bg-muted/50"><TableHead className="font-medium">Orsak</TableHead><TableHead className="font-medium text-right">Antal</TableHead><TableHead className="font-medium text-right">Andel</TableHead></TableRow></TableHeader>
                    <TableBody>
                      {causeStats.map((c) => { const total = causeStats.reduce((s, cs) => s + cs.count, 0); return (
                        <TableRow key={c.cause}><TableCell className="font-medium">{c.cause}</TableCell><TableCell className="text-right tabular-nums">{c.count}</TableCell><TableCell className="text-right tabular-nums">{fmtPct(total > 0 ? (c.count / total) * 100 : 0)}%</TableCell></TableRow>
                      ) })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </TabsContent>

            <TabsContent value="installningar" className="space-y-6">
              <div className="rounded-xl border border-border bg-card p-6 max-w-md space-y-4">
                <h3 className="text-sm font-semibold">Målvärde churn %</h3>
                <p className="text-xs text-muted-foreground">Ange önskad maximal månatlig churn i procent. Branschsnitt ligger ofta kring 3-5%.</p>
                <div className="flex items-end gap-3">
                  <div className="space-y-1.5"><Label className="text-xs">Mål (%)</Label><Input type="number" step="0.1" min={0} max={100} value={targetInput} onChange={(e) => setTargetInput(e.target.value)} className="h-9 w-32" placeholder="4.0" /></div>
                  <Button size="sm" onClick={handleSaveTarget} disabled={savingTarget}>{savingTarget ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <Save className="mr-2 h-3.5 w-3.5" />}Spara</Button>
                </div>
              </div>
            </TabsContent>
          </Tabs>
        )}
      </ModuleWorkspaceShell>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Ny månadsdata</DialogTitle><DialogDescription>Registrera medlemsdata och churn för en månad.</DialogDescription></DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-2"><Label htmlFor="ch-month">Månad *</Label><Input id="ch-month" type="month" value={form.month} onChange={(e) => setForm((f) => ({ ...f, month: e.target.value }))} /></div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2"><Label htmlFor="ch-start">Medlemmar start *</Label><Input id="ch-start" type="number" min={0} value={form.members_start} onChange={(e) => setForm((f) => ({ ...f, members_start: e.target.value }))} /></div>
              <div className="grid gap-2"><Label htmlFor="ch-end">Medlemmar slut *</Label><Input id="ch-end" type="number" min={0} value={form.members_end} onChange={(e) => setForm((f) => ({ ...f, members_end: e.target.value }))} /></div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2"><Label htmlFor="ch-new">Nya medlemmar</Label><Input id="ch-new" type="number" min={0} value={form.new_members} onChange={(e) => setForm((f) => ({ ...f, new_members: e.target.value }))} /></div>
              <div className="grid gap-2"><Label htmlFor="ch-cancelled">Uppsagda</Label><Input id="ch-cancelled" type="number" min={0} value={form.cancelled} onChange={(e) => setForm((f) => ({ ...f, cancelled: e.target.value }))} /></div>
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between"><Label>Orsaker till uppsägning</Label><Button variant="ghost" size="sm" onClick={addCauseLine}><Plus className="mr-1 h-3 w-3" />Lägg till</Button></div>
              {form.causes.map((c, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <Input value={c.cause} onChange={(e) => updateCause(idx, 'cause', e.target.value)} placeholder="Orsak" className="flex-1" />
                  <Input type="number" min={0} value={c.count} onChange={(e) => updateCause(idx, 'count', e.target.value)} placeholder="Antal" className="w-20" />
                  <Button variant="ghost" size="icon" onClick={() => removeCause(idx)} className="text-red-600"><Trash2 className="h-3.5 w-3.5" /></Button>
                </div>
              ))}
            </div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setDialogOpen(false)}>Avbryt</Button><Button onClick={handleSave} disabled={!form.month || !form.members_start}>Spara</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Ta bort månadsdata</DialogTitle><DialogDescription>Är du säker på att du vill ta bort data för <span className="font-semibold">{monthToDelete}</span>?</DialogDescription></DialogHeader>
          <DialogFooter><Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>Avbryt</Button><Button variant="destructive" onClick={handleDelete}><Trash2 className="mr-2 h-4 w-4" />Ta bort</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
