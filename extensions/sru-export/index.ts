import type { Extension } from '@/lib/extensions/types'

/**
 * SRU Export Extension
 *
 * Generates SRU (Standardiserat Räkenskapsutdrag) files from chart_of_accounts
 * sru_code mappings. Supports both NE (EF) and INK2 (AB) form types.
 *
 * No event handlers or settings panel needed — SRU codes are managed
 * directly on chart_of_accounts.
 */
export const sruExportExtension: Extension = {
  id: 'sru-export',
  name: 'SRU-export',
  version: '1.0.0',
  reportTypes: [
    {
      id: 'sru-generic',
      name: 'SRU-export',
      description: 'Generera SRU-fil för Skatteverket',
    },
  ],
}
