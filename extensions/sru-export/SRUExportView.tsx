'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Download, AlertCircle } from 'lucide-react'
import type { SRUExportResult, SRUCoverageStats } from '@/types'

function formatAmount(amount: number): string {
  return amount.toLocaleString('sv-SE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export function SRUExportView({ periodId }: { periodId: string }) {
  const [data, setData] = useState<SRUExportResult | null>(null)
  const [coverage, setCoverage] = useState<SRUCoverageStats | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetchCoverage()
  }, [])

  async function fetchCoverage() {
    try {
      const res = await fetch('/api/extensions/sru-export/coverage')
      const result = await res.json()
      if (result.data) {
        setCoverage(result.data)
      }
    } catch {
      // Coverage is optional, ignore errors
    }
  }

  const fetchExport = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/extensions/sru-export?period_id=${periodId}&format=json`)
      const result = await res.json()
      if (result.error) {
        setError(result.error)
      } else {
        setData(result.data)
      }
    } catch {
      setError('Kunde inte hämta SRU-export')
    } finally {
      setLoading(false)
    }
  }

  const downloadSRU = () => {
    window.open(`/api/extensions/sru-export?period_id=${periodId}&format=sru`, '_blank')
  }

  const formLabel = data?.formType === 'INK2' ? 'INK2 (Aktiebolag)' : 'NE (Enskild firma)'

  return (
    <div className="space-y-4">
      {/* Info card */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">SRU-export</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground mb-4">
            Generera SRU-fil (Standardiserat Räkenskapsutdrag) för elektronisk inlämning
            till Skatteverket. Blanketttyp bestäms automatiskt utifrån företagsform.
          </p>
          <div className="flex gap-2">
            <Button onClick={fetchExport} disabled={loading}>
              {loading ? 'Laddar...' : 'Förhandsgranska'}
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

      {/* Coverage warning */}
      {coverage && coverage.accountsWithoutSRU > 0 && (
        <Card className="border-orange-200 bg-orange-50">
          <CardContent className="py-4">
            <div className="flex items-start gap-2">
              <AlertCircle className="h-5 w-5 text-orange-600 mt-0.5" />
              <div>
                <p className="text-sm text-orange-800">
                  {coverage.accountsWithoutSRU} av {coverage.totalAccounts} konton saknar SRU-kod
                  ({coverage.coveragePercent}% täckning).
                  Konton utan SRU-kod inkluderas inte i exporten.
                </p>
                {coverage.missingAccounts.length <= 5 && (
                  <ul className="text-xs text-orange-700 mt-1 space-y-0.5">
                    {coverage.missingAccounts.map((a) => (
                      <li key={a.accountNumber}>
                        {a.accountNumber} — {a.accountName}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

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

          {/* Company + form info */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>{data.companyName || 'Okänt företag'}</CardTitle>
                <div className="flex gap-2">
                  <Badge className="bg-blue-100 text-blue-800">{formLabel}</Badge>
                  <Badge className="bg-blue-100 text-blue-800">{data.fiscalYear.name}</Badge>
                </div>
              </div>
              {data.orgNumber && (
                <p className="text-sm text-muted-foreground">
                  Org.nr: {data.orgNumber}
                </p>
              )}
            </CardHeader>
          </Card>

          {/* SRU balances table */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">SRU-poster</CardTitle>
            </CardHeader>
            <CardContent>
              {data.balances.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Inga poster med belopp att exportera.
                </p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-muted-foreground">
                      <th className="py-2 w-20">SRU-kod</th>
                      <th className="py-2">Beskrivning</th>
                      <th className="py-2 w-32 text-right">Belopp</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.balances.map((b) => (
                      <SRUBalanceRow key={b.sruCode} balance={b} />
                    ))}
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>
        </>
      )}

      {!data && !loading && !error && (
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">
            Klicka &quot;Förhandsgranska&quot; för att se SRU-uppgifter för valt räkenskapsår.
          </CardContent>
        </Card>
      )}
    </div>
  )
}

function SRUBalanceRow({
  balance,
}: {
  balance: SRUExportResult['balances'][number]
}) {
  const [expanded, setExpanded] = useState(false)

  return (
    <>
      <tr
        className="border-b cursor-pointer hover:bg-muted/50"
        onClick={() => balance.accounts.length > 0 && setExpanded(!expanded)}
      >
        <td className="py-2 font-mono">{balance.sruCode}</td>
        <td className="py-2">
          {balance.description}
          {balance.accounts.length > 0 && (
            <span className="text-xs text-muted-foreground ml-2">
              ({balance.accounts.length} konton)
            </span>
          )}
        </td>
        <td className="py-2 text-right">{formatAmount(balance.amount)} kr</td>
      </tr>
      {expanded && balance.accounts.length > 0 && (
        <tr>
          <td colSpan={3} className="py-2 pl-8 bg-muted/30">
            <table className="w-full text-xs">
              <tbody>
                {balance.accounts.map((acc) => (
                  <tr key={acc.accountNumber}>
                    <td className="py-1 font-mono w-16">{acc.accountNumber}</td>
                    <td className="py-1">{acc.accountName}</td>
                    <td className="py-1 text-right">{formatAmount(acc.amount)} kr</td>
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
