'use client'

import { Badge } from '@/components/ui/badge'
import {
  FileText,
  Send,
  CheckCircle,
  XCircle,
  Clock,
  AlertTriangle,
  ArrowRightLeft,
  Package,
  Truck,
  Receipt,
} from 'lucide-react'
import type { QuoteStatus, OrderStatus } from '@/types/invoices-enhanced'
import type { InvoiceStatus } from '@/types'
import {
  QUOTE_STATUS_LABELS,
  QUOTE_STATUS_VARIANT,
  ORDER_STATUS_LABELS,
  ORDER_STATUS_VARIANT,
} from '@/types/invoices-enhanced'

const quoteIcons: Record<QuoteStatus, React.ElementType> = {
  draft: FileText,
  sent: Send,
  accepted: CheckCircle,
  rejected: XCircle,
  expired: Clock,
  converted: ArrowRightLeft,
}

const orderIcons: Record<OrderStatus, React.ElementType> = {
  draft: FileText,
  confirmed: CheckCircle,
  in_progress: Package,
  delivered: Truck,
  invoiced: Receipt,
  cancelled: XCircle,
}

const invoiceStatusConfig: Record<InvoiceStatus, { label: string; variant: 'default' | 'secondary' | 'success' | 'warning' | 'destructive'; icon: React.ElementType }> = {
  draft: { label: 'Utkast', variant: 'secondary', icon: FileText },
  sent: { label: 'Skickad', variant: 'default', icon: Send },
  paid: { label: 'Betald', variant: 'success', icon: CheckCircle },
  overdue: { label: 'Forsenad', variant: 'destructive', icon: Clock },
  cancelled: { label: 'Makulerad', variant: 'secondary', icon: XCircle },
  credited: { label: 'Krediterad', variant: 'secondary', icon: XCircle },
}

interface DocumentStatusBadgeProps {
  type: 'quote' | 'order' | 'invoice'
  status: string
  className?: string
}

export function DocumentStatusBadge({ type, status, className }: DocumentStatusBadgeProps) {
  if (type === 'quote') {
    const quoteStatus = status as QuoteStatus
    const Icon = quoteIcons[quoteStatus] || FileText
    const label = QUOTE_STATUS_LABELS[quoteStatus] || status
    const variant = QUOTE_STATUS_VARIANT[quoteStatus] || 'secondary'

    return (
      <Badge variant={variant} className={className}>
        <Icon className="mr-1 h-3 w-3" />
        {label}
      </Badge>
    )
  }

  if (type === 'order') {
    const orderStatus = status as OrderStatus
    const Icon = orderIcons[orderStatus] || FileText
    const label = ORDER_STATUS_LABELS[orderStatus] || status
    const variant = ORDER_STATUS_VARIANT[orderStatus] || 'secondary'

    return (
      <Badge variant={variant} className={className}>
        <Icon className="mr-1 h-3 w-3" />
        {label}
      </Badge>
    )
  }

  // Invoice
  const invoiceStatus = status as InvoiceStatus
  const config = invoiceStatusConfig[invoiceStatus]
  if (!config) {
    return <Badge variant="secondary" className={className}>{status}</Badge>
  }

  const Icon = config.icon
  return (
    <Badge variant={config.variant} className={className}>
      <Icon className="mr-1 h-3 w-3" />
      {config.label}
    </Badge>
  )
}
