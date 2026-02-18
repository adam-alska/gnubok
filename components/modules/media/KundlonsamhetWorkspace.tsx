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
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Plus, Pencil, Trash2, Loader2, Briefcase } from 'lucide-react'
import { cn } from '@/lib/utils'

interface ModuleWorkspaceProps { module: { slug: string; name: string; cat: string; desc: string; longDesc: string }; sectorSlug: string; settingsHref: string }

type ClientType = 'Återkommande' | 'Engångs' | 'Retainer'
interface ClientEntry { id: string; clientName: string; clientType: ClientType; totalRevenue: number; totalCost: number; hoursWorked: number; projectCount: number; startDate: string; notes: string }

const CLIENT_TYPES: ClientType[] = ['Återkommande', 'Engångs', 'Retainer']
const TYPE_V: Record<ClientType, 'success' | 'warning' | 'danger' | 'info' | 'neutral'> = { 'Återkommande': 'success', 'Engångs': 'neutral', 'Retainer': 'info' }
function fmt(n: number): string { return new Intl.NumberFormat('sv-SE', { maximumFractionDigits: 0 }).format(n) }
function pct(n: number): string { return isNaN(n) || !isFinite(n) ? '0%' : `${Math.round(n * 100)}%` }
const EMPTY_FORM = { clientName: '', clientType: 'Återkommande' as ClientType, totalRevenue: 0, totalCost: 0, hoursWorked: 0, projectCount: 0, startDate: '', notes: '' }

