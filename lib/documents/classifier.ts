/**
 * Document Classifier — thin wrapper around lib/ai/document-analyzer.
 *
 * SERVER-ONLY: delegates to the shared vision client.
 *
 * Classifies documents as supplier invoices, receipts, government letters,
 * or unknown. Also detects EU reverse charge for supplier invoices.
 *
 * This module preserves the original public API — existing callers see no change.
 */

import 'server-only'
import { classifyDocument as classifyCore } from '@/lib/ai/document-analyzer'

// Re-export the type so existing imports work
export type { DocumentClassification } from '@/lib/ai/document-analyzer'

/**
 * Classify a document using Claude Haiku Vision.
 * Determines if it's a supplier invoice, receipt, government letter, or unknown.
 */
export async function classifyDocument(
  base64: string,
  mimeType: string
) {
  return classifyCore(base64, mimeType)
}
