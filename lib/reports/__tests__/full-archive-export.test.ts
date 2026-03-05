/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import JSZip from 'jszip'
import { generateFullArchive } from '../full-archive-export'
import { createQueuedMockSupabase } from '@/tests/helpers'

vi.mock('../sie-export', () => ({
  generateSIEExport: vi.fn().mockResolvedValue('#FLAGGA 0\n#PROGRAM "ERPBase"'),
}))

vi.mock('../trial-balance', () => ({
  generateTrialBalance: vi.fn().mockResolvedValue({
    rows: [], totalDebit: 0, totalCredit: 0, isBalanced: true,
  }),
}))

vi.mock('../income-statement', () => ({
  generateIncomeStatement: vi.fn().mockResolvedValue({
    sections: [], netResult: 0, period: { start: '2024-01-01', end: '2024-12-31' },
  }),
}))

vi.mock('../balance-sheet', () => ({
  generateBalanceSheet: vi.fn().mockResolvedValue({
    asset_sections: [], equity_liability_sections: [],
    total_assets: 0, total_equity_liabilities: 0,
    period: { start: '2024-01-01', end: '2024-12-31' },
  }),
}))

vi.mock('../general-ledger', () => ({
  generateGeneralLedger: vi.fn().mockResolvedValue({
    accounts: [], period: { start: '2024-01-01', end: '2024-12-31' },
  }),
}))

vi.mock('../journal-register', () => ({
  generateJournalRegister: vi.fn().mockResolvedValue({
    entries: [], total_entries: 0, total_debit: 0, total_credit: 0,
    period: { start: '2024-01-01', end: '2024-12-31' },
  }),
}))

vi.mock('../vat-declaration', () => ({
  calculateVatDeclaration: vi.fn().mockResolvedValue({
    period: { type: 'yearly', year: 2024, period: 1, start: '2024-01-01', end: '2024-12-31' },
    rutor: {
      ruta05: 0, ruta06: 0, ruta07: 0,
      ruta10: 0, ruta11: 0, ruta12: 0,
      ruta39: 0, ruta40: 0, ruta48: 0, ruta49: 0,
    },
    invoiceCount: 0, transactionCount: 0,
    breakdown: {
      invoices: { ruta05: 0, ruta06: 0, ruta07: 0, ruta10: 0, ruta11: 0, ruta12: 0, ruta39: 0, ruta40: 0, base25: 0, base12: 0, base6: 0 },
      transactions: { ruta48: 0 },
      receipts: { ruta48: 0 },
    },
  }),
}))

vi.mock('@/lib/core/audit/audit-service', () => ({
  getAuditLog: vi.fn().mockResolvedValue({ data: [], count: 0 }),
}))

describe('generateFullArchive', () => {
  let supabase: ReturnType<typeof createQueuedMockSupabase>['supabase']
  let enqueueMany: ReturnType<typeof createQueuedMockSupabase>['enqueueMany']

  beforeEach(() => {
    vi.clearAllMocks()
    const mock = createQueuedMockSupabase()
    supabase = mock.supabase
    enqueueMany = mock.enqueueMany
  })

  function enqueueStandardResponses(opts?: { includeDocuments?: boolean }) {
    // 1. fiscal_periods query
    enqueueMany([
      {
        data: {
          id: 'period-1',
          period_start: '2024-01-01',
          period_end: '2024-12-31',
          user_id: 'user-1',
        },
      },
      // 2. company_settings query
      {
        data: {
          company_name: 'Test AB',
          org_number: '5566778899',
          moms_period: 'quarterly',
        },
      },
    ])

    if (opts?.includeDocuments !== false) {
      enqueueMany([
        // 3. document_attachments query
        { data: [] },
      ])
    }
  }

  it('generates a ZIP with expected file structure', async () => {
    enqueueStandardResponses()

    const buffer = await generateFullArchive(supabase as any, 'user-1', {
      period_id: 'period-1',
    })

    const zip = await JSZip.loadAsync(buffer)

    expect(zip.file('bokforing.se')).not.toBeNull()
    expect(zip.file('rapporter/saldobalans.json')).not.toBeNull()
    expect(zip.file('rapporter/resultatrakning.json')).not.toBeNull()
    expect(zip.file('rapporter/balansrakning.json')).not.toBeNull()
    expect(zip.file('rapporter/huvudbok.json')).not.toBeNull()
    expect(zip.file('rapporter/grundbok.json')).not.toBeNull()
    expect(zip.file('rapporter/momsdeklaration.json')).not.toBeNull()
    expect(zip.file('dokument/manifest.json')).not.toBeNull()
    expect(zip.file('revision/behandlingshistorik.json')).not.toBeNull()
  })

  it('handles missing documents gracefully', async () => {
    const mock = createQueuedMockSupabase()
    supabase = mock.supabase
    enqueueMany = mock.enqueueMany

    enqueueMany([
      // fiscal_periods
      {
        data: {
          id: 'period-1',
          period_start: '2024-01-01',
          period_end: '2024-12-31',
          user_id: 'user-1',
        },
      },
      // company_settings
      {
        data: {
          company_name: 'Test AB',
          org_number: '5566778899',
          moms_period: 'quarterly',
        },
      },
      // document_attachments — one document
      {
        data: [
          {
            id: 'doc-1',
            file_name: 'receipt.pdf',
            storage_path: 'documents/user-1/receipt.pdf',
            journal_entry_id: 'entry-1',
          },
        ],
      },
      // journal_entries in period
      {
        data: [{ id: 'entry-1' }],
      },
    ])

    // Mock storage download to fail
    supabase.storage.from = vi.fn().mockReturnValue({
      download: vi.fn().mockResolvedValue({
        data: null,
        error: { message: 'File not found' },
      }),
    })

    const buffer = await generateFullArchive(supabase as any, 'user-1', {
      period_id: 'period-1',
    })

    const zip = await JSZip.loadAsync(buffer)
    const manifestFile = zip.file('dokument/manifest.json')
    expect(manifestFile).not.toBeNull()

    const manifest = JSON.parse(await manifestFile!.async('text'))
    expect(manifest).toHaveLength(1)
    expect(manifest[0].status).toBe('error')
    expect(manifest[0].error).toBe('File not found')
  })

  it('skips documents when include_documents is false', async () => {
    const mock = createQueuedMockSupabase()
    supabase = mock.supabase
    enqueueMany = mock.enqueueMany

    enqueueMany([
      // fiscal_periods
      {
        data: {
          id: 'period-1',
          period_start: '2024-01-01',
          period_end: '2024-12-31',
          user_id: 'user-1',
        },
      },
      // company_settings
      {
        data: {
          company_name: 'Test AB',
          org_number: '5566778899',
          moms_period: 'quarterly',
        },
      },
    ])

    const buffer = await generateFullArchive(supabase as any, 'user-1', {
      period_id: 'period-1',
      include_documents: false,
    })

    const zip = await JSZip.loadAsync(buffer)

    // Should not have dokument folder
    expect(zip.file('dokument/manifest.json')).toBeNull()
    // Should still have other files
    expect(zip.file('bokforing.se')).not.toBeNull()
    expect(zip.file('revision/behandlingshistorik.json')).not.toBeNull()
  })

  it('throws when fiscal period not found', async () => {
    const mock = createQueuedMockSupabase()
    supabase = mock.supabase
    enqueueMany = mock.enqueueMany

    enqueueMany([{ data: null }])

    await expect(
      generateFullArchive(supabase as any, 'user-1', { period_id: 'nonexistent' })
    ).rejects.toThrow('Fiscal period not found')
  })
})
