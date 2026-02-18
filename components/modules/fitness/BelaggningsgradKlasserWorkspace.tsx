'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { ModuleWorkspaceShell } from '@/components/modules/ModuleWorkspaceShell'
import { KPICard } from '@/components/modules/shared/KPICard'
import { EmptyModuleState } from '@/components/modules/shared/EmptyModuleState'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Plus, Pencil, Trash2, Loader2, BarChart3 } from 'lucide-react'

interface ModuleWorkspaceProps {
  module: { slug: string; name: string; cat: string; desc: string; longDesc: string }
  sectorSlug: string
  settingsHref: string
}

interface ClassData {
  id: string
  class_name: string
  day: string
  time: string
  capacity: number
  booked: number
  instructor: string
}

function fmt(n: number): string { return new Intl.NumberFormat('sv-SE', { maximumFractionDigits: 0 }).format(n) }
function fmtPct(n: number): string { return isFinite(n) ? n.toFixed(1) : '0.0' }
function generateId(): string { return Date.now().toString(36) + Math.random().toString(36).substring(2, 7) }

const DAYS = ['Måndag', 'Tisdag', 'Onsdag', 'Torsdag', 'Fredag', 'Lördag', 'Söndag']

const DEFAULT_DATA: ClassData[] = [
  { id: '1', class_name: 'Spinning', day: 'Måndag', time: '07:00', capacity: 25, booked: 24, instructor: 'Maria' },
  { id: '2', class_name: 'Yoga', day: 'Måndag', time: '12:00', capacity: 20, booked: 15, instructor: 'Lisa' },
  { id: '3', class_name: 'HIIT', day: 'Tisdag', time: '18:00', capacity: 30, booked: 28, instructor: 'Erik' },
  { id: '4', class_name: 'Bodypump', day: 'Onsdag', time: '17:00', capacity: 25, booked: 12, instructor: 'Anna' },
  { id: '5', class_name: 'Spinning', day: 'Torsdag', time: '07:00', capacity: 25, booked: 22, instructor: 'Maria' },
  { id: '6', class_name: 'Yoga', day: 'Fredag', time: '10:00', capacity: 20, booked: 18, instructor: 'Lisa' },
]

const EMPTY_FORM = { class_name: '', day: 'Måndag', time: '', capacity: '25', booked: '0', instructor: '' }

