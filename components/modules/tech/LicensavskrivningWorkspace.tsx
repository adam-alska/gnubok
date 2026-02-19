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
  FileKey,
} from 'lucide-react'

interface ModuleWorkspaceProps {
  module: { slug: string; name: string; cat: string; desc: string; longDesc: string }
  sectorSlug: string
  settingsHref: string
}

type DepreciationMethod = 'linear' | 'declining'
type AssetType = 'Mjukvara' | 'Licens' | 'Patent' | 'IP'

interface Asset {
  id: string
  name: string
  assetType: AssetType
  accountNumber: string
  purchaseDate: string
  purchaseValue: number
  usefulLifeYears: number
  method: DepreciationMethod
  decliningRate: number // only for declining balance
  residualValue: number
}

const ASSET_TYPES: AssetType[] = ['Mjukvara', 'Licens', 'Patent', 'IP']

const DEFAULT_ASSETS: Asset[] = [
  {
    id: '1', name: 'ERP-system licens', assetType: 'Licens', accountNumber: '1020',
    purchaseDate: '2024-01-15', purchaseValue: 240000, usefulLifeYears: 5,
    method: 'linear', decliningRate: 30, residualValue: 0,
  },
  {
    id: '2', name: 'Egenutvecklad plattform', assetType: 'Mjukvara', accountNumber: '1010',
    purchaseDate: '2023-06-01', purchaseValue: 500000, usefulLifeYears: 5,
    method: 'linear', decliningRate: 30, residualValue: 0,
  },
  {
    id: '3', name: 'Patent sökmotorteknik', assetType: 'Patent', accountNumber: '1020',
    purchaseDate: '2024-03-01', purchaseValue: 150000, usefulLifeYears: 10,
    method: 'declining', decliningRate: 20, residualValue: 10000,
  },
]

function fmt(n: number): string {
  return new Intl.NumberFormat('sv-SE', { maximumFractionDigits: 0 }).format(n)
}

function yearsBetween(dateStr: string): number {
  const d = new Date(dateStr)
  const now = new Date()
  return Math.max(0, (now.getTime() - d.getTime()) / (365.25 * 24 * 60 * 60 * 1000))
}

function calcDepreciation(asset: Asset) {
  const yearsElapsed = yearsBetween(asset.purchaseDate)
  const depreciableAmount = asset.purchaseValue - asset.residualValue
  let accumulatedDepreciation = 0
  let currentYearDepreciation = 0
  let bookValue = asset.purchaseValue

  if (asset.method === 'linear') {
    const annual = depreciableAmount / asset.usefulLifeYears
    const fullYears = Math.min(Math.floor(yearsElapsed), asset.usefulLifeYears)
    accumulatedDepreciation = annual * fullYears
    currentYearDepreciation = fullYears < asset.usefulLifeYears ? annual : 0
    bookValue = Math.max(asset.residualValue, asset.purchaseValue - accumulatedDepreciation)
  } else {
    // Declining balance
    let remaining = asset.purchaseValue
    const rate = asset.decliningRate / 100
    const fullYears = Math.min(Math.floor(yearsElapsed), asset.usefulLifeYears)
    for (let y = 0; y < fullYears; y++) {
      const dep = remaining * rate
      if (remaining - dep < asset.residualValue) {
        accumulatedDepreciation += remaining - asset.residualValue
        remaining = asset.residualValue
        break
      }
      accumulatedDepreciation += dep
      remaining -= dep
    }
    bookValue = Math.max(asset.residualValue, remaining)
    currentYearDepreciation = fullYears < asset.usefulLifeYears ? bookValue * rate : 0
  }

  return { accumulatedDepreciation, currentYearDepreciation, bookValue }
}

const EMPTY_FORM: Omit<Asset, 'id'> = {
  name: '',
  assetType: 'Mjukvara',
  accountNumber: '1010',
  purchaseDate: new Date().toISOString().slice(0, 10),
  purchaseValue: 0,
  usefulLifeYears: 5,
  method: 'linear',
  decliningRate: 30,
  residualValue: 0,
}

