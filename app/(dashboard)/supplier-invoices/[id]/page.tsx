'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { use } from 'react'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { useToast } from '@/components/ui/use-toast'
import AttestationBadge, { StatusWorkflow } from '@/components/suppliers/AttestationBadge'
import {
  ArrowLeft,
  Building2,
  Loader2,
  CheckCircle,
  XCircle,
  BookOpen,
  Trash2,
  MessageSquare,
  Paperclip,
} from 'lucide-react'
import type { SupplierInvoice, SupplierInvoiceAttestation } from '@/types/suppliers'
import { ATTESTATION_ACTION_LABELS, SUPPLIER_PAYMENT_METHOD_LABELS } from '@/types/suppliers'
import type { SupplierPaymentMethod } from '@/types/suppliers'

function formatCurrency(amount: number, currency: string = 'SEK') {
  return new Intl.NumberFormat('sv-SE', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
  }).format(amount)
}

function formatDate(dateStr: string | null) {
  if (!dateStr) return '-'
  return new Intl.DateTimeFormat('sv-SE').format(new Date(dateStr))
}

function formatDateTime(dateStr: string | null) {
  if (!dateStr) return '-'
  return new Intl.DateTimeFormat('sv-SE', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(dateStr))
}

export default function SupplierInvoiceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = use(params)
  const router = useRouter()
  const { toast } = useToast()
  const [invoice, setInvoice] = useState<SupplierInvoice | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [attestComment, setAttestComment] = useState('')
  const [isAttesting, setIsAttesting] = useState(false)
  const [isBooking, setIsBooking] = useState(false)

  useEffect(() => {
    fetchInvoice()
  }, [id])

  async function fetchInvoice() {
    setIsLoading(true)
    try {
      const response = await fetch(`/api/supplier-invoices/${id}`)
      if (!response.ok) throw new Error('Not found')
      const { data } = await response.json()
      setInvoice(data)
    } catch {
      toast({
        title: 'Fel',
        description: 'Kunde inte hitta fakturan',
        variant: 'destructive',
      })
      router.push('/supplier-invoices')
    } finally {
      setIsLoading(false)
    }
  }

  async function handleAttest(action: 'attested' | 'rejected' | 'commented') {
    setIsAttesting(true)
    try {
      const response = await fetch(`/api/supplier-invoices/${id}/attest`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action,
          comment: attestComment || undefined,
        }),
      })

      const result = await response.json()

      if (!response.ok) {
        toast({
          title: 'Fel',
          description: result.error || 'Kunde inte attestera fakturan',
          variant: 'destructive',
        })
      } else {
        toast({
          title: action === 'attested' ? 'Attesterad' : action === 'rejected' ? 'Avslagen' : 'Kommentar tillagd',
          description: `Faktura ${invoice?.invoice_number}`,
        })
        setAttestComment('')
        setInvoice(result.data.invoice)
      }
    } catch {
      toast({
        title: 'Fel',
        description: 'Något gick fel',
        variant: 'destructive',
      })
    } finally {
      setIsAttesting(false)
    }
  }

  async function handleBook() {
    setIsBooking(true)
    try {
      const response = await fetch(`/api/supplier-invoices/${id}/book`, {
        method: 'POST',
      })

      const result = await response.json()

      if (!response.ok) {
        toast({
          title: 'Fel',
          description: result.error || 'Kunde inte bokföra fakturan',
          variant: 'destructive',
        })
      } else {
        toast({
          title: 'Bokförd',
          description: `Verifikation skapad för faktura ${invoice?.invoice_number}`,
        })
        setInvoice(result.data.invoice)
      }
    } catch {
      toast({
        title: 'Fel',
        description: 'Kunde inte bokföra fakturan',
        variant: 'destructive',
      })
    } finally {
      setIsBooking(false)
    }
  }

  async function handleDelete() {
    if (!invoice) return
    if (!confirm(`Ta bort faktura "${invoice.invoice_number}"? Detta kan inte ångras.`)) return

    try {
      const response = await fetch(`/api/supplier-invoices/${id}`, { method: 'DELETE' })
      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || 'Delete failed')
      }

      toast({
        title: 'Faktura borttagen',
        description: invoice.invoice_number,
      })
      router.push('/supplier-invoices')
    } catch (err) {
      toast({
        title: 'Fel',
        description: err instanceof Error ? err.message : 'Kunde inte ta bort fakturan',
        variant: 'destructive',
      })
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  if (!invoice) return null

  const items = invoice.items || []
  const attestations = invoice.attestations || []
  const canAttest = ['received', 'attested'].includes(invoice.status)
  const canBook = ['attested', 'approved'].includes(invoice.status) && !invoice.journal_entry_id
  const canDelete = ['draft', 'received'].includes(invoice.status)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <Link
            href="/supplier-invoices"
            className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1 mb-2"
          >
            <ArrowLeft className="h-4 w-4" />
            Tillbaka till leverantörsfakturor
          </Link>
          <h1 className="text-3xl font-bold tracking-tight">
            Faktura {invoice.invoice_number}
          </h1>
          {invoice.supplier && (
            <Link
              href={`/suppliers/${invoice.supplier.id}`}
              className="text-muted-foreground hover:text-foreground flex items-center gap-1 mt-1"
            >
              <Building2 className="h-4 w-4" />
              {invoice.supplier.name}
            </Link>
          )}
        </div>
        <div className="flex items-center gap-2">
          {canDelete && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleDelete}
              className="text-destructive hover:text-destructive"
            >
              <Trash2 className="h-4 w-4 mr-1" />
              Ta bort
            </Button>
          )}
        </div>
      </div>

      {/* Status workflow */}
      <StatusWorkflow currentStatus={invoice.status} />

      {/* Invoice details */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Fakturainformation</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 gap-2 text-sm">
              <span className="text-muted-foreground">Fakturanummer</span>
              <span className="font-medium">{invoice.invoice_number}</span>

              {invoice.ocr_number && (
                <>
                  <span className="text-muted-foreground">OCR</span>
                  <span className="font-medium">{invoice.ocr_number}</span>
                </>
              )}

              <span className="text-muted-foreground">Fakturadatum</span>
              <span>{formatDate(invoice.invoice_date)}</span>

              <span className="text-muted-foreground">Förfallodatum</span>
              <span>{formatDate(invoice.due_date)}</span>

              <span className="text-muted-foreground">Mottagen</span>
              <span>{formatDate(invoice.received_date)}</span>

              <span className="text-muted-foreground">Status</span>
              <span><AttestationBadge status={invoice.status} /></span>

              {invoice.payment_method && (
                <>
                  <span className="text-muted-foreground">Betalningsmetod</span>
                  <span>{SUPPLIER_PAYMENT_METHOD_LABELS[invoice.payment_method as SupplierPaymentMethod]}</span>
                </>
              )}

              {invoice.payment_reference && (
                <>
                  <span className="text-muted-foreground">Betalningsreferens</span>
                  <span className="font-mono">{invoice.payment_reference}</span>
                </>
              )}

              {invoice.paid_at && (
                <>
                  <span className="text-muted-foreground">Betald</span>
                  <span>{formatDateTime(invoice.paid_at)}</span>
                </>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Belopp</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 gap-2 text-sm">
              <span className="text-muted-foreground">Netto</span>
              <span className="tabular-nums text-right">{formatCurrency(invoice.subtotal, invoice.currency)}</span>

              <span className="text-muted-foreground">Moms ({invoice.vat_rate}%)</span>
              <span className="tabular-nums text-right">{formatCurrency(invoice.vat_amount, invoice.currency)}</span>

              <span className="text-muted-foreground font-medium border-t pt-2">Totalt</span>
              <span className="tabular-nums text-right font-bold border-t pt-2">
                {formatCurrency(invoice.total, invoice.currency)}
              </span>

              {invoice.currency !== 'SEK' && invoice.total_sek > 0 && (
                <>
                  <span className="text-muted-foreground">Totalt (SEK)</span>
                  <span className="tabular-nums text-right">{formatCurrency(invoice.total_sek, 'SEK')}</span>
                </>
              )}
            </div>

            {invoice.attachment_url && (
              <div className="pt-3 border-t">
                <a
                  href={invoice.attachment_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 text-sm text-primary hover:underline"
                >
                  <Paperclip className="h-4 w-4" />
                  Visa bifogad faktura
                </a>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Line items */}
      {items.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Fakturarader</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2 pr-4">Beskrivning</th>
                    <th className="text-right py-2 px-2">Antal</th>
                    <th className="text-right py-2 px-2">Á-pris</th>
                    <th className="text-right py-2 px-2">Konto</th>
                    <th className="text-right py-2 px-2">Moms %</th>
                    <th className="text-right py-2 pl-2">Belopp</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => (
                    <tr key={item.id} className="border-b last:border-0">
                      <td className="py-2 pr-4">
                        {item.description || '-'}
                        {item.cost_center && (
                          <span className="ml-2 text-xs text-muted-foreground">
                            KS: {item.cost_center}
                          </span>
                        )}
                        {item.project && (
                          <span className="ml-2 text-xs text-muted-foreground">
                            Proj: {item.project}
                          </span>
                        )}
                      </td>
                      <td className="text-right py-2 px-2 tabular-nums">{item.quantity} {item.unit}</td>
                      <td className="text-right py-2 px-2 tabular-nums">{formatCurrency(item.unit_price)}</td>
                      <td className="text-right py-2 px-2 font-mono text-xs">{item.account_number || '-'}</td>
                      <td className="text-right py-2 px-2 tabular-nums">{item.vat_rate}%</td>
                      <td className="text-right py-2 pl-2 tabular-nums font-medium">{formatCurrency(item.line_total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Notes */}
      {invoice.notes && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Anteckningar</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground whitespace-pre-wrap">{invoice.notes}</p>
          </CardContent>
        </Card>
      )}

      {/* Actions */}
      {(canAttest || canBook) && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Åtgärder</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {canAttest && (
              <div className="space-y-3">
                <div className="space-y-2">
                  <Label>Kommentar (valfritt)</Label>
                  <Textarea
                    placeholder="Lägg till en kommentar..."
                    value={attestComment}
                    onChange={(e) => setAttestComment(e.target.value)}
                  />
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    onClick={() => handleAttest('attested')}
                    disabled={isAttesting}
                  >
                    {isAttesting ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <CheckCircle className="mr-2 h-4 w-4" />
                    )}
                    Attestera
                  </Button>
                  <Button
                    variant="destructive"
                    onClick={() => handleAttest('rejected')}
                    disabled={isAttesting}
                  >
                    <XCircle className="mr-2 h-4 w-4" />
                    Avslå
                  </Button>
                  {attestComment && (
                    <Button
                      variant="outline"
                      onClick={() => handleAttest('commented')}
                      disabled={isAttesting}
                    >
                      <MessageSquare className="mr-2 h-4 w-4" />
                      Kommentera
                    </Button>
                  )}
                </div>
              </div>
            )}

            {canBook && (
              <div className="pt-3 border-t">
                <Button onClick={handleBook} disabled={isBooking} variant="outline">
                  {isBooking ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <BookOpen className="mr-2 h-4 w-4" />
                  )}
                  Bokför faktura
                </Button>
                <p className="text-xs text-muted-foreground mt-1">
                  Skapar en verifikation i bokföringen (debet kostnadskonton, kredit 2440 Leverantörsskulder)
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Attestation history */}
      {attestations.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Attestationshistorik</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {attestations
                .sort((a, b) => new Date(b.attested_at).getTime() - new Date(a.attested_at).getTime())
                .map((att) => (
                  <div key={att.id} className="flex items-start gap-3 p-3 rounded-lg border">
                    <div className={`mt-0.5 ${
                      att.action === 'attested' ? 'text-green-600' :
                      att.action === 'rejected' ? 'text-destructive' :
                      'text-muted-foreground'
                    }`}>
                      {att.action === 'attested' ? (
                        <CheckCircle className="h-5 w-5" />
                      ) : att.action === 'rejected' ? (
                        <XCircle className="h-5 w-5" />
                      ) : (
                        <MessageSquare className="h-5 w-5" />
                      )}
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <Badge variant={att.action === 'attested' ? 'default' : att.action === 'rejected' ? 'destructive' : 'secondary'}>
                          {ATTESTATION_ACTION_LABELS[att.action]}
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          {formatDateTime(att.attested_at)}
                        </span>
                      </div>
                      {att.comment && (
                        <p className="text-sm text-muted-foreground mt-1">{att.comment}</p>
                      )}
                    </div>
                  </div>
                ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
