'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Progress } from '@/components/ui/progress'
import { Paperclip } from 'lucide-react'
import VatTreatmentSelect from './VatTreatmentSelect'
import { EXPENSE_CATEGORIES, INCOME_CATEGORIES } from './transaction-types'
import type { TransactionCategory, VatTreatment } from '@/types'

const expenseCategories = EXPENSE_CATEGORIES
const incomeCategories = INCOME_CATEGORIES

interface BatchCategorySelectorProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  selectedCount: number
  onSelectCategory: (category: TransactionCategory, vatTreatment?: VatTreatment) => void
  progress: { done: number; total: number } | null
}

export default function BatchCategorySelector({
  open,
  onOpenChange,
  selectedCount,
  onSelectCategory,
  progress,
}: BatchCategorySelectorProps) {
  const [vatTreatment, setVatTreatment] = useState<VatTreatment | 'none'>('standard_25')
  const isProcessing = progress !== null

  const handleSelectCategory = (category: TransactionCategory) => {
    const resolvedVat = vatTreatment === 'none' ? undefined : vatTreatment
    onSelectCategory(category, resolvedVat)
  }

  return (
    <Dialog open={open} onOpenChange={isProcessing ? undefined : onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {isProcessing
              ? `Bokför ${progress.done}/${progress.total}...`
              : `Bokför ${selectedCount} transaktioner`}
          </DialogTitle>
          <DialogDescription>
            {isProcessing
              ? 'Vänta medan transaktionerna bokförs'
              : 'Välj en kategori som ska tillämpas på alla valda transaktioner'}
          </DialogDescription>
        </DialogHeader>

        {isProcessing ? (
          <div className="py-4">
            <Progress value={(progress.done / progress.total) * 100} />
            <p className="text-sm text-muted-foreground mt-2 text-center">
              {progress.done} av {progress.total} klara
            </p>
          </div>
        ) : (
          <div className="space-y-4 py-2">
            {/* Underlag reminder */}
            <div className="flex items-start gap-2 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 p-3">
              <Paperclip className="h-4 w-4 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
              <p className="text-xs text-amber-800 dark:text-amber-300">
                Underlag behöver bifogas separat för varje transaktion efter bokföring.
              </p>
            </div>

            <div>
              <h4 className="text-sm font-medium text-muted-foreground mb-2">Momsbehandling</h4>
              <VatTreatmentSelect
                value={vatTreatment}
                onValueChange={setVatTreatment}
              />
            </div>
            <div>
              <h4 className="text-sm font-medium text-muted-foreground mb-2">Kostnader</h4>
              <div className="grid grid-cols-2 gap-1.5">
                {expenseCategories.map((cat) => (
                  <Button
                    key={cat.value}
                    variant="outline"
                    size="sm"
                    className="justify-start text-xs"
                    onClick={() => handleSelectCategory(cat.value)}
                  >
                    {cat.label}
                  </Button>
                ))}
              </div>
            </div>
            <div>
              <h4 className="text-sm font-medium text-muted-foreground mb-2">Intäkter</h4>
              <div className="grid grid-cols-2 gap-1.5">
                {incomeCategories.map((cat) => (
                  <Button
                    key={cat.value}
                    variant="outline"
                    size="sm"
                    className="justify-start text-xs"
                    onClick={() => handleSelectCategory(cat.value)}
                  >
                    {cat.label}
                  </Button>
                ))}
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
