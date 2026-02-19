'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { ModuleWorkspaceShell } from '@/components/modules/ModuleWorkspaceShell'
import { EmptyModuleState } from '@/components/modules/shared/EmptyModuleState'
import { KPICard } from '@/components/modules/shared/KPICard'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
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
  Plus,
  Pencil,
  Trash2,
  Loader2,
  Globe,
  CheckCircle2,
  XCircle,
  FileText,
} from 'lucide-react'

interface ModuleWorkspaceProps {
  module: { slug: string; name: string; cat: string; desc: string; longDesc: string }
  sectorSlug: string
  settingsHref: string
}

interface EuInvoice {
  id: string
  invoiceNumber: string
  date: string
  customerName: string
  customerCountry: string
  vatNumber: string
  vatNumberValid: boolean
  amount: number
  vatRate: number
  reverseCharge: boolean
  description: string
}

const EU_COUNTRIES = [
  'Belgien', 'Bulgarien', 'Cypern', 'Danmark', 'Estland', 'Finland',
  'Frankrike', 'Grekland', 'Irland', 'Italien', 'Kroatien', 'Lettland',
  'Litauen', 'Luxemburg', 'Malta', 'Nederlanderna', 'Polen', 'Portugal',
  'Rumänien', 'Slovakien', 'Slovenien', 'Spanien', 'Tjeckien',
  'Tyskland', 'Ungern', 'Österrike',
]

const DEFAULT_INVOICES: EuInvoice[] = [
  {
    id: '1', invoiceNumber: 'EU-2024-001', date: '2024-06-15',
    customerName: 'TechCorp GmbH', customerCountry: 'Tyskland',
    vatNumber: 'DE123456789', vatNumberValid: true,
    amount: 50000, vatRate: 0, reverseCharge: true,
    description: 'Konsulttjänster systemutveckling',
  },
  {
    id: '2', invoiceNumber: 'EU-2024-002', date: '2024-07-01',
    customerName: 'Nordic Soft ApS', customerCountry: 'Danmark',
    vatNumber: 'DK12345678', vatNumberValid: true,
    amount: 30000, vatRate: 0, reverseCharge: true,
    description: 'SaaS-licens Q3',
  },
  {
    id: '3', invoiceNumber: 'EU-2024-003', date: '2024-08-20',
    customerName: 'Innovatech Oy', customerCountry: 'Finland',
    vatNumber: 'FI12345678', vatNumberValid: false,
    amount: 25000, vatRate: 25, reverseCharge: false,
    description: 'Utbildningstjänster',
  },
]

function fmt(n: number): string {
  return new Intl.NumberFormat('sv-SE', { maximumFractionDigits: 0 }).format(n)
}

// Simple VAT number format check (prefix + digits)
function validateVatFormat(vatNumber: string): boolean {
  return /^[A-Z]{2}\d{8,12}$/.test(vatNumber.replace(/\s/g, ''))
}

const EMPTY_FORM: Omit<EuInvoice, 'id'> = {
  invoiceNumber: '',
  date: new Date().toISOString().slice(0, 10),
  customerName: '',
  customerCountry: 'Tyskland',
  vatNumber: '',
  vatNumberValid: false,
  amount: 0,
  vatRate: 0,
  reverseCharge: true,
  description: '',
}

