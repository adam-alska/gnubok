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

import { generateSupplierLedger } from '../supplier-ledger'

let supabase: ReturnType<typeof makeClient>

beforeEach(() => {
  vi.clearAllMocks()
  resultIdx = 0
  results = []
  supabase = makeClient()
})

describe('generateSupplierLedger', () => {
  it('returns empty report when no invoices found', async () => {
    results = [
      { data: [], error: null },
    ]

    const report = await generateSupplierLedger(supabase, 'user-1')
    expect(report.entries).toEqual([])
    expect(report.total_outstanding).toBe(0)
    expect(report.total_current).toBe(0)
    expect(report.total_overdue).toBe(0)
    expect(report.unpaid_count).toBe(0)
  })

  it('returns empty report on query error', async () => {
    results = [
      { data: null, error: { message: 'DB error' } },
    ]

    const report = await generateSupplierLedger(supabase, 'user-1')
    expect(report.entries).toEqual([])
    expect(report.total_outstanding).toBe(0)
  })

  it('places invoices in correct aging buckets', async () => {
    // Reference date: 2024-06-15
    const asOfDate = '2024-06-15'

    results = [
      {
        data: [
          // Current: due in the future (days overdue <= 0)
          {
            supplier_id: 'sup-1',
            supplier: { id: 'sup-1', name: 'Leverantör A' },
            due_date: '2024-06-20',
            remaining_amount: 5000,
          },
          // 1-30 days overdue: due_date 2024-06-01 (14 days overdue)
          {
            supplier_id: 'sup-1',
            supplier: { id: 'sup-1', name: 'Leverantör A' },
            due_date: '2024-06-01',
            remaining_amount: 3000,
          },
          // 31-60 days overdue: due_date 2024-05-01 (45 days overdue)
          {
            supplier_id: 'sup-1',
            supplier: { id: 'sup-1', name: 'Leverantör A' },
            due_date: '2024-05-01',
            remaining_amount: 2000,
          },
          // 61-90 days overdue: due_date 2024-04-01 (75 days overdue)
          {
            supplier_id: 'sup-1',
            supplier: { id: 'sup-1', name: 'Leverantör A' },
            due_date: '2024-04-01',
            remaining_amount: 1500,
          },
          // 90+ days overdue: due_date 2024-02-01 (135 days overdue)
          {
            supplier_id: 'sup-1',
            supplier: { id: 'sup-1', name: 'Leverantör A' },
            due_date: '2024-02-01',
            remaining_amount: 1000,
          },
        ],
        error: null,
      },
    ]

    const report = await generateSupplierLedger(supabase, 'user-1', asOfDate)

    expect(report.entries).toHaveLength(1)
    const entry = report.entries[0]
    expect(entry.current).toBe(5000)
    expect(entry.days_1_30).toBe(3000)
    expect(entry.days_31_60).toBe(2000)
    expect(entry.days_61_90).toBe(1500)
    expect(entry.days_90_plus).toBe(1000)
    expect(entry.total_outstanding).toBe(12500)
  })

  it('groups by supplier and uses fallback name for missing supplier', async () => {
    results = [
      {
        data: [
          {
            supplier_id: 'sup-1',
            supplier: { id: 'sup-1', name: 'Leverantör A' },
            due_date: '2024-07-01',
            remaining_amount: 5000,
          },
          {
            supplier_id: 'sup-2',
            supplier: null,
            due_date: '2024-07-01',
            remaining_amount: 3000,
          },
        ],
        error: null,
      },
    ]

    const report = await generateSupplierLedger(supabase, 'user-1', '2024-06-15')

    expect(report.entries).toHaveLength(2)
    const names = report.entries.map(e => e.supplier_name)
    expect(names).toContain('Leverantör A')
    expect(names).toContain('Okänd leverantör')
  })

  it('sorts entries by outstanding descending', async () => {
    results = [
      {
        data: [
          {
            supplier_id: 'sup-1',
            supplier: { id: 'sup-1', name: 'Small' },
            due_date: '2024-07-01',
            remaining_amount: 1000,
          },
          {
            supplier_id: 'sup-2',
            supplier: { id: 'sup-2', name: 'Large' },
            due_date: '2024-07-01',
            remaining_amount: 10000,
          },
          {
            supplier_id: 'sup-3',
            supplier: { id: 'sup-3', name: 'Medium' },
            due_date: '2024-07-01',
            remaining_amount: 5000,
          },
        ],
        error: null,
      },
    ]

    const report = await generateSupplierLedger(supabase, 'user-1', '2024-06-15')

    expect(report.entries[0].supplier_name).toBe('Large')
    expect(report.entries[1].supplier_name).toBe('Medium')
    expect(report.entries[2].supplier_name).toBe('Small')
  })

  it('calculates grand totals correctly', async () => {
    results = [
      {
        data: [
          // Supplier A: current 5000
          {
            supplier_id: 'sup-1',
            supplier: { id: 'sup-1', name: 'A' },
            due_date: '2024-07-01',
            remaining_amount: 5000,
          },
          // Supplier B: 1-30 days overdue 3000
          {
            supplier_id: 'sup-2',
            supplier: { id: 'sup-2', name: 'B' },
            due_date: '2024-06-01',
            remaining_amount: 3000,
          },
        ],
        error: null,
      },
    ]

    const report = await generateSupplierLedger(supabase, 'user-1', '2024-06-15')

    expect(report.total_outstanding).toBe(8000)
    expect(report.total_current).toBe(5000)
    expect(report.total_overdue).toBe(3000) // outstanding - current
    expect(report.unpaid_count).toBe(2)
  })

  it('uses Math.round for monetary precision', async () => {
    results = [
      {
        data: [
          {
            supplier_id: 'sup-1',
            supplier: { id: 'sup-1', name: 'Test' },
            due_date: '2024-07-01',
            remaining_amount: 33.33,
          },
          {
            supplier_id: 'sup-1',
            supplier: { id: 'sup-1', name: 'Test' },
            due_date: '2024-07-02',
            remaining_amount: 33.33,
          },
          {
            supplier_id: 'sup-1',
            supplier: { id: 'sup-1', name: 'Test' },
            due_date: '2024-07-03',
            remaining_amount: 33.34,
          },
        ],
        error: null,
      },
    ]

    const report = await generateSupplierLedger(supabase, 'user-1', '2024-06-15')

    expect(report.total_outstanding).toBe(100)
    expect(report.total_current).toBe(100)
  })
})
