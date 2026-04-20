/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import JSZip from 'jszip'
import { generateFullArchive, estimateArchiveSize } from '../full-archive-export'
import { createQueuedMockSupabase } from '@/tests/helpers'
import { getAuditLog } from '@/lib/core/audit/audit-service'

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

const mockGetAuditLog = vi.mocked(getAuditLog)

const COMPANY_ROW = {
  company_name: 'Test AB',
  trade_name: null,
  org_number: '5566778899',
  moms_period: 'quarterly',
}

const PERIOD_2024 = {
  id: 'period-2024',
  period_start: '2024-01-01',
  period_end: '2024-12-31',
  opening_balance_entry_id: null,
}

const PERIOD_2023 = {
  id: 'period-2023',
  period_start: '2023-01-01',
  period_end: '2023-12-31',
  opening_balance_entry_id: null,
}

describe('generateFullArchive', () => {
  let supabase: ReturnType<typeof createQueuedMockSupabase>['supabase']
  let enqueueMany: ReturnType<typeof createQueuedMockSupabase>['enqueueMany']

  beforeEach(() => {
    vi.clearAllMocks()
    mockGetAuditLog.mockResolvedValue({ data: [], count: 0 })
    const mock = createQueuedMockSupabase()
    supabase = mock.supabase
    enqueueMany = mock.enqueueMany
  })

  describe('scope: period', () => {
    it('generates a ZIP with expected file structure', async () => {
      enqueueMany([
        { data: COMPANY_ROW }, // company_settings
        { data: PERIOD_2024 }, // fiscal_periods (single)
        { data: [] }, // document_attachments
      ])

      const buffer = await generateFullArchive(supabase as any, 'company-1', {
        scope: 'period',
        period_id: PERIOD_2024.id,
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
      expect(zip.file('revision/systemdokumentation.json')).not.toBeNull()
    })

    it('handles missing documents gracefully', async () => {
      enqueueMany([
        { data: COMPANY_ROW },
        { data: PERIOD_2024 },
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
        { data: [{ id: 'entry-1', fiscal_period_id: PERIOD_2024.id }] },
      ])

      supabase.storage.from = vi.fn().mockReturnValue({
        download: vi.fn().mockResolvedValue({
          data: null,
          error: { message: 'File not found' },
        }),
      })

      const buffer = await generateFullArchive(supabase as any, 'company-1', {
        scope: 'period',
        period_id: PERIOD_2024.id,
      })

      const zip = await JSZip.loadAsync(buffer)
      const manifestFile = zip.file('dokument/manifest.json')
      expect(manifestFile).not.toBeNull()

      const manifest = JSON.parse(await manifestFile!.async('text'))
      expect(manifest).toHaveLength(1)
      expect(manifest[0].status).toBe('error')
      expect(manifest[0].error).toBe('File not found')
      expect(manifest[0].fiscal_period_id).toBe(PERIOD_2024.id)
    })

    it('skips documents when include_documents is false', async () => {
      enqueueMany([
        { data: COMPANY_ROW },
        { data: PERIOD_2024 },
      ])

      const buffer = await generateFullArchive(supabase as any, 'company-1', {
        scope: 'period',
        period_id: PERIOD_2024.id,
        include_documents: false,
      })

      const zip = await JSZip.loadAsync(buffer)

      expect(zip.file('dokument/manifest.json')).toBeNull()
      expect(zip.file('bokforing.se')).not.toBeNull()
      expect(zip.file('revision/behandlingshistorik.json')).not.toBeNull()
    })

    it('throws when fiscal period not found', async () => {
      enqueueMany([
        { data: COMPANY_ROW },
        { data: null },
      ])

      await expect(
        generateFullArchive(supabase as any, 'company-1', {
          scope: 'period',
          period_id: 'nonexistent',
        })
      ).rejects.toThrow('Fiscal period not found')
    })

    it('filters audit trail by period dates', async () => {
      enqueueMany([
        { data: COMPANY_ROW },
        { data: PERIOD_2024 },
        { data: [] },
      ])

      await generateFullArchive(supabase as any, 'company-1', {
        scope: 'period',
        period_id: PERIOD_2024.id,
      })

      expect(mockGetAuditLog).toHaveBeenCalledWith(
        expect.anything(),
        'company-1',
        expect.objectContaining({
          from_date: PERIOD_2024.period_start,
          to_date: `${PERIOD_2024.period_end}T23:59:59.999Z`,
        })
      )
    })
  })

  describe('scope: all', () => {
    it('generates per-period SIE files and report subfolders', async () => {
      enqueueMany([
        { data: COMPANY_ROW },
        { data: [PERIOD_2023, PERIOD_2024] }, // fiscal_periods (list for fetchAllPeriods)
        { data: [] }, // document_attachments
      ])

      const buffer = await generateFullArchive(supabase as any, 'company-1', {
        scope: 'all',
      })

      const zip = await JSZip.loadAsync(buffer)

      expect(zip.file('sie/2023-01-01_2023-12-31.se')).not.toBeNull()
      expect(zip.file('sie/2024-01-01_2024-12-31.se')).not.toBeNull()
      expect(zip.file('rapporter/2023-01-01_2023-12-31/saldobalans.json')).not.toBeNull()
      expect(zip.file('rapporter/2024-01-01_2024-12-31/saldobalans.json')).not.toBeNull()
      expect(zip.file('revision/behandlingshistorik.json')).not.toBeNull()
      expect(zip.file('revision/systemdokumentation.json')).not.toBeNull()
      // No root bokforing.se in all-mode
      expect(zip.file('bokforing.se')).toBeNull()
    })

    it('does not filter audit trail by date in all-mode', async () => {
      enqueueMany([
        { data: COMPANY_ROW },
        { data: [PERIOD_2024] },
        { data: [] },
      ])

      await generateFullArchive(supabase as any, 'company-1', { scope: 'all' })

      const call = mockGetAuditLog.mock.calls[0]
      expect(call[2]).not.toHaveProperty('from_date')
      expect(call[2]).not.toHaveProperty('to_date')
    })

    it('tags each document with its fiscal_period_id across periods', async () => {
      enqueueMany([
        { data: COMPANY_ROW },
        { data: [PERIOD_2023, PERIOD_2024] },
        {
          data: [
            { id: 'doc-2023', file_name: 'r23.pdf', storage_path: 'p/r23.pdf', journal_entry_id: 'e-2023' },
            { id: 'doc-2024', file_name: 'r24.pdf', storage_path: 'p/r24.pdf', journal_entry_id: 'e-2024' },
          ],
        },
        {
          data: [
            { id: 'e-2023', fiscal_period_id: PERIOD_2023.id },
            { id: 'e-2024', fiscal_period_id: PERIOD_2024.id },
          ],
        },
      ])

      const buffer = await generateFullArchive(supabase as any, 'company-1', {
        scope: 'all',
      })

      const zip = await JSZip.loadAsync(buffer)
      const manifestFile = zip.file('dokument/manifest.json')
      expect(manifestFile).not.toBeNull()

      const manifest = JSON.parse(await manifestFile!.async('text'))
      expect(manifest).toHaveLength(2)
      const byId = Object.fromEntries(
        (manifest as Array<{ document_id: string; fiscal_period_id: string | null }>).map((m) => [
          m.document_id,
          m.fiscal_period_id,
        ])
      )
      expect(byId['doc-2023']).toBe(PERIOD_2023.id)
      expect(byId['doc-2024']).toBe(PERIOD_2024.id)
    })

    it('throws when no fiscal periods exist', async () => {
      enqueueMany([
        { data: COMPANY_ROW },
        { data: [] },
      ])

      await expect(
        generateFullArchive(supabase as any, 'company-1', { scope: 'all' })
      ).rejects.toThrow('No fiscal periods found')
    })
  })
})

describe('estimateArchiveSize', () => {
  let supabase: ReturnType<typeof createQueuedMockSupabase>['supabase']
  let enqueueMany: ReturnType<typeof createQueuedMockSupabase>['enqueueMany']

  beforeEach(() => {
    vi.clearAllMocks()
    const mock = createQueuedMockSupabase()
    supabase = mock.supabase
    enqueueMany = mock.enqueueMany
  })

  it('sums document file_size_bytes in all-mode plus overhead', async () => {
    enqueueMany([
      {
        data: [
          { file_size_bytes: 1_000_000, journal_entry_id: 'e1' },
          { file_size_bytes: 2_500_000, journal_entry_id: 'e2' },
        ],
        count: 2,
      },
    ])

    const result = await estimateArchiveSize(supabase as any, 'company-1', 'all')

    expect(result.document_bytes).toBe(3_500_000)
    expect(result.document_count).toBe(2)
    // overhead is +5 MB
    expect(result.total_bytes).toBe(3_500_000 + 5 * 1024 * 1024)
  })

  it('returns overhead only when no documents in scope', async () => {
    enqueueMany([
      { data: [], count: 0 }, // journal_entries for periodEntryIds
      { data: [], count: 0 }, // document_attachments
    ])

    const result = await estimateArchiveSize(supabase as any, 'company-1', 'period', 'p-1')

    expect(result.document_bytes).toBe(0)
    expect(result.document_count).toBe(0)
    expect(result.total_bytes).toBe(5 * 1024 * 1024)
  })
})
