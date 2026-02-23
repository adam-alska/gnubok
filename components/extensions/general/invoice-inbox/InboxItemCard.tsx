'use client'

import type { InvoiceInboxItem } from '@/types'
import type { InvoiceExtractionResult } from '@/extensions/general/invoice-inbox/types'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  getStatusLabel,
  getStatusVariant,
  getConfidenceLabel,
  formatExtractionSummary,
} from '@/lib/extensions/invoice-inbox-utils'
import { Mail, Upload, FileText } from 'lucide-react'

interface InboxItemCardProps {
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

function formatSEK(amount: number): string {
  return new Intl.NumberFormat('sv-SE', {
    style: 'currency',
    currency: 'SEK',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount)
}

export default function InboxItemCard({ item, onClick }: InboxItemCardProps) {
  const extraction = item.extracted_data as unknown as InvoiceExtractionResult | null
  const summary = formatExtractionSummary(extraction)
  const confidence = getConfidenceLabel(item.confidence)
  const statusVariant = getStatusVariant(item.status) as 'default' | 'secondary' | 'destructive' | 'outline' | 'success' | 'warning'
  const confidenceVariant = confidence.variant as 'default' | 'secondary' | 'destructive' | 'outline' | 'success' | 'warning'

  const fileName = (item.document as { file_name?: string } | undefined)?.file_name ?? 'Okänd fil'
  const supplierName = (item.supplier as { name?: string } | undefined)?.name ?? summary.supplierName

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
            <FileText className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            <span className="text-sm font-medium truncate">{fileName}</span>
          </div>
          <div className="flex items-center gap-2 mt-0.5">
            {supplierName ? (
              <span className="text-sm text-muted-foreground truncate">{supplierName}</span>
            ) : (
              <span className="text-sm text-muted-foreground/60 italic">Okänd leverantör</span>
            )}
          </div>
        </div>

        <div className="flex flex-col items-end gap-1 shrink-0">
          {summary.total > 0 && (
            <span className="text-sm font-medium">{formatSEK(summary.total)}</span>
          )}
          <div className="flex items-center gap-1.5">
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
