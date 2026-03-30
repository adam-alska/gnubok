import { describe, it, expect, vi, beforeEach } from 'vitest'

// ============================================================
// Mock — table-keyed result queues
// Each table has its own FIFO queue. Calls to the same table
// consume results in order, regardless of global query ordering.
// ============================================================

type MockResult = { data?: unknown; error?: unknown }
let mockResults: Record<string, MockResult[]>

function makeBuilder(tableName: string) {
  const b: Record<string, unknown> = {}
  for (const m of ['select', 'eq', 'in', 'lt', 'neq', 'range']) {
    b[m] = vi.fn().mockReturnValue(b)
  }
  const consume = (): MockResult => {
    const queue = mockResults[tableName]
    if (!queue || queue.length === 0) return { data: null, error: null }
    return queue.shift()!
  }
  b.single = vi.fn().mockImplementation(async () => consume())
  b.then = (resolve: (v: unknown) => void) => resolve(consume())
  return b
}

function makeClient() {
  return {
    from: vi.fn().mockImplementation((table: string) => makeBuilder(table)),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any
}

import { generateTrialBalance } from '../trial-balance'

let supabase: ReturnType<typeof makeClient>

beforeEach(() => {
  vi.clearAllMocks()
  mockResults = {}
  supabase = makeClient()
})

describe('generateTrialBalance', () => {
  it('returns empty report when no lines exist', async () => {
    mockResults = {
      fiscal_periods: [
        { data: null, error: null },
      ],
      // getOpeningBalances gets null period → returns empty
      // period lines query → empty
      journal_entry_lines: [
        { data: [], error: null },
      ],
    }

    const result = await generateTrialBalance(supabase, 'company-1', 'period-1')

    expect(result.rows).toEqual([])
    expect(result.totalDebit).toBe(0)
    expect(result.totalCredit).toBe(0)
    expect(result.isBalanced).toBe(true)
  })

  it('aggregates lines by account and sorts by account_number', async () => {
    mockResults = {
      fiscal_periods: [
        { data: { period_start: '2024-01-01', opening_balance_entry_id: null }, error: null },
      ],
      journal_entry_lines: [
        // prior lines (from getOpeningBalances fallback) — empty for first year
        { data: [], error: null },
        // period lines
        {
          data: [
            { account_number: '3001', debit_amount: 0, credit_amount: 500 },
            { account_number: '1930', debit_amount: 300, credit_amount: 0 },
            { account_number: '3001', debit_amount: 0, credit_amount: 200 },
            { account_number: '1930', debit_amount: 450, credit_amount: 0 },
          ],
          error: null,
        },
      ],
      chart_of_accounts: [
        {
          data: [
            { account_number: '1930', account_name: 'Företagskonto', account_class: 1 },
            { account_number: '3001', account_name: 'Försäljning', account_class: 3 },
          ],
          error: null,
        },
      ],
    }

    const result = await generateTrialBalance(supabase, 'company-1', 'period-1')

    expect(result.rows).toHaveLength(2)
    // Sorted by account number
    expect(result.rows[0].account_number).toBe('1930')
    expect(result.rows[1].account_number).toBe('3001')

    // Aggregated correctly — opening is 0 (first year)
    expect(result.rows[0].opening_debit).toBe(0)
    expect(result.rows[0].opening_credit).toBe(0)
    expect(result.rows[0].period_debit).toBe(750)
    expect(result.rows[0].closing_debit).toBe(750)
    expect(result.rows[0].closing_credit).toBe(0)
    expect(result.rows[1].closing_debit).toBe(0)
    expect(result.rows[1].closing_credit).toBe(700)
  })

  it('computes opening balances from prior period entries', async () => {
    mockResults = {
      fiscal_periods: [
        { data: { period_start: '2025-01-01', opening_balance_entry_id: null }, error: null },
      ],
      journal_entry_lines: [
        // prior lines (from getOpeningBalances fallback)
        {
          data: [
            { account_number: '1930', debit_amount: 10000, credit_amount: 0 },
            { account_number: '2099', debit_amount: 0, credit_amount: 10000 },
          ],
          error: null,
        },
        // period lines
        {
          data: [
            { account_number: '1930', debit_amount: 0, credit_amount: 500 },
            { account_number: '5410', debit_amount: 500, credit_amount: 0 },
          ],
          error: null,
        },
      ],
      chart_of_accounts: [
        {
          data: [
            { account_number: '1930', account_name: 'Företagskonto', account_class: 1 },
            { account_number: '2099', account_name: 'Årets resultat', account_class: 2 },
            { account_number: '5410', account_name: 'Förbrukningsinventarier', account_class: 5 },
          ],
          error: null,
        },
      ],
    }

    const result = await generateTrialBalance(supabase, 'company-1', 'period-2')

    // 1930: opening debit 10000, period credit 500 → closing debit 10000, credit 500
    const acc1930 = result.rows.find((r) => r.account_number === '1930')!
    expect(acc1930.opening_debit).toBe(10000)
    expect(acc1930.opening_credit).toBe(0)
    expect(acc1930.period_debit).toBe(0)
    expect(acc1930.period_credit).toBe(500)
    expect(acc1930.closing_debit).toBe(10000)
    expect(acc1930.closing_credit).toBe(500)

    // 2099: opening credit 10000, no period activity → closing credit 10000
    const acc2099 = result.rows.find((r) => r.account_number === '2099')!
    expect(acc2099.opening_debit).toBe(0)
    expect(acc2099.opening_credit).toBe(10000)
    expect(acc2099.period_debit).toBe(0)
    expect(acc2099.closing_debit).toBe(0)
    expect(acc2099.closing_credit).toBe(10000)

    // 5410: no opening, period debit 500
    const acc5410 = result.rows.find((r) => r.account_number === '5410')!
    expect(acc5410.opening_debit).toBe(0)
    expect(acc5410.period_debit).toBe(500)
    expect(acc5410.closing_debit).toBe(500)

    expect(result.isBalanced).toBe(true)
  })

  it('uses opening_balance_entry when available', async () => {
    mockResults = {
      fiscal_periods: [
        { data: { period_start: '2025-01-01', opening_balance_entry_id: 'ob-entry-1' }, error: null },
      ],
      journal_entry_lines: [
        // OB entry lines (from getOpeningBalances)
        {
          data: [
            { account_number: '1930', debit_amount: 8000, credit_amount: 0 },
            { account_number: '2099', debit_amount: 0, credit_amount: 8000 },
          ],
          error: null,
        },
        // period lines (OB entry excluded via .neq)
        {
          data: [
            { account_number: '1930', debit_amount: 1000, credit_amount: 0 },
            { account_number: '3001', debit_amount: 0, credit_amount: 1000 },
          ],
          error: null,
        },
      ],
      chart_of_accounts: [
        {
          data: [
            { account_number: '1930', account_name: 'Företagskonto', account_class: 1 },
            { account_number: '2099', account_name: 'Årets resultat', account_class: 2 },
            { account_number: '3001', account_name: 'Försäljning 25%', account_class: 3 },
          ],
          error: null,
        },
      ],
    }

    const result = await generateTrialBalance(supabase, 'company-1', 'period-2')

    // 1930: opening 8000 debit + period 1000 debit = closing 9000 debit
    const acc1930 = result.rows.find((r) => r.account_number === '1930')!
    expect(acc1930.opening_debit).toBe(8000)
    expect(acc1930.closing_debit).toBe(9000)
    expect(acc1930.closing_credit).toBe(0)

    // 2099: opening 8000 credit, no period activity
    const acc2099 = result.rows.find((r) => r.account_number === '2099')!
    expect(acc2099.opening_credit).toBe(8000)
    expect(acc2099.closing_credit).toBe(8000)

    // 3001: no opening, period 1000 credit
    const acc3001 = result.rows.find((r) => r.account_number === '3001')!
    expect(acc3001.opening_debit).toBe(0)
    expect(acc3001.closing_credit).toBe(1000)
  })

  it('falls back to "Konto {number}" when account not in chart_of_accounts', async () => {
    mockResults = {
      fiscal_periods: [
        { data: { period_start: '2024-01-01', opening_balance_entry_id: null }, error: null },
      ],
      journal_entry_lines: [
        { data: [], error: null },
        {
          data: [
            { account_number: '9999', debit_amount: 100, credit_amount: 0 },
          ],
          error: null,
        },
      ],
      chart_of_accounts: [
        { data: [], error: null },
      ],
    }

    const result = await generateTrialBalance(supabase, 'company-1', 'period-1')

    expect(result.rows[0].account_name).toBe('Konto 9999')
  })

  it('derives account_class from first digit when account not in chart', async () => {
    mockResults = {
      fiscal_periods: [
        { data: { period_start: '2024-01-01', opening_balance_entry_id: null }, error: null },
      ],
      journal_entry_lines: [
        { data: [], error: null },
        {
          data: [
            { account_number: '5410', debit_amount: 200, credit_amount: 0 },
          ],
          error: null,
        },
      ],
      chart_of_accounts: [
        { data: [], error: null },
      ],
    }

    const result = await generateTrialBalance(supabase, 'company-1', 'period-1')

    expect(result.rows[0].account_class).toBe(5)
  })

  it('uses Math.round for monetary precision', async () => {
    mockResults = {
      fiscal_periods: [
        { data: { period_start: '2024-01-01', opening_balance_entry_id: null }, error: null },
      ],
      journal_entry_lines: [
        { data: [], error: null },
        {
          data: [
            { account_number: '1930', debit_amount: 33.33, credit_amount: 0 },
            { account_number: '1930', debit_amount: 33.33, credit_amount: 0 },
            { account_number: '1930', debit_amount: 33.34, credit_amount: 0 },
            { account_number: '3001', debit_amount: 0, credit_amount: 100 },
          ],
          error: null,
        },
      ],
      chart_of_accounts: [
        {
          data: [
            { account_number: '1930', account_name: 'Bank', account_class: 1 },
            { account_number: '3001', account_name: 'Revenue', account_class: 3 },
          ],
          error: null,
        },
      ],
    }

    const result = await generateTrialBalance(supabase, 'company-1', 'period-1')

    expect(result.rows[0].closing_debit).toBe(100)
    expect(result.totalDebit).toBe(100)
    expect(result.totalCredit).toBe(100)
    expect(result.isBalanced).toBe(true)
  })

  it('detects unbalanced entries (isBalanced=false)', async () => {
    mockResults = {
      fiscal_periods: [
        { data: { period_start: '2024-01-01', opening_balance_entry_id: null }, error: null },
      ],
      journal_entry_lines: [
        { data: [], error: null },
        {
          data: [
            { account_number: '1930', debit_amount: 1000, credit_amount: 0 },
            { account_number: '3001', debit_amount: 0, credit_amount: 999 },
          ],
          error: null,
        },
      ],
      chart_of_accounts: [
        {
          data: [
            { account_number: '1930', account_name: 'Bank', account_class: 1 },
            { account_number: '3001', account_name: 'Revenue', account_class: 3 },
          ],
          error: null,
        },
      ],
    }

    const result = await generateTrialBalance(supabase, 'company-1', 'period-1')

    expect(result.totalDebit).toBe(1000)
    expect(result.totalCredit).toBe(999)
    expect(result.isBalanced).toBe(false)
  })

  it('throws when lines query errors', async () => {
    mockResults = {
      fiscal_periods: [
        { data: { period_start: '2024-01-01', opening_balance_entry_id: null }, error: null },
      ],
      journal_entry_lines: [
        { data: [], error: null },
        { data: null, error: { message: 'DB error' } },
      ],
    }

    await expect(generateTrialBalance(supabase, 'company-1', 'period-1')).rejects.toThrow('DB error')
  })

  it('handles balanced two-account entry', async () => {
    mockResults = {
      fiscal_periods: [
        { data: { period_start: '2024-01-01', opening_balance_entry_id: null }, error: null },
      ],
      journal_entry_lines: [
        { data: [], error: null },
        {
          data: [
            { account_number: '1930', debit_amount: 5000, credit_amount: 0 },
            { account_number: '3001', debit_amount: 0, credit_amount: 5000 },
          ],
          error: null,
        },
      ],
      chart_of_accounts: [
        {
          data: [
            { account_number: '1930', account_name: 'Företagskonto', account_class: 1 },
            { account_number: '3001', account_name: 'Försäljning 25%', account_class: 3 },
          ],
          error: null,
        },
      ],
    }

    const result = await generateTrialBalance(supabase, 'company-1', 'period-1')

    expect(result.rows).toHaveLength(2)
    expect(result.totalDebit).toBe(5000)
    expect(result.totalCredit).toBe(5000)
    expect(result.isBalanced).toBe(true)
  })
})
