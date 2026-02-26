/**
 * Invoice Analyzer — delegates to lib/ai/document-analyzer for extraction,
 * then applies invoice-specific validation and enhancement.
 *
 * SERVER-ONLY: uses the shared vision client via document-analyzer.
 *
 * Preserved public API: analyzeInvoice().
 */

import 'server-only'
import type { InvoiceExtractionResult } from '../types'
import { extractInvoice } from '@/lib/ai/document-analyzer'

/**
 * Analyze a supplier invoice using Claude Haiku Vision.
 * Delegates extraction to the shared core.
 */
export async function analyzeInvoice(
  fileBase64: string,
  mimeType: string
): Promise<InvoiceExtractionResult> {
  return extractInvoice(fileBase64, mimeType)
}
