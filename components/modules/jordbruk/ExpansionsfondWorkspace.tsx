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
import { Plus, Pencil, Trash2, Loader2, PiggyBank } from 'lucide-react'
import { Badge } from '@/components/ui/badge'

interface ModuleWorkspaceProps {
  module: { slug: string; name: string; cat: string; desc: string; longDesc: string }
  sectorSlug: string
  settingsHref: string
}

interface FundEntry { id: string; year: number; type: 'Avsättning' | 'Återföring'; amount: number; taxEffect: number; description: string }

const TAX_RATE = 0.206
function fmt(n: number): string { return new Intl.NumberFormat('sv-SE', { maximumFractionDigits: 0 }).format(n) }

export function ExpansionsfondWorkspace({ module: mod, sectorSlug, settingsHref }: ModuleWorkspaceProps) {
  const supabase = createClient()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [entries, setEntries] = useState<FundEntry[]>([])
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<FundEntry | null>(null)
  const [form, setForm] = useState({ year: new Date().getFullYear(), type: 'Avsättning' as 'Avsättning' | 'Återföring', amount: 0, description: '' })

  const saveData = useCallback(async (items: FundEntry[]) => {
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setSaving(false); return }
    await supabase.from('module_configs').upsert(
      { user_id: user.id, sector_slug: sectorSlug, module_slug: mod.slug, config_key: 'expansion_fund', config_value: items },
      { onConflict: 'user_id,sector_slug,module_slug,config_key' }
    )
    setSaving(false)
  }, [supabase, sectorSlug, mod.slug])

  const fetchData = useCallback(async () => {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); return }
    const { data } = await supabase.from('module_configs').select('config_value')
      .eq('user_id', user.id).eq('sector_slug', sectorSlug).eq('module_slug', mod.slug).eq('config_key', 'expansion_fund').maybeSingle()
    if (data?.config_value && Array.isArray(data.config_value)) setEntries(data.config_value as FundEntry[])
    setLoading(false)
  }, [supabase, sectorSlug, mod.slug])

  useEffect(() => { fetchData() }, [fetchData])

  const totalAllocated = useMemo(() => entries.filter(e => e.type === 'Avsättning').reduce((s, e) => s + e.amount, 0), [entries])
  const totalReversed = useMemo(() => entries.filter(e => e.type === 'Återföring').reduce((s, e) => s + e.amount, 0), [entries])
  const balance = totalAllocated - totalReversed
  const totalTax = useMemo(() => entries.reduce((s, e) => s + e.taxEffect, 0), [entries])

  function openNew() { setEditing(null); setForm({ year: new Date().getFullYear(), type: 'Avsättning', amount: 0, description: '' }); setDialogOpen(true) }
  function openEdit(e: FundEntry) { setEditing(e); setForm({ year: e.year, type: e.type, amount: e.amount, description: e.description }); setDialogOpen(true) }

  async function handleSave() {
    const taxEffect = form.type === 'Avsättning' ? Math.round(form.amount * TAX_RATE) : -Math.round(form.amount * TAX_RATE)
    const entry: FundEntry = { id: editing?.id ?? crypto.randomUUID(), ...form, taxEffect }
    const updated = editing ? entries.map(e => e.id === editing.id ? entry : e) : [...entries, entry]
    setEntries(updated); setDialogOpen(false); await saveData(updated)
  }

  async function handleDelete(id: string) { const updated = entries.filter(e => e.id !== id); setEntries(updated); await saveData(updated) }

  return (
    <>
      <ModuleWorkspaceShell title={mod.name} description={mod.desc} category="bokforing" sectorName="Jordbruk & Livsmedel" backHref={`/m/${sectorSlug}`} settingsHref={settingsHref}
        actions={<Button onClick={openNew}><Plus className="mr-2 h-4 w-4" />Ny post</Button>}>
        <Tabs defaultValue="oversikt" className="space-y-6">
          <TabsList><TabsTrigger value="oversikt">Översikt</TabsTrigger><TabsTrigger value="regler">Regler NE</TabsTrigger></TabsList>
          <TabsContent value="oversikt" className="space-y-6">
            {loading ? <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div> : (
              <>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  <KPICard label="Saldo expansionsfond" value={fmt(balance)} unit="kr" />
                  <KPICard label="Avsättningar" value={fmt(totalAllocated)} unit="kr" />
                  <KPICard label="Återföringar" value={fmt(totalReversed)} unit="kr" />
                  <KPICard label="Expansionsfondsskatt" value={fmt(totalTax)} unit="kr" />
                </div>
                {entries.length === 0 ? <EmptyModuleState icon={PiggyBank} title="Ingen expansionsfond" description="Registrera avsättningar till expansionsfond (20.6% skatt) för enskild firma." actionLabel="Ny post" onAction={openNew} /> : (
                  <div className="rounded-xl border border-border overflow-hidden">
                    <Table><TableHeader><TableRow className="bg-muted/50"><TableHead className="font-medium">År</TableHead><TableHead className="font-medium">Typ</TableHead><TableHead className="font-medium text-right">Belopp</TableHead><TableHead className="font-medium text-right">Skatteeffekt</TableHead><TableHead className="font-medium">Beskrivning</TableHead><TableHead className="font-medium text-right">Åtgärder</TableHead></TableRow></TableHeader>
                      <TableBody>{entries.sort((a, b) => b.year - a.year).map(e => (
                        <TableRow key={e.id}><TableCell>{e.year}</TableCell><TableCell><Badge variant={e.type === 'Avsättning' ? 'default' : 'secondary'}>{e.type}</Badge></TableCell><TableCell className="text-right tabular-nums font-medium">{fmt(e.amount)} kr</TableCell><TableCell className="text-right tabular-nums">{fmt(e.taxEffect)} kr</TableCell><TableCell className="text-muted-foreground">{e.description}</TableCell>
                          <TableCell className="text-right"><div className="flex items-center justify-end gap-1"><Button variant="ghost" size="icon" onClick={() => openEdit(e)}><Pencil className="h-4 w-4" /></Button><Button variant="ghost" size="icon" className="text-red-600" onClick={() => handleDelete(e.id)}><Trash2 className="h-4 w-4" /></Button></div></TableCell></TableRow>
                      ))}</TableBody></Table></div>
                )}
                {saving && <div className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" />Sparar...</div>}
              </>
            )}
          </TabsContent>
          <TabsContent value="regler" className="space-y-4">
            <div className="rounded-xl border border-border bg-card p-6 max-w-lg space-y-3">
              <h3 className="text-sm font-semibold">Regler expansionsfond</h3>
              <ul className="text-sm text-muted-foreground space-y-2 list-disc pl-4">
                <li>Expansionsfondsskatt: <strong>20.6%</strong> vid avsättning</li>
                <li>Skatten betalas tillbaka vid återföring</li>
                <li>Redovisas i NE-bilagan i deklarationen</li>
                <li>Möjliggör kvarhållande av vinst i enskild firma till lägre skatt</li>
              </ul>
            </div>
          </TabsContent>
        </Tabs>
      </ModuleWorkspaceShell>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}><DialogContent className="max-w-md"><DialogHeader><DialogTitle>{editing ? 'Redigera' : 'Ny post'}</DialogTitle><DialogDescription>Avsättning eller återföring av expansionsfond.</DialogDescription></DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2"><Label>År *</Label><Input type="number" value={form.year} onChange={e => setForm(f => ({ ...f, year: parseInt(e.target.value) || 0 }))} /></div>
            <div className="grid gap-2"><Label>Typ</Label><select className="h-10 rounded-md border border-input bg-background px-3 text-sm" value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value as 'Avsättning' | 'Återföring' }))}><option value="Avsättning">Avsättning</option><option value="Återföring">Återföring</option></select></div>
          </div>
          <div className="grid gap-2"><Label>Belopp (kr) *</Label><Input type="number" value={form.amount || ''} onChange={e => setForm(f => ({ ...f, amount: parseFloat(e.target.value) || 0 }))} /></div>
          <div className="rounded-lg bg-muted/30 p-3"><p className="text-xs text-muted-foreground">Skatteeffekt (20.6%): <strong>{fmt(Math.round(form.amount * TAX_RATE))} kr</strong></p></div>
          <div className="grid gap-2"><Label>Beskrivning</Label><Input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} /></div>
        </div>
        <DialogFooter><Button variant="outline" onClick={() => setDialogOpen(false)}>Avbryt</Button><Button onClick={handleSave} disabled={!form.amount}>{editing ? 'Uppdatera' : 'Lägg till'}</Button></DialogFooter></DialogContent></Dialog>
    </>
  )
}
