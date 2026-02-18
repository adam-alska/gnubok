'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { ModuleWorkspaceShell } from '@/components/modules/ModuleWorkspaceShell'
import { EmptyModuleState } from '@/components/modules/shared/EmptyModuleState'
import { KPICard } from '@/components/modules/shared/KPICard'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { Plus, Pencil, Trash2, Loader2, Users, BarChart3 } from 'lucide-react'

interface ModuleWorkspaceProps {
  module: { slug: string; name: string; cat: string; desc: string; longDesc: string }
  sectorSlug: string
  settingsHref: string
}

interface CostEntry {
  id: string
  category: string
  annualCost: number
}

interface UnitConfig {
  totalChildren: number
  municipalFundingPerChild: number
  costEntries: CostEntry[]
}

function fmt(n: number): string { return new Intl.NumberFormat('sv-SE', { maximumFractionDigits: 0 }).format(n) }

const DEFAULT_CATEGORIES = ['Personal', 'Lokaler', 'Kost', 'Material', 'Administration', 'Övrigt']

export function KostnadPerBarnElevWorkspace({ module: mod, sectorSlug, settingsHref }: ModuleWorkspaceProps) {
  const supabase = createClient()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [config, setConfig] = useState<UnitConfig>({ totalChildren: 0, municipalFundingPerChild: 0, costEntries: [] })
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<CostEntry | null>(null)
  const [form, setForm] = useState({ category: '', annualCost: 0 })
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [childrenInput, setChildrenInput] = useState('')
  const [fundingInput, setFundingInput] = useState('')

  const saveConfig = useCallback(async (cfg: UnitConfig) => {
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setSaving(false); return }
    await supabase.from('module_configs').upsert(
      { user_id: user.id, sector_slug: sectorSlug, module_slug: mod.slug, config_key: 'cost_config', config_value: cfg },
      { onConflict: 'user_id,sector_slug,module_slug,config_key' }
    )
    setSaving(false)
  }, [supabase, sectorSlug, mod.slug])

  const fetchConfig = useCallback(async () => {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); return }
    const { data } = await supabase.from('module_configs').select('config_value')
      .eq('user_id', user.id).eq('sector_slug', sectorSlug).eq('module_slug', mod.slug).eq('config_key', 'cost_config').maybeSingle()
    if (data?.config_value) {
      const cfg = data.config_value as UnitConfig
      setConfig(cfg)
      setChildrenInput(String(cfg.totalChildren))
      setFundingInput(String(cfg.municipalFundingPerChild))
    }
    setLoading(false)
  }, [supabase, sectorSlug, mod.slug])

  useEffect(() => { fetchConfig() }, [fetchConfig])

  const totalCost = useMemo(() => config.costEntries.reduce((s, e) => s + e.annualCost, 0), [config.costEntries])
  const costPerChild = useMemo(() => config.totalChildren > 0 ? totalCost / config.totalChildren : 0, [totalCost, config.totalChildren])
  const fundingDiff = useMemo(() => config.municipalFundingPerChild - costPerChild, [config.municipalFundingPerChild, costPerChild])

  function openNew() { setEditing(null); setForm({ category: '', annualCost: 0 }); setDialogOpen(true) }
  function openEdit(entry: CostEntry) { setEditing(entry); setForm({ category: entry.category, annualCost: entry.annualCost }); setDialogOpen(true) }

  async function handleSave() {
    const entry: CostEntry = { id: editing?.id ?? crypto.randomUUID(), category: form.category.trim(), annualCost: form.annualCost }
    const updated = editing ? config.costEntries.map(e => e.id === editing.id ? entry : e) : [...config.costEntries, entry]
    const newConfig = { ...config, costEntries: updated }
    setConfig(newConfig); setDialogOpen(false); await saveConfig(newConfig)
  }

  async function handleDelete(id: string) {
    const updated = config.costEntries.filter(e => e.id !== id)
    const newConfig = { ...config, costEntries: updated }
    setConfig(newConfig); await saveConfig(newConfig)
  }

  async function handleSaveSettings() {
    const newConfig = { ...config, totalChildren: parseInt(childrenInput) || 0, municipalFundingPerChild: parseFloat(fundingInput) || 0 }
    setConfig(newConfig); setSettingsOpen(false); await saveConfig(newConfig)
  }

  return (
    <>
      <ModuleWorkspaceShell title={mod.name} description={mod.desc} category="rapport" sectorName="Utbildning & Förskola" backHref={`/m/${sectorSlug}`} settingsHref={settingsHref}
        actions={<div className="flex gap-2"><Button variant="outline" onClick={() => setSettingsOpen(true)}>Grunddata</Button><Button onClick={openNew}><Plus className="mr-2 h-4 w-4" />Ny kostnad</Button></div>}>
        {loading ? (
          <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : (
          <div className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
              <KPICard label="Antal barn/elever" value={config.totalChildren} />
              <KPICard label="Total årskostnad" value={fmt(totalCost)} unit="kr" />
              <KPICard label="Kostnad per barn" value={fmt(costPerChild)} unit="kr/år" />
              <KPICard label="Kommunal peng" value={fmt(config.municipalFundingPerChild)} unit="kr/år" />
              <KPICard label="Resultat per barn" value={`${fundingDiff >= 0 ? '+' : ''}${fmt(fundingDiff)}`} unit="kr" trend={fundingDiff >= 0 ? 'up' : 'down'} />
            </div>

            {config.costEntries.length === 0 ? (
              <EmptyModuleState icon={BarChart3} title="Inga kostnader" description="Lägg till kostnadsposter (personal, lokaler, kost, material) för att beräkna kostnad per barn/elev." actionLabel="Ny kostnad" onAction={openNew} />
            ) : (
              <div className="rounded-xl border border-border overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead className="font-medium">Kategori</TableHead>
                      <TableHead className="font-medium text-right">Årskostnad</TableHead>
                      <TableHead className="font-medium text-right">Per barn/elev</TableHead>
                      <TableHead className="font-medium text-right">Andel</TableHead>
                      <TableHead className="font-medium text-right">Åtgärder</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {config.costEntries.map(entry => (
                      <TableRow key={entry.id}>
                        <TableCell className="font-medium">{entry.category}</TableCell>
                        <TableCell className="text-right tabular-nums">{fmt(entry.annualCost)} kr</TableCell>
                        <TableCell className="text-right tabular-nums">{config.totalChildren > 0 ? fmt(entry.annualCost / config.totalChildren) : '-'} kr</TableCell>
                        <TableCell className="text-right tabular-nums">{totalCost > 0 ? ((entry.annualCost / totalCost) * 100).toFixed(1) : '0'}%</TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button variant="ghost" size="icon" onClick={() => openEdit(entry)}><Pencil className="h-4 w-4" /></Button>
                            <Button variant="ghost" size="icon" className="text-red-600 hover:text-red-700" onClick={() => handleDelete(entry.id)}><Trash2 className="h-4 w-4" /></Button>
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
          <DialogHeader><DialogTitle>{editing ? 'Redigera kostnad' : 'Ny kostnad'}</DialogTitle><DialogDescription>Ange kostnadskategori och årligt belopp.</DialogDescription></DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-2"><Label>Kategori *</Label><Input value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))} placeholder="Personal" list="cat-list" />
              <datalist id="cat-list">{DEFAULT_CATEGORIES.map(c => <option key={c} value={c} />)}</datalist>
            </div>
            <div className="grid gap-2"><Label>Årskostnad (kr) *</Label><Input type="number" value={form.annualCost || ''} onChange={e => setForm(f => ({ ...f, annualCost: parseFloat(e.target.value) || 0 }))} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Avbryt</Button>
            <Button onClick={handleSave} disabled={!form.category.trim()}>{editing ? 'Uppdatera' : 'Lägg till'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Grunddata</DialogTitle><DialogDescription>Ange antal barn/elever och kommunal peng per barn.</DialogDescription></DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-2"><Label>Antal barn/elever</Label><Input type="number" value={childrenInput} onChange={e => setChildrenInput(e.target.value)} /></div>
            <div className="grid gap-2"><Label>Kommunal peng per barn (kr/år)</Label><Input type="number" value={fundingInput} onChange={e => setFundingInput(e.target.value)} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSettingsOpen(false)}>Avbryt</Button>
            <Button onClick={handleSaveSettings}>Spara</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
