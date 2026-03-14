'use client'

import { useState, useEffect, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { useToast } from '@/components/ui/use-toast'
import { formatCurrency, formatDate } from '@/lib/utils'
import { ArrowUpRight, ArrowDownRight, Check, Paperclip, ChevronDown, ChevronUp, AlertTriangle } from 'lucide-react'
import { getDefaultAccountForCategory } from '@/lib/bookkeeping/category-mapping'
import type { BookingTemplate } from '@/lib/bookkeeping/booking-templates'
import JournalEntryPreview from './JournalEntryPreview'
import AccountCombobox from '@/components/bookkeeping/AccountCombobox'
import DocumentUploadZone from '@/components/bookkeeping/DocumentUploadZone'
import type { UploadedFile } from '@/components/bookkeeping/DocumentUploadZone'
import VatTreatmentSelect from './VatTreatmentSelect'
import { VAT_TREATMENT_OPTIONS } from './transaction-types'
import type { TransactionWithInvoice } from './transaction-types'
import type { TransactionCategory, VatTreatment, BASAccount, EntityType } from '@/types'

interface QuickReviewDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  transaction: TransactionWithInvoice | null
  category: TransactionCategory | null
  categoryLabel: string
  defaultAccount: string
  defaultVat: VatTreatment | 'none'
  entityType?: EntityType
  template?: BookingTemplate | null
  templateId?: string
  onConfirm: (
    id: string,
    category: TransactionCategory,
    vatTreatment: VatTreatment | undefined,
    accountOverride: string | undefined,
    templateId?: string
  ) => Promise<string | null>
  onChangeTemplate?: () => void
}

