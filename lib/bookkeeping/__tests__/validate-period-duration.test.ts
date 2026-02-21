import { describe, it, expect } from 'vitest'
import { validatePeriodDuration, monthsBetween } from '../validate-period-duration'

describe('monthsBetween', () => {
  it('returns 12 for a standard calendar year', () => {
    expect(monthsBetween('2025-01-01', '2025-12-31')).toBe(12)
  })

  it('returns 18 for an 18-month period', () => {
    expect(monthsBetween('2025-07-01', '2026-12-31')).toBe(18)
  })

  it('returns 1 for a single month', () => {
    expect(monthsBetween('2025-03-01', '2025-03-31')).toBe(1)
  })

  it('returns 3 for a quarter', () => {
    expect(monthsBetween('2025-10-01', '2025-12-31')).toBe(3)
  })
})

describe('validatePeriodDuration', () => {
  it('returns null for a valid 12-month period', () => {
    expect(validatePeriodDuration('2025-01-01', '2025-12-31')).toBeNull()
  })

  it('returns null for exactly 18 months (max allowed)', () => {
    expect(validatePeriodDuration('2025-07-01', '2026-12-31')).toBeNull()
  })

  it('returns null for a short first year (1 month)', () => {
    expect(validatePeriodDuration('2025-12-01', '2025-12-31')).toBeNull()
  })

  it('returns null for a short first year (3 months)', () => {
    expect(validatePeriodDuration('2025-10-01', '2025-12-31')).toBeNull()
  })

  it('returns error for 19 months (exceeds max)', () => {
    const result = validatePeriodDuration('2025-06-01', '2026-12-31')
    expect(result).toContain('19 months')
    expect(result).toContain('18 months')
  })

  it('returns error when end is before start', () => {
    expect(validatePeriodDuration('2025-06-01', '2025-01-31')).toBe(
      'Period end must be after period start'
    )
  })

  it('returns error when start is not 1st of month', () => {
    expect(validatePeriodDuration('2025-01-15', '2025-12-31')).toBe(
      'Period start must be the 1st of a month'
    )
  })

  it('returns error when end is not last day of month', () => {
    expect(validatePeriodDuration('2025-01-01', '2025-12-15')).toBe(
      'Period end must be the last day of a month'
    )
  })

  it('handles February end correctly (non-leap year)', () => {
    expect(validatePeriodDuration('2025-01-01', '2025-02-28')).toBeNull()
  })

  it('handles February end correctly (leap year)', () => {
    expect(validatePeriodDuration('2024-01-01', '2024-02-29')).toBeNull()
  })

  it('rejects Feb 28 in a leap year (not last day)', () => {
    expect(validatePeriodDuration('2024-01-01', '2024-02-28')).toBe(
      'Period end must be the last day of a month'
    )
  })

  it('returns null for a broken fiscal year (May-Apr)', () => {
    expect(validatePeriodDuration('2025-05-01', '2026-04-30')).toBeNull()
  })
})
