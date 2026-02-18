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
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { Plus, Pencil, Trash2, Loader2, BarChart3, Save } from 'lucide-react'
import { cn } from '@/lib/utils'

interface ModuleWorkspaceProps {
  module: { slug: string; name: string; cat: string; desc: string; longDesc: string }
  sectorSlug: string
  settingsHref: string
}

interface ProductGroupMargin {
  id: string
  group: string
  purchasePrice: number
  sellingPrice: number
  grossMargin: number
  grossMarginPct: number
  campaignSellingPrice: number | null
  campaignMarginPct: number | null
  period: string
}

const PRODUCT_GROUPS = ['Livsmedel', 'Dryck', 'Frukt & Gront', 'Mejeri', 'Kott & Chark', 'Non-food', 'Brod & Bageri', 'Godis & Snacks', 'Ovrigt']

function generateId(): string {
  return crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`
}

function fmt(n: number): string {
  return new Intl.NumberFormat('sv-SE', { maximumFractionDigits: 0 }).format(n)
}

function fmtPct(n: number): string {
  return isFinite(n) ? n.toFixed(1) : '0.0'
}

function startOfMonth(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}

function todayStr(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const EMPTY_FORM = {
  group: 'Livsmedel',
  purchasePrice: 0,
  sellingPrice: 0,
  campaignSellingPrice: '' as string | number,
  period: '',
}

export function BruttomarginalPerVarugruppWorkspace({ module: mod, sectorSlug, settingsHref }: ModuleWorkspaceProps) {
  const supabase = createClient()

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [data, setData] = useState<ProductGroupMargin[]>([])

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingItem, setEditingItem] = useState<ProductGroupMargin | null>(null)
  const [form, setForm] = useState(EMPTY_FORM)

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [itemToDelete, setItemToDelete] = useState<ProductGroupMargin | null>(null)

  const saveData = useCallback(async (newData: ProductGroupMargin[]) => {
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setSaving(false); return }
    await supabase.from('module_configs').upsert(
      { user_id: user.id, sector_slug: sectorSlug, module_slug: mod.slug, config_key: 'margin_data', config_value: newData },
      { onConflict: 'user_id,sector_slug,module_slug,config_key' }
    )
    setSaving(false)
  }, [supabase, sectorSlug, mod.slug])

  const fetchData = useCallback(async () => {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); return }
    const { data: d } = await supabase
      .from('module_configs').select('config_value')
      .eq('user_id', user.id).eq('sector_slug', sectorSlug).eq('module_slug', mod.slug).eq('config_key', 'margin_data')
      .maybeSingle()
    if (d?.config_value && Array.isArray(d.config_value)) setData(d.config_value as ProductGroupMargin[])
    setLoading(false)
  }, [supabase, sectorSlug, mod.slug])

  useEffect(() => { fetchData() }, [fetchData])

  const avgMargin = useMemo(() => {
    if (data.length === 0) return 0
    return data.reduce((s, d) => s + d.grossMarginPct, 0) / data.length
  }, [data])

  const totalRevenue = useMemo(() => data.reduce((s, d) => s + d.sellingPrice, 0), [data])
  const totalCost = useMemo(() => data.reduce((s, d) => s + d.purchasePrice, 0), [data])
  const bestGroup = useMemo(() => {
    if (data.length === 0) return '-'
    return data.reduce((best, d) => d.grossMarginPct > best.grossMarginPct ? d : best).group
  }, [data])

  function openNewItem() {
    setEditingItem(null)
    setForm({ ...EMPTY_FORM, period: `${startOfMonth()} - ${todayStr()}` })
    setDialogOpen(true)
  }

  function openEditItem(item: ProductGroupMargin) {
    setEditingItem(item)
    setForm({
      group: item.group,
      purchasePrice: item.purchasePrice,
      sellingPrice: item.sellingPrice,
      campaignSellingPrice: item.campaignSellingPrice ?? '',
      period: item.period,
    })
    setDialogOpen(true)
  }

  async function handleSaveItem() {
    const purchasePrice = form.purchasePrice
    const sellingPrice = form.sellingPrice
    const grossMargin = sellingPrice - purchasePrice
    const grossMarginPct = sellingPrice > 0 ? (grossMargin / sellingPrice) * 100 : 0
    const campPrice = typeof form.campaignSellingPrice === 'number' && form.campaignSellingPrice > 0 ? form.campaignSellingPrice : null
    const campMarginPct = campPrice && campPrice > 0 ? ((campPrice - purchasePrice) / campPrice) * 100 : null

    const item: ProductGroupMargin = {
      id: editingItem?.id ?? generateId(),
      group: form.group,
      purchasePrice,
      sellingPrice,
      grossMargin,
      grossMarginPct,
      campaignSellingPrice: campPrice,
      campaignMarginPct: campMarginPct,
      period: form.period,
    }

    let updated: ProductGroupMargin[]
    if (editingItem) {
      updated = data.map(d => d.id === editingItem.id ? item : d)
    } else {
      updated = [...data, item]
    }
    setData(updated)
    setDialogOpen(false)
    await saveData(updated)
  }

  async function handleDeleteItem() {
    if (!itemToDelete) return
    const updated = data.filter(d => d.id !== itemToDelete.id)
    setData(updated)
    setDeleteDialogOpen(false)
    setItemToDelete(null)
    await saveData(updated)
  }

  return (
    <>
      <ModuleWorkspaceShell
        title={mod.name}
        description={mod.desc}
        category="rapport"
        sectorName="Detaljhandel"
        backHref={`/m/${sectorSlug}`}
        settingsHref={settingsHref}
        actions={
          <Button onClick={openNewItem}>
            <Plus className="mr-2 h-4 w-4" />Ny varugrupp
          </Button>
        }
      >
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <KPICard label="Snittmarginal" value={fmtPct(avgMargin)} unit="%" trend={avgMargin >= 25 ? 'up' : avgMargin >= 15 ? 'neutral' : 'down'} trendLabel={avgMargin >= 25 ? 'Bra' : avgMargin >= 15 ? 'OK' : 'Lag'} />
              <KPICard label="Total forsaljning" value={fmt(totalRevenue)} unit="kr" />
              <KPICard label="Total inkopskostnad" value={fmt(totalCost)} unit="kr" />
              <KPICard label="Basta varugrupp" value={bestGroup} />
            </div>

            {data.length === 0 ? (
              <EmptyModuleState icon={BarChart3} title="Inga varugrupper" description="Lagg till varugrupper for att se bruttomarginal per kategori." actionLabel="Ny varugrupp" onAction={openNewItem} />
            ) : (
              <div className="rounded-xl border border-border overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead className="font-medium">Varugrupp</TableHead>
                      <TableHead className="font-medium text-right">Inkop (kr)</TableHead>
                      <TableHead className="font-medium text-right">Forsaljning (kr)</TableHead>
                      <TableHead className="font-medium text-right">Bruttomarginal</TableHead>
                      <TableHead className="font-medium text-right">Marginal %</TableHead>
                      <TableHead className="font-medium text-right">Kampanjpris</TableHead>
                      <TableHead className="font-medium text-right">Kampanjmarginal</TableHead>
                      <TableHead className="font-medium">Period</TableHead>
                      <TableHead className="font-medium text-right">Atgarder</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.sort((a, b) => b.grossMarginPct - a.grossMarginPct).map((item) => (
                      <TableRow key={item.id}>
                        <TableCell className="font-medium">{item.group}</TableCell>
                        <TableCell className="text-right tabular-nums">{fmt(item.purchasePrice)}</TableCell>
                        <TableCell className="text-right tabular-nums">{fmt(item.sellingPrice)}</TableCell>
                        <TableCell className="text-right tabular-nums">{fmt(item.grossMargin)}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          <span className={cn('font-medium', item.grossMarginPct >= 25 ? 'text-emerald-600' : item.grossMarginPct >= 15 ? 'text-amber-600' : 'text-red-600')}>
                            {fmtPct(item.grossMarginPct)}%
                          </span>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{item.campaignSellingPrice != null ? `${fmt(item.campaignSellingPrice)} kr` : '-'}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {item.campaignMarginPct != null ? (
                            <span className={cn('font-medium', item.campaignMarginPct >= 15 ? 'text-emerald-600' : 'text-red-600')}>
                              {fmtPct(item.campaignMarginPct)}%
                            </span>
                          ) : '-'}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">{item.period}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button variant="ghost" size="icon" onClick={() => openEditItem(item)}><Pencil className="h-4 w-4" /></Button>
                            <Button variant="ghost" size="icon" className="text-red-600 hover:text-red-700" onClick={() => { setItemToDelete(item); setDeleteDialogOpen(true) }}><Trash2 className="h-4 w-4" /></Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}

            {saving && <div className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" />Sparar...</div>}
          </div>
        )}
      </ModuleWorkspaceShell>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingItem ? 'Redigera varugrupp' : 'Ny varugrupp'}</DialogTitle>
            <DialogDescription>{editingItem ? 'Uppdatera marginaldata.' : 'Ange inkops- och forsaljningspris for varugruppen.'}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-2">
              <Label>Varugrupp *</Label>
              <Select value={form.group} onValueChange={(val) => setForm(f => ({ ...f, group: val }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{PRODUCT_GROUPS.map(g => <SelectItem key={g} value={g}>{g}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Inkopspris (kr) *</Label>
                <Input type="number" min={0} step="0.01" value={form.purchasePrice} onChange={(e) => setForm(f => ({ ...f, purchasePrice: Number(e.target.value) || 0 }))} />
              </div>
              <div className="grid gap-2">
                <Label>Forsaljningspris (kr) *</Label>
                <Input type="number" min={0} step="0.01" value={form.sellingPrice} onChange={(e) => setForm(f => ({ ...f, sellingPrice: Number(e.target.value) || 0 }))} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Kampanjpris (kr)</Label>
                <Input type="number" min={0} step="0.01" value={form.campaignSellingPrice} onChange={(e) => setForm(f => ({ ...f, campaignSellingPrice: Number(e.target.value) || '' }))} placeholder="Valfritt" />
              </div>
              <div className="grid gap-2">
                <Label>Period</Label>
                <Input value={form.period} onChange={(e) => setForm(f => ({ ...f, period: e.target.value }))} placeholder="2024-01 - 2024-03" />
              </div>
            </div>
            {form.sellingPrice > 0 && (
              <p className="text-xs text-muted-foreground">
                Beraknad marginal: <strong>{fmtPct((form.sellingPrice - form.purchasePrice) / form.sellingPrice * 100)}%</strong>
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Avbryt</Button>
            <Button onClick={handleSaveItem} disabled={form.sellingPrice <= 0}>{editingItem ? 'Uppdatera' : 'Lagg till'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Ta bort varugrupp</DialogTitle><DialogDescription>Ar du saker pa att du vill ta bort {itemToDelete?.group}?</DialogDescription></DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>Avbryt</Button>
            <Button variant="destructive" onClick={handleDeleteItem}><Trash2 className="mr-2 h-4 w-4" />Ta bort</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
