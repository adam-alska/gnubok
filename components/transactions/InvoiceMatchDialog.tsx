'use client'

import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { formatCurrency, formatDate } from '@/lib/utils'
import type { TransactionWithInvoice } from './transaction-types'

interface InvoiceMatchDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  transaction: TransactionWithInvoice | null
  isConfirming: boolean
  onConfirm: () => void
}

export default function InvoiceMatchDialog({
  open,
  onOpenChange,
  transaction,
  isConfirming,
  onConfirm,
}: InvoiceMatchDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Bekräfta fakturamatchning</DialogTitle>
          <DialogDescription>
            Vill du koppla denna transaktion till fakturan? Fakturan kommer att markeras som betald.
          </DialogDescription>
        </DialogHeader>

        {transaction?.potential_invoice && (
          <div className="space-y-4">
            {/* Transaction details */}
            <div className="rounded-lg border p-4 space-y-2">
              <p className="text-sm font-medium text-muted-foreground">Transaktion</p>
              <p className="font-medium">{transaction.description}</p>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">{formatDate(transaction.date)}</span>
                <span className="font-medium text-success">
                  +{formatCurrency(transaction.amount, transaction.currency)}
                </span>
              </div>
            </div>

            {/* Invoice details */}
            <div className="rounded-lg border p-4 space-y-2">
              <p className="text-sm font-medium text-muted-foreground">Faktura</p>
              <p className="font-medium">
                Faktura {transaction.potential_invoice.invoice_number}
              </p>
              <p className="text-sm text-muted-foreground">
                {transaction.potential_invoice.customer?.name || 'Okänd kund'}
              </p>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">
                  Förfaller: {formatDate(transaction.potential_invoice.due_date)}
                </span>
                <span className="font-medium">
                  {formatCurrency(
                    transaction.potential_invoice.total,
                    transaction.potential_invoice.currency
                  )}
                </span>
              </div>
            </div>

            {/* What will happen */}
            <div className="rounded-lg bg-muted/50 p-4 space-y-2">
              <p className="text-sm font-medium">Vid bekräftelse:</p>
              <ul className="text-sm text-muted-foreground space-y-1">
                <li>• Transaktionen kopplas till fakturan</li>
                <li>• Fakturan markeras som betald</li>
                <li>• Bokföringsverifikation skapas automatiskt</li>
              </ul>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isConfirming}
          >
            Avbryt
          </Button>
          <Button
            onClick={onConfirm}
            disabled={isConfirming}
          >
            {isConfirming ? 'Bekräftar...' : 'Bekräfta matchning'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
