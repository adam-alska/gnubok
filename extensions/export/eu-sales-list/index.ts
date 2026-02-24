import type { Extension } from '@/lib/extensions/types'

/**
 * EU Sales List / Periodisk Sammanställning Extension
 *
 * Generates the mandatory EC Sales List (periodisk sammanställning) report
 * for Skatteverket. Aggregates intra-community B2B sales by customer VAT
 * number, separating goods (box 35) from services (box 39).
 *
 * Outputs downloadable CSV/XML files for upload to Skatteverket's e-service.
 * Validates customer VAT numbers via VIES and cross-checks against
 * momsdeklaration box totals.
 */
export const euSalesListExtension: Extension = {
  id: 'eu-sales-list',
  name: 'Periodisk sammanställning',
  version: '1.0.0',
}
