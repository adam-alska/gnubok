'use client'

import { Badge } from '@/components/ui/badge'
import {
  CheckCircle,
  XCircle,
  Clock,
  FileCheck,
  CreditCard,
  AlertTriangle,
  Send,
  FileText,
} from 'lucide-react'
import type { SupplierInvoiceStatus } from '@/types/suppliers'
import { SUPPLIER_INVOICE_STATUS_LABELS } from '@/types/suppliers'

interface AttestationBadgeProps {
  status: SupplierInvoiceStatus
  size?: 'sm' | 'md'
}

const statusConfig: Record<
  SupplierInvoiceStatus,
  {
    icon: React.ElementType
    variant: 'default' | 'secondary' | 'destructive' | 'outline'
    className: string
  }
> = {
  draft: {
    icon: FileText,
    variant: 'secondary',
    className: '',
  },
  received: {
    icon: Clock,
    variant: 'default',
    className: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  },
  attested: {
    icon: FileCheck,
    variant: 'outline',
    className: 'border-amber-500 text-amber-700 dark:text-amber-400',
  },
  approved: {
    icon: CheckCircle,
    variant: 'outline',
    className: 'border-green-500 text-green-700 dark:text-green-400',
  },
  scheduled: {
    icon: Send,
    variant: 'default',
    className: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
  },
  paid: {
    icon: CreditCard,
    variant: 'default',
    className: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  },
  disputed: {
    icon: AlertTriangle,
    variant: 'destructive',
    className: '',
  },
  credited: {
    icon: XCircle,
    variant: 'secondary',
    className: '',
  },
}

export default function AttestationBadge({ status, size = 'md' }: AttestationBadgeProps) {
  const config = statusConfig[status]
  const Icon = config.icon
  const iconSize = size === 'sm' ? 'h-3 w-3' : 'h-3.5 w-3.5'

  return (
    <Badge variant={config.variant} className={`gap-1 ${config.className}`}>
      <Icon className={iconSize} />
      {SUPPLIER_INVOICE_STATUS_LABELS[status]}
    </Badge>
  )
}

interface StatusWorkflowProps {
  currentStatus: SupplierInvoiceStatus
}

const workflowSteps: SupplierInvoiceStatus[] = [
  'received',
  'attested',
  'approved',
  'scheduled',
  'paid',
]

export function StatusWorkflow({ currentStatus }: StatusWorkflowProps) {
  const currentIndex = workflowSteps.indexOf(currentStatus)
  const isSpecialStatus = !workflowSteps.includes(currentStatus)

  if (isSpecialStatus) {
    return (
      <div className="flex items-center gap-2">
        <AttestationBadge status={currentStatus} />
      </div>
    )
  }

  return (
    <div className="flex items-center gap-1">
      {workflowSteps.map((step, index) => {
        const isActive = index === currentIndex
        const isCompleted = index < currentIndex
        const Icon = statusConfig[step].icon

        return (
          <div key={step} className="flex items-center gap-1">
            <div
              className={`flex items-center gap-1 px-2 py-1 rounded text-xs font-medium transition-colors ${
                isActive
                  ? 'bg-primary text-primary-foreground'
                  : isCompleted
                    ? 'bg-primary/10 text-primary'
                    : 'bg-muted text-muted-foreground'
              }`}
            >
              <Icon className="h-3 w-3" />
              {SUPPLIER_INVOICE_STATUS_LABELS[step]}
            </div>
            {index < workflowSteps.length - 1 && (
              <div
                className={`h-px w-4 ${
                  index < currentIndex ? 'bg-primary' : 'bg-muted-foreground/30'
                }`}
              />
            )}
          </div>
        )
      })}
    </div>
  )
}
