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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any
}

import {
  calculatePeriodDates,
  formatPeriodLabel,
  getVatDeclarationSummary,
  calculateVatDeclaration,
} from '../vat-declaration'
import type { VatDeclaration } from '@/types'

let supabase: ReturnType<typeof makeClient>

beforeEach(() => {
  vi.clearAllMocks()
  resultIdx = 0
  results = []
  supabase = makeClient()
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
  const emptyRc = { ruta20: 0, ruta21: 0, ruta22: 0, ruta23: 0, ruta24: 0, ruta30: 0, ruta31: 0, ruta32: 0 }
  const zeroExtras = { ruta08: 0, ruta35: 0, ruta36: 0, ruta37: 0, ruta38: 0, ruta41: 0, ruta42: 0, ruta50: 0, ruta60: 0, ruta61: 0, ruta62: 0 }

  it('calculates totals and detects payment', () => {
    const declaration: VatDeclaration = {
      period: { type: 'monthly', year: 2024, period: 1, start: '2024-01-01', end: '2024-01-31' },
      rutor: {
        ruta05: 10000, ruta06: 0, ruta07: 0,
        ruta10: 2500, ruta11: 0, ruta12: 0,
        ruta20: 0, ruta21: 0, ruta22: 0, ruta23: 0, ruta24: 0,
        ruta30: 0, ruta31: 0, ruta32: 0,
        ruta39: 0, ruta40: 0,
        ruta48: 1000, ruta49: 1500,
        ...zeroExtras,
      },
      invoiceCount: 5,
      transactionCount: 10,
      breakdown: {
        invoices: { ruta05: 10000, ruta06: 0, ruta07: 0, ruta10: 2500, ruta11: 0, ruta12: 0, ruta39: 0, ruta40: 0, base25: 10000, base12: 0, base6: 0 },
        transactions: { ruta48: 1000 },
        receipts: { ruta48: 0 },
        reverseCharge: emptyRc,
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
        ruta05: 2000, ruta06: 0, ruta07: 0,
        ruta10: 500, ruta11: 0, ruta12: 0,
        ruta20: 0, ruta21: 0, ruta22: 0, ruta23: 0, ruta24: 0,
        ruta30: 0, ruta31: 0, ruta32: 0,
        ruta39: 0, ruta40: 0,
        ruta48: 3000, ruta49: -2500,
        ...zeroExtras,
      },
      invoiceCount: 1,
      transactionCount: 20,
      breakdown: {
        invoices: { ruta05: 2000, ruta06: 0, ruta07: 0, ruta10: 500, ruta11: 0, ruta12: 0, ruta39: 0, ruta40: 0, base25: 2000, base12: 0, base6: 0 },
        transactions: { ruta48: 3000 },
        receipts: { ruta48: 0 },
        reverseCharge: emptyRc,
      },
    }

    const summary = getVatDeclarationSummary(declaration)
    expect(summary.isRefund).toBe(true)
    expect(summary.vatToPay).toBe(-2500)
  })

  it('includes ruta30-32 in totalOutputVat', () => {
    const declaration: VatDeclaration = {
      period: { type: 'monthly', year: 2024, period: 1, start: '2024-01-01', end: '2024-01-31' },
      rutor: {
        ruta05: 10000, ruta06: 0, ruta07: 0,
        ruta10: 2500, ruta11: 0, ruta12: 0,
        ruta20: 0, ruta21: 5000, ruta22: 0, ruta23: 0, ruta24: 0,
        ruta30: 1250, ruta31: 0, ruta32: 0,
        ruta39: 0, ruta40: 0,
        ruta48: 2250, ruta49: 1500,
        ...zeroExtras,
      },
      invoiceCount: 2,
      transactionCount: 0,
      breakdown: {
        invoices: { ruta05: 10000, ruta06: 0, ruta07: 0, ruta10: 2500, ruta11: 0, ruta12: 0, ruta39: 0, ruta40: 0, base25: 10000, base12: 0, base6: 0 },
        transactions: { ruta48: 0 },
        receipts: { ruta48: 0 },
        reverseCharge: { ruta20: 0, ruta21: 5000, ruta22: 0, ruta23: 0, ruta24: 0, ruta30: 1250, ruta31: 0, ruta32: 0 },
      },
    }

    const summary = getVatDeclarationSummary(declaration)
    // totalOutputVat = ruta10 + ruta30 = 2500 + 1250 = 3750
    expect(summary.totalOutputVat).toBe(3750)
  })
})

