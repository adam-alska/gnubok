/**
 * Client-safe account name map for UI display.
 * Covers the ~30 accounts used in transaction categorization.
 * No server dependencies — safe for 'use client' components.
 */

const ACCOUNT_NAMES: Record<string, string> = {
  // Assets (1xxx)
  '1510': 'Kundfordringar',
  '1930': 'Företagskonto',

  // Equity & Liabilities (2xxx)
  '2013': 'Övriga egna uttag',
  '2018': 'Egna insättningar',
  '2440': 'Leverantörsskulder',
  '2611': 'Utg. moms 25%',
  '2621': 'Utg. moms 12%',
  '2631': 'Utg. moms 6%',
  '2614': 'Utg. moms omvänd',
  '2641': 'Ing. moms',
  '2645': 'Beräknad ing. moms',
  '2893': 'Skuld till ägare',

  // Revenue (3xxx)
  '3001': 'Försäljning 25%',
  '3002': 'Försäljning 12%',
  '3003': 'Försäljning 6%',
  '3004': 'Momsfri försäljning',
  '3305': 'Exportförsäljning',
  '3308': 'EU-tjänster',
  '3900': 'Övriga rörelseintäkter',

  // Cost of goods (4xxx)
  '4010': 'Varuinköp',

  // External expenses (5xxx)
  '5010': 'Lokalhyra',
  '5410': 'Förbrukningsinventarier',
  '5420': 'Programvaror',
  '5460': 'Förbrukningsvaror',
  '5611': 'Drivmedel bil',
  '5800': 'Resekostnader',
  '5910': 'Annonsering',

  // Other external expenses (6xxx)
  '6071': 'Representation',
  '6110': 'Kontorsförbrukning',
  '6200': 'Telefon & internet',
  '6530': 'Redovisningstjänster',
  '6570': 'Bankavgifter',
  '6991': 'Övriga kostnader',

  // Personnel (7xxx)
  '7610': 'Utbildning',
  '7960': 'Valutakursförluster',
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