export function LicensavskrivningWorkspace({ module: mod, sectorSlug, settingsHref }: ModuleWorkspaceProps) {
  const supabase = createClient()

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [assets, setAssets] = useState<Asset[]>([])

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<Asset | null>(null)
  const [form, setForm] = useState(EMPTY_FORM)

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [toDelete, setToDelete] = useState<Asset | null>(null)

  const saveData = useCallback(async (data: Asset[]) => {
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setSaving(false); return }

    await supabase.from('module_configs').upsert(
      {
        user_id: user.id,
        sector_slug: sectorSlug,
        module_slug: mod.slug,
        config_key: 'assets',
        config_value: data,
      },
      { onConflict: 'user_id,sector_slug,module_slug,config_key' }
    )
    setSaving(false)
  }, [supabase, sectorSlug, mod.slug])

  const fetchData = useCallback(async () => {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); return }

    const { data } = await supabase
      .from('module_configs')
      .select('config_value')
      .eq('user_id', user.id)
      .eq('sector_slug', sectorSlug)
      .eq('module_slug', mod.slug)
      .eq('config_key', 'assets')
      .maybeSingle()

    if (data?.config_value && Array.isArray(data.config_value) && data.config_value.length > 0) {
      setAssets(data.config_value as Asset[])
    } else {
      setAssets(DEFAULT_ASSETS)
      await supabase.from('module_configs').upsert(
        {
          user_id: user.id,
          sector_slug: sectorSlug,
          module_slug: mod.slug,
          config_key: 'assets',
          config_value: DEFAULT_ASSETS,
        },
        { onConflict: 'user_id,sector_slug,module_slug,config_key' }
      )
    }
    setLoading(false)
  }, [supabase, sectorSlug, mod.slug])

  useEffect(() => { fetchData() }, [fetchData])

  const assetCalcs = useMemo(() => {
    return assets.map((a) => ({ ...a, ...calcDepreciation(a) }))
  }, [assets])

  const totals = useMemo(() => {
    const totalPurchaseValue = assetCalcs.reduce((s, a) => s + a.purchaseValue, 0)
    const totalBookValue = assetCalcs.reduce((s, a) => s + a.bookValue, 0)
    const totalAccumulated = assetCalcs.reduce((s, a) => s + a.accumulatedDepreciation, 0)
    const totalYearlyDep = assetCalcs.reduce((s, a) => s + a.currentYearDepreciation, 0)
    return { totalPurchaseValue, totalBookValue, totalAccumulated, totalYearlyDep }
  }, [assetCalcs])

  // Depreciation plan for each asset
  function getDepreciationPlan(asset: Asset) {
    const plan: { year: number; opening: number; depreciation: number; closing: number }[] = []
    let remaining = asset.purchaseValue
    const depreciableAmount = asset.purchaseValue - asset.residualValue

    for (let y = 1; y <= asset.usefulLifeYears; y++) {
      const opening = remaining
      let dep: number
      if (asset.method === 'linear') {
        dep = depreciableAmount / asset.usefulLifeYears
      } else {
        dep = remaining * (asset.decliningRate / 100)
      }
      if (remaining - dep < asset.residualValue) {
        dep = remaining - asset.residualValue
      }
      remaining = Math.max(asset.residualValue, remaining - dep)
      plan.push({
        year: new Date(asset.purchaseDate).getFullYear() + y - 1,
        opening,
        depreciation: dep,
        closing: remaining,
      })
      if (remaining <= asset.residualValue) break
    }
    return plan
  }

  function openNew() {
    setEditing(null)
    setForm({ ...EMPTY_FORM })
    setDialogOpen(true)
  }

  function openEdit(asset: Asset) {
    setEditing(asset)
    setForm({
      name: asset.name,
      assetType: asset.assetType,
      accountNumber: asset.accountNumber,
      purchaseDate: asset.purchaseDate,
      purchaseValue: asset.purchaseValue,
      usefulLifeYears: asset.usefulLifeYears,
      method: asset.method,
      decliningRate: asset.decliningRate,
      residualValue: asset.residualValue,
    })
    setDialogOpen(true)
  }

  async function handleSave() {
    const item: Asset = {
      id: editing?.id ?? crypto.randomUUID(),
      ...form,
      name: form.name.trim(),
    }

    let updated: Asset[]
    if (editing) {
      updated = assets.map((a) => (a.id === editing.id ? item : a))
    } else {
      updated = [...assets, item]
    }

    setAssets(updated)
    setDialogOpen(false)
    await saveData(updated)
  }

  async function handleDelete() {
    if (!toDelete) return
    const updated = assets.filter((a) => a.id !== toDelete.id)
    setAssets(updated)
    setDeleteDialogOpen(false)
    setToDelete(null)
    await saveData(updated)
  }

  return (
    <>
      <ModuleWorkspaceShell
        title={mod.name}
        description={mod.desc}
        category="bokforing"
        sectorName="Tech & IT"
        backHref={`/m/${sectorSlug}`}
        settingsHref={settingsHref}
        actions={
          <Button onClick={openNew}>
            <Plus className="mr-2 h-4 w-4" />
            Ny tillgång
          </Button>
        }
      >
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <Tabs defaultValue="register" className="space-y-6">
            <TabsList>
              <TabsTrigger value="register">Tillgångsregister</TabsTrigger>
              <TabsTrigger value="plan">Avskrivningsplan</TabsTrigger>
            </TabsList>

            <TabsContent value="register" className="space-y-6">
              {/* KPI summary */}
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <KPICard label="Anskaffningsvärde" value={fmt(totals.totalPurchaseValue)} unit="kr" />
                <KPICard label="Bokvärde" value={fmt(totals.totalBookValue)} unit="kr" />
                <KPICard label="Ackumulerad avskrivning" value={fmt(totals.totalAccumulated)} unit="kr" />
                <KPICard label="Årets avskrivning" value={fmt(totals.totalYearlyDep)} unit="kr" />
              </div>

              {assets.length === 0 ? (
                <EmptyModuleState
                  icon={FileKey}
                  title="Inga tillgångar"
                  description="Lägg till mjukvarulicenser eller immateriella tillgångar för att börja med avskrivning."
                  actionLabel="Ny tillgång"
                  onAction={openNew}
                />
              ) : (
                <div className="rounded-xl border border-border overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/50">
                        <TableHead className="font-medium">Namn</TableHead>
                        <TableHead className="font-medium">Typ</TableHead>
                        <TableHead className="font-medium">Konto</TableHead>
                        <TableHead className="font-medium">Metod</TableHead>
                        <TableHead className="font-medium text-right">Anskaffning</TableHead>
                        <TableHead className="font-medium text-right">Bokvärde</TableHead>
                        <TableHead className="font-medium text-right">Ack. avskr.</TableHead>
                        <TableHead className="font-medium text-right">Åtgärder</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {assetCalcs.map((a) => (
                        <TableRow key={a.id}>
                          <TableCell className="font-medium">{a.name}</TableCell>
                          <TableCell><Badge variant="outline">{a.assetType}</Badge></TableCell>
                          <TableCell className="font-mono">{a.accountNumber}</TableCell>
                          <TableCell>
                            <Badge variant="secondary">
                              {a.method === 'linear' ? 'Linear' : `Degr. ${a.decliningRate}%`}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right tabular-nums">{fmt(a.purchaseValue)}</TableCell>
                          <TableCell className="text-right tabular-nums">{fmt(a.bookValue)}</TableCell>
                          <TableCell className="text-right tabular-nums">{fmt(a.accumulatedDepreciation)}</TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-1">
                              <Button variant="ghost" size="icon" onClick={() => openEdit(a)} title="Redigera">
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <Button variant="ghost" size="icon" className="text-red-600 hover:text-red-700" onClick={() => { setToDelete(a); setDeleteDialogOpen(true) }} title="Ta bort">
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

            <TabsContent value="plan" className="space-y-6">
              {assets.map((asset) => {
                const plan = getDepreciationPlan(asset)
                return (
                  <div key={asset.id} className="space-y-2">
                    <h3 className="text-sm font-semibold">{asset.name} ({asset.method === 'linear' ? 'Linear' : 'Degressiv'})</h3>
                    <div className="rounded-xl border border-border overflow-hidden">
                      <Table>
                        <TableHeader>
                          <TableRow className="bg-muted/50">
                            <TableHead className="font-medium">År</TableHead>
                            <TableHead className="font-medium text-right">IB</TableHead>
                            <TableHead className="font-medium text-right">Avskrivning</TableHead>
                            <TableHead className="font-medium text-right">UB</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {plan.map((row) => (
                            <TableRow key={row.year}>
                              <TableCell className="tabular-nums">{row.year}</TableCell>
                              <TableCell className="text-right tabular-nums">{fmt(row.opening)}</TableCell>
                              <TableCell className="text-right tabular-nums">{fmt(row.depreciation)}</TableCell>
                              <TableCell className="text-right tabular-nums">{fmt(row.closing)}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </div>
                )
              })}
            </TabsContent>
          </Tabs>
        )}
      </ModuleWorkspaceShell>

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? 'Redigera tillgång' : 'Ny tillgång'}</DialogTitle>
            <DialogDescription>
              {editing ? 'Uppdatera tillgångens uppgifter.' : 'Fyll i uppgifter för den nya tillgången.'}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Namn *</Label>
                <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="ERP-system licens" />
              </div>
              <div className="grid gap-2">
                <Label>Typ</Label>
                <Select value={form.assetType} onValueChange={(v) => setForm((f) => ({ ...f, assetType: v as AssetType }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {ASSET_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="grid gap-2">
                <Label>Konto</Label>
                <Select value={form.accountNumber} onValueChange={(v) => setForm((f) => ({ ...f, accountNumber: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1010">1010 - Egenutvecklad</SelectItem>
                    <SelectItem value="1020">1020 - Förvärv</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label>Inköpsdatum</Label>
                <Input type="date" value={form.purchaseDate} onChange={(e) => setForm((f) => ({ ...f, purchaseDate: e.target.value }))} />
              </div>
              <div className="grid gap-2">
                <Label>Nyttjandeperiod (år)</Label>
                <Input type="number" min={1} max={30} value={form.usefulLifeYears} onChange={(e) => setForm((f) => ({ ...f, usefulLifeYears: Number(e.target.value) }))} />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="grid gap-2">
                <Label>Anskaffningsvärde (kr)</Label>
                <Input type="number" min={0} value={form.purchaseValue} onChange={(e) => setForm((f) => ({ ...f, purchaseValue: Number(e.target.value) }))} />
              </div>
              <div className="grid gap-2">
                <Label>Restvärde (kr)</Label>
                <Input type="number" min={0} value={form.residualValue} onChange={(e) => setForm((f) => ({ ...f, residualValue: Number(e.target.value) }))} />
              </div>
              <div className="grid gap-2">
                <Label>Metod</Label>
                <Select value={form.method} onValueChange={(v) => setForm((f) => ({ ...f, method: v as DepreciationMethod }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="linear">Linear</SelectItem>
                    <SelectItem value="declining">Degressiv</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            {form.method === 'declining' && (
              <div className="grid gap-2 max-w-[200px]">
                <Label>Degressiv sats (%)</Label>
                <Input type="number" min={1} max={100} value={form.decliningRate} onChange={(e) => setForm((f) => ({ ...f, decliningRate: Number(e.target.value) }))} />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Avbryt</Button>
            <Button onClick={handleSave} disabled={!form.name.trim()}>
              {editing ? 'Uppdatera' : 'Lägg till'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Ta bort tillgång</DialogTitle>
            <DialogDescription>
              Är du säker på att du vill ta bort &quot;{toDelete?.name}&quot;? Denna åtgärd kan inte ångras.
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
