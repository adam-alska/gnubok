'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { ModuleWorkspaceShell } from '@/components/modules/ModuleWorkspaceShell'
import { EmptyModuleState } from '@/components/modules/shared/EmptyModuleState'
import { KPICard } from '@/components/modules/shared/KPICard'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { Plus, Pencil, Trash2, Loader2, TreePine } from 'lucide-react'
import { Badge } from '@/components/ui/badge'

interface ModuleWorkspaceProps {
  module: { slug: string; name: string; cat: string; desc: string; longDesc: string }
  sectorSlug: string
  settingsHref: string
}

interface ForestTransaction {
  id: string
  date: string
  type: 'Insättning' | 'Uttag'
  amount: number
  forestIncome: number
  description: string
}

function fmt(n: number): string { return new Intl.NumberFormat('sv-SE', { maximumFractionDigits: 0 }).format(n) }
const MAX_DEPOSIT_RATE = 0.6

const EMPTY_FORM = { date: '', type: 'Insättning' as 'Insättning' | 'Uttag', amount: 0, forestIncome: 0, description: '' }

export function SkogskontoWorkspace({ module: mod, sectorSlug, settingsHref }: ModuleWorkspaceProps) {
  const supabase = createClient()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [transactions, setTransactions] = useState<ForestTransaction[]>([])
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<ForestTransaction | null>(null)
  const [form, setForm] = useState(EMPTY_FORM)

  const saveData = useCallback(async (items: ForestTransaction[]) => {
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setSaving(false); return }
    await supabase.from('module_configs').upsert(
      { user_id: user.id, sector_slug: sectorSlug, module_slug: mod.slug, config_key: 'forest_transactions', config_value: items },
      { onConflict: 'user_id,sector_slug,module_slug,config_key' }
    )
    setSaving(false)
  }, [supabase, sectorSlug, mod.slug])

  const fetchData = useCallback(async () => {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); return }
    const { data } = await supabase.from('module_configs').select('config_value')
      .eq('user_id', user.id).eq('sector_slug', sectorSlug).eq('module_slug', mod.slug).eq('config_key', 'forest_transactions').maybeSingle()
    if (data?.config_value && Array.isArray(data.config_value)) setTransactions(data.config_value as ForestTransaction[])
    setLoading(false)
  }, [supabase, sectorSlug, mod.slug])

  useEffect(() => { fetchData() }, [fetchData])

  const totalDeposits = useMemo(() => transactions.filter(t => t.type === 'Insättning').reduce((s, t) => s + t.amount, 0), [transactions])
  const totalWithdrawals = useMemo(() => transactions.filter(t => t.type === 'Uttag').reduce((s, t) => s + t.amount, 0), [transactions])
  const balance = totalDeposits - totalWithdrawals
  const totalForestIncome = useMemo(() => transactions.filter(t => t.type === 'Insättning').reduce((s, t) => s + t.forestIncome, 0), [transactions])
  const maxAllowed = totalForestIncome * MAX_DEPOSIT_RATE

  function openNew() { setEditing(null); setForm({ ...EMPTY_FORM }); setDialogOpen(true) }
  function openEdit(t: ForestTransaction) { setEditing(t); setForm({ date: t.date, type: t.type, amount: t.amount, forestIncome: t.forestIncome, description: t.description }); setDialogOpen(true) }

  async function handleSave() {
    const entry: ForestTransaction = { id: editing?.id ?? crypto.randomUUID(), ...form }
    const updated = editing ? transactions.map(t => t.id === editing.id ? entry : t) : [...transactions, entry]
    setTransactions(updated); setDialogOpen(false); await saveData(updated)
  }

  async function handleDelete(id: string) {
    const updated = transactions.filter(t => t.id !== id)
    setTransactions(updated); await saveData(updated)
  }

  return (
    <>
      <ModuleWorkspaceShell title={mod.name} description={mod.desc} category="bokforing" sectorName="Jordbruk & Livsmedel" backHref={`/m/${sectorSlug}`} settingsHref={settingsHref}
        actions={<Button onClick={openNew}><Plus className="mr-2 h-4 w-4" />Ny transaktion</Button>}>
        <Tabs defaultValue="oversikt" className="space-y-6">
          <TabsList><TabsTrigger value="oversikt">Översikt</TabsTrigger><TabsTrigger value="regler">Regler</TabsTrigger></TabsList>

          <TabsContent value="oversikt" className="space-y-6">
            {loading ? <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div> : (
              <>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  <KPICard label="Saldo konto 1760" value={fmt(balance)} unit="kr" />
                  <KPICard label="Insättningar" value={fmt(totalDeposits)} unit="kr" />
                  <KPICard label="Uttag" value={fmt(totalWithdrawals)} unit="kr" />
                  <KPICard label="Max insättning (60%)" value={fmt(maxAllowed)} unit="kr" trend={totalDeposits > maxAllowed ? 'down' : 'up'} />
                </div>
                {transactions.length === 0 ? <EmptyModuleState icon={TreePine} title="Inga transaktioner" description="Registrera insättningar och uttag på skogskontot (konto 1760)." actionLabel="Ny transaktion" onAction={openNew} /> : (
                  <div className="rounded-xl border border-border overflow-hidden">
                    <Table><TableHeader><TableRow className="bg-muted/50">
                      <TableHead className="font-medium">Datum</TableHead><TableHead className="font-medium">Typ</TableHead><TableHead className="font-medium text-right">Belopp</TableHead><TableHead className="font-medium text-right">Skogsinkomst</TableHead><TableHead className="font-medium">Beskrivning</TableHead><TableHead className="font-medium text-right">Åtgärder</TableHead>
                    </TableRow></TableHeader><TableBody>
                      {transactions.sort((a, b) => b.date.localeCompare(a.date)).map(t => (
                        <TableRow key={t.id}>
                          <TableCell>{t.date}</TableCell><TableCell><Badge variant={t.type === 'Insättning' ? 'default' : 'secondary'}>{t.type}</Badge></TableCell>
                          <TableCell className="text-right tabular-nums font-medium">{fmt(t.amount)} kr</TableCell><TableCell className="text-right tabular-nums">{t.forestIncome ? fmt(t.forestIncome) + ' kr' : '-'}</TableCell>
                          <TableCell className="text-muted-foreground">{t.description}</TableCell>
                          <TableCell className="text-right"><div className="flex items-center justify-end gap-1"><Button variant="ghost" size="icon" onClick={() => openEdit(t)}><Pencil className="h-4 w-4" /></Button><Button variant="ghost" size="icon" className="text-red-600" onClick={() => handleDelete(t.id)}><Trash2 className="h-4 w-4" /></Button></div></TableCell>
                        </TableRow>))}
                    </TableBody></Table></div>
                )}
                {saving && <div className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" />Sparar...</div>}
              </>
            )}
          </TabsContent>

          <TabsContent value="regler" className="space-y-4">
            <div className="rounded-xl border border-border bg-card p-6 max-w-lg space-y-3">
              <h3 className="text-sm font-semibold">Regler skogskonto</h3>
              <ul className="text-sm text-muted-foreground space-y-2 list-disc pl-4">
                <li>Max insättning: <strong>60%</strong> av skogsinkomsten</li>
                <li>Konto <strong>1760</strong> - Skogskonto</li>
                <li>Beskattas vid uttag som inkomst av näringsverksamhet</li>
                <li>Insättningen ska göras senast den dag deklarationen ska lämnas</li>
              </ul>
            </div>
          </TabsContent>
        </Tabs>
      </ModuleWorkspaceShell>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md"><DialogHeader><DialogTitle>{editing ? 'Redigera' : 'Ny transaktion'}</DialogTitle><DialogDescription>Registrera insättning eller uttag.</DialogDescription></DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2"><Label>Datum *</Label><Input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} /></div>
              <div className="grid gap-2"><Label>Typ</Label>
                <select className="h-10 rounded-md border border-input bg-background px-3 text-sm" value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value as 'Insättning' | 'Uttag' }))}>
                  <option value="Insättning">Insättning</option><option value="Uttag">Uttag</option>
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2"><Label>Belopp (kr) *</Label><Input type="number" value={form.amount || ''} onChange={e => setForm(f => ({ ...f, amount: parseFloat(e.target.value) || 0 }))} /></div>
              {form.type === 'Insättning' && <div className="grid gap-2"><Label>Skogsinkomst (kr)</Label><Input type="number" value={form.forestIncome || ''} onChange={e => setForm(f => ({ ...f, forestIncome: parseFloat(e.target.value) || 0 }))} /></div>}
            </div>
            <div className="grid gap-2"><Label>Beskrivning</Label><Input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Virkesförsäljning..." /></div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setDialogOpen(false)}>Avbryt</Button><Button onClick={handleSave} disabled={!form.date || !form.amount}>{editing ? 'Uppdatera' : 'Lägg till'}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