export default function QuickReviewDialog({
  open,
  onOpenChange,
  transaction,
  category,
  categoryLabel,
  defaultAccount,
  defaultVat,
  entityType,
  template,
  templateId,
  onConfirm,
  onChangeTemplate,
}: QuickReviewDialogProps) {
  const { toast } = useToast()
  const [accountOverride, setAccountOverride] = useState(defaultAccount)
  const [vatTreatment, setVatTreatment] = useState<VatTreatment | 'none'>(defaultVat)
  const [accounts, setAccounts] = useState<BASAccount[]>([])
  const [isProcessing, setIsProcessing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([])
  const [showUploadZone, setShowUploadZone] = useState(false)
  const [showVatDropdown, setShowVatDropdown] = useState(false)

  // Handle account changes — clear VAT for liability/equity accounts (class 2)
  const handleAccountChange = useCallback((account: string) => {
    setAccountOverride(account)
    if (account.startsWith('2')) {
      setVatTreatment('none')
    }
  }, [])

  // Fetch accounts on mount
  useEffect(() => {
    async function fetchAccounts() {
      try {
        const res = await fetch('/api/bookkeeping/accounts')
        const data = await res.json()
        if (data.accounts) {
          setAccounts(data.accounts)
        }
      } catch {
        // Non-critical
      }
    }
    fetchAccounts()
  }, [])

  if (!transaction || !category) return null

  const isIncome = transaction.amount > 0
  const isLiabilityAccount = accountOverride.startsWith('2')

  async function handleConfirm() {
    if (!category || !transaction) return

    setIsProcessing(true)
    setError(null)
    try {
      const resolvedVat = vatTreatment === 'none' ? undefined : vatTreatment
      const catDefault = getDefaultAccountForCategory(category)
      const override = accountOverride && accountOverride !== catDefault
        ? accountOverride
        : undefined

      const journalEntryId = await onConfirm(transaction.id, category, resolvedVat, override, templateId)

      // Link uploaded documents to the journal entry
      if (journalEntryId && uploadedFiles.length > 0) {
        const filesToLink = uploadedFiles.filter((f) => f.status === 'uploaded' && f.id)
        let linkFailCount = 0
        for (const file of filesToLink) {
          try {
            await fetch(`/api/documents/${file.id}/link`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ journal_entry_id: journalEntryId }),
            })
          } catch {
            linkFailCount++
          }
        }
        if (linkFailCount > 0) {
          toast({
            title: 'Underlag kunde inte bifogas',
            description: `${linkFailCount} fil(er) kunde inte länkas till verifikationen.`,
            variant: 'destructive',
          })
        }
      }

      setUploadedFiles([])
      setShowUploadZone(false)
    } catch {
      setError('Ett fel uppstod vid bokföring.')
      setIsProcessing(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={isProcessing ? undefined : (o) => {
      if (!o) {
        setUploadedFiles([])
        setShowUploadZone(false)
      }
      onOpenChange(o)
    }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Granska bokföring</DialogTitle>
          <DialogDescription>
            Kontrollera konto och moms innan du bokför
          </DialogDescription>
        </DialogHeader>

        {/* Transaction summary */}
        <div className="flex items-center gap-3 rounded-lg border p-3">
          <div
            className={`h-9 w-9 rounded-full flex items-center justify-center flex-shrink-0 ${isIncome ? 'bg-success/10 text-success' : 'bg-destructive/10 text-destructive'}`}
          >
            {isIncome ? (
              <ArrowUpRight className="h-4 w-4" />
            ) : (
              <ArrowDownRight className="h-4 w-4" />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-medium text-sm truncate">{transaction.description}</p>
            <p className="text-xs text-muted-foreground">{formatDate(transaction.date)}</p>
          </div>
          <p className={`font-medium text-sm flex-shrink-0 ${isIncome ? 'text-success' : ''}`}>
            {isIncome ? '+' : ''}
            {formatCurrency(transaction.amount, transaction.currency)}
          </p>
        </div>

        {/* Template or Category */}
        <div>
          <label className="text-sm font-medium text-muted-foreground">
            {template ? 'Mall' : 'Kategori'}
          </label>
          <div className="mt-1 flex items-center gap-2">
            <Badge variant="outline" className="text-sm py-1 px-3">
              {template ? template.name_sv : categoryLabel}
            </Badge>
            {onChangeTemplate && (
              <button
                type="button"
                className="text-xs text-primary hover:underline"
                onClick={onChangeTemplate}
              >
                Byt mall
              </button>
            )}
          </div>
        </div>

        {/* Template special rules */}
        {template?.special_rules_sv && (
          <div className="rounded-lg border border-warning/30 bg-warning/[0.03] px-3 py-2">
            <p className="text-xs text-warning-foreground leading-snug">
              {template.special_rules_sv}
            </p>
          </div>
        )}

        {/* Deductibility note */}
        {template?.deductibility_note_sv && (
          <div className="rounded-lg border border-primary/20 bg-primary/[0.03] px-3 py-2">
            <p className="text-xs text-foreground leading-snug">
              {template.deductibility_note_sv}
            </p>
          </div>
        )}

        {/* Reverse charge warning */}
        {template?.requires_vat_registration_data && (
          <div className="rounded-lg border border-warning/30 bg-warning/[0.03] px-3 py-2">
            <div className="flex items-start gap-2">
              <AlertTriangle className="h-3.5 w-3.5 text-warning-foreground flex-shrink-0 mt-0.5" />
              <p className="text-xs text-warning-foreground leading-snug">
                Omvänd skattskyldighet kräver leverantörens momsregistreringsnummer och land.
              </p>
            </div>
          </div>
        )}

        {/* Journal entry preview */}
        <JournalEntryPreview
          amount={transaction.amount}
          currency={transaction.currency}
          category={category}
          vatTreatment={isLiabilityAccount ? 'none' : vatTreatment}
          accountOverride={accountOverride}
          entityType={entityType}
        />

        {/* Account */}
        <div>
          <label className="text-sm font-medium text-muted-foreground">Konto</label>
          <div className="mt-1">
            <AccountCombobox
              value={accountOverride}
              accounts={accounts}
              onChange={handleAccountChange}
            />
          </div>
        </div>

        {/* VAT treatment */}
        <div>
          <label className="text-sm font-medium text-muted-foreground">Momsbehandling</label>
          <div className="mt-1">
            {isLiabilityAccount ? (
              <p className="text-sm text-muted-foreground">
                Ingen moms för skuld-/eget kapital-konton
              </p>
            ) : showVatDropdown ? (
              <VatTreatmentSelect
                value={vatTreatment}
                onValueChange={setVatTreatment}
              />
            ) : (
              <p className="text-sm">
                {VAT_TREATMENT_OPTIONS.find(o => o.value === vatTreatment)?.label || 'Ingen moms'}
                {' '}
                <button
                  type="button"
                  className="text-xs text-primary hover:underline"
                  onClick={() => setShowVatDropdown(true)}
                >
                  Ändra
                </button>
              </p>
            )}
          </div>
        </div>

        {/* Document upload */}
        <div className="rounded-lg border">
          <button
            type="button"
            onClick={() => setShowUploadZone(!showUploadZone)}
            className="flex items-center justify-between w-full px-3 py-2.5 text-sm hover:bg-muted/50 transition-colors"
          >
            <div className="flex items-center gap-2">
              <Paperclip className="h-4 w-4 text-muted-foreground" />
              <span className="font-medium">Underlag</span>
              {uploadedFiles.filter((f) => f.status === 'uploaded').length > 0 && (
                <span className="text-xs text-muted-foreground">
                  {uploadedFiles.filter((f) => f.status === 'uploaded').length} bifogade
                </span>
              )}
            </div>
            {showUploadZone ? (
              <ChevronUp className="h-4 w-4 text-muted-foreground" />
            ) : (
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            )}
          </button>
          {showUploadZone && (
            <div className="px-3 pb-3">
              <DocumentUploadZone
                files={uploadedFiles}
                onFilesChange={setUploadedFiles}
                compact
              />
            </div>
          )}
        </div>

        {error && (
          <div className="p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
            {error}
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-2 pt-2">
          <Button
            variant="outline"
            className="flex-1"
            onClick={() => onOpenChange(false)}
            disabled={isProcessing}
          >
            Avbryt
          </Button>
          <Button
            className="flex-1"
            onClick={handleConfirm}
            disabled={isProcessing || !accountOverride}
          >
            <Check className="mr-2 h-4 w-4" />
            {isProcessing ? 'Bokför...' : 'Bokför'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
