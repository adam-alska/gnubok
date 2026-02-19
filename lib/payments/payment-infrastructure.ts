import type { BankgiroPaymentRecord, BankgiroFileParseResult } from '@/types/bank-reconciliation'

// =============================================================================
// Bankgiro number formatting and validation
// =============================================================================

/**
 * Format a Bankgiro number to standard format (XXX-XXXX or XXXX-XXXX)
 * Bankgiro numbers in Sweden are 7 or 8 digits, displayed with a hyphen
 */
export function formatBankgiroNumber(number: string): string | null {
  const cleaned = number.replace(/[^0-9]/g, '')

  if (cleaned.length === 7) {
    return `${cleaned.slice(0, 3)}-${cleaned.slice(3)}`
  }

  if (cleaned.length === 8) {
    return `${cleaned.slice(0, 4)}-${cleaned.slice(4)}`
  }

  return null // Invalid
}

/**
 * Validate a Bankgiro number (basic validation: 7-8 digits)
 */
export function validateBankgiroNumber(number: string): boolean {
  const cleaned = number.replace(/[^0-9]/g, '')
  return cleaned.length === 7 || cleaned.length === 8
}

// =============================================================================
// Plusgiro number formatting and validation
// =============================================================================

/**
 * Format a Plusgiro number to standard format
 * Plusgiro numbers in Sweden are 2-8 digits, displayed with a hyphen before last digit
 */
export function formatPlusgiroNumber(number: string): string | null {
  const cleaned = number.replace(/[^0-9]/g, '')

  if (cleaned.length < 2 || cleaned.length > 8) {
    return null // Invalid
  }

  return `${cleaned.slice(0, -1)}-${cleaned.slice(-1)}`
}

/**
 * Validate a Plusgiro number (basic validation: 2-8 digits)
 */
export function validatePlusgiroNumber(number: string): boolean {
  const cleaned = number.replace(/[^0-9]/g, '')
  return cleaned.length >= 2 && cleaned.length <= 8
}

// =============================================================================
// OCR payment reference generation
// =============================================================================

/**
 * Calculate Luhn check digit for OCR reference
 */
function luhnCheckDigit(number: string): number {
  const digits = number.split('').map(Number).reverse()
  let sum = 0

  for (let i = 0; i < digits.length; i++) {
    let digit = digits[i]
    if (i % 2 === 0) {
      digit *= 2
      if (digit > 9) digit -= 9
    }
    sum += digit
  }

  const remainder = sum % 10
  return remainder === 0 ? 0 : 10 - remainder
}

/**
 * Calculate length check digit for OCR reference
 * The length digit is the last digit of (total length including length digit itself)
 */
function lengthCheckDigit(referenceWithoutLengthDigit: string): number {
  // Total length = current length + 1 (for length digit itself)
  const totalLength = referenceWithoutLengthDigit.length + 1
  return totalLength % 10
}

/**
 * Generate an OCR payment reference from an invoice number
 * Swedish OCR references follow the standard with Luhn check digit
 * and optional length check digit
 *
 * @param invoiceNumber - The invoice number to base the reference on
 * @param includeLengthDigit - Whether to include a length check digit (default: true)
 * @returns The OCR reference string
 */
export function generatePaymentReference(
  invoiceNumber: string,
  includeLengthDigit: boolean = true
): string {
  // Clean the invoice number to only digits
  const cleaned = invoiceNumber.replace(/[^0-9]/g, '')

  if (cleaned.length === 0) {
    throw new Error('Fakturanumret måste innehålla minst en siffra')
  }

  if (cleaned.length > 23) {
    throw new Error('Fakturanumret är för långt för OCR-referens (max 23 siffror)')
  }

  // Calculate Luhn check digit
  const luhn = luhnCheckDigit(cleaned)
  let reference = cleaned + luhn.toString()

  // Add length check digit if requested
  if (includeLengthDigit) {
    const lengthDigit = lengthCheckDigit(reference)
    reference = reference + lengthDigit.toString()
  }

  return reference
}

/**
 * Validate an OCR payment reference
 */
export function validatePaymentReference(reference: string): boolean {
  const cleaned = reference.replace(/[^0-9]/g, '')

  if (cleaned.length < 2 || cleaned.length > 25) {
    return false
  }

  // Check Luhn digit (second to last digit)
  const numberPart = cleaned.slice(0, -1)
  const checkDigit = parseInt(cleaned.slice(-1))

  // Try without length check digit first
  const expectedLuhn = luhnCheckDigit(numberPart)
  if (expectedLuhn === checkDigit) return true

  // Try with length check digit (last digit is length, second to last is Luhn)
  if (cleaned.length >= 3) {
    const numberPartWithoutBoth = cleaned.slice(0, -2)
    const luhnDigit = parseInt(cleaned.slice(-2, -1))
    const expectedLuhnForLength = luhnCheckDigit(numberPartWithoutBoth)

    if (expectedLuhnForLength === luhnDigit) {
      const expectedLength = lengthCheckDigit(numberPartWithoutBoth + luhnDigit.toString())
      if (expectedLength === checkDigit) return true
    }
  }

  return false
}

