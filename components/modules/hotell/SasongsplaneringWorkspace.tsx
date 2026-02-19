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
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Separator } from '@/components/ui/separator'
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
  Plus,
  Pencil,
  Trash2,
  Loader2,
  CalendarDays,
  Sun,
} from 'lucide-react'

interface ModuleWorkspaceProps {
  module: { slug: string; name: string; cat: string; desc: string; longDesc: string }
  sectorSlug: string
  settingsHref: string
}

type RoomType = 'Standard' | 'Superior' | 'Svit' | 'Familj' | 'Budget'

interface Season {
  id: string
  name: string
  startDate: string
  endDate: string
  color: string
}

interface SeasonPrice {
  id: string
  seasonId: string
  roomType: RoomType
  pricePerNight: number
  minStay: number
}

interface CapacityPlan {
  id: string
  seasonId: string
  roomType: RoomType
  totalRooms: number
  targetOccupancy: number
}

const ROOM_TYPES: RoomType[] = ['Standard', 'Superior', 'Svit', 'Familj', 'Budget']

const SEASON_COLORS = [
  { value: 'emerald', label: 'Grön (högsäsong)', class: 'bg-emerald-100 text-emerald-800' },
  { value: 'amber', label: 'Gul (mellansäsong)', class: 'bg-amber-100 text-amber-800' },
  { value: 'blue', label: 'Blå (lågsäsong)', class: 'bg-blue-100 text-blue-800' },
  { value: 'rose', label: 'Rosa (specialperiod)', class: 'bg-rose-100 text-rose-800' },
  { value: 'purple', label: 'Lila (event)', class: 'bg-purple-100 text-purple-800' },
]

function getColorClass(color: string): string {
  return SEASON_COLORS.find(c => c.value === color)?.class ?? 'bg-gray-100 text-gray-800'
}

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7)
}

function fmt(n: number): string {
  return new Intl.NumberFormat('sv-SE', { maximumFractionDigits: 0 }).format(n)
}

