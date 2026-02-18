'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { ModuleWorkspaceShell } from '@/components/modules/ModuleWorkspaceShell'
import { EmptyModuleState } from '@/components/modules/shared/EmptyModuleState'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Loader2,
  Sparkles,
  CheckCircle,
  Eye,
  Search,
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface ModuleWorkspaceProps {
  module: { slug: string; name: string; cat: string; desc: string; longDesc: string }
  sectorSlug: string
  settingsHref: string
}

type CleaningStatus = 'smutsigt' | 'stadas' | 'rent' | 'inspekterat'

interface RoomCleaning {
  roomNumber: string
  roomType: string
  status: CleaningStatus
  assignedTo: string
  priority: boolean
  checklist: { task: string; done: boolean }[]
  notes: string
  lastUpdated: string
}

interface StaffMember {
  id: string
  name: string
}

const STATUS_MAP: Record<CleaningStatus, { label: string; color: string; icon: string }> = {
  smutsigt: { label: 'Smutsigt', color: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400', icon: 'red' },
  stadas: { label: 'Stadas', color: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400', icon: 'amber' },
  rent: { label: 'Rent', color: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400', icon: 'green' },
  inspekterat: { label: 'Inspekterat', color: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400', icon: 'blue' },
}

const DEFAULT_CHECKLIST = [
  { task: 'Byte av sanglinne', done: false },
  { task: 'Byte av handdukar', done: false },
  { task: 'Dammsugning', done: false },
  { task: 'Golvtorkning', done: false },
  { task: 'Badrum rengjort', done: false },
  { task: 'Minibar kontrollerad', done: false },
  { task: 'Pappersmaterial fyllt pa', done: false },
  { task: 'Fonster putsade', done: false },
]

const DEFAULT_ROOMS: RoomCleaning[] = [
  { roomNumber: '101', roomType: 'Standard', status: 'smutsigt', assignedTo: '', priority: false, checklist: DEFAULT_CHECKLIST.map(c => ({ ...c })), notes: '', lastUpdated: '' },
  { roomNumber: '102', roomType: 'Standard', status: 'smutsigt', assignedTo: '', priority: false, checklist: DEFAULT_CHECKLIST.map(c => ({ ...c })), notes: '', lastUpdated: '' },
  { roomNumber: '103', roomType: 'Superior', status: 'rent', assignedTo: '', priority: false, checklist: DEFAULT_CHECKLIST.map(c => ({ ...c, done: true })), notes: '', lastUpdated: '' },
  { roomNumber: '201', roomType: 'Superior', status: 'rent', assignedTo: '', priority: false, checklist: DEFAULT_CHECKLIST.map(c => ({ ...c, done: true })), notes: '', lastUpdated: '' },
  { roomNumber: '202', roomType: 'Svit', status: 'smutsigt', assignedTo: '', priority: true, checklist: DEFAULT_CHECKLIST.map(c => ({ ...c })), notes: '', lastUpdated: '' },
  { roomNumber: '203', roomType: 'Familj', status: 'inspekterat', assignedTo: '', priority: false, checklist: DEFAULT_CHECKLIST.map(c => ({ ...c, done: true })), notes: '', lastUpdated: '' },
  { roomNumber: '301', roomType: 'Standard', status: 'stadas', assignedTo: '', priority: false, checklist: DEFAULT_CHECKLIST.map(c => ({ ...c })), notes: '', lastUpdated: '' },
  { roomNumber: '302', roomType: 'Budget', status: 'rent', assignedTo: '', priority: false, checklist: DEFAULT_CHECKLIST.map(c => ({ ...c, done: true })), notes: '', lastUpdated: '' },
]

const DEFAULT_STAFF: StaffMember[] = [
  { id: '1', name: 'Maria Johansson' },
  { id: '2', name: 'Anna Karlsson' },
  { id: '3', name: 'Eva Nilsson' },
]

function todayStr(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function StadschemaWorkspace({ module: mod, sectorSlug, settingsHref }: ModuleWorkspaceProps) {
  const supabase = createClient()

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [roomCleanings, setRoomCleanings] = useState<RoomCleaning[]>([])
  const [staff, setStaff] = useState<StaffMember[]>([])
  const [filterStatus, setFilterStatus] = useState<CleaningStatus | 'all'>('all')
  const [searchQuery, setSearchQuery] = useState('')

  // Checklist dialog
  const [checklistDialogOpen, setChecklistDialogOpen] = useState(false)
  const [selectedRoom, setSelectedRoom] = useState<RoomCleaning | null>(null)

  // Staff dialog
  const [staffDialogOpen, setStaffDialogOpen] = useState(false)
  const [staffName, setStaffName] = useState('')

  const saveData = useCallback(async (newRooms: RoomCleaning[], newStaff: StaffMember[]) => {
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setSaving(false); return }

    await Promise.all([
      supabase.from('module_configs').upsert(
        { user_id: user.id, sector_slug: sectorSlug, module_slug: mod.slug, config_key: 'room_cleanings', config_value: newRooms },
        { onConflict: 'user_id,sector_slug,module_slug,config_key' }
      ),
      supabase.from('module_configs').upsert(
        { user_id: user.id, sector_slug: sectorSlug, module_slug: mod.slug, config_key: 'staff', config_value: newStaff },
        { onConflict: 'user_id,sector_slug,module_slug,config_key' }
      ),
    ])
    setSaving(false)
  }, [supabase, sectorSlug, mod.slug])

  const fetchData = useCallback(async () => {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); return }

    const { data: rows } = await supabase
      .from('module_configs')
      .select('config_key, config_value')
      .eq('user_id', user.id)
      .eq('sector_slug', sectorSlug)
      .eq('module_slug', mod.slug)
      .in('config_key', ['room_cleanings', 'staff'])

    let loadedRooms = DEFAULT_ROOMS
    let loadedStaff = DEFAULT_STAFF

    for (const row of rows ?? []) {
      if (row.config_key === 'room_cleanings' && Array.isArray(row.config_value) && row.config_value.length > 0) {
        loadedRooms = row.config_value as RoomCleaning[]
      }
      if (row.config_key === 'staff' && Array.isArray(row.config_value) && row.config_value.length > 0) {
        loadedStaff = row.config_value as StaffMember[]
      }
    }

    setRoomCleanings(loadedRooms)
    setStaff(loadedStaff)

    if (!(rows ?? []).find(r => r.config_key === 'room_cleanings')) {
      await supabase.from('module_configs').upsert(
        { user_id: user.id, sector_slug: sectorSlug, module_slug: mod.slug, config_key: 'room_cleanings', config_value: DEFAULT_ROOMS },
        { onConflict: 'user_id,sector_slug,module_slug,config_key' }
      )
    }
    if (!(rows ?? []).find(r => r.config_key === 'staff')) {
      await supabase.from('module_configs').upsert(
        { user_id: user.id, sector_slug: sectorSlug, module_slug: mod.slug, config_key: 'staff', config_value: DEFAULT_STAFF },
        { onConflict: 'user_id,sector_slug,module_slug,config_key' }
      )
    }

    setLoading(false)
  }, [supabase, sectorSlug, mod.slug])

  useEffect(() => { fetchData() }, [fetchData])

  const filteredRooms = useMemo(() => {
    let result = roomCleanings
    if (filterStatus !== 'all') result = result.filter(r => r.status === filterStatus)
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      result = result.filter(r => r.roomNumber.includes(q) || r.assignedTo.toLowerCase().includes(q))
    }
    return result.sort((a, b) => {
      if (a.priority && !b.priority) return -1
      if (!a.priority && b.priority) return 1
      return a.roomNumber.localeCompare(b.roomNumber)
    })
  }, [roomCleanings, filterStatus, searchQuery])

  const statusCounts = useMemo(() => {
    const counts: Record<CleaningStatus, number> = { smutsigt: 0, stadas: 0, rent: 0, inspekterat: 0 }
    for (const r of roomCleanings) counts[r.status]++
    return counts
  }, [roomCleanings])

  async function updateRoomStatus(roomNumber: string, newStatus: CleaningStatus) {
    const updated = roomCleanings.map(r =>
      r.roomNumber === roomNumber
        ? { ...r, status: newStatus, lastUpdated: new Date().toISOString() }
        : r
    )
    setRoomCleanings(updated)
    await saveData(updated, staff)
  }

  async function assignStaff(roomNumber: string, staffName: string) {
    const updated = roomCleanings.map(r =>
      r.roomNumber === roomNumber ? { ...r, assignedTo: staffName, lastUpdated: new Date().toISOString() } : r
    )
    setRoomCleanings(updated)
    await saveData(updated, staff)
  }

  async function togglePriority(roomNumber: string) {
    const updated = roomCleanings.map(r =>
      r.roomNumber === roomNumber ? { ...r, priority: !r.priority } : r
    )
    setRoomCleanings(updated)
    await saveData(updated, staff)
  }

  function openChecklist(room: RoomCleaning) {
    setSelectedRoom(room)
    setChecklistDialogOpen(true)
  }

  async function toggleChecklistItem(roomNumber: string, taskIndex: number) {
    const updated = roomCleanings.map(r => {
      if (r.roomNumber !== roomNumber) return r
      const newChecklist = r.checklist.map((c, i) => i === taskIndex ? { ...c, done: !c.done } : c)
      const allDone = newChecklist.every(c => c.done)
      return { ...r, checklist: newChecklist, status: allDone ? 'rent' as CleaningStatus : r.status, lastUpdated: new Date().toISOString() }
    })
    setRoomCleanings(updated)
    setSelectedRoom(updated.find(r => r.roomNumber === roomNumber) ?? null)
    await saveData(updated, staff)
  }

  async function addStaffMember() {
    if (!staffName.trim()) return
    const newStaff = [...staff, { id: Date.now().toString(), name: staffName.trim() }]
    setStaff(newStaff)
    setStaffName('')
    await saveData(roomCleanings, newStaff)
  }

  async function removeStaffMember(id: string) {
    const newStaff = staff.filter(s => s.id !== id)
    setStaff(newStaff)
    await saveData(roomCleanings, newStaff)
  }

  async function resetAllRooms() {
    const updated = roomCleanings.map(r => ({
      ...r,
      status: 'smutsigt' as CleaningStatus,
      checklist: DEFAULT_CHECKLIST.map(c => ({ ...c })),
      lastUpdated: new Date().toISOString(),
    }))
    setRoomCleanings(updated)
    await saveData(updated, staff)
  }

  return (
    <>
      <ModuleWorkspaceShell
        title={mod.name}
        description={mod.desc}
        category="operativ"
        sectorName="Hotell & Boende"
        backHref={`/m/${sectorSlug}`}
        settingsHref={settingsHref}
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setStaffDialogOpen(true)}>Personal</Button>
            <Button variant="outline" size="sm" onClick={resetAllRooms}>Aterstall alla</Button>
          </div>
        }
      >
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-6">
            {/* Summary cards */}
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {(Object.keys(STATUS_MAP) as CleaningStatus[]).map(status => (
                <Card key={status} className="cursor-pointer" onClick={() => setFilterStatus(filterStatus === status ? 'all' : status)}>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{STATUS_MAP[status].label}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <span className="text-2xl font-semibold tracking-tight">{statusCounts[status]}</span>
                    <span className="text-sm text-muted-foreground ml-1.5">rum</span>
                  </CardContent>
                </Card>
              ))}
            </div>

            {/* Filters */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
              <div className="relative flex-1 max-w-sm">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Sok rum eller personal..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="pl-9" />
              </div>
              <Select value={filterStatus} onValueChange={val => setFilterStatus(val as CleaningStatus | 'all')}>
                <SelectTrigger className="w-[180px]"><SelectValue placeholder="Filtrera status" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Alla statusar</SelectItem>
                  {(Object.keys(STATUS_MAP) as CleaningStatus[]).map(s => <SelectItem key={s} value={s}>{STATUS_MAP[s].label}</SelectItem>)}
                </SelectContent>
              </Select>
              {saving && <div className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" />Sparar...</div>}
            </div>

            {/* Rooms table */}
            <div className="rounded-xl border border-border overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead className="font-medium">Rum</TableHead>
                    <TableHead className="font-medium">Typ</TableHead>
                    <TableHead className="font-medium">Status</TableHead>
                    <TableHead className="font-medium">Tilldelad</TableHead>
                    <TableHead className="font-medium text-center">Prioritet</TableHead>
                    <TableHead className="font-medium text-center">Checklista</TableHead>
                    <TableHead className="font-medium text-right">Atgarder</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredRooms.map(room => {
                    const completedTasks = room.checklist.filter(c => c.done).length
                    return (
                      <TableRow key={room.roomNumber} className={room.priority ? 'bg-amber-50/50 dark:bg-amber-900/5' : ''}>
                        <TableCell className="font-mono font-medium">{room.roomNumber}</TableCell>
                        <TableCell>{room.roomType}</TableCell>
                        <TableCell>
                          <Badge variant="secondary" className={STATUS_MAP[room.status].color}>{STATUS_MAP[room.status].label}</Badge>
                        </TableCell>
                        <TableCell>
                          <Select value={room.assignedTo || 'none'} onValueChange={val => assignStaff(room.roomNumber, val === 'none' ? '' : val)}>
                            <SelectTrigger className="h-8 w-40"><SelectValue placeholder="Ej tilldelad" /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">Ej tilldelad</SelectItem>
                              {staff.map(s => <SelectItem key={s.id} value={s.name}>{s.name}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell className="text-center">
                          <Switch checked={room.priority} onCheckedChange={() => togglePriority(room.roomNumber)} />
                        </TableCell>
                        <TableCell className="text-center">
                          <Button variant="ghost" size="sm" onClick={() => openChecklist(room)}>
                            {completedTasks}/{room.checklist.length}
                          </Button>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            {room.status === 'smutsigt' && (
                              <Button variant="ghost" size="icon" onClick={() => updateRoomStatus(room.roomNumber, 'stadas')} title="Borja stada">
                                <Sparkles className="h-4 w-4 text-amber-600" />
                              </Button>
                            )}
                            {room.status === 'stadas' && (
                              <Button variant="ghost" size="icon" onClick={() => updateRoomStatus(room.roomNumber, 'rent')} title="Markera rent">
                                <CheckCircle className="h-4 w-4 text-emerald-600" />
                              </Button>
                            )}
                            {room.status === 'rent' && (
                              <Button variant="ghost" size="icon" onClick={() => updateRoomStatus(room.roomNumber, 'inspekterat')} title="Markera inspekterat">
                                <Eye className="h-4 w-4 text-blue-600" />
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          </div>
        )}
      </ModuleWorkspaceShell>

      {/* Checklist Dialog */}
      <Dialog open={checklistDialogOpen} onOpenChange={setChecklistDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Checklista - Rum {selectedRoom?.roomNumber}</DialogTitle>
            <DialogDescription>Bocka av uppgifter allt eftersom de utfors.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            {selectedRoom?.checklist.map((item, idx) => (
              <label key={idx} className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50 cursor-pointer">
                <input
                  type="checkbox"
                  checked={item.done}
                  onChange={() => selectedRoom && toggleChecklistItem(selectedRoom.roomNumber, idx)}
                  className="h-4 w-4"
                />
                <span className={cn('text-sm', item.done && 'line-through text-muted-foreground')}>{item.task}</span>
              </label>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setChecklistDialogOpen(false)}>Stang</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Staff Dialog */}
      <Dialog open={staffDialogOpen} onOpenChange={setStaffDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Hantera stadpersonal</DialogTitle>
            <DialogDescription>Lagg till eller ta bort personal som kan tilldelas rum.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="flex items-end gap-2">
              <div className="flex-1 grid gap-1.5">
                <Label className="text-xs">Nytt namn</Label>
                <Input value={staffName} onChange={e => setStaffName(e.target.value)} placeholder="Namn" className="h-9" />
              </div>
              <Button size="sm" onClick={addStaffMember} disabled={!staffName.trim()}>Lagg till</Button>
            </div>
            {staff.map(s => (
              <div key={s.id} className="flex items-center justify-between p-2 rounded-lg bg-muted/30">
                <span className="text-sm">{s.name}</span>
                <Button variant="ghost" size="sm" className="text-red-600 h-7" onClick={() => removeStaffMember(s.id)}>Ta bort</Button>
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setStaffDialogOpen(false)}>Stang</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
