'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { ModuleWorkspaceShell } from '@/components/modules/ModuleWorkspaceShell'
import { EmptyModuleState } from '@/components/modules/shared/EmptyModuleState'
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
import { Plus, Pencil, Trash2, Loader2, ShieldCheck, AlertTriangle } from 'lucide-react'

interface ModuleWorkspaceProps { module: { slug: string; name: string; cat: string; desc: string; longDesc: string }; sectorSlug: string; settingsHref: string }

type CertStatus = 'Giltig' | 'Utgår snart' | 'Utgången' | 'Under revision'
interface Certification { id: string; name: string; certBody: string; certNumber: string; validFrom: string; validTo: string; status: CertStatus; auditDate: string; notes: string }

const STATUSES: CertStatus[] = ['Giltig', 'Utgår snart', 'Utgången', 'Under revision']
const STATUS_V: Record<CertStatus, 'success' | 'warning' | 'danger' | 'info' | 'neutral'> = { 'Giltig': 'success', 'Utgår snart': 'warning', 'Utgången': 'danger', 'Under revision': 'info' }
const EMPTY_FORM = { name: '', certBody: '', certNumber: '', validFrom: '', validTo: '', status: 'Giltig' as CertStatus, auditDate: '', notes: '' }

export function CertifieringarWorkspace({ module: mod, sectorSlug, settingsHref }: ModuleWorkspaceProps) {
  const supabase = createClient()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [certs, setCerts] = useState<Certification[]>([])
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<Certification | null>(null)
  const [form, setForm] = useState(EMPTY_FORM)

  const saveData = useCallback(async (items: Certification[]) => {
    setSaving(true); const { data: { user } } = await supabase.auth.getUser(); if (!user) { setSaving(false); return }
    await supabase.from('module_configs').upsert({ user_id: user.id, sector_slug: sectorSlug, module_slug: mod.slug, config_key: 'certifications', config_value: items }, { onConflict: 'user_id,sector_slug,module_slug,config_key' }); setSaving(false)
  }, [supabase, sectorSlug, mod.slug])

  const fetchData = useCallback(async () => {
    setLoading(true); const { data: { user } } = await supabase.auth.getUser(); if (!user) { setLoading(false); return }
    const { data } = await supabase.from('module_configs').select('config_value').eq('user_id', user.id).eq('sector_slug', sectorSlug).eq('module_slug', mod.slug).eq('config_key', 'certifications').maybeSingle()
    if (data?.config_value && Array.isArray(data.config_value)) setCerts(data.config_value as Certification[]); setLoading(false)
  }, [supabase, sectorSlug, mod.slug])

  useEffect(() => { fetchData() }, [fetchData])

  const expiringSoon = useMemo(() => {
    const in90 = new Date(); in90.setDate(in90.getDate() + 90); const d = in90.toISOString().split('T')[0]
    return certs.filter(c => c.validTo && c.validTo <= d && c.status !== 'Utgången')
  }, [certs])

  function openNew() { setEditing(null); setForm({ ...EMPTY_FORM }); setDialogOpen(true) }
  function openEdit(c: Certification) { setEditing(c); setForm({ name: c.name, certBody: c.certBody, certNumber: c.certNumber, validFrom: c.validFrom, validTo: c.validTo, status: c.status, auditDate: c.auditDate, notes: c.notes }); setDialogOpen(true) }
  async function handleSave() { const entry: Certification = { id: editing?.id ?? crypto.randomUUID(), ...form }; const updated = editing ? certs.map(c => c.id === editing.id ? entry : c) : [...certs, entry]; setCerts(updated); setDialogOpen(false); await saveData(updated) }
  async function handleDelete(id: string) { const updated = certs.filter(c => c.id !== id); setCerts(updated); await saveData(updated) }

  return (
    <>
      <ModuleWorkspaceShell title={mod.name} description={mod.desc} category="operativ" sectorName="Jordbruk & Livsmedel" backHref={`/m/${sectorSlug}`} settingsHref={settingsHref}
        actions={<Button onClick={openNew}><Plus className="mr-2 h-4 w-4" />Ny certifiering</Button>}>
        {expiringSoon.length > 0 && (
          <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 px-4 py-3 mb-4 space-y-1">
            <div className="flex items-center gap-2 text-sm font-medium text-amber-700"><AlertTriangle className="h-4 w-4" />Certifieringar som utgår inom 90 dagar</div>
            {expiringSoon.map(c => <p key={c.id} className="text-xs text-amber-600">{c.name} - utgår {c.validTo}</p>)}
          </div>
        )}
        {loading ? <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div> : (
          <div className="space-y-6">
            {certs.length === 0 ? <EmptyModuleState icon={ShieldCheck} title="Inga certifieringar" description="Registrera KRAV, ekologisk och andra certifieringar med giltighetstid och revisionsdatum." actionLabel="Ny certifiering" onAction={openNew} /> : (
              <div className="rounded-xl border border-border overflow-hidden">
                <Table><TableHeader><TableRow className="bg-muted/50"><TableHead className="font-medium">Certifiering</TableHead><TableHead className="font-medium">Organ</TableHead><TableHead className="font-medium">Nr</TableHead><TableHead className="font-medium">Giltig t.o.m.</TableHead><TableHead className="font-medium">Revision</TableHead><TableHead className="font-medium">Status</TableHead><TableHead className="font-medium text-right">Åtgärder</TableHead></TableRow></TableHeader>
                  <TableBody>{certs.map(c => (
                    <TableRow key={c.id}><TableCell className="font-medium">{c.name}</TableCell><TableCell>{c.certBody}</TableCell><TableCell className="font-mono">{c.certNumber}</TableCell><TableCell>{c.validTo}</TableCell><TableCell>{c.auditDate || '-'}</TableCell><TableCell><StatusBadge label={c.status} variant={STATUS_V[c.status]} /></TableCell>
                      <TableCell className="text-right"><div className="flex items-center justify-end gap-1"><Button variant="ghost" size="icon" onClick={() => openEdit(c)}><Pencil className="h-4 w-4" /></Button><Button variant="ghost" size="icon" className="text-red-600" onClick={() => handleDelete(c.id)}><Trash2 className="h-4 w-4" /></Button></div></TableCell></TableRow>
                  ))}</TableBody></Table></div>
            )}
            {saving && <div className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" />Sparar...</div>}
          </div>
        )}
      </ModuleWorkspaceShell>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}><DialogContent className="max-w-lg"><DialogHeader><DialogTitle>{editing ? 'Redigera' : 'Ny certifiering'}</DialogTitle><DialogDescription>Registrera certifiering.</DialogDescription></DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="grid grid-cols-2 gap-4"><div className="grid gap-2"><Label>Certifiering *</Label><Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="KRAV" /></div><div className="grid gap-2"><Label>Certifieringsorgan</Label><Input value={form.certBody} onChange={e => setForm(f => ({ ...f, certBody: e.target.value }))} placeholder="Kiwa" /></div></div>
          <div className="grid grid-cols-3 gap-4"><div className="grid gap-2"><Label>Certifieringsnr</Label><Input value={form.certNumber} onChange={e => setForm(f => ({ ...f, certNumber: e.target.value }))} /></div><div className="grid gap-2"><Label>Giltig från</Label><Input type="date" value={form.validFrom} onChange={e => setForm(f => ({ ...f, validFrom: e.target.value }))} /></div><div className="grid gap-2"><Label>Giltig t.o.m.</Label><Input type="date" value={form.validTo} onChange={e => setForm(f => ({ ...f, validTo: e.target.value }))} /></div></div>
          <div className="grid grid-cols-2 gap-4"><div className="grid gap-2"><Label>Status</Label><Select value={form.status} onValueChange={v => setForm(f => ({ ...f, status: v as CertStatus }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent></Select></div><div className="grid gap-2"><Label>Nästa revision</Label><Input type="date" value={form.auditDate} onChange={e => setForm(f => ({ ...f, auditDate: e.target.value }))} /></div></div>
          <div className="grid gap-2"><Label>Anteckningar</Label><Input value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} /></div>
        </div>
        <DialogFooter><Button variant="outline" onClick={() => setDialogOpen(false)}>Avbryt</Button><Button onClick={handleSave} disabled={!form.name.trim()}>{editing ? 'Uppdatera' : 'Lägg till'}</Button></DialogFooter></DialogContent></Dialog>
    </>
  )
}
