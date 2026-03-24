import type { VatDeclarationRutor, CompanySettings } from '@/types'
import type { SkatteverketMomsuppgift } from '../types'

/**
 * Convert gnubok VatDeclarationRutor to Skatteverket's momsuppgift payload.
 *
 * Fields with value 0 are omitted (Skatteverket treats absent fields as 0).
 * This keeps the payload clean and avoids sending unnecessary data.
 */
export function rutorToMomsuppgift(rutor: VatDeclarationRutor): SkatteverketMomsuppgift {
  const result: SkatteverketMomsuppgift = {}

  // Helper: only set non-zero values, rounded to whole kronor (SKV expects integers)
  const set = (key: keyof SkatteverketMomsuppgift, value: number) => {
    if (value !== 0) result[key] = Math.round(value)
  }

  // Taxable sales basis
  set('momspliktigForsaljning', rutor.ruta05)
  set('momspliktigaUttag', rutor.ruta06)
  set('vinstmarginal', rutor.ruta07)
  set('hyresInkomst', rutor.ruta08)

  // Output VAT on sales
  set('momsForsaljningUtgaendeHog', rutor.ruta10)
  set('momsForsaljningUtgaendeMedel', rutor.ruta11)
  set('momsForsaljningUtgaendeLag', rutor.ruta12)

  // Reverse charge purchase bases
  set('inkopVarorEU', rutor.ruta20)
  set('inkopTjansterEU', rutor.ruta21)
  set('inkopTjansterUtanforEU', rutor.ruta22)
  set('inkopVarorSE', rutor.ruta23)
  set('inkopTjansterSE', rutor.ruta24)

  // Output VAT on reverse charge purchases
  set('momsInkopUtgaendeHog', rutor.ruta30)
  set('momsInkopUtgaendeMedel', rutor.ruta31)
  set('momsInkopUtgaendeLag', rutor.ruta32)

  // EU/export sales
  set('forsaljningVarorEU', rutor.ruta35)
  set('forsaljningVarorUtanforEU', rutor.ruta36)
  set('inkopVaror3pHandel', rutor.ruta37)
  set('forsaljningVaror3pHandel', rutor.ruta38)
  set('forsaljningTjansterEU', rutor.ruta39)
  set('ovrigForsaljningTjansterUtanforSE', rutor.ruta40)
  set('forsaljningBskKopareSE', rutor.ruta41)
  set('momsfriForsaljning', rutor.ruta42)

  // Input VAT
  set('ingaendeMomsAvdrag', rutor.ruta48)

  // Net VAT (must always be present, whole kronor)
  result.summaMoms = Math.round(rutor.ruta49)

  // Import
  set('import', rutor.ruta50)
  set('momsImportUtgaendeHog', rutor.ruta60)
  set('momsImportUtgaendeMedel', rutor.ruta61)
  set('momsImportUtgaendeLag', rutor.ruta62)

  return result
}

/**
 * Convert a gnubok org_number to Skatteverket's 12-digit "redovisare" format.
 *
 * Rules:
 * - Organisationsnummer (10 digits, e.g. 5020000013): prefix with "16" → 165020000013
 * - Personnummer (10 digits, e.g. 8501011234): prefix with "19" or "20" based on century
 * - Strip any hyphens before processing
 */
export function formatRedovisare(
  orgNumber: string,
  entityType: CompanySettings['entity_type']
): string {
  const clean = orgNumber.replace(/-/g, '')

  if (clean.length === 12) {
    // Already in 12-digit format
    return clean
  }

  if (clean.length !== 10) {
    throw new Error(`Ogiltigt organisationsnummer: ${orgNumber} (förväntar 10 eller 12 siffror)`)
  }

  if (entityType === 'aktiebolag') {
    // Org numbers always prefixed with 16
    return `16${clean}`
  }

  // Enskild firma — personnummer
  // First two digits determine century: >= 00 could be 19xx or 20xx
  // Heuristic: if born year > current 2-digit year, assume 1900s
  const yearDigits = parseInt(clean.substring(0, 2), 10)
  const currentTwoDigitYear = new Date().getFullYear() % 100
  const prefix = yearDigits > currentTwoDigitYear ? '19' : '20'
  return `${prefix}${clean}`
}

/**
 * Convert gnubok period parameters to Skatteverket's YYYYMM format.
 *
 * Skatteverket expects the last month of the period.
 * - monthly period 3, year 2025 → "202503"
 * - quarterly period 1, year 2025 → "202503" (Q1 ends in March)
 * - yearly period 1, year 2025 → "202512"
 */
export function formatRedovisningsperiod(
  periodType: 'monthly' | 'quarterly' | 'yearly',
  year: number,
  period: number
): string {
  let lastMonth: number

  switch (periodType) {
    case 'monthly':
      lastMonth = period
      break
    case 'quarterly':
      lastMonth = period * 3
      break
    case 'yearly':
      lastMonth = 12
      break
  }

  return `${year}${String(lastMonth).padStart(2, '0')}`
}
