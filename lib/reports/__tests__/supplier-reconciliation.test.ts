import { describe, it, expect, vi, beforeEach } from 'vitest'

// ============================================================
// Mock — sequential result queue
// ============================================================

let resultIdx: number
let results: Array<{ data?: unknown; error?: unknown }>

function makeBuilder() {
  const b: Record<string, unknown> = {}
  for (const m of ['select', 'eq', 'in']) {
    b[m] = vi.fn().mockReturnValue(b)
  }
  b.single = vi.fn().mockImplementation(async () => results[resultIdx++] ?? { data: null, error: null })
  b.then = (resolve: (v: unknown) => void) => resolve(results[resultIdx++] ?? { data: null, error: null })
  return b
}

function makeClient() {
  return {
    from: vi.fn().mockImplementation(() => makeBuilder()),
  } as any
}

import { generateReconciliation } from '../supplier-reconciliation'

let supabase: ReturnType<typeof makeClient>

beforeEach(() => {
  vi.clearAllMocks()
  resultIdx = 0
  results = []
  supabase = makeClient()
})

describe('generateReconciliation', () => {
  it('returns reconciled when supplier total matches account 2440 balance', async () => {
    results = [
      // 0: supplier_invoices
      {
        data: [
          { remaining_amount: 5000 },
          { remaining_amount: 3000 },
        ],
        error: null,
      },
      // 1: journal_entry_lines for account 2440
      {
        data: [
          { debit_amount: 0, credit_amount: 10000, journal_entry_id: 'e1' },
          { debit_amount: 2000, credit_amount: 0, journal_entry_id: 'e2' },
        ],
        error: null,
      },
    ]

    const result = await generateReconciliation(supabase, 'user-1', 'period-1')

    // Supplier total: 5000 + 3000 = 8000
    expect(result.supplier_ledger_total).toBe(8000)
    // Account 2440 (credit-normal): credits - debits = 10000 - 2000 = 8000
    expect(result.account_2440_balance).toBe(8000)
    expect(result.difference).toBe(0)
    expect(result.is_reconciled).toBe(true)
  })

  it('detects mismatch when difference != 0', async () => {
    results = [
      // 0: supplier_invoices — total 5000
      {
        data: [
          { remaining_amount: 5000 },
        ],
        error: null,
      },
      // 1: journal_entry_lines — balance 7000
      {
        data: [
          { debit_amount: 0, credit_amount: 7000, journal_entry_id: 'e1' },
        ],
        error: null,
      },
    ]

    const result = await generateReconciliation(supabase, 'user-1', 'period-1')

    expect(result.supplier_ledger_total).toBe(5000)
    expect(result.account_2440_balance).toBe(7000)
    expect(result.difference).toBe(-2000)
    expect(result.is_reconciled).toBe(false)
  })

  it('returns reconciled when both are zero/empty', async () => {
    results = [
      { data: [], error: null },
      { data: [], error: null },
    ]

    const result = await generateReconciliation(supabase, 'user-1', 'period-1')

    expect(result.supplier_ledger_total).toBe(0)
    expect(result.account_2440_balance).toBe(0)
    expect(result.difference).toBe(0)
    expect(result.is_reconciled).toBe(true)
  })

  it('handles null invoice data gracefully', async () => {
    results = [
      { data: null, error: null },
      {
        data: [
          { debit_amount: 0, credit_amount: 3000, journal_entry_id: 'e1' },
        ],
        error: null,
      },
    ]

    const result = await generateReconciliation(supabase, 'user-1', 'period-1')

    expect(result.supplier_ledger_total).toBe(0)
    expect(result.account_2440_balance).toBe(3000)
    expect(result.difference).toBe(-3000)
    expect(result.is_reconciled).toBe(false)
  })

  it('computes credit-normal balance for account 2440 (liability)', async () => {
    results = [
      { data: [], error: null },
      {
        data: [
          { debit_amount: 0, credit_amount: 15000, journal_entry_id: 'e1' },
          { debit_amount: 5000, credit_amount: 0, journal_entry_id: 'e2' },
          { debit_amount: 3000, credit_amount: 0, journal_entry_id: 'e3' },
        ],
        error: null,
      },
    ]

    const result = await generateReconciliation(supabase, 'user-1', 'period-1')

    // Balance = credits - debits = 15000 - 5000 - 3000 = 7000
    expect(result.account_2440_balance).toBe(7000)
  })

  it('uses Math.round for monetary precision', async () => {
    results = [
      {
        data: [
          { remaining_amount: 33.33 },
          { remaining_amount: 33.34 },
        ],
        error: null,
      },
      {
        data: [
          { debit_amount: 0, credit_amount: 66.67, journal_entry_id: 'e1' },
        ],
        error: null,
      },
    ]

    const result = await generateReconciliation(supabase, 'user-1', 'period-1')

    expect(result.supplier_ledger_total).toBe(66.67)
    expect(result.account_2440_balance).toBe(66.67)
    expect(result.difference).toBe(0)
    expect(result.is_reconciled).toBe(true)
  })
})
