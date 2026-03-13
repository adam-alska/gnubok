'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { PageHeader } from '@/components/ui/page-header'
import { useToast } from '@/components/ui/use-toast'
import { formatCurrency, formatDate } from '@/lib/utils'
import { Plus, Search, Receipt, FileText, Send, CheckCircle, Clock, XCircle, ReceiptText, FileQuestion, Truck } from 'lucide-react'
import { EmptyInvoices } from '@/components/ui/empty-state'
import type { Invoice, InvoiceStatus } from '@/types'

const statusConfig: Record<InvoiceStatus, { label: string; variant: 'default' | 'secondary' | 'success' | 'warning' | 'destructive'; icon: React.ElementType; borderColor: string }> = {
  draft: { label: 'Utkast', variant: 'secondary', icon: FileText, borderColor: 'border-l-muted-foreground/30' },
  sent: { label: 'Skickad', variant: 'default', icon: Send, borderColor: 'border-l-warning' },
  paid: { label: 'Betald', variant: 'success', icon: CheckCircle, borderColor: 'border-l-success' },
  overdue: { label: 'Förfallen', variant: 'destructive', icon: Clock, borderColor: 'border-l-destructive' },
  cancelled: { label: 'Makulerad', variant: 'secondary', icon: XCircle, borderColor: 'border-l-muted-foreground/30' },
  credited: { label: 'Krediterad', variant: 'secondary', icon: XCircle, borderColor: 'border-l-muted-foreground/30' },
}

function getRelativeTimeLabel(dueDateStr: string, status: InvoiceStatus): { text: string; color: string } | null {
  if (status === 'paid' || status === 'cancelled' || status === 'credited' || status === 'draft') return null

  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const dueDate = new Date(dueDateStr)
  dueDate.setHours(0, 0, 0, 0)
  const diffDays = Math.round((dueDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))

  if (diffDays < 0) {
    return { text: `${Math.abs(diffDays)} dagar försenad`, color: 'text-destructive' }
  } else if (diffDays === 0) {
    return { text: 'Förfaller idag', color: 'text-warning-foreground' }
  } else if (diffDays <= 3) {
    return { text: `${diffDays} dagar kvar`, color: 'text-warning-foreground' }
  } else if (diffDays <= 7) {
    return { text: `${diffDays} dagar kvar`, color: 'text-muted-foreground' }
  }
  return null
}

