import { describe, it, expect, vi, beforeEach } from 'vitest'
import { eventBus } from '@/lib/events/bus'
import { makeFiscalPeriod } from '@/tests/helpers'

// ============================================================
// Mock — separate client (no .then) from query builder (thenable)
// ============================================================

let resultIdx: number
let results: Array<{ data?: unknown; error?: unknown; count?: number | null }>

function makeBuilder() {
  const b: Record<string, unknown> = {}
  for (const m of ['select', 'eq', 'insert', 'update', 'delete', 'lte', 'gte', 'in', 'neq', 'not', 'or', 'order', 'limit', 'is']) {
    b[m] = vi.fn().mockReturnValue(b)
  }
  b.single = vi.fn().mockImplementation(async () => results[resultIdx++] ?? { data: null, error: null })
  b.maybeSingle = vi.fn().mockImplementation(async () => results[resultIdx++] ?? { data: null, error: null })
  b.then = (resolve: (v: unknown) => void) => resolve(results[resultIdx++] ?? { data: null, error: null })
  return b
}

function makeClient() {
  return {
    from: vi.fn().mockImplementation(() => makeBuilder()),
    rpc: vi.fn().mockImplementation(async () => results[resultIdx++] ?? { data: null, error: null }),
  }
}

vi.mock('@/lib/reports/trial-balance', () => ({
  generateTrialBalance: vi.fn(),
}))

vi.mock('@/lib/reports/income-statement', () => ({
  generateIncomeStatement: vi.fn(),
}))

vi.mock('@/lib/bookkeeping/engine', () => ({
  createJournalEntry: vi.fn(),
}))

vi.mock('@/lib/bookkeeping/currency-revaluation', () => ({
  previewCurrencyRevaluation: vi.fn().mockResolvedValue({
    items: [],
    lines: [],
    closingRates: {},
    totalGain: 0,
    totalLoss: 0,
    netEffect: 0,
  }),
  executeCurrencyRevaluation: vi.fn().mockResolvedValue(null),
}))

vi.mock('../period-service', () => ({
  lockPeriod: vi.fn(),
  closePeriod: vi.fn(),
  createNextPeriod: vi.fn(),
}))

import { validateYearEndReadiness, previewYearEndClosing } from '../year-end-service'
import { generateTrialBalance } from '@/lib/reports/trial-balance'
import { generateIncomeStatement } from '@/lib/reports/income-statement'

beforeEach(() => {
  vi.clearAllMocks()
  eventBus.clear()
  resultIdx = 0
  results = []
})

describe('validateYearEndReadiness', () => {
  it('returns errors when drafts exist', async () => {
    const period = makeFiscalPeriod({ id: 'fp-1', is_closed: false, closing_entry_id: null })

    results = [
      // 0: fetch period (.single)
      { data: period, error: null },
      // 1: count drafts (thenable chain) — count: 3
      { data: null, error: null, count: 3 },
      // 2: count posted entries (thenable chain) — count: 10
      { data: null, error: null, count: 10 },
      // 3: count revaluation entries — count: 0
      { data: null, error: null, count: 0 },
      // 4: count fx receivables — count: 0
      { data: null, error: null, count: 0 },
      // 5: count fx payables — count: 0
      { data: null, error: null, count: 0 },
    ]

    vi.mocked(generateTrialBalance).mockResolvedValue({
      rows: [],
      isBalanced: true,
      totalDebit: 0,
      totalCredit: 0,
    } as never)

    const supabase = makeClient()
    const result = await validateYearEndReadiness(supabase as never, 'user-1', 'fp-1')
    expect(result.ready).toBe(false)
    expect(result.errors.some((e: string) => e.includes('draft'))).toBe(true)
  })

  it('returns errors when trial balance is unbalanced', async () => {
    const period = makeFiscalPeriod({ id: 'fp-1', is_closed: false, closing_entry_id: null })

    results = [
      { data: period, error: null },
      { data: null, error: null, count: 0 },   // no drafts
      { data: null, error: null, count: 5 },    // some posted
      { data: null, error: null, count: 0 },   // no revaluation
      { data: null, error: null, count: 0 },   // no fx receivables
      { data: null, error: null, count: 0 },   // no fx payables
    ]

    vi.mocked(generateTrialBalance).mockResolvedValue({
      rows: [],
      isBalanced: false,
      totalDebit: 10000,
      totalCredit: 9500,
    } as never)

    const supabase = makeClient()
    const result = await validateYearEndReadiness(supabase as never, 'user-1', 'fp-1')
    expect(result.ready).toBe(false)
    expect(result.trialBalanceBalanced).toBe(false)
    expect(result.errors.some((e: string) => e.includes('Trial balance'))).toBe(true)
  })

  it('warns on voucher gaps', async () => {
    const period = makeFiscalPeriod({ id: 'fp-1', is_closed: false, closing_entry_id: null })

    // Create a client with custom rpc that returns gap data
    const builder = makeBuilder()
    const supabase = {
      from: vi.fn().mockImplementation(() => builder),
      rpc: vi.fn().mockResolvedValue({
        data: [{ gap_start: 5, gap_end: 7 }],
        error: null,
      }),
    }

    resultIdx = 0
    results = [
      { data: period, error: null },
      { data: null, error: null, count: 0 },   // no drafts
      { data: null, error: null, count: 5 },    // some posted
      { data: null, error: null, count: 0 },   // no revaluation
      { data: null, error: null, count: 0 },   // no fx receivables
      { data: null, error: null, count: 0 },   // no fx payables
    ]

    vi.mocked(generateTrialBalance).mockResolvedValue({
      rows: [],
      isBalanced: true,
      totalDebit: 10000,
      totalCredit: 10000,
    } as never)

    const result = await validateYearEndReadiness(supabase as never, 'user-1', 'fp-1')
    expect(result.warnings.some((w: string) => w.includes('gap'))).toBe(true)
    expect(result.voucherGaps).toHaveLength(1)
  })
})

