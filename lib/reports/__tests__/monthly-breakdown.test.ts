import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createMockSupabase } from '@/tests/helpers'

// Mock Supabase server client
const { supabase, mockResult } = createMockSupabase()
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(() => supabase),
}))

import { generateMonthlyBreakdown } from '../monthly-breakdown'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('generateMonthlyBreakdown', () => {
  it('returns empty months when no fiscal period found', async () => {
    mockResult({ data: null, error: { message: 'not found' } })

    const result = await generateMonthlyBreakdown('user-1', 'period-1')
    expect(result.months).toEqual([])
  })

  it('returns empty months when no journal entries exist', async () => {
    // First call: fiscal period
    mockResult({
      data: { period_start: '2024-01-01', period_end: '2024-12-31' },
      error: null,
    })

    // We need two sequential calls with different results.
    // The proxy-based mock returns the same result for all calls,
    // so we re-mock after the first await completes.
    // Instead, test that an empty lines result returns initialized months.

    // For this test, override at the supabase.from level to return different chains
    let callCount = 0
    supabase.from.mockImplementation(() => {
      callCount++
      if (callCount === 1) {
        // fiscal_periods query
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                single: () =>
                  Promise.resolve({
                    data: { period_start: '2024-01-01', period_end: '2024-12-31' },
                    error: null,
                  }),
              }),
            }),
          }),
        }
      }
      // journal_entry_lines query
      return {
        select: () => ({
          eq: () => ({
            eq: () => ({
              eq: () =>
                Promise.resolve({
                  data: [],
                  error: null,
                }),
            }),
          }),
        }),
      }
    })

    const result = await generateMonthlyBreakdown('user-1', 'period-1')
    expect(result.months.length).toBe(12)
    expect(result.months[0].label).toBe('Jan')
    expect(result.months[0].income).toBe(0)
    expect(result.months[0].expenses).toBe(0)
    expect(result.months[11].label).toBe('Dec')
  })

  it('correctly classifies revenue (class 3) and expense (class 4-7) accounts', async () => {
    let callCount = 0
    supabase.from.mockImplementation(() => {
      callCount++
      if (callCount === 1) {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                single: () =>
                  Promise.resolve({
                    data: { period_start: '2024-01-01', period_end: '2024-03-31' },
                    error: null,
                  }),
              }),
            }),
          }),
        }
      }
      return {
        select: () => ({
          eq: () => ({
            eq: () => ({
              eq: () =>
                Promise.resolve({
                  data: [
                    {
                      account_number: '3001',
                      debit: 0,
                      credit: 10000,
                      journal_entry: { entry_date: '2024-01-15', status: 'posted', user_id: 'user-1', fiscal_period_id: 'period-1' },
                    },
                    {
                      account_number: '5010',
                      debit: 3000,
                      credit: 0,
                      journal_entry: { entry_date: '2024-01-20', status: 'posted', user_id: 'user-1', fiscal_period_id: 'period-1' },
                    },
                    {
                      account_number: '3001',
                      debit: 0,
                      credit: 5000,
                      journal_entry: { entry_date: '2024-02-10', status: 'posted', user_id: 'user-1', fiscal_period_id: 'period-1' },
                    },
                    {
                      account_number: '6200',
                      debit: 1500,
                      credit: 0,
                      journal_entry: { entry_date: '2024-02-15', status: 'posted', user_id: 'user-1', fiscal_period_id: 'period-1' },
                    },
                  ],
                  error: null,
                }),
            }),
          }),
        }),
      }
    })

    const result = await generateMonthlyBreakdown('user-1', 'period-1')

    // January
    const jan = result.months.find((m) => m.label === 'Jan')!
    expect(jan.income).toBe(10000)
    expect(jan.expenses).toBe(3000)
    expect(jan.net).toBe(7000)

    // February
    const feb = result.months.find((m) => m.label === 'Feb')!
    expect(feb.income).toBe(5000)
    expect(feb.expenses).toBe(1500)
    expect(feb.net).toBe(3500)

    // March should be zero
    const mar = result.months.find((m) => m.label === 'Mar')!
    expect(mar.income).toBe(0)
    expect(mar.expenses).toBe(0)
  })

  it('ignores non-revenue/expense accounts (class 1, 2, 8)', async () => {
    let callCount = 0
    supabase.from.mockImplementation(() => {
      callCount++
      if (callCount === 1) {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                single: () =>
                  Promise.resolve({
                    data: { period_start: '2024-01-01', period_end: '2024-01-31' },
                    error: null,
                  }),
              }),
            }),
          }),
        }
      }
      return {
        select: () => ({
          eq: () => ({
            eq: () => ({
              eq: () =>
                Promise.resolve({
                  data: [
                    {
                      account_number: '1930',
                      debit: 10000,
                      credit: 0,
                      journal_entry: { entry_date: '2024-01-15', status: 'posted', user_id: 'user-1', fiscal_period_id: 'period-1' },
                    },
                    {
                      account_number: '2611',
                      debit: 0,
                      credit: 2500,
                      journal_entry: { entry_date: '2024-01-15', status: 'posted', user_id: 'user-1', fiscal_period_id: 'period-1' },
                    },
                    {
                      account_number: '8999',
                      debit: 500,
                      credit: 0,
                      journal_entry: { entry_date: '2024-01-20', status: 'posted', user_id: 'user-1', fiscal_period_id: 'period-1' },
                    },
                  ],
                  error: null,
                }),
            }),
          }),
        }),
      }
    })

    const result = await generateMonthlyBreakdown('user-1', 'period-1')
    const jan = result.months.find((m) => m.label === 'Jan')!
    expect(jan.income).toBe(0)
    expect(jan.expenses).toBe(0)
  })
})
