import type { Extension } from '@/lib/extensions/types'

/**
 * Intrastat Generator Extension
 *
 * Generates monthly Intrastat dispatch declarations for reporting to SCB
 * (Statistics Sweden). Manages product metadata (CN commodity codes, weights,
 * country of origin) and aggregates EU goods dispatches.
 *
 * Outputs SCB IDEP.web compatible CSV files. Monitors the SEK 12M dispatch
 * threshold and alerts when the reporting obligation is triggered.
 */
export const intrastatExtension: Extension = {
  id: 'intrastat',
  name: 'Intrastat-generator',
  version: '1.0.0',
}
