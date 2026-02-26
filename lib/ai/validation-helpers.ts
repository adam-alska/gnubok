/**
 * Validation Helpers for AI Extraction Results
 *
 * Shared validation functions used by receipt-analyzer and invoice-analyzer
 * to sanitize and validate AI-extracted field values.
 */

/**
 * Validate and trim a string value.
 * Returns null for empty/non-string values.
 */
export function validateString(value: unknown): string | null {
  if (typeof value === 'string' && value.trim()) {
    return value.trim()
  }
  return null
}

/**
 * Validate a numeric value.
 * Handles both number and string inputs, stripping non-numeric characters.
 * Returns null for invalid values.
 */
export function validateNumber(value: unknown): number | null {
  if (typeof value === 'number' && !isNaN(value)) {
    return value
  }
  if (typeof value === 'string') {
    const parsed = parseFloat(value.replace(/[^\d.-]/g, ''))
    if (!isNaN(parsed)) {
      return parsed
    }
  }
  return null
}

/**
 * Validate and normalize a date to ISO format (YYYY-MM-DD).
 * Returns null for invalid dates.
 */
export function validateDate(value: unknown): string | null {
  if (typeof value !== 'string') return null

  const date = new Date(value)
  if (isNaN(date.getTime())) return null

  return date.toISOString().split('T')[0]
}

/**
 * Validate and normalize a time value to HH:MM format.
 * Returns null for invalid times.
 */
export function validateTime(value: unknown): string | null {
  if (typeof value !== 'string') return null

  // Match HH:MM or HH:MM:SS
  const match = value.match(/^(\d{2}):(\d{2})(:\d{2})?$/)
  if (match) {
    return `${match[1]}:${match[2]}`
  }
  return null
}

/**
 * Validate and normalize a Swedish org number (XXXXXX-XXXX).
 * Swedish org numbers are 10 digits.
 * Returns null for invalid values.
 */
export function validateOrgNumber(value: unknown): string | null {
  if (typeof value !== 'string') return null

  const digits = value.replace(/\D/g, '')

  // Swedish org numbers are 10 digits
  if (digits.length === 10) {
    return `${digits.slice(0, 6)}-${digits.slice(6)}`
  }

  return null
}

/**
 * Validate a Swedish VAT number (SE prefix, at least 12 chars).
 * Returns null for invalid values.
 */
export function validateVatNumber(value: unknown): string | null {
  if (typeof value !== 'string') return null

  const cleaned = value.trim().toUpperCase()
  if (cleaned.startsWith('SE') && cleaned.length >= 12) {
    return cleaned
  }

  return null
}

/**
 * Check if an org number is in Swedish format (10 digits).
 */
export function isSwedishOrgNumber(value: string): boolean {
  const digits = value.replace(/\D/g, '')
  return digits.length === 10
}

/**
 * Validate a 4-digit BAS account number (1000-9999).
 * Returns null for invalid values.
 */
export function validateAccountNumber(value: string | undefined | null): string | null {
  if (!value) return null
  const digits = value.replace(/\D/g, '')
  if (digits.length === 4 && parseInt(digits) >= 1000 && parseInt(digits) <= 9999) {
    return digits
  }
  return null
}