// ============================================================
// Ledger-based VAT declaration tests
//
// Mock queue order per call:
//   [0] fetchAllRows: journal_entry_lines (VAT-relevant accounts)
//   [1] fetchAllRows: journal_entries for reverse charge bases
//   [2] (if rc entries found) fetchAllRows: supplier_invoices
//   [N] entry counts: journal_entries source_type
// ============================================================

describe('calculateVatDeclaration', () => {
  it('returns all zeros when no ledger lines exist', async () => {
    results = [
      { data: [], error: null },  // journal_entry_lines
      { data: [], error: null },  // rc journal entries
      { data: [], error: null },  // entry counts
    ]

    const result = await calculateVatDeclaration(supabase, 'company-1', 'monthly', 2024, 1)

    expect(result.rutor.ruta05).toBe(0)
    expect(result.rutor.ruta10).toBe(0)
    expect(result.rutor.ruta11).toBe(0)
    expect(result.rutor.ruta12).toBe(0)
    expect(result.rutor.ruta30).toBe(0)
    expect(result.rutor.ruta31).toBe(0)
    expect(result.rutor.ruta32).toBe(0)
    expect(result.rutor.ruta48).toBe(0)
    expect(result.rutor.ruta49).toBe(0)
    expect(result.invoiceCount).toBe(0)
    expect(result.transactionCount).toBe(0)
  })

  it('sums output VAT to ruta10/11/12 and revenue to ruta05', async () => {
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
      { data: [], error: null },  // rc journal entries
      { data: [{ source_type: 'invoice_created' }, { source_type: 'invoice_created' }], error: null },
    ]

    const result = await calculateVatDeclaration(supabase, 'company-1', 'monthly', 2024, 1)

    // Output VAT in ruta 10/11/12
    expect(result.rutor.ruta10).toBe(2500)
    expect(result.rutor.ruta11).toBe(600)
    expect(result.rutor.ruta12).toBe(180)
    // All domestic revenue combined in ruta 05
    expect(result.rutor.ruta05).toBe(18000)
    // Per-rate base amounts in breakdown
    expect(result.breakdown.invoices.base25).toBe(10000)
    expect(result.breakdown.invoices.base12).toBe(5000)
    expect(result.breakdown.invoices.base6).toBe(3000)
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
      { data: [], error: null },  // rc journal entries
      { data: [{ source_type: 'bank_transaction' }, { source_type: 'bank_transaction' }], error: null },
    ]

    const result = await calculateVatDeclaration(supabase, 'company-1', 'monthly', 2024, 1)

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
      { data: [], error: null },  // rc journal entries
      { data: [], error: null },
    ]

    const result = await calculateVatDeclaration(supabase, 'company-1', 'monthly', 2024, 1)

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
      { data: [], error: null },  // rc journal entries
      { data: [], error: null },
    ]

    const result = await calculateVatDeclaration(supabase, 'company-1', 'monthly', 2024, 1)

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
      { data: [], error: null },  // rc journal entries
      { data: [{ source_type: 'invoice_created' }, { source_type: 'credit_note' }], error: null },
    ]

    const result = await calculateVatDeclaration(supabase, 'company-1', 'monthly', 2024, 1)

    // Net: 2500 - 625 = 1875 output VAT in ruta10, 10000 - 2500 = 7500 revenue in ruta05
    expect(result.rutor.ruta10).toBe(1875)
    expect(result.rutor.ruta05).toBe(7500)
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
      { data: [], error: null },  // rc journal entries
      { data: [], error: null },
    ]

    const result = await calculateVatDeclaration(supabase, 'company-1', 'monthly', 2024, 1)

    expect(result.rutor.ruta10).toBe(2500)
    expect(result.rutor.ruta05).toBe(10000)
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
      { data: [], error: null },  // rc journal entries
      { data: [], error: null },
    ]

    const result = await calculateVatDeclaration(supabase, 'company-1', 'monthly', 2024, 1)

    expect(result.rutor.ruta49).toBe(-2500) // 500 - 3000
  })

  it('accepts accountingMethod parameter for backward compatibility', async () => {
    results = [
      { data: [], error: null },
      { data: [], error: null },  // rc journal entries
      { data: [], error: null },
    ]

    // Should not throw — parameter accepted but not used
    const result = await calculateVatDeclaration(supabase, 'company-1', 'monthly', 2024, 1, 'cash')
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
      { data: [], error: null },  // rc journal entries
      { data: [], error: null },
    ]

    const result = await calculateVatDeclaration(supabase, 'company-1', 'quarterly', 2024, 1)

    // Output VAT in ruta 10/11/12
    expect(result.rutor.ruta10).toBe(2500)
    expect(result.rutor.ruta11).toBe(600)
    expect(result.rutor.ruta12).toBe(180)
    // All domestic revenue combined in ruta 05
    expect(result.rutor.ruta05).toBe(18000)
    expect(result.rutor.ruta48).toBe(1000)
    // Output: 2500 + 600 + 180 = 3280, Input: 1000 → Pay: 2280
    expect(result.rutor.ruta49).toBe(2280)
  })
})

