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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any
}

import { generateSIEExport } from '../sie-export'

let supabase: ReturnType<typeof makeClient>

beforeEach(() => {
  vi.clearAllMocks()
  resultIdx = 0
  results = []
  supabase = makeClient()
})

const baseOptions = {
  fiscal_period_id: 'period-1',
  company_name: 'Test AB',
  org_number: '556677-8899',
  program_name: 'ERPBase',
}

describe('generateSIEExport', () => {
  it('throws when fiscal period not found', async () => {
    results = [
      // 0: fiscal_periods.single() → null
      { data: null, error: null },
    ]

    await expect(generateSIEExport(supabase, 'user-1', baseOptions))
      .rejects.toThrow('Fiscal period not found')
  })

  it('generates correct header format', async () => {
    results = [
      // 0: fiscal_periods
      { data: { id: 'period-1', period_start: '2024-01-01', period_end: '2024-12-31' }, error: null },
      // 1: chart_of_accounts (empty)
      { data: [], error: null },
      // 2: journal_entries (empty)
      { data: [], error: null },
      // 3: cost_centers (empty)
      { data: [], error: null },
      // 4: projects (empty)
      { data: [], error: null },
    ]

    const output = await generateSIEExport(supabase, 'user-1', baseOptions)
    const lines = output.split('\r\n')

    expect(lines[0]).toBe('#FLAGGA 0')
    expect(lines[1]).toBe('#FORMAT PC8')
    expect(lines[2]).toBe('#SIETYP 4')
    expect(lines[3]).toMatch(/^#PROGRAM "ERPBase" "1\.0"$/)
    expect(lines[4]).toMatch(/^#GEN \d{8}$/)
    expect(lines[5]).toBe('#ORGNR 556677-8899')
    expect(lines[6]).toBe('#FNAMN "Test AB"')
    expect(lines[7]).toBe('#RAR 0 20240101 20241231')
  })

  it('omits #ORGNR when org_number is null', async () => {
    results = [
      { data: { id: 'period-1', period_start: '2024-01-01', period_end: '2024-12-31' }, error: null },
      { data: [], error: null },
      { data: [], error: null },
      { data: [], error: null },
      { data: [], error: null },
    ]

    const output = await generateSIEExport(supabase, 'user-1', {
      ...baseOptions,
      org_number: null,
    })

    expect(output).not.toContain('#ORGNR')
  })

  it('generates #KONTO and #SRU for accounts', async () => {
    results = [
      { data: { id: 'period-1', period_start: '2024-01-01', period_end: '2024-12-31' }, error: null },
      // 1: chart_of_accounts
      {
        data: [
          { account_number: '1930', account_name: 'Företagskonto', sru_code: '7301', is_active: true },
          { account_number: '3001', account_name: 'Försäljning', sru_code: null, is_active: true },
        ],
        error: null,
      },
      // 2: journal_entries (empty)
      { data: [], error: null },
      // 3: cost_centers
      { data: [], error: null },
      // 4: projects
      { data: [], error: null },
    ]

    const output = await generateSIEExport(supabase, 'user-1', baseOptions)

    expect(output).toContain('#KONTO 1930 "Företagskonto"')
    expect(output).toContain('#SRU 1930 7301')
    expect(output).toContain('#KONTO 3001 "Försäljning"')
    // No SRU for 3001 since sru_code is null
    expect(output).not.toContain('#SRU 3001')
  })

  it('generates #VER and #TRANS for journal entries', async () => {
    results = [
      { data: { id: 'period-1', period_start: '2024-01-01', period_end: '2024-12-31' }, error: null },
      // 1: accounts
      { data: [], error: null },
      // 2: journal_entries with lines
      {
        data: [
          {
            id: 'e1',
            entry_date: '2024-03-15',
            voucher_number: 1,
            voucher_series: 'A',
            description: 'Sale invoice',
            status: 'posted',
            lines: [
              { account_number: '1510', debit_amount: 1250, credit_amount: 0, line_description: null, cost_center: null, project: null },
              { account_number: '3001', debit_amount: 0, credit_amount: 1000, line_description: 'Revenue', cost_center: null, project: null },
              { account_number: '2611', debit_amount: 0, credit_amount: 250, line_description: null, cost_center: null, project: null },
            ],
          },
        ],
        error: null,
      },
      // 3: cost_centers
      { data: [], error: null },
      // 4: projects
      { data: [], error: null },
    ]

    const output = await generateSIEExport(supabase, 'user-1', baseOptions)

    expect(output).toContain('#VER "A" 1 20240315 "Sale invoice"')
    expect(output).toContain('{')
    expect(output).toContain('\t#TRANS 1510 {} 1250.00 20240315')
    expect(output).toContain('\t#TRANS 3001 {} -1000.00 20240315 "Revenue"')
    expect(output).toContain('\t#TRANS 2611 {} -250.00 20240315')
    expect(output).toContain('}')
  })

  it('generates #DIM and #OBJEKT for dimensions', async () => {
    results = [
      { data: { id: 'period-1', period_start: '2024-01-01', period_end: '2024-12-31' }, error: null },
      { data: [], error: null },
      { data: [], error: null },
      // 3: cost_centers
      {
        data: [
          { code: 'CC1', name: 'Avdelning 1', is_active: true },
        ],
        error: null,
      },
      // 4: projects
      {
        data: [
          { code: 'P001', name: 'Projekt Alpha', is_active: true },
        ],
        error: null,
      },
    ]

    const output = await generateSIEExport(supabase, 'user-1', baseOptions)

    expect(output).toContain('#DIM 1 "Kostnadsställe"')
    expect(output).toContain('#DIM 6 "Projekt"')
    expect(output).toContain('#OBJEKT 1 "CC1" "Avdelning 1"')
    expect(output).toContain('#OBJEKT 6 "P001" "Projekt Alpha"')
  })

  it('includes dimension objects in #TRANS lines', async () => {
    results = [
      { data: { id: 'period-1', period_start: '2024-01-01', period_end: '2024-12-31' }, error: null },
      { data: [], error: null },
      {
        data: [
          {
            id: 'e1',
            entry_date: '2024-03-15',
            voucher_number: 1,
            voucher_series: 'A',
            description: 'With dimensions',
            status: 'posted',
            lines: [
              { account_number: '5010', debit_amount: 8000, credit_amount: 0, line_description: null, cost_center: 'CC1', project: 'P001' },
              { account_number: '1930', debit_amount: 0, credit_amount: 8000, line_description: null, cost_center: null, project: null },
            ],
          },
        ],
        error: null,
      },
      { data: [{ code: 'CC1', name: 'Avdelning 1', is_active: true }], error: null },
      { data: [{ code: 'P001', name: 'Projekt Alpha', is_active: true }], error: null },
    ]

    const output = await generateSIEExport(supabase, 'user-1', baseOptions)

    expect(output).toContain('\t#TRANS 5010 {1 "CC1" 6 "P001"} 8000.00 20240315')
    expect(output).toContain('\t#TRANS 1930 {} -8000.00 20240315')
  })

  it('generates #UB for class 1-2 and #RES for class 3-8', async () => {
    results = [
      { data: { id: 'period-1', period_start: '2024-01-01', period_end: '2024-12-31' }, error: null },
      { data: [], error: null },
      {
        data: [
          {
            id: 'e1',
            entry_date: '2024-01-15',
            voucher_number: 1,
            voucher_series: 'A',
            description: 'Sale',
            status: 'posted',
            lines: [
              { account_number: '1510', debit_amount: 1250, credit_amount: 0, line_description: null, cost_center: null, project: null },
              { account_number: '3001', debit_amount: 0, credit_amount: 1000, line_description: null, cost_center: null, project: null },
              { account_number: '2611', debit_amount: 0, credit_amount: 250, line_description: null, cost_center: null, project: null },
            ],
          },
        ],
        error: null,
      },
      { data: [], error: null },
      { data: [], error: null },
    ]

    const output = await generateSIEExport(supabase, 'user-1', baseOptions)

    // Account 1510 (class 1) → #UB, balance = 1250 - 0 = 1250
    expect(output).toContain('#UB 0 1510 1250.00')
    // Account 2611 (class 2) → #UB, balance = 0 - 250 = -250
    expect(output).toContain('#UB 0 2611 -250.00')
    // Account 3001 (class 3) → #RES, balance = 0 - 1000 = -1000
    expect(output).toContain('#RES 0 3001 -1000.00')
  })

  it('escapes quotes in descriptions', async () => {
    results = [
      { data: { id: 'period-1', period_start: '2024-01-01', period_end: '2024-12-31' }, error: null },
      { data: [], error: null },
      {
        data: [
          {
            id: 'e1',
            entry_date: '2024-01-15',
            voucher_number: 1,
            voucher_series: 'A',
            description: 'Invoice for "consulting"',
            status: 'posted',
            lines: [
              { account_number: '1930', debit_amount: 100, credit_amount: 0, line_description: null, cost_center: null, project: null },
              { account_number: '3001', debit_amount: 0, credit_amount: 100, line_description: null, cost_center: null, project: null },
            ],
          },
        ],
        error: null,
      },
      { data: [], error: null },
      { data: [], error: null },
    ]

    const output = await generateSIEExport(supabase, 'user-1', baseOptions)

    expect(output).toContain('#VER "A" 1 20240115 "Invoice for \\"consulting\\""')
  })

  it('uses \\r\\n line endings', async () => {
    results = [
      { data: { id: 'period-1', period_start: '2024-01-01', period_end: '2024-12-31' }, error: null },
      { data: [], error: null },
      { data: [], error: null },
      { data: [], error: null },
      { data: [], error: null },
    ]

    const output = await generateSIEExport(supabase, 'user-1', baseOptions)

    // Every line should end with \r\n
    expect(output).toContain('\r\n')
    // Should not have bare \n (that isn't preceded by \r)
    const lines = output.split('\r\n')
    for (const line of lines.slice(0, -1)) {
      expect(line).not.toContain('\n')
    }
    // File should end with \r\n
    expect(output.endsWith('\r\n')).toBe(true)
  })

  it('produces no #VER lines when no entries exist', async () => {
    results = [
      { data: { id: 'period-1', period_start: '2024-01-01', period_end: '2024-12-31' }, error: null },
      { data: [], error: null },
      { data: [], error: null },
      { data: [], error: null },
      { data: [], error: null },
    ]

    const output = await generateSIEExport(supabase, 'user-1', baseOptions)

    expect(output).not.toContain('#VER')
    expect(output).not.toContain('#TRANS')
  })

  it('produces no #DIM lines when no dimensions exist', async () => {
    results = [
      { data: { id: 'period-1', period_start: '2024-01-01', period_end: '2024-12-31' }, error: null },
      { data: [], error: null },
      { data: [], error: null },
      { data: [], error: null },
      { data: [], error: null },
    ]

    const output = await generateSIEExport(supabase, 'user-1', baseOptions)

    expect(output).not.toContain('#DIM')
    expect(output).not.toContain('#OBJEKT')
  })
})
