'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Loader2, ArrowRightLeft, CheckCircle2, AlertCircle } from 'lucide-react'
import type { OpeningBalancePreview } from '@/types/year-end'

interface OpeningBalancesSectionProps {
  closingId: string
  isCompleted: boolean
  onCreated?: () => void
}

function formatAmount(amount: number): string {
  return amount.toLocaleString('sv-SE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

export function OpeningBalancesSection({
  closingId,
  isCompleted,
  onCreated,
}: OpeningBalancesSectionProps) {
  const [preview, setPreview] = useState<OpeningBalancePreview | null>(null)
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [created, setCreated] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmOpen, setConfirmOpen] = useState(false)

  useEffect(() => {
    fetchPreview()
  }, [closingId])

  async function fetchPreview() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/year-end/${closingId}/opening-balances`)
      const result = await res.json()
      if (result.error) {
        setError(result.error)
      } else {
        setPreview(result.data)
      }
    } catch {
      setError('Kunde inte beräkna ingående balanser')
    } finally {
      setLoading(false)
    }
  }

  async function createOpeningBalances() {
    setCreating(true)
    setError(null)
    try {
      const res = await fetch(`/api/year-end/${closingId}/opening-balances`, {
        method: 'POST',
      })
      const result = await res.json()
      if (result.error) {
        setError(result.error)
      } else {
        setCreated(true)
        setConfirmOpen(false)
        onCreated?.()
      }
    } catch {
      setError('Kunde inte skapa ingående balanser')
    } finally {
      setCreating(false)
    }
  }

  if (loading) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto text-muted-foreground" />
          <p className="text-sm text-muted-foreground mt-2">
            Beräknar ingående balanser...
          </p>
        </CardContent>
      </Card>
    )
  }

  if (created) {
    return (
      <Card className="border-2 border-green-200">
        <CardContent className="py-12 text-center">
          <CheckCircle2 className="h-16 w-16 text-green-500 mx-auto mb-3" />
          <h3 className="text-xl font-bold text-green-700 mb-1">
            Ingående balanser skapade
          </h3>
          <p className="text-sm text-muted-foreground">
            Nästa räkenskapsår är redo att användas med korrekta ingående balanser.
          </p>
        </CardContent>
      </Card>
    )
  }

  if (error && !preview) {
    return (
      <Card>
        <CardContent className="py-8 text-center">
          <AlertCircle className="h-8 w-8 text-destructive mx-auto mb-2" />
          <p className="text-sm text-destructive">{error}</p>
          <Button variant="outline" size="sm" className="mt-3" onClick={fetchPreview}>
            Försök igen
          </Button>
        </CardContent>
      </Card>
    )
  }

  if (!preview || preview.entries.length === 0) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground">
          <p>Inga balanser att överföra till nästa räkenskapsår.</p>
          <p className="text-xs mt-1">
            Genomför bokslutet först för att se ingående balanser.
          </p>
        </CardContent>
      </Card>
    )
  }

  const isBalanced =
    Math.abs(preview.totalDebit - preview.totalCredit) < 0.01

  return (
    <div className="space-y-4">
      {/* Balance check */}
      <Card className={`border-2 ${isBalanced ? 'border-green-200' : 'border-red-200'}`}>
        <CardContent className="py-6">
          <div className="text-center">
            {isBalanced ? (
              <CheckCircle2 className="h-10 w-10 text-green-500 mx-auto mb-2" />
            ) : (
              <AlertCircle className="h-10 w-10 text-red-500 mx-auto mb-2" />
            )}
            <h3 className="text-lg font-bold">
              {isBalanced ? 'Ingående balanser stämmer' : 'Ej i balans'}
            </h3>
          </div>
          <div className="grid grid-cols-2 gap-4 mt-4">
            <div className="text-center">
              <p className="text-xs text-muted-foreground">Summa debet</p>
              <p className="text-lg font-semibold">
                {formatAmount(preview.totalDebit)} kr
              </p>
            </div>
            <div className="text-center">
              <p className="text-xs text-muted-foreground">Summa kredit</p>
              <p className="text-lg font-semibold">
                {formatAmount(preview.totalCredit)} kr
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Entries table */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg">Ingående balanser för nästa år</CardTitle>
            <Badge variant="outline">{preview.entries.length} konton</Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className="max-h-[400px] overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-card">
                <tr className="border-b text-left text-xs text-muted-foreground">
                  <th className="py-2 w-16">Konto</th>
                  <th className="py-2">Namn</th>
                  <th className="py-2 w-28 text-right">Debet</th>
                  <th className="py-2 w-28 text-right">Kredit</th>
                </tr>
              </thead>
              <tbody>
                {preview.entries.map((entry, idx) => (
                  <tr key={idx} className="border-b last:border-0">
                    <td className="py-1.5 font-mono text-xs">{entry.account}</td>
                    <td className="py-1.5 text-xs">{entry.accountName || ''}</td>
                    <td className="py-1.5 text-right text-xs">
                      {entry.debit > 0 ? formatAmount(entry.debit) : ''}
                    </td>
                    <td className="py-1.5 text-right text-xs">
                      {entry.credit > 0 ? formatAmount(entry.credit) : ''}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="font-semibold border-t-2 text-xs">
                  <td colSpan={2} className="py-2">
                    Summa
                  </td>
                  <td className="py-2 text-right">
                    {formatAmount(preview.totalDebit)}
                  </td>
                  <td className="py-2 text-right">
                    {formatAmount(preview.totalCredit)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Create button */}
      {isCompleted && (
        <Card className="border-2 border-primary/20">
          <CardContent className="py-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <ArrowRightLeft className="h-5 w-5 text-primary" />
                <div>
                  <p className="font-medium">Skapa ingående balanser</p>
                  <p className="text-xs text-muted-foreground">
                    Skapar verifikation med ingående balanser i nästa räkenskapsår
                  </p>
                </div>
              </div>

              <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
                <DialogTrigger asChild>
                  <Button size="lg">
                    <ArrowRightLeft className="h-4 w-4 mr-2" />
                    Skapa ingående balanser
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Bekräfta ingående balanser</DialogTitle>
                    <DialogDescription>
                      Följande sker när du skapar ingående balanser:
                    </DialogDescription>
                  </DialogHeader>

                  <div className="space-y-3 py-4 text-sm">
                    <p>
                      Ett nytt räkenskapsår skapas (om det inte redan finns) och
                      en verifikation med ingående balanser bokförs.
                    </p>
                    <p>
                      <strong>{preview.entries.length} konton</strong> överförs
                      med ett totalt belopp på{' '}
                      <strong>{formatAmount(preview.totalDebit)} kr</strong>.
                    </p>
                  </div>

                  {error && (
                    <div className="bg-destructive/10 text-destructive text-sm p-3 rounded-lg">
                      {error}
                    </div>
                  )}

                  <DialogFooter>
                    <Button
                      variant="outline"
                      onClick={() => setConfirmOpen(false)}
                    >
                      Avbryt
                    </Button>
                    <Button onClick={createOpeningBalances} disabled={creating}>
                      {creating ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          Skapar...
                        </>
                      ) : (
                        'Ja, skapa ingående balanser'
                      )}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
          </CardContent>
        </Card>
      )}

      {!isCompleted && (
        <Card className="bg-orange-50/50 dark:bg-orange-950/20 border-orange-200">
          <CardContent className="py-4">
            <p className="text-sm text-orange-800 dark:text-orange-300">
              Du måste genomföra bokslutet (steg 4) innan du kan skapa ingående balanser.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
