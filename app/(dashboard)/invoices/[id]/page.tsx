'use client'

import { useState, useEffect, use } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { useToast } from '@/components/ui/use-toast'
import { formatCurrency, formatDate } from '@/lib/utils'
import { getVatTreatmentLabel } from '@/lib/invoices/vat-rules'
import {
  Loader2,
  ArrowLeft,
  Send,
  CheckCircle,
  FileText,
  Download,
  XCircle,
  Clock,
  Building,
  Mail,
  Phone,
  MapPin,
  ReceiptText,
  ExternalLink,
  Bell,
  AlertTriangle,
  MessageSquare,
  Trash2,
} from 'lucide-react'
import type { Invoice, InvoiceItem, Customer, InvoiceStatus, InvoiceReminder, InvoiceDocumentType } from '@/types'

const statusConfig: Record<InvoiceStatus, { label: string; variant: 'default' | 'secondary' | 'success' | 'warning' | 'destructive'; icon: React.ElementType }> = {
  draft: { label: 'Utkast', variant: 'secondary', icon: FileText },
  sent: { label: 'Skickad', variant: 'default', icon: Send },
  paid: { label: 'Betald', variant: 'success', icon: CheckCircle },
  overdue: { label: 'Förfallen', variant: 'destructive', icon: Clock },
  cancelled: { label: 'Makulerad', variant: 'secondary', icon: XCircle },
  credited: { label: 'Krediterad', variant: 'secondary', icon: XCircle },
}

const reminderLevelLabels: Record<1 | 2 | 3, string> = {
  1: 'Vänlig påminnelse',
  2: 'Andra påminnelsen',
  3: 'Slutlig påminnelse'
}

interface InvoiceWithRelations extends Invoice {
  customer: Customer
  items: InvoiceItem[]
  sent_at?: string
}

