/**
 * BAS Reference Data for Swedish Accounting
 *
 * Full BAS Kontoplan 2026 (~1,276 accounts) organized by account class.
 * Data files live in ./bas-data/ and are aggregated here.
 *
 * Reference: BAS Kontoplan 2026 v1.0
 * SRU codes follow Skatteverket's SRU specification for NE and INK2 forms.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface BASReferenceAccount {
  account_number: string
  account_name: string
  account_class: number
  account_group: string
  account_type: 'asset' | 'liability' | 'equity' | 'revenue' | 'expense' | 'untaxed_reserves'
  normal_balance: 'debit' | 'credit'
  description: string
  sru_code: string | null
  k2_excluded: boolean
}

// ---------------------------------------------------------------------------
// Data (imported from per-class data files)
// ---------------------------------------------------------------------------

export { BAS_REFERENCE } from './bas-data'

// ---------------------------------------------------------------------------
// Class & Group Labels
// ---------------------------------------------------------------------------

/** Swedish labels for each BAS account class (1-8) */
export const ACCOUNT_CLASS_LABELS: Record<number, string> = {
  1: 'Tillgangar',
  2: 'Eget kapital och skulder',
  3: 'Rorelseintatker',
  4: 'Varuinkop och material',
  5: 'Ovriga externa kostnader',
  6: 'Ovriga externa kostnader',
  7: 'Personalkostnader och avskrivningar',
  8: 'Finansiella poster och resultat',
}

/** Swedish labels for BAS account groups (first two digits) */
export const ACCOUNT_GROUP_LABELS: Record<string, string> = {
  // Class 1 - Assets
  '10': 'Immateriella anlaggningstillgangar',
  '11': 'Byggnader och mark',
  '12': 'Maskiner respektive inventarier',
  '13': 'Finansiella anlaggningstillgangar',
  '14': 'Lager, produkter i arbete och pagaende arbeten',
  '15': 'Kundfordringar',
  '16': 'Ovriga kortfristiga fordringar',
  '17': 'Forutbetalda kostnader och upplupna intakter',
  '18': 'Kortfristiga placeringar',
  '19': 'Kassa och bank',

  // Class 2 - Equity & Liabilities
  '20': 'Eget kapital',
  '21': 'Obeskattade reserver',
  '22': 'Avsattningar',
  '23': 'Langfristiga skulder',
  '24': 'Kortfristiga skulder till kreditinstitut, kunder och leverantorer',
  '25': 'Skatteskulder',
  '26': 'Moms och punktskatter',
  '27': 'Personalens skatter, avgifter och loneavdrag',
  '28': 'Ovriga kortfristiga skulder',
  '29': 'Upplupna kostnader och forutbetalda intakter',

  // Class 3 - Revenue
  '30': 'Huvudintakter',
  '31': 'Forsaljning av varor utanfor Sverige',
  '32': 'Forsaljning VMB och omvand moms',
  '33': 'Forsaljning av tjanster utanfor Sverige',
  '34': 'Forsaljning, egna uttag',
  '35': 'Fakturerade kostnader',
  '36': 'Rorelsens sidointakter',
  '37': 'Intaktskorrigeringar',
  '38': 'Aktiverat arbete for egen rakning',
  '39': 'Ovriga rorelseintakter',

  // Class 4 - Cost of goods
  '40': 'Inkop av handelsvaror',
  '41': 'Inkop av varor och material',
  '42': 'Salda handelsvaror VMB',
  '43': 'Inkop av ravaror och material i Sverige',
  '44': 'Inkop av ravaror m.m., omvand betalningsskyldighet',
  '45': 'Inkop av ravaror m.m. fran utlandet',
  '46': 'Inkop av tjanster, underentreprenader och legoarbeten',
  '47': 'Reduktion av inkopspriser',
  '48': 'Andra produktionskostnader',
  '49': 'Forandring av lager, produkter i arbete och pagaende arbeten',

  // Class 5 - External expenses
  '50': 'Lokalkostnader',
  '51': 'Fastighetskostnader',
  '52': 'Hyra av anlaggningstillgangar',
  '53': 'Energikostnader for drift',
  '54': 'Forbrukningsinventarier och forbrukningsmaterial',
  '55': 'Reparation och underhall',
  '56': 'Kostnader for transportmedel',
  '57': 'Frakter och transporter',
  '58': 'Resekostnader',
  '59': 'Reklam och PR',

  // Class 6 - Other external expenses
  '60': 'Ovriga forsaljningskostnader',
  '61': 'Kontorsmateriel och trycksaker',
  '62': 'Tele, data och post',
  '63': 'Foretagsforsakringar och ovriga riskkostnader',
  '64': 'Forvaltningskostnader',
  '65': 'Ovriga externa tjanster',
  '66': 'Franchisingavgifter',
  '67': 'Sarskilt for ideella foreningar och stiftelser',
  '68': 'Inhyrd personal',
  '69': 'Ovriga externa kostnader',

  // Class 7 - Personnel
  '70': 'Loner till kollektivanstallda',
  '71': 'Loner till anstallda',
  '72': 'Loner till tjansteman och foretagsledare',
  '73': 'Kostnadsersattningar och formaner',
  '74': 'Pensionskostnader',
  '75': 'Sociala och andra avgifter enligt lag och avtal',
  '76': 'Ovriga personalkostnader',
  '77': 'Nedskrivningar och aterforing av nedskrivningar',
  '78': 'Avskrivningar enligt plan',
  '79': 'Ovriga rorelsekostnader',

  // Class 8 - Financial
  '80': 'Resultat fran andelar i koncernforetag',
  '81': 'Resultat fran andelar i intresseforetag',
  '82': 'Resultat fran ovriga vardepapper och langfristiga fordringar',
  '83': 'Ovriga ranteintakter och liknande resultatposter',
  '84': 'Rantekostnader och liknande resultatposter',
  '85': 'Extraordinara intakter',
  '86': 'Extraordinara kostnader',
  '87': 'Bokslutsdispositioner (intakter)',
  '88': 'Bokslutsdispositioner',
  '89': 'Skatter och arets resultat',
}