export function EuTjanstmomsWorkspace({ module: mod, sectorSlug, settingsHref }: ModuleWorkspaceProps) {
  const supabase = createClient()

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [invoices, setInvoices] = useState<EuInvoice[]>([])

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<EuInvoice | null>(null)
  const [form, setForm] = useState(EMPTY_FORM)

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [toDelete, setToDelete] = useState<EuInvoice | null>(null)

  const saveData = useCallback(async (data: EuInvoice[]) => {
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setSaving(false); return }

    await supabase.from('module_configs').upsert(
      {
        user_id: user.id,
        sector_slug: sectorSlug,
        module_slug: mod.slug,
        config_key: 'eu_invoices',
        config_value: data,
      },
      { onConflict: 'user_id,sector_slug,module_slug,config_key' }
    )
    setSaving(false)
  }, [supabase, sectorSlug, mod.slug])

  const fetchData = useCallback(async () => {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); return }

    const { data } = await supabase
      .from('module_configs')
      .select('config_value')
      .eq('user_id', user.id)
      .eq('sector_slug', sectorSlug)
      .eq('module_slug', mod.slug)
      .eq('config_key', 'eu_invoices')
      .maybeSingle()

    if (data?.config_value && Array.isArray(data.config_value) && data.config_value.length > 0) {
      setInvoices(data.config_value as EuInvoice[])
    } else {
      setInvoices(DEFAULT_INVOICES)
      await supabase.from('module_configs').upsert(
        {
          user_id: user.id,
          sector_slug: sectorSlug,
          module_slug: mod.slug,
          config_key: 'eu_invoices',
          config_value: DEFAULT_INVOICES,
        },
        { onConflict: 'user_id,sector_slug,module_slug,config_key' }
      )
    }
    setLoading(false)
  }, [supabase, sectorSlug, mod.slug])

  useEffect(() => { fetchData() }, [fetchData])

  const stats = useMemo(() => {
    const totalAmount = invoices.reduce((s, i) => s + i.amount, 0)
    const reverseChargeAmount = invoices.filter((i) => i.reverseCharge).reduce((s, i) => s + i.amount, 0)
    const validVatCount = invoices.filter((i) => i.vatNumberValid).length
    const invalidVatCount = invoices.filter((i) => !i.vatNumberValid).length
    const countryBreakdown: Record<string, number> = {}
    for (const inv of invoices) {
      countryBreakdown[inv.customerCountry] = (countryBreakdown[inv.customerCountry] ?? 0) + inv.amount
    }
    return { totalAmount, reverseChargeAmount, validVatCount, invalidVatCount, countryBreakdown }
  }, [invoices])

  // EU sales report grouped by country
  const salesReport = useMemo(() => {
    const byCountry: Record<string, { country: string; count: number; totalAmount: number; vatAmount: number }> = {}
    for (const inv of invoices) {
      if (!byCountry[inv.customerCountry]) {
        byCountry[inv.customerCountry] = { country: inv.customerCountry, count: 0, totalAmount: 0, vatAmount: 0 }
      }
      byCountry[inv.customerCountry].count++
      byCountry[inv.customerCountry].totalAmount += inv.amount
      byCountry[inv.customerCountry].vatAmount += inv.amount * (inv.vatRate / 100)
    }
    return Object.values(byCountry).sort((a, b) => b.totalAmount - a.totalAmount)
  }, [invoices])

  function openNew() {
    setEditing(null)
    setForm({ ...EMPTY_FORM })
    setDialogOpen(true)
  }

  function openEdit(inv: EuInvoice) {
    setEditing(inv)
    setForm({
      invoiceNumber: inv.invoiceNumber,
      date: inv.date,
      customerName: inv.customerName,
      customerCountry: inv.customerCountry,
      vatNumber: inv.vatNumber,
      vatNumberValid: inv.vatNumberValid,
      amount: inv.amount,
      vatRate: inv.vatRate,
      reverseCharge: inv.reverseCharge,
      description: inv.description,
    })
    setDialogOpen(true)
  }

  async function handleSave() {
    const vatValid = validateVatFormat(form.vatNumber)
    const item: EuInvoice = {
      id: editing?.id ?? crypto.randomUUID(),
      ...form,
      invoiceNumber: form.invoiceNumber.trim(),
      customerName: form.customerName.trim(),
      vatNumberValid: vatValid,
      reverseCharge: vatValid && form.reverseCharge,
      vatRate: vatValid && form.reverseCharge ? 0 : form.vatRate,
    }

    let updated: EuInvoice[]
    if (editing) {
      updated = invoices.map((i) => (i.id === editing.id ? item : i))
    } else {
      updated = [...invoices, item]
    }

    setInvoices(updated)
    setDialogOpen(false)
    await saveData(updated)
  }

  async function handleDelete() {
    if (!toDelete) return
    const updated = invoices.filter((i) => i.id !== toDelete.id)
    setInvoices(updated)
    setDeleteDialogOpen(false)
    setToDelete(null)
    await saveData(updated)
  }

  return (
    <>
      <ModuleWorkspaceShell
        title={mod.name}
        description={mod.desc}
        category="bokforing"
        sectorName="Tech & IT"
        backHref={`/m/${sectorSlug}`}
        settingsHref={settingsHref}
        actions={
          <Button onClick={openNew}>
            <Plus className="mr-2 h-4 w-4" />
            Ny EU-faktura
          </Button>
        }
      >
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <Tabs defaultValue="fakturor" className="space-y-6">
            <TabsList>
              <TabsTrigger value="fakturor">EU-fakturor</TabsTrigger>
              <TabsTrigger value="rapport">EU-försäljningsrapport</TabsTrigger>
            </TabsList>

            <TabsContent value="fakturor" className="space-y-6">
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <KPICard label="Totalt fakturerat" value={fmt(stats.totalAmount)} unit="kr" />
                <KPICard label="Omvand skattskyldighet" value={fmt(stats.reverseChargeAmount)} unit="kr" />
                <KPICard
                  label="Giltiga VAT-nr"
                  value={String(stats.validVatCount)}
                  unit="st"
                  trend="up"
                />
                <KPICard
                  label="Ogiltiga VAT-nr"
                  value={String(stats.invalidVatCount)}
                  unit="st"
                  trend={stats.invalidVatCount > 0 ? 'down' : 'neutral'}
                />
              </div>

              {invoices.length === 0 ? (
                <EmptyModuleState
                  icon={Globe}
                  title="Inga EU-fakturor"
                  description="Lägg till EU-fakturor för att hantera omvänd skattskyldighet och EU-rapportering."
                  actionLabel="Ny EU-faktura"
                  onAction={openNew}
                />
              ) : (
                <div className="rounded-xl border border-border overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/50">
                        <TableHead className="font-medium">Fakturanr</TableHead>
                        <TableHead className="font-medium">Datum</TableHead>
                        <TableHead className="font-medium">Kund</TableHead>
                        <TableHead className="font-medium">Land</TableHead>
                        <TableHead className="font-medium">VAT-nr</TableHead>
                        <TableHead className="font-medium">Status</TableHead>
                        <TableHead className="font-medium text-right">Belopp</TableHead>
                        <TableHead className="font-medium text-right">Åtgärder</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {invoices.map((inv) => (
                        <TableRow key={inv.id}>
                          <TableCell className="font-mono font-medium">{inv.invoiceNumber}</TableCell>
                          <TableCell>{inv.date}</TableCell>
                          <TableCell>{inv.customerName}</TableCell>
                          <TableCell>{inv.customerCountry}</TableCell>
                          <TableCell className="font-mono">
                            <div className="flex items-center gap-1.5">
                              {inv.vatNumberValid ? (
                                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                              ) : (
                                <XCircle className="h-3.5 w-3.5 text-red-500" />
                              )}
                              {inv.vatNumber}
                            </div>
                          </TableCell>
                          <TableCell>
                            {inv.reverseCharge ? (
                              <Badge variant="secondary" className="bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400">
                                Omvand moms
                              </Badge>
                            ) : (
                              <Badge variant="secondary">
                                Moms {inv.vatRate}%
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">{fmt(inv.amount)}</TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-1">
                              <Button variant="ghost" size="icon" onClick={() => openEdit(inv)} title="Redigera">
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <Button variant="ghost" size="icon" className="text-red-600 hover:text-red-700" onClick={() => { setToDelete(inv); setDeleteDialogOpen(true) }} title="Ta bort">
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
              {saving && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Sparar...
                </div>
              )}
            </TabsContent>

            <TabsContent value="rapport" className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm flex items-center gap-2">
                    <FileText className="h-4 w-4" />
                    EU-försäljningsrapport per land
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {salesReport.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Inga fakturor att rapportera.</p>
                  ) : (
                    <div className="rounded-xl border border-border overflow-hidden">
                      <Table>
                        <TableHeader>
                          <TableRow className="bg-muted/50">
                            <TableHead className="font-medium">Land</TableHead>
                            <TableHead className="font-medium text-right">Antal fakturor</TableHead>
                            <TableHead className="font-medium text-right">Totalt belopp (kr)</TableHead>
                            <TableHead className="font-medium text-right">Moms (kr)</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {salesReport.map((row) => (
                            <TableRow key={row.country}>
                              <TableCell className="font-medium">{row.country}</TableCell>
                              <TableCell className="text-right tabular-nums">{row.count}</TableCell>
                              <TableCell className="text-right tabular-nums">{fmt(row.totalAmount)}</TableCell>
                              <TableCell className="text-right tabular-nums">{fmt(row.vatAmount)}</TableCell>
                            </TableRow>
                          ))}
                          <TableRow className="bg-muted/30 font-semibold">
                            <TableCell>Totalt</TableCell>
                            <TableCell className="text-right tabular-nums">{salesReport.reduce((s, r) => s + r.count, 0)}</TableCell>
                            <TableCell className="text-right tabular-nums">{fmt(salesReport.reduce((s, r) => s + r.totalAmount, 0))}</TableCell>
                            <TableCell className="text-right tabular-nums">{fmt(salesReport.reduce((s, r) => s + r.vatAmount, 0))}</TableCell>
                          </TableRow>
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Fakturakrav vid omvand skattskyldighet</CardTitle>
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground space-y-2">
                  <p>Fakturan ska innehålla:</p>
                  <ul className="list-disc list-inside space-y-1">
                    <li>Säljarens och köparens VAT-nummer</li>
                    <li>Texten &quot;Reverse charge, article 196 Council Directive 2006/112/EC&quot;</li>
                    <li>Beloppet exklusive moms</li>
                    <li>Hänvisning till relevant EU-direktiv</li>
                  </ul>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        )}
      </ModuleWorkspaceShell>

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? 'Redigera EU-faktura' : 'Ny EU-faktura'}</DialogTitle>
            <DialogDescription>
              {editing ? 'Uppdatera fakturainformationen.' : 'Fyll i uppgifter för den nya EU-fakturan.'}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Fakturanummer *</Label>
                <Input value={form.invoiceNumber} onChange={(e) => setForm((f) => ({ ...f, invoiceNumber: e.target.value }))} placeholder="EU-2024-001" />
              </div>
              <div className="grid gap-2">
                <Label>Datum</Label>
                <Input type="date" value={form.date} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Kund *</Label>
                <Input value={form.customerName} onChange={(e) => setForm((f) => ({ ...f, customerName: e.target.value }))} placeholder="TechCorp GmbH" />
              </div>
              <div className="grid gap-2">
                <Label>Land</Label>
                <Select value={form.customerCountry} onValueChange={(v) => setForm((f) => ({ ...f, customerCountry: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {EU_COUNTRIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>VAT-nummer *</Label>
                <Input value={form.vatNumber} onChange={(e) => setForm((f) => ({ ...f, vatNumber: e.target.value }))} placeholder="DE123456789" />
                {form.vatNumber && (
                  <p className={`text-xs ${validateVatFormat(form.vatNumber) ? 'text-emerald-600' : 'text-red-500'}`}>
                    {validateVatFormat(form.vatNumber) ? 'Giltigt format' : 'Ogiltigt format (CC + 8\u201312 siffror)'}
                  </p>
                )}
              </div>
              <div className="grid gap-2">
                <Label>Belopp (kr) *</Label>
                <Input type="number" min={0} value={form.amount} onChange={(e) => setForm((f) => ({ ...f, amount: Number(e.target.value) }))} />
              </div>
            </div>
            <div className="grid gap-2">
              <Label>Beskrivning</Label>
              <Textarea value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} placeholder="Konsulttjänster..." rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Avbryt</Button>
            <Button onClick={handleSave} disabled={!form.invoiceNumber.trim() || !form.customerName.trim() || !form.vatNumber.trim()}>
              {editing ? 'Uppdatera' : 'Skapa faktura'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Ta bort faktura</DialogTitle>
            <DialogDescription>
              Är du säker på att du vill ta bort faktura {toDelete?.invoiceNumber}? Denna åtgärd kan inte ångras.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>Avbryt</Button>
            <Button variant="destructive" onClick={handleDelete}>
              <Trash2 className="mr-2 h-4 w-4" />
              Ta bort
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
