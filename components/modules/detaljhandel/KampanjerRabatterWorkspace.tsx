'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { ModuleWorkspaceShell } from '@/components/modules/ModuleWorkspaceShell'
import { KPICard } from '@/components/modules/shared/KPICard'
import { StatusBadge } from '@/components/modules/shared/StatusBadge'
import { EmptyModuleState } from '@/components/modules/shared/EmptyModuleState'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
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
import { Plus, Pencil, Trash2, Loader2, Tag, Percent } from 'lucide-react'
import { cn } from '@/lib/utils'

interface ModuleWorkspaceProps {
  module: { slug: string; name: string; cat: string; desc: string; longDesc: string }
  sectorSlug: string
  settingsHref: string
}

interface Campaign {
  id: string
  name: string
  type: 'procent' | 'kronor' | 'mangdrabatt' | 'kop3betal2'
  discountValue: number
  category: string
  startDate: string
  endDate: string
  active: boolean
  originalPrice: number
  campaignPrice: number
  marginPct: number
  purchasePrice: number
}

const TYPES = [
  { value: 'procent', label: 'Procentrabatt' },
  { value: 'kronor', label: 'Kronrabatt' },
  { value: 'mangdrabatt', label: 'Mangdrabatt' },
  { value: 'kop3betal2', label: 'Kop 3 betala for 2' },
]

const CATEGORIES = ['Livsmedel', 'Dryck', 'Frukt & Gront', 'Mejeri', 'Kott & Chark', 'Non-food', 'Alla varor']

