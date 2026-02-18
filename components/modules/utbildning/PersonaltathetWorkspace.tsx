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
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { Plus, Pencil, Trash2, Loader2, Users, AlertTriangle } from 'lucide-react'
import { cn } from '@/lib/utils'

interface ModuleWorkspaceProps {
  module: { slug: string; name: string; cat: string; desc: string; longDesc: string }
  sectorSlug: string
  settingsHref: string
}

type GroupType = 'Småbarn (1-3 år)' | 'Storabarn (3-5 år)' | 'Fritids' | 'Skolklass'

interface GroupEntry {
  id: string
  name: string
  groupType: GroupType
  childCount: number
  staffCount: number
  staffFTE: number
}

const GROUP_TYPES: GroupType[] = ['Småbarn (1-3 år)', 'Storabarn (3-5 år)', 'Fritids', 'Skolklass']
const RECOMMENDED_RATIO: Record<GroupType, number> = {
  'Småbarn (1-3 år)': 5.0,
  'Storabarn (3-5 år)': 6.0,
  'Fritids': 12.0,
  'Skolklass': 13.0,
}

function fmt(n: number): string { return new Intl.NumberFormat('sv-SE', { maximumFractionDigits: 1 }).format(n) }

const EMPTY_FORM = { name: '', groupType: 'Storabarn (3-5 år)' as GroupType, childCount: 0, staffCount: 0, staffFTE: 0 }

