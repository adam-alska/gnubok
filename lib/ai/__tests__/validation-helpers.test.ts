import { describe, it, expect } from 'vitest'
import {
  validateString,
  validateNumber,
  validateDate,
  validateTime,
  validateOrgNumber,
  validateVatNumber,
  isSwedishOrgNumber,
  validateAccountNumber,
} from '../validation-helpers'

describe('validateString', () => {
  it('returns trimmed string for valid input', () => {
    expect(validateString('  hello  ')).toBe('hello')
    expect(validateString('test')).toBe('test')
  })

  it('returns null for empty or non-string', () => {
    expect(validateString('')).toBeNull()
    expect(validateString('  ')).toBeNull()
    expect(validateString(null)).toBeNull()
    expect(validateString(undefined)).toBeNull()
    expect(validateString(123)).toBeNull()
  })
})

describe('validateNumber', () => {
  it('returns number for valid numeric input', () => {
    expect(validateNumber(42)).toBe(42)
    expect(validateNumber(3.14)).toBe(3.14)
    expect(validateNumber(0)).toBe(0)
    expect(validateNumber(-5)).toBe(-5)
  })

  it('parses numeric strings', () => {
    expect(validateNumber('42')).toBe(42)
    expect(validateNumber('3.14')).toBe(3.14)
    expect(validateNumber('100 SEK')).toBe(100)
  })

  it('returns null for invalid values', () => {
    expect(validateNumber(NaN)).toBeNull()
    expect(validateNumber(null)).toBeNull()
    expect(validateNumber(undefined)).toBeNull()
    expect(validateNumber('abc')).toBeNull()
    expect(validateNumber({})).toBeNull()
  })
})

describe('validateDate', () => {
  it('returns ISO date for valid date strings', () => {
    expect(validateDate('2024-06-15')).toBe('2024-06-15')
    expect(validateDate('2024-01-01T12:00:00Z')).toBe('2024-01-01')
  })

  it('returns null for invalid dates', () => {
    expect(validateDate('not a date')).toBeNull()
    expect(validateDate(null)).toBeNull()
    expect(validateDate(42)).toBeNull()
  })
})

describe('validateTime', () => {
  it('returns HH:MM for valid time strings', () => {
    expect(validateTime('14:30')).toBe('14:30')
    expect(validateTime('09:05')).toBe('09:05')
    expect(validateTime('14:30:00')).toBe('14:30')
  })

  it('returns null for invalid times', () => {
    expect(validateTime('2pm')).toBeNull()
    expect(validateTime(null)).toBeNull()
    expect(validateTime('1:30')).toBeNull() // needs 2-digit hour
  })
})

describe('validateOrgNumber', () => {
  it('formats valid Swedish org numbers', () => {
    expect(validateOrgNumber('5561234567')).toBe('556123-4567')
    expect(validateOrgNumber('556123-4567')).toBe('556123-4567')
    expect(validateOrgNumber('556 123 4567')).toBe('556123-4567')
  })

  it('returns null for invalid org numbers', () => {
    expect(validateOrgNumber('12345')).toBeNull()
    expect(validateOrgNumber('123456789012')).toBeNull()
    expect(validateOrgNumber(null)).toBeNull()
    expect(validateOrgNumber(123)).toBeNull()
  })
})

describe('validateVatNumber', () => {
  it('validates Swedish VAT numbers', () => {
    expect(validateVatNumber('SE556123456701')).toBe('SE556123456701')
    expect(validateVatNumber('se556123456701')).toBe('SE556123456701')
  })

  it('returns null for non-Swedish VAT numbers', () => {
    expect(validateVatNumber('DE123456789')).toBeNull()
    expect(validateVatNumber('SE12345')).toBeNull() // too short
    expect(validateVatNumber(null)).toBeNull()
  })
})

describe('isSwedishOrgNumber', () => {
  it('returns true for 10-digit numbers', () => {
    expect(isSwedishOrgNumber('5561234567')).toBe(true)
    expect(isSwedishOrgNumber('556123-4567')).toBe(true)
  })

  it('returns false for non-10-digit numbers', () => {
    expect(isSwedishOrgNumber('12345')).toBe(false)
    expect(isSwedishOrgNumber('123456789012')).toBe(false)
  })
})

describe('validateAccountNumber', () => {
  it('validates 4-digit BAS account numbers', () => {
    expect(validateAccountNumber('5410')).toBe('5410')
    expect(validateAccountNumber('1930')).toBe('1930')
    expect(validateAccountNumber('konto 6530')).toBe('6530')
  })

  it('returns null for invalid account numbers', () => {
    expect(validateAccountNumber('999')).toBeNull() // too short
    expect(validateAccountNumber('0500')).toBeNull() // below 1000
    expect(validateAccountNumber(null)).toBeNull()
    expect(validateAccountNumber(undefined)).toBeNull()
  })
})
