import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../trial-balance', () => ({
  generateTrialBalance: vi.fn(),
}))

import { generateBalanceSheet } from '../balance-sheet'
import { generateTrialBalance } from '../trial-balance'
import type { TrialBalanceRow } from '@/types'

const mockTrialBalance = vi.mocked(generateTrialBalance)

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const supabase = {} as any

beforeEach(() => {
  vi.clearAllMocks()
})

function makeRow(overrides: Partial<TrialBalanceRow>): TrialBalanceRow {
  return {
    account_number: '1930',
    account_name: 'Test Account',
    account_class: 1,
    opening_debit: 0,
    opening_credit: 0,
    period_debit: 0,
    period_credit: 0,
    closing_debit: 0,
    closing_credit: 0,
    ...overrides,
  }
}

describe('generateBalanceSheet', () => {
  it('returns empty report when no rows', async () => {
    mockTrialBalance.mockResolvedValue({
      rows: [],
      totalDebit: 0,
      totalCredit: 0,
      isBalanced: true,
    })

    const report = await generateBalanceSheet(supabase, 'company-1', 'period-1')

    expect(report.asset_sections).toEqual([])
    expect(report.equity_liability_sections).toEqual([])
    expect(report.total_assets).toBe(0)
    expect(report.total_equity_liabilities).toBe(0)
  })

  it('calculates assets (class 1) with debit-normal balance', async () => {
    mockTrialBalance.mockResolvedValue({
      rows: [
        makeRow({ account_number: '1510', account_name: 'Kundfordringar', account_class: 1, closing_debit: 15000, closing_credit: 0 }),
        makeRow({ account_number: '1930', account_name: 'Företagskonto', account_class: 1, closing_debit: 50000, closing_credit: 0 }),
      ],
      totalDebit: 65000,
      totalCredit: 0,
      isBalanced: false,
    })

    const report = await generateBalanceSheet(supabase, 'company-1', 'period-1')

    expect(report.asset_sections).toHaveLength(2)
    expect(report.asset_sections[0].title).toBe('Kundfordringar')
    expect(report.asset_sections[0].rows[0].amount).toBe(15000) // debit - credit
    expect(report.asset_sections[1].title).toBe('Kassa och bank')
    expect(report.asset_sections[1].rows[0].amount).toBe(50000)
    expect(report.total_assets).toBe(65000)
  })

  it('calculates equity/liabilities (class 2) with credit-normal balance', async () => {
    mockTrialBalance.mockResolvedValue({
      rows: [
        makeRow({ account_number: '2010', account_name: 'Eget kapital', account_class: 2, closing_credit: 30000, closing_debit: 0 }),
        makeRow({ account_number: '2440', account_name: 'Leverantörsskulder', account_class: 2, closing_credit: 10000, closing_debit: 0 }),
      ],
      totalDebit: 0,
      totalCredit: 40000,
      isBalanced: false,
    })

    const report = await generateBalanceSheet(supabase, 'company-1', 'period-1')

    expect(report.equity_liability_sections).toHaveLength(2)
    expect(report.equity_liability_sections[0].title).toBe('Eget kapital')
    expect(report.equity_liability_sections[0].rows[0].amount).toBe(30000) // credit - debit
    expect(report.equity_liability_sections[1].title).toBe('Kortfristiga skulder')
    expect(report.total_equity_liabilities).toBe(40000)
  })

  it('filters rows with |amount| < 0.005', async () => {
    mockTrialBalance.mockResolvedValue({
      rows: [
        makeRow({ account_number: '1930', account_name: 'Bank', account_class: 1, closing_debit: 50000, closing_credit: 0 }),
        // This row has amount = 0.003, should be filtered
        makeRow({ account_number: '1940', account_name: 'Tiny', account_class: 1, closing_debit: 0.003, closing_credit: 0 }),
      ],
      totalDebit: 50000.003,
      totalCredit: 0,
      isBalanced: false,
    })

    const report = await generateBalanceSheet(supabase, 'company-1', 'period-1')

    const bankSection = report.asset_sections.find(s => s.title === 'Kassa och bank')!
    expect(bankSection.rows).toHaveLength(1)
    expect(bankSection.rows[0].account_number).toBe('1930')
  })

  it('filters empty sections after zero-filtering', async () => {
    mockTrialBalance.mockResolvedValue({
      rows: [
        makeRow({ account_number: '1930', account_name: 'Bank', account_class: 1, closing_debit: 50000, closing_credit: 0 }),
        // Section 10 (Immateriella) will be empty after filtering
        makeRow({ account_number: '1010', account_name: 'Goodwill', account_class: 1, closing_debit: 0.001, closing_credit: 0 }),
      ],
      totalDebit: 50000.001,
      totalCredit: 0,
      isBalanced: false,
    })

    const report = await generateBalanceSheet(supabase, 'company-1', 'period-1')

    expect(report.asset_sections).toHaveLength(1)
    expect(report.asset_sections[0].title).toBe('Kassa och bank')
  })

  it('groups by two-digit prefix (1510 + 1520 under 15)', async () => {
    mockTrialBalance.mockResolvedValue({
      rows: [
        makeRow({ account_number: '1510', account_name: 'Kundfordringar', account_class: 1, closing_debit: 10000, closing_credit: 0 }),
        makeRow({ account_number: '1520', account_name: 'Osäkra kundfordringar', account_class: 1, closing_debit: 2000, closing_credit: 0 }),
      ],
      totalDebit: 12000,
      totalCredit: 0,
      isBalanced: false,
    })

    const report = await generateBalanceSheet(supabase, 'company-1', 'period-1')

    expect(report.asset_sections).toHaveLength(1)
    expect(report.asset_sections[0].title).toBe('Kundfordringar')
    expect(report.asset_sections[0].rows).toHaveLength(2)
    expect(report.asset_sections[0].subtotal).toBe(12000)
  })

  it('ignores class 3-8 accounts (income statement)', async () => {
    mockTrialBalance.mockResolvedValue({
      rows: [
        makeRow({ account_number: '1930', account_name: 'Bank', account_class: 1, closing_debit: 50000, closing_credit: 0 }),
        makeRow({ account_number: '3001', account_name: 'Revenue', account_class: 3, closing_credit: 40000, closing_debit: 0 }),
        makeRow({ account_number: '5010', account_name: 'Rent', account_class: 5, closing_debit: 8000, closing_credit: 0 }),
        makeRow({ account_number: '8310', account_name: 'Interest', account_class: 8, closing_credit: 500, closing_debit: 0 }),
      ],
      totalDebit: 58000,
      totalCredit: 40500,
      isBalanced: false,
    })

    const report = await generateBalanceSheet(supabase, 'company-1', 'period-1')

    expect(report.asset_sections).toHaveLength(1) // Only 1930
    // Class 3-8 accounts are not included as balance sheet rows, but their
    // net result (credit - debit = 40000 + 500 - 8000 = 32500) appears as
    // "Årets resultat" in equity so the balance sheet can balance.
    expect(report.equity_liability_sections).toHaveLength(1)
    expect(report.equity_liability_sections[0].title).toBe('Årets resultat')
    expect(report.equity_liability_sections[0].subtotal).toBe(32500)
    expect(report.total_assets).toBe(50000)
    expect(report.total_equity_liabilities).toBe(32500)
  })

  it('uses Math.round for monetary precision on subtotals', async () => {
    mockTrialBalance.mockResolvedValue({
      rows: [
        makeRow({ account_number: '1930', account_name: 'Bank', account_class: 1, closing_debit: 33.33, closing_credit: 0 }),
        makeRow({ account_number: '1940', account_name: 'Kassa', account_class: 1, closing_debit: 33.33, closing_credit: 0 }),
        makeRow({ account_number: '1950', account_name: 'Annan bank', account_class: 1, closing_debit: 33.34, closing_credit: 0 }),
      ],
      totalDebit: 100,
      totalCredit: 0,
      isBalanced: false,
    })

    const report = await generateBalanceSheet(supabase, 'company-1', 'period-1')

    // All three are in group '19' (Kassa och bank)
    const section = report.asset_sections.find(s => s.title === 'Kassa och bank')!
    expect(section.subtotal).toBe(100)
    expect(report.total_assets).toBe(100)
  })
})
