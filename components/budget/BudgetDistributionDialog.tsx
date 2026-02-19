'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogDescription, DialogFooter,
} from '@/components/ui/dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  distributeBudgetEvenly,
  distributeBudgetSeasonally,
} from '@/lib/budget/budget-engine'
import {
  MONTH_NAMES_SV,
  DISTRIBUTION_PATTERN_LABELS,
  type DistributionPattern,
} from '@/types/budget-costcenters'
import { Calculator } from 'lucide-react'

interface BudgetDistributionDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  accountNumber: string
  accountName: string
  currentAnnualTotal: number
  onDistribute: (months: number[]) => void
}

function formatSEK(amount: number): string {
  return new Intl.NumberFormat('sv-SE', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(Math.round(amount))
}

export default function BudgetDistributionDialog({
  open,
  onOpenChange,
  accountNumber,
  accountName,
  currentAnnualTotal,
  onDistribute,
}: BudgetDistributionDialogProps) {
  const [annualAmount, setAnnualAmount] = useState(currentAnnualTotal)
  const [pattern, setPattern] = useState<DistributionPattern>('even')
  const [preview, setPreview] = useState<number[]>(distributeBudgetEvenly(currentAnnualTotal))

  function updatePreview(amount: number, pat: DistributionPattern) {
    const months = distributeBudgetSeasonally(amount, pat)
    setPreview(months)
  }

  function handleAmountChange(value: string) {
    const num = parseFloat(value) || 0
    setAnnualAmount(num)
    updatePreview(num, pattern)
  }

  function handlePatternChange(pat: DistributionPattern) {
    setPattern(pat)
    updatePreview(annualAmount, pat)
  }

  function handleApply() {
    onDistribute(preview)
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Calculator className="h-5 w-5" />
            Fördela budget
          </DialogTitle>
          <DialogDescription>
            {accountNumber} - {accountName}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Annual amount */}
          <div className="space-y-2">
            <Label htmlFor="annual-amount">Helarsbelopp (SEK)</Label>
            <Input
              id="annual-amount"
              type="number"
              value={annualAmount}
              onChange={(e) => handleAmountChange(e.target.value)}
              className="font-mono"
            />
          </div>

          {/* Distribution pattern */}
          <div className="space-y-2">
            <Label>Fordelningssatt</Label>
            <Select value={pattern} onValueChange={(v) => handlePatternChange(v as DistributionPattern)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(DISTRIBUTION_PATTERN_LABELS)
                  .filter(([key]) => key !== 'custom')
                  .map(([key, label]) => (
                    <SelectItem key={key} value={key}>{label}</SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>

          {/* Preview */}
          <div className="space-y-2">
            <Label>Forhandsvisning</Label>
            <div className="grid grid-cols-4 gap-2">
              {preview.map((amount, i) => (
                <div key={i} className="text-center">
                  <div className="text-xs text-muted-foreground mb-0.5">
                    {MONTH_NAMES_SV[i]}
                  </div>
                  <div className="text-sm font-mono tabular-nums bg-muted/50 rounded px-2 py-1">
                    {formatSEK(amount)}
                  </div>
                </div>
              ))}
            </div>
            <div className="text-right text-sm font-medium pt-1">
              Summa: {formatSEK(preview.reduce((s, v) => s + v, 0))}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Avbryt
          </Button>
          <Button onClick={handleApply}>
            Tillampa
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
