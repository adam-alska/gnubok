'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Download, FileText, TrendingUp, Scale, AlertCircle, Receipt, Briefcase, Gift } from 'lucide-react'
import type {
  FiscalPeriod,
  TrialBalanceRow,
  IncomeStatementReport,
  BalanceSheetReport,
  VatDeclaration,
  VatPeriodType,
  NEDeclaration,
} from '@/types'

function formatAmount(amount: number): string {
  return amount.toLocaleString('sv-SE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export default function ReportsPage() {
  const [periods, setPeriods] = useState<FiscalPeriod[]>([])
  const [selectedPeriod, setSelectedPeriod] = useState('')
  const [activeTab, setActiveTab] = useState('trial-balance')

  useEffect(() => {
    fetchPeriods()
  }, [])

  async function fetchPeriods() {
    const res = await fetch('/api/bookkeeping/fiscal-periods')
    const { data } = await res.json()
    setPeriods(data || [])
    if (data && data.length > 0) {
      setSelectedPeriod(data[0].id)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Rapporter</h1>
          <p className="text-muted-foreground">
            Saldobalans, resultaträkning, balansräkning, momsdeklaration, NE-bilaga och SIE-export
          </p>
        </div>
      </div>

      <div className="flex items-end gap-4">
        <div>
          <Label>Räkenskapsår</Label>
          <select
            value={selectedPeriod}
            onChange={(e) => setSelectedPeriod(e.target.value)}
            className="w-full mt-1 rounded-md border border-input bg-background px-3 py-2 text-sm"
          >
            {periods.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
        {selectedPeriod && (
          <Button
            variant="outline"
            onClick={() => {
              window.open(`/api/reports/sie-export?period_id=${selectedPeriod}`, '_blank')
            }}
          >
            <Download className="h-4 w-4 mr-2" />
            Ladda ner SIE-fil
          </Button>
        )}
      </div>

      {selectedPeriod ? (
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="trial-balance">
              <Scale className="h-4 w-4 mr-1" />
              Saldobalans
            </TabsTrigger>
            <TabsTrigger value="income-statement">
              <TrendingUp className="h-4 w-4 mr-1" />
              Resultaträkning
            </TabsTrigger>
            <TabsTrigger value="balance-sheet">
              <FileText className="h-4 w-4 mr-1" />
              Balansräkning
            </TabsTrigger>
            <TabsTrigger value="vat-declaration">
              <Receipt className="h-4 w-4 mr-1" />
              Momsdeklaration
            </TabsTrigger>
            <TabsTrigger value="ne-declaration">
              <Briefcase className="h-4 w-4 mr-1" />
              NE-bilaga
            </TabsTrigger>
          </TabsList>

          <TabsContent value="trial-balance">
            <TrialBalanceView periodId={selectedPeriod} />
          </TabsContent>
          <TabsContent value="income-statement">
            <IncomeStatementView periodId={selectedPeriod} />
          </TabsContent>
          <TabsContent value="balance-sheet">
            <BalanceSheetView periodId={selectedPeriod} />
          </TabsContent>
          <TabsContent value="vat-declaration">
            <VatDeclarationView />
          </TabsContent>
          <TabsContent value="ne-declaration">
            <NEDeclarationView periodId={selectedPeriod} />
          </TabsContent>
        </Tabs>
      ) : (
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">
            Inget räkenskapsår valt. Skapa ett räkenskapsår under Inställningar.
          </CardContent>
        </Card>
      )}
    </div>
  )
}

function TrialBalanceView({ periodId }: { periodId: string }) {
  const [data, setData] = useState<{
    rows: TrialBalanceRow[]
    totalDebit: number
    totalCredit: number
    isBalanced: boolean
  } | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setLoading(true)
    setError(null)
    fetch(`/api/reports/trial-balance?period_id=${periodId}`)
      .then((res) => res.json())
      .then((result) => {
        if (result.error) {
          setError(result.error)
        } else {
          setData(result.data)
        }
        setLoading(false)
      })
      .catch(() => {
        setError('Kunde inte hämta saldobalans')
        setLoading(false)
      })
  }, [periodId])

  if (loading) {
    return (
      <Card>
        <CardContent className="p-8 text-center text-muted-foreground">
          Laddar saldobalans...
        </CardContent>
      </Card>
    )
  }

  if (error) {
    return (
      <Card>
        <CardContent className="p-8 text-center text-destructive">
          <AlertCircle className="h-6 w-6 mx-auto mb-2" />
          {error}
        </CardContent>
      </Card>
    )
  }

  if (!data || data.rows.length === 0) {
    return (
      <Card>
        <CardContent className="p-8 text-center text-muted-foreground">
          Inga bokförda verifikationer i denna period.
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Saldobalans</CardTitle>
          {data.isBalanced ? (
            <Badge className="bg-green-100 text-green-800">Balanserad</Badge>
          ) : (
            <Badge variant="destructive">Ej balanserad</Badge>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-muted-foreground">
              <th className="py-2 w-20">Konto</th>
              <th className="py-2">Namn</th>
              <th className="py-2 w-28 text-right">Period debet</th>
              <th className="py-2 w-28 text-right">Period kredit</th>
              <th className="py-2 w-28 text-right">Saldo debet</th>
              <th className="py-2 w-28 text-right">Saldo kredit</th>
            </tr>
          </thead>
          <tbody>
            {data.rows.map((row) => (
              <tr key={row.account_number} className="border-b last:border-0">
                <td className="py-2 font-mono">{row.account_number}</td>
                <td className="py-2">{row.account_name}</td>
                <td className="py-2 text-right">
                  {row.period_debit > 0 ? formatAmount(row.period_debit) : ''}
                </td>
                <td className="py-2 text-right">
                  {row.period_credit > 0 ? formatAmount(row.period_credit) : ''}
                </td>
                <td className="py-2 text-right">
                  {row.closing_debit > 0 ? formatAmount(row.closing_debit) : ''}
                </td>
                <td className="py-2 text-right">
                  {row.closing_credit > 0 ? formatAmount(row.closing_credit) : ''}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="font-semibold border-t-2">
              <td colSpan={2} className="py-2">Summa</td>
              <td className="py-2 text-right">
                {formatAmount(data.rows.reduce((s, r) => s + r.period_debit, 0))}
              </td>
              <td className="py-2 text-right">
                {formatAmount(data.rows.reduce((s, r) => s + r.period_credit, 0))}
              </td>
              <td className={`py-2 text-right ${data.isBalanced ? 'text-green-600' : 'text-red-600'}`}>
                {formatAmount(data.totalDebit)}
              </td>
              <td className={`py-2 text-right ${data.isBalanced ? 'text-green-600' : 'text-red-600'}`}>
                {formatAmount(data.totalCredit)}
              </td>
            </tr>
          </tfoot>
        </table>
      </CardContent>
    </Card>
  )
}

function IncomeStatementView({ periodId }: { periodId: string }) {
  const [data, setData] = useState<IncomeStatementReport | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setLoading(true)
    setError(null)
    fetch(`/api/reports/income-statement?period_id=${periodId}`)
      .then((res) => res.json())
      .then((result) => {
        if (result.error) {
          setError(result.error)
        } else {
          setData(result.data)
        }
        setLoading(false)
      })
      .catch(() => {
        setError('Kunde inte hämta resultaträkning')
        setLoading(false)
      })
  }, [periodId])

  if (loading) {
    return (
      <Card>
        <CardContent className="p-8 text-center text-muted-foreground">
          Laddar resultaträkning...
        </CardContent>
      </Card>
    )
  }

  if (error) {
    return (
      <Card>
        <CardContent className="p-8 text-center text-destructive">
          <AlertCircle className="h-6 w-6 mx-auto mb-2" />
          {error}
        </CardContent>
      </Card>
    )
  }

  if (!data) {
    return (
      <Card>
        <CardContent className="p-8 text-center text-muted-foreground">
          Ingen data för denna period.
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      {/* Revenue */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Rörelseintäkter</CardTitle>
        </CardHeader>
        <CardContent>
          <ReportSectionTable sections={data.revenue_sections} />
          <div className="flex justify-between font-semibold pt-2 border-t mt-2">
            <span>Summa rörelseintäkter</span>
            <span>{formatAmount(data.total_revenue)} kr</span>
          </div>
        </CardContent>
      </Card>

      {/* Expenses */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Rörelsekostnader</CardTitle>
        </CardHeader>
        <CardContent>
          <ReportSectionTable sections={data.expense_sections} negate />
          <div className="flex justify-between font-semibold pt-2 border-t mt-2">
            <span>Summa rörelsekostnader</span>
            <span>-{formatAmount(data.total_expenses)} kr</span>
          </div>
        </CardContent>
      </Card>

      {/* Operating result */}
      <Card>
        <CardContent className="py-4">
          <div className="flex justify-between font-bold text-lg">
            <span>Rörelseresultat</span>
            <span className={data.total_revenue - data.total_expenses >= 0 ? 'text-green-600' : 'text-red-600'}>
              {formatAmount(data.total_revenue - data.total_expenses)} kr
            </span>
          </div>
        </CardContent>
      </Card>

      {/* Financial items */}
      {data.financial_sections.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Finansiella poster</CardTitle>
          </CardHeader>
          <CardContent>
            <ReportSectionTable sections={data.financial_sections} />
            <div className="flex justify-between font-semibold pt-2 border-t mt-2">
              <span>Summa finansiella poster</span>
              <span>{formatAmount(data.total_financial)} kr</span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Net result */}
      <Card className="border-2">
        <CardContent className="py-4">
          <div className="flex justify-between font-bold text-xl">
            <span>Årets resultat</span>
            <span className={data.net_result >= 0 ? 'text-green-600' : 'text-red-600'}>
              {formatAmount(data.net_result)} kr
            </span>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

function BalanceSheetView({ periodId }: { periodId: string }) {
  const [data, setData] = useState<BalanceSheetReport | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setLoading(true)
    setError(null)
    fetch(`/api/reports/balance-sheet?period_id=${periodId}`)
      .then((res) => res.json())
      .then((result) => {
        if (result.error) {
          setError(result.error)
        } else {
          setData(result.data)
        }
        setLoading(false)
      })
      .catch(() => {
        setError('Kunde inte hämta balansräkning')
        setLoading(false)
      })
  }, [periodId])

  if (loading) {
    return (
      <Card>
        <CardContent className="p-8 text-center text-muted-foreground">
          Laddar balansräkning...
        </CardContent>
      </Card>
    )
  }

  if (error) {
    return (
      <Card>
        <CardContent className="p-8 text-center text-destructive">
          <AlertCircle className="h-6 w-6 mx-auto mb-2" />
          {error}
        </CardContent>
      </Card>
    )
  }

  if (!data) {
    return (
      <Card>
        <CardContent className="p-8 text-center text-muted-foreground">
          Ingen data för denna period.
        </CardContent>
      </Card>
    )
  }

  const isBalanced = Math.abs(data.total_assets - data.total_equity_liabilities) < 0.01

  return (
    <div className="space-y-4">
      {/* Assets */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Tillgångar</CardTitle>
        </CardHeader>
        <CardContent>
          <ReportSectionTable sections={data.asset_sections} />
          <div className="flex justify-between font-semibold pt-2 border-t mt-2">
            <span>Summa tillgångar</span>
            <span>{formatAmount(data.total_assets)} kr</span>
          </div>
        </CardContent>
      </Card>

      {/* Equity and liabilities */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Eget kapital och skulder</CardTitle>
        </CardHeader>
        <CardContent>
          <ReportSectionTable sections={data.equity_liability_sections} />
          <div className="flex justify-between font-semibold pt-2 border-t mt-2">
            <span>Summa eget kapital och skulder</span>
            <span>{formatAmount(data.total_equity_liabilities)} kr</span>
          </div>
        </CardContent>
      </Card>

      {/* Balance check */}
      <Card className="border-2">
        <CardContent className="py-4">
          <div className="flex justify-between items-center">
            <span className="font-bold text-lg">Balanscheck</span>
            {isBalanced ? (
              <Badge className="bg-green-100 text-green-800 text-base px-3 py-1">
                Balanserar
              </Badge>
            ) : (
              <div className="text-right">
                <Badge variant="destructive" className="text-base px-3 py-1">
                  Balanserar ej
                </Badge>
                <p className="text-sm text-red-600 mt-1">
                  Differens: {formatAmount(Math.abs(data.total_assets - data.total_equity_liabilities))} kr
                </p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

function ReportSectionTable({
  sections,
  negate,
}: {
  sections: { title: string; rows: { account_number: string; account_name: string; amount: number }[]; subtotal: number }[]
  negate?: boolean
}) {
  if (sections.length === 0) {
    return <p className="text-sm text-muted-foreground">Inga poster.</p>
  }

  return (
    <div className="space-y-3">
      {sections.map((section) => (
        <div key={section.title}>
          <h4 className="text-sm font-semibold text-muted-foreground mb-1">{section.title}</h4>
          <table className="w-full text-sm">
            <tbody>
              {section.rows.map((row) => (
                <tr key={row.account_number} className="border-b last:border-0">
                  <td className="py-1 font-mono w-16">{row.account_number}</td>
                  <td className="py-1">{row.account_name}</td>
                  <td className="py-1 text-right w-28">
                    {negate ? `-${formatAmount(row.amount)}` : formatAmount(row.amount)} kr
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="flex justify-between text-sm font-medium border-t pt-1 mt-1">
            <span>{section.title}</span>
            <span>
              {negate ? `-${formatAmount(section.subtotal)}` : formatAmount(section.subtotal)} kr
            </span>
          </div>
        </div>
      ))}
    </div>
  )
}

function VatDeclarationView() {
  const currentYear = new Date().getFullYear()
  const currentMonth = new Date().getMonth() + 1
  const currentQuarter = Math.ceil(currentMonth / 3)

  const [periodType, setPeriodType] = useState<VatPeriodType>('quarterly')
  const [year, setYear] = useState(currentYear)
  const [period, setPeriod] = useState(currentQuarter)
  const [data, setData] = useState<VatDeclaration | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Generate year options (last 5 years)
  const yearOptions = Array.from({ length: 5 }, (_, i) => currentYear - i)

  // Generate period options based on type
  const getPeriodOptions = () => {
    switch (periodType) {
      case 'monthly':
        return [
          { value: 1, label: 'Januari' },
          { value: 2, label: 'Februari' },
          { value: 3, label: 'Mars' },
          { value: 4, label: 'April' },
          { value: 5, label: 'Maj' },
          { value: 6, label: 'Juni' },
          { value: 7, label: 'Juli' },
          { value: 8, label: 'Augusti' },
          { value: 9, label: 'September' },
          { value: 10, label: 'Oktober' },
          { value: 11, label: 'November' },
          { value: 12, label: 'December' },
        ]
      case 'quarterly':
        return [
          { value: 1, label: 'Kvartal 1 (jan-mar)' },
          { value: 2, label: 'Kvartal 2 (apr-jun)' },
          { value: 3, label: 'Kvartal 3 (jul-sep)' },
          { value: 4, label: 'Kvartal 4 (okt-dec)' },
        ]
      case 'yearly':
        return [{ value: 1, label: 'Helår' }]
      default:
        return []
    }
  }

  // Reset period when type changes
  useEffect(() => {
    if (periodType === 'monthly') {
      setPeriod(currentMonth)
    } else if (periodType === 'quarterly') {
      setPeriod(currentQuarter)
    } else {
      setPeriod(1)
    }
  }, [periodType, currentMonth, currentQuarter])

  const fetchDeclaration = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(
        `/api/reports/vat-declaration?periodType=${periodType}&year=${year}&period=${period}`
      )
      const result = await res.json()
      if (result.error) {
        setError(result.error)
      } else {
        setData(result.data)
      }
    } catch {
      setError('Kunde inte hämta momsdeklaration')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-4">
      {/* Period selection */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Välj period</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-end gap-4">
            <div>
              <Label>Periodicitet</Label>
              <select
                value={periodType}
                onChange={(e) => setPeriodType(e.target.value as VatPeriodType)}
                className="w-full mt-1 rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="monthly">Månadsvis</option>
                <option value="quarterly">Kvartalsvis</option>
                <option value="yearly">Årsvis</option>
              </select>
            </div>
            <div>
              <Label>År</Label>
              <select
                value={year}
                onChange={(e) => setYear(parseInt(e.target.value))}
                className="w-full mt-1 rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                {yearOptions.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label>Period</Label>
              <select
                value={period}
                onChange={(e) => setPeriod(parseInt(e.target.value))}
                className="w-full mt-1 rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                {getPeriodOptions().map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
            <Button onClick={fetchDeclaration} disabled={loading}>
              {loading ? 'Laddar...' : 'Hämta'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {error && (
        <Card>
          <CardContent className="p-8 text-center text-destructive">
            <AlertCircle className="h-6 w-6 mx-auto mb-2" />
            {error}
          </CardContent>
        </Card>
      )}

      {data && (
        <>
          {/* Summary */}
          <Card className="border-2">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Momsdeklaration - {data.period.start} till {data.period.end}</CardTitle>
                <Badge
                  className={
                    data.rutor.ruta49 > 0
                      ? 'bg-orange-100 text-orange-800'
                      : data.rutor.ruta49 < 0
                      ? 'bg-green-100 text-green-800'
                      : 'bg-gray-100 text-gray-800'
                  }
                >
                  {data.rutor.ruta49 > 0
                    ? `Att betala: ${formatAmount(data.rutor.ruta49)} kr`
                    : data.rutor.ruta49 < 0
                    ? `Att återfå: ${formatAmount(Math.abs(data.rutor.ruta49))} kr`
                    : 'Ingen moms'}
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-sm text-muted-foreground mb-4">
                Baserat på {data.invoiceCount} fakturor och {data.transactionCount} transaktioner
              </div>

              <div className="grid md:grid-cols-2 gap-6">
                {/* Utgående moms */}
                <div>
                  <h4 className="font-semibold mb-3">Utgående moms (försäljning)</h4>
                  <table className="w-full text-sm">
                    <tbody>
                      <VatRutaRow
                        ruta="05"
                        label="Moms 25%"
                        amount={data.rutor.ruta05}
                        baseAmount={data.rutor.ruta10}
                      />
                      <VatRutaRow
                        ruta="06"
                        label="Moms 12%"
                        amount={data.rutor.ruta06}
                        baseAmount={data.rutor.ruta11}
                      />
                      <VatRutaRow
                        ruta="07"
                        label="Moms 6%"
                        amount={data.rutor.ruta07}
                        baseAmount={data.rutor.ruta12}
                      />
                      <VatRutaRow
                        ruta="39"
                        label="Tjänster EU (omvänd skattskyldighet)"
                        amount={0}
                        baseAmount={data.rutor.ruta39}
                        noVat
                      />
                      <VatRutaRow
                        ruta="40"
                        label="Export utanför EU"
                        amount={0}
                        baseAmount={data.rutor.ruta40}
                        noVat
                      />
                    </tbody>
                    <tfoot>
                      <tr className="border-t-2 font-semibold">
                        <td className="py-2">Summa utgående</td>
                        <td className="py-2 text-right">
                          {formatAmount(data.rutor.ruta05 + data.rutor.ruta06 + data.rutor.ruta07)} kr
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>

                {/* Ingående moms */}
                <div>
                  <h4 className="font-semibold mb-3">Ingående moms (avdragsgill)</h4>
                  <table className="w-full text-sm">
                    <tbody>
                      <tr className="border-b">
                        <td className="py-2">
                          <span className="font-mono text-xs bg-muted px-1 rounded mr-2">48</span>
                          Ingående moms att dra av
                        </td>
                        <td className="py-2 text-right">{formatAmount(data.rutor.ruta48)} kr</td>
                      </tr>
                      {data.breakdown.transactions.ruta48 > 0 && (
                        <tr className="text-muted-foreground">
                          <td className="py-1 pl-6 text-xs">- från transaktioner</td>
                          <td className="py-1 text-right text-xs">
                            {formatAmount(data.breakdown.transactions.ruta48)} kr
                          </td>
                        </tr>
                      )}
                      {data.breakdown.receipts.ruta48 > 0 && (
                        <tr className="text-muted-foreground">
                          <td className="py-1 pl-6 text-xs">- från kvitton</td>
                          <td className="py-1 text-right text-xs">
                            {formatAmount(data.breakdown.receipts.ruta48)} kr
                          </td>
                        </tr>
                      )}
                    </tbody>
                    <tfoot>
                      <tr className="border-t-2 font-semibold">
                        <td className="py-2">Summa ingående</td>
                        <td className="py-2 text-right">{formatAmount(data.rutor.ruta48)} kr</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>

              {/* Net result */}
              <div className="mt-6 pt-4 border-t-2">
                <div className="flex justify-between items-center">
                  <div>
                    <span className="font-mono text-xs bg-muted px-1 rounded mr-2">49</span>
                    <span className="font-bold text-lg">
                      {data.rutor.ruta49 >= 0 ? 'Moms att betala' : 'Moms att återfå'}
                    </span>
                  </div>
                  <span
                    className={`text-xl font-bold ${
                      data.rutor.ruta49 > 0
                        ? 'text-orange-600'
                        : data.rutor.ruta49 < 0
                        ? 'text-green-600'
                        : ''
                    }`}
                  >
                    {formatAmount(Math.abs(data.rutor.ruta49))} kr
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>
        </>
      )}

      {!data && !loading && !error && (
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">
            Välj period och klicka &quot;Hämta&quot; för att se momsdeklaration.
          </CardContent>
        </Card>
      )}
    </div>
  )
}

function VatRutaRow({
  ruta,
  label,
  amount,
  baseAmount,
  noVat,
}: {
  ruta: string
  label: string
  amount: number
  baseAmount: number
  noVat?: boolean
}) {
  // Don't show rows with zero values
  if (baseAmount === 0 && amount === 0) return null

  return (
    <>
      <tr className="border-b">
        <td className="py-2">
          <span className="font-mono text-xs bg-muted px-1 rounded mr-2">{ruta}</span>
          {label}
        </td>
        <td className="py-2 text-right">{noVat ? '-' : `${formatAmount(amount)} kr`}</td>
      </tr>
      <tr className="text-muted-foreground">
        <td className="py-1 pl-6 text-xs">Underlag (ruta {parseInt(ruta) + 5})</td>
        <td className="py-1 text-right text-xs">{formatAmount(baseAmount)} kr</td>
      </tr>
    </>
  )
}

function NEDeclarationView({ periodId }: { periodId: string }) {
  const [data, setData] = useState<NEDeclaration | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchDeclaration = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/reports/ne-declaration?period_id=${periodId}`)
      const result = await res.json()
      if (result.error) {
        setError(result.error)
      } else {
        setData(result.data)
      }
    } catch {
      setError('Kunde inte hämta NE-bilaga')
    } finally {
      setLoading(false)
    }
  }

  const downloadSRU = () => {
    window.open(`/api/reports/ne-declaration?period_id=${periodId}&format=sru`, '_blank')
  }

  // NE ruta labels
  const rutaLabels: Record<string, string> = {
    R1: 'Försäljning med moms (25%)',
    R2: 'Momsfria intäkter',
    R3: 'Bil/bostadsförmån',
    R4: 'Ränteintäkter',
    R5: 'Varuinköp',
    R6: 'Övriga kostnader',
    R7: 'Lönekostnader',
    R8: 'Räntekostnader',
    R9: 'Avskrivningar fastighet',
    R10: 'Avskrivningar övriga tillgångar',
    R11: 'Årets resultat',
  }

  // Categorize rutor
  const revenueRutor = ['R1', 'R2', 'R3', 'R4'] as const
  const expenseRutor = ['R5', 'R6', 'R7', 'R8', 'R9', 'R10'] as const

  return (
    <div className="space-y-4">
      {/* Info card */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">NE-bilaga (Enskild firma)</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground mb-4">
            NE-bilagan används för att deklarera resultat från enskild näringsverksamhet.
            Uppgifterna hämtas från bokföringen för valt räkenskapsår.
          </p>
          <div className="flex gap-2">
            <Button onClick={fetchDeclaration} disabled={loading}>
              {loading ? 'Laddar...' : 'Hämta NE-bilaga'}
            </Button>
            {data && (
              <Button variant="outline" onClick={downloadSRU}>
                <Download className="h-4 w-4 mr-2" />
                Ladda ner SRU-fil
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {error && (
        <Card>
          <CardContent className="p-8 text-center text-destructive">
            <AlertCircle className="h-6 w-6 mx-auto mb-2" />
            {error}
          </CardContent>
        </Card>
      )}

      {data && (
        <>
          {/* Warnings */}
          {data.warnings.length > 0 && (
            <Card className="border-orange-200 bg-orange-50">
              <CardContent className="py-4">
                <div className="flex items-start gap-2">
                  <AlertCircle className="h-5 w-5 text-orange-600 mt-0.5" />
                  <div>
                    {data.warnings.map((warning, i) => (
                      <p key={i} className="text-sm text-orange-800">{warning}</p>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Company info */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>
                  {data.companyInfo.companyName}
                </CardTitle>
                <Badge className="bg-blue-100 text-blue-800">
                  {data.fiscalYear.name}
                </Badge>
              </div>
              {data.companyInfo.orgNumber && (
                <p className="text-sm text-muted-foreground">
                  Org.nr: {data.companyInfo.orgNumber}
                </p>
              )}
            </CardHeader>
          </Card>

          {/* Revenue section */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Intäkter</CardTitle>
            </CardHeader>
            <CardContent>
              <table className="w-full text-sm">
                <tbody>
                  {revenueRutor.map((ruta) => {
                    const value = data.rutor[ruta]
                    const breakdown = data.breakdown[ruta]
                    return (
                      <NEDeclarationRow
                        key={ruta}
                        ruta={ruta}
                        label={rutaLabels[ruta]}
                        amount={value}
                        accounts={breakdown?.accounts || []}
                      />
                    )
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 font-semibold">
                    <td className="py-2">Summa intäkter</td>
                    <td className="py-2 text-right">
                      {formatAmount(
                        data.rutor.R1 + data.rutor.R2 + data.rutor.R3 + data.rutor.R4
                      )} kr
                    </td>
                  </tr>
                </tfoot>
              </table>
            </CardContent>
          </Card>

          {/* Expenses section */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Kostnader</CardTitle>
            </CardHeader>
            <CardContent>
              <table className="w-full text-sm">
                <tbody>
                  {expenseRutor.map((ruta) => {
                    const value = data.rutor[ruta]
                    const breakdown = data.breakdown[ruta]
                    return (
                      <NEDeclarationRow
                        key={ruta}
                        ruta={ruta}
                        label={rutaLabels[ruta]}
                        amount={value}
                        accounts={breakdown?.accounts || []}
                        isExpense
                      />
                    )
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 font-semibold">
                    <td className="py-2">Summa kostnader</td>
                    <td className="py-2 text-right">
                      -{formatAmount(
                        data.rutor.R5 + data.rutor.R6 + data.rutor.R7 +
                        data.rutor.R8 + data.rutor.R9 + data.rutor.R10
                      )} kr
                    </td>
                  </tr>
                </tfoot>
              </table>
            </CardContent>
          </Card>

          {/* Gift breakdown (if any gifts exist) */}
          {data.giftBreakdown && data.giftBreakdown.gifts.length > 0 && (
            <Card className="border-amber-200 bg-amber-50/50">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Gift className="h-5 w-5 text-amber-600" />
                  Gåvor & Förmåner
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground mb-4">
                  Skattepliktiga gåvor som ingår i intäkter/kostnader ovan (via bokföringsverifikationer).
                </p>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-muted-foreground">
                      <th className="py-2">Datum</th>
                      <th className="py-2">Varumärke</th>
                      <th className="py-2">Beskrivning</th>
                      <th className="py-2 text-right">Värde</th>
                      <th className="py-2">NE-ruta</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.giftBreakdown.gifts.map((gift) => (
                      <tr key={gift.id} className="border-b last:border-0">
                        <td className="py-2">{gift.date}</td>
                        <td className="py-2">{gift.brandName}</td>
                        <td className="py-2 max-w-[200px] truncate">{gift.description}</td>
                        <td className="py-2 text-right tabular-nums">{formatAmount(gift.marketValue)} kr</td>
                        <td className="py-2">
                          <div className="flex gap-1">
                            {gift.neIncomeRuta && (
                              <Badge variant="outline" className="font-mono text-xs">
                                {gift.neIncomeRuta}
                              </Badge>
                            )}
                            {gift.neExpenseRuta && (
                              <Badge variant="outline" className="font-mono text-xs text-green-600">
                                {gift.neExpenseRuta}
                              </Badge>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 font-semibold">
                      <td colSpan={3} className="py-2">Summa i R1 (med moms)</td>
                      <td className="py-2 text-right tabular-nums">{formatAmount(data.giftBreakdown.summary.r1Total)} kr</td>
                      <td></td>
                    </tr>
                    <tr className="font-semibold">
                      <td colSpan={3} className="py-2">Summa i R2 (momsfri)</td>
                      <td className="py-2 text-right tabular-nums">{formatAmount(data.giftBreakdown.summary.r2Total)} kr</td>
                      <td></td>
                    </tr>
                    <tr className="font-semibold">
                      <td colSpan={3} className="py-2">Summa avdrag i R6</td>
                      <td className="py-2 text-right tabular-nums text-green-600">-{formatAmount(data.giftBreakdown.summary.r6Total)} kr</td>
                      <td></td>
                    </tr>
                    <tr className="border-t font-bold">
                      <td colSpan={3} className="py-2">Netto skatteeffekt</td>
                      <td className="py-2 text-right tabular-nums">{formatAmount(data.giftBreakdown.summary.netTaxableIncome)} kr</td>
                      <td></td>
                    </tr>
                  </tfoot>
                </table>
              </CardContent>
            </Card>
          )}

          {/* Result */}
          <Card className="border-2">
            <CardContent className="py-4">
              <div className="flex justify-between items-center">
                <div>
                  <span className="font-mono text-xs bg-muted px-1 rounded mr-2">R11</span>
                  <span className="font-bold text-xl">Årets resultat</span>
                </div>
                <span
                  className={`text-2xl font-bold ${
                    data.rutor.R11 >= 0 ? 'text-green-600' : 'text-red-600'
                  }`}
                >
                  {formatAmount(data.rutor.R11)} kr
                </span>
              </div>
            </CardContent>
          </Card>
        </>
      )}

      {!data && !loading && !error && (
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">
            Klicka &quot;Hämta NE-bilaga&quot; för att generera deklarationsunderlaget.
          </CardContent>
        </Card>
      )}
    </div>
  )
}

function NEDeclarationRow({
  ruta,
  label,
  amount,
  accounts,
  isExpense,
}: {
  ruta: string
  label: string
  amount: number
  accounts: Array<{ accountNumber: string; accountName: string; amount: number }>
  isExpense?: boolean
}) {
  const [expanded, setExpanded] = useState(false)

  // Don't show rows with zero values
  if (amount === 0 && accounts.length === 0) return null

  return (
    <>
      <tr
        className="border-b cursor-pointer hover:bg-muted/50"
        onClick={() => accounts.length > 0 && setExpanded(!expanded)}
      >
        <td className="py-2">
          <span className="font-mono text-xs bg-muted px-1 rounded mr-2">{ruta}</span>
          {label}
          {accounts.length > 0 && (
            <span className="text-xs text-muted-foreground ml-2">
              ({accounts.length} konton)
            </span>
          )}
        </td>
        <td className="py-2 text-right">
          {isExpense && amount > 0 ? '-' : ''}{formatAmount(Math.abs(amount))} kr
        </td>
      </tr>
      {expanded && accounts.length > 0 && (
        <tr>
          <td colSpan={2} className="py-2 pl-8 bg-muted/30">
            <table className="w-full text-xs">
              <tbody>
                {accounts.map((acc) => (
                  <tr key={acc.accountNumber}>
                    <td className="py-1 font-mono">{acc.accountNumber}</td>
                    <td className="py-1">{acc.accountName}</td>
                    <td className="py-1 text-right">
                      {isExpense && acc.amount > 0 ? '-' : ''}{formatAmount(Math.abs(acc.amount))} kr
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </td>
        </tr>
      )}
    </>
  )
}
