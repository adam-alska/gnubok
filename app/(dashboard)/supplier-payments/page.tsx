'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useToast } from '@/components/ui/use-toast'
import {
  Loader2,
  Download,
  Banknote,
  CheckCircle,
  Send,
  FileText,
  Plus,
} from 'lucide-react'
import PaymentBatchCreator from '@/components/suppliers/PaymentBatchCreator'
import type { SupplierPayment, SupplierPaymentStatus } from '@/types/suppliers'
import { SUPPLIER_PAYMENT_STATUS_LABELS } from '@/types/suppliers'

function formatCurrency(amount: number) {
  return new Intl.NumberFormat('sv-SE', {
    style: 'currency',
    currency: 'SEK',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount)
}

function formatDate(dateStr: string | null) {
  if (!dateStr) return '-'
  return new Intl.DateTimeFormat('sv-SE').format(new Date(dateStr))
}

function getStatusVariant(status: SupplierPaymentStatus): 'default' | 'secondary' | 'outline' {
  switch (status) {
    case 'confirmed':
      return 'default'
    case 'sent':
      return 'outline'
    default:
      return 'secondary'
  }
}

export default function SupplierPaymentsPage() {
  const [payments, setPayments] = useState<SupplierPayment[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('batches')
  const [generatingFile, setGeneratingFile] = useState<string | null>(null)
  const [updatingStatus, setUpdatingStatus] = useState<string | null>(null)
  const { toast } = useToast()

  useEffect(() => {
    fetchPayments()
  }, [])

  async function fetchPayments() {
    setIsLoading(true)
    try {
      const response = await fetch('/api/supplier-payments?per_page=100')
      const result = await response.json()

      if (response.ok) {
        setPayments(result.data || [])
      }
    } catch {
      toast({
        title: 'Fel',
        description: 'Kunde inte hämta betalningar',
        variant: 'destructive',
      })
    }
    setIsLoading(false)
  }

  async function handleGenerateFile(paymentId: string) {
    setGeneratingFile(paymentId)
    try {
      const response = await fetch(`/api/supplier-payments/${paymentId}/generate-file`, {
        method: 'POST',
      })

      const result = await response.json()

      if (!response.ok) {
        toast({
          title: 'Fel',
          description: result.error || 'Kunde inte generera betalfil',
          variant: 'destructive',
        })
        return
      }

      // Download the file
      const blob = new Blob([result.data.file_content], { type: 'text/plain' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = result.data.filename
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)

      toast({
        title: 'Betalfil genererad',
        description: `${result.data.payment_count} betalningar, totalt ${formatCurrency(result.data.total_amount)}`,
      })

      fetchPayments()
    } catch {
      toast({
        title: 'Fel',
        description: 'Kunde inte generera betalfil',
        variant: 'destructive',
      })
    } finally {
      setGeneratingFile(null)
    }
  }

  async function handleUpdateStatus(paymentId: string, newStatus: string) {
    setUpdatingStatus(paymentId)
    try {
      const response = await fetch(`/api/supplier-payments/${paymentId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      })

      const result = await response.json()

      if (!response.ok) {
        toast({
          title: 'Fel',
          description: result.error || 'Kunde inte uppdatera status',
          variant: 'destructive',
        })
      } else {
        toast({
          title: 'Status uppdaterad',
          description: `Betalning markerad som ${SUPPLIER_PAYMENT_STATUS_LABELS[newStatus as SupplierPaymentStatus]}`,
        })
        fetchPayments()
      }
    } catch {
      toast({
        title: 'Fel',
        description: 'Kunde inte uppdatera status',
        variant: 'destructive',
      })
    } finally {
      setUpdatingStatus(null)
    }
  }

  function handleBatchCreated() {
    fetchPayments()
    setActiveTab('batches')
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Leverantörsbetalningar</h1>
          <p className="text-muted-foreground">
            Skapa betalningsbatcher och generera betalfiler
          </p>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="batches" className="gap-1">
            <Banknote className="h-4 w-4" />
            Betalningar
            {payments.length > 0 && (
              <Badge variant="secondary" className="ml-1">{payments.length}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="create" className="gap-1">
            <Plus className="h-4 w-4" />
            Ny betalning
          </TabsTrigger>
        </TabsList>

        <TabsContent value="batches">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : payments.length === 0 ? (
            <Card>
              <CardContent className="py-12">
                <div className="flex flex-col items-center text-center">
                  <Banknote className="h-12 w-12 text-muted-foreground mb-4" />
                  <h3 className="text-lg font-medium">Inga betalningar</h3>
                  <p className="text-muted-foreground mt-1">
                    Skapa din första betalning genom att välja godkända fakturor.
                  </p>
                  <Button className="mt-4" onClick={() => setActiveTab('create')}>
                    <Plus className="mr-2 h-4 w-4" />
                    Ny betalning
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {payments.map((payment) => (
                <Card key={payment.id}>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <div>
                        <CardTitle className="text-base">
                          Betalning {formatDate(payment.payment_date)}
                        </CardTitle>
                        <p className="text-sm text-muted-foreground">
                          {payment.payment_count} faktura{payment.payment_count !== 1 ? 'or' : ''} -
                          Skapad {formatDate(payment.created_at)}
                        </p>
                      </div>
                      <div className="flex items-center gap-3">
                        <p className="text-lg font-bold tabular-nums">
                          {formatCurrency(payment.total_amount)}
                        </p>
                        <Badge variant={getStatusVariant(payment.status)}>
                          {SUPPLIER_PAYMENT_STATUS_LABELS[payment.status]}
                        </Badge>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    {/* Payment items */}
                    {payment.items && payment.items.length > 0 && (
                      <div className="space-y-2 mb-4">
                        {payment.items.map((item) => (
                          <div key={item.id} className="flex items-center justify-between text-sm p-2 rounded border">
                            <div>
                              <span className="font-medium">
                                {item.supplier_invoice?.supplier?.name || 'Okänd'}
                              </span>
                              <span className="text-muted-foreground ml-2">
                                {item.supplier_invoice?.invoice_number || '-'}
                              </span>
                            </div>
                            <span className="tabular-nums font-medium">
                              {formatCurrency(item.amount)}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Actions */}
                    <div className="flex items-center gap-2 pt-3 border-t">
                      {payment.status === 'draft' && (
                        <>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleGenerateFile(payment.id)}
                            disabled={generatingFile === payment.id}
                          >
                            {generatingFile === payment.id ? (
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            ) : (
                              <FileText className="mr-2 h-4 w-4" />
                            )}
                            Generera betalfil
                          </Button>
                          <Button
                            size="sm"
                            onClick={() => handleUpdateStatus(payment.id, 'approved')}
                            disabled={updatingStatus === payment.id}
                          >
                            {updatingStatus === payment.id ? (
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            ) : (
                              <CheckCircle className="mr-2 h-4 w-4" />
                            )}
                            Godkänn
                          </Button>
                        </>
                      )}

                      {payment.status === 'approved' && (
                        <>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleGenerateFile(payment.id)}
                            disabled={generatingFile === payment.id}
                          >
                            {generatingFile === payment.id ? (
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            ) : (
                              <Download className="mr-2 h-4 w-4" />
                            )}
                            Ladda ner betalfil
                          </Button>
                          <Button
                            size="sm"
                            onClick={() => handleUpdateStatus(payment.id, 'sent')}
                            disabled={updatingStatus === payment.id}
                          >
                            {updatingStatus === payment.id ? (
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            ) : (
                              <Send className="mr-2 h-4 w-4" />
                            )}
                            Markera som skickad
                          </Button>
                        </>
                      )}

                      {payment.status === 'sent' && (
                        <Button
                          size="sm"
                          onClick={() => handleUpdateStatus(payment.id, 'confirmed')}
                          disabled={updatingStatus === payment.id}
                        >
                          {updatingStatus === payment.id ? (
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          ) : (
                            <CheckCircle className="mr-2 h-4 w-4" />
                          )}
                          Bekräfta genomförd
                        </Button>
                      )}

                      {payment.status === 'confirmed' && (
                        <span className="text-sm text-muted-foreground flex items-center gap-1">
                          <CheckCircle className="h-4 w-4 text-green-600" />
                          Betalning genomförd
                        </span>
                      )}

                      {payment.file_content && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            const blob = new Blob([payment.file_content!], { type: 'text/plain' })
                            const url = URL.createObjectURL(blob)
                            const a = document.createElement('a')
                            a.href = url
                            a.download = `LB_${payment.payment_date.replace(/-/g, '')}.txt`
                            document.body.appendChild(a)
                            a.click()
                            document.body.removeChild(a)
                            URL.revokeObjectURL(url)
                          }}
                        >
                          <Download className="mr-2 h-4 w-4" />
                          Ladda ner fil
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="create">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Välj fakturor att betala</CardTitle>
              <p className="text-sm text-muted-foreground">
                Markera de godkända fakturor som ska inkluderas i betalningen
              </p>
            </CardHeader>
            <CardContent>
              <PaymentBatchCreator onCreated={handleBatchCreated} />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
