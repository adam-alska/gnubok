import { describe, it, expect, vi, beforeEach } from 'vitest'

// ============================================================
// Mock — sequential result queue
// ============================================================

let resultIdx: number
let results: Array<{ data?: unknown; error?: unknown }>

function makeBuilder() {
  const b: Record<string, unknown> = {}
  for (const m of ['select', 'eq', 'in', 'gte', 'lte', 'lt', 'or', 'not']) {
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
  calculateVatDeclarationFromTaxCodes,
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
        transactions: { ruta48: 800 },
        receipts: { ruta48: 200 },
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
// Async tests — require Supabase mocks
// ============================================================

describe('calculateVatDeclaration', () => {
  it('returns all zeros when no data exists', async () => {
    results = [
      // 0: invoices
      { data: [], error: null },
      // 1: transactions
      { data: [], error: null },
      // 2: receipts
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

  it('maps invoice VAT to correct rutor by moms_ruta', async () => {
    results = [
      // 0: invoices — various moms_ruta values
      {
        data: [
          { subtotal: 10000, vat_amount: 2500, moms_ruta: '05', subtotal_sek: null, vat_amount_sek: null },
          { subtotal: 5000, vat_amount: 600, moms_ruta: '06', subtotal_sek: null, vat_amount_sek: null },
          { subtotal: 3000, vat_amount: 180, moms_ruta: '07', subtotal_sek: null, vat_amount_sek: null },
          { subtotal: 8000, vat_amount: 0, moms_ruta: '39', subtotal_sek: null, vat_amount_sek: null },
          { subtotal: 12000, vat_amount: 0, moms_ruta: '40', subtotal_sek: null, vat_amount_sek: null },
        ],
        error: null,
      },
      // 1: transactions (none)
      { data: [], error: null },
      // 2: receipts (none)
      { data: [], error: null },
    ]

    const result = await calculateVatDeclaration('user-1', 'monthly', 2024, 1)

    expect(result.rutor.ruta05).toBe(2500)
    expect(result.rutor.ruta06).toBe(600)
    expect(result.rutor.ruta07).toBe(180)
    expect(result.rutor.ruta10).toBe(10000)
    expect(result.rutor.ruta11).toBe(5000)
    expect(result.rutor.ruta12).toBe(3000)
    expect(result.rutor.ruta39).toBe(8000)
    expect(result.rutor.ruta40).toBe(12000)
  })

  it('prefers subtotal_sek/vat_amount_sek for foreign currency invoices', async () => {
    results = [
      // 0: invoices — foreign currency with SEK conversion
      {
        data: [
          { subtotal: 1000, vat_amount: 250, moms_ruta: '05', subtotal_sek: 11000, vat_amount_sek: 2750 },
        ],
        error: null,
      },
      // 1: transactions
      { data: [], error: null },
      // 2: receipts
      { data: [], error: null },
    ]

    const result = await calculateVatDeclaration('user-1', 'monthly', 2024, 1)

    // Should use _sek values
    expect(result.rutor.ruta05).toBe(2750)
    expect(result.rutor.ruta10).toBe(11000)
  })

  it('defaults to ruta05 when moms_ruta is null but VAT > 0', async () => {
    results = [
      // 0: invoices — null moms_ruta with VAT
      {
        data: [
          { subtotal: 4000, vat_amount: 1000, moms_ruta: null, subtotal_sek: null, vat_amount_sek: null },
        ],
        error: null,
      },
      // 1: transactions
      { data: [], error: null },
      // 2: receipts
      { data: [], error: null },
    ]

    const result = await calculateVatDeclaration('user-1', 'monthly', 2024, 1)

    expect(result.rutor.ruta05).toBe(1000)
    expect(result.rutor.ruta10).toBe(4000)
  })

  it('calculates input VAT from transaction categories', async () => {
    results = [
      // 0: invoices
      { data: [], error: null },
      // 1: transactions — business expenses with categories
      {
        data: [
          // 25% category: expense_software, amount -1250 → VAT = 1250 * 0.25/1.25 = 250
          { amount: -1250, amount_sek: null, is_business: true, category: 'expense_software' },
          // 12% category: expense_travel, amount -1120 → VAT = 1120 * 0.12/1.12 = 120
          { amount: -1120, amount_sek: null, is_business: true, category: 'expense_travel' },
        ],
        error: null,
      },
      // 2: receipts
      { data: [], error: null },
    ]

    const result = await calculateVatDeclaration('user-1', 'monthly', 2024, 1)

    // 250 + 120 = 370
    expect(result.rutor.ruta48).toBe(370)
  })

  it('sums VAT from confirmed receipts', async () => {
    results = [
      // 0: invoices
      { data: [], error: null },
      // 1: transactions
      { data: [], error: null },
      // 2: receipts — confirmed with vat_amount
      {
        data: [
          { status: 'confirmed', vat_amount: 59.8 },
          { status: 'confirmed', vat_amount: 125 },
        ],
        error: null,
      },
    ]

    const result = await calculateVatDeclaration('user-1', 'monthly', 2024, 1)

    expect(result.rutor.ruta48).toBe(184.8)
  })

  it('calculates ruta49 as output minus input VAT', async () => {
    results = [
      // 0: invoices — 25% VAT
      {
        data: [
          { subtotal: 10000, vat_amount: 2500, moms_ruta: '05', subtotal_sek: null, vat_amount_sek: null },
        ],
        error: null,
      },
      // 1: transactions — 25% expense
      {
        data: [
          { amount: -1250, amount_sek: null, is_business: true, category: 'expense_software' },
        ],
        error: null,
      },
      // 2: receipts
      {
        data: [
          { status: 'confirmed', vat_amount: 100 },
        ],
        error: null,
      },
    ]

    const result = await calculateVatDeclaration('user-1', 'monthly', 2024, 1)

    // Output: 2500, Input: 250 + 100 = 350
    expect(result.rutor.ruta49).toBe(2150)
  })
})

describe('calculateVatDeclarationFromTaxCodes', () => {
  it('maps journal lines to boxes via tax codes', async () => {
    results = [
      // 0: tax_codes
      {
        data: [
          {
            code: 'MP1',
            user_id: null,
            moms_basis_boxes: ['10'],
            moms_tax_boxes: ['05'],
            moms_input_boxes: [],
          },
        ],
        error: null,
      },
      // 1: journal_entry_lines with tax_code
      {
        data: [
          {
            tax_code: 'MP1',
            debit_amount: 0,
            credit_amount: 2500,
            journal_entry_id: 'e1',
            journal_entries: { user_id: 'user-1', entry_date: '2024-01-15', status: 'posted' },
          },
        ],
        error: null,
      },
    ]

    const result = await calculateVatDeclarationFromTaxCodes('user-1', 'monthly', 2024, 1)

    expect(result.rutor.ruta05).toBe(2500)
    expect(result.rutor.ruta10).toBe(2500)
  })

  it('user tax codes override system codes', async () => {
    results = [
      // 0: tax_codes — system and user with same code
      {
        data: [
          {
            code: 'MP1',
            user_id: null,
            moms_basis_boxes: ['10'],
            moms_tax_boxes: ['05'],
            moms_input_boxes: [],
          },
          {
            code: 'MP1',
            user_id: 'user-1',
            moms_basis_boxes: ['11'],
            moms_tax_boxes: ['06'],
            moms_input_boxes: [],
          },
        ],
        error: null,
      },
      // 1: journal_entry_lines
      {
        data: [
          {
            tax_code: 'MP1',
            debit_amount: 0,
            credit_amount: 600,
            journal_entry_id: 'e1',
            journal_entries: { user_id: 'user-1', entry_date: '2024-01-15', status: 'posted' },
          },
        ],
        error: null,
      },
    ]

    const result = await calculateVatDeclarationFromTaxCodes('user-1', 'monthly', 2024, 1)

    // User override maps to ruta06/ruta11 instead of ruta05/ruta10
    expect(result.rutor.ruta05).toBe(0)
    expect(result.rutor.ruta06).toBe(600)
    expect(result.rutor.ruta11).toBe(600)
  })

  it('returns all zeros when no lines have tax codes', async () => {
    results = [
      // 0: tax_codes
      { data: [], error: null },
      // 1: journal_entry_lines — empty
      { data: [], error: null },
    ]

    const result = await calculateVatDeclarationFromTaxCodes('user-1', 'monthly', 2024, 1)

    expect(result.rutor.ruta05).toBe(0)
    expect(result.rutor.ruta48).toBe(0)
    expect(result.rutor.ruta49).toBe(0)
  })
})
