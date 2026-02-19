'use client'

import { useState, useMemo } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Card, CardContent } from '@/components/ui/card'
import { useToast } from '@/components/ui/use-toast'
import { formatCurrency } from '@/lib/utils'
import { Loader2, AlertTriangle, ArrowRight } from 'lucide-react'
import type { Asset, DisposalType } from '@/types/fixed-assets'
import { DISPOSAL_TYPE_LABELS } from '@/types/fixed-assets'

interface DisposalDialogProps {
  asset: Asset
  currentBookValue: number
  accumulatedDepreciation: number
  onDisposed: () => void
  trigger?: React.ReactNode
}

export function DisposalDialog({
  asset,
  currentBookValue,
  accumulatedDepreciation,
  onDisposed,
  trigger,
}: DisposalDialogProps) {
  const [open, setOpen] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const { toast } = useToast()

  const [disposalType, setDisposalType] = useState<DisposalType>('sold')
  const [disposalDate, setDisposalDate] = useState(
    new Date().toISOString().split('T')[0]
  )
  const [disposalAmount, setDisposalAmount] = useState('')

  const preview = useMemo(() => {
    const amount = parseFloat(disposalAmount) || 0
    const gainLoss = amount - currentBookValue

    const lines: Array<{
      account: string
      description: string
      debit: number
      credit: number
    }> = []

    if (disposalType === 'sold') {
      if (amount > 0) {
        lines.push({
          account: '1930',
          description: 'Foretagskonto/bank',
          debit: amount,
          credit: 0,
        })
      }
      if (accumulatedDepreciation > 0) {
        lines.push({
          account: (asset.category as { depreciation_account?: string })?.depreciation_account || '1219',
          description: 'Ackumulerad avskrivning',
          debit: accumulatedDepreciation,
          credit: 0,
        })
      }
      lines.push({
        account: (asset.category as { asset_account?: string })?.asset_account || '1210',
        description: 'Tillgangskonto',
        debit: 0,
        credit: Number(asset.acquisition_cost),
      })
      if (gainLoss > 0) {
        lines.push({
          account: '7970',
          description: 'Vinst vid avyttring',
          debit: 0,
          credit: gainLoss,
        })
      } else if (gainLoss < 0) {
        lines.push({
          account: '7970',
          description: 'Forlust vid avyttring',
          debit: Math.abs(gainLoss),
          credit: 0,
        })
      }
    } else {
      // Scrapped or written off
      if (accumulatedDepreciation > 0) {
        lines.push({
          account: (asset.category as { depreciation_account?: string })?.depreciation_account || '1219',
          description: 'Ackumulerad avskrivning',
          debit: accumulatedDepreciation,
          credit: 0,
        })
      }
      if (currentBookValue > 0) {
        lines.push({
          account: '7970',
          description: 'Forlust vid utrangering',
          debit: currentBookValue,
          credit: 0,
        })
      }
      lines.push({
        account: (asset.category as { asset_account?: string })?.asset_account || '1210',
        description: 'Tillgangskonto',
        debit: 0,
        credit: Number(asset.acquisition_cost),
      })
    }

    return { lines, gainLoss }
  }, [disposalType, disposalAmount, currentBookValue, accumulatedDepreciation, asset])

  async function handleSubmit() {
    setIsSubmitting(true)

    try {
      const res = await fetch(`/api/assets/${asset.id}/dispose`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          disposal_date: disposalDate,
          disposal_amount: parseFloat(disposalAmount) || 0,
          disposal_type: disposalType,
        }),
      })

      const json = await res.json()

      if (!res.ok) {
        throw new Error(json.error || 'Kunde inte avyttra tillgangen')
      }

      toast({
        title: 'Tillgang avyttrad',
        description: `${asset.name} har ${disposalType === 'sold' ? 'salts' : 'utrangerats'}. Verifikation skapad.`,
      })

      setOpen(false)
      onDisposed()
    } catch (err) {
      toast({
        title: 'Fel',
        description: err instanceof Error ? err.message : 'Ett fel uppstod',
        variant: 'destructive',
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger || (
          <Button variant="destructive" size="sm">
            Avyttra tillgang
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Avyttra tillgang</DialogTitle>
          <DialogDescription>
            {asset.name} ({asset.asset_number}) - Bokfort varde: {formatCurrency(currentBookValue)}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Typ av avyttring</Label>
              <Select
                value={disposalType}
                onValueChange={(v) => setDisposalType(v as DisposalType)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(DISPOSAL_TYPE_LABELS) as DisposalType[]).map((t) => (
                    <SelectItem key={t} value={t}>
                      {DISPOSAL_TYPE_LABELS[t]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Datum</Label>
              <Input
                type="date"
                value={disposalDate}
                onChange={(e) => setDisposalDate(e.target.value)}
              />
            </div>
          </div>

          {disposalType === 'sold' && (
            <div className="space-y-2">
              <Label>Forsaljningsbelopp (SEK)</Label>
              <Input
                type="number"
                step="0.01"
                min="0"
                value={disposalAmount}
                onChange={(e) => setDisposalAmount(e.target.value)}
                placeholder="0.00"
              />
            </div>
          )}

          {/* Journal entry preview */}
          <Card>
            <CardContent className="pt-4">
              <p className="text-sm font-medium mb-3">Forhandsvisning av verifikation:</p>
              <div className="space-y-2">
                {preview.lines.map((line, i) => (
                  <div key={i} className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-muted-foreground">{line.account}</span>
                      <span>{line.description}</span>
                    </div>
                    <div className="flex gap-4 tabular-nums">
                      <span className={line.debit > 0 ? 'font-medium' : 'text-muted-foreground'}>
                        {line.debit > 0 ? formatCurrency(line.debit) : '-'}
                      </span>
                      <span className={line.credit > 0 ? 'font-medium' : 'text-muted-foreground'}>
                        {line.credit > 0 ? formatCurrency(line.credit) : '-'}
                      </span>
                    </div>
                  </div>
                ))}
              </div>

              {disposalType === 'sold' && (
                <div className="mt-3 pt-3 border-t flex items-center gap-2 text-sm">
                  <ArrowRight className="h-4 w-4" />
                  <span>
                    {preview.gainLoss >= 0
                      ? `Vinst vid forsaljning: ${formatCurrency(preview.gainLoss)}`
                      : `Forlust vid forsaljning: ${formatCurrency(Math.abs(preview.gainLoss))}`}
                  </span>
                </div>
              )}
            </CardContent>
          </Card>

          <div className="flex items-center gap-2 rounded-lg bg-warning/10 p-3 text-sm">
            <AlertTriangle className="h-4 w-4 text-warning-foreground shrink-0" />
            <span className="text-warning-foreground">
              Denna åtgärd kan inte ångras. En verifikation skapas automatiskt.
            </span>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Avbryt
          </Button>
          <Button
            variant="destructive"
            onClick={handleSubmit}
            disabled={isSubmitting}
          >
            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Bekräfta avyttring
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
