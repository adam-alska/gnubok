'use client'

import { useState, useEffect, use } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { useToast } from '@/components/ui/use-toast'
import { formatCurrency, formatDate } from '@/lib/utils'
import { DocumentStatusBadge } from '@/components/invoices/DocumentStatusBadge'
import { ConversionPipeline } from '@/components/invoices/ConversionPipeline'
import {
  Loader2,
  ArrowLeft,
  Send,
  ShoppingCart,
  Receipt,
  Building,
  Mail,
  Phone,
  MapPin,
  XCircle,
  CheckCircle,
} from 'lucide-react'
import type { Quote, QuoteItem } from '@/types/invoices-enhanced'
import type { Customer } from '@/types'

interface QuoteWithRelations extends Quote {
  customer: Customer
  items: QuoteItem[]
}

export default function QuoteDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const { toast } = useToast()
  const supabase = createClient()

  const [quote, setQuote] = useState<QuoteWithRelations | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isConverting, setIsConverting] = useState(false)
  const [isUpdating, setIsUpdating] = useState(false)

  useEffect(() => {
    fetchQuote()
  }, [id])

  async function fetchQuote() {
    setIsLoading(true)

    const { data, error } = await supabase
      .from('quotes')
      .select('*, customer:customers(*), items:quote_items(*)')
      .eq('id', id)
      .single()

    if (error || !data) {
      toast({
        title: 'Fel',
        description: 'Kunde inte hämta offert',
        variant: 'destructive',
      })
      router.push('/quotes')
      return
    }

    if (data.items) {
      (data.items as Array<{ sort_order: number }>).sort((a, b) => a.sort_order - b.sort_order)
    }

    setQuote(data as unknown as QuoteWithRelations)
    setIsLoading(false)
  }

  async function convertTo(target: 'order' | 'invoice') {
    if (!quote) return
    setIsConverting(true)

    try {
      const response = await fetch(`/api/quotes/${quote.id}/convert`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target }),
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || 'Konvertering misslyckades')
      }

      toast({
        title: target === 'order' ? 'Order skapad' : 'Faktura skapad',
        description: `Offerten har konverterats till ${target === 'order' ? 'en order' : 'en faktura'}`,
      })

      if (target === 'order') {
        router.push(`/orders/${result.data.id}`)
      } else {
        router.push(`/invoices/${result.data.id}`)
      }
    } catch (error) {
      toast({
        title: 'Fel',
        description: error instanceof Error ? error.message : 'Något gick fel',
        variant: 'destructive',
      })
    } finally {
      setIsConverting(false)
    }
  }

  async function updateStatus(status: string) {
    if (!quote) return
    setIsUpdating(true)

    try {
      const response = await fetch(`/api/quotes/${quote.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      })

      if (!response.ok) {
        throw new Error('Kunde inte uppdatera status')
      }

      toast({ title: 'Uppdaterad', description: 'Status har ändrats' })
      fetchQuote()
    } catch {
      toast({
        title: 'Fel',
        description: 'Kunde inte uppdatera status',
        variant: 'destructive',
      })
    } finally {
      setIsUpdating(false)
    }
  }

  async function sendQuote() {
    if (!quote) return
    setIsUpdating(true)

    try {
      const response = await fetch(`/api/quotes/${quote.id}/send`, {
        method: 'POST',
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || 'Kunde inte skicka offert')
      }

      toast({ title: 'Skickad', description: result.message })
      fetchQuote()
    } catch (error) {
      toast({
        title: 'Fel',
        description: error instanceof Error ? error.message : 'Något gick fel',
        variant: 'destructive',
      })
    } finally {
      setIsUpdating(false)
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  if (!quote) return null

  const customer = quote.customer
  const canConvert = ['draft', 'sent', 'accepted'].includes(quote.status)

  // Build pipeline stages
  const pipelineStages = [
    {
      type: 'quote' as const,
      id: quote.id,
      number: quote.quote_number,
      status: quote.status,
      date: quote.quote_date,
    },
    {
      type: 'order' as const,
      id: quote.converted_to_order_id,
      number: null,
      status: null,
      date: null,
    },
    {
      type: 'invoice' as const,
      id: quote.converted_to_invoice_id,
      number: null,
      status: null,
      date: null,
    },
  ]

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => router.back()}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-bold tracking-tight">{quote.quote_number}</h1>
              <DocumentStatusBadge type="quote" status={quote.status} />
            </div>
            <p className="text-muted-foreground">
              Skapad {formatDate(quote.created_at)}
              {quote.valid_until && ` - Giltig till ${formatDate(quote.valid_until)}`}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {quote.status === 'draft' && (
            <Button onClick={sendQuote} disabled={isUpdating}>
              <Send className="mr-2 h-4 w-4" />
              Skicka offert
            </Button>
          )}
          {canConvert && (
            <>
              <Button
                variant="outline"
                onClick={() => convertTo('order')}
                disabled={isConverting}
              >
                <ShoppingCart className="mr-2 h-4 w-4" />
                Konvertera till order
              </Button>
              <Button
                variant="outline"
                onClick={() => convertTo('invoice')}
                disabled={isConverting}
              >
                <Receipt className="mr-2 h-4 w-4" />
                Konvertera till faktura
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Pipeline */}
      <ConversionPipeline stages={pipelineStages} currentStage="quote" />

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Main content */}
        <div className="lg:col-span-2 space-y-6">
          {/* Customer */}
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
                      <p>
                        {customer.postal_code} {customer.city}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Items */}
          <Card>
            <CardHeader>
              <CardTitle>Offertrader</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="grid grid-cols-12 gap-4 text-sm font-medium text-muted-foreground border-b pb-2">
                  <div className="col-span-5">Beskrivning</div>
                  <div className="col-span-2 text-right">Antal</div>
                  <div className="col-span-1 text-center">Enhet</div>
                  <div className="col-span-2 text-right">a-pris</div>
                  <div className="col-span-2 text-right">Summa</div>
                </div>

                {quote.items.map((item) => (
                  <div key={item.id} className="grid grid-cols-12 gap-4 text-sm">
                    <div className="col-span-5">{item.description}</div>
                    <div className="col-span-2 text-right">{item.quantity}</div>
                    <div className="col-span-1 text-center">{item.unit}</div>
                    <div className="col-span-2 text-right">
                      {formatCurrency(item.unit_price, quote.currency)}
                    </div>
                    <div className="col-span-2 text-right font-medium">
                      {formatCurrency(item.line_total, quote.currency)}
                    </div>
                  </div>
                ))}

                <Separator />

                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Delsumma</span>
                    <span>{formatCurrency(Number(quote.subtotal), quote.currency)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Moms ({quote.vat_rate || 25}%)</span>
                    <span>{formatCurrency(Number(quote.vat_amount), quote.currency)}</span>
                  </div>
                  <Separator />
                  <div className="flex justify-between font-bold text-lg">
                    <span>Totalt</span>
                    <span>{formatCurrency(Number(quote.total), quote.currency)}</span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {quote.notes && (
            <Card>
              <CardHeader>
                <CardTitle>Anteckningar</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm">{quote.notes}</p>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Detaljer</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Offertnummer</span>
                <span className="font-medium">{quote.quote_number}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Offertdatum</span>
                <span>{formatDate(quote.quote_date)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Giltig till</span>
                <span>{formatDate(quote.valid_until)}</span>
              </div>
              <Separator />
              <div className="flex justify-between">
                <span className="text-muted-foreground">Valuta</span>
                <span>{quote.currency}</span>
              </div>
              {quote.your_reference && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Er referens</span>
                  <span>{quote.your_reference}</span>
                </div>
              )}
              {quote.our_reference && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Vår referens</span>
                  <span>{quote.our_reference}</span>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Actions */}
          {quote.status !== 'converted' && quote.status !== 'rejected' && (
            <Card>
              <CardHeader>
                <CardTitle>Åtgärder</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {quote.status === 'draft' && (
                  <Button className="w-full" onClick={sendQuote} disabled={isUpdating}>
                    <Send className="mr-2 h-4 w-4" />
                    Markera som skickad
                  </Button>
                )}
                {quote.status === 'sent' && (
                  <Button
                    className="w-full"
                    onClick={() => updateStatus('accepted')}
                    disabled={isUpdating}
                  >
                    <CheckCircle className="mr-2 h-4 w-4" />
                    Markera som accepterad
                  </Button>
                )}
                {canConvert && (
                  <>
                    <Button
                      variant="outline"
                      className="w-full"
                      onClick={() => convertTo('order')}
                      disabled={isConverting}
                    >
                      {isConverting ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <ShoppingCart className="mr-2 h-4 w-4" />
                      )}
                      Konvertera till order
                    </Button>
                    <Button
                      variant="outline"
                      className="w-full"
                      onClick={() => convertTo('invoice')}
                      disabled={isConverting}
                    >
                      {isConverting ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <Receipt className="mr-2 h-4 w-4" />
                      )}
                      Konvertera till faktura
                    </Button>
                  </>
                )}
                {(quote.status === 'draft' || quote.status === 'sent') && (
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={() => updateStatus('rejected')}
                    disabled={isUpdating}
                  >
                    <XCircle className="mr-2 h-4 w-4" />
                    Markera som avvisad
                  </Button>
                )}
              </CardContent>
            </Card>
          )}

          {/* Converted references */}
          {quote.converted_to_order_id && (
            <Card className="border-success/50">
              <CardContent className="pt-6">
                <p className="text-sm text-muted-foreground mb-2">Konverterad till order</p>
                <Link href={`/orders/${quote.converted_to_order_id}`}>
                  <Button variant="outline" size="sm" className="w-full">
                    <ShoppingCart className="mr-2 h-4 w-4" />
                    Visa order
                  </Button>
                </Link>
              </CardContent>
            </Card>
          )}

          {quote.converted_to_invoice_id && (
            <Card className="border-success/50">
              <CardContent className="pt-6">
                <p className="text-sm text-muted-foreground mb-2">Konverterad till faktura</p>
                <Link href={`/invoices/${quote.converted_to_invoice_id}`}>
                  <Button variant="outline" size="sm" className="w-full">
                    <Receipt className="mr-2 h-4 w-4" />
                    Visa faktura
                  </Button>
                </Link>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}
