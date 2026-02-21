import { describe, it, expect, vi, beforeEach } from 'vitest'

// ============================================================
// Mock — sequential result queue
// ============================================================

let resultIdx: number
let results: Array<{ data?: unknown; error?: unknown }>

function makeBuilder() {
  const b: Record<string, unknown> = {}
  for (const m of ['select', 'eq', 'in', 'gte', 'lte', 'lt', 'or', 'not', 'range']) {
    b[m] = vi.fn().mockReturnValue(b)
  }
  b.single = vi.fn().mockImplementation(async () => results[resultIdx++] ?? { data: null, error: null })
  b.then = (resolve: (v: unknown) => void) => resolve(results[resultIdx++] ?? { data: null, error: null })
  return b
}

function makeClient() {
  return {
    from: vi.fn().mockImplementation(() => makeBuilder()),
  }
}

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => makeClient()),
}))

import {
  calculatePeriodDates,
  formatPeriodLabel,
  getVatDeclarationSummary,
  calculateVatDeclaration,
} from '../vat-declaration'
import type { VatDeclaration } from '@/types'

beforeEach(() => {
  vi.clearAllMocks()
  resultIdx = 0
  results = []
})

// ============================================================
// Pure function tests — no mocks needed
// ============================================================

describe('calculatePeriodDates', () => {
  it('returns correct dates for monthly period', () => {
    const { start, end } = calculatePeriodDates('monthly', 2024, 1)
    expect(start).toBe('2024-01-01')
    expect(end).toBe('2024-01-31')
  })

  it('returns correct dates for monthly period 12 (December)', () => {
    const { start, end } = calculatePeriodDates('monthly', 2024, 12)
    expect(start).toBe('2024-12-01')
    expect(end).toBe('2024-12-31')
  })

  it('returns correct dates for quarterly period', () => {
    const q1 = calculatePeriodDates('quarterly', 2024, 1)
    expect(q1.start).toBe('2024-01-01')
    expect(q1.end).toBe('2024-03-31')

    const q4 = calculatePeriodDates('quarterly', 2024, 4)
    expect(q4.start).toBe('2024-10-01')
    expect(q4.end).toBe('2024-12-31')
  })

  it('returns full year for yearly period', () => {
    const { start, end } = calculatePeriodDates('yearly', 2024, 1)
    expect(start).toBe('2024-01-01')
    expect(end).toBe('2024-12-31')
  })
})

describe('formatPeriodLabel', () => {
  it('formats monthly period', () => {
    expect(formatPeriodLabel('monthly', 2024, 1)).toBe('Januari 2024')
    expect(formatPeriodLabel('monthly', 2024, 6)).toBe('Juni 2024')
    expect(formatPeriodLabel('monthly', 2024, 12)).toBe('December 2024')
  })

  it('formats quarterly period', () => {
    expect(formatPeriodLabel('quarterly', 2024, 3)).toBe('Kvartal 3 2024')
  })

  it('formats yearly period', () => {
    expect(formatPeriodLabel('yearly', 2024, 1)).toBe('Helår 2024')
  })
})

describe('getVatDeclarationSummary', () => {
  it('calculates totals and detects payment', () => {
    const declaration: VatDeclaration = {
      period: { type: 'monthly', year: 2024, period: 1, start: '2024-01-01', end: '2024-01-31' },
      rutor: {
        ruta05: 2500,
        ruta06: 0,
        ruta07: 0,
        ruta10: 10000,
        ruta11: 0,
        ruta12: 0,
        ruta39: 0,
        ruta40: 0,
        ruta48: 1000,
        ruta49: 1500,
      },
      invoiceCount: 5,
      transactionCount: 10,
      breakdown: {
        invoices: { ruta05: 2500, ruta06: 0, ruta07: 0, ruta10: 10000, ruta11: 0, ruta12: 0, ruta39: 0, ruta40: 0 },
        transactions: { ruta48: 1000 },
        receipts: { ruta48: 0 },
      },
    }

    const summary = getVatDeclarationSummary(declaration)
    expect(summary.totalOutputVat).toBe(2500)
    expect(summary.totalInputVat).toBe(1000)
    expect(summary.vatToPay).toBe(1500)
    expect(summary.isRefund).toBe(false)
  })

  it('identifies refund when ruta49 is negative', () => {
    const declaration: VatDeclaration = {
      period: { type: 'monthly', year: 2024, period: 1, start: '2024-01-01', end: '2024-01-31' },
      rutor: {
        ruta05: 500,
        ruta06: 0,
        ruta07: 0,
        ruta10: 2000,
        ruta11: 0,
        ruta12: 0,
        ruta39: 0,
        ruta40: 0,
        ruta48: 3000,
        ruta49: -2500,
      },
      invoiceCount: 1,
      transactionCount: 20,
      breakdown: {
        invoices: { ruta05: 500, ruta06: 0, ruta07: 0, ruta10: 2000, ruta11: 0, ruta12: 0, ruta39: 0, ruta40: 0 },
        transactions: { ruta48: 3000 },
        receipts: { ruta48: 0 },
      },
    }

    const summary = getVatDeclarationSummary(declaration)
    expect(summary.isRefund).toBe(true)
    expect(summary.vatToPay).toBe(-2500)
  })
})

