'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { ModuleWorkspaceShell } from '@/components/modules/ModuleWorkspaceShell'
import { EmptyModuleState } from '@/components/modules/shared/EmptyModuleState'
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
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import {
  Plus,
  Pencil,
  Trash2,
  Loader2,
  Heart,
  FileText,
  Save,
} from 'lucide-react'

interface ModuleWorkspaceProps {
  module: { slug: string; name: string; cat: string; desc: string; longDesc: string }
  sectorSlug: string
  settingsHref: string
}

type ClaimStatus = 'mottagen' | 'verifierad' | 'utbetald' | 'nekad'

interface WellnessClaim {
  id: string
  employee_name: string
  employer: string
  amount: number
  date: string
  description: string
  status: ClaimStatus
  receipt_ref: string
}

const STATUS_LABELS: Record<ClaimStatus, string> = {
  mottagen: 'Mottagen',
  verifierad: 'Verifierad',
  utbetald: 'Utbetald',
  nekad: 'Nekad',
}

const STATUS_COLORS: Record<ClaimStatus, string> = {
  mottagen: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
  verifierad: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400',
  utbetald: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400',
  nekad: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
}

const SKATTEVERKET_LIMIT = 5000

const DEFAULT_CLAIMS: WellnessClaim[] = [
  { id: '1', employee_name: 'Anna Svensson', employer: 'TechAB', amount: 3000, date: '2025-03-15', description: 'Årsmedlemskap gym', status: 'utbetald', receipt_ref: 'KV-001' },
  { id: '2', employee_name: 'Erik Lindgren', employer: 'Konsult AB', amount: 2500, date: '2025-04-01', description: 'PT-paket 10 tillfällen', status: 'verifierad', receipt_ref: 'KV-002' },
]

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).substring(2, 7)
}

function fmt(n: number): string {
  return new Intl.NumberFormat('sv-SE', { maximumFractionDigits: 0 }).format(n)
}

const EMPTY_FORM = {
  employee_name: '',
  employer: '',
  amount: '',
  date: '',
  description: '',
  status: 'mottagen' as ClaimStatus,
  receipt_ref: '',
}

