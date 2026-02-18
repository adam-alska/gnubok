'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { ModuleWorkspaceShell } from '@/components/modules/ModuleWorkspaceShell'
import { KPICard } from '@/components/modules/shared/KPICard'
import { EmptyModuleState } from '@/components/modules/shared/EmptyModuleState'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { Plus, Pencil, Trash2, Loader2, Users, Gift, Search } from 'lucide-react'

interface ModuleWorkspaceProps {
  module: { slug: string; name: string; cat: string; desc: string; longDesc: string }
  sectorSlug: string
  settingsHref: string
}

interface Member {
  id: string
  name: string
  email: string
  phone: string
  points: number
  totalSpent: number
  memberSince: string
  active: boolean
}

interface Reward {
  id: string
  name: string
  pointsCost: number
  description: string
  active: boolean
}

function generateId(): string {
  return crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`
}

function todayStr(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function fmt(n: number): string {
  return new Intl.NumberFormat('sv-SE', { maximumFractionDigits: 0 }).format(n)
}

export function KundklubbWorkspace({ module: mod, sectorSlug, settingsHref }: ModuleWorkspaceProps) {
  const supabase = createClient()

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [members, setMembers] = useState<Member[]>([])
  const [rewards, setRewards] = useState<Reward[]>([])
  const [searchQuery, setSearchQuery] = useState('')

  const [memberDialogOpen, setMemberDialogOpen] = useState(false)
  const [editingMember, setEditingMember] = useState<Member | null>(null)
  const [memberForm, setMemberForm] = useState({ name: '', email: '', phone: '', points: 0, totalSpent: 0 })

  const [rewardDialogOpen, setRewardDialogOpen] = useState(false)
  const [editingReward, setEditingReward] = useState<Reward | null>(null)
  const [rewardForm, setRewardForm] = useState({ name: '', pointsCost: 0, description: '', active: true })

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [itemToDelete, setItemToDelete] = useState<{ type: 'member' | 'reward'; id: string; name: string } | null>(null)

  const [pointsDialogOpen, setPointsDialogOpen] = useState(false)
  const [pointsMember, setPointsMember] = useState<Member | null>(null)
  const [pointsAmount, setPointsAmount] = useState(0)

  const saveConfig = useCallback(async (key: string, value: unknown) => {
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setSaving(false); return }
    await supabase.from('module_configs').upsert(
      { user_id: user.id, sector_slug: sectorSlug, module_slug: mod.slug, config_key: key, config_value: value },
      { onConflict: 'user_id,sector_slug,module_slug,config_key' }
    )
    setSaving(false)
  }, [supabase, sectorSlug, mod.slug])

  const fetchData = useCallback(async () => {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); return }
    const [membersRes, rewardsRes] = await Promise.all([
      supabase.from('module_configs').select('config_value').eq('user_id', user.id).eq('sector_slug', sectorSlug).eq('module_slug', mod.slug).eq('config_key', 'loyalty_members').maybeSingle(),
      supabase.from('module_configs').select('config_value').eq('user_id', user.id).eq('sector_slug', sectorSlug).eq('module_slug', mod.slug).eq('config_key', 'loyalty_rewards').maybeSingle(),
    ])
    if (membersRes.data?.config_value && Array.isArray(membersRes.data.config_value)) setMembers(membersRes.data.config_value as Member[])
    if (rewardsRes.data?.config_value && Array.isArray(rewardsRes.data.config_value)) setRewards(rewardsRes.data.config_value as Reward[])
    setLoading(false)
  }, [supabase, sectorSlug, mod.slug])

  useEffect(() => { fetchData() }, [fetchData])

  const filteredMembers = useMemo(() => {
    if (!searchQuery.trim()) return members
    const q = searchQuery.toLowerCase()
    return members.filter(m => m.name.toLowerCase().includes(q) || m.email.toLowerCase().includes(q) || m.phone.includes(q))
  }, [members, searchQuery])

  const totalPoints = useMemo(() => members.reduce((s, m) => s + m.points, 0), [members])
  const activeMembers = useMemo(() => members.filter(m => m.active).length, [members])
  const totalRevenue = useMemo(() => members.reduce((s, m) => s + m.totalSpent, 0), [members])

  function openNewMember() { setEditingMember(null); setMemberForm({ name: '', email: '', phone: '', points: 0, totalSpent: 0 }); setMemberDialogOpen(true) }
  function openEditMember(m: Member) { setEditingMember(m); setMemberForm({ name: m.name, email: m.email, phone: m.phone, points: m.points, totalSpent: m.totalSpent }); setMemberDialogOpen(true) }

  async function handleSaveMember() {
    const item: Member = {
      id: editingMember?.id ?? generateId(),
      name: memberForm.name.trim(), email: memberForm.email.trim(), phone: memberForm.phone.trim(),
      points: memberForm.points, totalSpent: memberForm.totalSpent,
      memberSince: editingMember?.memberSince ?? todayStr(), active: true,
    }
    let updated: Member[]
    if (editingMember) updated = members.map(m => m.id === editingMember.id ? item : m)
    else updated = [...members, item]
    setMembers(updated)
    setMemberDialogOpen(false)
    await saveConfig('loyalty_members', updated)
  }

  async function handleAddPoints() {
    if (!pointsMember || pointsAmount === 0) return
    const updated = members.map(m => m.id === pointsMember.id ? { ...m, points: m.points + pointsAmount } : m)
    setMembers(updated)
    setPointsDialogOpen(false)
    setPointsMember(null)
    setPointsAmount(0)
    await saveConfig('loyalty_members', updated)
  }

  function openNewReward() { setEditingReward(null); setRewardForm({ name: '', pointsCost: 0, description: '', active: true }); setRewardDialogOpen(true) }
  function openEditReward(r: Reward) { setEditingReward(r); setRewardForm({ name: r.name, pointsCost: r.pointsCost, description: r.description, active: r.active }); setRewardDialogOpen(true) }

  async function handleSaveReward() {
    const item: Reward = { id: editingReward?.id ?? generateId(), name: rewardForm.name.trim(), pointsCost: rewardForm.pointsCost, description: rewardForm.description.trim(), active: rewardForm.active }
    let updated: Reward[]
    if (editingReward) updated = rewards.map(r => r.id === editingReward.id ? item : r)
    else updated = [...rewards, item]
    setRewards(updated)
    setRewardDialogOpen(false)
    await saveConfig('loyalty_rewards', updated)
  }

  async function handleDelete() {
    if (!itemToDelete) return
    if (itemToDelete.type === 'member') {
      const updated = members.filter(m => m.id !== itemToDelete.id)
      setMembers(updated)
      await saveConfig('loyalty_members', updated)
    } else {
      const updated = rewards.filter(r => r.id !== itemToDelete.id)
      setRewards(updated)
      await saveConfig('loyalty_rewards', updated)
    }
    setDeleteDialogOpen(false)
    setItemToDelete(null)
  }

  return (
    <>
      <ModuleWorkspaceShell
        title={mod.name} description={mod.desc} category="operativ" sectorName="Detaljhandel"
        backHref={`/m/${sectorSlug}`} settingsHref={settingsHref}
      >
        <Tabs defaultValue="medlemmar" className="space-y-6">
          <TabsList>
            <TabsTrigger value="medlemmar"><Users className="mr-1.5 h-3.5 w-3.5" />Medlemmar</TabsTrigger>
            <TabsTrigger value="beloningar"><Gift className="mr-1.5 h-3.5 w-3.5" />Beloningar</TabsTrigger>
          </TabsList>

          <TabsContent value="medlemmar" className="space-y-6">
            {loading ? (
              <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
            ) : (
              <>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  <KPICard label="Totalt medlemmar" value={String(members.length)} unit="st" />
                  <KPICard label="Aktiva medlemmar" value={String(activeMembers)} unit="st" />
                  <KPICard label="Totalt poang" value={fmt(totalPoints)} unit="p" />
                  <KPICard label="Total omsattning" value={fmt(totalRevenue)} unit="kr" />
                </div>

                <div className="flex items-center gap-3">
                  <div className="relative flex-1 max-w-sm">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input placeholder="Sok medlem..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-9" />
                  </div>
                  <Button onClick={openNewMember}><Plus className="mr-2 h-4 w-4" />Ny medlem</Button>
                </div>

                {filteredMembers.length === 0 ? (
                  <EmptyModuleState icon={Users} title="Inga medlemmar" description="Lagg till medlemmar for att borja med kundklubben." actionLabel="Ny medlem" onAction={openNewMember} />
                ) : (
                  <div className="rounded-xl border border-border overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-muted/50">
                          <TableHead className="font-medium">Namn</TableHead>
                          <TableHead className="font-medium">E-post</TableHead>
                          <TableHead className="font-medium">Telefon</TableHead>
                          <TableHead className="font-medium text-right">Poang</TableHead>
                          <TableHead className="font-medium text-right">Tot. kopt</TableHead>
                          <TableHead className="font-medium">Medlem sedan</TableHead>
                          <TableHead className="font-medium text-right">Atgarder</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredMembers.map((m) => (
                          <TableRow key={m.id}>
                            <TableCell className="font-medium">{m.name}</TableCell>
                            <TableCell className="text-muted-foreground">{m.email || '-'}</TableCell>
                            <TableCell className="text-muted-foreground">{m.phone || '-'}</TableCell>
                            <TableCell className="text-right tabular-nums font-medium">{fmt(m.points)}</TableCell>
                            <TableCell className="text-right tabular-nums">{fmt(m.totalSpent)} kr</TableCell>
                            <TableCell className="text-xs text-muted-foreground">{m.memberSince}</TableCell>
                            <TableCell className="text-right">
                              <div className="flex items-center justify-end gap-1">
                                <Button variant="outline" size="sm" className="text-xs" onClick={() => { setPointsMember(m); setPointsAmount(0); setPointsDialogOpen(true) }}>+Poang</Button>
                                <Button variant="ghost" size="icon" onClick={() => openEditMember(m)}><Pencil className="h-4 w-4" /></Button>
                                <Button variant="ghost" size="icon" className="text-red-600 hover:text-red-700" onClick={() => { setItemToDelete({ type: 'member', id: m.id, name: m.name }); setDeleteDialogOpen(true) }}><Trash2 className="h-4 w-4" /></Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </>
            )}
          </TabsContent>

          <TabsContent value="beloningar" className="space-y-6">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">Hantera beloningar som medlemmar kan losa in med poang.</p>
              <Button onClick={openNewReward}><Plus className="mr-2 h-4 w-4" />Ny beloning</Button>
            </div>

            {rewards.length === 0 ? (
              <EmptyModuleState icon={Gift} title="Inga beloningar" description="Skapa beloningar som medlemmar kan losa in." actionLabel="Ny beloning" onAction={openNewReward} />
            ) : (
              <div className="space-y-3">
                {rewards.map((r) => (
                  <div key={r.id} className="flex items-center justify-between gap-4 rounded-xl border border-border bg-card px-5 py-4">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm">{r.name}</span>
                        <Badge variant="secondary">{fmt(r.pointsCost)} poang</Badge>
                        {!r.active && <Badge variant="outline">Inaktiv</Badge>}
                      </div>
                      {r.description && <p className="text-xs text-muted-foreground mt-0.5">{r.description}</p>}
                    </div>
                    <div className="flex items-center gap-2">
                      <Button variant="ghost" size="icon" onClick={() => openEditReward(r)}><Pencil className="h-4 w-4" /></Button>
                      <Button variant="ghost" size="icon" className="text-red-600 hover:text-red-700" onClick={() => { setItemToDelete({ type: 'reward', id: r.id, name: r.name }); setDeleteDialogOpen(true) }}><Trash2 className="h-4 w-4" /></Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
        {saving && <div className="flex items-center gap-2 text-xs text-muted-foreground mt-4"><Loader2 className="h-3.5 w-3.5 animate-spin" />Sparar...</div>}
      </ModuleWorkspaceShell>

      <Dialog open={memberDialogOpen} onOpenChange={setMemberDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{editingMember ? 'Redigera medlem' : 'Ny medlem'}</DialogTitle><DialogDescription>{editingMember ? 'Uppdatera medlemmens uppgifter.' : 'Lagg till en ny kundklubbsmedlem.'}</DialogDescription></DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-2"><Label>Namn *</Label><Input value={memberForm.name} onChange={(e) => setMemberForm(f => ({ ...f, name: e.target.value }))} placeholder="Fornamn Efternamn" /></div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2"><Label>E-post</Label><Input type="email" value={memberForm.email} onChange={(e) => setMemberForm(f => ({ ...f, email: e.target.value }))} /></div>
              <div className="grid gap-2"><Label>Telefon</Label><Input value={memberForm.phone} onChange={(e) => setMemberForm(f => ({ ...f, phone: e.target.value }))} /></div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2"><Label>Poang</Label><Input type="number" min={0} value={memberForm.points} onChange={(e) => setMemberForm(f => ({ ...f, points: Number(e.target.value) || 0 }))} /></div>
              <div className="grid gap-2"><Label>Totalt kopt (kr)</Label><Input type="number" min={0} value={memberForm.totalSpent} onChange={(e) => setMemberForm(f => ({ ...f, totalSpent: Number(e.target.value) || 0 }))} /></div>
            </div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setMemberDialogOpen(false)}>Avbryt</Button><Button onClick={handleSaveMember} disabled={!memberForm.name.trim()}>{editingMember ? 'Uppdatera' : 'Lagg till'}</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={pointsDialogOpen} onOpenChange={setPointsDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Lagg till poang</DialogTitle><DialogDescription>Lagg till poang for {pointsMember?.name}. Nuvarande saldo: {fmt(pointsMember?.points ?? 0)} poang.</DialogDescription></DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-2"><Label>Antal poang</Label><Input type="number" value={pointsAmount} onChange={(e) => setPointsAmount(Number(e.target.value) || 0)} /></div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setPointsDialogOpen(false)}>Avbryt</Button><Button onClick={handleAddPoints} disabled={pointsAmount === 0}>Lagg till</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={rewardDialogOpen} onOpenChange={setRewardDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{editingReward ? 'Redigera beloning' : 'Ny beloning'}</DialogTitle><DialogDescription>{editingReward ? 'Uppdatera beloningen.' : 'Skapa en ny beloning for kundklubben.'}</DialogDescription></DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-2"><Label>Namn *</Label><Input value={rewardForm.name} onChange={(e) => setRewardForm(f => ({ ...f, name: e.target.value }))} placeholder="10% rabatt pa nasta kop" /></div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2"><Label>Poangkostnad *</Label><Input type="number" min={1} value={rewardForm.pointsCost} onChange={(e) => setRewardForm(f => ({ ...f, pointsCost: Number(e.target.value) || 0 }))} /></div>
              <div className="grid gap-2"><Label>Aktiv</Label><div className="flex items-center gap-2 pt-2"><Switch checked={rewardForm.active} onCheckedChange={(v) => setRewardForm(f => ({ ...f, active: v }))} /><span className="text-sm">{rewardForm.active ? 'Ja' : 'Nej'}</span></div></div>
            </div>
            <div className="grid gap-2"><Label>Beskrivning</Label><Input value={rewardForm.description} onChange={(e) => setRewardForm(f => ({ ...f, description: e.target.value }))} placeholder="Beskrivning av beloningen" /></div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setRewardDialogOpen(false)}>Avbryt</Button><Button onClick={handleSaveReward} disabled={!rewardForm.name.trim() || rewardForm.pointsCost <= 0}>{editingReward ? 'Uppdatera' : 'Skapa'}</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Ta bort {itemToDelete?.type === 'member' ? 'medlem' : 'beloning'}</DialogTitle><DialogDescription>Ar du saker pa att du vill ta bort {itemToDelete?.name}?</DialogDescription></DialogHeader>
          <DialogFooter><Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>Avbryt</Button><Button variant="destructive" onClick={handleDelete}><Trash2 className="mr-2 h-4 w-4" />Ta bort</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
