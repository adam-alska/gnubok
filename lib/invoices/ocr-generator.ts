/**
 * Swedish OCR Number Generator
 *
 * Implements OCR number generation per Bankgirot standard.
 * OCR = invoice_number + Luhn check digit (mod 10)
 * Maximum length: 25 digits
 */

/**
 * Calculate the Luhn check digit (mod 10) for a numeric string.
 * The Luhn algorithm works by doubling every other digit from right to left,
 * then summing all digits (splitting doubled values > 9 into their individual digits),
 * and finding the digit that makes the total sum divisible by 10.
 */
function luhnCheckDigit(input: string): number {
  const digits = input.split('').map(Number)
  let sum = 0

  // Process from right to left, doubling every other digit
  // Since we are calculating the check digit, the first position from right
  // (the check digit position) is even, so we double the odd positions from right
  for (let i = digits.length - 1; i >= 0; i--) {
    const posFromRight = digits.length - 1 - i
    let digit = digits[i]

    // Double every other digit starting from the rightmost
    if (posFromRight % 2 === 0) {
      digit *= 2
      if (digit > 9) {
        digit -= 9
      }
    }

    sum += digit
  }

  const remainder = sum % 10
  return remainder === 0 ? 0 : 10 - remainder
}

/**
 * Strip non-numeric characters from input.
 */
function stripNonNumeric(input: string): string {
  return input.replace(/\D/g, '')
}

/**
 * Generate an OCR number from an invoice number.
 *
 * The OCR number is formed by taking the numeric portion of the invoice number
 * and appending a Luhn check digit. If the invoice number contains non-numeric
 * characters (like prefixes or dashes), they are stripped.
 *
 * @param invoiceNumber - The invoice number to generate OCR from
 * @returns The OCR number string
 * @throws Error if the resulting OCR would exceed 25 digits
 */
export function generateOCR(invoiceNumber: string): string {
  const numericPart = stripNonNumeric(invoiceNumber)

  if (numericPart.length === 0) {
    throw new Error('Fakturanumret måste innehålla minst en siffra')
  }

  if (numericPart.length >= 25) {
    throw new Error('OCR-numret får vara max 25 siffror')
  }

  const checkDigit = luhnCheckDigit(numericPart)
  return numericPart + checkDigit.toString()
}

/**
 * Validate an OCR number using the Luhn algorithm (mod 10).
 *
 * @param ocr - The OCR number to validate
 * @returns true if the OCR is valid
 */
export function validateOCR(ocr: string): boolean {
  const numericOcr = stripNonNumeric(ocr)

  if (numericOcr.length < 2 || numericOcr.length > 25) {
    return false
  }

  // Extract the number without check digit and the check digit
  const body = numericOcr.slice(0, -1)
  const expectedCheckDigit = parseInt(numericOcr.slice(-1), 10)

  const calculatedCheckDigit = luhnCheckDigit(body)
  return calculatedCheckDigit === expectedCheckDigit
}

/**
 * Generate a formatted payment reference string for display on invoices.
 *
 * @param ocrNumber - The OCR number
 * @param bankgiro - Optional bankgiro number
 * @param plusgiro - Optional plusgiro number
 * @returns A formatted payment reference string
 */
export function formatPaymentReference(
  ocrNumber: string,
  bankgiro?: string | null,
  plusgiro?: string | null
): string {
  const lines: string[] = []

  lines.push(`OCR-nummer: ${ocrNumber}`)

  if (bankgiro) {
    lines.push(`Bankgiro: ${bankgiro}`)
  }

  if (plusgiro) {
    lines.push(`Plusgiro: ${plusgiro}`)
  }

  return lines.join('\n')
}

/**
 * Format a bankgiro number with standard hyphen formatting (XXXX-XXXX or XXX-XXXX).
 */
export function formatBankgiro(bankgiro: string): string {
  const cleaned = bankgiro.replace(/\D/g, '')
  if (cleaned.length === 7) {
    return `${cleaned.slice(0, 3)}-${cleaned.slice(3)}`
  }
  if (cleaned.length === 8) {
    return `${cleaned.slice(0, 4)}-${cleaned.slice(4)}`
  }
  return bankgiro
}

/**
 * Format a plusgiro number with standard formatting.
 */
export function formatPlusgiro(plusgiro: string): string {
  const cleaned = plusgiro.replace(/\D/g, '')
  if (cleaned.length >= 2) {
    return `${cleaned.slice(0, -1)}-${cleaned.slice(-1)}`
  }
  return plusgiro
}
