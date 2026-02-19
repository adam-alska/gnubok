'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { ModuleWorkspaceShell } from '@/components/modules/ModuleWorkspaceShell'
import { KPICard } from '@/components/modules/shared/KPICard'
import { EmptyModuleState } from '@/components/modules/shared/EmptyModuleState'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { Plus, Pencil, Trash2, Loader2, RotateCw, AlertTriangle } from 'lucide-react'
import { cn } from '@/lib/utils'

interface ModuleWorkspaceProps {
  module: { slug: string; name: string; cat: string; desc: string; longDesc: string }
  sectorSlug: string
  settingsHref: string
}

interface TurnoverItem {
  id: string
  group: string
  annualCOGS: number
  avgInventory: number
  turnoverRate: number
  daysInInventory: number
  capitalTiedUp: number
  reorderSuggestion: string
}

const PRODUCT_GROUPS = ['Livsmedel', 'Dryck', 'Frukt & Gront', 'Mejeri', 'Kott & Chark', 'Non-food', 'Brod & Bageri', 'Godis & Snacks', 'Ovrigt']

function generateId(): string {
  return crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`
}

function fmt(n: number): string {
  return new Intl.NumberFormat('sv-SE', { maximumFractionDigits: 0 }).format(n)
}

function fmtDec(n: number): string {
  return isFinite(n) ? n.toFixed(1) : '0.0'
}

function getReorderSuggestion(turnoverRate: number): string {
  if (turnoverRate >= 24) return 'Daglig beställning'
  if (turnoverRate >= 12) return 'Veckovis beställning'
  if (turnoverRate >= 6) return 'Varannan vecka'
  if (turnoverRate >= 4) return 'Månadsvis beställning'
  return 'Minska lager - lagom beställning'
}

const EMPTY_FORM = {
  group: 'Livsmedel',
  annualCOGS: 0,
  avgInventory: 0,
}

export function LageromsattningshastighetWorkspace({ module: mod, sectorSlug, settingsHref }: ModuleWorkspaceProps) {
  const supabase = createClient()

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [items, setItems] = useState<TurnoverItem[]>([])

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingItem, setEditingItem] = useState<TurnoverItem | null>(null)
  const [form, setForm] = useState(EMPTY_FORM)

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [itemToDelete, setItemToDelete] = useState<TurnoverItem | null>(null)

  const saveItems = useCallback(async (newItems: TurnoverItem[]) => {
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setSaving(false); return }
    await supabase.from('module_configs').upsert(
      { user_id: user.id, sector_slug: sectorSlug, module_slug: mod.slug, config_key: 'turnover_data', config_value: newItems },
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
      .eq('user_id', user.id).eq('sector_slug', sectorSlug).eq('module_slug', mod.slug).eq('config_key', 'turnover_data')
      .maybeSingle()
    if (data?.config_value && Array.isArray(data.config_value)) setItems(data.config_value as TurnoverItem[])
    setLoading(false)
  }, [supabase, sectorSlug, mod.slug])

  useEffect(() => { fetchData() }, [fetchData])

  const avgTurnover = useMemo(() => items.length > 0 ? items.reduce((s, i) => s + i.turnoverRate, 0) / items.length : 0, [items])
  const totalCapital = useMemo(() => items.reduce((s, i) => s + i.capitalTiedUp, 0), [items])
  const slowMoving = useMemo(() => items.filter(i => i.turnoverRate < 4).length, [items])

  function openNewItem() { setEditingItem(null); setForm({ ...EMPTY_FORM }); setDialogOpen(true) }
  function openEditItem(item: TurnoverItem) {
    setEditingItem(item)
    setForm({ group: item.group, annualCOGS: item.annualCOGS, avgInventory: item.avgInventory })
    setDialogOpen(true)
  }

  async function handleSaveItem() {
    const turnoverRate = form.avgInventory > 0 ? form.annualCOGS / form.avgInventory : 0
    const daysInInventory = turnoverRate > 0 ? 365 / turnoverRate : 0
    const item: TurnoverItem = {
      id: editingItem?.id ?? generateId(),
      group: form.group,
      annualCOGS: form.annualCOGS,
      avgInventory: form.avgInventory,
      turnoverRate,
      daysInInventory,
      capitalTiedUp: form.avgInventory,
      reorderSuggestion: getReorderSuggestion(turnoverRate),
    }
    let updated: TurnoverItem[]
    if (editingItem) updated = items.map(i => i.id === editingItem.id ? item : i)
    else updated = [...items, item]
    setItems(updated)
    setDialogOpen(false)
    await saveItems(updated)
  }

  async function handleDeleteItem() {
    if (!itemToDelete) return
    const updated = items.filter(i => i.id !== itemToDelete.id)
    setItems(updated)
    setDeleteDialogOpen(false)
    setItemToDelete(null)
    await saveItems(updated)
  }

  return (
    <>
      <ModuleWorkspaceShell
        title={mod.name} description={mod.desc} category="rapport" sectorName="Detaljhandel"
        backHref={`/m/${sectorSlug}`} settingsHref={settingsHref}
        actions={<Button onClick={openNewItem}><Plus className="mr-2 h-4 w-4" />Ny varugrupp</Button>}
      >
        {loading ? (
          <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : (
          <div className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <KPICard label="Snitt omsättningshastighet" value={fmtDec(avgTurnover)} unit="ggr/år" trend={avgTurnover >= 12 ? 'up' : avgTurnover >= 6 ? 'neutral' : 'down'} />
              <KPICard label="Bundet kapital" value={fmt(totalCapital)} unit="kr" />
              <KPICard label="Antal varugrupper" value={String(items.length)} unit="st" />
              <KPICard label="Långroterande" value={String(slowMoving)} unit="varugrupper" trend={slowMoving > 0 ? 'down' : 'up'} trendLabel={slowMoving > 0 ? 'Kräv åtgärd' : 'Bra'} />
            </div>

            {items.length === 0 ? (
              <EmptyModuleState icon={RotateCw} title="Inga varugrupper" description="Lägg till varugrupper för att beräkna lageromsättningshastighet." actionLabel="Ny varugrupp" onAction={openNewItem} />
            ) : (
              <div className="rounded-xl border border-border overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead className="font-medium">Varugrupp</TableHead>
                      <TableHead className="font-medium text-right">Årlig VKV (kr)</TableHead>
                      <TableHead className="font-medium text-right">Snittlager (kr)</TableHead>
                      <TableHead className="font-medium text-right">Oms. hastighet</TableHead>
                      <TableHead className="font-medium text-right">Dagar i lager</TableHead>
                      <TableHead className="font-medium">Beställningsförslag</TableHead>
                      <TableHead className="font-medium text-right">Åtgärder</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {items.sort((a, b) => b.turnoverRate - a.turnoverRate).map((item) => (
                      <TableRow key={item.id}>
                        <TableCell className="font-medium">{item.group}</TableCell>
                        <TableCell className="text-right tabular-nums">{fmt(item.annualCOGS)}</TableCell>
                        <TableCell className="text-right tabular-nums">{fmt(item.avgInventory)}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          <span className={cn('font-medium', item.turnoverRate >= 12 ? 'text-emerald-600' : item.turnoverRate >= 6 ? 'text-amber-600' : 'text-red-600')}>
                            {fmtDec(item.turnoverRate)}
                          </span>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{fmtDec(item.daysInInventory)}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-xs">{item.reorderSuggestion}</Badge>
                        </TableCell>
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
            <DialogDescription>Ange årlig varuförbrukningskostnad och genomsnittligt lagervärde.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-2">
              <Label>Varugrupp *</Label>
              <Select value={form.group} onValueChange={(val) => setForm(f => ({ ...f, group: val }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{PRODUCT_GROUPS.map(g => <SelectItem key={g} value={g}>{g}</SelectItem>)}</SelectContent></Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2"><Label>Årlig VKV (kr) *</Label><Input type="number" min={0} value={form.annualCOGS} onChange={(e) => setForm(f => ({ ...f, annualCOGS: Number(e.target.value) || 0 }))} /></div>
              <div className="grid gap-2"><Label>Snittlager (kr) *</Label><Input type="number" min={0} value={form.avgInventory} onChange={(e) => setForm(f => ({ ...f, avgInventory: Number(e.target.value) || 0 }))} /></div>
            </div>
            {form.avgInventory > 0 && (
              <p className="text-xs text-muted-foreground">
                Beräknad omsättning: <strong>{fmtDec(form.annualCOGS / form.avgInventory)} ggr/år</strong> ({fmtDec(365 / (form.annualCOGS / form.avgInventory))} dagar i lager)
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Avbryt</Button>
            <Button onClick={handleSaveItem} disabled={form.avgInventory <= 0}>{editingItem ? 'Uppdatera' : 'Lägg till'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Ta bort varugrupp</DialogTitle><DialogDescription>Är du säker på att du vill ta bort {itemToDelete?.group}?</DialogDescription></DialogHeader>
          <DialogFooter><Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>Avbryt</Button><Button variant="destructive" onClick={handleDeleteItem}><Trash2 className="mr-2 h-4 w-4" />Ta bort</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
