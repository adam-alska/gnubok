'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { ModuleWorkspaceShell } from '@/components/modules/ModuleWorkspaceShell'
import { EmptyModuleState } from '@/components/modules/shared/EmptyModuleState'
import { KPICard } from '@/components/modules/shared/KPICard'
import { StatusBadge } from '@/components/modules/shared/StatusBadge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
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
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import {
  Plus,
  Loader2,
  Gift,
  Search,
} from 'lucide-react'

interface ModuleWorkspaceProps {
  module: { slug: string; name: string; cat: string; desc: string; longDesc: string }
  sectorSlug: string
  settingsHref: string
}

type GiftCardStatus = 'active' | 'redeemed' | 'expired' | 'partial'

interface GiftCard {
  id: string
  code: string
  amount: number
  remaining: number
  soldDate: string
  expiryDate: string
  status: GiftCardStatus
  customerName: string
  redemptions: { date: string; amount: number; note: string }[]
}

const STATUS_MAP: Record<GiftCardStatus, { label: string; variant: 'success' | 'warning' | 'danger' | 'info' }> = {
  active: { label: 'Aktivt', variant: 'success' },
  partial: { label: 'Delvis löst', variant: 'warning' },
  redeemed: { label: 'Inlöst', variant: 'info' },
  expired: { label: 'Förfallet', variant: 'danger' },
}

function fmt(n: number): string {
  return new Intl.NumberFormat('sv-SE', { maximumFractionDigits: 0 }).format(n)
}

function generateId(): string {
  return Math.random().toString(36).substring(2, 11)
}

function generateCode(): string {
  return `PK-${Math.random().toString(36).substring(2, 6).toUpperCase()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`
}