// ============================================================
// Ledger-based VAT declaration tests
//
// Mock queue order per call:
//   [0] fetchAllRows: journal_entry_lines (VAT-relevant accounts)
//   [1] entry counts: journal_entries source_type
// ============================================================

describe('calculateVatDeclaration', () => {
  it('returns all zeros when no ledger lines exist', async () => {
    results = [
      { data: [], error: null },
      { data: [], error: null },
    ]

    const result = await calculateVatDeclaration('user-1', 'monthly', 2024, 1)

    expect(result.rutor.ruta05).toBe(0)
    expect(result.rutor.ruta06).toBe(0)
    expect(result.rutor.ruta07).toBe(0)
    expect(result.rutor.ruta48).toBe(0)
    expect(result.rutor.ruta49).toBe(0)
    expect(result.invoiceCount).toBe(0)
    expect(result.transactionCount).toBe(0)
  })

  it('sums output VAT from 2611/2621/2631 credit balances', async () => {
    results = [
      {
        data: [
          { account_number: '2611', debit_amount: 0, credit_amount: 2500 },
          { account_number: '2621', debit_amount: 0, credit_amount: 600 },
          { account_number: '2631', debit_amount: 0, credit_amount: 180 },
          { account_number: '3001', debit_amount: 0, credit_amount: 10000 },
          { account_number: '3002', debit_amount: 0, credit_amount: 5000 },
          { account_number: '3003', debit_amount: 0, credit_amount: 3000 },
        ],
        error: null,
      },
      { data: [{ source_type: 'invoice_created' }, { source_type: 'invoice_created' }], error: null },
    ]

    const result = await calculateVatDeclaration('user-1', 'monthly', 2024, 1)

    expect(result.rutor.ruta05).toBe(2500)
    expect(result.rutor.ruta06).toBe(600)
    expect(result.rutor.ruta07).toBe(180)
    expect(result.rutor.ruta10).toBe(10000)
    expect(result.rutor.ruta11).toBe(5000)
    expect(result.rutor.ruta12).toBe(3000)
    expect(result.invoiceCount).toBe(2)
  })

  it('sums input VAT from 2641 debit balance', async () => {
    results = [
      {
        data: [
          { account_number: '2641', debit_amount: 250, credit_amount: 0 },
          { account_number: '2641', debit_amount: 120, credit_amount: 0 },
        ],
        error: null,
      },
      { data: [{ source_type: 'bank_transaction' }, { source_type: 'bank_transaction' }], error: null },
    ]

    const result = await calculateVatDeclaration('user-1', 'monthly', 2024, 1)

    expect(result.rutor.ruta48).toBe(370)
    expect(result.transactionCount).toBe(2)
  })

  it('includes calculated input VAT (2645) from EU reverse charge in ruta48', async () => {
    results = [
      {
        data: [
          { account_number: '2645', debit_amount: 500, credit_amount: 0 },
          { account_number: '2641', debit_amount: 200, credit_amount: 0 },
        ],
        error: null,
      },
      { data: [], error: null },
    ]

    const result = await calculateVatDeclaration('user-1', 'monthly', 2024, 1)

    // Both 2641 and 2645 debit balances sum into ruta48
    expect(result.rutor.ruta48).toBe(700)
  })

  it('maps EU/export revenue to ruta39/ruta40', async () => {
    results = [
      {
        data: [
          { account_number: '3308', debit_amount: 0, credit_amount: 8000 },
          { account_number: '3305', debit_amount: 0, credit_amount: 12000 },
        ],
        error: null,
      },
      { data: [], error: null },
    ]

    const result = await calculateVatDeclaration('user-1', 'monthly', 2024, 1)

    expect(result.rutor.ruta39).toBe(8000)
    expect(result.rutor.ruta40).toBe(12000)
  })

  it('handles credit notes as net reduction on revenue/VAT accounts', async () => {
    results = [
      {
        data: [
          // Invoice: C2611 2500, C3001 10000
          { account_number: '2611', debit_amount: 0, credit_amount: 2500 },
          { account_number: '3001', debit_amount: 0, credit_amount: 10000 },
          // Credit note reversal: D2611 625, D3001 2500
          { account_number: '2611', debit_amount: 625, credit_amount: 0 },
          { account_number: '3001', debit_amount: 2500, credit_amount: 0 },
        ],
        error: null,
      },
      { data: [{ source_type: 'invoice_created' }, { source_type: 'credit_note' }], error: null },
    ]

    const result = await calculateVatDeclaration('user-1', 'monthly', 2024, 1)

    // Net: 2500 - 625 = 1875 output VAT, 10000 - 2500 = 7500 revenue
    expect(result.rutor.ruta05).toBe(1875)
    expect(result.rutor.ruta10).toBe(7500)
    expect(result.invoiceCount).toBe(2)
  })

  it('calculates ruta49 as output minus input VAT', async () => {
    results = [
      {
        data: [
          { account_number: '2611', debit_amount: 0, credit_amount: 2500 },
          { account_number: '3001', debit_amount: 0, credit_amount: 10000 },
          { account_number: '2641', debit_amount: 350, credit_amount: 0 },
        ],
        error: null,
      },
      { data: [], error: null },
    ]

    const result = await calculateVatDeclaration('user-1', 'monthly', 2024, 1)

    expect(result.rutor.ruta05).toBe(2500)
    expect(result.rutor.ruta48).toBe(350)
    expect(result.rutor.ruta49).toBe(2150) // 2500 - 350
  })

  it('detects refund when input VAT exceeds output VAT', async () => {
    results = [
      {
        data: [
          { account_number: '2611', debit_amount: 0, credit_amount: 500 },
          { account_number: '2641', debit_amount: 3000, credit_amount: 0 },
        ],
        error: null,
      },
      { data: [], error: null },
    ]

    const result = await calculateVatDeclaration('user-1', 'monthly', 2024, 1)

    expect(result.rutor.ruta49).toBe(-2500) // 500 - 3000
  })

  it('accepts accountingMethod parameter for backward compatibility', async () => {
    results = [
      { data: [], error: null },
      { data: [], error: null },
    ]

    // Should not throw — parameter accepted but not used
    const result = await calculateVatDeclaration('user-1', 'monthly', 2024, 1, 'cash')
    expect(result.rutor.ruta49).toBe(0)
  })

  it('handles all three VAT rates in a single period', async () => {
    results = [
      {
        data: [
          // 25% rate: 10,000 revenue, 2,500 VAT
          { account_number: '3001', debit_amount: 0, credit_amount: 10000 },
          { account_number: '2611', debit_amount: 0, credit_amount: 2500 },
          // 12% rate: 5,000 revenue, 600 VAT
          { account_number: '3002', debit_amount: 0, credit_amount: 5000 },
          { account_number: '2621', debit_amount: 0, credit_amount: 600 },
          // 6% rate: 3,000 revenue, 180 VAT
          { account_number: '3003', debit_amount: 0, credit_amount: 3000 },
          { account_number: '2631', debit_amount: 0, credit_amount: 180 },
          // Input VAT from purchases
          { account_number: '2641', debit_amount: 1000, credit_amount: 0 },
        ],
        error: null,
      },
      { data: [], error: null },
    ]

    const result = await calculateVatDeclaration('user-1', 'quarterly', 2024, 1)

    expect(result.rutor.ruta05).toBe(2500)
    expect(result.rutor.ruta06).toBe(600)
    expect(result.rutor.ruta07).toBe(180)
    expect(result.rutor.ruta10).toBe(10000)
    expect(result.rutor.ruta11).toBe(5000)
    expect(result.rutor.ruta12).toBe(3000)
    expect(result.rutor.ruta48).toBe(1000)
    // Output: 2500 + 600 + 180 = 3280, Input: 1000 → Pay: 2280
    expect(result.rutor.ruta49).toBe(2280)
  })
})
