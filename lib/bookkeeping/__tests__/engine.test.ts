import { describe, it, expect } from 'vitest'
import { validateBalance, getSwedishLocalDate } from '../engine'
import type { CreateJournalEntryLineInput } from '@/types'

describe('validateBalance', () => {
  it('balanced entry (debit == credit) → valid: true', () => {
    const lines: CreateJournalEntryLineInput[] = [
      { account_number: '1930', debit_amount: 1000, credit_amount: 0 },
      { account_number: '3001', debit_amount: 0, credit_amount: 1000 },
    ]

    const result = validateBalance(lines)
    expect(result.valid).toBe(true)
    expect(result.totalDebit).toBe(1000)
    expect(result.totalCredit).toBe(1000)
  })

  it('unbalanced entry → valid: false', () => {
    const lines: CreateJournalEntryLineInput[] = [
      { account_number: '1930', debit_amount: 1000, credit_amount: 0 },
      { account_number: '3001', debit_amount: 0, credit_amount: 500 },
    ]

    const result = validateBalance(lines)
    expect(result.valid).toBe(false)
    expect(result.totalDebit).toBe(1000)
    expect(result.totalCredit).toBe(500)
  })

  it('zero amounts → valid: false (roundedDebit must be > 0)', () => {
    const lines: CreateJournalEntryLineInput[] = [
      { account_number: '1930', debit_amount: 0, credit_amount: 0 },
      { account_number: '3001', debit_amount: 0, credit_amount: 0 },
    ]

    const result = validateBalance(lines)
    expect(result.valid).toBe(false)
    expect(result.totalDebit).toBe(0)
    expect(result.totalCredit).toBe(0)
  })

  it('floating point edge case (33.33 + 33.33 + 33.34) → valid: true', () => {
    const lines: CreateJournalEntryLineInput[] = [
      { account_number: '1930', debit_amount: 33.33, credit_amount: 0 },
      { account_number: '1930', debit_amount: 33.33, credit_amount: 0 },
      { account_number: '1930', debit_amount: 33.34, credit_amount: 0 },
      { account_number: '3001', debit_amount: 0, credit_amount: 100 },
    ]

    const result = validateBalance(lines)
    expect(result.valid).toBe(true)
    expect(result.totalDebit).toBe(100)
    expect(result.totalCredit).toBe(100)
  })

  it('single line (only debit, no credit) → valid: false', () => {
    const lines: CreateJournalEntryLineInput[] = [
      { account_number: '1930', debit_amount: 500, credit_amount: 0 },
    ]

    const result = validateBalance(lines)
    expect(result.valid).toBe(false)
  })
})

describe('getSwedishLocalDate', () => {
  it('returns a date string in YYYY-MM-DD format', () => {
    const date = getSwedishLocalDate()
    expect(date).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('returns a valid date', () => {
    const date = getSwedishLocalDate()
    const parsed = new Date(date)
    expect(parsed.toString()).not.toBe('Invalid Date')
  })
})
