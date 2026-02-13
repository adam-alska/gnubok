'use client'

import { useState, useMemo } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  AlertTriangle,
  Check,
  X,
  Building,
  User,
  Wine,
  Utensils,
  Globe,
  ChevronUp,
  ChevronDown,
  Loader2,
} from 'lucide-react'
import { formatCurrency, formatDate } from '@/lib/utils'
import { calculateReceiptSplit, getDefaultClassification } from '@/lib/receipts/receipt-categorizer'
import { calculateRepresentationLimits } from '@/lib/receipts/receipt-utils'
import ReceiptLineItemRow from './ReceiptLineItemRow'
import type { Receipt, ReceiptLineItem, TransactionCategory, ConfirmLineItemInput } from '@/types'

interface ReceiptReviewViewProps {
  receipt: Receipt & { line_items: ReceiptLineItem[] }
  onConfirm: (data: {
    line_items: ConfirmLineItemInput[]
    representation_persons?: number
    representation_purpose?: string
  }) => Promise<void>
  onCancel: () => void
  onFindMatches?: () => void
}

export default function ReceiptReviewView({
  receipt,
  onConfirm,
  onCancel,
  onFindMatches,
}: ReceiptReviewViewProps) {
  // Initialize line items with their current state
  const [lineItems, setLineItems] = useState<ReceiptLineItem[]>(receipt.line_items || [])
  const [isProcessing, setIsProcessing] = useState(false)
  const [showImage, setShowImage] = useState(false)

  // Restaurant representation state
  const [representationPersons, setRepresentationPersons] = useState<number | undefined>(
    receipt.representation_persons || undefined
  )
  const [representationPurpose, setRepresentationPurpose] = useState<string>(
    receipt.representation_purpose || ''
  )

  // Get default classification info
  const defaultClassification = getDefaultClassification(
    receipt.is_restaurant,
    receipt.is_systembolaget
  )

  // Calculate split summary
  const splitSummary = useMemo(() => {
    return calculateReceiptSplit(lineItems.map(item => ({
      lineTotal: item.line_total,
      is_business: item.is_business,
    })))
  }, [lineItems])

  // Calculate representation limits if restaurant
  const representationCalc = useMemo(() => {
    if (!receipt.is_restaurant || !representationPersons || !receipt.total_amount) return null
    return calculateRepresentationLimits(receipt.total_amount, representationPersons)
  }, [receipt.is_restaurant, receipt.total_amount, representationPersons])

  // Toggle business status for a line item
  const handleToggleBusiness = (id: string, isBusiness: boolean) => {
    setLineItems((items) =>
      items.map((item) =>
        item.id === id
          ? { ...item, is_business: isBusiness, category: isBusiness ? item.category : null }
          : item
      )
    )
  }

  // Change category for a line item
  const handleCategoryChange = (id: string, category: TransactionCategory) => {
    setLineItems((items) =>
      items.map((item) => (item.id === id ? { ...item, category } : item))
    )
  }

  // Mark all as business
  const handleAllBusiness = () => {
    setLineItems((items) =>
      items.map((item) => ({
        ...item,
        is_business: true,
        category: item.category || 'expense_other',
      }))
    )
  }

  // Mark all as private
  const handleAllPrivate = () => {
    setLineItems((items) =>
      items.map((item) => ({
        ...item,
        is_business: false,
        category: null,
      }))
    )
  }

  // Confirm and save
  const handleConfirm = async () => {
    // Validate restaurant representation
    if (receipt.is_restaurant && splitSummary.businessTotal > 0) {
      if (!representationPersons || representationPersons < 1) {
        alert('Ange antal personer för restaurangrepresentation')
        return
      }
      if (!representationPurpose.trim()) {
        alert('Ange syfte för restaurangrepresentation')
        return
      }
    }

    setIsProcessing(true)
    try {
      await onConfirm({
        line_items: lineItems.map((item) => ({
          id: item.id,
          is_business: item.is_business ?? false,
          category: item.category || undefined,
          bas_account: item.bas_account || undefined,
        })),
        representation_persons: representationPersons,
        representation_purpose: representationPurpose.trim() || undefined,
      })
    } catch (error) {
      console.error('Confirm error:', error)
    } finally {
      setIsProcessing(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-background z-50 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b flex-shrink-0">
        <Button variant="ghost" size="icon" onClick={onCancel} disabled={isProcessing} aria-label="Avbryt">
          <X className="h-5 w-5" />
        </Button>
        <h1 className="font-semibold">Granska kvitto</h1>
        <div className="w-10" />
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-4 space-y-4">
        {/* Merchant and total card */}
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-start justify-between">
              <div>
                <h2 className="font-semibold text-lg">{receipt.merchant_name || 'Okänd handlare'}</h2>
                {receipt.receipt_date && (
                  <p className="text-sm text-muted-foreground">{formatDate(receipt.receipt_date)}</p>
                )}
              </div>
              <div className="text-right">
                <p className="text-2xl font-bold">
                  {formatCurrency(receipt.total_amount || 0, receipt.currency)}
                </p>
                {receipt.vat_amount && (
                  <p className="text-sm text-muted-foreground">
                    varav moms {formatCurrency(receipt.vat_amount, receipt.currency)}
                  </p>
                )}
              </div>
            </div>

            {/* Special flags */}
            <div className="flex flex-wrap gap-2 mt-3">
              {receipt.is_restaurant && (
                <Badge variant="secondary">
                  <Utensils className="mr-1 h-3 w-3" /> Restaurang
                </Badge>
              )}
              {receipt.is_systembolaget && (
                <Badge variant="secondary">
                  <Wine className="mr-1 h-3 w-3" /> Systembolaget
                </Badge>
              )}
              {receipt.is_foreign_merchant && (
                <Badge variant="secondary">
                  <Globe className="mr-1 h-3 w-3" /> Utländskt
                </Badge>
              )}
              {receipt.extraction_confidence && (
                <Badge
                  variant={receipt.extraction_confidence > 0.8 ? 'outline' : receipt.extraction_confidence > 0.5 ? 'warning' : 'destructive'}
                  className={receipt.extraction_confidence > 0.8 ? 'border-success/50 text-success' : ''}
                >
                  {Math.round(receipt.extraction_confidence * 100)}% säkerhet
                  {receipt.extraction_confidence <= 0.8 && ' — kontrollera'}
                </Badge>
              )}
            </div>

            {/* Toggle image preview */}
            <Button
              variant="ghost"
              size="sm"
              className="mt-2 text-xs"
              onClick={() => setShowImage(!showImage)}
            >
              {showImage ? <ChevronUp className="mr-1 h-3 w-3" /> : <ChevronDown className="mr-1 h-3 w-3" />}
              {showImage ? 'Dölj bild' : 'Visa bild'}
            </Button>

            {showImage && receipt.image_url && (
              <img
                src={receipt.image_url}
                alt="Receipt"
                className="mt-2 max-h-48 rounded-lg object-contain"
              />
            )}
          </CardContent>
        </Card>

        {/* Warning message */}
        {defaultClassification.warningMessage && (
          <div className="flex items-start gap-2 p-3 rounded-lg bg-yellow-50 dark:bg-yellow-950/20 border border-yellow-200 dark:border-yellow-800">
            <AlertTriangle className="h-5 w-5 text-yellow-600 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-yellow-800 dark:text-yellow-200">
              {defaultClassification.warningMessage}
            </p>
          </div>
        )}

        {/* Restaurant representation section */}
        {receipt.is_restaurant && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Utensils className="h-4 w-4" />
                Representation
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="persons" className="text-xs">
                    Antal personer
                  </Label>
                  <Input
                    id="persons"
                    type="number"
                    min={1}
                    value={representationPersons || ''}
                    onChange={(e) => setRepresentationPersons(parseInt(e.target.value) || undefined)}
                    placeholder="2"
                  />
                </div>
                <div>
                  <Label className="text-xs">Per person</Label>
                  <p className="h-10 flex items-center font-medium">
                    {representationPersons && receipt.total_amount
                      ? formatCurrency(receipt.total_amount / representationPersons, receipt.currency)
                      : '—'}
                  </p>
                </div>
              </div>

              <div>
                <Label htmlFor="purpose" className="text-xs">
                  Syfte med representationen
                </Label>
                <Textarea
                  id="purpose"
                  value={representationPurpose}
                  onChange={(e) => setRepresentationPurpose(e.target.value)}
                  placeholder="T.ex. kundmöte, kontraktsförhandling..."
                  rows={2}
                />
              </div>

              {representationCalc && (
                <div className="p-2 rounded bg-muted text-xs space-y-1">
                  <p>
                    <span className="text-muted-foreground">Avdragsgill del:</span>{' '}
                    <span className="font-medium text-green-600">
                      {formatCurrency(representationCalc.deductibleAmount, receipt.currency)}
                    </span>
                    {' '}(max {representationCalc.maxDeductiblePerPerson} kr/person)
                  </p>
                  {representationCalc.nonDeductibleAmount > 0 && (
                    <p>
                      <span className="text-muted-foreground">Ej avdragsgill del:</span>{' '}
                      <span className="font-medium text-orange-600">
                        {formatCurrency(representationCalc.nonDeductibleAmount, receipt.currency)}
                      </span>
                    </p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Quick actions */}
        <div className="flex gap-2">
          <Button variant="outline" className="flex-1" onClick={handleAllBusiness}>
            <Building className="mr-2 h-4 w-4" />
            Allt företag
          </Button>
          <Button variant="outline" className="flex-1" onClick={handleAllPrivate}>
            <User className="mr-2 h-4 w-4" />
            Allt privat
          </Button>
        </div>

        {/* Line items */}
        <div className="space-y-2">
          <h3 className="font-medium text-sm flex items-center justify-between">
            Artiklar ({lineItems.length})
            <span className="text-muted-foreground font-normal">
              Svajpa eller klicka för att klassificera
            </span>
          </h3>

          {lineItems.map((item) => (
            <ReceiptLineItemRow
              key={item.id}
              item={item}
              onToggleBusiness={handleToggleBusiness}
              onCategoryChange={handleCategoryChange}
              disabled={isProcessing}
            />
          ))}
        </div>

        {/* Summary */}
        <Card>
          <CardContent className="pt-4">
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Företag:</span>
                <span className="font-medium text-green-600">
                  {formatCurrency(splitSummary.businessTotal, receipt.currency)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Privat:</span>
                <span className="font-medium text-orange-600">
                  {formatCurrency(splitSummary.privateTotal, receipt.currency)}
                </span>
              </div>
              {splitSummary.unclassifiedTotal > 0 && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Oklassificerat:</span>
                  <span className="font-medium text-yellow-600">
                    {formatCurrency(splitSummary.unclassifiedTotal, receipt.currency)}
                  </span>
                </div>
              )}
              <div className="pt-2 border-t flex justify-between font-medium">
                <span>Totalt:</span>
                <span>{formatCurrency(receipt.total_amount || 0, receipt.currency)}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Footer actions - large touch targets for mobile */}
      <div className="p-4 border-t flex-shrink-0 space-y-2 safe-area-bottom">
        {onFindMatches && (
          <Button
            variant="outline"
            className="w-full h-12 text-base"
            onClick={onFindMatches}
            disabled={isProcessing}
          >
            Hitta matchande transaktion
          </Button>
        )}
        <Button
          className="w-full h-14 text-base font-medium"
          onClick={handleConfirm}
          disabled={isProcessing || splitSummary.unclassifiedTotal > 0}
        >
          {isProcessing ? (
            <>
              <Loader2 className="mr-2 h-5 w-5 animate-spin" />
              Sparar...
            </>
          ) : (
            <>
              <Check className="mr-2 h-5 w-5" />
              Bekräfta klassificering
            </>
          )}
        </Button>
        {splitSummary.unclassifiedTotal > 0 && (
          <p className="text-xs text-center text-muted-foreground">
            Klassificera alla artiklar innan du bekräftar
          </p>
        )}
      </div>
    </div>
  )
}
