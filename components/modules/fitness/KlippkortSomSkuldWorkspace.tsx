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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import {
  Plus,
  Pencil,
  Trash2,
  Loader2,
  Ticket,
  MinusCircle,
} from 'lucide-react'

interface ModuleWorkspaceProps {
  module: { slug: string; name: string; cat: string; desc: string; longDesc: string }
  sectorSlug: string
  settingsHref: string
}

interface ClipCard {
  id: string
  holder_name: string
  total_clips: number
  used_clips: number
  purchase_date: string
  expiry_date: string
  price_paid: number
  is_expired: boolean
}

const DEFAULT_CLIP_CARDS: ClipCard[] = [
  { id: '1', holder_name: 'Anna Svensson', total_clips: 10, used_clips: 3, purchase_date: '2025-01-10', expiry_date: '2025-07-10', price_paid: 1200, is_expired: false },
  { id: '2', holder_name: 'Erik Lindgren', total_clips: 20, used_clips: 20, purchase_date: '2024-10-01', expiry_date: '2025-04-01', price_paid: 2200, is_expired: false },
  { id: '3', holder_name: 'Karin Holm', total_clips: 10, used_clips: 2, purchase_date: '2024-06-01', expiry_date: '2024-12-01', price_paid: 1200, is_expired: true },
]

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).substring(2, 7)
}

function fmt(n: number): string {
  return new Intl.NumberFormat('sv-SE', { maximumFractionDigits: 0 }).format(n)
}

function fmtPct(n: number): string {
  return isFinite(n) ? n.toFixed(1) : '0.0'
}

const EMPTY_FORM = {
  holder_name: '',
  total_clips: '10',
  used_clips: '0',
  purchase_date: '',
  expiry_date: '',
  price_paid: '',
}

