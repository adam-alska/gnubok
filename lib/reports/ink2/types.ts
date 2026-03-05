// INK2 declaration rutor (fields) keyed by SRU code
export interface INK2DeclarationRutor {
  // Balance sheet - Assets
  '7201': number  // Immateriella anläggningstillgångar
  '7202': number  // Materiella anläggningstillgångar
  '7203': number  // Finansiella anläggningstillgångar
  '7210': number  // Varulager m.m.
  '7211': number  // Kundfordringar
  '7212': number  // Övriga omsättningstillgångar

  // Balance sheet - Equity & Liabilities
  '7220': number  // Aktiekapital
  '7221': number  // Övrigt eget kapital
  '7222': number  // Årets resultat
  '7230': number  // Obeskattade reserver, avsättningar och skulder
  '7231': number  // Övriga skulder

  // Income statement
  '7310': number  // Nettoomsättning
  '7320': number  // Varuinköp/direkta kostnader
  '7330': number  // Övriga externa kostnader
  '7340': number  // Personalkostnader
  '7350': number  // Avskrivningar
  '7360': number  // Övriga rörelsekostnader
  '7370': number  // Finansiella poster (netto)
  '7380': number  // Extraordinära poster (netto)
}

export type INK2SRUCode = keyof INK2DeclarationRutor

// Account mapping configuration for INK2 declaration
export interface INK2AccountMapping {
  sruCode: INK2SRUCode
  description: string
  section: 'assets' | 'equity_liabilities' | 'income_statement'
  normalBalance: 'debit' | 'credit' | 'net'
  accountRanges: Array<{
    start: string
    end: string
    exclude?: string[]
  }>
}

// INK2 declaration response
export interface INK2Declaration {
  fiscalYear: {
    id: string
    name: string
    start: string
    end: string
    isClosed: boolean
  }
  rutor: INK2DeclarationRutor
  breakdown: Record<INK2SRUCode, {
    accounts: Array<{
      accountNumber: string
      accountName: string
      amount: number
    }>
    total: number
  }>
  totals: {
    totalAssets: number
    totalEquityLiabilities: number
    operatingResult: number
    resultAfterFinancial: number
  }
  companyInfo: {
    companyName: string
    orgNumber: string | null
  }
  warnings: string[]
}

// Reuse SRU file types from NE-bilaga
export type { SRURecord, SRUFile } from '@/lib/reports/ne-bilaga/types'

// Labels for INK2 rutor
export const INK2_RUTA_LABELS: Record<INK2SRUCode, string> = {
  '7201': 'Immateriella anläggningstillgångar',
  '7202': 'Materiella anläggningstillgångar',
  '7203': 'Finansiella anläggningstillgångar',
  '7210': 'Varulager m.m.',
  '7211': 'Kundfordringar',
  '7212': 'Övriga omsättningstillgångar',
  '7220': 'Aktiekapital',
  '7221': 'Övrigt eget kapital',
  '7222': 'Årets resultat',
  '7230': 'Obeskattade reserver, avsättningar och skulder',
  '7231': 'Övriga skulder',
  '7310': 'Nettoomsättning',
  '7320': 'Varuinköp/direkta kostnader',
  '7330': 'Övriga externa kostnader',
  '7340': 'Personalkostnader',
  '7350': 'Avskrivningar',
  '7360': 'Övriga rörelsekostnader',
  '7370': 'Finansiella poster (netto)',
  '7380': 'Extraordinära poster (netto)',
}

// Section groupings for UI display
export const INK2_ASSET_CODES: INK2SRUCode[] = ['7201', '7202', '7203', '7210', '7211', '7212']
export const INK2_EQUITY_LIABILITY_CODES: INK2SRUCode[] = ['7220', '7221', '7222', '7230', '7231']
export const INK2_INCOME_STATEMENT_CODES: INK2SRUCode[] = ['7310', '7320', '7330', '7340', '7350', '7360', '7370', '7380']
