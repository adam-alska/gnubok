'use client'

import type { InvoiceInboxItem, DocumentClassificationType } from '@/types'
import type { InvoiceExtractionResult } from '@/extensions/general/invoice-inbox/types'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  getStatusLabel,
  getStatusVariant,
  getConfidenceLabel,
  formatExtractionSummary,
  getDocumentTypeLabel,
  getDocumentTypeVariant,
} from '@/lib/extensions/invoice-inbox-utils'
import { Mail, Upload, FileText, Receipt, Landmark } from 'lucide-react'

interface DocumentInboxCardProps {
  item: InvoiceInboxItem
  onClick: () => void
}

function formatRelativeTime(dateStr: string): string {
  const now = new Date()
  const date = new Date(dateStr)
  const diffMs = now.getTime() - date.getTime()
  const diffMin = Math.floor(diffMs / 60000)
  if (diffMin < 1) return 'Just nu'
  if (diffMin < 60) return `${diffMin} min sedan`
  const diffH = Math.floor(diffMin / 60)
  if (diffH < 24) return `${diffH} tim sedan`
  const diffD = Math.floor(diffH / 24)
  if (diffD === 1) return 'Igår'
  return `${diffD} dagar sedan`
}

function formatAmount(amount: number, currency: string = 'SEK'): string {
  return new Intl.NumberFormat('sv-SE', {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount)
}

function getDocumentIcon(type: DocumentClassificationType) {
  switch (type) {
    case 'receipt':
      return <Receipt className="h-5 w-5 text-muted-foreground" />
    case 'government_letter':
      return <Landmark className="h-5 w-5 text-muted-foreground" />
    default:
      return <FileText className="h-5 w-5 text-muted-foreground" />
  }
}

function getSummaryText(item: InvoiceInboxItem): { label: string; total: number; currency: string } {
  const type = item.document_type ?? 'supplier_invoice'

  switch (type) {
    case 'supplier_invoice': {
      const extraction = item.extracted_data as unknown as InvoiceExtractionResult | null
      const summary = formatExtractionSummary(extraction)
      return {
        label: (item.supplier as { name?: string } | undefined)?.name ?? (summary.supplierName || 'Okänd leverantör'),
        total: summary.total,
        currency: summary.currency,
      }
    }
    case 'receipt': {
      const receipt = item.receipt as { merchant_name?: string; total_amount?: number; currency?: string } | undefined
      return {
        label: receipt?.merchant_name ?? 'Okänd handlare',
        total: receipt?.total_amount ?? 0,
        currency: receipt?.currency || 'SEK',
      }
    }
    case 'government_letter': {
      return {
        label: item.email_from ?? 'Okänd avsändare',
        total: 0,
        currency: 'SEK',
      }
    }
    default: {
      return { label: 'Granska manuellt', total: 0, currency: 'SEK' }
    }
  }
}

export default function DocumentInboxCard({ item, onClick }: DocumentInboxCardProps) {
  const confidence = getConfidenceLabel(item.confidence)
  const statusVariant = getStatusVariant(item.status) as 'default' | 'secondary' | 'destructive' | 'outline' | 'success' | 'warning'
  const confidenceVariant = confidence.variant as 'default' | 'secondary' | 'destructive' | 'outline' | 'success' | 'warning'
  const docType = (item.document_type ?? 'supplier_invoice') as DocumentClassificationType
  const docTypeVariant = getDocumentTypeVariant(docType) as 'default' | 'secondary' | 'destructive' | 'outline' | 'success' | 'warning'

  const fileName = (item.document as { file_name?: string } | undefined)?.file_name ?? 'Okänd fil'
  const { label: summaryLabel, total, currency } = getSummaryText(item)

  return (
    <Card
      className="cursor-pointer transition-colors hover:bg-accent/50"
      onClick={onClick}
    >
      <CardContent className="flex items-center gap-4 p-4">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted">
          {item.source === 'email' ? (
            <Mail className="h-5 w-5 text-muted-foreground" />
          ) : (
            <Upload className="h-5 w-5 text-muted-foreground" />
          )}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            {getDocumentIcon(docType)}
            <span className="text-sm font-medium truncate">{fileName}</span>
          </div>
          <div className="flex items-center gap-2 mt-0.5">
            <span className={`text-sm truncate ${summaryLabel === 'Granska manuellt' ? 'text-muted-foreground/60 italic' : 'text-muted-foreground'}`}>
              {summaryLabel}
            </span>
          </div>
        </div>

        <div className="flex flex-col items-end gap-1 shrink-0">
          {total > 0 && (
            <span className="text-sm font-medium">{formatAmount(total, currency)}</span>
          )}
          <div className="flex items-center gap-1.5">
            <Badge variant={docTypeVariant} className="text-[10px] px-1.5 py-0">
              {getDocumentTypeLabel(docType)}
            </Badge>
            {item.confidence != null && (
              <Badge variant={confidenceVariant} className="text-[10px] px-1.5 py-0">
                {confidence.label}
              </Badge>
            )}
            <Badge variant={statusVariant}>
              {getStatusLabel(item.status)}
            </Badge>
          </div>
          <span className="text-[11px] text-muted-foreground">
            {formatRelativeTime(item.created_at)}
          </span>
        </div>
      </CardContent>
    </Card>
  )
}
