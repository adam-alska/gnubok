import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/supabase/fetch-all', () => ({
  fetchAllRows: vi.fn(),
}))

import { getOpeningBalances } from '../opening-balances'
import { fetchAllRows } from '@/lib/supabase/fetch-all'

const mockFetchAllRows = vi.mocked(fetchAllRows)

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const supabase = {} as any

beforeEach(() => {
  vi.clearAllMocks()
})

describe('getOpeningBalances', () => {
  it('returns empty map and null obEntryId when period is null', async () => {
    const { balances, obEntryId } = await getOpeningBalances(supabase, 'company-1', null)

    expect(balances.size).toBe(0)
    expect(obEntryId).toBeNull()
  })

  describe('with opening_balance_entry_id (OB entry path)', () => {
    const period = {
      period_start: '2025-01-01',
      opening_balance_entry_id: 'ob-entry-123',
    }

    it('returns balances from the OB entry lines', async () => {
      mockFetchAllRows.mockResolvedValue([
        { account_number: '1930', debit_amount: 50000, credit_amount: 0 },
        { account_number: '2440', debit_amount: 0, credit_amount: 10000 },
      ])

      const { balances, obEntryId } = await getOpeningBalances(supabase, 'company-1', period)

      expect(balances.get('1930')).toEqual({ debit: 50000, credit: 0 })
      expect(balances.get('2440')).toEqual({ debit: 0, credit: 10000 })
      expect(obEntryId).toBe('ob-entry-123')
    })

    it('aggregates multiple lines for the same account', async () => {
      mockFetchAllRows.mockResolvedValue([
        { account_number: '1930', debit_amount: 30000, credit_amount: 0 },
        { account_number: '1930', debit_amount: 20000, credit_amount: 0 },
      ])

      const { balances } = await getOpeningBalances(supabase, 'company-1', period)

      expect(balances.get('1930')).toEqual({ debit: 50000, credit: 0 })
    })

    it('returns the obEntryId string', async () => {
      mockFetchAllRows.mockResolvedValue([])

      const { obEntryId } = await getOpeningBalances(supabase, 'company-1', period)

      expect(obEntryId).toBe('ob-entry-123')
    })
  })

  describe('without opening_balance_entry_id (fallback path)', () => {
    const period = {
      period_start: '2025-01-01',
      opening_balance_entry_id: null,
    }

    it('carries forward balance sheet accounts (class 1-2) only', async () => {
      mockFetchAllRows.mockResolvedValue([
        { account_number: '1930', debit_amount: 100000, credit_amount: 5000 },
        { account_number: '2440', debit_amount: 0, credit_amount: 25000 },
        // P&L accounts (class 3-8) must NOT carry forward — they reset
        // to zero each fiscal year via årets resultat.
        { account_number: '3001', debit_amount: 0, credit_amount: 80000 },
        { account_number: '5410', debit_amount: 12000, credit_amount: 0 },
        { account_number: '8310', debit_amount: 0, credit_amount: 1500 },
      ])

      const { balances, obEntryId } = await getOpeningBalances(supabase, 'company-1', period)

      expect(balances.get('1930')).toEqual({ debit: 100000, credit: 5000 })
      expect(balances.get('2440')).toEqual({ debit: 0, credit: 25000 })
      expect(balances.has('3001')).toBe(false)
      expect(balances.has('5410')).toBe(false)
      expect(balances.has('8310')).toBe(false)
      expect(obEntryId).toBeNull()
    })

    it('does not accumulate P&L across multi-year SIE imports', async () => {
      // Simulates importing SIE files for 2022 and 2023, then opening 2024:
      // BS movements over both years should net to a single IB; P&L from
      // both years must be discarded.
      mockFetchAllRows.mockResolvedValue([
        // 2022 IB + activity on a BS account
        { account_number: '1930', debit_amount: 50000, credit_amount: 0 },
        { account_number: '1930', debit_amount: 30000, credit_amount: 10000 },
        // 2023 activity on the same BS account
        { account_number: '1930', debit_amount: 20000, credit_amount: 5000 },
        // 2022 + 2023 P&L activity that previously accumulated incorrectly
        { account_number: '3001', debit_amount: 0, credit_amount: 200000 },
        { account_number: '3001', debit_amount: 0, credit_amount: 250000 },
        { account_number: '5410', debit_amount: 50000, credit_amount: 0 },
      ])

      const { balances } = await getOpeningBalances(supabase, 'company-1', period)

      expect(balances.get('1930')).toEqual({ debit: 100000, credit: 15000 })
      expect(balances.has('3001')).toBe(false)
      expect(balances.has('5410')).toBe(false)
    })

    it('aggregates multiple lines per account', async () => {
      mockFetchAllRows.mockResolvedValue([
        { account_number: '1510', debit_amount: 5000, credit_amount: 0 },
        { account_number: '1510', debit_amount: 3000, credit_amount: 1000 },
      ])

      const { balances } = await getOpeningBalances(supabase, 'company-1', period)

      expect(balances.get('1510')).toEqual({ debit: 8000, credit: 1000 })
    })

    it('returns null obEntryId', async () => {
      mockFetchAllRows.mockResolvedValue([])

      const { obEntryId } = await getOpeningBalances(supabase, 'company-1', period)

      expect(obEntryId).toBeNull()
    })
  })

  it('coerces null/undefined debit/credit to 0', async () => {
    const period = {
      period_start: '2025-01-01',
      opening_balance_entry_id: 'ob-entry-1',
    }

    mockFetchAllRows.mockResolvedValue([
      { account_number: '1930', debit_amount: null, credit_amount: undefined },
    ])

    const { balances } = await getOpeningBalances(supabase, 'company-1', period)

    expect(balances.get('1930')).toEqual({ debit: 0, credit: 0 })
  })

  it('returns empty map when no lines found', async () => {
    const period = {
      period_start: '2025-01-01',
      opening_balance_entry_id: null,
    }

    mockFetchAllRows.mockResolvedValue([])

    const { balances } = await getOpeningBalances(supabase, 'company-1', period)

    expect(balances.size).toBe(0)
  })
})