export function KlippkortSomSkuldWorkspace({ module: mod, sectorSlug, settingsHref }: ModuleWorkspaceProps) {
  const supabase = createClient()

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [cards, setCards] = useState<ClipCard[]>([])
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingCard, setEditingCard] = useState<ClipCard | null>(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [cardToDelete, setCardToDelete] = useState<ClipCard | null>(null)
  const [useDialogOpen, setUseDialogOpen] = useState(false)
  const [cardToUse, setCardToUse] = useState<ClipCard | null>(null)

  const saveCards = useCallback(async (newCards: ClipCard[]) => {
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setSaving(false); return }
    await supabase.from('module_configs').upsert(
      { user_id: user.id, sector_slug: sectorSlug, module_slug: mod.slug, config_key: 'clip_cards', config_value: newCards },
      { onConflict: 'user_id,sector_slug,module_slug,config_key' }
    )
    setSaving(false)
  }, [supabase, sectorSlug, mod.slug])

  const fetchCards = useCallback(async () => {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); return }
    const { data } = await supabase.from('module_configs').select('config_value').eq('user_id', user.id).eq('sector_slug', sectorSlug).eq('module_slug', mod.slug).eq('config_key', 'clip_cards').maybeSingle()
    if (data?.config_value && Array.isArray(data.config_value) && data.config_value.length > 0) {
      setCards(data.config_value as ClipCard[])
    } else {
      setCards(DEFAULT_CLIP_CARDS)
      await supabase.from('module_configs').upsert(
        { user_id: user.id, sector_slug: sectorSlug, module_slug: mod.slug, config_key: 'clip_cards', config_value: DEFAULT_CLIP_CARDS },
        { onConflict: 'user_id,sector_slug,module_slug,config_key' }
      )
    }
    setLoading(false)
  }, [supabase, sectorSlug, mod.slug])

  useEffect(() => { fetchCards() }, [fetchCards])

  const stats = useMemo(() => {
    const activeCards = cards.filter((c) => !c.is_expired && c.used_clips < c.total_clips)
    const totalDebt = activeCards.reduce((s, c) => {
      const pricePerClip = c.price_paid / c.total_clips
      const remainingClips = c.total_clips - c.used_clips
      return s + pricePerClip * remainingClips
    }, 0)
    const totalRevenue = cards.reduce((s, c) => {
      const pricePerClip = c.price_paid / c.total_clips
      return s + pricePerClip * c.used_clips
    }, 0)
    const expiredUnused = cards.filter((c) => c.is_expired).reduce((s, c) => {
      const pricePerClip = c.price_paid / c.total_clips
      return s + pricePerClip * (c.total_clips - c.used_clips)
    }, 0)
    return { activeCards: activeCards.length, totalDebt, totalRevenue, expiredUnused, totalCards: cards.length }
  }, [cards])

  function openNew() { setEditingCard(null); setForm({ ...EMPTY_FORM }); setDialogOpen(true) }

  function openEdit(card: ClipCard) {
    setEditingCard(card)
    setForm({ holder_name: card.holder_name, total_clips: String(card.total_clips), used_clips: String(card.used_clips), purchase_date: card.purchase_date, expiry_date: card.expiry_date, price_paid: String(card.price_paid) })
    setDialogOpen(true)
  }

  async function handleSave() {
    const today = new Date().toISOString().split('T')[0]
    const newCard: ClipCard = { id: editingCard?.id ?? generateId(), holder_name: form.holder_name.trim(), total_clips: parseInt(form.total_clips) || 10, used_clips: parseInt(form.used_clips) || 0, purchase_date: form.purchase_date, expiry_date: form.expiry_date, price_paid: parseFloat(form.price_paid) || 0, is_expired: form.expiry_date < today }
    const updated = editingCard ? cards.map((c) => c.id === editingCard.id ? newCard : c) : [...cards, newCard]
    setCards(updated)
    setDialogOpen(false)
    await saveCards(updated)
  }

  function openDeleteConfirmation(card: ClipCard) { setCardToDelete(card); setDeleteDialogOpen(true) }

  async function handleDelete() {
    if (!cardToDelete) return
    const updated = cards.filter((c) => c.id !== cardToDelete.id)
    setCards(updated)
    setDeleteDialogOpen(false)
    setCardToDelete(null)
    await saveCards(updated)
  }

  function openUseClip(card: ClipCard) { setCardToUse(card); setUseDialogOpen(true) }

  async function handleUseClip() {
    if (!cardToUse) return
    const updated = cards.map((c) => c.id === cardToUse.id ? { ...c, used_clips: Math.min(c.used_clips + 1, c.total_clips) } : c)
    setCards(updated)
    setUseDialogOpen(false)
    setCardToUse(null)
    await saveCards(updated)
  }

  return (
    <>
      <ModuleWorkspaceShell
        title={mod.name}
        description={mod.desc}
        category="bokforing"
        sectorName="Fitness & Sport"
        backHref={`/m/${sectorSlug}`}
        settingsHref={settingsHref}
        actions={<Button onClick={openNew}><Plus className="mr-2 h-4 w-4" />Nytt klippkort</Button>}
      >
        {loading ? (
          <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : (
          <Tabs defaultValue="oversikt" className="space-y-6">
            <TabsList>
              <TabsTrigger value="oversikt">Översikt</TabsTrigger>
              <TabsTrigger value="kort">Klippkort</TabsTrigger>
            </TabsList>

            <TabsContent value="oversikt" className="space-y-6">
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
                <Card><CardHeader className="pb-2"><CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Aktiva kort</CardTitle></CardHeader><CardContent><span className="text-2xl font-semibold tracking-tight">{stats.activeCards}</span><span className="text-sm text-muted-foreground ml-1">st</span></CardContent></Card>
                <Card><CardHeader className="pb-2"><CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Skuld konto 2420</CardTitle></CardHeader><CardContent><span className="text-2xl font-semibold tracking-tight">{fmt(stats.totalDebt)}</span><span className="text-sm text-muted-foreground ml-1">kr</span></CardContent></Card>
                <Card><CardHeader className="pb-2"><CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Intjänad intäkt</CardTitle></CardHeader><CardContent><span className="text-2xl font-semibold tracking-tight">{fmt(stats.totalRevenue)}</span><span className="text-sm text-muted-foreground ml-1">kr</span></CardContent></Card>
                <Card><CardHeader className="pb-2"><CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Förfallna oanvända</CardTitle></CardHeader><CardContent><span className="text-2xl font-semibold tracking-tight">{fmt(stats.expiredUnused)}</span><span className="text-sm text-muted-foreground ml-1">kr</span></CardContent></Card>
                <Card><CardHeader className="pb-2"><CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Totalt kort</CardTitle></CardHeader><CardContent><span className="text-2xl font-semibold tracking-tight">{stats.totalCards}</span><span className="text-sm text-muted-foreground ml-1">st</span></CardContent></Card>
              </div>
            </TabsContent>

            <TabsContent value="kort" className="space-y-4">
              {saving && <div className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" />Sparar...</div>}
              {cards.length === 0 ? (
                <EmptyModuleState icon={Ticket} title="Inga klippkort" description="Lägg till klippkort för att hantera förutbetalda intäkter." actionLabel="Nytt klippkort" onAction={openNew} />
              ) : (
                <div className="rounded-xl border border-border overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/50">
                        <TableHead className="font-medium">Innehavare</TableHead>
                        <TableHead className="font-medium text-right">Klipp</TableHead>
                        <TableHead className="font-medium text-right">Pris</TableHead>
                        <TableHead className="font-medium text-right">Skuld (2420)</TableHead>
                        <TableHead className="font-medium">Förfaller</TableHead>
                        <TableHead className="font-medium">Status</TableHead>
                        <TableHead className="font-medium text-right">Åtgärder</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {cards.map((card) => {
                        const pricePerClip = card.price_paid / card.total_clips
                        const remaining = card.total_clips - card.used_clips
                        const debt = pricePerClip * remaining
                        const allUsed = card.used_clips >= card.total_clips
                        return (
                          <TableRow key={card.id} className={card.is_expired ? 'opacity-60' : ''}>
                            <TableCell className="font-medium">{card.holder_name}</TableCell>
                            <TableCell className="text-right tabular-nums">{card.used_clips} / {card.total_clips}</TableCell>
                            <TableCell className="text-right tabular-nums">{fmt(card.price_paid)} kr</TableCell>
                            <TableCell className="text-right tabular-nums font-medium">{fmt(debt)} kr</TableCell>
                            <TableCell>{card.expiry_date}</TableCell>
                            <TableCell>
                              <Badge variant="secondary" className={card.is_expired ? 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400' : allUsed ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400' : 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400'}>
                                {card.is_expired ? 'Förfallen' : allUsed ? 'Förbrukad' : 'Aktiv'}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="flex items-center justify-end gap-1">
                                {!card.is_expired && !allUsed && (
                                  <Button variant="ghost" size="icon" onClick={() => openUseClip(card)} title="Registrera klipp"><MinusCircle className="h-4 w-4" /></Button>
                                )}
                                <Button variant="ghost" size="icon" onClick={() => openEdit(card)} title="Redigera"><Pencil className="h-4 w-4" /></Button>
                                <Button variant="ghost" size="icon" className="text-red-600 hover:text-red-700" onClick={() => openDeleteConfirmation(card)} title="Ta bort"><Trash2 className="h-4 w-4" /></Button>
                              </div>
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

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{editingCard ? 'Redigera klippkort' : 'Nytt klippkort'}</DialogTitle><DialogDescription>{editingCard ? 'Uppdatera klippkortets uppgifter.' : 'Fyll i uppgifterna för det nya klippkortet.'}</DialogDescription></DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-2"><Label htmlFor="cc-name">Innehavare *</Label><Input id="cc-name" value={form.holder_name} onChange={(e) => setForm((f) => ({ ...f, holder_name: e.target.value }))} placeholder="Anna Svensson" /></div>
            <div className="grid grid-cols-3 gap-4">
              <div className="grid gap-2"><Label htmlFor="cc-total">Antal klipp *</Label><Input id="cc-total" type="number" min={1} value={form.total_clips} onChange={(e) => setForm((f) => ({ ...f, total_clips: e.target.value }))} /></div>
              <div className="grid gap-2"><Label htmlFor="cc-used">Använda klipp</Label><Input id="cc-used" type="number" min={0} value={form.used_clips} onChange={(e) => setForm((f) => ({ ...f, used_clips: e.target.value }))} /></div>
              <div className="grid gap-2"><Label htmlFor="cc-price">Pris (kr) *</Label><Input id="cc-price" type="number" min={0} value={form.price_paid} onChange={(e) => setForm((f) => ({ ...f, price_paid: e.target.value }))} /></div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2"><Label htmlFor="cc-purchase">Köpdatum *</Label><Input id="cc-purchase" type="date" value={form.purchase_date} onChange={(e) => setForm((f) => ({ ...f, purchase_date: e.target.value }))} /></div>
              <div className="grid gap-2"><Label htmlFor="cc-expiry">Förfallodatum *</Label><Input id="cc-expiry" type="date" value={form.expiry_date} onChange={(e) => setForm((f) => ({ ...f, expiry_date: e.target.value }))} /></div>
            </div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setDialogOpen(false)}>Avbryt</Button><Button onClick={handleSave} disabled={!form.holder_name.trim() || !form.price_paid}>{editingCard ? 'Uppdatera' : 'Skapa klippkort'}</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={useDialogOpen} onOpenChange={setUseDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Registrera klipp</DialogTitle><DialogDescription>Registrera ett använt klipp för <span className="font-semibold">{cardToUse?.holder_name}</span>? Kvarvarande: {cardToUse ? cardToUse.total_clips - cardToUse.used_clips : 0} klipp.</DialogDescription></DialogHeader>
          <DialogFooter><Button variant="outline" onClick={() => setUseDialogOpen(false)}>Avbryt</Button><Button onClick={handleUseClip}>Registrera klipp</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Ta bort klippkort</DialogTitle><DialogDescription>Är du säker på att du vill ta bort klippkortet för <span className="font-semibold">{cardToDelete?.holder_name}</span>? Denna åtgärd kan inte ångras.</DialogDescription></DialogHeader>
          <DialogFooter><Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>Avbryt</Button><Button variant="destructive" onClick={handleDelete}><Trash2 className="mr-2 h-4 w-4" />Ta bort</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