export default function InvoicesPage() {
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [activeTab, setActiveTab] = useState('all')
  const { toast } = useToast()
  const supabase = createClient()

  async function fetchInvoices() {
    setIsLoading(true)
    const { data, error } = await supabase
      .from('invoices')
      .select('*, customer:customers(name)')
      .order('invoice_date', { ascending: false })

    if (error) {
      toast({
        title: 'Fel',
        description: 'Kunde inte hämta fakturor',
        variant: 'destructive',
      })
    } else {
      setInvoices(data || [])
    }
    setIsLoading(false)
  }

  useEffect(() => {
    fetchInvoices()
  }, [])

  const filteredInvoices = invoices.filter((invoice) => {
    const matchesSearch =
      invoice.invoice_number.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (invoice.customer as { name: string })?.name?.toLowerCase().includes(searchTerm.toLowerCase())

    const isCreditNote = !!invoice.credited_invoice_id
    const docType = (invoice as Invoice & { document_type?: string }).document_type || 'invoice'
    const matchesTab =
      activeTab === 'all' ||
      (activeTab === 'unpaid' && ['sent', 'overdue'].includes(invoice.status) && !isCreditNote && docType === 'invoice') ||
      (activeTab === 'credit' && isCreditNote) ||
      (activeTab === 'proforma' && docType === 'proforma') ||
      (activeTab === 'delivery_note' && docType === 'delivery_note') ||
      (activeTab !== 'proforma' && activeTab !== 'delivery_note' && invoice.status === activeTab)

    return matchesSearch && matchesTab
  })

  const stats = {
    unpaid: invoices.filter((i) => ['sent', 'overdue'].includes(i.status)).length,
    unpaidAmount: invoices
      .filter((i) => ['sent', 'overdue'].includes(i.status))
      .reduce((sum, i) => sum + Number(i.total_sek || i.total), 0),
    overdue: invoices.filter((i) => i.status === 'overdue').length,
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Fakturor"
        description="Skapa och hantera dina fakturor"
        action={
          <Link href="/invoices/new">
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              Ny faktura
            </Button>
          </Link>
        }
      />

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-3">
        {isLoading ? (
          <>
            {[1, 2, 3].map((i) => (
              <Card key={i}>
                <CardContent className="pt-6">
                  <div className="flex items-center gap-4">
                    <div className="h-12 w-12 rounded-lg bg-muted animate-pulse" />
                    <div className="space-y-2">
                      <div className="h-3.5 bg-muted rounded w-20 animate-pulse" />
                      <div className="h-7 bg-muted rounded w-16 animate-pulse" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </>
        ) : (
          <>
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-4">
                  <div className="h-12 w-12 rounded-lg bg-muted flex items-center justify-center">
                    <Receipt className="h-6 w-6 text-muted-foreground" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Totalt antal</p>
                    <p className="text-2xl font-bold tabular-nums">{invoices.length}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-4">
                  <div className="h-12 w-12 rounded-lg bg-muted flex items-center justify-center">
                    <Clock className="h-6 w-6 text-muted-foreground" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Obetalda</p>
                    <div className="flex items-center gap-2">
                      <p className="text-2xl font-bold tabular-nums">{stats.unpaid}</p>
                      {stats.overdue > 0 && (
                        <Badge variant="destructive" className="text-xs">
                          {stats.overdue} förfallna
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-4">
                  <div className="h-12 w-12 rounded-lg bg-muted flex items-center justify-center">
                    <Send className="h-6 w-6 text-muted-foreground" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Att få in</p>
                    <p className="text-2xl font-bold tabular-nums">{formatCurrency(stats.unpaidAmount)}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </>
        )}
      </div>

      {/* Search and tabs */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Sök på fakturanummer eller kund..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="all">Alla</TabsTrigger>
            <TabsTrigger value="unpaid">Obetalda</TabsTrigger>
            <TabsTrigger value="paid">Betalda</TabsTrigger>
            <TabsTrigger value="draft">Utkast</TabsTrigger>
            <TabsTrigger value="proforma">Proforma</TabsTrigger>
            <TabsTrigger value="delivery_note">Följesedel</TabsTrigger>
            <TabsTrigger value="credit">Kredit</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {/* Invoice list */}
      {isLoading ? (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="animate-pulse">
              <CardContent className="py-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-2">
                    <div className="h-5 bg-muted rounded w-32" />
                    <div className="h-4 bg-muted rounded w-48" />
                  </div>
                  <div className="h-8 bg-muted rounded w-24" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : filteredInvoices.length === 0 ? (
        <Card>
          <CardContent>
            {searchTerm ? (
              <div className="flex flex-col items-center justify-center py-12">
                <Receipt className="h-12 w-12 text-muted-foreground mb-4" />
                <h3 className="text-lg font-medium">Inga träffar</h3>
                <p className="text-muted-foreground text-center mt-1">
                  Inga fakturor matchar &quot;{searchTerm}&quot;
                </p>
              </div>
            ) : invoices.length === 0 ? (
              <EmptyInvoices />
            ) : (
              <div className="flex flex-col items-center justify-center py-12">
                <Receipt className="h-12 w-12 text-muted-foreground mb-4" />
                <h3 className="text-lg font-medium">Inga fakturor i denna kategori</h3>
                <p className="text-muted-foreground text-center mt-1">
                  Prova att byta flik för att se fler fakturor
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {filteredInvoices.map((invoice) => {
            const status = statusConfig[invoice.status]
            const isCreditNote = !!invoice.credited_invoice_id
            const docType = (invoice as Invoice & { document_type?: string }).document_type || 'invoice'
            const isProforma = docType === 'proforma'
            const isDeliveryNote = docType === 'delivery_note'
            const StatusIcon = isCreditNote ? ReceiptText : isProforma ? FileQuestion : isDeliveryNote ? Truck : status.icon
            const relativeTime = invoice.due_date ? getRelativeTimeLabel(invoice.due_date, invoice.status) : null
            const borderClass = isCreditNote ? 'border-l-4 border-l-destructive/50' : isProforma ? 'border-l-4 border-l-blue-400' : isDeliveryNote ? 'border-l-4 border-l-emerald-400' : `border-l-4 ${status.borderColor}`

            return (
              <Link key={invoice.id} href={`/invoices/${invoice.id}`}>
                <Card className={`hover:border-primary/50 transition-colors cursor-pointer ${borderClass} ${invoice.status === 'overdue' ? 'ring-1 ring-destructive/20' : ''}`}>
                  <CardContent className="py-4">
                    <div className="flex items-start gap-3 sm:gap-4 sm:items-center">
                      <div className={`h-10 w-10 rounded-lg flex items-center justify-center shrink-0 ${isCreditNote ? 'bg-destructive/10' : 'bg-muted'}`}>
                        <StatusIcon className={`h-5 w-5 ${isCreditNote ? 'text-destructive' : 'text-muted-foreground'}`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start sm:items-center justify-between gap-2">
                          <p className="font-medium truncate">{invoice.invoice_number}</p>
                          <p className={`font-medium tabular-nums shrink-0 ${isCreditNote ? 'text-destructive' : ''}`}>
                            {formatCurrency(Number(invoice.total), invoice.currency)}
                          </p>
                        </div>
                        <p className="text-sm text-muted-foreground truncate">
                          {(invoice.customer as { name: string })?.name} · {formatDate(invoice.invoice_date)}
                        </p>
                        <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                          {isCreditNote && (
                            <Badge variant="destructive" className="text-xs">
                              Kredit
                            </Badge>
                          )}
                          {isProforma && (
                            <Badge variant="secondary" className="text-xs bg-blue-100 text-blue-700">
                              Proforma
                            </Badge>
                          )}
                          {isDeliveryNote && (
                            <Badge variant="secondary" className="text-xs bg-emerald-100 text-emerald-700">
                              Följesedel
                            </Badge>
                          )}
                          <Badge variant={status.variant as 'default' | 'secondary' | 'destructive'}>
                            {status.label}
                          </Badge>
                          {relativeTime && (
                            <span className={`text-xs font-medium ${relativeTime.color}`}>
                              {relativeTime.text}
                            </span>
                          )}
                        </div>
                        {invoice.currency !== 'SEK' && invoice.total_sek && (
                          <p className={`text-xs tabular-nums mt-0.5 ${isCreditNote ? 'text-destructive/70' : 'text-muted-foreground'}`}>
                            {formatCurrency(Number(invoice.total_sek))}
                          </p>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
