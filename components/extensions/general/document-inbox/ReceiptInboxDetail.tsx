'use client'

import { useState } from 'react'
import type { InvoiceInboxItem } from '@/types'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { Switch } from '@/components/ui/switch'
import { CheckCircle2, Receipt, LinkIcon } from 'lucide-react'

interface ReceiptLineItem {
  id: string
  description: string
  line_total: number
  vat_rate: number | null
  is_business: boolean | null
  category: string | null
  bas_account: string | null
}

interface ReceiptInboxDetailProps {
  item: InvoiceInboxItem | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: () => void
}

function formatAmount(amount: number, currency: string = 'SEK'): string {
  return new Intl.NumberFormat('sv-SE', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount)
}

export default function ReceiptInboxDetail({
  item,
  open,
  onOpenChange,
  onConfirm,
}: ReceiptInboxDetailProps) {
  const [lineItems, setLineItems] = useState<ReceiptLineItem[]>([])
  const [loading, setLoading] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [representationPersons, setRepresentationPersons] = useState<number | null>(null)
  const [representationPurpose, setRepresentationPurpose] = useState('')
  const [representationBusinessConnection, setRepresentationBusinessConnection] = useState('')

  const receipt = item?.receipt as {
    id?: string
    merchant_name?: string
    total_amount?: number
    receipt_date?: string
    status?: string
    matched_transaction_id?: string
  } | undefined

  // Fetch line items when dialog opens
  async function fetchLineItems() {
    if (!item?.linked_receipt_id) return
    setLoading(true)
    try {
      const res = await fetch(`/api/extensions/ext/receipt-ocr/${item.linked_receipt_id}`)
      if (res.ok) {
        const { data } = await res.json()
        if (data?.line_items) {
          setLineItems(data.line_items)
        }
      }
    } catch {
      // ok
    } finally {
      setLoading(false)
    }
  }

  function handleOpenChange(isOpen: boolean) {
    if (isOpen && item?.linked_receipt_id) {
      fetchLineItems()
    }
    onOpenChange(isOpen)
  }

  function toggleBusiness(lineItemId: string) {
    setLineItems((prev) =>
      prev.map((li) =>
        li.id === lineItemId
          ? { ...li, is_business: li.is_business === true ? false : true }
          : li
      )
    )
  }

  async function handleConfirm() {
    if (!item?.id || !item.linked_receipt_id) return
    setConfirming(true)

    try {
      const body: Record<string, unknown> = {
        line_items: lineItems.map((li) => ({
          id: li.id,
          is_business: li.is_business,
          category: li.category,
          bas_account: li.bas_account,
        })),
      }

      if (receipt?.matched_transaction_id) {
        body.matched_transaction_id = receipt.matched_transaction_id
      }
      if (representationPersons != null && representationPersons > 0) {
        body.representation_persons = representationPersons
      }
      if (representationPurpose) {
        body.representation_purpose = representationPurpose
      }
      if (representationBusinessConnection) {
        body.representation_business_connection = representationBusinessConnection
      }

      const res = await fetch(
        `/api/extensions/ext/invoice-inbox/inbox/${item.id}/confirm-receipt`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        }
      )

      if (res.ok) {
        onConfirm()
        onOpenChange(false)
      }
    } catch {
      // ok
    } finally {
      setConfirming(false)
    }
  }

  const businessTotal = lineItems
    .filter((li) => li.is_business === true)
    .reduce((sum, li) => sum + li.line_total, 0)
  const privateTotal = lineItems
    .filter((li) => li.is_business === false)
    .reduce((sum, li) => sum + li.line_total, 0)

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Receipt className="h-5 w-5" />
            Kvitto via e-post
          </DialogTitle>
        </DialogHeader>

        {receipt && (
          <div className="space-y-4">
            {/* Summary */}
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <span className="text-muted-foreground">Handlare</span>
                <p className="font-medium">{receipt.merchant_name ?? 'Okänd'}</p>
              </div>
              <div>
                <span className="text-muted-foreground">Datum</span>
                <p className="font-medium">{receipt.receipt_date ?? '-'}</p>
              </div>
              <div>
                <span className="text-muted-foreground">Totalbelopp</span>
                <p className="font-medium">
                  {receipt.total_amount ? formatAmount(receipt.total_amount) : '-'}
                </p>
              </div>
              <div>
                <span className="text-muted-foreground">Transaktionsmatch</span>
                <p className="font-medium flex items-center gap-1">
                  {receipt.matched_transaction_id ? (
                    <>
                      <LinkIcon className="h-3 w-3 text-success" />
                      <span className="text-success">Matchad</span>
                    </>
                  ) : (
                    <span className="text-muted-foreground">Ingen match</span>
                  )}
                </p>
              </div>
            </div>

            <Separator />

            {/* Line items with business/private toggle */}
            <div className="space-y-2">
              <Label>Artikelrader</Label>
              {loading ? (
                <p className="text-sm text-muted-foreground">Laddar...</p>
              ) : lineItems.length === 0 ? (
                <p className="text-sm text-muted-foreground">Inga rader extraherade</p>
              ) : (
                <div className="space-y-2">
                  {lineItems.map((li) => (
                    <div
                      key={li.id}
                      className="flex items-center justify-between gap-3 rounded-lg border p-3"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-sm truncate">{li.description}</p>
                        <p className="text-xs text-muted-foreground">
                          {formatAmount(li.line_total)}
                          {li.vat_rate != null && ` (${li.vat_rate}% moms)`}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-xs text-muted-foreground">Företag</span>
                        <Switch
                          checked={li.is_business === true}
                          onCheckedChange={() => toggleBusiness(li.id)}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Totals */}
            {lineItems.length > 0 && (
              <div className="flex gap-4 text-sm">
                <Badge variant="default">Företag: {formatAmount(Math.round(businessTotal * 100) / 100)}</Badge>
                <Badge variant="secondary">Privat: {formatAmount(Math.round(privateTotal * 100) / 100)}</Badge>
              </div>
            )}

            <Separator />

            {/* Representation fields */}
            <div className="space-y-3">
              <Label className="text-xs text-muted-foreground uppercase tracking-wide">
                Representation (vid restaurangkvitto)
              </Label>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="rep-persons" className="text-sm">
                    Antal personer
                  </Label>
                  <Input
                    id="rep-persons"
                    type="number"
                    min={0}
                    value={representationPersons ?? ''}
                    onChange={(e) =>
                      setRepresentationPersons(
                        e.target.value ? parseInt(e.target.value) : null
                      )
                    }
                    placeholder="0"
                  />
                </div>
                <div>
                  <Label htmlFor="rep-purpose" className="text-sm">
                    Syfte
                  </Label>
                  <Input
                    id="rep-purpose"
                    value={representationPurpose}
                    onChange={(e) => setRepresentationPurpose(e.target.value)}
                    placeholder="T.ex. kundmöte"
                  />
                </div>
              </div>
              <div>
                <Label htmlFor="rep-connection" className="text-sm">
                  Affärsmässig koppling (BFNAR)
                </Label>
                <Input
                  id="rep-connection"
                  value={representationBusinessConnection}
                  onChange={(e) =>
                    setRepresentationBusinessConnection(e.target.value)
                  }
                  placeholder="T.ex. potentiell kund, pågående projekt"
                />
              </div>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Avbryt
          </Button>
          <Button onClick={handleConfirm} disabled={confirming}>
            <CheckCircle2 className="h-4 w-4 mr-1.5" />
            {confirming ? 'Bekräftar...' : 'Bekräfta kvitto'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