describe('previewYearEndClosing', () => {
  it('calculates net result from class 3-8 accounts', async () => {
    results = [
      // 0: fetch company_settings (.single)
      { data: { entity_type: 'aktiebolag' }, error: null },
      // 1: fetch fiscal period for closing date (.single)
      { data: { period_end: '2024-12-31' }, error: null },
    ]

    vi.mocked(generateIncomeStatement).mockResolvedValue({
      net_result: 150000,
    } as never)

    vi.mocked(generateTrialBalance).mockResolvedValue({
      rows: [
        { account_number: '3001', account_name: 'Tjänsteintäkter', account_class: 3, closing_debit: 0, closing_credit: 500000 },
        { account_number: '5010', account_name: 'Lokalhyra', account_class: 5, closing_debit: 200000, closing_credit: 0 },
        { account_number: '6570', account_name: 'Bankavgifter', account_class: 6, closing_debit: 150000, closing_credit: 0 },
      ],
      isBalanced: true,
      totalDebit: 350000,
      totalCredit: 500000,
    } as never)

    const supabase = makeClient()
    const preview = await previewYearEndClosing(supabase as never, 'user-1', 'fp-1')

    expect(preview.netResult).toBe(150000)
    expect(preview.closingAccount).toBe('2099')
    expect(preview.closingAccountName).toBe('Årets resultat')
    expect(preview.closingLines.length).toBeGreaterThanOrEqual(3)
    expect(preview.resultAccountSummary).toHaveLength(3)
  })

  it('uses 2010 for EF entity type', async () => {
    results = [
      { data: { entity_type: 'enskild_firma' }, error: null },
      // fetch fiscal period for closing date (.single)
      { data: { period_end: '2024-12-31' }, error: null },
    ]

    vi.mocked(generateIncomeStatement).mockResolvedValue({ net_result: 50000 } as never)
    vi.mocked(generateTrialBalance).mockResolvedValue({
      rows: [
        { account_number: '3001', account_name: 'Intäkter', account_class: 3, closing_debit: 0, closing_credit: 100000 },
        { account_number: '5010', account_name: 'Kostnader', account_class: 5, closing_debit: 50000, closing_credit: 0 },
      ],
      isBalanced: true,
      totalDebit: 50000,
      totalCredit: 100000,
    } as never)

    const supabase = makeClient()
    const preview = await previewYearEndClosing(supabase as never, 'user-1', 'fp-1')

    expect(preview.closingAccount).toBe('2010')
    expect(preview.closingAccountName).toBe('Eget kapital')
  })
})
