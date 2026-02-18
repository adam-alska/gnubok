'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { ModuleWorkspaceShell } from '@/components/modules/ModuleWorkspaceShell'
import { EmptyModuleState } from '@/components/modules/shared/EmptyModuleState'
import { StatusBadge } from '@/components/modules/shared/StatusBadge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Plus, Pencil, Trash2, Loader2, Wrench, AlertTriangle } from 'lucide-react'

interface ModuleWorkspaceProps { module: { slug: string; name: string; cat: string; desc: string; longDesc: string }; sectorSlug: string; settingsHref: string }

interface Machine { id: string; name: string; model: string; hours: number; nextService: number; lastServiceDate: string; notes: string }
interface LogEntry { id: string; machineId: string; machineName: string; date: string; hours: number; task: string }

const EMPTY_MACHINE = { name: '', model: '', hours: 0, nextService: 500, lastServiceDate: '', notes: '' }
const EMPTY_LOG = { machineId: '', date: '', hours: 0, task: '' }

export function MaskinloggWorkspace({ module: mod, sectorSlug, settingsHref }: ModuleWorkspaceProps) {
  const supabase = createClient()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [machines, setMachines] = useState<Machine[]>([])
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [activeTab, setActiveTab] = useState('maskiner')
  const [machDialogOpen, setMachDialogOpen] = useState(false)
  const [editingMach, setEditingMach] = useState<Machine | null>(null)
  const [machForm, setMachForm] = useState(EMPTY_MACHINE)
  const [logDialogOpen, setLogDialogOpen] = useState(false)
  const [logForm, setLogForm] = useState(EMPTY_LOG)

  const saveData = useCallback(async (m: Machine[], l: LogEntry[]) => {
    setSaving(true); const { data: { user } } = await supabase.auth.getUser(); if (!user) { setSaving(false); return }
    await Promise.all([
      supabase.from('module_configs').upsert({ user_id: user.id, sector_slug: sectorSlug, module_slug: mod.slug, config_key: 'machines', config_value: m }, { onConflict: 'user_id,sector_slug,module_slug,config_key' }),
      supabase.from('module_configs').upsert({ user_id: user.id, sector_slug: sectorSlug, module_slug: mod.slug, config_key: 'machine_logs', config_value: l }, { onConflict: 'user_id,sector_slug,module_slug,config_key' }),
    ]); setSaving(false)
  }, [supabase, sectorSlug, mod.slug])

  const fetchData = useCallback(async () => {
    setLoading(true); const { data: { user } } = await supabase.auth.getUser(); if (!user) { setLoading(false); return }
    const [{ data: m }, { data: l }] = await Promise.all([
      supabase.from('module_configs').select('config_value').eq('user_id', user.id).eq('sector_slug', sectorSlug).eq('module_slug', mod.slug).eq('config_key', 'machines').maybeSingle(),
      supabase.from('module_configs').select('config_value').eq('user_id', user.id).eq('sector_slug', sectorSlug).eq('module_slug', mod.slug).eq('config_key', 'machine_logs').maybeSingle(),
    ])
    if (m?.config_value && Array.isArray(m.config_value)) setMachines(m.config_value as Machine[])
    if (l?.config_value && Array.isArray(l.config_value)) setLogs(l.config_value as LogEntry[])
    setLoading(false)
  }, [supabase, sectorSlug, mod.slug])

  useEffect(() => { fetchData() }, [fetchData])

  const serviceAlerts = useMemo(() => machines.filter(m => m.hours >= m.nextService), [machines])

  function openNewMach() { setEditingMach(null); setMachForm({ ...EMPTY_MACHINE }); setMachDialogOpen(true) }
  function openEditMach(m: Machine) { setEditingMach(m); setMachForm({ name: m.name, model: m.model, hours: m.hours, nextService: m.nextService, lastServiceDate: m.lastServiceDate, notes: m.notes }); setMachDialogOpen(true) }
  async function handleSaveMach() { const entry: Machine = { id: editingMach?.id ?? crypto.randomUUID(), ...machForm }; const updated = editingMach ? machines.map(m => m.id === editingMach.id ? entry : m) : [...machines, entry]; setMachines(updated); setMachDialogOpen(false); await saveData(updated, logs) }
  async function handleDeleteMach(id: string) { const updated = machines.filter(m => m.id !== id); setMachines(updated); await saveData(updated, logs) }

  function openNewLog() { setLogForm({ ...EMPTY_LOG }); setLogDialogOpen(true) }
  async function handleSaveLog() { const mach = machines.find(m => m.id === logForm.machineId); const entry: LogEntry = { id: crypto.randomUUID(), ...logForm, machineName: mach?.name ?? '' }; const updated = [...logs, entry]; setLogs(updated); setLogDialogOpen(false); await saveData(machines, updated) }

  return (
    <>
      <ModuleWorkspaceShell title={mod.name} description={mod.desc} category="operativ" sectorName="Jordbruk & Livsmedel" backHref={`/m/${sectorSlug}`} settingsHref={settingsHref}
        actions={<div className="flex gap-2"><Button variant="outline" onClick={openNewLog}>Logga timmar</Button><Button onClick={openNewMach}><Plus className="mr-2 h-4 w-4" />Ny maskin</Button></div>}>
        {serviceAlerts.length > 0 && (
          <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 px-4 py-3 mb-4 space-y-1">
            <div className="flex items-center gap-2 text-sm font-medium text-amber-700"><AlertTriangle className="h-4 w-4" />Service påminnelse</div>
            {serviceAlerts.map(m => <p key={m.id} className="text-xs text-amber-600">{m.name}: {m.hours}h (service vid {m.nextService}h)</p>)}
          </div>
        )}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList><TabsTrigger value="maskiner">Maskiner</TabsTrigger><TabsTrigger value="logg">Timlogg</TabsTrigger></TabsList>
          <TabsContent value="maskiner" className="space-y-4">
            {loading ? <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div> : machines.length === 0 ? <EmptyModuleState icon={Wrench} title="Inga maskiner" description="Registrera maskiner med timmar och servicepåminnelser." actionLabel="Ny maskin" onAction={openNewMach} /> : (
              <div className="rounded-xl border border-border overflow-hidden">
                <Table><TableHeader><TableRow className="bg-muted/50"><TableHead className="font-medium">Maskin</TableHead><TableHead className="font-medium">Modell</TableHead><TableHead className="font-medium text-right">Timmar</TableHead><TableHead className="font-medium text-right">Nästa service</TableHead><TableHead className="font-medium">Senaste service</TableHead><TableHead className="font-medium text-right">Åtgärder</TableHead></TableRow></TableHeader>
                  <TableBody>{machines.map(m => (
                    <TableRow key={m.id}><TableCell className="font-medium"><div className="flex items-center gap-2">{m.name}{m.hours >= m.nextService && <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />}</div></TableCell><TableCell>{m.model}</TableCell><TableCell className="text-right tabular-nums">{m.hours}h</TableCell><TableCell className="text-right tabular-nums">{m.nextService}h</TableCell><TableCell>{m.lastServiceDate || '-'}</TableCell>
                      <TableCell className="text-right"><div className="flex items-center justify-end gap-1"><Button variant="ghost" size="icon" onClick={() => openEditMach(m)}><Pencil className="h-4 w-4" /></Button><Button variant="ghost" size="icon" className="text-red-600" onClick={() => handleDeleteMach(m.id)}><Trash2 className="h-4 w-4" /></Button></div></TableCell></TableRow>
                  ))}</TableBody></Table></div>
            )}
          </TabsContent>
          <TabsContent value="logg" className="space-y-4">
            {logs.length === 0 ? <EmptyModuleState icon={Wrench} title="Ingen logg" description="Logga maskintimmar för att spåra användning." actionLabel="Logga timmar" onAction={openNewLog} /> : (
              <div className="rounded-xl border border-border overflow-hidden">
                <Table><TableHeader><TableRow className="bg-muted/50"><TableHead className="font-medium">Datum</TableHead><TableHead className="font-medium">Maskin</TableHead><TableHead className="font-medium text-right">Timmar</TableHead><TableHead className="font-medium">Uppgift</TableHead></TableRow></TableHeader>
                  <TableBody>{logs.sort((a, b) => b.date.localeCompare(a.date)).map(l => <TableRow key={l.id}><TableCell>{l.date}</TableCell><TableCell className="font-medium">{l.machineName}</TableCell><TableCell className="text-right tabular-nums">{l.hours}h</TableCell><TableCell className="text-muted-foreground">{l.task}</TableCell></TableRow>)}</TableBody></Table></div>
            )}
          </TabsContent>
        </Tabs>
        {saving && <div className="flex items-center gap-2 text-xs text-muted-foreground mt-4"><Loader2 className="h-3.5 w-3.5 animate-spin" />Sparar...</div>}
      </ModuleWorkspaceShell>

      <Dialog open={machDialogOpen} onOpenChange={setMachDialogOpen}><DialogContent className="max-w-md"><DialogHeader><DialogTitle>{editingMach ? 'Redigera' : 'Ny maskin'}</DialogTitle><DialogDescription>Maskinregister.</DialogDescription></DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="grid grid-cols-2 gap-4"><div className="grid gap-2"><Label>Namn *</Label><Input value={machForm.name} onChange={e => setMachForm(f => ({ ...f, name: e.target.value }))} placeholder="Traktor" /></div><div className="grid gap-2"><Label>Modell</Label><Input value={machForm.model} onChange={e => setMachForm(f => ({ ...f, model: e.target.value }))} /></div></div>
          <div className="grid grid-cols-3 gap-4"><div className="grid gap-2"><Label>Timmar</Label><Input type="number" value={machForm.hours || ''} onChange={e => setMachForm(f => ({ ...f, hours: parseInt(e.target.value) || 0 }))} /></div><div className="grid gap-2"><Label>Service vid (h)</Label><Input type="number" value={machForm.nextService || ''} onChange={e => setMachForm(f => ({ ...f, nextService: parseInt(e.target.value) || 0 }))} /></div><div className="grid gap-2"><Label>Senaste service</Label><Input type="date" value={machForm.lastServiceDate} onChange={e => setMachForm(f => ({ ...f, lastServiceDate: e.target.value }))} /></div></div>
        </div>
        <DialogFooter><Button variant="outline" onClick={() => setMachDialogOpen(false)}>Avbryt</Button><Button onClick={handleSaveMach} disabled={!machForm.name.trim()}>{editingMach ? 'Uppdatera' : 'Lägg till'}</Button></DialogFooter></DialogContent></Dialog>

      <Dialog open={logDialogOpen} onOpenChange={setLogDialogOpen}><DialogContent className="max-w-sm"><DialogHeader><DialogTitle>Logga timmar</DialogTitle><DialogDescription>Registrera maskintimmar.</DialogDescription></DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="grid gap-2"><Label>Maskin *</Label><select className="h-10 rounded-md border border-input bg-background px-3 text-sm w-full" value={logForm.machineId} onChange={e => setLogForm(f => ({ ...f, machineId: e.target.value }))}><option value="">Välj maskin</option>{machines.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}</select></div>
          <div className="grid grid-cols-2 gap-4"><div className="grid gap-2"><Label>Datum *</Label><Input type="date" value={logForm.date} onChange={e => setLogForm(f => ({ ...f, date: e.target.value }))} /></div><div className="grid gap-2"><Label>Timmar *</Label><Input type="number" value={logForm.hours || ''} onChange={e => setLogForm(f => ({ ...f, hours: parseFloat(e.target.value) || 0 }))} /></div></div>
          <div className="grid gap-2"><Label>Uppgift</Label><Input value={logForm.task} onChange={e => setLogForm(f => ({ ...f, task: e.target.value }))} placeholder="Plöjning norråkern" /></div>
        </div>
        <DialogFooter><Button variant="outline" onClick={() => setLogDialogOpen(false)}>Avbryt</Button><Button onClick={handleSaveLog} disabled={!logForm.machineId || !logForm.date}>Logga</Button></DialogFooter></DialogContent></Dialog>
    </>
  )
}
