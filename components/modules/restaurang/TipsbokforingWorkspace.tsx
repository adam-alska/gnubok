'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { ModuleWorkspaceShell } from '@/components/modules/ModuleWorkspaceShell'
import { KPICard } from '@/components/modules/shared/KPICard'
import { EmptyModuleState } from '@/components/modules/shared/EmptyModuleState'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Separator } from '@/components/ui/separator'
import { cn } from '@/lib/utils'
import {
  Coins,
  Loader2,
  Save,
  Trash2,
  FileSpreadsheet,
  Copy,
  Check,
} from 'lucide-react'

interface ModuleWorkspaceProps {
  module: { slug: string; name: string; cat: string; desc: string; longDesc: string }
  sectorSlug: string
  settingsHref: string
}

interface TipEntry {
  date: string
  cardTips: number
  cashTips: number
  staffCount: number
  staffNames: string[]
  perPerson: number
  employerContrib: number
  totalTips: number
}

const EMPLOYER_CONTRIBUTION_RATE = 0.3142

function todayStr(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function currentMonthStr(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function fmt(n: number): string {
  return new Intl.NumberFormat('sv-SE', { maximumFractionDigits: 0 }).format(n)
}

function fmtDecimal(n: number): string {
  return new Intl.NumberFormat('sv-SE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)
}

export function TipsbokforingWorkspace({ module: mod, sectorSlug, settingsHref }: ModuleWorkspaceProps) {
  const supabase = createClient()

  const [activeTab, setActiveTab] = useState('registrera')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  // Registration form
  const [formDate, setFormDate] = useState(todayStr())
  const [cardTips, setCardTips] = useState<number>(0)
  const [cashTips, setCashTips] = useState<number>(0)
  const [staffCount, setStaffCount] = useState<number>(1)
  const [staffNamesStr, setStaffNamesStr] = useState('')

  // Data
  const [allMonths, setAllMonths] = useState<string[]>([])
  const [entries, setEntries] = useState<TipEntry[]>([])
  const [selectedMonth, setSelectedMonth] = useState(currentMonthStr())

  // Clipboard feedback
  const [copiedField, setCopiedField] = useState<string | null>(null)

  // Calculated values
  const totalTips = cardTips + cashTips
  const perPerson = staffCount > 0 ? totalTips / staffCount : 0
  const employerContrib = cardTips * EMPLOYER_CONTRIBUTION_RATE

  // Monthly data
  const monthEntries = entries.filter((e) => e.date.startsWith(selectedMonth))
  const monthTotalTips = monthEntries.reduce((s, e) => s + e.totalTips, 0)
  const monthTotalCardTips = monthEntries.reduce((s, e) => s + e.cardTips, 0)
  const monthTotalCashTips = monthEntries.reduce((s, e) => s + e.cashTips, 0)
  const monthTotalEmployerContrib = monthEntries.reduce((s, e) => s + e.employerContrib, 0)
  const monthAvgPerDay = monthEntries.length > 0 ? monthTotalTips / monthEntries.length : 0

  // Bookkeeping data for selected month
  const konto7010 = monthTotalCardTips // Card tips added to salary
  const konto7510 = monthTotalEmployerContrib // Employer contribution
  const konto1910 = monthTotalCashTips // Cash tips paid out
  const konto1920 = monthTotalCardTips // Card tips via bank

  // ===== Data fetching =====
  const fetchMonths = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return []

    const { data } = await supabase
      .from('module_configs')
      .select('config_value')
      .eq('user_id', user.id)
      .eq('sector_slug', sectorSlug)
      .eq('module_slug', mod.slug)
      .eq('config_key', 'tips_months')
      .single()

    const months: string[] = data?.config_value ?? []
    setAllMonths(months)
    return months
  }, [supabase, sectorSlug, mod.slug])

  const fetchEntries = useCallback(async (months: string[]) => {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); return }

    // Fetch all tip entries by finding all date-keyed config rows
    const { data } = await supabase
      .from('module_configs')
      .select('config_key, config_value')
      .eq('user_id', user.id)
      .eq('sector_slug', sectorSlug)
      .eq('module_slug', mod.slug)
      .like('config_key', 'tips_%')
      .neq('config_key', 'tips_months')

    const tipEntries: TipEntry[] = (data ?? [])
      .map((row) => row.config_value as TipEntry)
      .filter((e) => e && e.date)
      .sort((a, b) => b.date.localeCompare(a.date))

    setEntries(tipEntries)
    setLoading(false)
  }, [supabase, sectorSlug, mod.slug])

  useEffect(() => {
    fetchMonths().then((months) => fetchEntries(months))
  }, [fetchMonths, fetchEntries])

  // ===== Save tip entry =====
  async function handleSave() {
    if (!formDate || totalTips === 0) return
    setSaving(true)

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setSaving(false); return }

    const staffNames = staffNamesStr
      .split(',')
      .map((n) => n.trim())
      .filter(Boolean)

    const entry: TipEntry = {
      date: formDate,
      cardTips,
      cashTips,
      staffCount,
      staffNames,
      perPerson: Math.round(perPerson * 100) / 100,
      employerContrib: Math.round(employerContrib * 100) / 100,
      totalTips,
    }

    // Save the tip entry
    await supabase
      .from('module_configs')
      .upsert({
        user_id: user.id,
        sector_slug: sectorSlug,
        module_slug: mod.slug,
        config_key: `tips_${formDate}`,
        config_value: entry,
      }, { onConflict: 'user_id,sector_slug,module_slug,config_key' })

    // Update months index
    const entryMonth = formDate.substring(0, 7)
    const updatedMonths = Array.from(new Set([...allMonths, entryMonth])).sort().reverse()

    await supabase
      .from('module_configs')
      .upsert({
        user_id: user.id,
        sector_slug: sectorSlug,
        module_slug: mod.slug,
        config_key: 'tips_months',
        config_value: updatedMonths,
      }, { onConflict: 'user_id,sector_slug,module_slug,config_key' })

    // Reset form
    setCardTips(0)
    setCashTips(0)
    setStaffCount(1)
    setStaffNamesStr('')
    setFormDate(todayStr())

    // Refresh
    const months = await fetchMonths()
    await fetchEntries(months)

    setSaving(false)
    setActiveTab('oversikt')
  }

  // ===== Delete tip entry =====
  async function handleDelete(date: string) {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    await supabase
      .from('module_configs')
      .delete()
      .eq('user_id', user.id)
      .eq('sector_slug', sectorSlug)
      .eq('module_slug', mod.slug)
      .eq('config_key', `tips_${date}`)

    // Clean up months index if needed
    const remainingEntries = entries.filter((e) => e.date !== date)
    const remainingMonths = Array.from(new Set(remainingEntries.map((e) => e.date.substring(0, 7)))).sort().reverse()

    await supabase
      .from('module_configs')
      .upsert({
        user_id: user.id,
        sector_slug: sectorSlug,
        module_slug: mod.slug,
        config_key: 'tips_months',
        config_value: remainingMonths,
      }, { onConflict: 'user_id,sector_slug,module_slug,config_key' })

    const months = await fetchMonths()
    await fetchEntries(months)
  }

  // ===== Copy to clipboard =====
  function copyToClipboard(text: string, field: string) {
    navigator.clipboard.writeText(text)
    setCopiedField(field)
    setTimeout(() => setCopiedField(null), 2000)
  }

  // ===== Number input helper =====
  function numVal(val: string): number {
    const n = parseFloat(val)
    return isNaN(n) ? 0 : n
  }

  // ===== Generate month options =====
  function getAvailableMonths(): string[] {
    const months = new Set<string>()
    for (const m of allMonths) {
      months.add(m)
    }
    months.add(currentMonthStr())
    return Array.from(months).sort().reverse()
  }

  // ===== Generate bookkeeping export text =====
  function generateBookkeepingText(): string {
    const lines = [
      `Bokf\u00f6ringsunderlag dricks - ${selectedMonth}`,
      `${'='.repeat(50)}`,
      '',
      `Konto 7010 L\u00f6ner (kortdricks till l\u00f6n): ${fmtDecimal(konto7010)} kr`,
      `Konto 7510 Sociala avgifter (arbetsgivaravgift): ${fmtDecimal(konto7510)} kr`,
      `Konto 1910 Kassa (kontantdricks utbetald): ${fmtDecimal(konto1910)} kr`,
      `Konto 1920 Bank (kortdricks via bank): ${fmtDecimal(konto1920)} kr`,
      '',
      `Antal registreringar: ${monthEntries.length}`,
      `Total dricks: ${fmtDecimal(monthTotalTips)} kr`,
      `Varav kort: ${fmtDecimal(monthTotalCardTips)} kr`,
      `Varav kontant: ${fmtDecimal(monthTotalCashTips)} kr`,
    ]
    return lines.join('\n')
  }

  // ===== Render =====
  return (
    <ModuleWorkspaceShell
      title={mod.name}
      description={mod.desc}
      category="bokforing"
      sectorName="Restaurang"
      backHref={`/m/${sectorSlug}`}
      settingsHref={settingsHref}
    >
      {/* Summary cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 mb-6">
        <KPICard
          label="Total dricks denna m\u00e5nad"
          value={fmt(monthTotalTips)}
          unit="kr"
        />
        <KPICard
          label="Arbetsgivaravgift"
          value={fmtDecimal(monthTotalEmployerContrib)}
          unit="kr"
        />
        <KPICard
          label="Snitt per dag"
          value={fmt(Math.round(monthAvgPerDay))}
          unit="kr"
        />
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList>
          <TabsTrigger value="registrera">Registrera dricks</TabsTrigger>
          <TabsTrigger value="oversikt">M\u00e5nads\u00f6versikt</TabsTrigger>
          <TabsTrigger value="bokforing">Bokf\u00f6ringsunderlag</TabsTrigger>
        </TabsList>

        {/* ===== Tab 1: Register tips ===== */}
        <TabsContent value="registrera" className="space-y-6">
          <div className="grid gap-6 lg:grid-cols-2">
            {/* Input section */}
            <div className="rounded-xl border border-border bg-card p-5 space-y-4">
              <div className="flex items-center gap-2">
                <Coins className="h-4 w-4 text-muted-foreground" />
                <h3 className="text-sm font-semibold">Registrera dricks</h3>
              </div>
              <Separator />

              <div className="grid gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Datum</Label>
                  <Input
                    type="date"
                    value={formDate}
                    onChange={(e) => setFormDate(e.target.value)}
                    className="h-9 w-auto"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Kortdricks (kr)</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={cardTips || ''}
                      onChange={(e) => setCardTips(numVal(e.target.value))}
                      placeholder="0"
                      className="h-9"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Kontantdricks (kr)</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={cashTips || ''}
                      onChange={(e) => setCashTips(numVal(e.target.value))}
                      placeholder="0"
                      className="h-9"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs">Antal personal att dela mellan</Label>
                  <Input
                    type="number"
                    min={1}
                    value={staffCount}
                    onChange={(e) => setStaffCount(Math.max(1, parseInt(e.target.value) || 1))}
                    className="h-9"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs">Personalnamn (kommaseparerade, valfritt)</Label>
                  <Textarea
                    value={staffNamesStr}
                    onChange={(e) => setStaffNamesStr(e.target.value)}
                    placeholder="Anna, Erik, Maria"
                    rows={2}
                  />
                </div>
              </div>
            </div>

            {/* Calculated values section */}
            <div className="space-y-4">
              <div className="rounded-xl border border-border bg-card p-5 space-y-4">
                <h3 className="text-sm font-semibold">Ber\u00e4knade v\u00e4rden</h3>
                <Separator />
                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">Total dricks</span>
                    <span className="text-lg font-semibold tabular-nums">{fmtDecimal(totalTips)} kr</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">Per person ({staffCount} st)</span>
                    <span className="text-lg font-semibold tabular-nums">{fmtDecimal(perPerson)} kr</span>
                  </div>
                  <Separator />
                  <div className="flex justify-between items-center">
                    <div>
                      <span className="text-sm text-muted-foreground">Arbetsgivaravgift p\u00e5 kortdricks</span>
                      <p className="text-xs text-muted-foreground">31,42% av {fmtDecimal(cardTips)} kr</p>
                    </div>
                    <span className="text-lg font-semibold tabular-nums text-amber-600">{fmtDecimal(employerContrib)} kr</span>
                  </div>
                </div>
              </div>

              <div className="rounded-xl border border-border bg-blue-500/5 p-5 space-y-3">
                <h3 className="text-sm font-semibold">Kontof\u00f6rdelning</h3>
                <Separator />
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Konto 7699 Arbetsgivaravgift</span>
                    <span className="tabular-nums font-medium">{fmtDecimal(employerContrib)} kr</span>
                  </div>
                  <p className="text-xs text-muted-foreground italic">
                    Kontantdricks: ingen arbetsgivaravgift f\u00f6r arbetsgivaren (skattas av den anst\u00e4llde)
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Save button */}
          <div className="flex justify-end">
            <Button
              onClick={handleSave}
              disabled={saving || !formDate || totalTips === 0}
            >
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              <Save className="mr-2 h-4 w-4" />
              Spara
            </Button>
          </div>
        </TabsContent>

        {/* ===== Tab 2: Monthly overview ===== */}
        <TabsContent value="oversikt" className="space-y-4">
          {/* Month selector */}
          <div className="flex items-center gap-3">
            <Label className="text-sm font-medium">M\u00e5nad</Label>
            <select
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="flex h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              {getAvailableMonths().map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : monthEntries.length === 0 ? (
            <EmptyModuleState
              icon={Coins}
              title="Ingen dricks registrerad"
              description="Det finns inga dricksregistreringar f\u00f6r den valda m\u00e5naden. G\u00e5 till fliken Registrera dricks f\u00f6r att l\u00e4gga till."
              actionLabel="Registrera dricks"
              onAction={() => setActiveTab('registrera')}
            />
          ) : (
            <>
              <div className="rounded-xl border border-border overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-muted/50 border-b border-border">
                      <th className="text-left px-4 py-3 font-medium text-muted-foreground">Datum</th>
                      <th className="text-right px-4 py-3 font-medium text-muted-foreground">Kortdricks</th>
                      <th className="text-right px-4 py-3 font-medium text-muted-foreground">Kontantdricks</th>
                      <th className="text-right px-4 py-3 font-medium text-muted-foreground">Totalt</th>
                      <th className="text-right px-4 py-3 font-medium text-muted-foreground">Arb.avg.</th>
                      <th className="text-right px-4 py-3 font-medium text-muted-foreground">Per person</th>
                      <th className="text-center px-4 py-3 font-medium text-muted-foreground">Personal</th>
                      <th className="px-4 py-3 w-10"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {monthEntries.map((e) => (
                      <tr key={e.date} className="border-b border-border last:border-0">
                        <td className="px-4 py-3 whitespace-nowrap font-medium">{e.date}</td>
                        <td className="px-4 py-3 text-right tabular-nums">{fmt(e.cardTips)} kr</td>
                        <td className="px-4 py-3 text-right tabular-nums">{fmt(e.cashTips)} kr</td>
                        <td className="px-4 py-3 text-right tabular-nums font-semibold">{fmt(e.totalTips)} kr</td>
                        <td className="px-4 py-3 text-right tabular-nums text-amber-600">{fmtDecimal(e.employerContrib)} kr</td>
                        <td className="px-4 py-3 text-right tabular-nums">{fmtDecimal(e.perPerson)} kr</td>
                        <td className="px-4 py-3 text-center">{e.staffCount} st</td>
                        <td className="px-4 py-3">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0 text-muted-foreground hover:text-red-500"
                            onClick={() => handleDelete(e.date)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                    {/* Monthly totals row */}
                    <tr className="bg-muted/50 font-semibold">
                      <td className="px-4 py-3">Summa</td>
                      <td className="px-4 py-3 text-right tabular-nums">{fmt(monthTotalCardTips)} kr</td>
                      <td className="px-4 py-3 text-right tabular-nums">{fmt(monthTotalCashTips)} kr</td>
                      <td className="px-4 py-3 text-right tabular-nums">{fmt(monthTotalTips)} kr</td>
                      <td className="px-4 py-3 text-right tabular-nums text-amber-600">{fmtDecimal(monthTotalEmployerContrib)} kr</td>
                      <td className="px-4 py-3 text-right tabular-nums">{fmtDecimal(monthAvgPerDay)} kr/dag</td>
                      <td className="px-4 py-3"></td>
                      <td className="px-4 py-3"></td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </>
          )}
        </TabsContent>

        {/* ===== Tab 3: Bookkeeping basis ===== */}
        <TabsContent value="bokforing" className="space-y-4">
          {/* Month selector */}
          <div className="flex items-center gap-3">
            <Label className="text-sm font-medium">M\u00e5nad</Label>
            <select
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="flex h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              {getAvailableMonths().map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : monthEntries.length === 0 ? (
            <EmptyModuleState
              icon={FileSpreadsheet}
              title="Inget bokf\u00f6ringsunderlag"
              description="Registrera dricks f\u00f6r att generera bokf\u00f6ringsunderlag."
              actionLabel="Registrera dricks"
              onAction={() => setActiveTab('registrera')}
            />
          ) : (
            <>
              {/* Bookkeeping accounts */}
              <div className="rounded-xl border border-border bg-card overflow-hidden">
                <div className="px-5 py-4 bg-muted/30 border-b border-border">
                  <h3 className="text-sm font-semibold">Kontof\u00f6rdelning f\u00f6r {selectedMonth}</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">Underlag f\u00f6r bokf\u00f6ring av dricks och arbetsgivaravgifter</p>
                </div>
                <div className="divide-y divide-border">
                  {/* Konto 7010 */}
                  <div className="flex items-center justify-between px-5 py-4">
                    <div>
                      <p className="text-sm font-medium">Konto 7010 \u2013 L\u00f6ner</p>
                      <p className="text-xs text-muted-foreground">Kortdricks som l\u00e4ggs till l\u00f6n</p>
                    </div>
                    <span className="text-lg font-semibold tabular-nums">{fmtDecimal(konto7010)} kr</span>
                  </div>

                  {/* Konto 7510 */}
                  <div className="flex items-center justify-between px-5 py-4">
                    <div>
                      <p className="text-sm font-medium">Konto 7510 \u2013 Sociala avgifter</p>
                      <p className="text-xs text-muted-foreground">Arbetsgivaravgift p\u00e5 kortdricks (31,42%)</p>
                    </div>
                    <span className="text-lg font-semibold tabular-nums text-amber-600">{fmtDecimal(konto7510)} kr</span>
                  </div>

                  {/* Konto 1910 */}
                  <div className="flex items-center justify-between px-5 py-4">
                    <div>
                      <p className="text-sm font-medium">Konto 1910 \u2013 Kassa</p>
                      <p className="text-xs text-muted-foreground">Kontantdricks utbetald</p>
                    </div>
                    <span className="text-lg font-semibold tabular-nums">{fmtDecimal(konto1910)} kr</span>
                  </div>

                  {/* Konto 1920 */}
                  <div className="flex items-center justify-between px-5 py-4">
                    <div>
                      <p className="text-sm font-medium">Konto 1920 \u2013 Bank</p>
                      <p className="text-xs text-muted-foreground">Kortdricks via banktransaktion</p>
                    </div>
                    <span className="text-lg font-semibold tabular-nums">{fmtDecimal(konto1920)} kr</span>
                  </div>
                </div>
              </div>

              {/* Summary / export section */}
              <div className="rounded-xl border border-border bg-card p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold">Sammanfattning</h3>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => copyToClipboard(generateBookkeepingText(), 'summary')}
                  >
                    {copiedField === 'summary' ? (
                      <>
                        <Check className="mr-2 h-3.5 w-3.5 text-emerald-600" />
                        Kopierat
                      </>
                    ) : (
                      <>
                        <Copy className="mr-2 h-3.5 w-3.5" />
                        Kopiera underlag
                      </>
                    )}
                  </Button>
                </div>
                <Separator />
                <div className="grid gap-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Antal registreringar</span>
                    <span className="tabular-nums font-medium">{monthEntries.length} st</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Total dricks</span>
                    <span className="tabular-nums font-medium">{fmtDecimal(monthTotalTips)} kr</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Varav kortdricks</span>
                    <span className="tabular-nums">{fmtDecimal(monthTotalCardTips)} kr</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Varav kontantdricks</span>
                    <span className="tabular-nums">{fmtDecimal(monthTotalCashTips)} kr</span>
                  </div>
                  <Separator />
                  <div className="flex justify-between font-semibold">
                    <span>Total arbetsgivaravgift</span>
                    <span className="tabular-nums text-amber-600">{fmtDecimal(monthTotalEmployerContrib)} kr</span>
                  </div>
                </div>
              </div>

              {/* Detailed per-entry breakdown */}
              {monthEntries.some((e) => e.staffNames.length > 0) && (
                <div className="rounded-xl border border-border bg-card p-5 space-y-4">
                  <h3 className="text-sm font-semibold">Personaluppdelning</h3>
                  <Separator />
                  <div className="space-y-3">
                    {monthEntries
                      .filter((e) => e.staffNames.length > 0)
                      .map((e) => (
                        <div key={e.date} className="text-sm">
                          <p className="font-medium">{e.date}</p>
                          <p className="text-muted-foreground text-xs mt-0.5">
                            {e.staffNames.join(', ')} \u2014 {fmtDecimal(e.perPerson)} kr/person
                          </p>
                        </div>
                      ))}
                  </div>
                </div>
              )}
            </>
          )}
        </TabsContent>
      </Tabs>
    </ModuleWorkspaceShell>
  )
}
