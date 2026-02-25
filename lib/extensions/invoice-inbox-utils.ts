import type { InboxItemStatus, InvoiceExtractionResult } from '@/types'

const STATUS_LABELS: Record<InboxItemStatus, string> = {
  pending: 'Väntar',
  processing: 'Bearbetar',
  ready: 'Klar',
  confirmed: 'Bekräftad',
  rejected: 'Avvisad',
  error: 'Fel',
}

export function getStatusLabel(status: InboxItemStatus): string {
  return STATUS_LABELS[status] ?? status
}

const STATUS_VARIANTS: Record<InboxItemStatus, string> = {
  pending: 'secondary',
  processing: 'default',
  ready: 'warning',
  confirmed: 'success',
  rejected: 'destructive',
  error: 'destructive',
}

export function getStatusVariant(status: InboxItemStatus): string {
  return STATUS_VARIANTS[status] ?? 'outline'
}

export function getConfidenceLabel(confidence: number | null): { label: string; variant: string } {
  if (confidence == null) {
    return { label: 'Okänd', variant: 'outline' }
  }
  if (confidence >= 0.9) {
    return { label: 'Hög', variant: 'success' }
  }
  if (confidence >= 0.7) {
    return { label: 'Medium', variant: 'warning' }
  }
  return { label: 'Låg', variant: 'destructive' }
}

export function formatExtractionSummary(
  data: InvoiceExtractionResult | null | undefined
): { supplierName: string; total: number; lineCount: number } {
  if (!data) {
    return { supplierName: '', total: 0, lineCount: 0 }
  }
  return {
    supplierName: data.supplier?.name ?? '',
    total: data.totals?.total ?? 0,
    lineCount: data.lineItems?.length ?? 0,
  }
}
