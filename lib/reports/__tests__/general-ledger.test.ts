import { describe, it, expect, vi, beforeEach } from 'vitest'

// ============================================================
// Mock — sequential result queue
// ============================================================

let resultIdx: number
let results: Array<{ data?: unknown; error?: unknown }>

function makeBuilder() {
  const b: Record<string, unknown> = {}
  for (const m of ['select', 'eq', 'in', 'lt', 'order', 'range']) {
    b[m] = vi.fn().mockReturnValue(b)
  }
  b.single = vi.fn().mockImplementation(async () => results[resultIdx++] ?? { data: null, error: null })
  b.then = (resolve: (v: unknown) => void) => resolve(results[resultIdx++] ?? { data: null, error: null })
  return b
}

function makeClient() {
  return {
    from: vi.fn().mockImplementation(() => makeBuilder()),
    rpc: vi.fn().mockImplementation(async () => results[resultIdx++] ?? { data: null, error: null }),
  }
}

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => makeClient()),
}))

import { generateGeneralLedger } from '../general-ledger'

beforeEach(() => {
  vi.clearAllMocks()
  resultIdx = 0
  results = []
})

describe('generateGeneralLedger', () => {
  it('returns empty report when no fiscal period found', async () => {
    results = [
      // 0: fiscal_periods.single() → null
      { data: null, error: null },
    ]

    const report = await generateGeneralLedger('user-1', 'period-1')
    expect(report.accounts).toEqual([])
    expect(report.period).toEqual({ start: '', end: '' })
  })

  it('returns empty report when no entries in period', async () => {
    results = [
      // 0: fiscal_periods.single()
      { data: { period_start: '2024-01-01', period_end: '2024-12-31' }, error: null },
      // 1: journal_entries (empty)
      { data: [], error: null },
    ]

    const report = await generateGeneralLedger('user-1', 'period-1')
    expect(report.accounts).toEqual([])
    expect(report.period).toEqual({ start: '2024-01-01', end: '2024-12-31' })
  })

  it('groups lines by account with correct totals and running balance', async () => {
    results = [
      // 0: fiscal_periods.single()
      { data: { period_start: '2024-01-01', period_end: '2024-12-31' }, error: null },
      // 1: journal_entries for this period
      {
        data: [
          { id: 'e1', entry_date: '2024-01-15', voucher_number: 1, voucher_series: 'A', description: 'Sale', source_type: 'invoice' },
          { id: 'e2', entry_date: '2024-02-10', voucher_number: 2, voucher_series: 'A', description: 'Payment', source_type: 'transaction' },
        ],
        error: null,
      },
      // 2: journal_entry_lines
      {
        data: [
          { account_number: '1510', debit_amount: 1250, credit_amount: 0, journal_entry_id: 'e1' },
          { account_number: '3001', debit_amount: 0, credit_amount: 1000, journal_entry_id: 'e1' },
          { account_number: '2611', debit_amount: 0, credit_amount: 250, journal_entry_id: 'e1' },
          { account_number: '1930', debit_amount: 1250, credit_amount: 0, journal_entry_id: 'e2' },
          { account_number: '1510', debit_amount: 0, credit_amount: 1250, journal_entry_id: 'e2' },
        ],
        error: null,
      },
      // 3: chart_of_accounts
      {
        data: [
          { account_number: '1510', account_name: 'Kundfordringar' },
          { account_number: '1930', account_name: 'Företagskonto' },
          { account_number: '2611', account_name: 'Utgående moms 25%' },
          { account_number: '3001', account_name: 'Försäljning 25%' },
        ],
        error: null,
      },
      // 4: prior entries (none)
      { data: [], error: null },
    ]

    const report = await generateGeneralLedger('user-1', 'period-1')

    expect(report.accounts).toHaveLength(4)
    expect(report.accounts.map((a) => a.account_number)).toEqual(['1510', '1930', '2611', '3001'])

    // Account 1510: debit 1250, credit 1250 → closing 0
    const acc1510 = report.accounts.find((a) => a.account_number === '1510')!
    expect(acc1510.total_debit).toBe(1250)
    expect(acc1510.total_credit).toBe(1250)
    expect(acc1510.closing_balance).toBe(0)
    expect(acc1510.lines).toHaveLength(2)
    expect(acc1510.lines[0].balance).toBe(1250)
    expect(acc1510.lines[1].balance).toBe(0)

    // Account 1930: debit 1250, credit 0 → closing 1250
    const acc1930 = report.accounts.find((a) => a.account_number === '1930')!
    expect(acc1930.total_debit).toBe(1250)
    expect(acc1930.total_credit).toBe(0)
    expect(acc1930.closing_balance).toBe(1250)
  })

  it('computes opening balance from prior period entries', async () => {
    results = [
      // 0: fiscal_periods.single()
      { data: { period_start: '2025-01-01', period_end: '2025-12-31' }, error: null },
      // 1: journal_entries for this period
      {
        data: [
          { id: 'e1', entry_date: '2025-03-01', voucher_number: 1, voucher_series: 'A', description: 'Purchase', source_type: 'manual' },
        ],
        error: null,
      },
      // 2: journal_entry_lines
      {
        data: [
          { account_number: '1930', debit_amount: 0, credit_amount: 500, journal_entry_id: 'e1' },
          { account_number: '5410', debit_amount: 500, credit_amount: 0, journal_entry_id: 'e1' },
        ],
        error: null,
      },
      // 3: chart_of_accounts
      {
        data: [
          { account_number: '1930', account_name: 'Företagskonto' },
          { account_number: '5410', account_name: 'Förbrukningsinventarier' },
        ],
        error: null,
      },
      // 4: prior entries
      { data: [{ id: 'prior-1' }], error: null },
      // 5: prior lines
      {
        data: [
          { account_number: '1930', debit_amount: 10000, credit_amount: 0 },
        ],
        error: null,
      },
    ]

    const report = await generateGeneralLedger('user-1', 'period-2')

    const acc1930 = report.accounts.find((a) => a.account_number === '1930')!
    expect(acc1930.opening_balance).toBe(10000)
    expect(acc1930.closing_balance).toBe(9500) // 10000 - 500
    expect(acc1930.lines[0].balance).toBe(9500)
  })

  it('filters accounts by account_from and account_to', async () => {
    results = [
      // 0: fiscal_periods.single()
      { data: { period_start: '2024-01-01', period_end: '2024-12-31' }, error: null },
      // 1: journal_entries
      {
        data: [
          { id: 'e1', entry_date: '2024-01-15', voucher_number: 1, voucher_series: 'A', description: 'Test', source_type: 'manual' },
        ],
        error: null,
      },
      // 2: lines across multiple accounts
      {
        data: [
          { account_number: '1510', debit_amount: 1000, credit_amount: 0, journal_entry_id: 'e1' },
          { account_number: '1930', debit_amount: 0, credit_amount: 500, journal_entry_id: 'e1' },
          { account_number: '3001', debit_amount: 0, credit_amount: 500, journal_entry_id: 'e1' },
        ],
        error: null,
      },
      // 3: chart_of_accounts
      { data: [], error: null },
      // 4: prior entries (none)
      { data: [], error: null },
    ]

    const report = await generateGeneralLedger('user-1', 'period-1', '1500', '1999')

    // Only accounts in 1500–1999 range
    expect(report.accounts.map((a) => a.account_number)).toEqual(['1510', '1930'])
  })

  it('sorts lines within account by date then voucher number', async () => {
    results = [
      // 0: fiscal_periods.single()
      { data: { period_start: '2024-01-01', period_end: '2024-12-31' }, error: null },
      // 1: entries out of order
      {
        data: [
          { id: 'e2', entry_date: '2024-01-10', voucher_number: 2, voucher_series: 'A', description: 'Second', source_type: 'manual' },
          { id: 'e1', entry_date: '2024-01-10', voucher_number: 1, voucher_series: 'A', description: 'First', source_type: 'manual' },
          { id: 'e3', entry_date: '2024-01-05', voucher_number: 3, voucher_series: 'A', description: 'Earlier date', source_type: 'manual' },
        ],
        error: null,
      },
      // 2: lines all on same account
      {
        data: [
          { account_number: '1930', debit_amount: 100, credit_amount: 0, journal_entry_id: 'e2' },
          { account_number: '1930', debit_amount: 200, credit_amount: 0, journal_entry_id: 'e1' },
          { account_number: '1930', debit_amount: 300, credit_amount: 0, journal_entry_id: 'e3' },
        ],
        error: null,
      },
      // 3: chart_of_accounts
      { data: [{ account_number: '1930', account_name: 'Företagskonto' }], error: null },
      // 4: prior entries
      { data: [], error: null },
    ]

    const report = await generateGeneralLedger('user-1', 'period-1')
    const acc = report.accounts[0]

    // e3 (Jan 5) first, then e1 (Jan 10, #1), then e2 (Jan 10, #2)
    expect(acc.lines[0].description).toBe('Earlier date')
    expect(acc.lines[1].description).toBe('First')
    expect(acc.lines[2].description).toBe('Second')
  })

  it('uses Math.round for monetary precision', async () => {
    results = [
      { data: { period_start: '2024-01-01', period_end: '2024-12-31' }, error: null },
      {
        data: [
          { id: 'e1', entry_date: '2024-01-15', voucher_number: 1, voucher_series: 'A', description: 'Precision', source_type: 'manual' },
        ],
        error: null,
      },
      {
        data: [
          { account_number: '1930', debit_amount: 33.33, credit_amount: 0, journal_entry_id: 'e1' },
        ],
        error: null,
      },
      { data: [{ account_number: '1930', account_name: 'Företagskonto' }], error: null },
      { data: [], error: null },
    ]

    const report = await generateGeneralLedger('user-1', 'period-1')
    const acc = report.accounts[0]
    expect(acc.total_debit).toBe(33.33)
    expect(acc.closing_balance).toBe(33.33)
  })
})
