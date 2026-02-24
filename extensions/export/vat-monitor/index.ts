import type { Extension } from '@/lib/extensions/types'

/**
 * Export VAT Monitor / Exportmoms-monitor Extension
 *
 * Dashboard that maps GL revenue accounts to Swedish momsdeklaration boxes
 * (05, 35, 36, 39, 40). Shows revenue breakdown by destination type:
 * domestic, EU B2B (reverse charge), and non-EU export.
 *
 * Validates VAT treatment consistency and flags potential errors before
 * the user files their momsdeklaration.
 */
export const vatMonitorExtension: Extension = {
  id: 'vat-monitor',
  name: 'Exportmoms-monitor',
  version: '1.0.0',
}