export function BelaggningsgradKlasserWorkspace({ module: mod, sectorSlug, settingsHref }: ModuleWorkspaceProps) {
  const supabase = createClient()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [classes, setClasses] = useState<ClassData[]>([])
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingClass, setEditingClass] = useState<ClassData | null>(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [classToDelete, setClassToDelete] = useState<ClassData | null>(null)

  const saveClasses = useCallback(async (newClasses: ClassData[]) => {
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setSaving(false); return }
    await supabase.from('module_configs').upsert(
      { user_id: user.id, sector_slug: sectorSlug, module_slug: mod.slug, config_key: 'class_data', config_value: newClasses },
      { onConflict: 'user_id,sector_slug,module_slug,config_key' }
    )
    setSaving(false)
  }, [supabase, sectorSlug, mod.slug])

  const fetchClasses = useCallback(async () => {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); return }
    const { data } = await supabase.from('module_configs').select('config_value').eq('user_id', user.id).eq('sector_slug', sectorSlug).eq('module_slug', mod.slug).eq('config_key', 'class_data').maybeSingle()
    if (data?.config_value && Array.isArray(data.config_value) && data.config_value.length > 0) { setClasses(data.config_value as ClassData[]) }
    else { setClasses(DEFAULT_DATA); await supabase.from('module_configs').upsert({ user_id: user.id, sector_slug: sectorSlug, module_slug: mod.slug, config_key: 'class_data', config_value: DEFAULT_DATA }, { onConflict: 'user_id,sector_slug,module_slug,config_key' }) }
    setLoading(false)
  }, [supabase, sectorSlug, mod.slug])

  useEffect(() => { fetchClasses() }, [fetchClasses])

  const stats = useMemo(() => {
    const totalCapacity = classes.reduce((s, c) => s + c.capacity, 0)
    const totalBooked = classes.reduce((s, c) => s + c.booked, 0)
    const avgFillRate = totalCapacity > 0 ? (totalBooked / totalCapacity) * 100 : 0
    const byClass: Record<string, { capacity: number; booked: number }> = {}
    for (const c of classes) { if (!byClass[c.class_name]) byClass[c.class_name] = { capacity: 0, booked: 0 }; byClass[c.class_name].capacity += c.capacity; byClass[c.class_name].booked += c.booked }
    const classStats = Object.entries(byClass).map(([name, { capacity, booked }]) => ({ name, capacity, booked, fillRate: capacity > 0 ? (booked / capacity) * 100 : 0 })).sort((a, b) => b.fillRate - a.fillRate)
    return { totalCapacity, totalBooked, avgFillRate, classStats, totalClasses: classes.length }
  }, [classes])

  function openNew() { setEditingClass(null); setForm({ ...EMPTY_FORM }); setDialogOpen(true) }
  function openEdit(c: ClassData) { setEditingClass(c); setForm({ class_name: c.class_name, day: c.day, time: c.time, capacity: String(c.capacity), booked: String(c.booked), instructor: c.instructor }); setDialogOpen(true) }

  async function handleSave() {
    const entry: ClassData = { id: editingClass?.id ?? generateId(), class_name: form.class_name.trim(), day: form.day, time: form.time, capacity: parseInt(form.capacity) || 0, booked: parseInt(form.booked) || 0, instructor: form.instructor.trim() }
    const updated = editingClass ? classes.map((c) => c.id === editingClass.id ? entry : c) : [...classes, entry]
    setClasses(updated); setDialogOpen(false); await saveClasses(updated)
  }

  function openDeleteConfirmation(c: ClassData) { setClassToDelete(c); setDeleteDialogOpen(true) }
  async function handleDelete() { if (!classToDelete) return; const updated = classes.filter((c) => c.id !== classToDelete.id); setClasses(updated); setDeleteDialogOpen(false); setClassToDelete(null); await saveClasses(updated) }

  return (
    <>
      <ModuleWorkspaceShell title={mod.name} description={mod.desc} category="rapport" sectorName="Fitness & Sport" backHref={`/m/${sectorSlug}`} settingsHref={settingsHref} actions={<Button onClick={openNew}><Plus className="mr-2 h-4 w-4" />Ny klass</Button>}>
        {loading ? (
          <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : (
          <Tabs defaultValue="oversikt" className="space-y-6">
            <TabsList><TabsTrigger value="oversikt">Översikt</TabsTrigger><TabsTrigger value="schema">Schema</TabsTrigger><TabsTrigger value="per-klass">Per klass</TabsTrigger></TabsList>

            <TabsContent value="oversikt" className="space-y-6">
              {classes.length === 0 ? (
                <EmptyModuleState icon={BarChart3} title="Inga klasser" description="Lägg till klasser för att analysera beläggningsgrad." actionLabel="Ny klass" onAction={openNew} />
              ) : (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  <KPICard label="Snitt beläggning" value={fmtPct(stats.avgFillRate)} unit="%" trend={stats.avgFillRate > 75 ? 'up' : stats.avgFillRate < 50 ? 'down' : 'neutral'} />
                  <KPICard label="Totalt bokade" value={fmt(stats.totalBooked)} unit="platser" />
                  <KPICard label="Total kapacitet" value={fmt(stats.totalCapacity)} unit="platser" />
                  <KPICard label="Antal pass" value={fmt(stats.totalClasses)} unit="st" />
                </div>
              )}
            </TabsContent>

            <TabsContent value="schema" className="space-y-4">
              {classes.length === 0 ? (
                <EmptyModuleState icon={BarChart3} title="Inga klasser" description="Lägg till klasser." />
              ) : (
                <div className="rounded-xl border border-border overflow-hidden">
                  <Table>
                    <TableHeader><TableRow className="bg-muted/50"><TableHead className="font-medium">Klass</TableHead><TableHead className="font-medium">Dag</TableHead><TableHead className="font-medium">Tid</TableHead><TableHead className="font-medium">Instruktör</TableHead><TableHead className="font-medium text-right">Bokade</TableHead><TableHead className="font-medium text-right">Kapacitet</TableHead><TableHead className="font-medium text-right">Beläggning</TableHead><TableHead className="font-medium text-right">Åtgärder</TableHead></TableRow></TableHeader>
                    <TableBody>
                      {classes.sort((a, b) => DAYS.indexOf(a.day) - DAYS.indexOf(b.day) || a.time.localeCompare(b.time)).map((c) => { const fill = c.capacity > 0 ? (c.booked / c.capacity) * 100 : 0; return (
                        <TableRow key={c.id}><TableCell className="font-medium">{c.class_name}</TableCell><TableCell>{c.day}</TableCell><TableCell>{c.time}</TableCell><TableCell>{c.instructor}</TableCell><TableCell className="text-right tabular-nums">{c.booked}</TableCell><TableCell className="text-right tabular-nums">{c.capacity}</TableCell><TableCell className="text-right"><Badge variant="secondary" className={fill >= 80 ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400' : fill >= 50 ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400' : 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400'}>{fmtPct(fill)}%</Badge></TableCell><TableCell className="text-right"><div className="flex items-center justify-end gap-1"><Button variant="ghost" size="icon" onClick={() => openEdit(c)}><Pencil className="h-4 w-4" /></Button><Button variant="ghost" size="icon" className="text-red-600 hover:text-red-700" onClick={() => openDeleteConfirmation(c)}><Trash2 className="h-4 w-4" /></Button></div></TableCell></TableRow>
                      ) })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </TabsContent>

            <TabsContent value="per-klass" className="space-y-4">
              {stats.classStats.length === 0 ? (
                <EmptyModuleState icon={BarChart3} title="Ingen data" description="Lägg till klasser." />
              ) : (
                <div className="rounded-xl border border-border overflow-hidden">
                  <Table>
                    <TableHeader><TableRow className="bg-muted/50"><TableHead className="font-medium">Klass</TableHead><TableHead className="font-medium text-right">Total kapacitet</TableHead><TableHead className="font-medium text-right">Totalt bokade</TableHead><TableHead className="font-medium text-right">Beläggning</TableHead></TableRow></TableHeader>
                    <TableBody>
                      {stats.classStats.map((c) => (
                        <TableRow key={c.name}><TableCell className="font-medium">{c.name}</TableCell><TableCell className="text-right tabular-nums">{fmt(c.capacity)}</TableCell><TableCell className="text-right tabular-nums">{fmt(c.booked)}</TableCell><TableCell className="text-right"><Badge variant="secondary" className={c.fillRate >= 80 ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400' : c.fillRate >= 50 ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400' : 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400'}>{fmtPct(c.fillRate)}%</Badge></TableCell></TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </TabsContent>
          </Tabs>
        )}
      </ModuleWorkspaceShell>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{editingClass ? 'Redigera klass' : 'Ny klass'}</DialogTitle><DialogDescription>{editingClass ? 'Uppdatera klassens uppgifter.' : 'Lägg till ett nytt gruppträningspass.'}</DialogDescription></DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid grid-cols-2 gap-4"><div className="grid gap-2"><Label>Klassnamn *</Label><Input value={form.class_name} onChange={(e) => setForm((f) => ({ ...f, class_name: e.target.value }))} placeholder="Spinning" /></div><div className="grid gap-2"><Label>Instruktör</Label><Input value={form.instructor} onChange={(e) => setForm((f) => ({ ...f, instructor: e.target.value }))} placeholder="Maria" /></div></div>
            <div className="grid grid-cols-3 gap-4"><div className="grid gap-2"><Label>Dag *</Label><Input value={form.day} onChange={(e) => setForm((f) => ({ ...f, day: e.target.value }))} placeholder="Måndag" /></div><div className="grid gap-2"><Label>Tid *</Label><Input type="time" value={form.time} onChange={(e) => setForm((f) => ({ ...f, time: e.target.value }))} /></div><div className="grid gap-2"><Label>Kapacitet *</Label><Input type="number" min={1} value={form.capacity} onChange={(e) => setForm((f) => ({ ...f, capacity: e.target.value }))} /></div></div>
            <div className="grid gap-2"><Label>Bokade</Label><Input type="number" min={0} value={form.booked} onChange={(e) => setForm((f) => ({ ...f, booked: e.target.value }))} /></div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setDialogOpen(false)}>Avbryt</Button><Button onClick={handleSave} disabled={!form.class_name.trim() || !form.day || !form.time}>{editingClass ? 'Uppdatera' : 'Skapa'}</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Ta bort klass</DialogTitle><DialogDescription>Är du säker på att du vill ta bort <span className="font-semibold">{classToDelete?.class_name}</span> ({classToDelete?.day} {classToDelete?.time})?</DialogDescription></DialogHeader>
          <DialogFooter><Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>Avbryt</Button><Button variant="destructive" onClick={handleDelete}><Trash2 className="mr-2 h-4 w-4" />Ta bort</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
