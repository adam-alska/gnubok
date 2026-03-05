import type { INK2Declaration, INK2SRUCode, SRUFile, SRURecord } from './types'

/**
 * SRU File Generator for INK2
 *
 * Generates SRU (Standardiserat Räkenskapsutdrag) files for electronic
 * submission to Skatteverket. The SRU format is used for tax declarations.
 *
 * INK2 field codes are the SRU codes directly (7201-7380).
 */

/** All INK2 SRU field codes in order */
const INK2_FIELD_CODES: INK2SRUCode[] = [
  '7201', '7202', '7203', '7210', '7211', '7212',
  '7220', '7221', '7222', '7230', '7231',
  '7310', '7320', '7330', '7340', '7350', '7360', '7370', '7380',
]

/**
 * Generate SRU file content from INK2 declaration
 */
export function generateSRUFile(declaration: INK2Declaration): SRUFile {
  const records: SRURecord[] = []
  const now = new Date()

  // File header
  records.push({ fieldCode: 'PRODUKT', value: 'KONTROLLUPPGIFTER' })
  records.push({ fieldCode: 'SESSION', value: '1' })
  records.push({ fieldCode: 'PROGRAMNAMN', value: 'ERPBase' })
  records.push({ fieldCode: 'PROGRAMVERSION', value: '1.0' })
  records.push({
    fieldCode: 'SKAPAT',
    value: formatSRUDate(now),
  })

  // Form declaration
  records.push({ fieldCode: 'BLANKETT', value: 'INK2' })

  // Company identification
  if (declaration.companyInfo.orgNumber) {
    const cleanOrgNumber = declaration.companyInfo.orgNumber.replace(/-/g, '')
    records.push({
      fieldCode: 'IDENTITET',
      value: cleanOrgNumber,
    })
  }

  // Fiscal year
  records.push({
    fieldCode: 'UPPGIFT',
    value: `7000 ${formatSRUDateRange(declaration.fiscalYear.start, declaration.fiscalYear.end)}`,
  })

  // INK2 field values
  for (const code of INK2_FIELD_CODES) {
    const value = declaration.rutor[code]
    if (value !== 0) {
      records.push({
        fieldCode: 'UPPGIFT',
        value: `${code} ${formatSRUAmount(value)}`,
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
 * Convert SRU file to string content
 */
export function sruFileToString(sruFile: SRUFile): string {
  const lines: string[] = []

  for (const record of sruFile.records) {
    if (record.value === '') {
      lines.push(`#${record.fieldCode}`)
    } else {
      lines.push(`#${record.fieldCode} ${record.value}`)
    }
  }

  return lines.join('\r\n') + '\r\n'
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

/**
 * Format date string (YYYY-MM-DD) to SRU format (YYYYMMDD)
 */
function dateStringToSRU(dateStr: string): string {
  return dateStr.replace(/-/g, '')
}

/**
 * Format fiscal year date range for SRU
 */
function formatSRUDateRange(startDate: string, endDate: string): string {
  return `${dateStringToSRU(startDate)}-${dateStringToSRU(endDate)}`
}

/**
 * Format amount for SRU: whole numbers, no thousands separator, negative with minus
 */
function formatSRUAmount(amount: number): string {
  return Math.round(amount).toString()
}

/**
 * Validate SRU file content
 */
export function validateSRUFile(sruFile: SRUFile): {
  isValid: boolean
  errors: string[]
} {
  const errors: string[] = []

  const hasHeader = sruFile.records.some(r => r.fieldCode === 'PRODUKT')
  const hasBlankett = sruFile.records.some(r => r.fieldCode === 'BLANKETT')
  const hasBlankettslut = sruFile.records.some(r => r.fieldCode === 'BLANKETTSLUT')

  if (!hasHeader) errors.push('Missing PRODUKT header')
  if (!hasBlankett) errors.push('Missing BLANKETT declaration')
  if (!hasBlankettslut) errors.push('Missing BLANKETTSLUT')

  // Verify it's INK2
  const blankettRecord = sruFile.records.find(r => r.fieldCode === 'BLANKETT')
  if (blankettRecord && blankettRecord.value !== 'INK2') {
    errors.push(`Expected BLANKETT INK2, got ${blankettRecord.value}`)
  }

  return {
    isValid: errors.length === 0,
    errors,
  }
}

/**
 * Get filename for SRU file download
 */
export function getSRUFilename(declaration: INK2Declaration): string {
  const year = declaration.fiscalYear.start.substring(0, 4)
  const orgNumber = declaration.companyInfo.orgNumber?.replace(/-/g, '') || 'unknown'
  return `INK2_${orgNumber}_${year}.sru`
}