function generateId(): string {
  return crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`
}

function todayStr(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function fmt(n: number): string {
  return new Intl.NumberFormat('sv-SE', { maximumFractionDigits: 0 }).format(n)
}

function fmtPct(n: number): string {
  return isFinite(n) ? n.toFixed(1) : '0.0'
}

const EMPTY_FORM = {
  name: '',
  type: 'procent' as Campaign['type'],
  discountValue: 0,
  category: 'Alla varor',
  startDate: todayStr(),
  endDate: '',
  active: true,
  originalPrice: 0,
  purchasePrice: 0,
}

export function KampanjerRabatterWorkspace({ module: mod, sectorSlug, settingsHref }: ModuleWorkspaceProps) {
  const supabase = createClient()

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [campaigns, setCampaigns] = useState<Campaign[]>([])

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingItem, setEditingItem] = useState<Campaign | null>(null)
  const [form, setForm] = useState(EMPTY_FORM)

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [itemToDelete, setItemToDelete] = useState<Campaign | null>(null)

  const saveCampaigns = useCallback(async (newCampaigns: Campaign[]) => {
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setSaving(false); return }
    await supabase.from('module_configs').upsert(
      { user_id: user.id, sector_slug: sectorSlug, module_slug: mod.slug, config_key: 'campaigns', config_value: newCampaigns },
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
      .eq('user_id', user.id).eq('sector_slug', sectorSlug).eq('module_slug', mod.slug).eq('config_key', 'campaigns')
      .maybeSingle()
    if (data?.config_value && Array.isArray(data.config_value)) setCampaigns(data.config_value as Campaign[])
    setLoading(false)
  }, [supabase, sectorSlug, mod.slug])

  useEffect(() => { fetchData() }, [fetchData])

  const activeCampaigns = useMemo(() => campaigns.filter(c => c.active), [campaigns])
  const today = todayStr()
  const expiringSoon = useMemo(() => {
    const in7days = new Date()
    in7days.setDate(in7days.getDate() + 7)
    const endStr = `${in7days.getFullYear()}-${String(in7days.getMonth() + 1).padStart(2, '0')}-${String(in7days.getDate()).padStart(2, '0')}`
    return campaigns.filter(c => c.active && c.endDate && c.endDate <= endStr && c.endDate >= today)
  }, [campaigns, today])

  const avgMarginReduction = useMemo(() => {
    const active = campaigns.filter(c => c.active && c.marginPct < 100)
    if (active.length === 0) return 0
    return active.reduce((s, c) => s + c.marginPct, 0) / active.length
  }, [campaigns])

  function calcCampaignPrice(originalPrice: number, type: Campaign['type'], discountValue: number): number {
    if (type === 'procent') return originalPrice * (1 - discountValue / 100)
    if (type === 'kronor') return originalPrice - discountValue
    if (type === 'kop3betal2') return originalPrice * (2 / 3)
    return originalPrice
  }

  function openNewItem() { setEditingItem(null); setForm({ ...EMPTY_FORM, startDate: todayStr() }); setDialogOpen(true) }
  function openEditItem(item: Campaign) {
    setEditingItem(item)
    setForm({ name: item.name, type: item.type, discountValue: item.discountValue, category: item.category, startDate: item.startDate, endDate: item.endDate, active: item.active, originalPrice: item.originalPrice, purchasePrice: item.purchasePrice })
    setDialogOpen(true)
  }

  async function handleSaveItem() {
    const campaignPrice = calcCampaignPrice(form.originalPrice, form.type, form.discountValue)
    const marginPct = campaignPrice > 0 && form.purchasePrice > 0 ? ((campaignPrice - form.purchasePrice) / campaignPrice) * 100 : 0

    const item: Campaign = {
      id: editingItem?.id ?? generateId(),
      name: form.name.trim(), type: form.type, discountValue: form.discountValue, category: form.category,
      startDate: form.startDate, endDate: form.endDate, active: form.active,
      originalPrice: form.originalPrice, campaignPrice, marginPct, purchasePrice: form.purchasePrice,
    }
    let updated: Campaign[]
    if (editingItem) updated = campaigns.map(c => c.id === editingItem.id ? item : c)
    else updated = [...campaigns, item]
    setCampaigns(updated)
    setDialogOpen(false)
    await saveCampaigns(updated)
  }

  async function handleToggleActive(id: string) {
    const updated = campaigns.map(c => c.id === id ? { ...c, active: !c.active } : c)
    setCampaigns(updated)
    await saveCampaigns(updated)
  }

  async function handleDeleteItem() {
    if (!itemToDelete) return
    const updated = campaigns.filter(c => c.id !== itemToDelete.id)
    setCampaigns(updated)
    setDeleteDialogOpen(false)
    setItemToDelete(null)
    await saveCampaigns(updated)
  }

  return (
    <>
      <ModuleWorkspaceShell
        title={mod.name} description={mod.desc} category="operativ" sectorName="Detaljhandel"
        backHref={`/m/${sectorSlug}`} settingsHref={settingsHref}
        actions={<Button onClick={openNewItem}><Plus className="mr-2 h-4 w-4" />Ny kampanj</Button>}
      >
        {loading ? (
          <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : (
          <div className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <KPICard label="Aktiva kampanjer" value={String(activeCampaigns.length)} unit="st" />
              <KPICard label="Gar ut inom 7 dagar" value={String(expiringSoon.length)} unit="st" trend={expiringSoon.length > 0 ? 'neutral' : 'up'} trendLabel={expiringSoon.length > 0 ? 'Bevaka' : 'OK'} />
              <KPICard label="Snittmarginal (kampanj)" value={fmtPct(avgMarginReduction)} unit="%" trend={avgMarginReduction >= 15 ? 'up' : 'down'} />
              <KPICard label="Totalt antal" value={String(campaigns.length)} unit="kampanjer" />
            </div>

            {campaigns.length === 0 ? (
              <EmptyModuleState icon={Tag} title="Inga kampanjer" description="Skapa kampanjer och rabattregler for att driva forsaljning." actionLabel="Ny kampanj" onAction={openNewItem} />
            ) : (
              <div className="rounded-xl border border-border overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead className="font-medium">Kampanj</TableHead>
                      <TableHead className="font-medium">Typ</TableHead>
                      <TableHead className="font-medium">Kategori</TableHead>
                      <TableHead className="font-medium text-right">Ordinarie</TableHead>
                      <TableHead className="font-medium text-right">Kampanjpris</TableHead>
                      <TableHead className="font-medium text-right">Marginal</TableHead>
                      <TableHead className="font-medium">Period</TableHead>
                      <TableHead className="font-medium text-center">Aktiv</TableHead>
                      <TableHead className="font-medium text-right">Atgarder</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {campaigns.sort((a, b) => (b.active ? 1 : 0) - (a.active ? 1 : 0)).map((c) => (
                      <TableRow key={c.id} className={cn(!c.active && 'opacity-50')}>
                        <TableCell className="font-medium">{c.name}</TableCell>
                        <TableCell><Badge variant="secondary">{TYPES.find(t => t.value === c.type)?.label ?? c.type}</Badge></TableCell>
                        <TableCell><Badge variant="outline">{c.category}</Badge></TableCell>
                        <TableCell className="text-right tabular-nums">{fmt(c.originalPrice)} kr</TableCell>
                        <TableCell className="text-right tabular-nums font-medium">{fmt(c.campaignPrice)} kr</TableCell>
                        <TableCell className="text-right tabular-nums">
                          <span className={cn('font-medium', c.marginPct >= 15 ? 'text-emerald-600' : 'text-red-600')}>{fmtPct(c.marginPct)}%</span>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">{c.startDate} - {c.endDate || 'tillsvidare'}</TableCell>
                        <TableCell className="text-center"><Switch checked={c.active} onCheckedChange={() => handleToggleActive(c.id)} /></TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button variant="ghost" size="icon" onClick={() => openEditItem(c)}><Pencil className="h-4 w-4" /></Button>
                            <Button variant="ghost" size="icon" className="text-red-600 hover:text-red-700" onClick={() => { setItemToDelete(c); setDeleteDialogOpen(true) }}><Trash2 className="h-4 w-4" /></Button>
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
          <DialogHeader><DialogTitle>{editingItem ? 'Redigera kampanj' : 'Ny kampanj'}</DialogTitle><DialogDescription>{editingItem ? 'Uppdatera kampanjens regler.' : 'Skapa en ny kampanj med rabattregler.'}</DialogDescription></DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-2"><Label>Kampanjnamn *</Label><Input value={form.name} onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Veckas erbjudande" /></div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2"><Label>Typ *</Label><Select value={form.type} onValueChange={(v) => setForm(f => ({ ...f, type: v as Campaign['type'] }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent></Select></div>
              <div className="grid gap-2"><Label>Rabattvarde</Label><Input type="number" min={0} value={form.discountValue} onChange={(e) => setForm(f => ({ ...f, discountValue: Number(e.target.value) || 0 }))} /></div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="grid gap-2"><Label>Ordinarie pris</Label><Input type="number" min={0} value={form.originalPrice} onChange={(e) => setForm(f => ({ ...f, originalPrice: Number(e.target.value) || 0 }))} /></div>
              <div className="grid gap-2"><Label>Inkopspris</Label><Input type="number" min={0} value={form.purchasePrice} onChange={(e) => setForm(f => ({ ...f, purchasePrice: Number(e.target.value) || 0 }))} /></div>
              <div className="grid gap-2"><Label>Kategori</Label><Select value={form.category} onValueChange={(v) => setForm(f => ({ ...f, category: v }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent></Select></div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2"><Label>Startdatum</Label><Input type="date" value={form.startDate} onChange={(e) => setForm(f => ({ ...f, startDate: e.target.value }))} /></div>
              <div className="grid gap-2"><Label>Slutdatum</Label><Input type="date" value={form.endDate} onChange={(e) => setForm(f => ({ ...f, endDate: e.target.value }))} /></div>
            </div>
            {form.originalPrice > 0 && (
              <p className="text-xs text-muted-foreground">Kampanjpris: <strong>{fmt(calcCampaignPrice(form.originalPrice, form.type, form.discountValue))} kr</strong></p>
            )}
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setDialogOpen(false)}>Avbryt</Button><Button onClick={handleSaveItem} disabled={!form.name.trim()}>{editingItem ? 'Uppdatera' : 'Skapa'}</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Ta bort kampanj</DialogTitle><DialogDescription>Ar du saker pa att du vill ta bort {itemToDelete?.name}?</DialogDescription></DialogHeader>
          <DialogFooter><Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>Avbryt</Button><Button variant="destructive" onClick={handleDeleteItem}><Trash2 className="mr-2 h-4 w-4" />Ta bort</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