export function FriskvardsbidragWorkspace({ module: mod, sectorSlug, settingsHref }: ModuleWorkspaceProps) {
  const supabase = createClient()

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [claims, setClaims] = useState<WellnessClaim[]>([])
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingClaim, setEditingClaim] = useState<WellnessClaim | null>(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [claimToDelete, setClaimToDelete] = useState<WellnessClaim | null>(null)
  const [filterStatus, setFilterStatus] = useState<ClaimStatus | 'all'>('all')
  const [maxAmount, setMaxAmount] = useState(SKATTEVERKET_LIMIT)
  const [maxAmountInput, setMaxAmountInput] = useState(String(SKATTEVERKET_LIMIT))
  const [savingSettings, setSavingSettings] = useState(false)

  const saveClaims = useCallback(async (newClaims: WellnessClaim[]) => {
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setSaving(false); return }
    await supabase.from('module_configs').upsert(
      { user_id: user.id, sector_slug: sectorSlug, module_slug: mod.slug, config_key: 'wellness_claims', config_value: newClaims },
      { onConflict: 'user_id,sector_slug,module_slug,config_key' }
    )
    setSaving(false)
  }, [supabase, sectorSlug, mod.slug])

  const fetchData = useCallback(async () => {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); return }

    const { data: claimsData } = await supabase.from('module_configs').select('config_value').eq('user_id', user.id).eq('sector_slug', sectorSlug).eq('module_slug', mod.slug).eq('config_key', 'wellness_claims').maybeSingle()
    if (claimsData?.config_value && Array.isArray(claimsData.config_value) && claimsData.config_value.length > 0) {
      setClaims(claimsData.config_value as WellnessClaim[])
    } else {
      setClaims(DEFAULT_CLAIMS)
      await supabase.from('module_configs').upsert(
        { user_id: user.id, sector_slug: sectorSlug, module_slug: mod.slug, config_key: 'wellness_claims', config_value: DEFAULT_CLAIMS },
        { onConflict: 'user_id,sector_slug,module_slug,config_key' }
      )
    }

    const { data: settingsData } = await supabase.from('module_configs').select('config_value').eq('user_id', user.id).eq('sector_slug', sectorSlug).eq('module_slug', mod.slug).eq('config_key', 'max_amount').maybeSingle()
    if (settingsData?.config_value) {
      setMaxAmount(Number(settingsData.config_value))
      setMaxAmountInput(String(settingsData.config_value))
    }
    setLoading(false)
  }, [supabase, sectorSlug, mod.slug])

  useEffect(() => { fetchData() }, [fetchData])

  const filteredClaims = useMemo(() => {
    let result = claims
    if (filterStatus !== 'all') result = result.filter((c) => c.status === filterStatus)
    return result.sort((a, b) => b.date.localeCompare(a.date))
  }, [claims, filterStatus])

  const stats = useMemo(() => {
    const total = claims.reduce((s, c) => s + c.amount, 0)
    const utbetald = claims.filter((c) => c.status === 'utbetald').reduce((s, c) => s + c.amount, 0)
    const pending = claims.filter((c) => c.status === 'mottagen' || c.status === 'verifierad').reduce((s, c) => s + c.amount, 0)
    const overLimit = claims.filter((c) => c.amount > maxAmount).length
    return { total, utbetald, pending, count: claims.length, overLimit }
  }, [claims, maxAmount])

  function openNew() { setEditingClaim(null); setForm({ ...EMPTY_FORM }); setDialogOpen(true) }

  function openEdit(claim: WellnessClaim) {
    setEditingClaim(claim)
    setForm({ employee_name: claim.employee_name, employer: claim.employer, amount: String(claim.amount), date: claim.date, description: claim.description, status: claim.status, receipt_ref: claim.receipt_ref })
    setDialogOpen(true)
  }

  async function handleSave() {
    const newClaim: WellnessClaim = { id: editingClaim?.id ?? generateId(), employee_name: form.employee_name.trim(), employer: form.employer.trim(), amount: parseFloat(form.amount) || 0, date: form.date, description: form.description.trim(), status: form.status, receipt_ref: form.receipt_ref.trim() }
    const updated = editingClaim ? claims.map((c) => c.id === editingClaim.id ? newClaim : c) : [...claims, newClaim]
    setClaims(updated)
    setDialogOpen(false)
    await saveClaims(updated)
  }

  function openDeleteConfirmation(claim: WellnessClaim) { setClaimToDelete(claim); setDeleteDialogOpen(true) }

  async function handleDelete() {
    if (!claimToDelete) return
    const updated = claims.filter((c) => c.id !== claimToDelete.id)
    setClaims(updated)
    setDeleteDialogOpen(false)
    setClaimToDelete(null)
    await saveClaims(updated)
  }

  async function handleSaveMaxAmount() {
    const val = parseFloat(maxAmountInput)
    if (isNaN(val)) return
    setSavingSettings(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      await supabase.from('module_configs').upsert(
        { user_id: user.id, sector_slug: sectorSlug, module_slug: mod.slug, config_key: 'max_amount', config_value: val },
        { onConflict: 'user_id,sector_slug,module_slug,config_key' }
      )
    }
    setMaxAmount(val)
    setSavingSettings(false)
  }

  return (
    <>
      <ModuleWorkspaceShell
        title={mod.name}
        description={mod.desc}
        category="bokforing"
        sectorName="Fitness & Sport"
        backHref={`/m/${sectorSlug}`}
        settingsHref={settingsHref}
        actions={<Button onClick={openNew}><Plus className="mr-2 h-4 w-4" />Nytt bidrag</Button>}
      >
        {loading ? (
          <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : (
          <Tabs defaultValue="oversikt" className="space-y-6">
            <TabsList>
              <TabsTrigger value="oversikt">Översikt</TabsTrigger>
              <TabsTrigger value="ansprak">Ansökningar</TabsTrigger>
              <TabsTrigger value="installningar">Inställningar</TabsTrigger>
            </TabsList>

            <TabsContent value="oversikt" className="space-y-6">
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
                <Card><CardHeader className="pb-2"><CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Antal ansökningar</CardTitle></CardHeader><CardContent><span className="text-2xl font-semibold tracking-tight">{stats.count}</span><span className="text-sm text-muted-foreground ml-1">st</span></CardContent></Card>
                <Card><CardHeader className="pb-2"><CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Totalt belopp</CardTitle></CardHeader><CardContent><span className="text-2xl font-semibold tracking-tight">{fmt(stats.total)}</span><span className="text-sm text-muted-foreground ml-1">kr</span></CardContent></Card>
                <Card><CardHeader className="pb-2"><CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Utbetalt</CardTitle></CardHeader><CardContent><span className="text-2xl font-semibold tracking-tight">{fmt(stats.utbetald)}</span><span className="text-sm text-muted-foreground ml-1">kr</span></CardContent></Card>
                <Card><CardHeader className="pb-2"><CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Under behandling</CardTitle></CardHeader><CardContent><span className="text-2xl font-semibold tracking-tight">{fmt(stats.pending)}</span><span className="text-sm text-muted-foreground ml-1">kr</span></CardContent></Card>
                <Card><CardHeader className="pb-2"><CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Maxbelopp (SKV)</CardTitle></CardHeader><CardContent><span className="text-2xl font-semibold tracking-tight">{fmt(maxAmount)}</span><span className="text-sm text-muted-foreground ml-1">kr/år</span></CardContent></Card>
              </div>
              {stats.overLimit > 0 && (
                <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 text-sm text-amber-800"><strong>{stats.overLimit} ansökning(ar)</strong> överstiger Skatteverkets maxbelopp på {fmt(maxAmount)} kr.</div>
              )}
            </TabsContent>

            <TabsContent value="ansprak" className="space-y-4">
              <div className="flex items-center gap-3">
                <Select value={filterStatus} onValueChange={(val) => setFilterStatus(val as ClaimStatus | 'all')}>
                  <SelectTrigger className="w-[200px]"><SelectValue placeholder="Filtrera status" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Alla statusar</SelectItem>
                    <SelectItem value="mottagen">Mottagen</SelectItem>
                    <SelectItem value="verifierad">Verifierad</SelectItem>
                    <SelectItem value="utbetald">Utbetald</SelectItem>
                    <SelectItem value="nekad">Nekad</SelectItem>
                  </SelectContent>
                </Select>
                {saving && <div className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" />Sparar...</div>}
              </div>

              {filteredClaims.length === 0 ? (
                <EmptyModuleState icon={Heart} title="Inga friskvårdsbidrag" description="Lägg till friskvårdsbidragsansökningar för att hantera kvitton och utbetalningar." actionLabel="Nytt bidrag" onAction={openNew} />
              ) : (
                <div className="rounded-xl border border-border overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/50">
                        <TableHead className="font-medium">Anställd</TableHead>
                        <TableHead className="font-medium">Arbetsgivare</TableHead>
                        <TableHead className="font-medium text-right">Belopp</TableHead>
                        <TableHead className="font-medium">Datum</TableHead>
                        <TableHead className="font-medium">Kvitto</TableHead>
                        <TableHead className="font-medium">Status</TableHead>
                        <TableHead className="font-medium text-right">Åtgärder</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredClaims.map((claim) => (
                        <TableRow key={claim.id}>
                          <TableCell className="font-medium">{claim.employee_name}</TableCell>
                          <TableCell>{claim.employer}</TableCell>
                          <TableCell className="text-right tabular-nums">
                            {fmt(claim.amount)} kr
                            {claim.amount > maxAmount && <Badge variant="secondary" className="ml-2 bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400 text-xs">Over limit</Badge>}
                          </TableCell>
                          <TableCell>{claim.date}</TableCell>
                          <TableCell><Badge variant="outline" className="text-xs">{claim.receipt_ref || '-'}</Badge></TableCell>
                          <TableCell><Badge variant="secondary" className={STATUS_COLORS[claim.status]}>{STATUS_LABELS[claim.status]}</Badge></TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-1">
                              <Button variant="ghost" size="icon" onClick={() => openEdit(claim)} title="Redigera"><Pencil className="h-4 w-4" /></Button>
                              <Button variant="ghost" size="icon" className="text-red-600 hover:text-red-700" onClick={() => openDeleteConfirmation(claim)} title="Ta bort"><Trash2 className="h-4 w-4" /></Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </TabsContent>

            <TabsContent value="installningar" className="space-y-6">
              <div className="rounded-xl border border-border bg-card p-6 max-w-md space-y-4">
                <h3 className="text-sm font-semibold">Skatteverkets maxbelopp</h3>
                <p className="text-xs text-muted-foreground">Ange maxbelopp per anställd och år för skattefritt friskvårdsbidrag. Skatteverkets gräns är 5 000 kr (2025).</p>
                <div className="flex items-end gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Maxbelopp (kr/år)</Label>
                    <Input type="number" min={0} value={maxAmountInput} onChange={(e) => setMaxAmountInput(e.target.value)} className="h-9 w-32" placeholder="5000" />
                  </div>
                  <Button size="sm" onClick={handleSaveMaxAmount} disabled={savingSettings}>
                    {savingSettings ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <Save className="mr-2 h-3.5 w-3.5" />}
                    Spara
                  </Button>
                </div>
              </div>
            </TabsContent>
          </Tabs>
        )}
      </ModuleWorkspaceShell>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{editingClaim ? 'Redigera friskvårdsbidrag' : 'Nytt friskvårdsbidrag'}</DialogTitle><DialogDescription>{editingClaim ? 'Uppdatera ansökans uppgifter.' : 'Registrera ett nytt friskvårdsbidrag.'}</DialogDescription></DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2"><Label htmlFor="wc-name">Anställd *</Label><Input id="wc-name" value={form.employee_name} onChange={(e) => setForm((f) => ({ ...f, employee_name: e.target.value }))} placeholder="Anna Svensson" /></div>
              <div className="grid gap-2"><Label htmlFor="wc-employer">Arbetsgivare *</Label><Input id="wc-employer" value={form.employer} onChange={(e) => setForm((f) => ({ ...f, employer: e.target.value }))} placeholder="TechAB" /></div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="grid gap-2"><Label htmlFor="wc-amount">Belopp (kr) *</Label><Input id="wc-amount" type="number" min={0} value={form.amount} onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))} placeholder="3000" /></div>
              <div className="grid gap-2"><Label htmlFor="wc-date">Datum *</Label><Input id="wc-date" type="date" value={form.date} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} /></div>
              <div className="grid gap-2"><Label htmlFor="wc-status">Status</Label><Select value={form.status} onValueChange={(val) => setForm((f) => ({ ...f, status: val as ClaimStatus }))}><SelectTrigger id="wc-status"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="mottagen">Mottagen</SelectItem><SelectItem value="verifierad">Verifierad</SelectItem><SelectItem value="utbetald">Utbetald</SelectItem><SelectItem value="nekad">Nekad</SelectItem></SelectContent></Select></div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2"><Label htmlFor="wc-desc">Beskrivning</Label><Input id="wc-desc" value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} placeholder="Årsmedlemskap gym" /></div>
              <div className="grid gap-2"><Label htmlFor="wc-receipt">Kvittoreferens</Label><Input id="wc-receipt" value={form.receipt_ref} onChange={(e) => setForm((f) => ({ ...f, receipt_ref: e.target.value }))} placeholder="KV-001" /></div>
            </div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setDialogOpen(false)}>Avbryt</Button><Button onClick={handleSave} disabled={!form.employee_name.trim() || !form.amount || !form.date}>{editingClaim ? 'Uppdatera' : 'Skapa'}</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Ta bort ansökan</DialogTitle><DialogDescription>Är du säker på att du vill ta bort friskvårdsbidraget för <span className="font-semibold">{claimToDelete?.employee_name}</span>? Denna åtgärd kan inte ångras.</DialogDescription></DialogHeader>
          <DialogFooter><Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>Avbryt</Button><Button variant="destructive" onClick={handleDelete}><Trash2 className="mr-2 h-4 w-4" />Ta bort</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
