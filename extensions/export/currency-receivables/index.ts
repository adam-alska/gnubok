import type { Extension } from '@/lib/extensions/types'

/**
 * Multi-Currency Receivables Manager / Valutafordringar Extension
 *
 * Dashboard showing foreign currency exposure from open receivables.
 * Calculates unrealized FX gains/losses using current Riksbanken rates
 * compared to booking rates.
 *
 * Shows realized FX gains (account 3960) and losses (account 7960) per
 * period, with monthly trend analysis. Provides period-end revaluation
 * preview for informational purposes (does not create journal entries).
 */
export const currencyReceivablesExtension: Extension = {
  id: 'currency-receivables',
  name: 'Valutafordringar',
  version: '1.0.0',
}
