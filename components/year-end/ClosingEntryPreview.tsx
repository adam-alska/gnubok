'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Loader2, AlertTriangle, FileText, ArrowRight, Lock } from 'lucide-react'
import { ResultSummary } from './ResultSummary'
import type { ClosingEntryPreview as ClosingEntryPreviewType, ClosingEntry } from '@/types/year-end'

interface ClosingEntryPreviewProps {
  closingId: string
  onExecuted?: () => void
}

function formatAmount(amount: number): string {
  return amount.toLocaleString('sv-SE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

export function ClosingEntryPreview({
  closingId,
  onExecuted,
}: ClosingEntryPreviewProps) {
  const [preview, setPreview] = useState<ClosingEntryPreviewType | null>(null)
  const [loading, setLoading] = useState(true)
  const [executing, setExecuting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [executeError, setExecuteError] = useState<string | null>(null)
  const [confirmOpen, setConfirmOpen] = useState(false)

  useEffect(() => {
    fetchPreview()
  }, [closingId])

  async function fetchPreview() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/year-end/${closingId}/preview`)
      const result = await res.json()
      if (result.error) {
        setError(result.error)
      } else {
        setPreview(result.data)
      }
    } catch {
      setError('Kunde inte hämta förhandsgranskning')
    } finally {
      setLoading(false)
    }
  }

  async function executeClosing() {
    setExecuting(true)
    setExecuteError(null)
    try {
      const res = await fetch(`/api/year-end/${closingId}/execute`, {
        method: 'POST',
      })
      const result = await res.json()
      if (result.error) {
        setExecuteError(result.error)
      } else {
        setConfirmOpen(false)
        onExecuted?.()
      }
    } catch {
      setExecuteError('Kunde inte genomföra bokslut')
    } finally {
      setExecuting(false)
    }
  }

  if (loading) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto text-muted-foreground" />
          <p className="text-sm text-muted-foreground mt-2">
            Beräknar bokslutsverifikation...
          </p>
        </CardContent>
      </Card>
    )
  }

  if (error || !preview) {
    return (
      <Card>
        <CardContent className="py-8 text-center">
          <AlertTriangle className="h-8 w-8 mx-auto text-destructive mb-2" />
          <p className="text-sm text-destructive">{error || 'Kunde inte ladda data'}</p>
          <Button variant="outline" size="sm" className="mt-3" onClick={fetchPreview}>
            Försök igen
          </Button>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      {/* Result summary */}
      <ResultSummary
        netResult={preview.netResult}
        taxAmount={preview.taxAmount}
        resultAfterTax={preview.resultAfterTax}
      />

      {/* Closing entry preview */}
      <EntryCard
        title="1. Nollställning av resultatkonton"
        description="Alla intäkts- och kostnadskonton (klass 3-8) nollställs"
        entry={preview.closingEntry}
      />

      {/* Tax entry (only for AB) */}
      {preview.taxEntry && (
        <EntryCard
          title="2. Bolagsskatt"
          description={`Beräknad bolagsskatt 20,6% på ${formatAmount(preview.netResult)} kr`}
          entry={preview.taxEntry}
        />
      )}

      {/* Result transfer */}
      {preview.resultTransferEntry.lines.length > 0 && (
        <EntryCard
          title={preview.taxEntry ? '3. Överföring till eget kapital' : '2. Överföring till eget kapital'}
          description="Årets resultat överförs från konto 8999 till konto 2099"
          entry={preview.resultTransferEntry}
        />
      )}

      {/* Execute button */}
      <Card className="border-2 border-primary/20">
        <CardContent className="py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Lock className="h-5 w-5 text-primary" />
              <div>
                <p className="font-medium">Genomför bokslut</p>
                <p className="text-xs text-muted-foreground">
                  Bokför verifikationerna ovan och lås räkenskapsåret
                </p>
              </div>
            </div>

            <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
              <DialogTrigger asChild>
                <Button size="lg">
                  <Lock className="h-4 w-4 mr-2" />
                  Genomför bokslut
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Bekräfta bokslut</DialogTitle>
                  <DialogDescription>
                    Är du säker på att du vill genomföra bokslutet? Följande sker:
                  </DialogDescription>
                </DialogHeader>

                <div className="space-y-3 py-4">
                  <div className="flex items-start gap-2">
                    <FileText className="h-4 w-4 mt-0.5 text-primary" />
                    <div className="text-sm">
                      <p className="font-medium">Bokslutsverifikationer skapas</p>
                      <p className="text-muted-foreground">
                        Alla intäkts- och kostnadskonton nollställs
                      </p>
                    </div>
                  </div>
                  <div className="flex items-start gap-2">
                    <ArrowRight className="h-4 w-4 mt-0.5 text-primary" />
                    <div className="text-sm">
                      <p className="font-medium">Resultat överförs</p>
                      <p className="text-muted-foreground">
                        {formatAmount(preview.resultAfterTax)} kr överförs till konto 2099
                      </p>
                    </div>
                  </div>
                  <div className="flex items-start gap-2">
                    <Lock className="h-4 w-4 mt-0.5 text-orange-500" />
                    <div className="text-sm">
                      <p className="font-medium">Räkenskapsåret låses</p>
                      <p className="text-muted-foreground">
                        Inga nya verifikationer kan bokföras i denna period
                      </p>
                    </div>
                  </div>
                </div>

                {executeError && (
                  <div className="bg-destructive/10 text-destructive text-sm p-3 rounded-lg">
                    {executeError}
                  </div>
                )}

                <DialogFooter>
                  <Button variant="outline" onClick={() => setConfirmOpen(false)}>
                    Avbryt
                  </Button>
                  <Button onClick={executeClosing} disabled={executing}>
                    {executing ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Genomför...
                      </>
                    ) : (
                      <>
                        <Lock className="h-4 w-4 mr-2" />
                        Ja, genomför bokslut
                      </>
                    )}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

function EntryCard({
  title,
  description,
  entry,
}: {
  title: string
  description: string
  entry: ClosingEntry
}) {
  const totalDebit = entry.lines.reduce((s, l) => s + l.debit, 0)
  const totalCredit = entry.lines.reduce((s, l) => s + l.credit, 0)

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base">{title}</CardTitle>
            <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
          </div>
          <Badge variant="outline">{entry.lines.length} rader</Badge>
        </div>
      </CardHeader>
      <CardContent>
        <div className="max-h-[300px] overflow-y-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-muted-foreground">
                <th className="py-1.5 w-16">Konto</th>
                <th className="py-1.5">Beskrivning</th>
                <th className="py-1.5 w-24 text-right">Debet</th>
                <th className="py-1.5 w-24 text-right">Kredit</th>
              </tr>
            </thead>
            <tbody>
              {entry.lines.map((line, idx) => (
                <tr key={idx} className="border-b last:border-0">
                  <td className="py-1.5 font-mono text-xs">{line.account}</td>
                  <td className="py-1.5 text-xs">{line.accountName || ''}</td>
                  <td className="py-1.5 text-right text-xs">
                    {line.debit > 0 ? formatAmount(line.debit) : ''}
                  </td>
                  <td className="py-1.5 text-right text-xs">
                    {line.credit > 0 ? formatAmount(line.credit) : ''}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="font-semibold border-t-2 text-xs">
                <td colSpan={2} className="py-2">Summa</td>
                <td className="py-2 text-right">{formatAmount(totalDebit)}</td>
                <td className="py-2 text-right">{formatAmount(totalCredit)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </CardContent>
    </Card>
  )
}
