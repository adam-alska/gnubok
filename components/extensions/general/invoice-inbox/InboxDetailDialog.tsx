'use client'

import { useState, useEffect } from 'react'
import type { InvoiceInboxItem, Supplier, SupplierType } from '@/types'
import type { InvoiceExtractionResult } from '@/extensions/general/invoice-inbox/types'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Progress } from '@/components/ui/progress'
import {
  getStatusLabel,
  getStatusVariant,
  getConfidenceLabel,
} from '@/lib/extensions/invoice-inbox-utils'
import { Loader2, RefreshCw, Check, X, ChevronDown } from 'lucide-react'

export interface NewSupplierData {
  name: string
  supplier_type: SupplierType
  org_number: string
  vat_number: string
  bankgiro: string
  plusgiro: string
  default_expense_account: string
  default_currency: string
}

interface InboxDetailDialogProps {
  item: InvoiceInboxItem | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: (itemId: string, supplierId?: string, newSupplierData?: NewSupplierData) => Promise<void>
  onReject: (itemId: string) => Promise<void>
  onReprocess: (itemId: string) => Promise<void>
  suppliers: Supplier[]
}

function formatAmount(amount: number | null, currency: string = 'SEK'): string {
  if (amount == null) return '-'
  return new Intl.NumberFormat('sv-SE', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount)
}