function todayStr(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function addYear(date: string): string {
  const d = new Date(date)
  d.setFullYear(d.getFullYear() + 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function PresentkortSomSkuldWorkspace({ module: mod, sectorSlug, settingsHref }: ModuleWorkspaceProps) {
  const supabase = createClient()

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [giftCards, setGiftCards] = useState<GiftCard[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [filterStatus, setFilterStatus] = useState<GiftCardStatus | 'all'>('all')

  const [dialogOpen, setDialogOpen] = useState(false)
  const [cardForm, setCardForm] = useState({
    amount: 500,
    customerName: '',
    soldDate: todayStr(),
    expiryDate: addYear(todayStr()),
  })

  const [redeemDialogOpen, setRedeemDialogOpen] = useState(false)
  const [redeemCard, setRedeemCard] = useState<GiftCard | null>(null)
  const [redeemForm, setRedeemForm] = useState({ amount: 0, note: '' })

  const saveCards = useCallback(async (cards: GiftCard[]) => {
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setSaving(false); return }

    await supabase.from('module_configs').upsert(
      {
        user_id: user.id,
        sector_slug: sectorSlug,
        module_slug: mod.slug,
        config_key: 'gift_cards',
        config_value: cards,
      },
      { onConflict: 'user_id,sector_slug,module_slug,config_key' }
    )
    setSaving(false)
  }, [supabase, sectorSlug, mod.slug])

  const fetchCards = useCallback(async () => {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); return }

    const { data } = await supabase
      .from('module_configs')
      .select('config_value')
      .eq('user_id', user.id)
      .eq('sector_slug', sectorSlug)
      .eq('module_slug', mod.slug)
      .eq('config_key', 'gift_cards')
      .maybeSingle()

    if (data?.config_value && Array.isArray(data.config_value)) {
      const cards = (data.config_value as GiftCard[]).map((c) => {
        if (c.status === 'active' && c.expiryDate < todayStr()) {
          return { ...c, status: 'expired' as GiftCardStatus }
        }
        return c
      })
      setGiftCards(cards)
    }

    setLoading(false)
  }, [supabase, sectorSlug, mod.slug])

  useEffect(() => { fetchCards() }, [fetchCards])

  const kpis = useMemo(() => {
    const totalSold = giftCards.reduce((s, c) => s + c.amount, 0)
    const totalRemaining = giftCards.filter((c) => c.status === 'active' || c.status === 'partial').reduce((s, c) => s + c.remaining, 0)
    const totalRedeemed = giftCards.filter((c) => c.status === 'redeemed' || c.status === 'partial').reduce((s, c) => s + (c.amount - c.remaining), 0)
    const totalExpired = giftCards.filter((c) => c.status === 'expired').reduce((s, c) => s + c.remaining, 0)
    const activeCount = giftCards.filter((c) => c.status === 'active' || c.status === 'partial').length
    return { totalSold, totalRemaining, totalRedeemed, totalExpired, activeCount }
  }, [giftCards])

  const filteredCards = useMemo(() => {
    let result = giftCards
    if (filterStatus !== 'all') {
      result = result.filter((c) => c.status === filterStatus)
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      result = result.filter(
        (c) =>
          c.code.toLowerCase().includes(q) ||
          c.customerName.toLowerCase().includes(q)
      )
    }
    return result.sort((a, b) => b.soldDate.localeCompare(a.soldDate))
  }, [giftCards, filterStatus, searchQuery])

  async function handleCreateCard() {
    const newCard: GiftCard = {
      id: generateId(),
      code: generateCode(),
      amount: cardForm.amount,
      remaining: cardForm.amount,
      soldDate: cardForm.soldDate,
      expiryDate: cardForm.expiryDate,
      status: 'active',
      customerName: cardForm.customerName.trim(),
      redemptions: [],
    }

    const updated = [...giftCards, newCard]
    setGiftCards(updated)
    setDialogOpen(false)
    setCardForm({ amount: 500, customerName: '', soldDate: todayStr(), expiryDate: addYear(todayStr()) })
    await saveCards(updated)
  }

  function openRedeem(card: GiftCard) {
    setRedeemCard(card)
    setRedeemForm({ amount: card.remaining, note: '' })
    setRedeemDialogOpen(true)
  }

  async function handleRedeem() {
    if (!redeemCard || redeemForm.amount <= 0) return

    const amount = Math.min(redeemForm.amount, redeemCard.remaining)
    const newRemaining = redeemCard.remaining - amount
    const newStatus: GiftCardStatus = newRemaining <= 0 ? 'redeemed' : 'partial'

    const updated = giftCards.map((c) =>
      c.id === redeemCard.id
        ? {
            ...c,
            remaining: newRemaining,
            status: newStatus,
            redemptions: [...c.redemptions, { date: todayStr(), amount, note: redeemForm.note }],
          }
        : c
    )

    setGiftCards(updated)
    setRedeemDialogOpen(false)
    setRedeemCard(null)
    await saveCards(updated)
  }

  return (
    <>
      <ModuleWorkspaceShell
        title={mod.name}
        description={mod.desc}
        category="bokforing"
        sectorName="Frisör & Skönhet"
        backHref={`/m/${sectorSlug}`}
        settingsHref={settingsHref}
        actions={
          <Button onClick={() => setDialogOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Nytt presentkort
          </Button>
        }
      >
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <Tabs defaultValue="oversikt" className="space-y-6">
            <TabsList>
              <TabsTrigger value="oversikt">Översikt</TabsTrigger>
              <TabsTrigger value="lista">Alla presentkort</TabsTrigger>
            </TabsList>

            <TabsContent value="oversikt" className="space-y-6">
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
                <KPICard label="Totalt sålt" value={fmt(kpis.totalSold)} unit="kr" />
                <KPICard label="Utestående skuld (2420)" value={fmt(kpis.totalRemaining)} unit="kr" />
                <KPICard label="Inlöst" value={fmt(kpis.totalRedeemed)} unit="kr" />
                <KPICard label="Förfallet" value={fmt(kpis.totalExpired)} unit="kr" />
                <KPICard label="Aktiva kort" value={String(kpis.activeCount)} unit="st" />
              </div>

              <div className="rounded-xl border border-border bg-card p-6 max-w-lg">
                <h3 className="text-sm font-semibold mb-2">Bokföringslogik</h3>
                <ul className="text-xs text-muted-foreground space-y-1.5">
                  <li>Vid försäljning: Debet 1910 (Kassa) / Kredit 2420 (Förskottsintäkt)</li>
                  <li>Vid inlösen: Debet 2420 / Kredit 3010 (Behandlingsintäkter)</li>
                  <li>Vid förfall: Debet 2420 / Kredit 3099 (Övriga intäkter)</li>
                </ul>
              </div>
            </TabsContent>

            <TabsContent value="lista" className="space-y-6">
              <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
                <div className="relative flex-1 max-w-sm">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Sök kod eller kundnamn..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-9"
                  />
                </div>
                <Select
                  value={filterStatus}
                  onValueChange={(val) => setFilterStatus(val as GiftCardStatus | 'all')}
                >
                  <SelectTrigger className="w-[180px]">
                    <SelectValue placeholder="Filtrera status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Alla statusar</SelectItem>
                    {Object.entries(STATUS_MAP).map(([key, { label }]) => (
                      <SelectItem key={key} value={key}>{label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {saving && (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Sparar...
                  </div>
                )}
              </div>

              {filteredCards.length === 0 ? (
                <EmptyModuleState
                  icon={Gift}
                  title="Inga presentkort"
                  description={
                    searchQuery || filterStatus !== 'all'
                      ? 'Inga presentkort matchar din sökning.'
                      : 'Skapa ditt första presentkort för att börja spåra förskottsintäkter på konto 2420.'
                  }
                  actionLabel={!searchQuery && filterStatus === 'all' ? 'Nytt presentkort' : undefined}
                  onAction={!searchQuery && filterStatus === 'all' ? () => setDialogOpen(true) : undefined}
                />
              ) : (
                <div className="rounded-xl border border-border overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/50">
                        <TableHead className="font-medium">Kod</TableHead>
                        <TableHead className="font-medium">Kund</TableHead>
                        <TableHead className="font-medium text-right">Belopp</TableHead>
                        <TableHead className="font-medium text-right">Kvar</TableHead>
                        <TableHead className="font-medium">Sålt</TableHead>
                        <TableHead className="font-medium">Förfaller</TableHead>
                        <TableHead className="font-medium">Status</TableHead>
                        <TableHead className="font-medium text-right">Åtgärd</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredCards.map((card) => (
                        <TableRow key={card.id}>
                          <TableCell className="font-mono text-xs">{card.code}</TableCell>
                          <TableCell>{card.customerName || '-'}</TableCell>
                          <TableCell className="text-right tabular-nums">{fmt(card.amount)} kr</TableCell>
                          <TableCell className="text-right tabular-nums">{fmt(card.remaining)} kr</TableCell>
                          <TableCell className="text-sm">{card.soldDate}</TableCell>
                          <TableCell className="text-sm">{card.expiryDate}</TableCell>
                          <TableCell>
                            <StatusBadge
                              label={STATUS_MAP[card.status].label}
                              variant={STATUS_MAP[card.status].variant}
                            />
                          </TableCell>
                          <TableCell className="text-right">
                            {(card.status === 'active' || card.status === 'partial') && (
                              <Button variant="ghost" size="sm" onClick={() => openRedeem(card)}>
                                Lös in
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </TabsContent>
          </Tabs>
        )}
      </ModuleWorkspaceShell>

      {/* New gift card dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Nytt presentkort</DialogTitle>
            <DialogDescription>Sälj ett nytt presentkort. Belopp bokförs som skuld på konto 2420.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-2">
              <Label htmlFor="gc-customer">Kundnamn</Label>
              <Input
                id="gc-customer"
                value={cardForm.customerName}
                onChange={(e) => setCardForm((f) => ({ ...f, customerName: e.target.value }))}
                placeholder="Valfritt"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="gc-amount">Belopp (kr) *</Label>
                <Input
                  id="gc-amount"
                  type="number"
                  min={1}
                  value={cardForm.amount}
                  onChange={(e) => setCardForm((f) => ({ ...f, amount: Number(e.target.value) }))}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="gc-sold">Försäljningsdatum</Label>
                <Input
                  id="gc-sold"
                  type="date"
                  value={cardForm.soldDate}
                  onChange={(e) => setCardForm((f) => ({ ...f, soldDate: e.target.value, expiryDate: addYear(e.target.value) }))}
                />
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="gc-expiry">Förfallodatum</Label>
              <Input
                id="gc-expiry"
                type="date"
                value={cardForm.expiryDate}
                onChange={(e) => setCardForm((f) => ({ ...f, expiryDate: e.target.value }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Avbryt</Button>
            <Button onClick={handleCreateCard} disabled={cardForm.amount <= 0}>Skapa presentkort</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Redeem dialog */}
      <Dialog open={redeemDialogOpen} onOpenChange={setRedeemDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Lös in presentkort</DialogTitle>
            <DialogDescription>
              Kvarvarande värde: {redeemCard ? fmt(redeemCard.remaining) : 0} kr. Belopp flyttas från konto 2420 till 3010.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-2">
              <Label htmlFor="redeem-amount">Belopp att lösa in (kr)</Label>
              <Input
                id="redeem-amount"
                type="number"
                min={1}
                max={redeemCard?.remaining ?? 0}
                value={redeemForm.amount}
                onChange={(e) => setRedeemForm((f) => ({ ...f, amount: Number(e.target.value) }))}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="redeem-note">Anteckning</Label>
              <Input
                id="redeem-note"
                value={redeemForm.note}
                onChange={(e) => setRedeemForm((f) => ({ ...f, note: e.target.value }))}
                placeholder="T.ex. klippning + färgning"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRedeemDialogOpen(false)}>Avbryt</Button>
            <Button onClick={handleRedeem} disabled={redeemForm.amount <= 0}>Lös in</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
