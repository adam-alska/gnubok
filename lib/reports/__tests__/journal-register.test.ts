import { describe, it, expect, vi, beforeEach } from 'vitest'

// ============================================================
// Mock — sequential result queue
// ============================================================

let resultIdx: number
let results: Array<{ data?: unknown; error?: unknown }>

function makeBuilder() {
  const b: Record<string, unknown> = {}
  for (const m of ['select', 'eq', 'in', 'order', 'range']) {
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

import { generateJournalRegister } from '../journal-register'

let supabase: ReturnType<typeof makeClient>

beforeEach(() => {
  vi.clearAllMocks()
  resultIdx = 0
  results = []
  supabase = makeClient()
})

describe('generateJournalRegister', () => {
  it('returns empty report when no fiscal period found', async () => {
    results = [
      { data: null, error: null },
    ]

    const report = await generateJournalRegister(supabase, 'user-1', 'period-1')
    expect(report.entries).toEqual([])
    expect(report.total_entries).toBe(0)
    expect(report.period).toEqual({ start: '', end: '' })
  })

  it('returns empty report when no entries in period', async () => {
    results = [
      { data: { period_start: '2024-01-01', period_end: '2024-12-31' }, error: null },
      { data: [], error: null },
    ]

    const report = await generateJournalRegister(supabase, 'user-1', 'period-1')
    expect(report.entries).toEqual([])
    expect(report.total_entries).toBe(0)
    expect(report.period).toEqual({ start: '2024-01-01', end: '2024-12-31' })
  })

  it('produces entries in registration order with correct totals', async () => {
    results = [
      // 0: fiscal_periods.single()
      { data: { period_start: '2024-01-01', period_end: '2024-12-31' }, error: null },
      // 1: journal_entries (already ordered by series/number)
      {
        data: [
          { id: 'e1', entry_date: '2024-01-15', voucher_number: 1, voucher_series: 'A', description: 'Sale invoice', source_type: 'invoice', status: 'posted' },
          { id: 'e2', entry_date: '2024-02-01', voucher_number: 2, voucher_series: 'A', description: 'Payment', source_type: 'transaction', status: 'posted' },
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
    ]

    const report = await generateJournalRegister(supabase, 'user-1', 'period-1')

    expect(report.total_entries).toBe(2)
    expect(report.entries[0].voucher_number).toBe(1)
    expect(report.entries[1].voucher_number).toBe(2)

    // Entry 1: sale invoice
    expect(report.entries[0].total_debit).toBe(1250)
    expect(report.entries[0].total_credit).toBe(1250)
    expect(report.entries[0].lines).toHaveLength(3)

    // Lines sorted by account number
    expect(report.entries[0].lines[0].account_number).toBe('1510')
    expect(report.entries[0].lines[1].account_number).toBe('2611')
    expect(report.entries[0].lines[2].account_number).toBe('3001')

    // Grand totals
    expect(report.total_debit).toBe(2500)
    expect(report.total_credit).toBe(2500)
  })

  it('includes reversed entries with correct status', async () => {
    results = [
      { data: { period_start: '2024-01-01', period_end: '2024-12-31' }, error: null },
      {
        data: [
          { id: 'e1', entry_date: '2024-01-15', voucher_number: 1, voucher_series: 'A', description: 'Original', source_type: 'manual', status: 'reversed' },
          { id: 'e2', entry_date: '2024-01-16', voucher_number: 2, voucher_series: 'A', description: 'Reversal', source_type: 'manual', status: 'posted' },
        ],
        error: null,
      },
      {
        data: [
          { account_number: '1930', debit_amount: 500, credit_amount: 0, journal_entry_id: 'e1' },
          { account_number: '5410', debit_amount: 0, credit_amount: 500, journal_entry_id: 'e1' },
          { account_number: '5410', debit_amount: 500, credit_amount: 0, journal_entry_id: 'e2' },
          { account_number: '1930', debit_amount: 0, credit_amount: 500, journal_entry_id: 'e2' },
        ],
        error: null,
      },
      { data: [], error: null },
    ]

    const report = await generateJournalRegister(supabase, 'user-1', 'period-1')

    expect(report.entries[0].status).toBe('reversed')
    expect(report.entries[1].status).toBe('posted')
    expect(report.total_entries).toBe(2)
  })

  it('resolves account names from chart_of_accounts', async () => {
    results = [
      { data: { period_start: '2024-01-01', period_end: '2024-12-31' }, error: null },
      {
        data: [
          { id: 'e1', entry_date: '2024-01-15', voucher_number: 1, voucher_series: 'A', description: 'Test', source_type: 'manual', status: 'posted' },
        ],
        error: null,
      },
      {
        data: [
          { account_number: '1930', debit_amount: 100, credit_amount: 0, journal_entry_id: 'e1' },
          { account_number: '9999', debit_amount: 0, credit_amount: 100, journal_entry_id: 'e1' },
        ],
        error: null,
      },
      {
        data: [
          { account_number: '1930', account_name: 'Företagskonto' },
        ],
        error: null,
      },
    ]

    const report = await generateJournalRegister(supabase, 'user-1', 'period-1')

    const line1930 = report.entries[0].lines.find((l) => l.account_number === '1930')!
    expect(line1930.account_name).toBe('Företagskonto')

    // Unknown account gets fallback name
    const line9999 = report.entries[0].lines.find((l) => l.account_number === '9999')!
    expect(line9999.account_name).toBe('Konto 9999')
  })

  it('defaults voucher_series to A when null', async () => {
    results = [
      { data: { period_start: '2024-01-01', period_end: '2024-12-31' }, error: null },
      {
        data: [
          { id: 'e1', entry_date: '2024-01-15', voucher_number: 1, voucher_series: null, description: 'No series', source_type: 'manual', status: 'posted' },
        ],
        error: null,
      },
      {
        data: [
          { account_number: '1930', debit_amount: 100, credit_amount: 0, journal_entry_id: 'e1' },
          { account_number: '3001', debit_amount: 0, credit_amount: 100, journal_entry_id: 'e1' },
        ],
        error: null,
      },
      { data: [], error: null },
    ]

    const report = await generateJournalRegister(supabase, 'user-1', 'period-1')
    expect(report.entries[0].voucher_series).toBe('A')
  })
})
