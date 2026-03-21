import { describe, it, expect, vi, beforeEach } from 'vitest'

// ============================================================
// Mock — sequential result queue (no RPC — direct joined queries)
// ============================================================

let resultIdx: number
let results: Array<{ data?: unknown; error?: unknown }>

function makeBuilder() {
  const b: Record<string, unknown> = {}
  for (const m of ['select', 'eq', 'in', 'range']) {
    b[m] = vi.fn().mockReturnValue(b)
  }
  b.single = vi.fn().mockImplementation(async () => results[resultIdx++] ?? { data: null, error: null })
  b.then = (resolve: (v: unknown) => void) => resolve(results[resultIdx++] ?? { data: null, error: null })
  return b
}

function makeClient() {
  return {
    from: vi.fn().mockImplementation(() => makeBuilder()),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any
}

import { generateTrialBalance } from '../trial-balance'

let supabase: ReturnType<typeof makeClient>

beforeEach(() => {
  vi.clearAllMocks()
  resultIdx = 0
  results = []
  supabase = makeClient()
})

describe('generateTrialBalance', () => {
  it('returns empty report when no lines exist', async () => {
    results = [
      // 0: journal_entry_lines (joined, page 1 — empty)
      { data: [], error: null },
    ]

    const result = await generateTrialBalance(supabase, 'user-1', 'period-1')

    expect(result.rows).toEqual([])
    expect(result.totalDebit).toBe(0)
    expect(result.totalCredit).toBe(0)
    expect(result.isBalanced).toBe(true)
  })

  it('aggregates lines by account and sorts by account_number', async () => {
    results = [
      // 0: journal_entry_lines (joined, page 1)
      {
        data: [
          { account_number: '3001', debit_amount: 0, credit_amount: 500 },
          { account_number: '1930', debit_amount: 300, credit_amount: 0 },
          { account_number: '3001', debit_amount: 0, credit_amount: 200 },
          { account_number: '1930', debit_amount: 450, credit_amount: 0 },
        ],
        error: null,
      },
      // 1: chart_of_accounts (page 1)
      {
        data: [
          { account_number: '1930', account_name: 'Företagskonto', account_class: 1 },
          { account_number: '3001', account_name: 'Försäljning', account_class: 3 },
        ],
        error: null,
      },
    ]

    const result = await generateTrialBalance(supabase, 'user-1', 'period-1')

    expect(result.rows).toHaveLength(2)
    // Sorted by account number
    expect(result.rows[0].account_number).toBe('1930')
    expect(result.rows[1].account_number).toBe('3001')

    // Aggregated correctly
    expect(result.rows[0].closing_debit).toBe(750)
    expect(result.rows[0].closing_credit).toBe(0)
    expect(result.rows[1].closing_debit).toBe(0)
    expect(result.rows[1].closing_credit).toBe(700)
  })

  it('falls back to "Konto {number}" when account not in chart_of_accounts', async () => {
    results = [
      // 0: journal_entry_lines
      {
        data: [
          { account_number: '9999', debit_amount: 100, credit_amount: 0 },
        ],
        error: null,
      },
      // 1: chart_of_accounts — empty
      { data: [], error: null },
    ]

    const result = await generateTrialBalance(supabase, 'user-1', 'period-1')

    expect(result.rows[0].account_name).toBe('Konto 9999')
  })

  it('derives account_class from first digit when account not in chart', async () => {
    results = [
      // 0: journal_entry_lines
      {
        data: [
          { account_number: '5410', debit_amount: 200, credit_amount: 0 },
        ],
        error: null,
      },
      // 1: chart_of_accounts — empty
      { data: [], error: null },
    ]

    const result = await generateTrialBalance(supabase, 'user-1', 'period-1')

    expect(result.rows[0].account_class).toBe(5)
  })

  it('uses Math.round for monetary precision', async () => {
    results = [
      // 0: journal_entry_lines — values that cause floating point issues
      {
        data: [
          { account_number: '1930', debit_amount: 33.33, credit_amount: 0 },
          { account_number: '1930', debit_amount: 33.33, credit_amount: 0 },
          { account_number: '1930', debit_amount: 33.34, credit_amount: 0 },
          { account_number: '3001', debit_amount: 0, credit_amount: 100 },
        ],
        error: null,
      },
      // 1: chart_of_accounts
      {
        data: [
          { account_number: '1930', account_name: 'Bank', account_class: 1 },
          { account_number: '3001', account_name: 'Revenue', account_class: 3 },
        ],
        error: null,
      },
    ]

    const result = await generateTrialBalance(supabase, 'user-1', 'period-1')

    expect(result.rows[0].closing_debit).toBe(100)
    expect(result.totalDebit).toBe(100)
    expect(result.totalCredit).toBe(100)
    expect(result.isBalanced).toBe(true)
  })

  it('detects unbalanced entries (isBalanced=false)', async () => {
    results = [
      // 0: journal_entry_lines
      {
        data: [
          { account_number: '1930', debit_amount: 1000, credit_amount: 0 },
          { account_number: '3001', debit_amount: 0, credit_amount: 999 },
        ],
        error: null,
      },
      // 1: chart_of_accounts
      {
        data: [
          { account_number: '1930', account_name: 'Bank', account_class: 1 },
          { account_number: '3001', account_name: 'Revenue', account_class: 3 },
        ],
        error: null,
      },
    ]

    const result = await generateTrialBalance(supabase, 'user-1', 'period-1')

    expect(result.totalDebit).toBe(1000)
    expect(result.totalCredit).toBe(999)
    expect(result.isBalanced).toBe(false)
  })

  it('throws when lines query errors', async () => {
    results = [
      // 0: journal_entry_lines query errors
      { data: null, error: { message: 'DB error' } },
    ]

    await expect(generateTrialBalance(supabase, 'user-1', 'period-1')).rejects.toThrow('DB error')
  })

  it('handles balanced two-account entry', async () => {
    results = [
      // 0: journal_entry_lines
      {
        data: [
          { account_number: '1930', debit_amount: 5000, credit_amount: 0 },
          { account_number: '3001', debit_amount: 0, credit_amount: 5000 },
        ],
        error: null,
      },
      // 1: chart_of_accounts
      {
        data: [
          { account_number: '1930', account_name: 'Företagskonto', account_class: 1 },
          { account_number: '3001', account_name: 'Försäljning 25%', account_class: 3 },
        ],
        error: null,
      },
    ]

    const result = await generateTrialBalance(supabase, 'user-1', 'period-1')

    expect(result.rows).toHaveLength(2)
    expect(result.totalDebit).toBe(5000)
    expect(result.totalCredit).toBe(5000)
    expect(result.isBalanced).toBe(true)
  })
})
