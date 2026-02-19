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
import { Textarea } from '@/components/ui/textarea'
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
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import {
  Receipt,
  Plus,
  Pencil,
  Trash2,
  Loader2,
  AlertTriangle,
  BookOpen,
  Users,
  Calculator,
} from 'lucide-react'

// ===== Types =====

interface ModuleWorkspaceProps {
  module: { slug: string; name: string; cat: string; desc: string; longDesc: string }
  sectorSlug: string
  settingsHref: string
}

interface RepresentationEntry {
  id: string
  date: string
  type: 'extern' | 'intern'
  description: string
  guests: number
  guestNames: string
  businessPurpose: string
  totalCost: number
  vatRate: number
  perPerson: number
  deductible: number
  nonDeductible: number
  deductibleVat: number
  nonDeductibleVat: number
}

// ===== Constants =====

const MAX_DEDUCTIBLE_PER_PERSON = 90 // SEK
const MAX_VAT_BASE_PER_PERSON = 300 // SEK ex. VAT for VAT deduction calculation

const MONTHS = [
  { value: '01', label: 'Januari' },
  { value: '02', label: 'Februari' },
  { value: '03', label: 'Mars' },
  { value: '04', label: 'April' },
  { value: '05', label: 'Maj' },
  { value: '06', label: 'Juni' },
  { value: '07', label: 'Juli' },
  { value: '08', label: 'Augusti' },
  { value: '09', label: 'September' },
  { value: '10', label: 'Oktober' },
  { value: '11', label: 'November' },
  { value: '12', label: 'December' },
]

// ===== Helpers =====

