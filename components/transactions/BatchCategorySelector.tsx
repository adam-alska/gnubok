'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Progress } from '@/components/ui/progress'
import type { TransactionCategory } from '@/types'

const expenseCategories: { value: TransactionCategory; label: string }[] = [
  { value: 'expense_equipment', label: 'Utrustning' },
  { value: 'expense_software', label: 'Programvara' },
  { value: 'expense_travel', label: 'Resor' },
  { value: 'expense_office', label: 'Kontor' },
  { value: 'expense_marketing', label: 'Marknadsföring' },
  { value: 'expense_professional_services', label: 'Konsulter' },
  { value: 'expense_education', label: 'Utbildning' },
  { value: 'expense_bank_fees', label: 'Bankavgift' },
  { value: 'expense_card_fees', label: 'Kortavgift' },
  { value: 'expense_currency_exchange', label: 'Valutaväxling' },
  { value: 'expense_other', label: 'Övrigt' },
]

const incomeCategories: { value: TransactionCategory; label: string }[] = [
  { value: 'income_services', label: 'Tjänster' },
  { value: 'income_products', label: 'Produkter' },
  { value: 'income_other', label: 'Övrigt' },
]

interface BatchCategorySelectorProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  selectedCount: number
  onSelectCategory: (category: TransactionCategory) => void
  progress: { done: number; total: number } | null
}

export default function BatchCategorySelector({
  open,
  onOpenChange,
  selectedCount,
  onSelectCategory,
  progress,
}: BatchCategorySelectorProps) {
  const isProcessing = progress !== null

  return (
    <Dialog open={open} onOpenChange={isProcessing ? undefined : onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {isProcessing
              ? `Kategoriserar ${progress.done}/${progress.total}...`
              : `Kategorisera ${selectedCount} transaktioner`}
          </DialogTitle>
          <DialogDescription>
            {isProcessing
              ? 'Vänta medan transaktionerna kategoriseras'
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
            <div>
              <h4 className="text-sm font-medium text-muted-foreground mb-2">Kostnader</h4>
              <div className="grid grid-cols-2 gap-1.5">
                {expenseCategories.map((cat) => (
                  <Button
                    key={cat.value}
                    variant="outline"
                    size="sm"
                    className="justify-start text-xs"
                    onClick={() => onSelectCategory(cat.value)}
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
                    onClick={() => onSelectCategory(cat.value)}
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
