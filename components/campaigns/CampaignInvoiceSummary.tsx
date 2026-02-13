'use client'

import { Invoice, PAYMENT_STATUS_LABELS } from '@/types'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import {
  FileText,
  Plus,
  ExternalLink,
  CheckCircle,
  Clock,
  AlertTriangle
} from 'lucide-react'
import Link from 'next/link'
import { cn } from '@/lib/utils'

interface CampaignInvoiceSummaryProps {
  campaignId: string
  invoices: Invoice[]
  totalValue: number | null
  currency: string
  onCreateInvoice?: () => void
}

export function CampaignInvoiceSummary({
  campaignId,
  invoices,
  totalValue,
  currency,
  onCreateInvoice
}: CampaignInvoiceSummaryProps) {
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('sv-SE', {
      style: 'currency',
      currency: currency || 'SEK',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount)
  }

  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString('sv-SE', {
      day: 'numeric',
      month: 'short',
    })
  }

  // Calculate totals
  const totalInvoiced = invoices.reduce((sum, inv) => sum + inv.total, 0)
  const totalPaid = invoices
    .filter(inv => inv.status === 'paid')
    .reduce((sum, inv) => sum + inv.total, 0)
  const invoicedPercentage = totalValue ? (totalInvoiced / totalValue) * 100 : 0
  const paidPercentage = totalValue ? (totalPaid / totalValue) * 100 : 0

  // Group by status
  const paidInvoices = invoices.filter(inv => inv.status === 'paid')
  const sentInvoices = invoices.filter(inv => inv.status === 'sent')
  const overdueInvoices = invoices.filter(inv => inv.status === 'overdue')
  const draftInvoices = invoices.filter(inv => inv.status === 'draft')

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'paid':
        return <CheckCircle className="h-4 w-4 text-success" />
      case 'overdue':
        return <AlertTriangle className="h-4 w-4 text-destructive" />
      default:
        return <Clock className="h-4 w-4 text-muted-foreground" />
    }
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'paid':
        return <Badge variant="outline" className="bg-green-100 text-green-700 border-green-200">Betald</Badge>
      case 'sent':
        return <Badge variant="outline" className="bg-blue-100 text-blue-700 border-blue-200">Skickad</Badge>
      case 'overdue':
        return <Badge variant="destructive">Förfallen</Badge>
      case 'draft':
        return <Badge variant="secondary">Utkast</Badge>
      default:
        return <Badge variant="outline">{status}</Badge>
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-medium">
          Fakturor
          <span className="text-muted-foreground ml-2">
            ({invoices.length})
          </span>
        </h3>
        {onCreateInvoice && (
          <Button size="sm" onClick={onCreateInvoice}>
            <Plus className="h-4 w-4 mr-1" />
            Skapa faktura
          </Button>
        )}
      </div>

      {/* Progress summary */}
      {totalValue && totalValue > 0 && (
        <Card>
          <CardContent className="pt-4">
            <div className="space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Fakturerat</span>
                <span className="font-medium">
                  {formatCurrency(totalInvoiced)} / {formatCurrency(totalValue)}
                </span>
              </div>
              <Progress value={invoicedPercentage} className="h-2" />

              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Betalt</span>
                <span className="font-medium text-success">
                  {formatCurrency(totalPaid)}
                </span>
              </div>
              <Progress value={paidPercentage} className="h-2 bg-muted [&>div]:bg-success" />

              {totalValue > totalInvoiced && (
                <p className="text-sm text-muted-foreground">
                  Kvar att fakturera: {formatCurrency(totalValue - totalInvoiced)}
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Invoice list */}
      {invoices.length > 0 ? (
        <div className="space-y-2">
          {invoices
            .sort((a, b) => new Date(b.invoice_date).getTime() - new Date(a.invoice_date).getTime())
            .map(invoice => (
              <Link key={invoice.id} href={`/invoices/${invoice.id}`}>
                <div className={cn(
                  'flex items-center gap-3 p-3 border rounded-lg hover:border-primary/50 transition-colors',
                  invoice.status === 'overdue' && 'border-destructive/50 bg-destructive/5'
                )}>
                  {getStatusIcon(invoice.status)}

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{invoice.invoice_number}</span>
                      {getStatusBadge(invoice.status)}
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {formatDate(invoice.invoice_date)}
                      {invoice.due_date && ` • Förfaller: ${formatDate(invoice.due_date)}`}
                    </p>
                  </div>

                  <div className="text-right">
                    <p className="font-medium">{formatCurrency(invoice.total)}</p>
                    {invoice.payment_status && (
                      <p className="text-xs text-muted-foreground">
                        {PAYMENT_STATUS_LABELS[invoice.payment_status]}
                      </p>
                    )}
                  </div>

                  <ExternalLink className="h-4 w-4 text-muted-foreground" />
                </div>
              </Link>
            ))}
        </div>
      ) : (
        <div className="text-center py-8 text-muted-foreground">
          <FileText className="h-12 w-12 mx-auto mb-2 opacity-50" />
          <p>Inga fakturor ännu</p>
          {onCreateInvoice && (
            <Button
              variant="outline"
              size="sm"
              className="mt-2"
              onClick={onCreateInvoice}
            >
              <Plus className="h-4 w-4 mr-1" />
              Skapa första fakturan
            </Button>
          )}
        </div>
      )}
    </div>
  )
}
