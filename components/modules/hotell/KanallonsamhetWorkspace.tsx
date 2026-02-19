'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { ModuleWorkspaceShell } from '@/components/modules/ModuleWorkspaceShell'
import { KPICard } from '@/components/modules/shared/KPICard'
import { EmptyModuleState } from '@/components/modules/shared/EmptyModuleState'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
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
  Globe,
  Lightbulb,
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface ModuleWorkspaceProps {
  module: { slug: string; name: string; cat: string; desc: string; longDesc: string }
  sectorSlug: string
  settingsHref: string
}

type Channel = 'Direkt' | 'Booking.com' | 'Expedia' | 'Airbnb' | 'Hotels.com' | 'Ovrigt'

interface ChannelEntry {
  id: string
  month: string
  channel: Channel
  bookings: number
  grossRevenue: number
  commissionPct: number
  commissionAmount: number
  netRevenue: number
  marketingCost: number
  totalCost: number
  profit: number
  profitMargin: number
}

const CHANNELS: Channel[] = ['Direkt', 'Booking.com', 'Expedia', 'Airbnb', 'Hotels.com', 'Ovrigt']

const CHANNEL_COLORS: Record<Channel, string> = {
  'Direkt': 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400',
  'Booking.com': 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
  'Expedia': 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
  'Airbnb': 'bg-rose-100 text-rose-800 dark:bg-rose-900/30 dark:text-rose-400',
  'Hotels.com': 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400',
  'Ovrigt': 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400',
}

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7)
}

function fmt(n: number): string {
  return new Intl.NumberFormat('sv-SE', { maximumFractionDigits: 0 }).format(n)
}

