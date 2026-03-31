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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any
}

import { generateARLedger } from '../ar-ledger'

let supabase: ReturnType<typeof makeClient>

beforeEach(() => {
  vi.clearAllMocks()
  resultIdx = 0
  results = []
  supabase = makeClient()
})

describe('generateARLedger', () => {
  it('returns empty report when no invoices found', async () => {
    results = [
      { data: [], error: null },
    ]

    const report = await generateARLedger(supabase, 'company-1')
    expect(report.entries).toEqual([])
    expect(report.total_outstanding).toBe(0)
    expect(report.unpaid_count).toBe(0)
  })

  it('returns empty report on query error', async () => {
    results = [
      { data: null, error: { message: 'DB error' } },
    ]

    const report = await generateARLedger(supabase, 'company-1')
    expect(report.entries).toEqual([])
    expect(report.total_outstanding).toBe(0)
  })

  it('groups invoices by customer with correct aging buckets', async () => {
    // Reference date: 2024-06-15
    const asOfDate = '2024-06-15'

    results = [
      {
        data: [
          // Customer A: one current, one 1-30 days overdue
          {
            id: 'inv-1',
            customer_id: 'cust-a',
            customer: { id: 'cust-a', name: 'Acme AB' },
            invoice_number: 'F001',
            invoice_date: '2024-05-01',
            due_date: '2024-06-20', // not yet due
            total: 5000,
            paid_amount: 0,
            currency: 'SEK',
            status: 'sent',
          },
          {
            id: 'inv-2',
            customer_id: 'cust-a',
            customer: { id: 'cust-a', name: 'Acme AB' },
            invoice_number: 'F002',
            invoice_date: '2024-04-01',
            due_date: '2024-06-01', // 14 days overdue
            total: 3000,
            paid_amount: 1000,
            currency: 'SEK',
            status: 'overdue',
          },
          // Customer B: 90+ days overdue
          {
            id: 'inv-3',
            customer_id: 'cust-b',
            customer: { id: 'cust-b', name: 'Beta Corp' },
            invoice_number: 'F003',
            invoice_date: '2024-01-01',
            due_date: '2024-02-01', // 135 days overdue
            total: 10000,
            paid_amount: 0,
            currency: 'SEK',
            status: 'overdue',
          },
        ],
        error: null,
      },
    ]

    const report = await generateARLedger(supabase, 'company-1', asOfDate)

    expect(report.unpaid_count).toBe(3)
    expect(report.entries).toHaveLength(2)

    // Sorted by total outstanding descending: Beta Corp (10000), then Acme (7000)
    expect(report.entries[0].customer_name).toBe('Beta Corp')
    expect(report.entries[0].total_outstanding).toBe(10000)
    expect(report.entries[0].days_90_plus).toBe(10000)

    expect(report.entries[1].customer_name).toBe('Acme AB')
    expect(report.entries[1].total_outstanding).toBe(7000)
    expect(report.entries[1].current).toBe(5000)     // inv-1
    expect(report.entries[1].days_1_30).toBe(2000)    // inv-2 (3000 - 1000 paid)
    expect(report.entries[1].invoices).toHaveLength(2)

    // Totals
    expect(report.total_outstanding).toBe(17000)
    expect(report.total_current).toBe(5000)
    expect(report.total_overdue).toBe(12000)
  })

  it('computes outstanding as total minus paid_amount', async () => {
    results = [
      {
        data: [
          {
            id: 'inv-1',
            customer_id: 'cust-a',
            customer: { id: 'cust-a', name: 'Test AB' },
            invoice_number: 'F001',
            invoice_date: '2024-06-01',
            due_date: '2024-07-01',
            total: 10000,
            paid_amount: 7500,
            currency: 'SEK',
            status: 'sent',
          },
        ],
        error: null,
      },
    ]

    const report = await generateARLedger(supabase, 'company-1', '2024-06-15')

    expect(report.entries[0].invoices[0].outstanding).toBe(2500)
    expect(report.total_outstanding).toBe(2500)
  })

  it('sorts invoices within customer by due_date', async () => {
    results = [
      {
        data: [
          {
            id: 'inv-2',
            customer_id: 'cust-a',
            customer: { id: 'cust-a', name: 'Test AB' },
            invoice_number: 'F002',
            invoice_date: '2024-05-01',
            due_date: '2024-07-01',
            total: 1000,
            paid_amount: 0,
            currency: 'SEK',
            status: 'sent',
          },
          {
            id: 'inv-1',
            customer_id: 'cust-a',
            customer: { id: 'cust-a', name: 'Test AB' },
            invoice_number: 'F001',
            invoice_date: '2024-04-01',
            due_date: '2024-06-01',
            total: 2000,
            paid_amount: 0,
            currency: 'SEK',
            status: 'sent',
          },
        ],
        error: null,
      },
    ]

    const report = await generateARLedger(supabase, 'company-1', '2024-05-15')

    // Sorted by due_date: F001 (June 1) before F002 (July 1)
    expect(report.entries[0].invoices[0].invoice_number).toBe('F001')
    expect(report.entries[0].invoices[1].invoice_number).toBe('F002')
  })

  it('uses Math.round for monetary precision', async () => {
    results = [
      {
        data: [
          {
            id: 'inv-1',
            customer_id: 'cust-a',
            customer: { id: 'cust-a', name: 'Test' },
            invoice_number: 'F001',
            invoice_date: '2024-06-01',
            due_date: '2024-07-01',
            total: 100.1,
            paid_amount: 33.33,
            currency: 'SEK',
            status: 'sent',
          },
        ],
        error: null,
      },
    ]

    const report = await generateARLedger(supabase, 'company-1', '2024-06-15')
    expect(report.entries[0].invoices[0].outstanding).toBe(66.77)
    expect(report.total_outstanding).toBe(66.77)
  })

  it('handles missing customer name gracefully', async () => {
    results = [
      {
        data: [
          {
            id: 'inv-1',
            customer_id: 'cust-a',
            customer: null,
            invoice_number: 'F001',
            invoice_date: '2024-06-01',
            due_date: '2024-07-01',
            total: 1000,
            paid_amount: 0,
            currency: 'SEK',
            status: 'sent',
          },
        ],
        error: null,
      },
    ]

    const report = await generateARLedger(supabase, 'company-1', '2024-06-15')
    expect(report.entries[0].customer_name).toBe('Okänd kund')
  })
})