function todayStr(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function currentYear(): string {
  return String(new Date().getFullYear())
}

function currentMonth(): string {
  return String(new Date().getMonth() + 1).padStart(2, '0')
}

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

function fmt(n: number): string {
  return new Intl.NumberFormat('sv-SE', { maximumFractionDigits: 0 }).format(n)
}

function fmtDec(n: number): string {
  return new Intl.NumberFormat('sv-SE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)
}

/**
 * Calculate representation deductibility breakdown per Swedish tax rules.
 *
 * Rules:
 * - Max 90 SEK per person is deductible for food/drink
 * - VAT deduction: 50% of the VAT on food, up to 300 SEK ex. VAT per person
 *   At 12% food VAT: max deductible VAT = 0.5 * 0.12 * min(costExVatPerPerson, 300) * guests
 */
function calculateBreakdown(totalCost: number, guests: number, vatRate: number) {
  if (guests <= 0 || totalCost <= 0) {
    return { perPerson: 0, deductible: 0, nonDeductible: 0, deductibleVat: 0, nonDeductibleVat: 0 }
  }

  const vatMultiplier = vatRate / 100
  const totalExVat = totalCost / (1 + vatMultiplier)
  const totalVat = totalCost - totalExVat
  const costExVatPerPerson = totalExVat / guests

  // Deductible portion of the cost (ex. VAT): max 90 SEK per person, capped at actual cost per person
  const deductiblePerPerson = Math.min(MAX_DEDUCTIBLE_PER_PERSON, costExVatPerPerson)
  const deductible = Math.round(deductiblePerPerson * guests * 100) / 100
  const nonDeductible = Math.round((totalExVat - deductible) * 100) / 100

  // VAT deduction: 50% of VAT on food up to 300 SEK ex. VAT per person
  const vatBasePerPerson = Math.min(costExVatPerPerson, MAX_VAT_BASE_PER_PERSON)
  const vatOnDeductibleBase = vatBasePerPerson * vatMultiplier * guests
  const deductibleVat = Math.round(vatOnDeductibleBase * 0.5 * 100) / 100
  const nonDeductibleVat = Math.round((totalVat - deductibleVat) * 100) / 100

  const perPerson = Math.round((totalCost / guests) * 100) / 100

  return { perPerson, deductible, nonDeductible, deductibleVat, nonDeductibleVat }
}

// ===== Empty form =====

const EMPTY_FORM = {
  date: todayStr(),
  type: 'extern' as 'extern' | 'intern',
  description: '',
  guests: '2',
  guestNames: '',
  businessPurpose: '',
  totalCost: '',
  vatRate: '12',
}

// ===== Component =====

export function RepresentationsbokforingWorkspace({ module: mod, sectorSlug, settingsHref }: ModuleWorkspaceProps) {
  const supabase = createClient()

  // Core state
  const [activeTab, setActiveTab] = useState('ny')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [entries, setEntries] = useState<RepresentationEntry[]>([])

  // Form state
  const [form, setForm] = useState(EMPTY_FORM)
  const [editingEntry, setEditingEntry] = useState<RepresentationEntry | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)

  // Filter state (overview tab)
  const [filterType, setFilterType] = useState<'alla' | 'extern' | 'intern'>('alla')
  const [filterMonth, setFilterMonth] = useState<string>('alla')
  const [filterYear, setFilterYear] = useState<string>(currentYear())

  // Bookkeeping tab state
  const [bookkeepingPeriod, setBookkeepingPeriod] = useState<'month' | 'quarter' | 'year'>('month')
  const [bookkeepingMonth, setBookkeepingMonth] = useState<string>(currentMonth())
  const [bookkeepingQuarter, setBookkeepingQuarter] = useState<string>('1')
  const [bookkeepingYear, setBookkeepingYear] = useState<string>(currentYear())

  // ===== Data fetching =====

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
      .eq('config_key', 'representation_entries')
      .single()

    if (data?.config_value && Array.isArray(data.config_value)) {
      setEntries(data.config_value as RepresentationEntry[])
    } else {
      setEntries([])
    }
    setLoading(false)
  }, [supabase, sectorSlug, mod.slug])

  const saveEntries = useCallback(async (newEntries: RepresentationEntry[]) => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    await supabase
      .from('module_configs')
      .upsert(
        {
          user_id: user.id,
          sector_slug: sectorSlug,
          module_slug: mod.slug,
          config_key: 'representation_entries',
          config_value: newEntries,
        },
        { onConflict: 'user_id,sector_slug,module_slug,config_key' }
      )
  }, [supabase, sectorSlug, mod.slug])

  useEffect(() => {
    fetchEntries()
  }, [fetchEntries])

  // ===== Auto-calculation for form =====

  const formBreakdown = useMemo(() => {
    const totalCost = parseFloat(form.totalCost) || 0
    const guests = parseInt(form.guests) || 0
    const vatRate = parseFloat(form.vatRate) || 12
    return calculateBreakdown(totalCost, guests, vatRate)
  }, [form.totalCost, form.guests, form.vatRate])

  // ===== CRUD =====

  function openNewEntry() {
    setEditingEntry(null)
    setForm({ ...EMPTY_FORM, date: todayStr() })
    if (activeTab === 'ny') {
      // Already on the form tab, just reset
    } else {
      setActiveTab('ny')
    }
  }

  function openEditEntry(entry: RepresentationEntry) {
    setEditingEntry(entry)
    setForm({
      date: entry.date,
      type: entry.type,
      description: entry.description,
      guests: String(entry.guests),
      guestNames: entry.guestNames,
      businessPurpose: entry.businessPurpose,
      totalCost: String(entry.totalCost),
      vatRate: String(entry.vatRate),
    })
    setDialogOpen(true)
  }

  async function handleSaveEntry() {
    const totalCost = parseFloat(form.totalCost)
    const guests = parseInt(form.guests)
    const vatRate = parseFloat(form.vatRate) || 12

    if (!form.description || isNaN(totalCost) || totalCost <= 0 || isNaN(guests) || guests <= 0) return

    setSaving(true)

    const breakdown = calculateBreakdown(totalCost, guests, vatRate)

    const entry: RepresentationEntry = {
      id: editingEntry?.id ?? generateId(),
      date: form.date,
      type: form.type,
      description: form.description,
      guests,
      guestNames: form.guestNames,
      businessPurpose: form.businessPurpose,
      totalCost,
      vatRate,
      ...breakdown,
    }

    let newEntries: RepresentationEntry[]
    if (editingEntry) {
      newEntries = entries.map((e) => (e.id === editingEntry.id ? entry : e))
    } else {
      newEntries = [entry, ...entries]
    }

    // Sort by date descending
    newEntries.sort((a, b) => b.date.localeCompare(a.date))

    await saveEntries(newEntries)
    setEntries(newEntries)
    setSaving(false)
    setDialogOpen(false)

    if (!editingEntry) {
      // Reset form for new entries
      setForm({ ...EMPTY_FORM, date: todayStr() })
    }
  }

  async function handleDeleteEntry(id: string) {
    const newEntries = entries.filter((e) => e.id !== id)
    await saveEntries(newEntries)
    setEntries(newEntries)
  }

  // ===== Computed data =====

  // Entries filtered by year for summary cards
  const yearEntries = useMemo(() => {
    return entries.filter((e) => e.date.startsWith(filterYear))
  }, [entries, filterYear])

  const totalThisYear = useMemo(() => yearEntries.reduce((s, e) => s + e.totalCost, 0), [yearEntries])
  const deductibleThisYear = useMemo(() => yearEntries.reduce((s, e) => s + e.deductible, 0), [yearEntries])
  const nonDeductibleThisYear = useMemo(() => yearEntries.reduce((s, e) => s + e.nonDeductible, 0), [yearEntries])
  const eventsThisYear = yearEntries.length

  // Filtered entries for the overview tab
  const filteredEntries = useMemo(() => {
    return entries.filter((e) => {
      if (!e.date.startsWith(filterYear)) return false
      if (filterType !== 'alla' && e.type !== filterType) return false
      if (filterMonth !== 'alla' && !e.date.startsWith(`${filterYear}-${filterMonth}`)) return false
      return true
    })
  }, [entries, filterType, filterMonth, filterYear])

  // Internal events count for warning
  const internalEventsThisYear = useMemo(() => {
    const yr = bookkeepingYear
    return entries.filter((e) => e.type === 'intern' && e.date.startsWith(yr)).length
  }, [entries, bookkeepingYear])

  // Bookkeeping period entries
  const bookkeepingEntries = useMemo(() => {
    const yr = bookkeepingYear
    return entries.filter((e) => {
      if (!e.date.startsWith(yr)) return false
      if (bookkeepingPeriod === 'year') return true
      if (bookkeepingPeriod === 'month') {
        return e.date.startsWith(`${yr}-${bookkeepingMonth}`)
      }
      if (bookkeepingPeriod === 'quarter') {
        const month = parseInt(e.date.split('-')[1])
        const q = Math.ceil(month / 3)
        return q === parseInt(bookkeepingQuarter)
      }
      return true
    })
  }, [entries, bookkeepingPeriod, bookkeepingMonth, bookkeepingQuarter, bookkeepingYear])

  const bookkeepingTotals = useMemo(() => {
    const deductible = bookkeepingEntries.reduce((s, e) => s + e.deductible, 0)
    const nonDeductible = bookkeepingEntries.reduce((s, e) => s + e.nonDeductible, 0)
    const deductibleVat = bookkeepingEntries.reduce((s, e) => s + e.deductibleVat, 0)
    const nonDeductibleVat = bookkeepingEntries.reduce((s, e) => s + e.nonDeductibleVat, 0)
    return { deductible, nonDeductible, deductibleVat, nonDeductibleVat }
  }, [bookkeepingEntries])

  // Monthly breakdown for bookkeeping summary table
  const monthlyBreakdown = useMemo(() => {
    const yr = bookkeepingYear
    const yearData = entries.filter((e) => e.date.startsWith(yr))

    const result: { month: string; label: string; deductible: number; nonDeductible: number; deductibleVat: number; count: number }[] = []

    for (const m of MONTHS) {
      const monthEntries = yearData.filter((e) => e.date.startsWith(`${yr}-${m.value}`))
      if (monthEntries.length === 0) continue
      result.push({
        month: m.value,
        label: m.label,
        deductible: monthEntries.reduce((s, e) => s + e.deductible, 0),
        nonDeductible: monthEntries.reduce((s, e) => s + e.nonDeductible, 0),
        deductibleVat: monthEntries.reduce((s, e) => s + e.deductibleVat, 0),
        count: monthEntries.length,
      })
    }
    return result
  }, [entries, bookkeepingYear])

  // Available years from entries
  const availableYears = useMemo(() => {
    const years = new Set(entries.map((e) => e.date.split('-')[0]))
    years.add(currentYear())
    return Array.from(years).sort().reverse()
  }, [entries])

  // ===== Render =====

  return (
    <>
      <ModuleWorkspaceShell
        title={mod.name}
        description={mod.desc}
        category="bokforing"
        sectorName={sectorSlug}
        backHref={`/m/${sectorSlug}`}
        settingsHref={settingsHref}
        actions={
          <Button onClick={openNewEntry}>
            <Plus className="mr-2 h-4 w-4" />
            Ny representation
          </Button>
        }
        tabs={
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList>
              <TabsTrigger value="ny">Ny representation</TabsTrigger>
              <TabsTrigger value="oversikt">Oversikt</TabsTrigger>
              <TabsTrigger value="bokforing">Bokforingsunderlag</TabsTrigger>
            </TabsList>

            {/* ===== Tab 1: Ny representation ===== */}
            <TabsContent value="ny" className="mt-6">
              {/* Summary cards */}
              {!loading && entries.length > 0 && (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-6">
                  <KPICard label="Totalt i ar" value={fmt(totalThisYear)} unit="kr" />
                  <KPICard label="Avdragsgillt" value={fmt(deductibleThisYear)} unit="kr" />
                  <KPICard label="Ej avdragsgillt" value={fmt(nonDeductibleThisYear)} unit="kr" />
                  <KPICard label="Antal tillfallen" value={String(eventsThisYear)} />
                </div>
              )}

              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">
                    {editingEntry && activeTab === 'ny' ? 'Redigera representation' : 'Registrera ny representation'}
                  </CardTitle>
                  <CardDescription>
                    Fyll i uppgifter om representationstillfallet. Avdragsbelopp beraknas automatiskt enligt svenska skatteregler.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  {/* Row 1: Date, Type */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label className="text-xs">Datum *</Label>
                      <Input
                        type="date"
                        value={form.date}
                        onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
                        className="h-9"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Typ av representation *</Label>
                      <Select
                        value={form.type}
                        onValueChange={(val) => setForm((f) => ({ ...f, type: val as 'extern' | 'intern' }))}
                      >
                        <SelectTrigger className="h-9">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="extern">Extern (kunder/partners)</SelectItem>
                          <SelectItem value="intern">Intern (personal)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  {/* Row 2: Description */}
                  <div className="space-y-1.5">
                    <Label className="text-xs">Beskrivning / syfte *</Label>
                    <Input
                      value={form.description}
                      onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                      className="h-9"
                      placeholder="t.ex. Lunch med kund for projektdiskussion"
                    />
                  </div>

                  {/* Row 3: Guests, Total cost, VAT rate */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div className="space-y-1.5">
                      <Label className="text-xs">Antal gaster/deltagare *</Label>
                      <Input
                        type="number"
                        min={1}
                        value={form.guests}
                        onChange={(e) => setForm((f) => ({ ...f, guests: e.target.value }))}
                        className="h-9"
                        placeholder="2"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Totalkostnad inkl. moms (kr) *</Label>
                      <Input
                        type="number"
                        step="0.01"
                        min={0}
                        value={form.totalCost}
                        onChange={(e) => setForm((f) => ({ ...f, totalCost: e.target.value }))}
                        className="h-9"
                        placeholder="1500"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Momssats (%)</Label>
                      <Select
                        value={form.vatRate}
                        onValueChange={(val) => setForm((f) => ({ ...f, vatRate: val }))}
                      >
                        <SelectTrigger className="h-9">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="12">12% (restaurang/mat)</SelectItem>
                          <SelectItem value="25">25% (ovrigt)</SelectItem>
                          <SelectItem value="6">6% (kultur/transport)</SelectItem>
                          <SelectItem value="0">0% (momsfritt)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  {/* Row 4: Guest names */}
                  <div className="space-y-1.5">
                    <Label className="text-xs">Gasternas namn (ett per rad)</Label>
                    <Textarea
                      value={form.guestNames}
                      onChange={(e) => setForm((f) => ({ ...f, guestNames: e.target.value }))}
                      placeholder={"Anna Andersson, Foretag AB\nBertil Bengtsson, Kund AB"}
                      rows={3}
                    />
                  </div>

                  {/* Row 5: Business purpose */}
                  <div className="space-y-1.5">
                    <Label className="text-xs">Affarsmassig koppling / syfte</Label>
                    <Textarea
                      value={form.businessPurpose}
                      onChange={(e) => setForm((f) => ({ ...f, businessPurpose: e.target.value }))}
                      placeholder="Beskriv den affarsmassiga kopplingen, t.ex. forhandling om nytt avtal..."
                      rows={2}
                    />
                  </div>

                  <Separator />

                  {/* Auto-calculated breakdown */}
                  <div>
                    <h4 className="text-sm font-semibold mb-3 flex items-center gap-2">
                      <Calculator className="h-4 w-4 text-muted-foreground" />
                      Automatisk berakning
                    </h4>
                    <div className="rounded-lg border border-border bg-muted/30 p-4">
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-y-3 gap-x-6 text-sm">
                        <div>
                          <span className="text-muted-foreground text-xs">Kostnad per person</span>
                          <p className="font-medium tabular-nums">{fmtDec(formBreakdown.perPerson)} kr</p>
                        </div>
                        <div>
                          <span className="text-muted-foreground text-xs">Avdragsgill del (konto 6071)</span>
                          <p className="font-medium tabular-nums text-emerald-600">{fmtDec(formBreakdown.deductible)} kr</p>
                        </div>
                        <div>
                          <span className="text-muted-foreground text-xs">Ej avdragsgill del (konto 6072)</span>
                          <p className="font-medium tabular-nums text-red-500">{fmtDec(formBreakdown.nonDeductible)} kr</p>
                        </div>
                        <div>
                          <span className="text-muted-foreground text-xs">Avdragsgill moms (konto 2641)</span>
                          <p className="font-medium tabular-nums text-emerald-600">{fmtDec(formBreakdown.deductibleVat)} kr</p>
                        </div>
                        <div>
                          <span className="text-muted-foreground text-xs">Ej avdragsgill moms</span>
                          <p className="font-medium tabular-nums text-red-500">{fmtDec(formBreakdown.nonDeductibleVat)} kr</p>
                        </div>
                        <div>
                          <span className="text-muted-foreground text-xs">Max avdrag/person</span>
                          <p className="font-medium tabular-nums">{MAX_DEDUCTIBLE_PER_PERSON} kr</p>
                        </div>
                      </div>

                      {formBreakdown.perPerson > MAX_DEDUCTIBLE_PER_PERSON && parseFloat(form.totalCost) > 0 && (
                        <div className="mt-3 flex items-start gap-2 text-xs text-amber-600 bg-amber-50 dark:bg-amber-950/30 rounded-md p-2">
                          <AlertTriangle className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
                          <span>
                            Kostnaden per person ({fmtDec(formBreakdown.perPerson)} kr) overstiger avdragsgranser pa {MAX_DEDUCTIBLE_PER_PERSON} kr.
                            Overstigande belopp ({fmtDec(formBreakdown.nonDeductible)} kr) ar ej avdragsgillt.
                          </span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Save button */}
                  <div className="flex justify-end gap-3">
                    {editingEntry && activeTab === 'ny' && (
                      <Button
                        variant="outline"
                        onClick={() => {
                          setEditingEntry(null)
                          setForm({ ...EMPTY_FORM, date: todayStr() })
                        }}
                      >
                        Avbryt redigering
                      </Button>
                    )}
                    <Button
                      onClick={handleSaveEntry}
                      disabled={
                        saving ||
                        !form.description ||
                        !form.totalCost ||
                        parseFloat(form.totalCost) <= 0 ||
                        !form.guests ||
                        parseInt(form.guests) <= 0
                      }
                    >
                      {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      Spara
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* ===== Tab 2: Oversikt ===== */}
            <TabsContent value="oversikt" className="mt-6 space-y-4">
              {/* Filters */}
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-2">
                  <Label className="text-xs whitespace-nowrap">Ar:</Label>
                  <Select value={filterYear} onValueChange={setFilterYear}>
                    <SelectTrigger className="h-8 w-24">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {availableYears.map((y) => (
                        <SelectItem key={y} value={y}>{y}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center gap-2">
                  <Label className="text-xs whitespace-nowrap">Manad:</Label>
                  <Select value={filterMonth} onValueChange={setFilterMonth}>
                    <SelectTrigger className="h-8 w-32">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="alla">Alla manader</SelectItem>
                      {MONTHS.map((m) => (
                        <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center gap-2">
                  <Label className="text-xs whitespace-nowrap">Typ:</Label>
                  <Select value={filterType} onValueChange={(v) => setFilterType(v as 'alla' | 'extern' | 'intern')}>
                    <SelectTrigger className="h-8 w-28">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="alla">Alla</SelectItem>
                      <SelectItem value="extern">Extern</SelectItem>
                      <SelectItem value="intern">Intern</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Table */}
              {loading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : filteredEntries.length === 0 ? (
                <EmptyModuleState
                  icon={Receipt}
                  title="Inga poster"
                  description="Det finns inga representationsposter för vald period. Lägg till en ny post under fliken Ny representation."
                  actionLabel="Ny representation"
                  onAction={openNewEntry}
                />
              ) : (
                <div className="rounded-xl border border-border overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/50">
                        <TableHead className="font-medium text-muted-foreground">Datum</TableHead>
                        <TableHead className="font-medium text-muted-foreground">Typ</TableHead>
                        <TableHead className="font-medium text-muted-foreground">Syfte</TableHead>
                        <TableHead className="font-medium text-muted-foreground text-right">Gaster</TableHead>
                        <TableHead className="font-medium text-muted-foreground text-right">Totalt (kr)</TableHead>
                        <TableHead className="font-medium text-muted-foreground text-right">Avdragsgillt</TableHead>
                        <TableHead className="font-medium text-muted-foreground text-right">Ej avdragsgillt</TableHead>
                        <TableHead className="w-20"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredEntries.map((entry) => (
                        <TableRow key={entry.id}>
                          <TableCell className="whitespace-nowrap">{entry.date}</TableCell>
                          <TableCell>
                            <Badge variant={entry.type === 'extern' ? 'default' : 'secondary'}>
                              {entry.type === 'extern' ? 'Extern' : 'Intern'}
                            </Badge>
                          </TableCell>
                          <TableCell className="max-w-[200px] truncate" title={entry.description}>
                            {entry.description}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">{entry.guests}</TableCell>
                          <TableCell className="text-right tabular-nums">{fmt(entry.totalCost)}</TableCell>
                          <TableCell className="text-right tabular-nums text-emerald-600">{fmt(entry.deductible)}</TableCell>
                          <TableCell className="text-right tabular-nums text-red-500">{fmt(entry.nonDeductible)}</TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1">
                              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEditEntry(entry)}>
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 text-red-600 hover:text-red-700"
                                onClick={() => handleDeleteEntry(entry.id)}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}

              {/* Totals row below table */}
              {filteredEntries.length > 0 && (
                <div className="flex items-center justify-end gap-6 text-sm px-4">
                  <span className="text-muted-foreground">
                    {filteredEntries.length} {filteredEntries.length === 1 ? 'post' : 'poster'}
                  </span>
                  <span className="font-medium">
                    Totalt: {fmt(filteredEntries.reduce((s, e) => s + e.totalCost, 0))} kr
                  </span>
                  <span className="text-emerald-600 font-medium">
                    Avdrag: {fmt(filteredEntries.reduce((s, e) => s + e.deductible, 0))} kr
                  </span>
                </div>
              )}
            </TabsContent>

            {/* ===== Tab 3: Bokforingsunderlag ===== */}
            <TabsContent value="bokforing" className="mt-6 space-y-6">
              {/* Period selector */}
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-2">
                  <Label className="text-xs whitespace-nowrap">Period:</Label>
                  <Select value={bookkeepingPeriod} onValueChange={(v) => setBookkeepingPeriod(v as 'month' | 'quarter' | 'year')}>
                    <SelectTrigger className="h-8 w-28">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="month">Manad</SelectItem>
                      <SelectItem value="quarter">Kvartal</SelectItem>
                      <SelectItem value="year">Helar</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {bookkeepingPeriod === 'month' && (
                  <div className="flex items-center gap-2">
                    <Select value={bookkeepingMonth} onValueChange={setBookkeepingMonth}>
                      <SelectTrigger className="h-8 w-32">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {MONTHS.map((m) => (
                          <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {bookkeepingPeriod === 'quarter' && (
                  <div className="flex items-center gap-2">
                    <Select value={bookkeepingQuarter} onValueChange={setBookkeepingQuarter}>
                      <SelectTrigger className="h-8 w-24">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="1">Q1</SelectItem>
                        <SelectItem value="2">Q2</SelectItem>
                        <SelectItem value="3">Q3</SelectItem>
                        <SelectItem value="4">Q4</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}

                <div className="flex items-center gap-2">
                  <Label className="text-xs whitespace-nowrap">Ar:</Label>
                  <Select value={bookkeepingYear} onValueChange={setBookkeepingYear}>
                    <SelectTrigger className="h-8 w-24">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {availableYears.map((y) => (
                        <SelectItem key={y} value={y}>{y}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Warning for internal events exceeding 2 per year */}
              {internalEventsThisYear > 2 && (
                <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30 p-4">
                  <AlertTriangle className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-amber-800 dark:text-amber-200">
                      Varning: {internalEventsThisYear} interna representationstillfallen registrerade {bookkeepingYear}
                    </p>
                    <p className="text-xs text-amber-700 dark:text-amber-300 mt-1">
                      Enligt Skatteverkets regler ar avdrag for intern representation normalt begransat till hogst 2 tillfallen per ar.
                      Overvaag att granska om alla interna poster uppfyller kraven for avdragsratt.
                    </p>
                  </div>
                </div>
              )}

              {loading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <>
                  {/* Account summary cards */}
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    <Card>
                      <CardHeader className="pb-2">
                        <CardDescription className="text-xs">Konto 6071</CardDescription>
                        <CardTitle className="text-base">Representation, avdragsgill</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <span className="text-2xl font-semibold tabular-nums text-emerald-600">
                          {fmtDec(bookkeepingTotals.deductible)}
                        </span>
                        <span className="text-sm text-muted-foreground ml-1">kr</span>
                      </CardContent>
                    </Card>

                    <Card>
                      <CardHeader className="pb-2">
                        <CardDescription className="text-xs">Konto 6072</CardDescription>
                        <CardTitle className="text-base">Representation, ej avdragsgill</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <span className="text-2xl font-semibold tabular-nums text-red-500">
                          {fmtDec(bookkeepingTotals.nonDeductible)}
                        </span>
                        <span className="text-sm text-muted-foreground ml-1">kr</span>
                      </CardContent>
                    </Card>

                    <Card>
                      <CardHeader className="pb-2">
                        <CardDescription className="text-xs">Konto 2641</CardDescription>
                        <CardTitle className="text-base">Ingaende moms, representation</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <span className="text-2xl font-semibold tabular-nums text-emerald-600">
                          {fmtDec(bookkeepingTotals.deductibleVat)}
                        </span>
                        <span className="text-sm text-muted-foreground ml-1">kr</span>
                      </CardContent>
                    </Card>
                  </div>

                  {/* Period details */}
                  {bookkeepingEntries.length > 0 && (
                    <Card>
                      <CardHeader>
                        <CardTitle className="text-base flex items-center gap-2">
                          <BookOpen className="h-4 w-4 text-muted-foreground" />
                          Poster i vald period ({bookkeepingEntries.length} st)
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="p-0">
                        <Table>
                          <TableHeader>
                            <TableRow className="bg-muted/50">
                              <TableHead className="text-xs">Datum</TableHead>
                              <TableHead className="text-xs">Typ</TableHead>
                              <TableHead className="text-xs">Syfte</TableHead>
                              <TableHead className="text-xs text-right">6071 Avdr.</TableHead>
                              <TableHead className="text-xs text-right">6072 Ej avdr.</TableHead>
                              <TableHead className="text-xs text-right">2641 Moms</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {bookkeepingEntries.map((e) => (
                              <TableRow key={e.id}>
                                <TableCell className="text-xs whitespace-nowrap">{e.date}</TableCell>
                                <TableCell>
                                  <Badge variant={e.type === 'extern' ? 'default' : 'secondary'} className="text-xs">
                                    {e.type === 'extern' ? 'Ext' : 'Int'}
                                  </Badge>
                                </TableCell>
                                <TableCell className="text-xs max-w-[180px] truncate">{e.description}</TableCell>
                                <TableCell className="text-xs text-right tabular-nums text-emerald-600">{fmtDec(e.deductible)}</TableCell>
                                <TableCell className="text-xs text-right tabular-nums text-red-500">{fmtDec(e.nonDeductible)}</TableCell>
                                <TableCell className="text-xs text-right tabular-nums">{fmtDec(e.deductibleVat)}</TableCell>
                              </TableRow>
                            ))}
                            {/* Totals row */}
                            <TableRow className="bg-muted/30 font-medium">
                              <TableCell className="text-xs" colSpan={3}>Summa</TableCell>
                              <TableCell className="text-xs text-right tabular-nums text-emerald-600">
                                {fmtDec(bookkeepingTotals.deductible)}
                              </TableCell>
                              <TableCell className="text-xs text-right tabular-nums text-red-500">
                                {fmtDec(bookkeepingTotals.nonDeductible)}
                              </TableCell>
                              <TableCell className="text-xs text-right tabular-nums">
                                {fmtDec(bookkeepingTotals.deductibleVat)}
                              </TableCell>
                            </TableRow>
                          </TableBody>
                        </Table>
                      </CardContent>
                    </Card>
                  )}

                  {/* Monthly summary for the year */}
                  {monthlyBreakdown.length > 0 && (
                    <Card>
                      <CardHeader>
                        <CardTitle className="text-base">Manadssammanstallning {bookkeepingYear}</CardTitle>
                      </CardHeader>
                      <CardContent className="p-0">
                        <Table>
                          <TableHeader>
                            <TableRow className="bg-muted/50">
                              <TableHead className="text-xs">Manad</TableHead>
                              <TableHead className="text-xs text-right">Antal</TableHead>
                              <TableHead className="text-xs text-right">6071 Avdragsgill (kr)</TableHead>
                              <TableHead className="text-xs text-right">6072 Ej avdragsgill (kr)</TableHead>
                              <TableHead className="text-xs text-right">2641 Avdragsgill moms (kr)</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {monthlyBreakdown.map((m) => (
                              <TableRow key={m.month}>
                                <TableCell className="text-xs">{m.label}</TableCell>
                                <TableCell className="text-xs text-right tabular-nums">{m.count}</TableCell>
                                <TableCell className="text-xs text-right tabular-nums text-emerald-600">{fmtDec(m.deductible)}</TableCell>
                                <TableCell className="text-xs text-right tabular-nums text-red-500">{fmtDec(m.nonDeductible)}</TableCell>
                                <TableCell className="text-xs text-right tabular-nums">{fmtDec(m.deductibleVat)}</TableCell>
                              </TableRow>
                            ))}
                            {/* Annual total */}
                            <TableRow className="bg-muted/30 font-medium">
                              <TableCell className="text-xs">Totalt</TableCell>
                              <TableCell className="text-xs text-right tabular-nums">
                                {monthlyBreakdown.reduce((s, m) => s + m.count, 0)}
                              </TableCell>
                              <TableCell className="text-xs text-right tabular-nums text-emerald-600">
                                {fmtDec(monthlyBreakdown.reduce((s, m) => s + m.deductible, 0))}
                              </TableCell>
                              <TableCell className="text-xs text-right tabular-nums text-red-500">
                                {fmtDec(monthlyBreakdown.reduce((s, m) => s + m.nonDeductible, 0))}
                              </TableCell>
                              <TableCell className="text-xs text-right tabular-nums">
                                {fmtDec(monthlyBreakdown.reduce((s, m) => s + m.deductibleVat, 0))}
                              </TableCell>
                            </TableRow>
                          </TableBody>
                        </Table>
                      </CardContent>
                    </Card>
                  )}

                  {bookkeepingEntries.length === 0 && (
                    <EmptyModuleState
                      icon={BookOpen}
                      title="Inga poster for perioden"
                      description="Det finns inga representationsposter for den valda perioden."
                    />
                  )}
                </>
              )}
            </TabsContent>
          </Tabs>
        }
      >
        {null}
      </ModuleWorkspaceShell>

      {/* ===== Edit Dialog ===== */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Redigera representation</DialogTitle>
            <DialogDescription>
              Uppdatera uppgifterna for representationstillfallet.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs">Datum *</Label>
                <Input
                  type="date"
                  value={form.date}
                  onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
                  className="h-9"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Typ *</Label>
                <Select
                  value={form.type}
                  onValueChange={(val) => setForm((f) => ({ ...f, type: val as 'extern' | 'intern' }))}
                >
                  <SelectTrigger className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="extern">Extern</SelectItem>
                    <SelectItem value="intern">Intern</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Beskrivning / syfte *</Label>
              <Input
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                className="h-9"
              />
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs">Antal gaster *</Label>
                <Input
                  type="number"
                  min={1}
                  value={form.guests}
                  onChange={(e) => setForm((f) => ({ ...f, guests: e.target.value }))}
                  className="h-9"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Totalkostnad (kr) *</Label>
                <Input
                  type="number"
                  step="0.01"
                  min={0}
                  value={form.totalCost}
                  onChange={(e) => setForm((f) => ({ ...f, totalCost: e.target.value }))}
                  className="h-9"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Momssats</Label>
                <Select
                  value={form.vatRate}
                  onValueChange={(val) => setForm((f) => ({ ...f, vatRate: val }))}
                >
                  <SelectTrigger className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="12">12%</SelectItem>
                    <SelectItem value="25">25%</SelectItem>
                    <SelectItem value="6">6%</SelectItem>
                    <SelectItem value="0">0%</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Gasternas namn</Label>
              <Textarea
                value={form.guestNames}
                onChange={(e) => setForm((f) => ({ ...f, guestNames: e.target.value }))}
                rows={3}
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Affarsmassig koppling</Label>
              <Textarea
                value={form.businessPurpose}
                onChange={(e) => setForm((f) => ({ ...f, businessPurpose: e.target.value }))}
                rows={2}
              />
            </div>

            <Separator />

            {/* Breakdown preview */}
            <div className="rounded-lg border border-border bg-muted/30 p-3">
              <p className="text-xs font-medium mb-2">Berakning</p>
              <div className="grid grid-cols-3 gap-2 text-xs">
                <div>
                  <span className="text-muted-foreground">Per person:</span>
                  <p className="font-medium tabular-nums">{fmtDec(formBreakdown.perPerson)} kr</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Avdragsgill:</span>
                  <p className="font-medium tabular-nums text-emerald-600">{fmtDec(formBreakdown.deductible)} kr</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Ej avdragsgill:</span>
                  <p className="font-medium tabular-nums text-red-500">{fmtDec(formBreakdown.nonDeductible)} kr</p>
                </div>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Avbryt
            </Button>
            <Button
              onClick={handleSaveEntry}
              disabled={
                saving ||
                !form.description ||
                !form.totalCost ||
                parseFloat(form.totalCost) <= 0 ||
                !form.guests ||
                parseInt(form.guests) <= 0
              }
            >
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Uppdatera
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
