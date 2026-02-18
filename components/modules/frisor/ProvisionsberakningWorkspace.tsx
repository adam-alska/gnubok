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
  Calculator,
  Users,
} from 'lucide-react'

interface ModuleWorkspaceProps {
  module: { slug: string; name: string; cat: string; desc: string; longDesc: string }
  sectorSlug: string
  settingsHref: string
}

interface Stylist {
  id: string
  name: string
  serviceRate: number
  productRate: number
  tier: 'junior' | 'senior' | 'master'
}

interface MonthlySummary {
  stylistId: string
  stylistName: string
  serviceRevenue: number
  productRevenue: number
  serviceCommission: number
  productCommission: number
  totalCommission: number
}

const TIERS: { value: Stylist['tier']; label: string; serviceDefault: number; productDefault: number }[] = [
  { value: 'junior', label: 'Junior', serviceDefault: 30, productDefault: 10 },
  { value: 'senior', label: 'Senior', serviceDefault: 40, productDefault: 15 },
  { value: 'master', label: 'Master', serviceDefault: 50, productDefault: 20 },
]

const TIER_COLORS: Record<Stylist['tier'], string> = {
  junior: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
  senior: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400',
  master: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400',
}

function fmt(n: number): string {
  return new Intl.NumberFormat('sv-SE', { maximumFractionDigits: 0 }).format(n)
}

function fmtPct(n: number): string {
  return isFinite(n) ? n.toFixed(1) : '0.0'
}

function generateId(): string {
  return Math.random().toString(36).substring(2, 11)
}

const EMPTY_STYLIST_FORM = {
  name: '',
  serviceRate: 40,
  productRate: 15,
  tier: 'senior' as Stylist['tier'],
}

const EMPTY_SUMMARY_FORM = {
  stylistId: '',
  serviceRevenue: 0,
  productRevenue: 0,
}

