'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Download, AlertCircle, Info } from 'lucide-react'
import { AccountNumber } from '@/components/ui/account-number'
import { formatCurrency } from '@/lib/utils'
import type { INK2Declaration, INK2SRUCode } from '@/lib/reports/ink2/types'
import {
  INK2_RUTA_LABELS,
  INK2_ASSET_CODES,
  INK2_EQUITY_LIABILITY_CODES,
  INK2_INCOME_STATEMENT_CODES,
} from '@/lib/reports/ink2/types'

export function INK2DeclarationView({ periodId }: { periodId: string }) {
  const [data, setData] = useState<INK2Declaration | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchDeclaration = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/reports/ink2?period_id=${periodId}`)
      const result = await res.json()
      if (result.error) {
        setError(result.error)
      } else {
        setData(result.data)
      }
    } catch {
      setError('Kunde inte hämta INK2-deklaration')
    } finally {
      setLoading(false)
    }
  }

  const downloadSRU = () => {
    window.open(`/api/reports/ink2?period_id=${periodId}&format=sru`, '_blank')
  }

  return (
    <div className="space-y-4">
      {/* Info card */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">INK2 (Aktiebolag)</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-start gap-2 mb-4 p-3 bg-blue-50 rounded-md">
            <Info className="h-4 w-4 text-blue-600 mt-0.5 shrink-0" />
            <p className="text-sm text-blue-800">
              INK2 visar det bokföringsmässiga resultatet baserat på din bokföring.
              Skattemässiga justeringar (ej avdragsgilla kostnader, periodiseringsfonder m.m.)
              hanteras av din revisor/redovisningskonsult.
            </p>
          </div>
          <div className="flex gap-2">
            <Button onClick={fetchDeclaration} disabled={loading}>
              {loading ? 'Laddar...' : 'Hämta INK2'}
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

          {/* Assets section */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Tillgångar</CardTitle>
            </CardHeader>
            <CardContent>
              <table className="w-full text-sm">
                <tbody>
                  {INK2_ASSET_CODES.map((code) => (
                    <INK2DeclarationRow
                      key={code}
                      code={code}
                      label={INK2_RUTA_LABELS[code]}
                      amount={data.rutor[code]}
                      accounts={data.breakdown[code]?.accounts || []}
                    />
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 font-semibold">
                    <td className="py-2">Summa tillgångar</td>
                    <td className="py-2 text-right">
                      {formatCurrency(data.totals.totalAssets)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </CardContent>
          </Card>

          {/* Equity & Liabilities section */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Eget kapital och skulder</CardTitle>
            </CardHeader>
            <CardContent>
              <table className="w-full text-sm">
                <tbody>
                  {INK2_EQUITY_LIABILITY_CODES.map((code) => (
                    <INK2DeclarationRow
                      key={code}
                      code={code}
                      label={INK2_RUTA_LABELS[code]}
                      amount={data.rutor[code]}
                      accounts={data.breakdown[code]?.accounts || []}
                    />
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 font-semibold">
                    <td className="py-2">Summa eget kapital och skulder</td>
                    <td className="py-2 text-right">
                      {formatCurrency(data.totals.totalEquityLiabilities)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </CardContent>
          </Card>

          {/* Income Statement section */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Resultaträkning</CardTitle>
            </CardHeader>
            <CardContent>
              <table className="w-full text-sm">
                <tbody>
                  {INK2_INCOME_STATEMENT_CODES.map((code) => {
                    const isExpense = code !== '7310' && code !== '7370' && code !== '7380'
                    return (
                      <INK2DeclarationRow
                        key={code}
                        code={code}
                        label={INK2_RUTA_LABELS[code]}
                        amount={data.rutor[code]}
                        accounts={data.breakdown[code]?.accounts || []}
                        isExpense={isExpense}
                      />
                    )
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t font-medium">
                    <td className="py-2">Rörelseresultat</td>
                    <td className={`py-2 text-right ${data.totals.operatingResult >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {formatCurrency(data.totals.operatingResult)}
                    </td>
                  </tr>
                  <tr className="border-t-2 font-semibold">
                    <td className="py-2">Resultat efter finansiella poster</td>
                    <td className={`py-2 text-right ${data.totals.resultAfterFinancial >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {formatCurrency(data.totals.resultAfterFinancial)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </CardContent>
          </Card>
        </>
      )}

      {!data && !loading && !error && (
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">
            Klicka &quot;Hämta INK2&quot; för att generera deklarationsunderlaget.
          </CardContent>
        </Card>
      )}
    </div>
  )
}

function INK2DeclarationRow({
  code,
  label,
  amount,
  accounts,
  isExpense,
}: {
  code: INK2SRUCode
  label: string
  amount: number
  accounts: Array<{ accountNumber: string; accountName: string; amount: number }>
  isExpense?: boolean
}) {
  const [expanded, setExpanded] = useState(false)

  if (amount === 0 && accounts.length === 0) return null

  return (
    <>
      <tr
        className="border-b cursor-pointer hover:bg-muted/50"
        onClick={() => accounts.length > 0 && setExpanded(!expanded)}
      >
        <td className="py-2">
          <span className="font-mono text-xs bg-muted px-1 rounded mr-2">{code}</span>
          {label}
          {accounts.length > 0 && (
            <span className="text-xs text-muted-foreground ml-2">
              ({accounts.length} konton)
            </span>
          )}
        </td>
        <td className="py-2 text-right">
          {isExpense && amount > 0 ? '-' : ''}{formatCurrency(Math.abs(amount))}
        </td>
      </tr>
      {expanded && accounts.length > 0 && (
        <tr>
          <td colSpan={2} className="py-2 pl-8 bg-muted/30">
            <table className="w-full text-xs">
              <tbody>
                {accounts.map((acc) => (
                  <tr key={acc.accountNumber}>
                    <td className="py-1">
                      <AccountNumber number={acc.accountNumber} name={acc.accountName} size="sm" />
                    </td>
                    <td className="py-1">{acc.accountName}</td>
                    <td className="py-1 text-right">
                      {isExpense && acc.amount > 0 ? '-' : ''}{formatCurrency(Math.abs(acc.amount))}
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
