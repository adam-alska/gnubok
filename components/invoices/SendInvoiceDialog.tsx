'use client'

import { useState, useEffect, useMemo } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/use-toast'
import { JournalEntryReviewContent } from '@/components/bookkeeping/JournalEntryReviewContent'
import { proposeSendLines } from '@/lib/bookkeeping/propose-send-lines'
import { formatCurrency } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
import { CheckCircle2, Loader2, Mail, Send } from 'lucide-react'
import type { Invoice, InvoiceItem, Customer, EntityType } from '@/types'

interface InvoiceWithRelations extends Invoice {
  customer: Customer
  items: InvoiceItem[]
}

interface SendInvoiceDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  invoice: InvoiceWithRelations
  /** 'email' sends via email, 'manual' marks as sent without email */
  mode: 'email' | 'manual'
  onSuccess: () => void
}

export default function SendInvoiceDialog({
  open,
  onOpenChange,
  invoice,
  mode,
  onSuccess,
}: SendInvoiceDialogProps) {
  const { toast } = useToast()
  const supabase = createClient()

  const [isSubmitting, setIsSubmitting] = useState(false)
  const [sentMessage, setSentMessage] = useState<string | null>(null)
  const [accountingMethod, setAccountingMethod] = useState<'accrual' | 'cash'>('accrual')
  const [entityType, setEntityType] = useState<EntityType>('enskild_firma')
  const [periodName, setPeriodName] = useState('')
  const [isInitialized, setIsInitialized] = useState(false)

  }, [open, invoice.id, invoice.invoice_date])

  const proposedLines = useMemo(() => {
    if (!isInitialized || accountingMethod !== 'accrual') return []

    return proposeSendLines({
      invoice: {
        invoice_number: invoice.invoice_number,
        total: invoice.total,
        total_sek: invoice.total_sek,
        subtotal: invoice.subtotal,
        subtotal_sek: invoice.subtotal_sek,
        vat_amount: invoice.vat_amount,
        vat_amount_sek: invoice.vat_amount_sek,
        currency: invoice.currency,
        exchange_rate: invoice.exchange_rate,
        vat_treatment: invoice.vat_treatment,
        items: invoice.items,
      },
      entityType,
    })
  }, [isInitialized, accountingMethod, entityType, invoice])

  const { totalDebit, totalCredit } = useMemo(() => {
    let totalDebit = 0
    let totalCredit = 0
    for (const line of proposedLines) {
      totalDebit += parseFloat(line.debit_amount) || 0
      totalCredit += parseFloat(line.credit_amount) || 0
    }
    return { totalDebit, totalCredit }
  }, [proposedLines])

  const handleConfirm = async () => {
    setIsSubmitting(true)

    try {
      const url = mode === 'email'
        ? `/api/invoices/${invoice.id}/send`
        : `/api/invoices/${invoice.id}/mark-sent`

      const response = await fetch(url, { method: 'POST' })
      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Kunde inte skicka fakturan')
      }

      onSuccess()

      if (mode === 'email') {
        setSentMessage(data.message || `Fakturan har skickats till ${invoice.customer.email}`)
      } else {
        // For manual send, just close — no email to confirm
        onOpenChange(false)
        toast({
          title: 'Faktura markerad som skickad',
          description: accountingMethod === 'accrual'
            ? 'Bokföringsverifikationen har skapats.'
            : undefined,
        })
      }
    } catch (error) {
      toast({
        title: 'Kunde inte skicka faktura',
        description: error instanceof Error ? error.message : 'Försök igen.',
        variant: 'destructive',
      })
    }

    setIsSubmitting(false)
  }

  const handleClose = () => {
    onOpenChange(false)
  }

  const showJournalPreview = accountingMethod === 'accrual' && proposedLines.length > 0

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>
            {mode === 'email' ? 'Skicka faktura' : 'Markera som skickad'} — {invoice.invoice_number}
          </DialogTitle>
          <DialogDescription>
            {formatCurrency(invoice.total, invoice.currency)}
            {invoice.currency !== 'SEK' && invoice.total_sek && (
              <> ({formatCurrency(invoice.total_sek)} SEK)</>
            )}
            {mode === 'email' && invoice.customer.email && (
              <> till {invoice.customer.email}</>
            )}
          </DialogDescription>
        </DialogHeader>

        {sentMessage ? (
          <div className="flex items-start gap-3 rounded-lg border border-success/30 bg-success/5 p-4">
            <CheckCircle2 className="h-5 w-5 text-success shrink-0 mt-0.5" />
            <div className="space-y-1 text-sm">
              <p className="font-medium">E-post skickad</p>
              <p className="text-muted-foreground">{sentMessage}</p>
              {accountingMethod === 'accrual' && (
                <p className="text-muted-foreground">Bokföringsverifikationen har skapats.</p>
              )}
            </div>
          </div>
        ) : !isInitialized ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-4">
            {showJournalPreview ? (
              <>
                <p className="text-sm text-muted-foreground">
                  Följande bokföringsverifikation skapas automatiskt:
                </p>
                <JournalEntryReviewContent
                  periodName={periodName}
                  entryDate={invoice.invoice_date}
                  description={`Försäljning faktura ${invoice.invoice_number}${invoice.customer.name ? `, ${invoice.customer.name}` : ''}`}
                  lines={proposedLines}
                  totalDebit={totalDebit}
                  totalCredit={totalCredit}
                  showBalanceBadge={true}
                  hideDate={!periodName}
                />
              </>
            ) : (
              <p className="text-sm text-muted-foreground">
                {accountingMethod === 'cash'
                  ? 'Kontantmetoden — bokföring sker vid betalning, inte vid fakturering.'
                  : mode === 'email'
                    ? `Fakturan skickas till ${invoice.customer.email}.`
                    : 'Fakturan markeras som skickad.'}
              </p>
            )}
          </div>
        )}

        <DialogFooter>
          {sentMessage ? (
            <Button
              onClick={handleClose}
              className="w-full sm:w-auto min-h-11"
            >
              Stäng
            </Button>
          ) : (
            <>
              <Button
                variant="outline"
                onClick={handleClose}
                disabled={isSubmitting}
                className="w-full sm:w-auto min-h-11"
              >
                Avbryt
              </Button>
              <Button
                onClick={handleConfirm}
                disabled={isSubmitting || !isInitialized}
                className="w-full sm:w-auto min-h-11"
              >
                {isSubmitting ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : mode === 'email' ? (
                  <Mail className="mr-2 h-4 w-4" />
                ) : (
                  <Send className="mr-2 h-4 w-4" />
                )}
                {mode === 'email' ? 'Skicka faktura' : 'Markera som skickad'}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