export function ProvisionsberakningWorkspace({ module: mod, sectorSlug, settingsHref }: ModuleWorkspaceProps) {
  const supabase = createClient()

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [stylists, setStylists] = useState<Stylist[]>([])
  const [monthlySummaries, setMonthlySummaries] = useState<MonthlySummary[]>([])
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  })

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingStylist, setEditingStylist] = useState<Stylist | null>(null)
  const [stylistForm, setStylistForm] = useState(EMPTY_STYLIST_FORM)

  const [summaryDialogOpen, setSummaryDialogOpen] = useState(false)
  const [summaryForm, setSummaryForm] = useState(EMPTY_SUMMARY_FORM)

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [stylistToDelete, setStylistToDelete] = useState<Stylist | null>(null)

  const saveData = useCallback(async (key: string, value: unknown) => {
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setSaving(false); return }

    await supabase.from('module_configs').upsert(
      {
        user_id: user.id,
        sector_slug: sectorSlug,
        module_slug: mod.slug,
        config_key: key,
        config_value: value,
      },
      { onConflict: 'user_id,sector_slug,module_slug,config_key' }
    )
    setSaving(false)
  }, [supabase, sectorSlug, mod.slug])

  const fetchData = useCallback(async () => {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); return }

    const { data: stylistData } = await supabase
      .from('module_configs')
      .select('config_value')
      .eq('user_id', user.id)
      .eq('sector_slug', sectorSlug)
      .eq('module_slug', mod.slug)
      .eq('config_key', 'stylists')
      .maybeSingle()

    if (stylistData?.config_value && Array.isArray(stylistData.config_value)) {
      setStylists(stylistData.config_value as Stylist[])
    }

    const { data: summaryData } = await supabase
      .from('module_configs')
      .select('config_value')
      .eq('user_id', user.id)
      .eq('sector_slug', sectorSlug)
      .eq('module_slug', mod.slug)
      .eq('config_key', `summaries_${selectedMonth}`)
      .maybeSingle()

    if (summaryData?.config_value && Array.isArray(summaryData.config_value)) {
      setMonthlySummaries(summaryData.config_value as MonthlySummary[])
    } else {
      setMonthlySummaries([])
    }

    setLoading(false)
  }, [supabase, sectorSlug, mod.slug, selectedMonth])

  useEffect(() => { fetchData() }, [fetchData])

  const totals = useMemo(() => {
    const totalService = monthlySummaries.reduce((s, m) => s + m.serviceCommission, 0)
    const totalProduct = monthlySummaries.reduce((s, m) => s + m.productCommission, 0)
    const totalRevenue = monthlySummaries.reduce((s, m) => s + m.serviceRevenue + m.productRevenue, 0)
    const totalCommission = totalService + totalProduct
    return { totalService, totalProduct, totalRevenue, totalCommission }
  }, [monthlySummaries])

  function openNewStylist() {
    setEditingStylist(null)
    setStylistForm({ ...EMPTY_STYLIST_FORM })
    setDialogOpen(true)
  }

  function openEditStylist(stylist: Stylist) {
    setEditingStylist(stylist)
    setStylistForm({
      name: stylist.name,
      serviceRate: stylist.serviceRate,
      productRate: stylist.productRate,
      tier: stylist.tier,
    })
    setDialogOpen(true)
  }

  async function handleSaveStylist() {
    const newStylist: Stylist = {
      id: editingStylist?.id ?? generateId(),
      name: stylistForm.name.trim(),
      serviceRate: stylistForm.serviceRate,
      productRate: stylistForm.productRate,
      tier: stylistForm.tier,
    }

    let updated: Stylist[]
    if (editingStylist) {
      updated = stylists.map((s) => s.id === editingStylist.id ? newStylist : s)
    } else {
      updated = [...stylists, newStylist]
    }

    setStylists(updated)
    setDialogOpen(false)
    await saveData('stylists', updated)
  }

  function openDeleteConfirmation(stylist: Stylist) {
    setStylistToDelete(stylist)
    setDeleteDialogOpen(true)
  }

  async function handleDeleteStylist() {
    if (!stylistToDelete) return
    const updated = stylists.filter((s) => s.id !== stylistToDelete.id)
    setStylists(updated)
    setDeleteDialogOpen(false)
    setStylistToDelete(null)
    await saveData('stylists', updated)
  }

  function openAddSummary() {
    setSummaryForm({ ...EMPTY_SUMMARY_FORM, stylistId: stylists[0]?.id ?? '' })
    setSummaryDialogOpen(true)
  }

  async function handleSaveSummary() {
    const stylist = stylists.find((s) => s.id === summaryForm.stylistId)
    if (!stylist) return

    const serviceCommission = summaryForm.serviceRevenue * (stylist.serviceRate / 100)
    const productCommission = summaryForm.productRevenue * (stylist.productRate / 100)

    const newSummary: MonthlySummary = {
      stylistId: stylist.id,
      stylistName: stylist.name,
      serviceRevenue: summaryForm.serviceRevenue,
      productRevenue: summaryForm.productRevenue,
      serviceCommission,
      productCommission,
      totalCommission: serviceCommission + productCommission,
    }

    const existing = monthlySummaries.filter((s) => s.stylistId !== stylist.id)
    const updated = [...existing, newSummary]
    setMonthlySummaries(updated)
    setSummaryDialogOpen(false)
    await saveData(`summaries_${selectedMonth}`, updated)
  }

  return (
    <>
      <ModuleWorkspaceShell
        title={mod.name}
        description={mod.desc}
        category="bokforing"
        sectorName="Frisör & Skönhet"
        backHref={`/m/${sectorSlug}`}
        settingsHref={settingsHref}
        actions={
          <div className="flex items-center gap-2">
            <Input
              type="month"
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="h-9 w-44"
            />
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
              <TabsTrigger value="oversikt">Månadsöversikt</TabsTrigger>
              <TabsTrigger value="stylister">Stylister</TabsTrigger>
              <TabsTrigger value="registrera">Registrera intäkter</TabsTrigger>
            </TabsList>

            <TabsContent value="oversikt" className="space-y-6">
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <KPICard label="Total provision" value={fmt(totals.totalCommission)} unit="kr" />
                <KPICard label="Serviceprovision" value={fmt(totals.totalService)} unit="kr" />
                <KPICard label="Produktprovision" value={fmt(totals.totalProduct)} unit="kr" />
                <KPICard
                  label="Provision / Intäkt"
                  value={totals.totalRevenue > 0 ? fmtPct((totals.totalCommission / totals.totalRevenue) * 100) : '0.0'}
                  unit="%"
                />
              </div>

              {monthlySummaries.length === 0 ? (
                <EmptyModuleState
                  icon={Calculator}
                  title="Ingen provisionsdata"
                  description="Registrera intäkter per stylist för att beräkna provision. Kontobokföring sker på konto 7010 (löner) och 7210 (provisioner)."
                  actionLabel="Registrera intäkter"
                  onAction={openAddSummary}
                />
              ) : (
                <div className="rounded-xl border border-border overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/50">
                        <TableHead className="font-medium">Stylist</TableHead>
                        <TableHead className="font-medium text-right">Serviceintäkt</TableHead>
                        <TableHead className="font-medium text-right">Produktintäkt</TableHead>
                        <TableHead className="font-medium text-right">Serviceprov.</TableHead>
                        <TableHead className="font-medium text-right">Produktprov.</TableHead>
                        <TableHead className="font-medium text-right">Total provision</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {monthlySummaries.map((s) => (
                        <TableRow key={s.stylistId}>
                          <TableCell className="font-medium">{s.stylistName}</TableCell>
                          <TableCell className="text-right tabular-nums">{fmt(s.serviceRevenue)} kr</TableCell>
                          <TableCell className="text-right tabular-nums">{fmt(s.productRevenue)} kr</TableCell>
                          <TableCell className="text-right tabular-nums">{fmt(s.serviceCommission)} kr</TableCell>
                          <TableCell className="text-right tabular-nums">{fmt(s.productCommission)} kr</TableCell>
                          <TableCell className="text-right tabular-nums font-semibold">{fmt(s.totalCommission)} kr</TableCell>
                        </TableRow>
                      ))}
                      <TableRow className="bg-muted/30 font-semibold">
                        <TableCell>Totalt</TableCell>
                        <TableCell className="text-right tabular-nums">{fmt(monthlySummaries.reduce((s, m) => s + m.serviceRevenue, 0))} kr</TableCell>
                        <TableCell className="text-right tabular-nums">{fmt(monthlySummaries.reduce((s, m) => s + m.productRevenue, 0))} kr</TableCell>
                        <TableCell className="text-right tabular-nums">{fmt(totals.totalService)} kr</TableCell>
                        <TableCell className="text-right tabular-nums">{fmt(totals.totalProduct)} kr</TableCell>
                        <TableCell className="text-right tabular-nums">{fmt(totals.totalCommission)} kr</TableCell>
                      </TableRow>
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

            <TabsContent value="stylister" className="space-y-6">
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">
                  Hantera stylister och deras provisionsnivåer. Konto 7010 för löner, 7210 för provisioner.
                </p>
                <Button onClick={openNewStylist}>
                  <Plus className="mr-2 h-4 w-4" />
                  Ny stylist
                </Button>
              </div>

              {stylists.length === 0 ? (
                <EmptyModuleState
                  icon={Users}
                  title="Inga stylister"
                  description="Lägg till stylister för att kunna beräkna provision."
                  actionLabel="Ny stylist"
                  onAction={openNewStylist}
                />
              ) : (
                <div className="rounded-xl border border-border overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/50">
                        <TableHead className="font-medium">Namn</TableHead>
                        <TableHead className="font-medium">Nivå</TableHead>
                        <TableHead className="font-medium text-right">Service %</TableHead>
                        <TableHead className="font-medium text-right">Produkt %</TableHead>
                        <TableHead className="font-medium text-right">Åtgärder</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {stylists.map((stylist) => (
                        <TableRow key={stylist.id}>
                          <TableCell className="font-medium">{stylist.name}</TableCell>
                          <TableCell>
                            <Badge variant="secondary" className={TIER_COLORS[stylist.tier]}>
                              {TIERS.find((t) => t.value === stylist.tier)?.label}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right tabular-nums">{stylist.serviceRate}%</TableCell>
                          <TableCell className="text-right tabular-nums">{stylist.productRate}%</TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-1">
                              <Button variant="ghost" size="icon" onClick={() => openEditStylist(stylist)} title="Redigera">
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <Button variant="ghost" size="icon" className="text-red-600 hover:text-red-700" onClick={() => openDeleteConfirmation(stylist)} title="Ta bort">
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
            </TabsContent>

            <TabsContent value="registrera" className="space-y-6">
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">
                  Registrera intäkter per stylist för {selectedMonth}. Provisionen beräknas automatiskt.
                </p>
                <Button onClick={openAddSummary} disabled={stylists.length === 0}>
                  <Plus className="mr-2 h-4 w-4" />
                  Registrera intäkter
                </Button>
              </div>

              {stylists.length === 0 ? (
                <EmptyModuleState
                  icon={Users}
                  title="Lägg till stylister först"
                  description="Du behöver lägga till stylister innan du kan registrera intäkter."
                />
              ) : monthlySummaries.length === 0 ? (
                <EmptyModuleState
                  icon={Calculator}
                  title="Inga intäkter registrerade"
                  description={`Registrera intäkter per stylist för ${selectedMonth}.`}
                  actionLabel="Registrera intäkter"
                  onAction={openAddSummary}
                />
              ) : (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {monthlySummaries.map((s) => {
                    const stylist = stylists.find((st) => st.id === s.stylistId)
                    return (
                      <Card key={s.stylistId}>
                        <CardHeader className="pb-2">
                          <div className="flex items-center justify-between">
                            <CardTitle className="text-sm font-medium">{s.stylistName}</CardTitle>
                            {stylist && (
                              <Badge variant="secondary" className={TIER_COLORS[stylist.tier]}>
                                {TIERS.find((t) => t.value === stylist.tier)?.label}
                              </Badge>
                            )}
                          </div>
                        </CardHeader>
                        <CardContent className="space-y-2 text-sm">
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Serviceintäkt</span>
                            <span className="tabular-nums">{fmt(s.serviceRevenue)} kr</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Produktintäkt</span>
                            <span className="tabular-nums">{fmt(s.productRevenue)} kr</span>
                          </div>
                          <div className="border-t border-border pt-2 flex justify-between font-semibold">
                            <span>Total provision</span>
                            <span className="tabular-nums">{fmt(s.totalCommission)} kr</span>
                          </div>
                        </CardContent>
                      </Card>
                    )
                  })}
                </div>
              )}
            </TabsContent>
          </Tabs>
        )}
      </ModuleWorkspaceShell>

      {/* Stylist dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingStylist ? 'Redigera stylist' : 'Ny stylist'}</DialogTitle>
            <DialogDescription>
              {editingStylist ? 'Uppdatera stylistens uppgifter och provisionsnivåer.' : 'Lägg till en ny stylist med provisionsnivåer.'}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-2">
              <Label htmlFor="stylist-name">Namn *</Label>
              <Input
                id="stylist-name"
                value={stylistForm.name}
                onChange={(e) => setStylistForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="Anna Andersson"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="stylist-tier">Nivå</Label>
              <Select
                value={stylistForm.tier}
                onValueChange={(val) => {
                  const tier = TIERS.find((t) => t.value === val)
                  setStylistForm((f) => ({
                    ...f,
                    tier: val as Stylist['tier'],
                    serviceRate: tier?.serviceDefault ?? f.serviceRate,
                    productRate: tier?.productDefault ?? f.productRate,
                  }))
                }}
              >
                <SelectTrigger id="stylist-tier">
                  <SelectValue placeholder="Välj nivå" />
                </SelectTrigger>
                <SelectContent>
                  {TIERS.map((t) => (
                    <SelectItem key={t.value} value={t.value}>{t.label} (Service {t.serviceDefault}%, Produkt {t.productDefault}%)</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="service-rate">Serviceprovision %</Label>
                <Input
                  id="service-rate"
                  type="number"
                  min={0}
                  max={100}
                  value={stylistForm.serviceRate}
                  onChange={(e) => setStylistForm((f) => ({ ...f, serviceRate: Number(e.target.value) }))}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="product-rate">Produktprovision %</Label>
                <Input
                  id="product-rate"
                  type="number"
                  min={0}
                  max={100}
                  value={stylistForm.productRate}
                  onChange={(e) => setStylistForm((f) => ({ ...f, productRate: Number(e.target.value) }))}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Avbryt</Button>
            <Button onClick={handleSaveStylist} disabled={!stylistForm.name.trim()}>
              {editingStylist ? 'Uppdatera' : 'Lägg till'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Summary dialog */}
      <Dialog open={summaryDialogOpen} onOpenChange={setSummaryDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Registrera intäkter</DialogTitle>
            <DialogDescription>Ange intäkter per stylist för {selectedMonth}. Provisionen beräknas automatiskt.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-2">
              <Label htmlFor="summary-stylist">Stylist *</Label>
              <Select
                value={summaryForm.stylistId}
                onValueChange={(val) => setSummaryForm((f) => ({ ...f, stylistId: val }))}
              >
                <SelectTrigger id="summary-stylist">
                  <SelectValue placeholder="Välj stylist" />
                </SelectTrigger>
                <SelectContent>
                  {stylists.map((s) => (
                    <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="service-rev">Serviceintäkt (kr)</Label>
                <Input
                  id="service-rev"
                  type="number"
                  min={0}
                  value={summaryForm.serviceRevenue}
                  onChange={(e) => setSummaryForm((f) => ({ ...f, serviceRevenue: Number(e.target.value) }))}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="product-rev">Produktintäkt (kr)</Label>
                <Input
                  id="product-rev"
                  type="number"
                  min={0}
                  value={summaryForm.productRevenue}
                  onChange={(e) => setSummaryForm((f) => ({ ...f, productRevenue: Number(e.target.value) }))}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSummaryDialogOpen(false)}>Avbryt</Button>
            <Button onClick={handleSaveSummary} disabled={!summaryForm.stylistId}>Beräkna & Spara</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Ta bort stylist</DialogTitle>
            <DialogDescription>
              Är du säker på att du vill ta bort {stylistToDelete?.name}? Denna åtgärd kan inte ångras.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>Avbryt</Button>
            <Button variant="destructive" onClick={handleDeleteStylist}>
              <Trash2 className="mr-2 h-4 w-4" />
              Ta bort
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