// ---------------------------------------------------------------------------
// Lookup indexes (lazy-initialized for performance)
// ---------------------------------------------------------------------------

// Import BAS_REFERENCE for use in indexes (re-exported above for consumers)
import { BAS_REFERENCE } from './bas-data'

let _byAccountNumber: Map<string, BASReferenceAccount> | null = null
let _byClass: Map<number, BASReferenceAccount[]> | null = null

function getByAccountNumberIndex(): Map<string, BASReferenceAccount> {
  if (!_byAccountNumber) {
    _byAccountNumber = new Map()
    for (const account of BAS_REFERENCE) {
      _byAccountNumber.set(account.account_number, account)
    }
  }
  return _byAccountNumber
}

function getByClassIndex(): Map<number, BASReferenceAccount[]> {
  if (!_byClass) {
    _byClass = new Map()
    for (const account of BAS_REFERENCE) {
      const existing = _byClass.get(account.account_class) ?? []
      existing.push(account)
      _byClass.set(account.account_class, existing)
    }
  }
  return _byClass
}

// ---------------------------------------------------------------------------
// Helper functions
// ---------------------------------------------------------------------------

/**
 * Look up a single BAS reference account by its account number.
 * Returns undefined if the account number is not in the reference data.
 */
export function getBASReference(accountNumber: string): BASReferenceAccount | undefined {
  return getByAccountNumberIndex().get(accountNumber)
}

/**
 * Get all BAS reference accounts for a given account class (1-8).
 * Returns an empty array if the class has no accounts in the reference data.
 */
export function getBASReferenceByClass(accountClass: number): BASReferenceAccount[] {
  return getByClassIndex().get(accountClass) ?? []
}

/**
 * Check whether an account number exists in the BAS reference data.
 * Useful for validating that a user-entered account number is a standard BAS account.
 */
export function isStandardBASAccount(accountNumber: string): boolean {
  return getByAccountNumberIndex().has(accountNumber)
}