export function PersonaltathetWorkspace({ module: mod, sectorSlug, settingsHref }: ModuleWorkspaceProps) {
  const supabase = createClient()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [groups, setGroups] = useState<GroupEntry[]>([])
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<GroupEntry | null>(null)
  const [form, setForm] = useState(EMPTY_FORM)

  const saveGroups = useCallback(async (items: GroupEntry[]) => {
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setSaving(false); return }
    await supabase.from('module_configs').upsert(
      { user_id: user.id, sector_slug: sectorSlug, module_slug: mod.slug, config_key: 'groups', config_value: items },
      { onConflict: 'user_id,sector_slug,module_slug,config_key' }
    )
    setSaving(false)
  }, [supabase, sectorSlug, mod.slug])

  const fetchGroups = useCallback(async () => {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); return }
    const { data } = await supabase.from('module_configs').select('config_value')
      .eq('user_id', user.id).eq('sector_slug', sectorSlug).eq('module_slug', mod.slug).eq('config_key', 'groups').maybeSingle()
    if (data?.config_value && Array.isArray(data.config_value)) setGroups(data.config_value as GroupEntry[])
    setLoading(false)
  }, [supabase, sectorSlug, mod.slug])

  useEffect(() => { fetchGroups() }, [fetchGroups])

  const totalChildren = useMemo(() => groups.reduce((s, g) => s + g.childCount, 0), [groups])
  const totalStaff = useMemo(() => groups.reduce((s, g) => s + g.staffFTE, 0), [groups])
  const overallRatio = useMemo(() => totalStaff > 0 ? totalChildren / totalStaff : 0, [totalChildren, totalStaff])
  const underStaffed = useMemo(() => groups.filter(g => {
    const ratio = g.staffFTE > 0 ? g.childCount / g.staffFTE : Infinity
    return ratio > RECOMMENDED_RATIO[g.groupType]
  }).length, [groups])

  function openNew() { setEditing(null); setForm({ ...EMPTY_FORM }); setDialogOpen(true) }
  function openEdit(g: GroupEntry) { setEditing(g); setForm({ name: g.name, groupType: g.groupType, childCount: g.childCount, staffCount: g.staffCount, staffFTE: g.staffFTE }); setDialogOpen(true) }

  async function handleSave() {
    const entry: GroupEntry = { id: editing?.id ?? crypto.randomUUID(), ...form }
    const updated = editing ? groups.map(g => g.id === editing.id ? entry : g) : [...groups, entry]
    setGroups(updated); setDialogOpen(false); await saveGroups(updated)
  }

  async function handleDelete(id: string) {
    const updated = groups.filter(g => g.id !== id)
    setGroups(updated); await saveGroups(updated)
  }

  return (
    <>
      <ModuleWorkspaceShell title={mod.name} description={mod.desc} category="rapport" sectorName="Utbildning & Förskola" backHref={`/m/${sectorSlug}`} settingsHref={settingsHref}
        actions={<Button onClick={openNew}><Plus className="mr-2 h-4 w-4" />Ny grupp</Button>}>
        <Tabs defaultValue="oversikt" className="space-y-6">
          <TabsList>
            <TabsTrigger value="oversikt">Översikt</TabsTrigger>
            <TabsTrigger value="rekommendation">Riktvärden</TabsTrigger>
          </TabsList>

          <TabsContent value="oversikt" className="space-y-6">
            {loading ? (
              <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
            ) : (
              <>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  <KPICard label="Totalt barn" value={totalChildren} />
                  <KPICard label="Total personal (HTE)" value={fmt(totalStaff)} />
                  <KPICard label="Barn per HTE" value={fmt(overallRatio)} trend={overallRatio > 6 ? 'down' : 'up'} />
                  <KPICard label="Underbemannade grupper" value={underStaffed} trend={underStaffed > 0 ? 'down' : 'neutral'} />
                </div>

                {groups.length === 0 ? (
                  <EmptyModuleState icon={Users} title="Inga grupper" description="Lägg till barngrupper för att analysera personaltäthet och jämföra mot riktvärden." actionLabel="Ny grupp" onAction={openNew} />
                ) : (
                  <div className="rounded-xl border border-border overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-muted/50">
                          <TableHead className="font-medium">Grupp</TableHead>
                          <TableHead className="font-medium">Typ</TableHead>
                          <TableHead className="font-medium text-right">Barn</TableHead>
                          <TableHead className="font-medium text-right">Personal (HTE)</TableHead>
                          <TableHead className="font-medium text-right">Barn/HTE</TableHead>
                          <TableHead className="font-medium text-right">Riktvärde</TableHead>
                          <TableHead className="font-medium text-right">Åtgärder</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {groups.map(g => {
                          const ratio = g.staffFTE > 0 ? g.childCount / g.staffFTE : 0
                          const rec = RECOMMENDED_RATIO[g.groupType]
                          const overLimit = ratio > rec
                          return (
                            <TableRow key={g.id}>
                              <TableCell className="font-medium">
                                <div className="flex items-center gap-2">
                                  {g.name}
                                  {overLimit && <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />}
                                </div>
                              </TableCell>
                              <TableCell>{g.groupType}</TableCell>
                              <TableCell className="text-right tabular-nums">{g.childCount}</TableCell>
                              <TableCell className="text-right tabular-nums">{fmt(g.staffFTE)}</TableCell>
                              <TableCell className={cn('text-right tabular-nums font-medium', overLimit && 'text-amber-600')}>{fmt(ratio)}</TableCell>
                              <TableCell className="text-right tabular-nums text-muted-foreground">{rec}</TableCell>
                              <TableCell className="text-right">
                                <div className="flex items-center justify-end gap-1">
                                  <Button variant="ghost" size="icon" onClick={() => openEdit(g)}><Pencil className="h-4 w-4" /></Button>
                                  <Button variant="ghost" size="icon" className="text-red-600 hover:text-red-700" onClick={() => handleDelete(g.id)}><Trash2 className="h-4 w-4" /></Button>
                                </div>
                              </TableCell>
                            </TableRow>
                          )
                        })}
                      </TableBody>
                    </Table>
                  </div>
                )}
                {saving && <div className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" />Sparar...</div>}
              </>
            )}
          </TabsContent>

          <TabsContent value="rekommendation" className="space-y-4">
            <div className="rounded-xl border border-border bg-card p-6 max-w-lg space-y-3">
              <h3 className="text-sm font-semibold">Skolverkets riktvärden</h3>
              <ul className="text-sm text-muted-foreground space-y-2 list-disc pl-4">
                <li>Småbarn (1-3 år): max <strong>5.0</strong> barn per heltidstjänst</li>
                <li>Storabarn (3-5 år): max <strong>6.0</strong> barn per heltidstjänst</li>
                <li>Fritids: max <strong>12.0</strong> barn per heltidstjänst</li>
                <li>Skolklass: max <strong>13.0</strong> elever per pedagog</li>
              </ul>
            </div>
          </TabsContent>
        </Tabs>
      </ModuleWorkspaceShell>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{editing ? 'Redigera grupp' : 'Ny grupp'}</DialogTitle><DialogDescription>Fyll i uppgifter om barngruppen.</DialogDescription></DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-2"><Label>Gruppnamn *</Label><Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Fjärilarna" /></div>
            <div className="grid gap-2"><Label>Typ *</Label>
              <Select value={form.groupType} onValueChange={v => setForm(f => ({ ...f, groupType: v as GroupType }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{GROUP_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="grid gap-2"><Label>Antal barn</Label><Input type="number" value={form.childCount || ''} onChange={e => setForm(f => ({ ...f, childCount: parseInt(e.target.value) || 0 }))} /></div>
              <div className="grid gap-2"><Label>Antal personal</Label><Input type="number" value={form.staffCount || ''} onChange={e => setForm(f => ({ ...f, staffCount: parseInt(e.target.value) || 0 }))} /></div>
              <div className="grid gap-2"><Label>HTE</Label><Input type="number" step="0.1" value={form.staffFTE || ''} onChange={e => setForm(f => ({ ...f, staffFTE: parseFloat(e.target.value) || 0 }))} /></div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Avbryt</Button>
            <Button onClick={handleSave} disabled={!form.name.trim()}>{editing ? 'Uppdatera' : 'Lägg till'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
