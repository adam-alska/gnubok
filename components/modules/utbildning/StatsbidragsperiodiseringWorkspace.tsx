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
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { Plus, Pencil, Trash2, Loader2, Landmark, AlertTriangle } from 'lucide-react'

interface ModuleWorkspaceProps {
  module: { slug: string; name: string; cat: string; desc: string; longDesc: string }
  sectorSlug: string
  settingsHref: string
}

type GrantStatus = 'Beviljat' | 'Pågående' | 'Villkor uppfyllt' | 'Återbetalningsrisk'
type PeriodType = 'Kalenderår' | 'Läsår' | 'Kvartal'

interface Grant {
  id: string
  name: string
  grantorName: string
  totalAmount: number
  receivedAmount: number
  periodType: PeriodType
  startDate: string
  endDate: string
  account: string
  status: GrantStatus
  conditions: string
  repaymentRisk: boolean
}

const GRANT_STATUSES: GrantStatus[] = ['Beviljat', 'Pågående', 'Villkor uppfyllt', 'Återbetalningsrisk']
const PERIOD_TYPES: PeriodType[] = ['Kalenderår', 'Läsår', 'Kvartal']

const STATUS_VARIANT: Record<GrantStatus, 'success' | 'warning' | 'danger' | 'info' | 'neutral'> = {
  'Beviljat': 'info',
  'Pågående': 'warning',
  'Villkor uppfyllt': 'success',
  'Återbetalningsrisk': 'danger',
}

function fmt(n: number): string {
  return new Intl.NumberFormat('sv-SE', { maximumFractionDigits: 0 }).format(n)
}

const EMPTY_FORM = {
  name: '',
  grantorName: '',
  totalAmount: 0,
  receivedAmount: 0,
  periodType: 'Kalenderår' as PeriodType,
  startDate: '',
  endDate: '',
  account: '2970',
  status: 'Beviljat' as GrantStatus,
  conditions: '',
  repaymentRisk: false,
}