// ============================================================
// Reverse charge (ruta 20-24, 30-32) tests
// ============================================================

describe('calculateVatDeclaration — reverse charge', () => {
  it('maps 2614/2624/2634 credit balances to ruta30/31/32', async () => {
    results = [
      {
        data: [
          // Reverse charge output VAT accounts
          { account_number: '2614', debit_amount: 0, credit_amount: 1250 },
          { account_number: '2624', debit_amount: 0, credit_amount: 120 },
          { account_number: '2634', debit_amount: 0, credit_amount: 60 },
          // Corresponding input VAT (2645)
          { account_number: '2645', debit_amount: 1430, credit_amount: 0 },
        ],
        error: null,
      },
      { data: [], error: null },  // rc journal entries (no supplier invoices for base query)
      { data: [], error: null },  // entry counts
    ]

    const result = await calculateVatDeclaration(supabase, 'company-1', 'monthly', 2024, 1)

    expect(result.rutor.ruta30).toBe(1250)
    expect(result.rutor.ruta31).toBe(120)
    expect(result.rutor.ruta32).toBe(60)
    expect(result.rutor.ruta48).toBe(1430)
    // ruta49 = (0+0+0 + 1250+120+60) - 1430 = 0
    expect(result.rutor.ruta49).toBe(0)
  })

  it('includes ruta30-32 in ruta49 formula', async () => {
    results = [
      {
        data: [
          // Regular output VAT
          { account_number: '2611', debit_amount: 0, credit_amount: 2500 },
          { account_number: '3001', debit_amount: 0, credit_amount: 10000 },
          // Reverse charge output VAT
          { account_number: '2614', debit_amount: 0, credit_amount: 500 },
          // Input VAT (regular + calculated)
          { account_number: '2641', debit_amount: 300, credit_amount: 0 },
          { account_number: '2645', debit_amount: 500, credit_amount: 0 },
        ],
        error: null,
      },
      { data: [], error: null },  // rc journal entries
      { data: [], error: null },  // entry counts
    ]

    const result = await calculateVatDeclaration(supabase, 'company-1', 'monthly', 2024, 1)

    expect(result.rutor.ruta10).toBe(2500)
    expect(result.rutor.ruta30).toBe(500)
    expect(result.rutor.ruta48).toBe(800)
    // ruta49 = (2500 + 0 + 0 + 500 + 0 + 0) - 800 = 2200
    expect(result.rutor.ruta49).toBe(2200)
  })

  it('populates ruta21 for EU services reverse charge base', async () => {
    results = [
      {
        data: [
          { account_number: '2614', debit_amount: 0, credit_amount: 1250 },
          { account_number: '2645', debit_amount: 1250, credit_amount: 0 },
        ],
        error: null,
      },
      // rc journal entries — found a posted supplier invoice entry
      {
        data: [
          { id: 'je-1', source_id: 'si-1' },
        ],
        error: null,
      },
      // supplier_invoices lookup
      {
        data: [
          {
            id: 'si-1',
            supplier_id: 'sup-1',
            reverse_charge: true,
            is_credit_note: false,
            subtotal_sek: null,
            subtotal: 5000,
            currency: 'SEK',
            exchange_rate: null,
            suppliers: { supplier_type: 'eu_business' },
          },
        ],
        error: null,
      },
      { data: [], error: null },  // entry counts
    ]

    const result = await calculateVatDeclaration(supabase, 'company-1', 'monthly', 2024, 1)

    expect(result.rutor.ruta21).toBe(5000)
    expect(result.rutor.ruta20).toBe(0)
    expect(result.rutor.ruta22).toBe(0)
    expect(result.rutor.ruta30).toBe(1250)
    expect(result.breakdown.reverseCharge.ruta21).toBe(5000)
    expect(result.breakdown.reverseCharge.ruta30).toBe(1250)
  })

  it('populates ruta22 for non-EU services reverse charge base', async () => {
    results = [
      {
        data: [
          { account_number: '2614', debit_amount: 0, credit_amount: 750 },
          { account_number: '2645', debit_amount: 750, credit_amount: 0 },
        ],
        error: null,
      },
      {
        data: [
          { id: 'je-1', source_id: 'si-1' },
        ],
        error: null,
      },
      {
        data: [
          {
            id: 'si-1',
            supplier_id: 'sup-1',
            reverse_charge: true,
            is_credit_note: false,
            subtotal_sek: 3000,
            subtotal: 300,
            currency: 'USD',
            exchange_rate: 10,
            suppliers: { supplier_type: 'non_eu_business' },
          },
        ],
        error: null,
      },
      { data: [], error: null },
    ]

    const result = await calculateVatDeclaration(supabase, 'company-1', 'monthly', 2024, 1)

    // Uses subtotal_sek when available
    expect(result.rutor.ruta22).toBe(3000)
    expect(result.rutor.ruta21).toBe(0)
  })

  it('populates ruta24 for domestic reverse charge base', async () => {
    results = [
      {
        data: [
          { account_number: '2614', debit_amount: 0, credit_amount: 500 },
          { account_number: '2645', debit_amount: 500, credit_amount: 0 },
        ],
        error: null,
      },
      {
        data: [
          { id: 'je-1', source_id: 'si-1' },
        ],
        error: null,
      },
      {
        data: [
          {
            id: 'si-1',
            supplier_id: 'sup-1',
            reverse_charge: true,
            is_credit_note: false,
            subtotal_sek: null,
            subtotal: 2000,
            currency: 'SEK',
            exchange_rate: null,
            suppliers: { supplier_type: 'swedish_business' },
          },
        ],
        error: null,
      },
      { data: [], error: null },
    ]

    const result = await calculateVatDeclaration(supabase, 'company-1', 'monthly', 2024, 1)

    expect(result.rutor.ruta24).toBe(2000)
    expect(result.rutor.ruta21).toBe(0)
    expect(result.rutor.ruta22).toBe(0)
  })

  it('returns zero ruta20-24 when no reverse charge entries exist', async () => {
    results = [
      {
        data: [
          { account_number: '2611', debit_amount: 0, credit_amount: 2500 },
          { account_number: '3001', debit_amount: 0, credit_amount: 10000 },
        ],
        error: null,
      },
      { data: [], error: null },  // no rc journal entries
      { data: [], error: null },
    ]

    const result = await calculateVatDeclaration(supabase, 'company-1', 'monthly', 2024, 1)

    expect(result.rutor.ruta20).toBe(0)
    expect(result.rutor.ruta21).toBe(0)
    expect(result.rutor.ruta22).toBe(0)
    expect(result.rutor.ruta23).toBe(0)
    expect(result.rutor.ruta24).toBe(0)
  })

  it('credit notes reduce reverse charge bases', async () => {
    results = [
      {
        data: [
          // Original invoice RC VAT
          { account_number: '2614', debit_amount: 0, credit_amount: 1250 },
          { account_number: '2645', debit_amount: 1250, credit_amount: 0 },
          // Credit note reversal
          { account_number: '2614', debit_amount: 250, credit_amount: 0 },
          { account_number: '2645', debit_amount: 0, credit_amount: 250 },
        ],
        error: null,
      },
      {
        data: [
          { id: 'je-1', source_id: 'si-1' },
          { id: 'je-2', source_id: 'si-2' },
        ],
        error: null,
      },
      {
        data: [
          {
            id: 'si-1',
            supplier_id: 'sup-1',
            reverse_charge: true,
            is_credit_note: false,
            subtotal_sek: null,
            subtotal: 5000,
            currency: 'SEK',
            exchange_rate: null,
            suppliers: { supplier_type: 'eu_business' },
          },
          {
            id: 'si-2',
            supplier_id: 'sup-1',
            reverse_charge: true,
            is_credit_note: true,
            subtotal_sek: null,
            subtotal: 1000,
            currency: 'SEK',
            exchange_rate: null,
            suppliers: { supplier_type: 'eu_business' },
          },
        ],
        error: null,
      },
      { data: [], error: null },
    ]

    const result = await calculateVatDeclaration(supabase, 'company-1', 'monthly', 2024, 1)

    // 5000 - 1000 = 4000 net base for EU services
    expect(result.rutor.ruta21).toBe(4000)
    // Net RC output VAT: 1250 - 250 = 1000
    expect(result.rutor.ruta30).toBe(1000)
  })

  it('maps domestic reverse charge input VAT (2647) to ruta48', async () => {
    results = [
      {
        data: [
          // Domestic RC: D 2647 + C 2614 (offsetting), D expense
          { account_number: '2647', debit_amount: 500, credit_amount: 0 },
          { account_number: '2614', debit_amount: 0, credit_amount: 500 },
        ],
        error: null,
      },
      { data: [], error: null },  // rc journal entries
      { data: [], error: null },
    ]

    const result = await calculateVatDeclaration(supabase, 'company-1', 'monthly', 2024, 1)

    // 2647 debit maps to ruta48
    expect(result.rutor.ruta48).toBe(500)
    // 2614 credit maps to ruta30
    expect(result.rutor.ruta30).toBe(500)
    // Net VAT = 500 - 500 = 0 (reverse charge is neutral)
    expect(result.rutor.ruta49).toBe(0)
  })

  it('maps import VAT accounts (2615/2625/2635) to ruta60/61/62', async () => {
    results = [
      {
        data: [
          { account_number: '2615', debit_amount: 0, credit_amount: 2500 },
          { account_number: '2625', debit_amount: 0, credit_amount: 600 },
          { account_number: '2635', debit_amount: 0, credit_amount: 180 },
          // Input VAT from imports
          { account_number: '2641', debit_amount: 3280, credit_amount: 0 },
        ],
        error: null,
      },
      { data: [], error: null },
      { data: [], error: null },
    ]

    const result = await calculateVatDeclaration(supabase, 'company-1', 'monthly', 2024, 1)

    expect(result.rutor.ruta60).toBe(2500)
    expect(result.rutor.ruta61).toBe(600)
    expect(result.rutor.ruta62).toBe(180)
    // ruta49 = (ruta60 + ruta61 + ruta62) - ruta48 = 3280 - 3280 = 0
    expect(result.rutor.ruta49).toBe(0)
  })

  it('maps EU/export revenue variants (3108/3105/3004) to ruta35/36/42', async () => {
    results = [
      {
        data: [
          { account_number: '3108', debit_amount: 0, credit_amount: 15000 },
          { account_number: '3105', debit_amount: 0, credit_amount: 8000 },
          { account_number: '3004', debit_amount: 0, credit_amount: 5000 },
        ],
        error: null,
      },
      { data: [], error: null },
      { data: [], error: null },
    ]

    const result = await calculateVatDeclaration(supabase, 'company-1', 'monthly', 2024, 1)

    expect(result.rutor.ruta35).toBe(15000)
    expect(result.rutor.ruta36).toBe(8000)
    expect(result.rutor.ruta42).toBe(5000)
  })

  it('maps output VAT variant accounts (2612/2622/2632) to correct rutor', async () => {
    results = [
      {
        data: [
          // Egna uttag 25%
          { account_number: '2612', debit_amount: 0, credit_amount: 1000 },
          // Uthyrning 12%
          { account_number: '2623', debit_amount: 0, credit_amount: 200 },
          // VMB 6%
          { account_number: '2636', debit_amount: 0, credit_amount: 50 },
        ],
        error: null,
      },
      { data: [], error: null },
      { data: [], error: null },
    ]

    const result = await calculateVatDeclaration(supabase, 'company-1', 'monthly', 2024, 1)

    expect(result.rutor.ruta10).toBe(1000)
    expect(result.rutor.ruta11).toBe(200)
    expect(result.rutor.ruta12).toBe(50)
  })

  it('only includes posted journal entries for reverse charge bases (reversed filtered at DB level)', async () => {
    // The query uses .eq('status', 'posted'), so reversed entries never appear
    results = [
      {
        data: [
          { account_number: '2614', debit_amount: 0, credit_amount: 1250 },
          { account_number: '2645', debit_amount: 1250, credit_amount: 0 },
        ],
        error: null,
      },
      {
        data: [
          // Only posted entries returned by DB query
          { id: 'je-1', source_id: 'si-1' },
        ],
        error: null,
      },
      {
        data: [
          {
            id: 'si-1',
            supplier_id: 'sup-1',
            reverse_charge: true,
            is_credit_note: false,
            subtotal_sek: null,
            subtotal: 5000,
            currency: 'SEK',
            exchange_rate: null,
            suppliers: { supplier_type: 'eu_business' },
          },
        ],
        error: null,
      },
      { data: [], error: null },
    ]

    const result = await calculateVatDeclaration(supabase, 'company-1', 'monthly', 2024, 1)

    // Only the posted entry's invoice (5000) should count
    expect(result.rutor.ruta21).toBe(5000)
  })

  it('handles zero output VAT on some rates but non-zero on others', async () => {
    // Only 12% sales in period — no 25% or 6% activity
    results = [
      {
        data: [
          { account_number: '2621', debit_amount: 0, credit_amount: 600 },
          { account_number: '3002', debit_amount: 0, credit_amount: 5000 },
          { account_number: '2641', debit_amount: 200, credit_amount: 0 },
        ],
        error: null,
      },
      { data: [], error: null },
      { data: [{ source_type: 'invoice_created' }], error: null },
    ]

    const result = await calculateVatDeclaration(supabase, 'company-1', 'monthly', 2024, 1)

    expect(result.rutor.ruta10).toBe(0)   // no 25% output VAT
    expect(result.rutor.ruta11).toBe(600)  // 12% output VAT
    expect(result.rutor.ruta12).toBe(0)   // no 6% output VAT
    expect(result.rutor.ruta48).toBe(200)
    // ruta49 = (0 + 600 + 0 + 0 + 0 + 0 + 0 + 0 + 0) - 200 = 400
    expect(result.rutor.ruta49).toBe(400)
  })

  it('includes sub-öre ledger amounts in ruta sums (no threshold filtering)', async () => {
    results = [
      {
        data: [
          // Very small amount — VAT declaration uses raw summation, no 0.005 filtering
          { account_number: '2611', debit_amount: 0, credit_amount: 0.001 },
          { account_number: '3001', debit_amount: 0, credit_amount: 0.004 },
        ],
        error: null,
      },
      { data: [], error: null },
      { data: [], error: null },
    ]

    const result = await calculateVatDeclaration(supabase, 'company-1', 'monthly', 2024, 1)

    // Sub-öre amounts still included in ruta sums
    expect(result.rutor.ruta10).toBe(0)   // rounded: Math.round(0.001 * 100) / 100 = 0
    expect(result.rutor.ruta05).toBe(0)   // rounded: Math.round(0.004 * 100) / 100 = 0
  })
})
