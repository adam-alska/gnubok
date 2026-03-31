import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../trial-balance', () => ({
  generateTrialBalance: vi.fn(),
}))

import { generateIncomeStatement } from '../income-statement'
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
    account_number: '3001',
    account_name: 'Test Account',
    account_class: 3,
    opening_debit: 0,
    opening_credit: 0,
    period_debit: 0,
    period_credit: 0,
    closing_debit: 0,
    closing_credit: 0,
    ...overrides,
  }
}

describe('generateIncomeStatement', () => {
  it('returns empty report when no rows', async () => {
    mockTrialBalance.mockResolvedValue({
      rows: [],
      totalDebit: 0,
      totalCredit: 0,
      isBalanced: true,
    })

    const report = await generateIncomeStatement(supabase, 'company-1', 'period-1')

    expect(report.revenue_sections).toEqual([])
    expect(report.expense_sections).toEqual([])
    expect(report.financial_sections).toEqual([])
    expect(report.net_result).toBe(0)
  })

  it('calculates revenue (class 3) with credit-normal balance', async () => {
    mockTrialBalance.mockResolvedValue({
      rows: [
        makeRow({ account_number: '3001', account_name: 'Försäljning 25%', account_class: 3, closing_credit: 10000, closing_debit: 0 }),
        makeRow({ account_number: '3002', account_name: 'Försäljning 12%', account_class: 3, closing_credit: 5000, closing_debit: 0 }),
      ],
      totalDebit: 0,
      totalCredit: 15000,
      isBalanced: false,
    })

    const report = await generateIncomeStatement(supabase, 'company-1', 'period-1')

    expect(report.revenue_sections).toHaveLength(1)
    expect(report.revenue_sections[0].title).toBe('Huvudintäkter')
    expect(report.revenue_sections[0].rows).toHaveLength(2)
    expect(report.revenue_sections[0].rows[0].amount).toBe(10000)
    expect(report.revenue_sections[0].rows[1].amount).toBe(5000)
    expect(report.total_revenue).toBe(15000)
  })

  it('calculates expenses (class 4-7) with debit-normal balance', async () => {
    mockTrialBalance.mockResolvedValue({
      rows: [
        makeRow({ account_number: '5010', account_name: 'Lokalhyra', account_class: 5, closing_debit: 8000, closing_credit: 0 }),
        makeRow({ account_number: '6200', account_name: 'Telefon', account_class: 6, closing_debit: 2000, closing_credit: 0 }),
      ],
      totalDebit: 10000,
      totalCredit: 0,
      isBalanced: false,
    })

    const report = await generateIncomeStatement(supabase, 'company-1', 'period-1')

    expect(report.expense_sections).toHaveLength(2)
    expect(report.expense_sections[0].title).toBe('Lokalkostnader')
    expect(report.expense_sections[0].rows[0].amount).toBe(8000)
    expect(report.expense_sections[1].title).toBe('Tele och post')
    expect(report.total_expenses).toBe(10000)
  })

  it('calculates financial items (class 8) with mixed balance', async () => {
    mockTrialBalance.mockResolvedValue({
      rows: [
        makeRow({ account_number: '8310', account_name: 'Ränteintäkter', account_class: 8, closing_credit: 500, closing_debit: 0 }),
        makeRow({ account_number: '8410', account_name: 'Räntekostnader', account_class: 8, closing_debit: 300, closing_credit: 0 }),
      ],
      totalDebit: 300,
      totalCredit: 500,
      isBalanced: false,
    })

    const report = await generateIncomeStatement(supabase, 'company-1', 'period-1')

    expect(report.financial_sections).toHaveLength(2)
    // Financial uses credit - debit
    const interestIncome = report.financial_sections.find(s => s.title === 'Ränteintäkter')!
    expect(interestIncome.rows[0].amount).toBe(500) // credit 500 - debit 0

    const interestExpense = report.financial_sections.find(s => s.title === 'Räntekostnader')!
    expect(interestExpense.rows[0].amount).toBe(-300) // credit 0 - debit 300
  })

  it('computes net_result = revenue - expenses + financial', async () => {
    mockTrialBalance.mockResolvedValue({
      rows: [
        makeRow({ account_number: '3001', account_name: 'Revenue', account_class: 3, closing_credit: 20000, closing_debit: 0 }),
        makeRow({ account_number: '5010', account_name: 'Rent', account_class: 5, closing_debit: 8000, closing_credit: 0 }),
        makeRow({ account_number: '8310', account_name: 'Interest', account_class: 8, closing_credit: 1000, closing_debit: 0 }),
      ],
      totalDebit: 8000,
      totalCredit: 21000,
      isBalanced: false,
    })

    const report = await generateIncomeStatement(supabase, 'company-1', 'period-1')

    expect(report.total_revenue).toBe(20000)
    expect(report.total_expenses).toBe(8000)
    expect(report.total_financial).toBe(1000)
    expect(report.net_result).toBe(13000) // 20000 - 8000 + 1000
  })

  it('filters rows with |amount| < 0.005', async () => {
    mockTrialBalance.mockResolvedValue({
      rows: [
        makeRow({ account_number: '3001', account_name: 'Revenue', account_class: 3, closing_credit: 10000, closing_debit: 0 }),
        // This row has amount = 0.004, should be filtered
        makeRow({ account_number: '3002', account_name: 'Tiny', account_class: 3, closing_credit: 0.004, closing_debit: 0 }),
      ],
      totalDebit: 0,
      totalCredit: 10000.004,
      isBalanced: false,
    })

    const report = await generateIncomeStatement(supabase, 'company-1', 'period-1')

    // Only the significant revenue row should appear
    const revenueSection = report.revenue_sections.find(s => s.title === 'Huvudintäkter')!
    expect(revenueSection.rows).toHaveLength(1)
    expect(revenueSection.rows[0].account_number).toBe('3001')
  })

  it('filters empty sections (no rows after zero-filtering)', async () => {
    mockTrialBalance.mockResolvedValue({
      rows: [
        makeRow({ account_number: '3001', account_name: 'Revenue', account_class: 3, closing_credit: 5000, closing_debit: 0 }),
        // Section 36 will be empty after filtering
        makeRow({ account_number: '3601', account_name: 'Tiny side income', account_class: 3, closing_credit: 0.001, closing_debit: 0 }),
      ],
      totalDebit: 0,
      totalCredit: 5000.001,
      isBalanced: false,
    })

    const report = await generateIncomeStatement(supabase, 'company-1', 'period-1')

    // Only the non-empty section should remain
    expect(report.revenue_sections).toHaveLength(1)
    expect(report.revenue_sections[0].title).toBe('Huvudintäkter')
  })

  it('ignores class 1-2 accounts (balance sheet)', async () => {
    mockTrialBalance.mockResolvedValue({
      rows: [
        makeRow({ account_number: '1930', account_name: 'Bank', account_class: 1, closing_debit: 50000, closing_credit: 0 }),
        makeRow({ account_number: '2440', account_name: 'Leverantörsskulder', account_class: 2, closing_credit: 10000, closing_debit: 0 }),
        makeRow({ account_number: '3001', account_name: 'Revenue', account_class: 3, closing_credit: 40000, closing_debit: 0 }),
      ],
      totalDebit: 50000,
      totalCredit: 50000,
      isBalanced: true,
    })

    const report = await generateIncomeStatement(supabase, 'company-1', 'period-1')

    // Only class 3 should appear
    expect(report.revenue_sections).toHaveLength(1)
    expect(report.expense_sections).toEqual([])
    expect(report.financial_sections).toEqual([])
    expect(report.total_revenue).toBe(40000)
  })
})
