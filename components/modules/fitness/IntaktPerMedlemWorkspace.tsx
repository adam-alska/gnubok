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
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Plus, Trash2, Loader2, Users, DollarSign } from 'lucide-react'

interface ModuleWorkspaceProps {
  module: { slug: string; name: string; cat: string; desc: string; longDesc: string }
  sectorSlug: string
  settingsHref: string
}

interface MonthlyRevenue {
  month: string
  members: number
  membership_revenue: number
  pt_revenue: number
  shop_revenue: number
  other_revenue: number
}

function fmt(n: number): string { return new Intl.NumberFormat('sv-SE', { maximumFractionDigits: 0 }).format(n) }
function fmtPct(n: number): string { return isFinite(n) ? n.toFixed(0) : '0' }

const DEFAULT_DATA: MonthlyRevenue[] = [
  { month: '2025-01', members: 500, membership_revenue: 249500, pt_revenue: 45000, shop_revenue: 12000, other_revenue: 5000 },
  { month: '2025-02', members: 510, membership_revenue: 254490, pt_revenue: 52000, shop_revenue: 14000, other_revenue: 6000 },
  { month: '2025-03', members: 530, membership_revenue: 264470, pt_revenue: 48000, shop_revenue: 11000, other_revenue: 4500 },
]

const EMPTY_FORM = { month: '', members: '', membership_revenue: '', pt_revenue: '', shop_revenue: '', other_revenue: '' }

