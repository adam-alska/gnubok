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
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { Plus, Pencil, Trash2, Loader2, ShieldCheck } from 'lucide-react'

interface ModuleWorkspaceProps {
  module: { slug: string; name: string; cat: string; desc: string; longDesc: string }
  sectorSlug: string
  settingsHref: string
}

type VatStatus = 'Momsfri' | 'Momspliktig 6%' | 'Momspliktig 25%' | 'Delvis momsfri'
interface VatEntry {
  id: string
  activityName: string
  description: string
  annualRevenue: number
  vatStatus: VatStatus
  vatAmount: number
  notes: string
}

const VAT_STATUSES: VatStatus[] = ['Momsfri', 'Momspliktig 6%', 'Momspliktig 25%', 'Delvis momsfri']
const VAT_RATES: Record<VatStatus, number> = { 'Momsfri': 0, 'Momspliktig 6%': 0.06, 'Momspliktig 25%': 0.25, 'Delvis momsfri': 0 }
const STATUS_VARIANT: Record<VatStatus, 'success' | 'warning' | 'danger' | 'info' | 'neutral'> = {
  'Momsfri': 'success', 'Momspliktig 6%': 'warning', 'Momspliktig 25%': 'danger', 'Delvis momsfri': 'info',
}

function fmt(n: number): string { return new Intl.NumberFormat('sv-SE', { maximumFractionDigits: 0 }).format(n) }

const EMPTY_FORM = { activityName: '', description: '', annualRevenue: 0, vatStatus: 'Momsfri' as VatStatus, vatAmount: 0, notes: '' }

