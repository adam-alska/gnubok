import type { InboxItemStatus, InvoiceExtractionResult, DocumentClassificationType } from '@/types'

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
): { supplierName: string; total: number; lineCount: number; currency: string } {
  if (!data) {
    return { supplierName: '', total: 0, lineCount: 0, currency: 'SEK' }
  }
  return {
    supplierName: data.supplier?.name ?? '',
    total: data.totals?.total ?? 0,
    lineCount: data.lineItems?.length ?? 0,
    currency: data.invoice?.currency || 'SEK',
  }
}

// Document type labels (Swedish)
const DOCUMENT_TYPE_LABELS: Record<DocumentClassificationType, string> = {
  supplier_invoice: 'Faktura',
  receipt: 'Kvitto',
  government_letter: 'Myndighetspost',
  unknown: 'Övrigt',
}

export function getDocumentTypeLabel(type: DocumentClassificationType): string {
  return DOCUMENT_TYPE_LABELS[type] ?? type
}

const DOCUMENT_TYPE_VARIANTS: Record<DocumentClassificationType, string> = {
  supplier_invoice: 'default',
  receipt: 'secondary',
  government_letter: 'outline',
  unknown: 'outline',
}

export function getDocumentTypeVariant(type: DocumentClassificationType): string {
  return DOCUMENT_TYPE_VARIANTS[type] ?? 'outline'
}

/**
 * Format extraction summary for receipt documents
 */
export function formatReceiptSummary(
  data: Record<string, unknown> | null | undefined
): { merchantName: string; total: number } {
  if (!data) {
    return { merchantName: '', total: 0 }
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const d = data as any
  return {
    merchantName: d.merchant?.name ?? '',
    total: d.totals?.total ?? 0,
  }
}