// =============================================================================
// Bankgiro file parsing (BG Max / TK records format)
// =============================================================================

/**
 * Parse a Bankgiro incoming payment file (simplified BG Max format)
 *
 * BG Max format overview:
 * - TK01: Opening record (start of file)
 * - TK05: Opening record for payment section
 * - TK20: Payment record (incoming payment)
 * - TK25: Deduction record
 * - TK15: End record for payment section
 * - TK70: End record (end of file)
 *
 * Each line is fixed-width format
 */
export function parseBankgiroFile(content: string): BankgiroFileParseResult {
  const lines = content.split('\n').map(l => l.replace(/\r$/, ''))
  const records: BankgiroPaymentRecord[] = []
  let totalAmount = 0
  let accountNumber = ''
  let fileDate = ''

  for (const line of lines) {
    if (line.length < 2) continue

    const recordType = line.substring(0, 2)

    switch (recordType) {
      case '01': {
        // Opening record - TK01
        // Position 3-22: Bankgiro number of recipient
        // Position 23-42: Date (YYYYMMDD)
        accountNumber = line.substring(2, 12).trim()
        fileDate = line.substring(22, 30).trim()
        if (fileDate.length === 8) {
          fileDate = `${fileDate.substring(0, 4)}-${fileDate.substring(4, 6)}-${fileDate.substring(6, 8)}`
        }
        break
      }

      case '05': {
        // Payment section opening - TK05
        // Position 3-12: Recipient Bankgiro number
        if (!accountNumber) {
          accountNumber = line.substring(2, 12).trim()
        }
        break
      }

      case '20': {
        // Payment record - TK20
        // Position 3-22: Sender account/BG number
        // Position 23-40: Amount in ore (18 digits)
        // Position 41-65: Reference/OCR
        // Position 66-80: Date (YYYYMMDD)
        const senderAccount = line.substring(2, 22).trim()
        const amountStr = line.substring(22, 40).trim()
        const reference = line.substring(40, 65).trim()
        const dateStr = line.substring(65, 73).trim()

        const amount = parseInt(amountStr, 10) / 100 // Convert from ore to SEK

        let transactionDate = ''
        if (dateStr.length === 8) {
          transactionDate = `${dateStr.substring(0, 4)}-${dateStr.substring(4, 6)}-${dateStr.substring(6, 8)}`
        }

        records.push({
          transactionDate,
          amount,
          reference,
          senderName: '', // Not available in this record type; would need TK26 for name
          senderAccount,
          recordType: '20',
        })

        totalAmount += amount
        break
      }

      case '25': {
        // Deduction record - TK25
        // Similar structure to TK20 but negative amount
        const senderAccount = line.substring(2, 22).trim()
        const amountStr = line.substring(22, 40).trim()
        const reference = line.substring(40, 65).trim()
        const dateStr = line.substring(65, 73).trim()

        const amount = -(parseInt(amountStr, 10) / 100)

        let transactionDate = ''
        if (dateStr.length === 8) {
          transactionDate = `${dateStr.substring(0, 4)}-${dateStr.substring(4, 6)}-${dateStr.substring(6, 8)}`
        }

        records.push({
          transactionDate,
          amount,
          reference,
          senderName: '',
          senderAccount,
          recordType: '25',
        })

        totalAmount += amount
        break
      }

      case '15': {
        // End record for payment section - TK15
        break
      }

      case '70': {
        // End record - TK70
        break
      }

      default:
        // Unknown record type - skip
        break
    }
  }

  return {
    records,
    totalAmount,
    recordCount: records.length,
    accountNumber,
    fileDate,
  }
}

// =============================================================================
// Payment method helpers
// =============================================================================

/**
 * Get the standard BAS account for a payment method type
 */
export function getDefaultBASAccount(methodType: string): string {
  switch (methodType) {
    case 'bankgiro':
      return '1920' // Plusgiro is often on same, but bankgiro payments go to bank account
    case 'plusgiro':
      return '1920'
    case 'swish':
      return '1930' // Företagskonto / bankkonto
    case 'bank_transfer':
      return '1930'
    case 'cash':
      return '1910' // Kassa
    case 'card':
      return '1930'
    default:
      return '1930'
  }
}

/**
 * Format a Swedish payment number for display
 */
export function formatPaymentNumber(methodType: string, number: string): string {
  switch (methodType) {
    case 'bankgiro':
      return formatBankgiroNumber(number) || number
    case 'plusgiro':
      return formatPlusgiroNumber(number) || number
    default:
      return number
  }
}