export function MomsfrihetUtbildningWorkspace({ module: mod, sectorSlug, settingsHref }: ModuleWorkspaceProps) {
  const supabase = createClient()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [entries, setEntries] = useState<VatEntry[]>([])
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<VatEntry | null>(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [toDelete, setToDelete] = useState<VatEntry | null>(null)

  const saveEntries = useCallback(async (items: VatEntry[]) => {
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setSaving(false); return }
    await supabase.from('module_configs').upsert(
      { user_id: user.id, sector_slug: sectorSlug, module_slug: mod.slug, config_key: 'vat_entries', config_value: items },
      { onConflict: 'user_id,sector_slug,module_slug,config_key' }
    )
    setSaving(false)
  }, [supabase, sectorSlug, mod.slug])

  const fetchEntries = useCallback(async () => {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); return }
    const { data } = await supabase.from('module_configs').select('config_value')
      .eq('user_id', user.id).eq('sector_slug', sectorSlug).eq('module_slug', mod.slug).eq('config_key', 'vat_entries').maybeSingle()
    if (data?.config_value && Array.isArray(data.config_value)) setEntries(data.config_value as VatEntry[])
    setLoading(false)
  }, [supabase, sectorSlug, mod.slug])

  useEffect(() => { fetchEntries() }, [fetchEntries])

  const totalRevenue = useMemo(() => entries.reduce((s, e) => s + e.annualRevenue, 0), [entries])
  const exemptRevenue = useMemo(() => entries.filter(e => e.vatStatus === 'Momsfri').reduce((s, e) => s + e.annualRevenue, 0), [entries])
  const totalVat = useMemo(() => entries.reduce((s, e) => s + e.vatAmount, 0), [entries])

  function openNew() { setEditing(null); setForm({ ...EMPTY_FORM }); setDialogOpen(true) }
  function openEdit(entry: VatEntry) {
    setEditing(entry)
    setForm({ activityName: entry.activityName, description: entry.description, annualRevenue: entry.annualRevenue, vatStatus: entry.vatStatus, vatAmount: entry.vatAmount, notes: entry.notes })
    setDialogOpen(true)
  }

  function calcVat(revenue: number, status: VatStatus): number {
    return Math.round(revenue * VAT_RATES[status])
  }

  async function handleSave() {
    const vat = form.vatStatus === 'Delvis momsfri' ? form.vatAmount : calcVat(form.annualRevenue, form.vatStatus)
    const entry: VatEntry = { id: editing?.id ?? crypto.randomUUID(), ...form, vatAmount: vat }
    const updated = editing ? entries.map(e => e.id === editing.id ? entry : e) : [...entries, entry]
    setEntries(updated); setDialogOpen(false); await saveEntries(updated)
  }

  async function handleDelete() {
    if (!toDelete) return
    const updated = entries.filter(e => e.id !== toDelete.id)
    setEntries(updated); setDeleteDialogOpen(false); setToDelete(null); await saveEntries(updated)
  }

  return (
    <>
      <ModuleWorkspaceShell title={mod.name} description={mod.desc} category="bokforing" sectorName="Utbildning & Förskola" backHref={`/m/${sectorSlug}`} settingsHref={settingsHref}
        actions={<Button onClick={openNew}><Plus className="mr-2 h-4 w-4" />Ny aktivitet</Button>}>
        {loading ? (
          <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : (
          <div className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <KPICard label="Total omsättning" value={fmt(totalRevenue)} unit="kr" />
              <KPICard label="Momsfri omsättning" value={fmt(exemptRevenue)} unit="kr" />
              <KPICard label="Total moms" value={fmt(totalVat)} unit="kr" />
              <KPICard label="Antal aktiviteter" value={entries.length} />
            </div>

            {entries.length === 0 ? (
              <EmptyModuleState icon={ShieldCheck} title="Inga aktiviteter" description="Lägg till aktiviteter för att bedöma momsstatus. Utbildning är normalt momsfri, men sidoverksamheter kan vara momspliktiga." actionLabel="Ny aktivitet" onAction={openNew} />
            ) : (
              <div className="rounded-xl border border-border overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead className="font-medium">Aktivitet</TableHead>
                      <TableHead className="font-medium">Beskrivning</TableHead>
                      <TableHead className="font-medium text-right">Årsomsättning</TableHead>
                      <TableHead className="font-medium">Momsstatus</TableHead>
                      <TableHead className="font-medium text-right">Momsbelopp</TableHead>
                      <TableHead className="font-medium text-right">Åtgärder</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {entries.map(entry => (
                      <TableRow key={entry.id}>
                        <TableCell className="font-medium">{entry.activityName}</TableCell>
                        <TableCell className="text-muted-foreground text-sm">{entry.description}</TableCell>
                        <TableCell className="text-right tabular-nums">{fmt(entry.annualRevenue)} kr</TableCell>
                        <TableCell><StatusBadge label={entry.vatStatus} variant={STATUS_VARIANT[entry.vatStatus]} /></TableCell>
                        <TableCell className="text-right tabular-nums">{fmt(entry.vatAmount)} kr</TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button variant="ghost" size="icon" onClick={() => openEdit(entry)}><Pencil className="h-4 w-4" /></Button>
                            <Button variant="ghost" size="icon" className="text-red-600 hover:text-red-700" onClick={() => { setToDelete(entry); setDeleteDialogOpen(true) }}><Trash2 className="h-4 w-4" /></Button>
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
            <DialogTitle>{editing ? 'Redigera aktivitet' : 'Ny aktivitet'}</DialogTitle>
            <DialogDescription>{editing ? 'Uppdatera momsbedömningen.' : 'Lägg till en verksamhet och bedöm dess momsstatus.'}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-2"><Label>Aktivitetsnamn *</Label><Input value={form.activityName} onChange={e => setForm(f => ({ ...f, activityName: e.target.value }))} placeholder="Förskoleverksamhet" /></div>
            <div className="grid gap-2"><Label>Beskrivning</Label><Input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Beskrivning av aktiviteten" /></div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2"><Label>Årsomsättning (kr) *</Label><Input type="number" value={form.annualRevenue || ''} onChange={e => setForm(f => ({ ...f, annualRevenue: parseFloat(e.target.value) || 0 }))} /></div>
              <div className="grid gap-2"><Label>Momsstatus *</Label>
                <Select value={form.vatStatus} onValueChange={v => setForm(f => ({ ...f, vatStatus: v as VatStatus }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{VAT_STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            {form.vatStatus === 'Delvis momsfri' && (
              <div className="grid gap-2"><Label>Momsbelopp (kr)</Label><Input type="number" value={form.vatAmount || ''} onChange={e => setForm(f => ({ ...f, vatAmount: parseFloat(e.target.value) || 0 }))} /></div>
            )}
            <div className="grid gap-2"><Label>Anteckningar</Label><Input value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Avbryt</Button>
            <Button onClick={handleSave} disabled={!form.activityName.trim()}>{editing ? 'Uppdatera' : 'Lägg till'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Ta bort aktivitet</DialogTitle><DialogDescription>Är du säker på att du vill ta bort {toDelete?.activityName}?</DialogDescription></DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>Avbryt</Button>
            <Button variant="destructive" onClick={handleDelete}><Trash2 className="mr-2 h-4 w-4" />Ta bort</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