export default function InboxDetailDialog({
  item,
  open,
  onOpenChange,
  onConfirm,
  onReject,
  onReprocess,
  suppliers,
}: InboxDetailDialogProps) {
  const [loading, setLoading] = useState<'confirm' | 'reject' | 'reprocess' | null>(null)
  const [selectedSupplierId, setSelectedSupplierId] = useState<string | undefined>(undefined)
  const [supplierFormOpen, setSupplierFormOpen] = useState(false)
  const [newSupplier, setNewSupplier] = useState<NewSupplierData>({
    name: '',
    supplier_type: 'swedish_business',
    org_number: '',
    vat_number: '',
    bankgiro: '',
    plusgiro: '',
    default_expense_account: '6200',
    default_currency: 'SEK',
  })

  // Pre-populate supplier form when item changes
  const extractionForEffect = item?.extracted_data as unknown as InvoiceExtractionResult | null
  useEffect(() => {
    if (!extractionForEffect?.supplier) return
    const s = extractionForEffect.supplier
    setNewSupplier({
      name: s.name ?? '',
      supplier_type: 'swedish_business',
      org_number: s.orgNumber ?? '',
      vat_number: s.vatNumber ?? '',
      bankgiro: s.bankgiro ?? '',
      plusgiro: s.plusgiro ?? '',
      default_expense_account: '6200',
      default_currency: extractionForEffect.invoice?.currency || 'SEK',
    })
  }, [extractionForEffect])

  if (!item) return null

  const extraction = item.extracted_data as unknown as InvoiceExtractionResult | null
  const currency = extraction?.invoice.currency || 'SEK'
  const confidence = getConfidenceLabel(item.confidence)
  const confidenceVariant = confidence.variant as 'default' | 'secondary' | 'destructive' | 'outline' | 'success' | 'warning'
  const statusVariant = getStatusVariant(item.status) as 'default' | 'secondary' | 'destructive' | 'outline' | 'success' | 'warning'

  const matchedSupplierName = (item.supplier as { name?: string } | undefined)?.name
  const supplierId = selectedSupplierId ?? item.matched_supplier_id ?? undefined
  const isCreatingNewSupplier = !supplierId

  const canConfirm = item.status === 'ready' && extraction != null
  const canReprocess = item.status !== 'confirmed'
  const canReject = item.status !== 'confirmed' && item.status !== 'rejected'

  function updateSupplierField<K extends keyof NewSupplierData>(field: K, value: NewSupplierData[K]) {
    setNewSupplier((prev) => ({ ...prev, [field]: value }))
  }

  async function handleAction(action: 'confirm' | 'reject' | 'reprocess') {
    setLoading(action)
    try {
      if (action === 'confirm') {
        await onConfirm(
          item!.id,
          supplierId,
          isCreatingNewSupplier ? newSupplier : undefined
        )
      } else if (action === 'reject') {
        await onReject(item!.id)
      } else {
        await onReprocess(item!.id)
      }
    } finally {
      setLoading(null)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[95dvh] sm:max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <DialogTitle>Granska faktura</DialogTitle>
            <Badge variant={statusVariant}>
              {getStatusLabel(item.status)}
            </Badge>
          </div>
        </DialogHeader>

        {/* Confidence */}
        {item.confidence != null && (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">AI-konfidens</span>
              <Badge variant={confidenceVariant}>{confidence.label} ({Math.round(item.confidence * 100)}%)</Badge>
            </div>
            <Progress value={item.confidence * 100} className="h-1.5" />
          </div>
        )}

        {item.error_message && (
          <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
            {item.error_message}
          </div>
        )}

        {extraction && (
          <>
            <Separator />

            {/* Supplier info */}
            <div className="space-y-3">
              <h4 className="text-sm font-medium">Leverantör</h4>
              <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                <div>
                  <span className="text-muted-foreground">Namn</span>
                  <p className="font-medium">{extraction.supplier.name ?? '-'}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Org.nr</span>
                  <p className="font-medium">{extraction.supplier.orgNumber ?? '-'}</p>
                </div>
                {extraction.supplier.bankgiro && (
                  <div>
                    <span className="text-muted-foreground">Bankgiro</span>
                    <p className="font-medium">{extraction.supplier.bankgiro}</p>
                  </div>
                )}
                {extraction.supplier.plusgiro && (
                  <div>
                    <span className="text-muted-foreground">Plusgiro</span>
                    <p className="font-medium">{extraction.supplier.plusgiro}</p>
                  </div>
                )}
              </div>

              {/* Supplier match override */}
              <div className="space-y-1.5">
                <label className="text-sm text-muted-foreground">
                  Matchad leverantör
                  {matchedSupplierName && (
                    <span className="ml-1 text-xs">
                      (auto: {matchedSupplierName})
                    </span>
                  )}
                </label>
                <Select
                  value={supplierId ?? '__new__'}
                  onValueChange={(v) => setSelectedSupplierId(v === '__new__' ? undefined : v)}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Skapa ny leverantör" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__new__">Skapa ny leverantör</SelectItem>
                    {suppliers.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name}
                        {s.org_number ? ` (${s.org_number})` : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Inline new supplier form */}
              {isCreatingNewSupplier && (
                <div className="rounded-md border bg-muted/30 p-3 space-y-3">
                  <button
                    type="button"
                    className="flex w-full items-center justify-between text-sm font-medium"
                    onClick={() => setSupplierFormOpen((o) => !o)}
                  >
                    <span>Granska leverantörsuppgifter</span>
                    <ChevronDown className={`h-4 w-4 transition-transform ${supplierFormOpen ? 'rotate-180' : ''}`} />
                  </button>
                  {supplierFormOpen && (
                    <div className="grid grid-cols-2 gap-3">
                      <div className="col-span-2 space-y-1">
                        <Label className="text-xs">Namn</Label>
                        <Input
                          value={newSupplier.name}
                          onChange={(e) => updateSupplierField('name', e.target.value)}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Typ</Label>
                        <Select
                          value={newSupplier.supplier_type}
                          onValueChange={(v) => updateSupplierField('supplier_type', v as SupplierType)}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="swedish_business">Svenskt företag</SelectItem>
                            <SelectItem value="eu_business">EU-företag</SelectItem>
                            <SelectItem value="non_eu_business">Utomeuropeiskt</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Org.nr</Label>
                        <Input
                          value={newSupplier.org_number}
                          onChange={(e) => updateSupplierField('org_number', e.target.value)}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Bankgiro</Label>
                        <Input
                          value={newSupplier.bankgiro}
                          onChange={(e) => updateSupplierField('bankgiro', e.target.value)}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Plusgiro</Label>
                        <Input
                          value={newSupplier.plusgiro}
                          onChange={(e) => updateSupplierField('plusgiro', e.target.value)}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Kostnadskonto</Label>
                        <Input
                          value={newSupplier.default_expense_account}
                          onChange={(e) => updateSupplierField('default_expense_account', e.target.value)}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Valuta</Label>
                        <Input
                          value={newSupplier.default_currency}
                          onChange={(e) => updateSupplierField('default_currency', e.target.value)}
                        />
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            <Separator />

            {/* Invoice details */}
            <div className="space-y-3">
              <h4 className="text-sm font-medium">Fakturadetaljer</h4>
              <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                <div>
                  <span className="text-muted-foreground">Fakturanummer</span>
                  <p className="font-medium">{extraction.invoice.invoiceNumber ?? '-'}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Valuta</span>
                  <p className="font-medium">{extraction.invoice.currency}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Fakturadatum</span>
                  <p className="font-medium">{extraction.invoice.invoiceDate ?? '-'}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Förfallodatum</span>
                  <p className="font-medium">{extraction.invoice.dueDate ?? '-'}</p>
                </div>
                {extraction.invoice.paymentReference && (
                  <div className="col-span-2">
                    <span className="text-muted-foreground">Betalningsreferens</span>
                    <p className="font-medium font-mono">{extraction.invoice.paymentReference}</p>
                  </div>
                )}
              </div>
            </div>

            {/* Line items */}
            {extraction.lineItems.length > 0 && (
              <>
                <Separator />
                <div className="space-y-3">
                  <h4 className="text-sm font-medium">Rader</h4>
                  <div className="rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Beskrivning</TableHead>
                          <TableHead className="text-right w-16">Antal</TableHead>
                          <TableHead className="text-right w-24">À-pris</TableHead>
                          <TableHead className="text-right w-24">Belopp</TableHead>
                          <TableHead className="text-right w-16">Moms</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {extraction.lineItems.map((line, i) => (
                          <TableRow key={i}>
                            <TableCell className="text-sm">{line.description}</TableCell>
                            <TableCell className="text-right text-sm">{line.quantity}</TableCell>
                            <TableCell className="text-right text-sm">
                              {line.unitPrice != null ? formatAmount(line.unitPrice, currency) : '-'}
                            </TableCell>
                            <TableCell className="text-right text-sm font-medium">
                              {formatAmount(line.lineTotal, currency)}
                            </TableCell>
                            <TableCell className="text-right text-sm">
                              {line.vatRate != null ? `${line.vatRate}%` : '-'}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              </>
            )}

            <Separator />

            {/* Totals */}
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Netto</span>
                <span>{formatAmount(extraction.totals.subtotal, currency)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Moms</span>
                <span>{formatAmount(extraction.totals.vatAmount, currency)}</span>
              </div>
              <Separator />
              <div className="flex justify-between font-medium text-base">
                <span>Totalt</span>
                <span>{formatAmount(extraction.totals.total, currency)}</span>
              </div>
            </div>
          </>
        )}

        <DialogFooter className="gap-2 sm:gap-0">
          {canReject && (
            <Button
              variant="outline"
              onClick={() => handleAction('reject')}
              disabled={loading !== null}
            >
              {loading === 'reject' ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <X className="h-4 w-4 mr-2" />
              )}
              Avvisa
            </Button>
          )}
          {canReprocess && (
            <Button
              variant="outline"
              onClick={() => handleAction('reprocess')}
              disabled={loading !== null}
            >
              {loading === 'reprocess' ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <RefreshCw className="h-4 w-4 mr-2" />
              )}
              Bearbeta igen
            </Button>
          )}
          {canConfirm && (
            <Button
              onClick={() => handleAction('confirm')}
              disabled={loading !== null}
            >
              {loading === 'confirm' ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Check className="h-4 w-4 mr-2" />
              )}
              Bekräfta
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