export default function InvoiceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const { toast } = useToast()
  const supabase = createClient()

  const [invoice, setInvoice] = useState<InvoiceWithRelations | null>(null)
  const [reminders, setReminders] = useState<InvoiceReminder[]>([])
  const [creditNote, setCreditNote] = useState<Invoice | null>(null)
  const [originalInvoice, setOriginalInvoice] = useState<Invoice | null>(null)
  const [convertedFromInvoice, setConvertedFromInvoice] = useState<Invoice | null>(null)
  const [isConverting, setIsConverting] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [isUpdating, setIsUpdating] = useState(false)
  const [isDownloading, setIsDownloading] = useState(false)
  const [isSendingEmail, setIsSendingEmail] = useState(false)

  useEffect(() => {
    fetchInvoice()
  }, [id])

  async function fetchInvoice() {
    setIsLoading(true)

    const { data, error } = await supabase
      .from('invoices')
      .select(`
        *,
        customer:customers(*),
        items:invoice_items(*)
      `)
      .eq('id', id)
      .single()

    if (error || !data) {
      toast({
        title: 'Fel',
        description: 'Kunde inte hämta faktura',
        variant: 'destructive',
      })
      router.push('/invoices')
      return
    }

    // Sort items by sort_order
    if (data.items) {
      data.items.sort((a: InvoiceItem, b: InvoiceItem) => a.sort_order - b.sort_order)
    }

    setInvoice(data as InvoiceWithRelations)

    // Fetch reminders for this invoice
    const { data: reminderData } = await supabase
      .from('invoice_reminders')
      .select('*')
      .eq('invoice_id', id)
      .order('sent_at', { ascending: false })

    if (reminderData) {
      setReminders(reminderData as InvoiceReminder[])
    }

    // If this invoice is credited, find the credit note
    if (data.status === 'credited') {
      const { data: creditNoteData } = await supabase
        .from('invoices')
        .select('id, invoice_number')
        .eq('credited_invoice_id', id)
        .single()

      if (creditNoteData) {
        setCreditNote(creditNoteData as Invoice)
      }
    }

    // If this is a credit note, fetch the original invoice
    if (data.credited_invoice_id) {
      const { data: originalData } = await supabase
        .from('invoices')
        .select('id, invoice_number')
        .eq('id', data.credited_invoice_id)
        .single()

      if (originalData) {
        setOriginalInvoice(originalData as Invoice)
      }
    }

    // If this invoice was converted from a proforma, fetch it
    if (data.converted_from_id) {
      const { data: convertedData } = await supabase
        .from('invoices')
        .select('id, invoice_number')
        .eq('id', data.converted_from_id)
        .single()

      if (convertedData) {
        setConvertedFromInvoice(convertedData as Invoice)
      }
    }

    setIsLoading(false)
  }

  async function updateStatus(status: InvoiceStatus) {
    if (!invoice) return

    setIsUpdating(true)

    try {
      if (status === 'sent') {
        // Use mark-sent API for proper bookkeeping
        const response = await fetch(`/api/invoices/${invoice.id}/mark-sent`, {
          method: 'POST',
        })
        if (!response.ok) {
          const data = await response.json()
          throw new Error(data.error || 'Kunde inte markera som skickad')
        }
      } else if (status === 'paid') {
        // Use mark-paid API for proper bookkeeping
        const response = await fetch(`/api/invoices/${invoice.id}/mark-paid`, {
          method: 'POST',
        })
        if (!response.ok) {
          const data = await response.json()
          throw new Error(data.error || 'Kunde inte markera som betald')
        }
      } else if (status === 'cancelled') {
        // Only drafts and proformas can be cancelled directly — sent/overdue/paid
        // invoices have committed journal entries and require a credit note instead
        if (invoice.status !== 'draft') {
          const docType = ((invoice as Invoice & { document_type?: InvoiceDocumentType }).document_type || 'invoice') as InvoiceDocumentType
          if (docType !== 'proforma') {
            throw new Error('Bokförda fakturor kan inte makuleras. Skapa en kreditfaktura istället.')
          }
        }
        const { error } = await supabase
          .from('invoices')
          .update({ status })
          .eq('id', invoice.id)
        if (error) throw new Error(error.message)
      } else {
        const { error } = await supabase
          .from('invoices')
          .update({ status })
          .eq('id', invoice.id)
        if (error) throw new Error(error.message)
      }

      toast({
        title: 'Uppdaterad',
        description: `Fakturan är nu markerad som ${statusConfig[status].label.toLowerCase()}`,
      })
      fetchInvoice()
    } catch (error) {
      toast({
        title: 'Fel',
        description: error instanceof Error ? error.message : 'Kunde inte uppdatera status',
        variant: 'destructive',
      })
    }

    setIsUpdating(false)
  }

  async function sendInvoiceEmail() {
    if (!invoice) return

    // Check if customer has email
    if (!invoice.customer.email) {
      toast({
        title: 'E-post saknas',
        description: 'Kunden saknar e-postadress. Uppdatera kunduppgifterna först.',
        variant: 'destructive',
      })
      return
    }

    setIsSendingEmail(true)

    try {
      const response = await fetch(`/api/invoices/${invoice.id}/send`, {
        method: 'POST',
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Kunde inte skicka fakturan')
      }

      toast({
        title: 'Faktura skickad',
        description: data.message,
      })

      // Refresh to get updated status
      fetchInvoice()
    } catch (error) {
      toast({
        title: 'Fel',
        description: error instanceof Error ? error.message : 'Kunde inte skicka fakturan',
        variant: 'destructive',
      })
    }

    setIsSendingEmail(false)
  }

  async function convertToInvoice() {
    if (!invoice) return
    setIsConverting(true)

    try {
      const response = await fetch(`/api/invoices/${invoice.id}/convert`, {
        method: 'POST',
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Kunde inte konvertera proformafakturan')
      }

      toast({
        title: 'Konverterad till faktura',
        description: `Faktura ${data.data.invoice_number} har skapats`,
      })

      router.push(`/invoices/${data.data.id}`)
    } catch (error) {
      toast({
        title: 'Fel',
        description: error instanceof Error ? error.message : 'Kunde inte konvertera',
        variant: 'destructive',
      })
    }

    setIsConverting(false)
  }

  async function downloadPDF() {
    if (!invoice) return

    setIsDownloading(true)

    try {
      const response = await fetch(`/api/invoices/${invoice.id}/pdf`)

      if (!response.ok) {
        throw new Error('Kunde inte generera PDF')
      }

      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `faktura-${invoice.invoice_number}.pdf`
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      document.body.removeChild(a)

      toast({
        title: 'PDF nedladdad',
        description: `Faktura ${invoice.invoice_number} har laddats ner`,
      })
    } catch (error) {
      toast({
        title: 'Fel',
        description: error instanceof Error ? error.message : 'Kunde inte ladda ner PDF',
        variant: 'destructive',
      })
    }

    setIsDownloading(false)
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  if (!invoice) {
    return null
  }

  const status = statusConfig[invoice.status]
  const StatusIcon = status.icon
  const customer = invoice.customer
  const customerHasEmail = !!customer.email
  const docType = ((invoice as Invoice & { document_type?: InvoiceDocumentType }).document_type || 'invoice') as InvoiceDocumentType
  const isProforma = docType === 'proforma'
  const isDeliveryNote = docType === 'delivery_note'
  const isRealInvoice = docType === 'invoice'
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => router.back()}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <div className="flex flex-wrap items-center gap-2 sm:gap-3">
              <h1 className="font-display text-2xl sm:text-3xl font-medium tracking-tight">{invoice.invoice_number}</h1>
              {isProforma && (
                <Badge variant="secondary" className="bg-primary/10 text-primary">Proforma</Badge>
              )}
              {isDeliveryNote && (
                <Badge variant="secondary" className="bg-success/10 text-success">Följesedel</Badge>
              )}
              <Badge variant={status.variant as 'default' | 'secondary' | 'destructive'}>
                <StatusIcon className="mr-1 h-3 w-3" />
                {status.label}
              </Badge>
            </div>
            <p className="text-muted-foreground">
              Skapad {formatDate(invoice.created_at)}
              {invoice.sent_at && ` • Skickad ${formatDate(invoice.sent_at)}`}
            </p>
          </div>
        </div>

        {/* Actions */}
        <div className="flex flex-wrap items-center gap-2">
          {isProforma && invoice.status !== 'cancelled' && (
            <Button onClick={convertToInvoice} disabled={isConverting}>
              {isConverting ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <FileText className="mr-2 h-4 w-4" />
              )}
              Konvertera till faktura
            </Button>
          )}
          {invoice.status === 'draft' && !isDeliveryNote && (
            customerHasEmail ? (
              <Button onClick={sendInvoiceEmail} disabled={isSendingEmail}>
                {isSendingEmail ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Mail className="mr-2 h-4 w-4" />
                )}
                Skicka via e-post
              </Button>
            ) : (
              <Button variant="secondary" onClick={() => updateStatus('sent')} disabled={isUpdating}>
                <Send className="mr-2 h-4 w-4" />
                Skickad manuellt
              </Button>
            )
          )}
          {isDeliveryNote && invoice.status === 'draft' && (
            <Button variant="secondary" onClick={() => updateStatus('sent')} disabled={isUpdating}>
              <Send className="mr-2 h-4 w-4" />
              Skickad manuellt
            </Button>
          )}
          {(invoice.status === 'sent' || invoice.status === 'overdue') && isRealInvoice && (
            <Button onClick={() => updateStatus('paid')} disabled={isUpdating}>
              <CheckCircle className="mr-2 h-4 w-4" />
              Markera som betald
            </Button>
          )}
          <Button variant="outline" onClick={downloadPDF} disabled={isDownloading}>
            {isDownloading ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Download className="mr-2 h-4 w-4" />
            )}
            Ladda ner PDF
          </Button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Main content */}
        <div className="lg:col-span-2 space-y-6">
          {/* Customer info */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Building className="h-5 w-5" />
                Kund
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <p className="font-medium text-lg">{customer.name}</p>
                {customer.org_number && (
                  <p className="text-muted-foreground">Org.nr: {customer.org_number}</p>
                )}
                {customer.vat_number && (
                  <p className="text-muted-foreground">VAT: {customer.vat_number}</p>
                )}
                <div className="flex flex-wrap gap-4 pt-2">
                  {customer.email && (
                    <div className="flex items-center gap-1 text-sm text-muted-foreground">
                      <Mail className="h-4 w-4" />
                      {customer.email}
                    </div>
                  )}
                  {customer.phone && (
                    <div className="flex items-center gap-1 text-sm text-muted-foreground">
                      <Phone className="h-4 w-4" />
                      {customer.phone}
                    </div>
                  )}
                </div>
                {(customer.address_line1 || customer.city) && (
                  <div className="flex items-start gap-1 text-sm text-muted-foreground pt-1">
                    <MapPin className="h-4 w-4 mt-0.5" />
                    <div>
                      {customer.address_line1 && <p>{customer.address_line1}</p>}
                      {customer.address_line2 && <p>{customer.address_line2}</p>}
                      <p>
                        {customer.postal_code} {customer.city}
                        {customer.country !== 'SE' && `, ${customer.country}`}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Invoice items */}
          <Card>
            <CardHeader>
              <CardTitle>Fakturarader</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {/* Header — desktop */}
                <div className="hidden sm:grid grid-cols-12 gap-4 text-sm font-medium text-muted-foreground border-b pb-2">
                  <div className="col-span-5">Beskrivning</div>
                  <div className="col-span-2 text-right">Antal</div>
                  <div className="col-span-1 text-center">Enhet</div>
                  <div className="col-span-2 text-right">à-pris</div>
                  <div className="col-span-2 text-right">Summa</div>
                </div>

                {/* Items — desktop */}
                <div className="hidden sm:block space-y-4">
                  {invoice.items.map((item) => (
                    <div key={item.id} className="grid grid-cols-12 gap-4 text-sm">
                      <div className="col-span-5">{item.description}</div>
                      <div className="col-span-2 text-right">{item.quantity}</div>
                      <div className="col-span-1 text-center">{item.unit}</div>
                      <div className="col-span-2 text-right">
                        {formatCurrency(item.unit_price, invoice.currency)}
                      </div>
                      <div className="col-span-2 text-right font-medium">
                        {formatCurrency(item.line_total, invoice.currency)}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Items — mobile cards */}
                <div className="sm:hidden space-y-2">
                  {invoice.items.map((item) => (
                    <div key={item.id} className="border rounded-lg p-3 text-sm space-y-1.5">
                      <p className="font-medium">{item.description}</p>
                      <div className="flex items-center justify-between text-muted-foreground">
                        <span>{item.quantity} {item.unit} × {formatCurrency(item.unit_price, invoice.currency)}</span>
                      </div>
                      <p className="text-right font-medium">
                        {formatCurrency(item.line_total, invoice.currency)}
                      </p>
                    </div>
                  ))}
                </div>

                <Separator />

                {/* Totals */}
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Delsumma</span>
                    <span>{formatCurrency(invoice.subtotal, invoice.currency)}</span>
                  </div>
                  {(() => {
                    const vatByRate = new Map<number, number>()
                    for (const item of invoice.items) {
                      const rate = item.vat_rate ?? 0
                      const lineVat = Math.round(item.line_total * (rate / 100) * 100) / 100
                      vatByRate.set(rate, (vatByRate.get(rate) || 0) + lineVat)
                    }
                    const entries = Array.from(vatByRate.entries())
                      .filter(([, vat]) => vat > 0)
                      .sort(([a], [b]) => b - a)

                    if (entries.length === 0) {
                      return (
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Moms</span>
                          <span>{formatCurrency(0, invoice.currency)}</span>
                        </div>
                      )
                    }

                    return entries.map(([rate, vat]) => (
                      <div key={rate} className="flex justify-between">
                        <span className="text-muted-foreground">Moms {rate}%</span>
                        <span>{formatCurrency(vat, invoice.currency)}</span>
                      </div>
                    ))
                  })()}
                  <Separator />
                  <div className="flex justify-between font-bold text-lg">
                    <span>Totalt</span>
                    <span>{formatCurrency(invoice.total, invoice.currency)}</span>
                  </div>
                  {invoice.currency !== 'SEK' && invoice.total_sek && (
                    <div className="flex justify-between text-sm text-muted-foreground">
                      <span>I SEK (kurs {invoice.exchange_rate})</span>
                      <span>{formatCurrency(invoice.total_sek)}</span>
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Notes */}
          {(invoice.notes || invoice.reverse_charge_text) && (
            <Card>
              <CardHeader>
                <CardTitle>Anteckningar</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {invoice.reverse_charge_text && (
                  <div className="p-3 bg-muted rounded-lg">
                    <p className="text-sm font-medium">Omvänd skattskyldighet</p>
                    <p className="text-sm text-muted-foreground">{invoice.reverse_charge_text}</p>
                  </div>
                )}
                {invoice.notes && <p className="text-sm">{invoice.notes}</p>}
              </CardContent>
            </Card>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Invoice details */}
          <Card>
            <CardHeader>
              <CardTitle>Detaljer</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Fakturanummer</span>
                <span className="font-medium">{invoice.invoice_number}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Fakturadatum</span>
                <span>{formatDate(invoice.invoice_date)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Förfallodatum</span>
                <span>{formatDate(invoice.due_date)}</span>
              </div>
              <Separator />
              <div className="flex justify-between">
                <span className="text-muted-foreground">Valuta</span>
                <span>{invoice.currency}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Momsbehandling</span>
                <span className="text-right text-sm">
                  {getVatTreatmentLabel(invoice.vat_treatment)}
                </span>
              </div>
              {invoice.your_reference && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Er referens</span>
                  <span>{invoice.your_reference}</span>
                </div>
              )}
              {invoice.our_reference && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Vår referens</span>
                  <span>{invoice.our_reference}</span>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Payment info */}
          {invoice.status === 'paid' && invoice.paid_at && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-success">
                  <CheckCircle className="h-5 w-5" />
                  Betald
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  Betalning mottagen {formatDate(invoice.paid_at)}
                </p>
                {invoice.paid_amount && (
                  <p className="text-lg font-bold mt-2">
                    {formatCurrency(invoice.paid_amount, invoice.currency)}
                  </p>
                )}
              </CardContent>
            </Card>
          )}

          {/* Reminders Card */}
          {(invoice.status === 'sent' || invoice.status === 'overdue' || reminders.length > 0) && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Bell className="h-5 w-5" />
                  Påminnelser
                </CardTitle>
                {reminders.length === 0 && (
                  <CardDescription>
                    Automatiska påminnelser skickas vid 15, 30 och 45 dagars förfallen betalning
                  </CardDescription>
                )}
              </CardHeader>
              <CardContent>
                {reminders.length > 0 ? (
                  <div className="space-y-3">
                    {reminders.map((reminder) => (
                      <div
                        key={reminder.id}
                        className="flex items-start justify-between p-3 bg-muted rounded-lg"
                      >
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <Badge
                              variant={reminder.reminder_level === 3 ? 'destructive' : reminder.reminder_level === 2 ? 'default' : 'secondary'}
                              className="text-xs"
                            >
                              Nivå {reminder.reminder_level}
                            </Badge>
                            <span className="text-sm font-medium">
                              {reminderLevelLabels[reminder.reminder_level as 1 | 2 | 3]}
                            </span>
                          </div>
                          <p className="text-xs text-muted-foreground">
                            Skickad {formatDate(reminder.sent_at)} till {reminder.email_to}
                          </p>
                          {reminder.response_type && (
                            <div className="flex items-center gap-1 mt-1">
                              {reminder.response_type === 'marked_paid' ? (
                                <>
                                  <CheckCircle className="h-3 w-3 text-success" />
                                  <span className="text-xs text-success">Kunden markerat som betald</span>
                                </>
                              ) : (
                                <>
                                  <MessageSquare className="h-3 w-3 text-orange-600" />
                                  <span className="text-xs text-orange-600">Kunden har invändningar</span>
                                </>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    Inga påminnelser har skickats ännu.
                  </p>
                )}
              </CardContent>
            </Card>
          )}

          {/* Credit note reference (if this invoice was credited) */}
          {invoice.status === 'credited' && creditNote && (
            <Card className="border-warning/50">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-warning">
                  <ReceiptText className="h-5 w-5" />
                  Krediterad
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground mb-2">
                  Denna faktura har krediterats
                </p>
                <Link href={`/invoices/${creditNote.id}`}>
                  <Button variant="outline" size="sm" className="w-full">
                    <ExternalLink className="mr-2 h-4 w-4" />
                    Se kreditfaktura {creditNote.invoice_number}
                  </Button>
                </Link>
              </CardContent>
            </Card>
          )}

          {/* Original invoice reference (if this is a credit note) */}
          {invoice.credited_invoice_id && originalInvoice && (
            <Card className="border-primary/50">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <ReceiptText className="h-5 w-5" />
                  Kreditfaktura
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground mb-2">
                  Denna kreditfaktura krediterar
                </p>
                <Link href={`/invoices/${originalInvoice.id}`}>
                  <Button variant="outline" size="sm" className="w-full">
                    <ExternalLink className="mr-2 h-4 w-4" />
                    Se faktura {originalInvoice.invoice_number}
                  </Button>
                </Link>
              </CardContent>
            </Card>
          )}

          {/* Converted from proforma */}
          {convertedFromInvoice && (
            <Card className="border-blue-300">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-blue-600">
                  <FileText className="h-5 w-5" />
                  Konverterad
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground mb-2">
                  Konverterad från proformafaktura
                </p>
                <Link href={`/invoices/${convertedFromInvoice.id}`}>
                  <Button variant="outline" size="sm" className="w-full">
                    <ExternalLink className="mr-2 h-4 w-4" />
                    Se proforma {convertedFromInvoice.invoice_number}
                  </Button>
                </Link>
              </CardContent>
            </Card>
          )}

          {/* Status actions */}
          {invoice.status !== 'cancelled' && invoice.status !== 'credited' && !invoice.credited_invoice_id && (
            <Card>
              <CardHeader>
                <CardTitle>Åtgärder</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {isProforma && (
                  <>
                    <Button
                      className="w-full"
                      onClick={convertToInvoice}
                      disabled={isConverting}
                    >
                      {isConverting ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <FileText className="mr-2 h-4 w-4" />
                      )}
                      Konvertera till faktura
                    </Button>
                    <Button
                      variant="outline"
                      className="w-full"
                      onClick={() => updateStatus('cancelled')}
                      disabled={isUpdating}
                    >
                      <XCircle className="mr-2 h-4 w-4" />
                      Makulera
                    </Button>
                  </>
                )}
                {!isProforma && invoice.status === 'draft' && (
                  <>
                    {!isDeliveryNote && customerHasEmail ? (
                      <>
                        <Button
                          className="w-full"
                          onClick={sendInvoiceEmail}
                          disabled={isSendingEmail}
                        >
                          {isSendingEmail ? (
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          ) : (
                            <Mail className="mr-2 h-4 w-4" />
                          )}
                          Skicka via e-post
                        </Button>
                        <Button
                          variant="ghost"
                          className="w-full text-muted-foreground"
                          onClick={() => updateStatus('sent')}
                          disabled={isUpdating}
                        >
                          <Send className="mr-2 h-4 w-4" />
                          Skickad manuellt
                        </Button>
                        <p className="text-[11px] text-muted-foreground/60 px-1 -mt-1">
                          Använd om du redan skickat fakturan på annat sätt (post, annat system)
                        </p>
                      </>
                    ) : (
                      <>
                        {!isDeliveryNote && (
                          <div className="flex items-start gap-2 p-3 bg-yellow-50 border border-yellow-200 rounded-lg mb-2 dark:bg-yellow-950/30 dark:border-yellow-800">
                            <AlertTriangle className="h-4 w-4 text-yellow-600 dark:text-yellow-500 mt-0.5 flex-shrink-0" />
                            <p className="text-xs text-yellow-700 dark:text-yellow-400">
                              Kunden saknar e-postadress. Lägg till e-post för att kunna skicka fakturan digitalt.
                            </p>
                          </div>
                        )}
                        <Button
                          className="w-full"
                          onClick={() => updateStatus('sent')}
                          disabled={isUpdating}
                        >
                          <Send className="mr-2 h-4 w-4" />
                          Skickad manuellt
                        </Button>
                        <p className="text-[11px] text-muted-foreground/60 px-1 -mt-1">
                          Markerar fakturan som skickad och skapar bokföringsverifikation
                        </p>
                      </>
                    )}
                    <Button
                      variant="outline"
                      className="w-full text-destructive hover:text-destructive"
                      onClick={() => updateStatus('cancelled')}
                      disabled={isUpdating}
                    >
                      <Trash2 className="mr-2 h-4 w-4" />
                      Ta bort utkast
                    </Button>
                  </>
                )}
                {(invoice.status === 'sent' || invoice.status === 'overdue') && isRealInvoice && (
                  <>
                    <Button
                      className="w-full"
                      onClick={() => updateStatus('paid')}
                      disabled={isUpdating}
                    >
                      <CheckCircle className="mr-2 h-4 w-4" />
                      Markera som betald
                    </Button>
                    <Link href={`/invoices/${invoice.id}/credit`} className="block">
                      <Button variant="outline" className="w-full">
                        <ReceiptText className="mr-2 h-4 w-4" />
                        Skapa kreditfaktura
                      </Button>
                    </Link>
                  </>
                )}
                {invoice.status === 'paid' && isRealInvoice && (
                  <Link href={`/invoices/${invoice.id}/credit`} className="block">
                    <Button variant="outline" className="w-full">
                      <ReceiptText className="mr-2 h-4 w-4" />
                      Skapa kreditfaktura
                    </Button>
                  </Link>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}
