import type { SRUFile, SRURecord } from '@/lib/reports/ne-bilaga/types'
import { sruFileToString, validateSRUFile } from './sru-generator'
import type { SRUBalance } from './sru-engine'

/**
 * Generic SRU file generator
 *
 * Generates SRU files from aggregated SRU balances for any form type
 * (NE for enskild firma, INK2 for aktiebolag).
 *
 * Reuses sruFileToString() and validateSRUFile() from the existing
 * NE-specific generator.
 */

export type SRUFormType = 'NE' | 'INK2'

export interface GenericSRUParams {
  formType: SRUFormType
  orgNumber: string | null
  companyName: string
  fiscalYearStart: string  // YYYY-MM-DD
  fiscalYearEnd: string    // YYYY-MM-DD
  sruBalances: Map<string, SRUBalance>
}

/**
 * SRU code descriptions for display
 */
export const SRU_CODE_DESCRIPTIONS: Record<string, string> = {
  // NE form (EF)
  '7310': 'Försäljning med moms',
  '7311': 'Momsfria intäkter',
  '7312': 'Bil/bostadsförmån',
  '7313': 'Ränteintäkter',
  '7320': 'Varuinköp',
  '7321': 'Övriga kostnader',
  '7322': 'Lönekostnader',
  '7323': 'Räntekostnader',
  '7324': 'Avskrivningar fastighet',
  '7325': 'Avskrivningar övrigt',
  '7350': 'Årets resultat',
  // INK2 form (AB) — balance sheet
  '7201': 'Immateriella anläggningstillgångar',
  '7202': 'Materiella anläggningstillgångar',
  '7203': 'Finansiella anläggningstillgångar',
  '7210': 'Varulager',
  '7211': 'Kundfordringar',
  '7212': 'Övriga omsättningstillgångar',
  '7220': 'Aktiekapital',
  '7221': 'Övrigt eget kapital',
  '7222': 'Årets resultat',
  '7230': 'Skulder',
  '7231': 'Övriga skulder',
  // INK2 form (AB) — income statement
  '7330': 'Övriga externa kostnader',
  '7340': 'Personalkostnader',
  '7360': 'Övriga rörelsekostnader',
  '7370': 'Finansiella poster',
  '7380': 'Extraordinära poster',
}

/**
 * Generate a generic SRU file from aggregated SRU balances.
 */
export function generateGenericSRU(params: GenericSRUParams): SRUFile {
  const { formType, orgNumber, fiscalYearStart, fiscalYearEnd, sruBalances } = params
  const records: SRURecord[] = []
  const now = new Date()

  // File header
  records.push({ fieldCode: 'PRODUKT', value: 'KONTROLLUPPGIFTER' })
  records.push({ fieldCode: 'SESSION', value: '1' })
  records.push({ fieldCode: 'PROGRAMNAMN', value: 'ERPBase' })
  records.push({ fieldCode: 'PROGRAMVERSION', value: '1.0' })
  records.push({ fieldCode: 'SKAPAT', value: formatSRUDate(now) })

  // Form declaration
  records.push({ fieldCode: 'BLANKETT', value: formType })

  // Company identification
  if (orgNumber) {
    const cleanOrgNumber = orgNumber.replace(/-/g, '')
    records.push({ fieldCode: 'IDENTITET', value: cleanOrgNumber })
  }

  // Fiscal year
  const startSRU = fiscalYearStart.replace(/-/g, '')
  const endSRU = fiscalYearEnd.replace(/-/g, '')
  records.push({
    fieldCode: 'UPPGIFT',
    value: `7000 ${startSRU}-${endSRU}`,
  })

  // SRU balance entries — one #UPPGIFT per non-zero SRU code
  const sortedEntries = Array.from(sruBalances.entries())
    .sort(([a], [b]) => a.localeCompare(b))

  for (const [sruCode, balance] of sortedEntries) {
    if (balance.amount !== 0) {
      records.push({
        fieldCode: 'UPPGIFT',
        value: `${sruCode} ${Math.round(balance.amount)}`,
      })
    }
  }

  // End of form
  records.push({ fieldCode: 'BLANKETTSLUT', value: '' })

  return {
    records,
    generatedAt: now.toISOString(),
  }
}

/**
 * Get filename for generic SRU file download
 */
export function getGenericSRUFilename(
  formType: SRUFormType,
  orgNumber: string | null,
  fiscalYearStart: string
): string {
  const year = fiscalYearStart.substring(0, 4)
  const cleanOrg = orgNumber?.replace(/-/g, '') || 'unknown'
  return `${formType}_${cleanOrg}_${year}.sru`
}

/**
 * Format date for SRU: YYYYMMDD
 */
function formatSRUDate(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}${m}${d}`
}

// Re-export helpers from the existing SRU generator
export { sruFileToString, validateSRUFile }
