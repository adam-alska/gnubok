/**
 * Client-safe account name map for UI display.
 * Covers the ~30 accounts used in transaction categorization.
 * No server dependencies — safe for 'use client' components.
 */

const ACCOUNT_NAMES: Record<string, string> = {
  // Assets (1xxx)
  '1510': 'Kundfordringar',
  '1930': 'Foretagskonto',

  // Equity & Liabilities (2xxx)
  '2013': 'Ovriga egna uttag',
  '2440': 'Leverantorsskulder',
  '2611': 'Utg. moms 25%',
  '2621': 'Utg. moms 12%',
  '2631': 'Utg. moms 6%',
  '2614': 'Utg. moms omvand',
  '2641': 'Ing. moms',
  '2645': 'Beraknad ing. moms',
  '2893': 'Skuld till agare',

  // Revenue (3xxx)
  '3001': 'Forsaljning 25%',
  '3002': 'Forsaljning 12%',
  '3003': 'Forsaljning 6%',
  '3305': 'Exportforsaljning',
  '3308': 'EU-tjanster',
  '3900': 'Ovriga rorelseintakter',

  // Cost of goods (4xxx)
  '4010': 'Varuinkop',

  // External expenses (5xxx)
  '5010': 'Lokalhyra',
  '5410': 'Forbrukningsinventarier',
  '5420': 'Programvaror',
  '5460': 'Forbrukningsvaror',
  '5611': 'Drivmedel bil',
  '5800': 'Resekostnader',
  '5910': 'Annonsering',

  // Other external expenses (6xxx)
  '6071': 'Representation',
  '6110': 'Kontorsforbrukning',
  '6200': 'Telefon & internet',
  '6530': 'Redovisningstjanster',
  '6570': 'Bankavgifter',
  '6991': 'Ovriga kostnader',

  // Personnel (7xxx)
  '7610': 'Utbildning',
  '7960': 'Valutakursforluster',
  '3960': 'Valutakursvinster',
}

/**
 * Get the Swedish display name for an account number.
 * Returns the number itself if no name is mapped.
 */
export function getAccountName(accountNumber: string): string {
  return ACCOUNT_NAMES[accountNumber] || accountNumber
}

/**
 * Format an account number with its name, e.g. "5010 Lokalhyra".
 */
export function formatAccountWithName(accountNumber: string): string {
  const name = ACCOUNT_NAMES[accountNumber]
  return name ? `${accountNumber} ${name}` : accountNumber
}