export function StatsbidragsperiodiseringWorkspace({ module: mod, sectorSlug, settingsHref }: ModuleWorkspaceProps) {
  const supabase = createClient()

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [grants, setGrants] = useState<Grant[]>([])
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<Grant | null>(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [toDelete, setToDelete] = useState<Grant | null>(null)

  const saveGrants = useCallback(async (items: Grant[]) => {
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setSaving(false); return }
    await supabase.from('module_configs').upsert(
      { user_id: user.id, sector_slug: sectorSlug, module_slug: mod.slug, config_key: 'grants', config_value: items },
      { onConflict: 'user_id,sector_slug,module_slug,config_key' }
    )
    setSaving(false)
  }, [supabase, sectorSlug, mod.slug])

  const fetchGrants = useCallback(async () => {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); return }
    const { data } = await supabase.from('module_configs').select('config_value')
      .eq('user_id', user.id).eq('sector_slug', sectorSlug).eq('module_slug', mod.slug).eq('config_key', 'grants').maybeSingle()
    if (data?.config_value && Array.isArray(data.config_value)) setGrants(data.config_value as Grant[])
    setLoading(false)
  }, [supabase, sectorSlug, mod.slug])

  useEffect(() => { fetchGrants() }, [fetchGrants])

  const totalGranted = useMemo(() => grants.reduce((s, g) => s + g.totalAmount, 0), [grants])
  const totalReceived = useMemo(() => grants.reduce((s, g) => s + g.receivedAmount, 0), [grants])
  const riskGrants = useMemo(() => grants.filter(g => g.repaymentRisk), [grants])

  function openNew() {
    setEditing(null)
    setForm({ ...EMPTY_FORM })
    setDialogOpen(true)
  }

  function openEdit(grant: Grant) {
    setEditing(grant)
    setForm({
      name: grant.name, grantorName: grant.grantorName, totalAmount: grant.totalAmount,
      receivedAmount: grant.receivedAmount, periodType: grant.periodType, startDate: grant.startDate,
      endDate: grant.endDate, account: grant.account, status: grant.status, conditions: grant.conditions,
      repaymentRisk: grant.repaymentRisk,
    })
    setDialogOpen(true)
  }

  async function handleSave() {
    const entry: Grant = {
      id: editing?.id ?? crypto.randomUUID(),
      ...form,
    }
    const updated = editing ? grants.map(g => g.id === editing.id ? entry : g) : [...grants, entry]
    setGrants(updated)
    setDialogOpen(false)
    await saveGrants(updated)
  }

  async function handleDelete() {
    if (!toDelete) return
    const updated = grants.filter(g => g.id !== toDelete.id)
    setGrants(updated)
    setDeleteDialogOpen(false)
    setToDelete(null)
    await saveGrants(updated)
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
        actions={<Button onClick={openNew}><Plus className="mr-2 h-4 w-4" />Nytt bidrag</Button>}
      >
        <Tabs defaultValue="oversikt" className="space-y-6">
          <TabsList>
            <TabsTrigger value="oversikt">Översikt</TabsTrigger>
            <TabsTrigger value="periodisering">Periodisering</TabsTrigger>
          </TabsList>

          <TabsContent value="oversikt" className="space-y-6">
            {loading ? (
              <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
            ) : (
              <>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  <KPICard label="Antal bidrag" value={grants.length} />
                  <KPICard label="Totalt beviljat" value={fmt(totalGranted)} unit="kr" />
                  <KPICard label="Totalt mottaget" value={fmt(totalReceived)} unit="kr" />
                  <KPICard label="Återbetalningsrisk" value={riskGrants.length} unit="bidrag" trend={riskGrants.length > 0 ? 'down' : 'neutral'} />
                </div>

                {grants.length === 0 ? (
                  <EmptyModuleState icon={Landmark} title="Inga statsbidrag" description="Lägg till statsbidrag för att hantera periodisering och villkorsuppföljning." actionLabel="Nytt bidrag" onAction={openNew} />
                ) : (
                  <div className="rounded-xl border border-border overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-muted/50">
                          <TableHead className="font-medium">Bidrag</TableHead>
                          <TableHead className="font-medium">Bidragsgivare</TableHead>
                          <TableHead className="font-medium text-right">Belopp</TableHead>
                          <TableHead className="font-medium">Period</TableHead>
                          <TableHead className="font-medium">Konto</TableHead>
                          <TableHead className="font-medium">Status</TableHead>
                          <TableHead className="font-medium text-right">Åtgärder</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {grants.map((g) => (
                          <TableRow key={g.id}>
                            <TableCell className="font-medium">
                              <div className="flex items-center gap-2">
                                {g.name}
                                {g.repaymentRisk && <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />}
                              </div>
                            </TableCell>
                            <TableCell>{g.grantorName}</TableCell>
                            <TableCell className="text-right tabular-nums">{fmt(g.totalAmount)} kr</TableCell>
                            <TableCell className="text-sm">{g.startDate} - {g.endDate}</TableCell>
                            <TableCell className="font-mono">{g.account}</TableCell>
                            <TableCell><StatusBadge label={g.status} variant={STATUS_VARIANT[g.status]} /></TableCell>
                            <TableCell className="text-right">
                              <div className="flex items-center justify-end gap-1">
                                <Button variant="ghost" size="icon" onClick={() => openEdit(g)}><Pencil className="h-4 w-4" /></Button>
                                <Button variant="ghost" size="icon" className="text-red-600 hover:text-red-700" onClick={() => { setToDelete(g); setDeleteDialogOpen(true) }}><Trash2 className="h-4 w-4" /></Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
                {saving && <div className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" />Sparar...</div>}
              </>
            )}
          </TabsContent>

          <TabsContent value="periodisering" className="space-y-4">
            <div className="rounded-xl border border-border bg-card p-6 max-w-lg space-y-3">
              <h3 className="text-sm font-semibold">Periodiseringsregler</h3>
              <ul className="text-sm text-muted-foreground space-y-2 list-disc pl-4">
                <li>Statsbidrag bokförs som förutbetald intäkt på konto <strong>2970</strong></li>
                <li>Intäktsföring sker i takt med villkorsuppfyllelse</li>
                <li>Vid risk för återbetalning redovisas eventualförpliktelse</li>
                <li>Periodisering per kalenderår, läsår eller kvartal</li>
              </ul>
            </div>
          </TabsContent>
        </Tabs>
      </ModuleWorkspaceShell>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? 'Redigera bidrag' : 'Nytt statsbidrag'}</DialogTitle>
            <DialogDescription>{editing ? 'Uppdatera bidragets uppgifter.' : 'Lägg till ett nytt statsbidrag för periodisering.'}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2"><Label>Bidragsnamn *</Label><Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Statsbidrag X" /></div>
              <div className="grid gap-2"><Label>Bidragsgivare *</Label><Input value={form.grantorName} onChange={e => setForm(f => ({ ...f, grantorName: e.target.value }))} placeholder="Skolverket" /></div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2"><Label>Totalt belopp (kr) *</Label><Input type="number" value={form.totalAmount || ''} onChange={e => setForm(f => ({ ...f, totalAmount: parseFloat(e.target.value) || 0 }))} /></div>
              <div className="grid gap-2"><Label>Mottaget belopp (kr)</Label><Input type="number" value={form.receivedAmount || ''} onChange={e => setForm(f => ({ ...f, receivedAmount: parseFloat(e.target.value) || 0 }))} /></div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="grid gap-2"><Label>Periodtyp</Label>
                <Select value={form.periodType} onValueChange={v => setForm(f => ({ ...f, periodType: v as PeriodType }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{PERIOD_TYPES.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="grid gap-2"><Label>Startdatum</Label><Input type="date" value={form.startDate} onChange={e => setForm(f => ({ ...f, startDate: e.target.value }))} /></div>
              <div className="grid gap-2"><Label>Slutdatum</Label><Input type="date" value={form.endDate} onChange={e => setForm(f => ({ ...f, endDate: e.target.value }))} /></div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2"><Label>Konto</Label><Input value={form.account} onChange={e => setForm(f => ({ ...f, account: e.target.value }))} placeholder="2970" /></div>
              <div className="grid gap-2"><Label>Status</Label>
                <Select value={form.status} onValueChange={v => setForm(f => ({ ...f, status: v as GrantStatus }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{GRANT_STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid gap-2"><Label>Villkor</Label><Input value={form.conditions} onChange={e => setForm(f => ({ ...f, conditions: e.target.value }))} placeholder="Beskriv villkor för bidraget..." /></div>
            <div className="flex items-center gap-3">
              <Button type="button" variant={form.repaymentRisk ? 'destructive' : 'outline'} size="sm" onClick={() => setForm(f => ({ ...f, repaymentRisk: !f.repaymentRisk }))}>
                {form.repaymentRisk ? 'Återbetalningsrisk: JA' : 'Återbetalningsrisk: NEJ'}
              </Button>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Avbryt</Button>
            <Button onClick={handleSave} disabled={!form.name.trim()}>{editing ? 'Uppdatera' : 'Lägg till'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Ta bort bidrag</DialogTitle>
            <DialogDescription>Är du säker på att du vill ta bort {toDelete?.name}?</DialogDescription>
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