export function KundlonsamhetWorkspace({ module: mod, sectorSlug, settingsHref }: ModuleWorkspaceProps) {
  const supabase = createClient()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [clients, setClients] = useState<ClientEntry[]>([])
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<ClientEntry | null>(null)
  const [form, setForm] = useState(EMPTY_FORM)

  const saveData = useCallback(async (items: ClientEntry[]) => { setSaving(true); const { data: { user } } = await supabase.auth.getUser(); if (!user) { setSaving(false); return }; await supabase.from('module_configs').upsert({ user_id: user.id, sector_slug: sectorSlug, module_slug: mod.slug, config_key: 'client_profitability', config_value: items }, { onConflict: 'user_id,sector_slug,module_slug,config_key' }); setSaving(false) }, [supabase, sectorSlug, mod.slug])
  const fetchData = useCallback(async () => { setLoading(true); const { data: { user } } = await supabase.auth.getUser(); if (!user) { setLoading(false); return }; const { data } = await supabase.from('module_configs').select('config_value').eq('user_id', user.id).eq('sector_slug', sectorSlug).eq('module_slug', mod.slug).eq('config_key', 'client_profitability').maybeSingle(); if (data?.config_value && Array.isArray(data.config_value)) setClients(data.config_value as ClientEntry[]); setLoading(false) }, [supabase, sectorSlug, mod.slug])
  useEffect(() => { fetchData() }, [fetchData])

  const totalRevenue = useMemo(() => clients.reduce((s, c) => s + c.totalRevenue, 0), [clients])
  const totalCost = useMemo(() => clients.reduce((s, c) => s + c.totalCost, 0), [clients])
  const totalProfit = totalRevenue - totalCost
  const avgMargin = totalRevenue > 0 ? totalProfit / totalRevenue : 0
  const recurringRevenue = useMemo(() => clients.filter(c => c.clientType === 'Återkommande' || c.clientType === 'Retainer').reduce((s, c) => s + c.totalRevenue, 0), [clients])
  const recurringShare = totalRevenue > 0 ? recurringRevenue / totalRevenue : 0

  function openNew() { setEditing(null); setForm({ ...EMPTY_FORM }); setDialogOpen(true) }
  function openEdit(c: ClientEntry) { setEditing(c); setForm({ clientName: c.clientName, clientType: c.clientType, totalRevenue: c.totalRevenue, totalCost: c.totalCost, hoursWorked: c.hoursWorked, projectCount: c.projectCount, startDate: c.startDate, notes: c.notes }); setDialogOpen(true) }
  async function handleSave() { const entry: ClientEntry = { id: editing?.id ?? crypto.randomUUID(), ...form }; const updated = editing ? clients.map(c => c.id === editing.id ? entry : c) : [...clients, entry]; setClients(updated); setDialogOpen(false); await saveData(updated) }
  async function handleDelete(id: string) { const updated = clients.filter(c => c.id !== id); setClients(updated); await saveData(updated) }

  return (
    <>
      <ModuleWorkspaceShell title={mod.name} description={mod.desc} category="rapport" sectorName="Media & Kommunikation" backHref={`/m/${sectorSlug}`} settingsHref={settingsHref}
        actions={<Button onClick={openNew}><Plus className="mr-2 h-4 w-4" />Ny kund</Button>}>
        {loading ? <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div> : (
          <div className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <KPICard label="Total intäkt" value={fmt(totalRevenue)} unit="kr" />
              <KPICard label="Genomsnittsmarginal" value={pct(avgMargin)} trend={avgMargin >= 0.3 ? 'up' : 'down'} />
              <KPICard label="Återkommande andel" value={pct(recurringShare)} trend={recurringShare >= 0.5 ? 'up' : 'neutral'} trendLabel={recurringShare >= 0.5 ? 'Stabil bas' : 'Bygg återkommande'} />
              <KPICard label="Antal kunder" value={clients.length} />
            </div>
            {clients.length === 0 ? <EmptyModuleState icon={Briefcase} title="Inga kunder" description="Analysera kundlönsamhet: tid vs fakturerat, återkommande kunder, marginal per kund." actionLabel="Ny kund" onAction={openNew} /> : (
              <div className="rounded-xl border border-border overflow-hidden"><Table><TableHeader><TableRow className="bg-muted/50"><TableHead className="font-medium">Kund</TableHead><TableHead className="font-medium">Typ</TableHead><TableHead className="font-medium text-right">Intäkt</TableHead><TableHead className="font-medium text-right">Kostnad</TableHead><TableHead className="font-medium text-right">Resultat</TableHead><TableHead className="font-medium text-right">Marginal</TableHead><TableHead className="font-medium text-right">Timmar</TableHead><TableHead className="font-medium text-right">kr/tim</TableHead><TableHead className="font-medium text-right">Åtgärder</TableHead></TableRow></TableHeader>
                <TableBody>{clients.sort((a, b) => (b.totalRevenue - b.totalCost) - (a.totalRevenue - a.totalCost)).map(c => { const profit = c.totalRevenue - c.totalCost; const margin = c.totalRevenue > 0 ? profit / c.totalRevenue : 0; const ratePerHour = c.hoursWorked > 0 ? c.totalRevenue / c.hoursWorked : 0; return (
                  <TableRow key={c.id}><TableCell className="font-medium">{c.clientName}</TableCell><TableCell><StatusBadge label={c.clientType} variant={TYPE_V[c.clientType]} /></TableCell><TableCell className="text-right tabular-nums">{fmt(c.totalRevenue)} kr</TableCell><TableCell className="text-right tabular-nums">{fmt(c.totalCost)} kr</TableCell><TableCell className={cn('text-right tabular-nums font-medium', profit >= 0 ? 'text-emerald-600' : 'text-red-600')}>{fmt(profit)} kr</TableCell><TableCell className="text-right"><StatusBadge label={pct(margin)} variant={margin >= 0.3 ? 'success' : margin >= 0.15 ? 'warning' : 'danger'} /></TableCell><TableCell className="text-right tabular-nums">{c.hoursWorked}</TableCell><TableCell className="text-right tabular-nums">{fmt(ratePerHour)}</TableCell>
                    <TableCell className="text-right"><div className="flex items-center justify-end gap-1"><Button variant="ghost" size="icon" onClick={() => openEdit(c)}><Pencil className="h-4 w-4" /></Button><Button variant="ghost" size="icon" className="text-red-600" onClick={() => handleDelete(c.id)}><Trash2 className="h-4 w-4" /></Button></div></TableCell></TableRow>
                ) })}</TableBody></Table></div>
            )}
            {saving && <div className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" />Sparar...</div>}
          </div>
        )}
      </ModuleWorkspaceShell>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}><DialogContent className="max-w-lg"><DialogHeader><DialogTitle>{editing ? 'Redigera' : 'Ny kund'}</DialogTitle><DialogDescription>Kundlönsamhet och nyckeltal.</DialogDescription></DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="grid grid-cols-2 gap-4"><div className="grid gap-2"><Label>Kundnamn *</Label><Input value={form.clientName} onChange={e => setForm(f => ({ ...f, clientName: e.target.value }))} /></div><div className="grid gap-2"><Label>Kundtyp</Label><Select value={form.clientType} onValueChange={v => setForm(f => ({ ...f, clientType: v as ClientType }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{CLIENT_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent></Select></div></div>
          <div className="grid grid-cols-3 gap-4"><div className="grid gap-2"><Label>Total intäkt (kr)</Label><Input type="number" value={form.totalRevenue || ''} onChange={e => setForm(f => ({ ...f, totalRevenue: parseFloat(e.target.value) || 0 }))} /></div><div className="grid gap-2"><Label>Total kostnad (kr)</Label><Input type="number" value={form.totalCost || ''} onChange={e => setForm(f => ({ ...f, totalCost: parseFloat(e.target.value) || 0 }))} /></div><div className="grid gap-2"><Label>Timmar</Label><Input type="number" value={form.hoursWorked || ''} onChange={e => setForm(f => ({ ...f, hoursWorked: parseFloat(e.target.value) || 0 }))} /></div></div>
          <div className="grid grid-cols-2 gap-4"><div className="grid gap-2"><Label>Antal projekt</Label><Input type="number" value={form.projectCount || ''} onChange={e => setForm(f => ({ ...f, projectCount: parseInt(e.target.value) || 0 }))} /></div><div className="grid gap-2"><Label>Kundrelation sedan</Label><Input type="date" value={form.startDate} onChange={e => setForm(f => ({ ...f, startDate: e.target.value }))} /></div></div>
          <div className="rounded-lg bg-muted/30 p-3"><p className="text-xs text-muted-foreground">Resultat: <strong className={cn(form.totalRevenue - form.totalCost >= 0 ? 'text-emerald-600' : 'text-red-600')}>{fmt(form.totalRevenue - form.totalCost)} kr</strong> | Marginal: <strong>{form.totalRevenue > 0 ? pct((form.totalRevenue - form.totalCost) / form.totalRevenue) : '0%'}</strong>{form.hoursWorked > 0 && <> | Effektiv timkostnad: <strong>{fmt(form.totalRevenue / form.hoursWorked)} kr/tim</strong></>}</p></div>
        </div>
        <DialogFooter><Button variant="outline" onClick={() => setDialogOpen(false)}>Avbryt</Button><Button onClick={handleSave} disabled={!form.clientName.trim()}>{editing ? 'Uppdatera' : 'Lägg till'}</Button></DialogFooter></DialogContent></Dialog>
    </>
  )
}