function fmtDec(n: number): string {
  return new Intl.NumberFormat('sv-SE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)
}

function fmtPct(n: number): string {
  return isFinite(n) ? n.toFixed(1) : '0.0'
}

function currentMonth(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

export function KanallonsamhetWorkspace({ module: mod, sectorSlug, settingsHref }: ModuleWorkspaceProps) {
  const supabase = createClient()

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [entries, setEntries] = useState<ChannelEntry[]>([])

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingEntry, setEditingEntry] = useState<ChannelEntry | null>(null)
  const [form, setForm] = useState({
    month: currentMonth(),
    channel: 'Direkt' as Channel,
    bookings: 0,
    grossRevenue: 0,
    commissionPct: 0,
    marketingCost: 0,
  })

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [entryToDelete, setEntryToDelete] = useState<ChannelEntry | null>(null)

  const saveEntries = useCallback(async (newEntries: ChannelEntry[]) => {
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setSaving(false); return }

    await supabase.from('module_configs').upsert(
      { user_id: user.id, sector_slug: sectorSlug, module_slug: mod.slug, config_key: 'channel_entries', config_value: newEntries },
      { onConflict: 'user_id,sector_slug,module_slug,config_key' }
    )
    setSaving(false)
  }, [supabase, sectorSlug, mod.slug])

  const fetchEntries = useCallback(async () => {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); return }

    const { data } = await supabase
      .from('module_configs')
      .select('config_value')
      .eq('user_id', user.id)
      .eq('sector_slug', sectorSlug)
      .eq('module_slug', mod.slug)
      .eq('config_key', 'channel_entries')
      .maybeSingle()

    if (data?.config_value && Array.isArray(data.config_value)) {
      setEntries(data.config_value as ChannelEntry[])
    }
    setLoading(false)
  }, [supabase, sectorSlug, mod.slug])

  useEffect(() => { fetchEntries() }, [fetchEntries])

  // Summary by channel
  const channelSummary = useMemo(() => {
    const summary: Record<Channel, { bookings: number; gross: number; commission: number; net: number; marketing: number; totalCost: number; profit: number }> = {} as any
    for (const ch of CHANNELS) {
      summary[ch] = { bookings: 0, gross: 0, commission: 0, net: 0, marketing: 0, totalCost: 0, profit: 0 }
    }
    for (const e of entries) {
      const s = summary[e.channel]
      s.bookings += e.bookings
      s.gross += e.grossRevenue
      s.commission += e.commissionAmount
      s.net += e.netRevenue
      s.marketing += e.marketingCost
      s.totalCost += e.totalCost
      s.profit += e.profit
    }
    return summary
  }, [entries])

  // Recommendations
  const recommendations = useMemo(() => {
    const recs: string[] = []
    const totalProfit = Object.values(channelSummary).reduce((s, c) => s + c.profit, 0)
    const directProfit = channelSummary['Direkt'].profit

    if (directProfit > 0 && totalProfit > 0) {
      const directShare = (directProfit / totalProfit) * 100
      if (directShare < 30) {
        recs.push('Direktbokningar står för under 30% av vinsten. Överväg att investera i egen hemsida och marknadsföring för att öka direktbokningar.')
      }
    }

    for (const ch of CHANNELS) {
      if (ch === 'Direkt') continue
      const s = channelSummary[ch]
      if (s.gross > 0) {
        const margin = (s.profit / s.gross) * 100
        if (margin < 10) {
          recs.push(`${ch} har en vinstmarginal under 10% (${fmtPct(margin)}%). Överväg prishöjning eller omförhandling av provision.`)
        }
      }
    }

    const bookingCom = channelSummary['Booking.com']
    const expedia = channelSummary['Expedia']
    if (bookingCom.bookings > 0 && expedia.bookings > 0) {
      const bcAcq = bookingCom.gross > 0 ? bookingCom.totalCost / bookingCom.bookings : 0
      const exAcq = expedia.gross > 0 ? expedia.totalCost / expedia.bookings : 0
      if (bcAcq > 0 && exAcq > 0) {
        if (bcAcq > exAcq * 1.3) {
          recs.push(`Booking.com har högre förvärvskostnad per bokning (${fmt(Math.round(bcAcq))} kr) än Expedia (${fmt(Math.round(exAcq))} kr). Överväg att flytta volymer.`)
        } else if (exAcq > bcAcq * 1.3) {
          recs.push(`Expedia har högre förvärvskostnad per bokning (${fmt(Math.round(exAcq))} kr) än Booking.com (${fmt(Math.round(bcAcq))} kr). Överväg att flytta volymer.`)
        }
      }
    }

    if (recs.length === 0) {
      recs.push('Lägg till data för fler kanaler för att få rekommendationer om kanalstrategi.')
    }

    return recs
  }, [channelSummary])

  function openNew() {
    setEditingEntry(null)
    setForm({ month: currentMonth(), channel: 'Direkt', bookings: 0, grossRevenue: 0, commissionPct: 0, marketingCost: 0 })
    setDialogOpen(true)
  }

  function openEdit(entry: ChannelEntry) {
    setEditingEntry(entry)
    setForm({
      month: entry.month,
      channel: entry.channel,
      bookings: entry.bookings,
      grossRevenue: entry.grossRevenue,
      commissionPct: entry.commissionPct,
      marketingCost: entry.marketingCost,
    })
    setDialogOpen(true)
  }

  async function handleSave() {
    const commissionAmount = form.grossRevenue * (form.commissionPct / 100)
    const netRevenue = form.grossRevenue - commissionAmount
    const totalCost = commissionAmount + form.marketingCost
    const profit = form.grossRevenue - totalCost
    const profitMargin = form.grossRevenue > 0 ? (profit / form.grossRevenue) * 100 : 0

    const item: ChannelEntry = {
      id: editingEntry?.id ?? generateId(),
      month: form.month,
      channel: form.channel,
      bookings: form.bookings,
      grossRevenue: form.grossRevenue,
      commissionPct: form.commissionPct,
      commissionAmount,
      netRevenue,
      marketingCost: form.marketingCost,
      totalCost,
      profit,
      profitMargin,
    }

    let updated: ChannelEntry[]
    if (editingEntry) {
      updated = entries.map(e => e.id === editingEntry.id ? item : e)
    } else {
      updated = [...entries, item]
    }
    setEntries(updated)
    setDialogOpen(false)
    await saveEntries(updated)
  }

  async function handleDelete() {
    if (!entryToDelete) return
    const updated = entries.filter(e => e.id !== entryToDelete.id)
    setEntries(updated)
    setDeleteDialogOpen(false)
    setEntryToDelete(null)
    await saveEntries(updated)
  }

  return (
    <>
      <ModuleWorkspaceShell
        title={mod.name}
        description={mod.desc}
        category="rapport"
        sectorName="Hotell & Boende"
        backHref={`/m/${sectorSlug}`}
        settingsHref={settingsHref}
        actions={
          <Button onClick={openNew}>
            <Plus className="mr-2 h-4 w-4" />
            Ny kanalpost
          </Button>
        }
      >
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <Tabs defaultValue="jamforelse" className="space-y-6">
            <TabsList>
              <TabsTrigger value="jamforelse">Kanalsammanställning</TabsTrigger>
              <TabsTrigger value="data">Detaljdata</TabsTrigger>
              <TabsTrigger value="rekommendationer">Rekommendationer</TabsTrigger>
            </TabsList>

            <TabsContent value="jamforelse" className="space-y-6">
              {entries.length === 0 ? (
                <EmptyModuleState icon={Globe} title="Ingen kanaldata" description="Lägg till data per kanal för att jämföra lönsamhet." actionLabel="Lägg till" onAction={openNew} />
              ) : (
                <div className="rounded-xl border border-border overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/50">
                        <TableHead className="font-medium">Kanal</TableHead>
                        <TableHead className="font-medium text-right">Bokningar</TableHead>
                        <TableHead className="font-medium text-right">Brutto (kr)</TableHead>
                        <TableHead className="font-medium text-right">Provision (kr)</TableHead>
                        <TableHead className="font-medium text-right">Marknad (kr)</TableHead>
                        <TableHead className="font-medium text-right">Tot. kostnad</TableHead>
                        <TableHead className="font-medium text-right">Vinst (kr)</TableHead>
                        <TableHead className="font-medium text-right">Marginal %</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {CHANNELS.filter(ch => channelSummary[ch].bookings > 0).map(ch => {
                        const s = channelSummary[ch]
                        const margin = s.gross > 0 ? (s.profit / s.gross) * 100 : 0
                        return (
                          <TableRow key={ch}>
                            <TableCell><Badge variant="secondary" className={CHANNEL_COLORS[ch]}>{ch}</Badge></TableCell>
                            <TableCell className="text-right">{fmt(s.bookings)}</TableCell>
                            <TableCell className="text-right font-mono">{fmt(s.gross)}</TableCell>
                            <TableCell className="text-right font-mono">{fmt(s.commission)}</TableCell>
                            <TableCell className="text-right font-mono">{fmt(s.marketing)}</TableCell>
                            <TableCell className="text-right font-mono">{fmt(s.totalCost)}</TableCell>
                            <TableCell className={cn('text-right font-mono font-semibold', s.profit >= 0 ? 'text-emerald-600' : 'text-red-600')}>{fmt(s.profit)}</TableCell>
                            <TableCell className={cn('text-right font-mono', margin >= 50 ? 'text-emerald-600' : margin >= 25 ? 'text-amber-600' : 'text-red-600')}>{fmtPct(margin)}%</TableCell>
                          </TableRow>
                        )
                      })}
                      {(() => {
                        const totals = Object.values(channelSummary).reduce((acc, s) => ({
                          bookings: acc.bookings + s.bookings,
                          gross: acc.gross + s.gross,
                          commission: acc.commission + s.commission,
                          marketing: acc.marketing + s.marketing,
                          totalCost: acc.totalCost + s.totalCost,
                          profit: acc.profit + s.profit,
                        }), { bookings: 0, gross: 0, commission: 0, marketing: 0, totalCost: 0, profit: 0 })
                        const margin = totals.gross > 0 ? (totals.profit / totals.gross) * 100 : 0
                        return (
                          <TableRow className="bg-muted/30 font-semibold">
                            <TableCell>Totalt</TableCell>
                            <TableCell className="text-right">{fmt(totals.bookings)}</TableCell>
                            <TableCell className="text-right font-mono">{fmt(totals.gross)}</TableCell>
                            <TableCell className="text-right font-mono">{fmt(totals.commission)}</TableCell>
                            <TableCell className="text-right font-mono">{fmt(totals.marketing)}</TableCell>
                            <TableCell className="text-right font-mono">{fmt(totals.totalCost)}</TableCell>
                            <TableCell className="text-right font-mono">{fmt(totals.profit)}</TableCell>
                            <TableCell className="text-right font-mono">{fmtPct(margin)}%</TableCell>
                          </TableRow>
                        )
                      })()}
                    </TableBody>
                  </Table>
                </div>
              )}
            </TabsContent>

            <TabsContent value="data" className="space-y-6">
              {saving && <div className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" />Sparar...</div>}
              {entries.length === 0 ? (
                <EmptyModuleState icon={Globe} title="Ingen data" description="Lägg till kanaldata." actionLabel="Lägg till" onAction={openNew} />
              ) : (
                <div className="rounded-xl border border-border overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/50">
                        <TableHead className="font-medium">Månad</TableHead>
                        <TableHead className="font-medium">Kanal</TableHead>
                        <TableHead className="font-medium text-right">Bokningar</TableHead>
                        <TableHead className="font-medium text-right">Brutto</TableHead>
                        <TableHead className="font-medium text-right">Prov. %</TableHead>
                        <TableHead className="font-medium text-right">Vinst</TableHead>
                        <TableHead className="font-medium text-right">Marginal</TableHead>
                        <TableHead className="font-medium text-right">Åtgärder</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {[...entries].sort((a, b) => b.month.localeCompare(a.month)).map(entry => (
                        <TableRow key={entry.id}>
                          <TableCell className="font-medium">{entry.month}</TableCell>
                          <TableCell><Badge variant="secondary" className={CHANNEL_COLORS[entry.channel]}>{entry.channel}</Badge></TableCell>
                          <TableCell className="text-right">{entry.bookings}</TableCell>
                          <TableCell className="text-right font-mono">{fmt(entry.grossRevenue)}</TableCell>
                          <TableCell className="text-right font-mono">{fmtPct(entry.commissionPct)}%</TableCell>
                          <TableCell className={cn('text-right font-mono font-semibold', entry.profit >= 0 ? 'text-emerald-600' : 'text-red-600')}>{fmt(entry.profit)}</TableCell>
                          <TableCell className="text-right font-mono">{fmtPct(entry.profitMargin)}%</TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-1">
                              <Button variant="ghost" size="icon" onClick={() => openEdit(entry)} title="Redigera"><Pencil className="h-4 w-4" /></Button>
                              <Button variant="ghost" size="icon" className="text-red-600 hover:text-red-700" onClick={() => { setEntryToDelete(entry); setDeleteDialogOpen(true) }} title="Ta bort"><Trash2 className="h-4 w-4" /></Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </TabsContent>

            <TabsContent value="rekommendationer" className="space-y-4">
              {recommendations.map((rec, i) => (
                <Card key={i}>
                  <CardContent className="flex items-start gap-3 pt-6">
                    <Lightbulb className="h-5 w-5 text-amber-500 flex-shrink-0 mt-0.5" />
                    <p className="text-sm">{rec}</p>
                  </CardContent>
                </Card>
              ))}
            </TabsContent>
          </Tabs>
        )}
      </ModuleWorkspaceShell>

      {/* Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingEntry ? 'Redigera kanalpost' : 'Ny kanalpost'}</DialogTitle>
            <DialogDescription>Registrera intäkter och kostnader per kanal.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Månad *</Label>
                <Input type="month" value={form.month} onChange={e => setForm(f => ({ ...f, month: e.target.value }))} />
              </div>
              <div className="grid gap-2">
                <Label>Kanal *</Label>
                <Select value={form.channel} onValueChange={val => setForm(f => ({ ...f, channel: val as Channel }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{CHANNELS.map(ch => <SelectItem key={ch} value={ch}>{ch}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Antal bokningar</Label>
                <Input type="number" min={0} value={form.bookings || ''} onChange={e => setForm(f => ({ ...f, bookings: parseInt(e.target.value) || 0 }))} />
              </div>
              <div className="grid gap-2">
                <Label>Bruttointakt (kr) *</Label>
                <Input type="number" min={0} step="0.01" value={form.grossRevenue || ''} onChange={e => setForm(f => ({ ...f, grossRevenue: parseFloat(e.target.value) || 0 }))} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Provision (%)</Label>
                <Input type="number" min={0} max={100} step={0.5} value={form.commissionPct || ''} onChange={e => setForm(f => ({ ...f, commissionPct: parseFloat(e.target.value) || 0 }))} />
              </div>
              <div className="grid gap-2">
                <Label>Marknadskostnad (kr)</Label>
                <Input type="number" min={0} step="0.01" value={form.marketingCost || ''} onChange={e => setForm(f => ({ ...f, marketingCost: parseFloat(e.target.value) || 0 }))} />
              </div>
            </div>
            {form.grossRevenue > 0 && (
              <div className="rounded-lg bg-muted/50 p-3 text-sm space-y-1">
                <div className="flex justify-between"><span className="text-muted-foreground">Provision:</span><span className="font-mono">{fmt(Math.round(form.grossRevenue * form.commissionPct / 100))} kr</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Tot. kostnad:</span><span className="font-mono">{fmt(Math.round(form.grossRevenue * form.commissionPct / 100 + form.marketingCost))} kr</span></div>
                <div className="flex justify-between font-semibold"><span>Vinst:</span><span className="font-mono">{fmt(Math.round(form.grossRevenue - form.grossRevenue * form.commissionPct / 100 - form.marketingCost))} kr</span></div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Avbryt</Button>
            <Button onClick={handleSave} disabled={!form.month || form.grossRevenue <= 0}>{editingEntry ? 'Uppdatera' : 'Spara'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Ta bort kanalpost</DialogTitle>
            <DialogDescription>Är du säker på att du vill ta bort denna post?</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>Avbryt</Button>
            <Button variant="destructive" onClick={handleDelete}><Trash2 className="mr-2 h-4 w-4" />Ta bort</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