export function IntaktPerMedlemWorkspace({ module: mod, sectorSlug, settingsHref }: ModuleWorkspaceProps) {
  const supabase = createClient()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [data, setData] = useState<MonthlyRevenue[]>([])
  const [dialogOpen, setDialogOpen] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [monthToDelete, setMonthToDelete] = useState<string | null>(null)

  const saveData = useCallback(async (newData: MonthlyRevenue[]) => {
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setSaving(false); return }
    await supabase.from('module_configs').upsert(
      { user_id: user.id, sector_slug: sectorSlug, module_slug: mod.slug, config_key: 'revenue_data', config_value: newData },
      { onConflict: 'user_id,sector_slug,module_slug,config_key' }
    )
    setSaving(false)
  }, [supabase, sectorSlug, mod.slug])

  const fetchData = useCallback(async () => {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); return }
    const { data: d } = await supabase.from('module_configs').select('config_value').eq('user_id', user.id).eq('sector_slug', sectorSlug).eq('module_slug', mod.slug).eq('config_key', 'revenue_data').maybeSingle()
    if (d?.config_value && Array.isArray(d.config_value) && d.config_value.length > 0) { setData(d.config_value as MonthlyRevenue[]) }
    else { setData(DEFAULT_DATA); await supabase.from('module_configs').upsert({ user_id: user.id, sector_slug: sectorSlug, module_slug: mod.slug, config_key: 'revenue_data', config_value: DEFAULT_DATA }, { onConflict: 'user_id,sector_slug,module_slug,config_key' }) }
    setLoading(false)
  }, [supabase, sectorSlug, mod.slug])

  useEffect(() => { fetchData() }, [fetchData])

  const stats = useMemo(() => {
    if (data.length === 0) return { avgRevPerMember: 0, latestRevPerMember: 0, totalRevenue: 0, avgMembers: 0 }
    const latest = data[data.length - 1]
    const latestTotal = latest.membership_revenue + latest.pt_revenue + latest.shop_revenue + latest.other_revenue
    const latestRevPerMember = latest.members > 0 ? latestTotal / latest.members : 0
    const totalRevenue = data.reduce((s, d) => s + d.membership_revenue + d.pt_revenue + d.shop_revenue + d.other_revenue, 0)
    const totalMembers = data.reduce((s, d) => s + d.members, 0)
    const avgRevPerMember = totalMembers > 0 ? totalRevenue / totalMembers : 0
    return { avgRevPerMember, latestRevPerMember, totalRevenue, avgMembers: Math.round(totalMembers / data.length) }
  }, [data])

  function openNew() { setForm({ ...EMPTY_FORM }); setDialogOpen(true) }

  async function handleSave() {
    const entry: MonthlyRevenue = { month: form.month, members: parseInt(form.members) || 0, membership_revenue: parseFloat(form.membership_revenue) || 0, pt_revenue: parseFloat(form.pt_revenue) || 0, shop_revenue: parseFloat(form.shop_revenue) || 0, other_revenue: parseFloat(form.other_revenue) || 0 }
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

  return (
    <>
      <ModuleWorkspaceShell title={mod.name} description={mod.desc} category="rapport" sectorName="Fitness & Sport" backHref={`/m/${sectorSlug}`} settingsHref={settingsHref} actions={<Button onClick={openNew}><Plus className="mr-2 h-4 w-4" />Ny månad</Button>}>
        {loading ? (
          <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : (
          <Tabs defaultValue="oversikt" className="space-y-6">
            <TabsList><TabsTrigger value="oversikt">Översikt</TabsTrigger><TabsTrigger value="detalj">Månadsdetalj</TabsTrigger></TabsList>

            <TabsContent value="oversikt" className="space-y-6">
              {data.length === 0 ? (
                <EmptyModuleState icon={DollarSign} title="Ingen intäktsdata" description="Lägg till månadsdata för att analysera intäkt per medlem." actionLabel="Ny månad" onAction={openNew} />
              ) : (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  <KPICard label="Senaste intäkt/medlem" value={fmt(Math.round(stats.latestRevPerMember))} unit="kr" />
                  <KPICard label="Snitt intäkt/medlem" value={fmt(Math.round(stats.avgRevPerMember))} unit="kr" />
                  <KPICard label="Total intäkt" value={fmt(stats.totalRevenue)} unit="kr" />
                  <KPICard label="Snitt medlemmar" value={fmt(stats.avgMembers)} unit="st" />
                </div>
              )}
            </TabsContent>

            <TabsContent value="detalj" className="space-y-4">
              {data.length === 0 ? (
                <EmptyModuleState icon={Users} title="Ingen data" description="Lägg till månadsdata." />
              ) : (
                <div className="rounded-xl border border-border overflow-hidden">
                  <Table>
                    <TableHeader><TableRow className="bg-muted/50"><TableHead className="font-medium">Månad</TableHead><TableHead className="font-medium text-right">Medlemmar</TableHead><TableHead className="font-medium text-right">Medlemskap</TableHead><TableHead className="font-medium text-right">PT</TableHead><TableHead className="font-medium text-right">Butik</TableHead><TableHead className="font-medium text-right">Övrigt</TableHead><TableHead className="font-medium text-right">Totalt</TableHead><TableHead className="font-medium text-right">Per medlem</TableHead><TableHead className="font-medium text-right">Åtgärder</TableHead></TableRow></TableHeader>
                    <TableBody>
                      {data.map((d) => { const total = d.membership_revenue + d.pt_revenue + d.shop_revenue + d.other_revenue; const perMember = d.members > 0 ? total / d.members : 0; return (
                        <TableRow key={d.month}><TableCell className="font-medium">{d.month}</TableCell><TableCell className="text-right tabular-nums">{fmt(d.members)}</TableCell><TableCell className="text-right tabular-nums">{fmt(d.membership_revenue)}</TableCell><TableCell className="text-right tabular-nums">{fmt(d.pt_revenue)}</TableCell><TableCell className="text-right tabular-nums">{fmt(d.shop_revenue)}</TableCell><TableCell className="text-right tabular-nums">{fmt(d.other_revenue)}</TableCell><TableCell className="text-right tabular-nums font-semibold">{fmt(total)}</TableCell><TableCell className="text-right tabular-nums font-semibold">{fmt(Math.round(perMember))}</TableCell><TableCell className="text-right"><Button variant="ghost" size="icon" className="text-red-600 hover:text-red-700" onClick={() => openDeleteConfirmation(d.month)}><Trash2 className="h-4 w-4" /></Button></TableCell></TableRow>
                      ) })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </TabsContent>
          </Tabs>
        )}
      </ModuleWorkspaceShell>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Ny månadsdata</DialogTitle><DialogDescription>Registrera intäktsdata per kategori och antal medlemmar.</DialogDescription></DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2"><Label htmlFor="rev-month">Månad *</Label><Input id="rev-month" type="month" value={form.month} onChange={(e) => setForm((f) => ({ ...f, month: e.target.value }))} /></div>
              <div className="grid gap-2"><Label htmlFor="rev-members">Antal medlemmar *</Label><Input id="rev-members" type="number" min={0} value={form.members} onChange={(e) => setForm((f) => ({ ...f, members: e.target.value }))} /></div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2"><Label htmlFor="rev-membership">Medlemsintäkter (kr)</Label><Input id="rev-membership" type="number" min={0} value={form.membership_revenue} onChange={(e) => setForm((f) => ({ ...f, membership_revenue: e.target.value }))} /></div>
              <div className="grid gap-2"><Label htmlFor="rev-pt">PT-intäkter (kr)</Label><Input id="rev-pt" type="number" min={0} value={form.pt_revenue} onChange={(e) => setForm((f) => ({ ...f, pt_revenue: e.target.value }))} /></div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2"><Label htmlFor="rev-shop">Butik (kr)</Label><Input id="rev-shop" type="number" min={0} value={form.shop_revenue} onChange={(e) => setForm((f) => ({ ...f, shop_revenue: e.target.value }))} /></div>
              <div className="grid gap-2"><Label htmlFor="rev-other">Övrigt (kr)</Label><Input id="rev-other" type="number" min={0} value={form.other_revenue} onChange={(e) => setForm((f) => ({ ...f, other_revenue: e.target.value }))} /></div>
            </div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setDialogOpen(false)}>Avbryt</Button><Button onClick={handleSave} disabled={!form.month || !form.members}>Spara</Button></DialogFooter>
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
