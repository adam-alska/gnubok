import { describe, it, expect } from 'vitest'
import { getRevenueAccount } from '../invoice-entries'

describe('getRevenueAccount', () => {
  it('standard_25 returns 3001', () => {
    expect(getRevenueAccount('standard_25')).toBe('3001')
  })

  it('reduced_12 returns 3002', () => {
    expect(getRevenueAccount('reduced_12')).toBe('3002')
  })

  it('reduced_6 returns 3003', () => {
    expect(getRevenueAccount('reduced_6')).toBe('3003')
  })

  it('reverse_charge returns 3308', () => {
    expect(getRevenueAccount('reverse_charge')).toBe('3308')
  })

  it('export returns 3305', () => {
    expect(getRevenueAccount('export')).toBe('3305')
  })

  it('exempt defaults to 3100 for enskild_firma', () => {
    expect(getRevenueAccount('exempt')).toBe('3100')
    expect(getRevenueAccount('exempt', 'enskild_firma')).toBe('3100')
  })

  it('exempt returns 3004 for aktiebolag', () => {
    expect(getRevenueAccount('exempt', 'aktiebolag')).toBe('3004')
  })

  it('entityType does not affect non-exempt treatments', () => {
    expect(getRevenueAccount('standard_25', 'aktiebolag')).toBe('3001')
    expect(getRevenueAccount('reduced_12', 'aktiebolag')).toBe('3002')
    expect(getRevenueAccount('export', 'aktiebolag')).toBe('3305')
  })
})
