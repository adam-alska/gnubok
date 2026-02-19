'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { CheckCircle2, XCircle, Loader2, AlertCircle } from 'lucide-react'
import type { TrialBalanceRow } from '@/types'

interface TrialBalanceCheckProps {
  periodId: string
}

function formatAmount(amount: number): string {
  return amount.toLocaleString('sv-SE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

export function TrialBalanceCheck({ periodId }: TrialBalanceCheckProps) {
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
      })
      .catch(() => setError('Kunde inte hämta saldobalans'))
      .finally(() => setLoading(false))
  }, [periodId])

  if (loading) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto text-muted-foreground" />
          <p className="text-sm text-muted-foreground mt-2">Laddar saldobalans...</p>
        </CardContent>
      </Card>
    )
  }

  if (error) {
    return (
      <Card>
        <CardContent className="py-8 text-center">
          <AlertCircle className="h-8 w-8 mx-auto text-destructive mb-2" />
          <p className="text-sm text-destructive">{error}</p>
        </CardContent>
      </Card>
    )
  }

  if (!data || data.rows.length === 0) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground">
          Inga bokforda verifikationer i denna period.
        </CardContent>
      </Card>
    )
  }

  const difference = Math.abs(data.totalDebit - data.totalCredit)

  return (
    <div className="space-y-4">
      {/* Balance check card */}
      <Card className={`border-2 ${data.isBalanced ? 'border-green-200' : 'border-red-200'}`}>
        <CardContent className="py-8">
          <div className="text-center">
            {data.isBalanced ? (
              <>
                <CheckCircle2 className="h-16 w-16 text-green-500 mx-auto mb-3" />
                <h3 className="text-xl font-bold text-green-700 mb-1">
                  Debet = Kredit
                </h3>
                <p className="text-sm text-muted-foreground">
                  Saldobalansen stammer. Debet och kredit ar i balans.
                </p>
              </>
            ) : (
              <>
                <XCircle className="h-16 w-16 text-red-500 mx-auto mb-3" />
                <h3 className="text-xl font-bold text-red-700 mb-1">
                  Ej i balans
                </h3>
                <p className="text-sm text-red-600">
                  Differens: {formatAmount(difference)} kr
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Kontrollera bokforingen innan du gar vidare med bokslutet.
                </p>
              </>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4 mt-6 pt-4 border-t">
            <div className="text-center">
              <p className="text-xs text-muted-foreground mb-1">Summa debet</p>
              <p className="text-lg font-semibold">{formatAmount(data.totalDebit)} kr</p>
            </div>
            <div className="text-center">
              <p className="text-xs text-muted-foreground mb-1">Summa kredit</p>
              <p className="text-lg font-semibold">{formatAmount(data.totalCredit)} kr</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-4">
        <SummaryCard
          title="Tillgangar (klass 1)"
          rows={data.rows.filter((r) => r.account_class === 1)}
        />
        <SummaryCard
          title="Eget kapital & skulder (klass 2)"
          rows={data.rows.filter((r) => r.account_class === 2)}
        />
        <SummaryCard
          title="Resultat (klass 3-8)"
          rows={data.rows.filter((r) => r.account_class >= 3)}
        />
      </div>

      {/* Full trial balance */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg">Saldobalans</CardTitle>
            <Badge variant="outline">{data.rows.length} konton</Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className="max-h-[500px] overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-card">
                <tr className="border-b text-left text-muted-foreground">
                  <th className="py-2 w-20">Konto</th>
                  <th className="py-2">Namn</th>
                  <th className="py-2 w-28 text-right">Debet</th>
                  <th className="py-2 w-28 text-right">Kredit</th>
                  <th className="py-2 w-28 text-right">Saldo</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map((row) => {
                  const balance = row.closing_debit - row.closing_credit
                  return (
                    <tr key={row.account_number} className="border-b last:border-0">
                      <td className="py-1.5 font-mono text-xs">{row.account_number}</td>
                      <td className="py-1.5 text-xs">{row.account_name}</td>
                      <td className="py-1.5 text-right text-xs">
                        {row.closing_debit > 0 ? formatAmount(row.closing_debit) : ''}
                      </td>
                      <td className="py-1.5 text-right text-xs">
                        {row.closing_credit > 0 ? formatAmount(row.closing_credit) : ''}
                      </td>
                      <td
                        className={`py-1.5 text-right text-xs font-medium ${
                          balance > 0 ? 'text-blue-600' : balance < 0 ? 'text-orange-600' : ''
                        }`}
                      >
                        {formatAmount(balance)}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot>
                <tr className="font-semibold border-t-2">
                  <td colSpan={2} className="py-2">Summa</td>
                  <td className="py-2 text-right">{formatAmount(data.totalDebit)}</td>
                  <td className="py-2 text-right">{formatAmount(data.totalCredit)}</td>
                  <td className="py-2 text-right">
                    {formatAmount(data.totalDebit - data.totalCredit)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

function SummaryCard({
  title,
  rows,
}: {
  title: string
  rows: TrialBalanceRow[]
}) {
  const totalDebit = rows.reduce((s, r) => s + r.closing_debit, 0)
  const totalCredit = rows.reduce((s, r) => s + r.closing_credit, 0)
  const net = totalDebit - totalCredit

  return (
    <Card>
      <CardContent className="py-4">
        <p className="text-xs text-muted-foreground mb-1">{title}</p>
        <p className="text-lg font-semibold">{formatAmount(Math.abs(net))} kr</p>
        <p className="text-[10px] text-muted-foreground">
          {rows.length} konton
        </p>
      </CardContent>
    </Card>
  )
}