export function SasongsplaneringWorkspace({ module: mod, sectorSlug, settingsHref }: ModuleWorkspaceProps) {
  const supabase = createClient()

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [seasons, setSeasons] = useState<Season[]>([])
  const [prices, setPrices] = useState<SeasonPrice[]>([])
  const [capacity, setCapacity] = useState<CapacityPlan[]>([])

  // Season dialog
  const [seasonDialogOpen, setSeasonDialogOpen] = useState(false)
  const [editingSeason, setEditingSeason] = useState<Season | null>(null)
  const [seasonForm, setSeasonForm] = useState({ name: '', startDate: '', endDate: '', color: 'emerald' })

  // Price dialog
  const [priceDialogOpen, setPriceDialogOpen] = useState(false)
  const [priceForm, setPriceForm] = useState({ seasonId: '', roomType: 'Standard' as RoomType, pricePerNight: 0, minStay: 1 })

  // Capacity dialog
  const [capacityDialogOpen, setCapacityDialogOpen] = useState(false)
  const [capacityForm, setCapacityForm] = useState({ seasonId: '', roomType: 'Standard' as RoomType, totalRooms: 0, targetOccupancy: 75 })

  // Delete
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [seasonToDelete, setSeasonToDelete] = useState<Season | null>(null)

  const saveData = useCallback(async (newSeasons: Season[], newPrices: SeasonPrice[], newCapacity: CapacityPlan[]) => {
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setSaving(false); return }

    await Promise.all([
      supabase.from('module_configs').upsert(
        { user_id: user.id, sector_slug: sectorSlug, module_slug: mod.slug, config_key: 'seasons', config_value: newSeasons },
        { onConflict: 'user_id,sector_slug,module_slug,config_key' }
      ),
      supabase.from('module_configs').upsert(
        { user_id: user.id, sector_slug: sectorSlug, module_slug: mod.slug, config_key: 'season_prices', config_value: newPrices },
        { onConflict: 'user_id,sector_slug,module_slug,config_key' }
      ),
      supabase.from('module_configs').upsert(
        { user_id: user.id, sector_slug: sectorSlug, module_slug: mod.slug, config_key: 'capacity_plans', config_value: newCapacity },
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
      .in('config_key', ['seasons', 'season_prices', 'capacity_plans'])

    for (const row of rows ?? []) {
      if (row.config_key === 'seasons' && Array.isArray(row.config_value)) setSeasons(row.config_value as Season[])
      if (row.config_key === 'season_prices' && Array.isArray(row.config_value)) setPrices(row.config_value as SeasonPrice[])
      if (row.config_key === 'capacity_plans' && Array.isArray(row.config_value)) setCapacity(row.config_value as CapacityPlan[])
    }
    setLoading(false)
  }, [supabase, sectorSlug, mod.slug])

  useEffect(() => { fetchData() }, [fetchData])

  // Season CRUD
  function openNewSeason() {
    setEditingSeason(null)
    setSeasonForm({ name: '', startDate: '', endDate: '', color: 'emerald' })
    setSeasonDialogOpen(true)
  }

  function openEditSeason(season: Season) {
    setEditingSeason(season)
    setSeasonForm({ name: season.name, startDate: season.startDate, endDate: season.endDate, color: season.color })
    setSeasonDialogOpen(true)
  }

  async function handleSaveSeason() {
    const item: Season = {
      id: editingSeason?.id ?? generateId(),
      name: seasonForm.name.trim(),
      startDate: seasonForm.startDate,
      endDate: seasonForm.endDate,
      color: seasonForm.color,
    }
    let updated: Season[]
    if (editingSeason) {
      updated = seasons.map(s => s.id === editingSeason.id ? item : s)
    } else {
      updated = [...seasons, item]
    }
    setSeasons(updated)
    setSeasonDialogOpen(false)
    await saveData(updated, prices, capacity)
  }

  async function handleDeleteSeason() {
    if (!seasonToDelete) return
    const updatedSeasons = seasons.filter(s => s.id !== seasonToDelete.id)
    const updatedPrices = prices.filter(p => p.seasonId !== seasonToDelete.id)
    const updatedCapacity = capacity.filter(c => c.seasonId !== seasonToDelete.id)
    setSeasons(updatedSeasons)
    setPrices(updatedPrices)
    setCapacity(updatedCapacity)
    setDeleteDialogOpen(false)
    setSeasonToDelete(null)
    await saveData(updatedSeasons, updatedPrices, updatedCapacity)
  }

  // Price CRUD
  function openNewPrice(seasonId?: string) {
    setPriceForm({ seasonId: seasonId ?? (seasons[0]?.id ?? ''), roomType: 'Standard', pricePerNight: 0, minStay: 1 })
    setPriceDialogOpen(true)
  }

  async function handleSavePrice() {
    const item: SeasonPrice = {
      id: generateId(),
      seasonId: priceForm.seasonId,
      roomType: priceForm.roomType,
      pricePerNight: priceForm.pricePerNight,
      minStay: priceForm.minStay,
    }
    // Replace existing if same season + room type
    const updated = prices.filter(p => !(p.seasonId === item.seasonId && p.roomType === item.roomType))
    updated.push(item)
    setPrices(updated)
    setPriceDialogOpen(false)
    await saveData(seasons, updated, capacity)
  }

  async function handleDeletePrice(id: string) {
    const updated = prices.filter(p => p.id !== id)
    setPrices(updated)
    await saveData(seasons, updated, capacity)
  }

  // Capacity CRUD
  function openNewCapacity(seasonId?: string) {
    setCapacityForm({ seasonId: seasonId ?? (seasons[0]?.id ?? ''), roomType: 'Standard', totalRooms: 0, targetOccupancy: 75 })
    setCapacityDialogOpen(true)
  }

  async function handleSaveCapacity() {
    const item: CapacityPlan = {
      id: generateId(),
      seasonId: capacityForm.seasonId,
      roomType: capacityForm.roomType,
      totalRooms: capacityForm.totalRooms,
      targetOccupancy: capacityForm.targetOccupancy,
    }
    const updated = capacity.filter(c => !(c.seasonId === item.seasonId && c.roomType === item.roomType))
    updated.push(item)
    setCapacity(updated)
    setCapacityDialogOpen(false)
    await saveData(seasons, prices, updated)
  }

  async function handleDeleteCapacity(id: string) {
    const updated = capacity.filter(c => c.id !== id)
    setCapacity(updated)
    await saveData(seasons, prices, updated)
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
          <Button onClick={openNewSeason}>
            <Plus className="mr-2 h-4 w-4" />
            Ny säsong
          </Button>
        }
      >
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <Tabs defaultValue="sasonger" className="space-y-6">
            <TabsList>
              <TabsTrigger value="sasonger">Säsonger</TabsTrigger>
              <TabsTrigger value="priser">Priser per rumstyp</TabsTrigger>
              <TabsTrigger value="kapacitet">Kapacitetsplanering</TabsTrigger>
            </TabsList>

            <TabsContent value="sasonger" className="space-y-6">
              {saving && <div className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" />Sparar...</div>}
              {seasons.length === 0 ? (
                <EmptyModuleState icon={Sun} title="Inga säsonger" description="Definiera säsonger för att sätta priser och planera kapacitet." actionLabel="Ny säsong" onAction={openNewSeason} />
              ) : (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {seasons.sort((a, b) => a.startDate.localeCompare(b.startDate)).map(season => (
                    <Card key={season.id}>
                      <CardHeader className="flex flex-row items-center justify-between pb-2">
                        <CardTitle className="text-base">{season.name}</CardTitle>
                        <div className="flex items-center gap-1">
                          <Button variant="ghost" size="icon" onClick={() => openEditSeason(season)} title="Redigera"><Pencil className="h-4 w-4" /></Button>
                          <Button variant="ghost" size="icon" className="text-red-600 hover:text-red-700" onClick={() => { setSeasonToDelete(season); setDeleteDialogOpen(true) }} title="Ta bort"><Trash2 className="h-4 w-4" /></Button>
                        </div>
                      </CardHeader>
                      <CardContent className="space-y-2">
                        <Badge variant="secondary" className={getColorClass(season.color)}>{season.name}</Badge>
                        <div className="text-sm text-muted-foreground">
                          <p>{season.startDate} - {season.endDate}</p>
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {prices.filter(p => p.seasonId === season.id).length} prisregler,{' '}
                          {capacity.filter(c => c.seasonId === season.id).length} kapacitetsplaner
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </TabsContent>

            <TabsContent value="priser" className="space-y-6">
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">Sätt pris per rumstyp och säsong.</p>
                <Button size="sm" onClick={() => openNewPrice()} disabled={seasons.length === 0}><Plus className="mr-2 h-4 w-4" />Nytt pris</Button>
              </div>
              {prices.length === 0 ? (
                <EmptyModuleState icon={CalendarDays} title="Inga prisregler" description="Lägg till priser per säsong och rumstyp." actionLabel="Lägg till pris" onAction={() => openNewPrice()} />
              ) : (
                <div className="rounded-xl border border-border overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/50">
                        <TableHead className="font-medium">Säsong</TableHead>
                        <TableHead className="font-medium">Rumstyp</TableHead>
                        <TableHead className="font-medium text-right">Pris/natt (kr)</TableHead>
                        <TableHead className="font-medium text-right">Min. natter</TableHead>
                        <TableHead className="font-medium text-right">Åtgärder</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {prices.sort((a, b) => a.seasonId.localeCompare(b.seasonId) || a.roomType.localeCompare(b.roomType)).map(price => {
                        const season = seasons.find(s => s.id === price.seasonId)
                        return (
                          <TableRow key={price.id}>
                            <TableCell>
                              <Badge variant="secondary" className={getColorClass(season?.color ?? 'gray')}>{season?.name ?? 'Okänd'}</Badge>
                            </TableCell>
                            <TableCell>{price.roomType}</TableCell>
                            <TableCell className="text-right font-mono">{fmt(price.pricePerNight)}</TableCell>
                            <TableCell className="text-right">{price.minStay}</TableCell>
                            <TableCell className="text-right">
                              <Button variant="ghost" size="icon" className="text-red-600 hover:text-red-700" onClick={() => handleDeletePrice(price.id)}><Trash2 className="h-4 w-4" /></Button>
                            </TableCell>
                          </TableRow>
                        )
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </TabsContent>

            <TabsContent value="kapacitet" className="space-y-6">
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">Planera kapacitet och beläggningsmål per säsong.</p>
                <Button size="sm" onClick={() => openNewCapacity()} disabled={seasons.length === 0}><Plus className="mr-2 h-4 w-4" />Ny plan</Button>
              </div>
              {capacity.length === 0 ? (
                <EmptyModuleState icon={CalendarDays} title="Inga kapacitetsplaner" description="Lägg till kapacitetsplaner per säsong." actionLabel="Lägg till" onAction={() => openNewCapacity()} />
              ) : (
                <div className="rounded-xl border border-border overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/50">
                        <TableHead className="font-medium">Säsong</TableHead>
                        <TableHead className="font-medium">Rumstyp</TableHead>
                        <TableHead className="font-medium text-right">Antal rum</TableHead>
                        <TableHead className="font-medium text-right">Beläggningsmål %</TableHead>
                        <TableHead className="font-medium text-right">Åtgärder</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {capacity.sort((a, b) => a.seasonId.localeCompare(b.seasonId) || a.roomType.localeCompare(b.roomType)).map(cap => {
                        const season = seasons.find(s => s.id === cap.seasonId)
                        return (
                          <TableRow key={cap.id}>
                            <TableCell>
                              <Badge variant="secondary" className={getColorClass(season?.color ?? 'gray')}>{season?.name ?? 'Okänd'}</Badge>
                            </TableCell>
                            <TableCell>{cap.roomType}</TableCell>
                            <TableCell className="text-right">{cap.totalRooms}</TableCell>
                            <TableCell className="text-right font-mono">{cap.targetOccupancy}%</TableCell>
                            <TableCell className="text-right">
                              <Button variant="ghost" size="icon" className="text-red-600 hover:text-red-700" onClick={() => handleDeleteCapacity(cap.id)}><Trash2 className="h-4 w-4" /></Button>
                            </TableCell>
                          </TableRow>
                        )
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </TabsContent>
          </Tabs>
        )}
      </ModuleWorkspaceShell>

      {/* Season Dialog */}
      <Dialog open={seasonDialogOpen} onOpenChange={setSeasonDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingSeason ? 'Redigera säsong' : 'Ny säsong'}</DialogTitle>
            <DialogDescription>Definiera säsongperiod och färgkod.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-2">
              <Label>Säsongsnamn *</Label>
              <Input value={seasonForm.name} onChange={e => setSeasonForm(f => ({ ...f, name: e.target.value }))} placeholder="Högsäsong sommar" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Startdatum *</Label>
                <Input type="date" value={seasonForm.startDate} onChange={e => setSeasonForm(f => ({ ...f, startDate: e.target.value }))} />
              </div>
              <div className="grid gap-2">
                <Label>Slutdatum *</Label>
                <Input type="date" value={seasonForm.endDate} onChange={e => setSeasonForm(f => ({ ...f, endDate: e.target.value }))} />
              </div>
            </div>
            <div className="grid gap-2">
              <Label>Färg</Label>
              <Select value={seasonForm.color} onValueChange={val => setSeasonForm(f => ({ ...f, color: val }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{SEASON_COLORS.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSeasonDialogOpen(false)}>Avbryt</Button>
            <Button onClick={handleSaveSeason} disabled={!seasonForm.name.trim() || !seasonForm.startDate || !seasonForm.endDate}>
              {editingSeason ? 'Uppdatera' : 'Skapa säsong'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Price Dialog */}
      <Dialog open={priceDialogOpen} onOpenChange={setPriceDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Sätt pris per rumstyp</DialogTitle>
            <DialogDescription>Välj säsong, rumstyp och ange pris.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-2">
              <Label>Säsong *</Label>
              <Select value={priceForm.seasonId} onValueChange={val => setPriceForm(f => ({ ...f, seasonId: val }))}>
                <SelectTrigger><SelectValue placeholder="Välj säsong" /></SelectTrigger>
                <SelectContent>{seasons.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>Rumstyp *</Label>
              <Select value={priceForm.roomType} onValueChange={val => setPriceForm(f => ({ ...f, roomType: val as RoomType }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{ROOM_TYPES.map(rt => <SelectItem key={rt} value={rt}>{rt}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Pris/natt (kr) *</Label>
                <Input type="number" min={0} value={priceForm.pricePerNight || ''} onChange={e => setPriceForm(f => ({ ...f, pricePerNight: parseFloat(e.target.value) || 0 }))} />
              </div>
              <div className="grid gap-2">
                <Label>Minsta natter</Label>
                <Input type="number" min={1} value={priceForm.minStay} onChange={e => setPriceForm(f => ({ ...f, minStay: parseInt(e.target.value) || 1 }))} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPriceDialogOpen(false)}>Avbryt</Button>
            <Button onClick={handleSavePrice} disabled={!priceForm.seasonId || priceForm.pricePerNight <= 0}>Spara pris</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Capacity Dialog */}
      <Dialog open={capacityDialogOpen} onOpenChange={setCapacityDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Kapacitetsplan</DialogTitle>
            <DialogDescription>Planera antal rum och beläggningsmål per säsong.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-2">
              <Label>Säsong *</Label>
              <Select value={capacityForm.seasonId} onValueChange={val => setCapacityForm(f => ({ ...f, seasonId: val }))}>
                <SelectTrigger><SelectValue placeholder="Välj säsong" /></SelectTrigger>
                <SelectContent>{seasons.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>Rumstyp *</Label>
              <Select value={capacityForm.roomType} onValueChange={val => setCapacityForm(f => ({ ...f, roomType: val as RoomType }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{ROOM_TYPES.map(rt => <SelectItem key={rt} value={rt}>{rt}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Antal rum</Label>
                <Input type="number" min={0} value={capacityForm.totalRooms || ''} onChange={e => setCapacityForm(f => ({ ...f, totalRooms: parseInt(e.target.value) || 0 }))} />
              </div>
              <div className="grid gap-2">
                <Label>Beläggningsmål (%)</Label>
                <Input type="number" min={0} max={100} value={capacityForm.targetOccupancy} onChange={e => setCapacityForm(f => ({ ...f, targetOccupancy: parseInt(e.target.value) || 0 }))} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCapacityDialogOpen(false)}>Avbryt</Button>
            <Button onClick={handleSaveCapacity} disabled={!capacityForm.seasonId || capacityForm.totalRooms <= 0}>Spara plan</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Season Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Ta bort säsong</DialogTitle>
            <DialogDescription>Är du säker på att du vill ta bort säsongen &quot;{seasonToDelete?.name}&quot;? Alla tillhörande priser och kapacitetsplaner tas också bort.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>Avbryt</Button>
            <Button variant="destructive" onClick={handleDeleteSeason}><Trash2 className="mr-2 h-4 w-4" />Ta bort</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
