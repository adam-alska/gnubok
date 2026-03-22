/**
 * Tests for receipt matcher tools and MCP Apps protocol additions
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  createQueuedMockSupabase,
  makeTransaction,
  makeDocumentAttachment,
} from '@/tests/helpers'

// ── Mocks ──
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
  createServiceClient: vi.fn().mockResolvedValue({
    storage: {
      getBucket: vi.fn().mockResolvedValue({ data: { name: 'documents' } }),
    },
  }),
}))

vi.mock('@/lib/auth/api-keys', () => ({
  extractBearerToken: vi.fn().mockReturnValue('test-token'),
  validateApiKey: vi.fn().mockResolvedValue({ userId: 'user-1' }),
  createServiceClientNoCookies: vi.fn(),
}))

vi.mock('@/lib/bookkeeping/category-mapping', () => ({
  buildMappingResultFromCategory: vi.fn().mockReturnValue({
    debit_account: '6110',
    credit_account: '1930',
    vat_lines: [{ account_number: '2641', amount: 74.75 }],
  }),
}))

vi.mock('@/lib/bookkeeping/transaction-entries', () => ({
  createTransactionJournalEntry: vi.fn().mockResolvedValue({ id: 'je-123' }),
}))

vi.mock('@/lib/events/bus', () => ({
  eventBus: { emit: vi.fn().mockResolvedValue(undefined), clear: vi.fn() },
}))

const mockUploadDocument = vi.fn()
vi.mock('@/lib/core/documents/document-service', () => ({
  uploadDocument: (...args: unknown[]) => mockUploadDocument(...args),
}))

vi.mock('@/lib/invoices/vat-rules', () => ({
  getVatRules: vi.fn(),
  getAvailableVatRates: vi.fn(),
}))

vi.mock('@/lib/currency/riksbanken', () => ({
  fetchExchangeRate: vi.fn(),
  convertToSEK: vi.fn(),
}))

vi.mock('@/lib/reports/income-statement', () => ({
  generateIncomeStatement: vi.fn(),
}))

vi.mock('@/lib/reports/kpi', () => ({
  calculateGrossMargin: vi.fn(),
  calculateCashPosition: vi.fn(),
  calculateExpenseRatio: vi.fn(),
  calculateAvgPaymentDays: vi.fn(),
}))

vi.mock('@/lib/reports/trial-balance', () => ({
  generateTrialBalance: vi.fn(),
}))

vi.mock('@/lib/reports/ar-ledger', () => ({
  generateARLedger: vi.fn(),
}))

vi.mock('@/lib/reports/monthly-breakdown', () => ({
  generateMonthlyBreakdown: vi.fn(),
}))

import { handleMcpRequest } from '../server'
import { createServiceClientNoCookies } from '@/lib/auth/api-keys'
import { eventBus } from '@/lib/events/bus'

// Helper: make a JSON-RPC request
function mcpRequest(method: string, params?: Record<string, unknown>, id: number | string = 1): Request {
  return new Request('http://localhost:3000/api/extensions/ext/mcp-server/mcp', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer test-token' },
    body: JSON.stringify({ jsonrpc: '2.0', id, method, params }),
  })
}

async function parseResult(response: Response) {
  const json = await response.json()
  return json.result
}

describe('MCP Receipt Matcher', () => {
  let supabase: ReturnType<typeof createQueuedMockSupabase>['supabase']
  let enqueueMany: ReturnType<typeof createQueuedMockSupabase>['enqueueMany']

  beforeEach(() => {
    vi.clearAllMocks()
    ;(eventBus as { clear: ReturnType<typeof vi.fn> }).clear()
    const mock = createQueuedMockSupabase()
    supabase = mock.supabase
    enqueueMany = mock.enqueueMany
    vi.mocked(createServiceClientNoCookies).mockReturnValue(supabase as never)
  })

  // ── Protocol: initialize includes resources capability ──

  describe('initialize', () => {
    it('returns resources capability', async () => {
      const res = await handleMcpRequest(mcpRequest('initialize', { protocolVersion: '2025-03-26' }))
      const result = await parseResult(res)

      expect(result.capabilities.tools).toEqual({ listChanged: false })
      expect(result.capabilities.resources).toEqual({ listChanged: false })
    })
  })

  // ── Protocol: tools/list includes _meta for receipt matcher ──

  describe('tools/list', () => {
    it('includes _meta.ui for gnubok_receipt_matcher', async () => {
      const res = await handleMcpRequest(mcpRequest('tools/list'))
      const result = await parseResult(res)

      const receiptTool = result.tools.find((t: { name: string }) => t.name === 'gnubok_receipt_matcher')
      expect(receiptTool).toBeDefined()
      expect(receiptTool._meta).toEqual({
        ui: { resourceUri: 'ui://receipt-matcher/app.html' },
      })
    })

    it('includes gnubok_categorize_with_receipt', async () => {
      const res = await handleMcpRequest(mcpRequest('tools/list'))
      const result = await parseResult(res)

      const tool = result.tools.find((t: { name: string }) => t.name === 'gnubok_categorize_with_receipt')
      expect(tool).toBeDefined()
      expect(tool.inputSchema.required).toContain('file_data')
      expect(tool.inputSchema.required).toContain('filename')
      expect(tool.inputSchema.required).toContain('mime_type')
    })

    it('does not include _meta for tools without it', async () => {
      const res = await handleMcpRequest(mcpRequest('tools/list'))
      const result = await parseResult(res)

      const categorizeTool = result.tools.find(
        (t: { name: string }) => t.name === 'gnubok_categorize_transaction'
      )
      expect(categorizeTool).toBeDefined()
      expect(categorizeTool._meta).toBeUndefined()
    })
  })

  // ── Protocol: resources/list ──

  describe('resources/list', () => {
    it('returns the receipt-matcher resource', async () => {
      const res = await handleMcpRequest(mcpRequest('resources/list'))
      const result = await parseResult(res)

      expect(result.resources).toHaveLength(1)
      expect(result.resources[0]).toEqual({
        uri: 'ui://receipt-matcher/app.html',
        name: 'Receipt Matcher',
        description: 'Interactive widget for matching receipts to uncategorized transactions',
        mimeType: 'text/html;profile=mcp-app',
      })
    })
  })

  // ── Protocol: resources/read ──

  describe('resources/read', () => {
    it('returns HTML for the receipt matcher', async () => {
      const res = await handleMcpRequest(
        mcpRequest('resources/read', { uri: 'ui://receipt-matcher/app.html' })
      )
      const result = await parseResult(res)

      expect(result.contents).toHaveLength(1)
      expect(result.contents[0].uri).toBe('ui://receipt-matcher/app.html')
      expect(result.contents[0].mimeType).toBe('text/html;profile=mcp-app')
      expect(result.contents[0].text).toContain('<!DOCTYPE html>')
      expect(result.contents[0].text).toContain('Kvittomatchning')
    })

    it('returns error for unknown resource URI', async () => {
      const res = await handleMcpRequest(
        mcpRequest('resources/read', { uri: 'ui://unknown/thing' })
      )
      const json = await res.json()

      expect(json.error).toBeDefined()
      expect(json.error.code).toBe(-32602)
      expect(json.error.message).toContain('Resource not found')
    })
  })

  // ── gnubok_receipt_matcher tool ──

  describe('gnubok_receipt_matcher', () => {
    it('returns uncategorized transactions with categories and vat_treatments', async () => {
      const tx1 = makeTransaction({ id: 'tx-1', description: 'ICA', amount: -150 })
      const tx2 = makeTransaction({ id: 'tx-2', description: 'Consulting', amount: 15000 })
      enqueueMany([
        { data: [tx1, tx2], error: null },
      ])

      const res = await handleMcpRequest(
        mcpRequest('tools/call', { name: 'gnubok_receipt_matcher', arguments: {} })
      )
      const result = await parseResult(res)

      // Should have structuredContent for MCP Apps
      expect(result.structuredContent).toBeDefined()
      expect(result.structuredContent.transactions).toHaveLength(2)
      expect(result.structuredContent.categories).toContain('expense_office')
      expect(result.structuredContent.vat_treatments).toContain('standard_25')

      // Should also have regular content
      expect(result.content).toHaveLength(1)
      expect(result.content[0].type).toBe('text')
    })

    it('returns empty array when no uncategorized transactions', async () => {
      enqueueMany([{ data: [], error: null }])

      const res = await handleMcpRequest(
        mcpRequest('tools/call', { name: 'gnubok_receipt_matcher', arguments: {} })
      )
      const result = await parseResult(res)

      expect(result.structuredContent.transactions).toHaveLength(0)
    })
  })

  // ── gnubok_categorize_with_receipt tool ──

  describe('gnubok_categorize_with_receipt', () => {
    const validDataUri = 'data:image/jpeg;base64,/9j/4AAQSkZJRg=='
    const tx = makeTransaction({
      id: 'tx-1',
      description: 'Kontorsmaterial',
      amount: -299,
      currency: 'SEK',
    })

    it('categorizes and uploads receipt document', async () => {
      const doc = makeDocumentAttachment({ id: 'doc-1', journal_entry_id: 'je-123' })
      mockUploadDocument.mockResolvedValue(doc)

      enqueueMany([
        { data: tx, error: null },           // fetch transaction
        { data: { entity_type: 'enskild_firma', fiscal_year_start_month: 1 }, error: null }, // company_settings
        { data: null, error: null },          // fiscal_periods upsert
        { data: null, error: null },          // transaction update
      ])

      const res = await handleMcpRequest(
        mcpRequest('tools/call', {
          name: 'gnubok_categorize_with_receipt',
          arguments: {
            transaction_id: 'tx-1',
            category: 'expense_office',
            vat_treatment: 'standard_25',
            file_data: validDataUri,
            filename: 'receipt.jpg',
            mime_type: 'image/jpeg',
          },
        })
      )
      const result = await parseResult(res)
      const parsed = JSON.parse(result.content[0].text)

      expect(parsed.success).toBe(true)
      expect(parsed.journal_entry_created).toBe(true)
      expect(parsed.journal_entry_id).toBe('je-123')
      expect(parsed.document_id).toBe('doc-1')
      expect(parsed.debit_account).toBe('6110')
      expect(parsed.credit_account).toBe('1930')

      // Verify uploadDocument was called with correct args
      expect(mockUploadDocument).toHaveBeenCalledWith(
        expect.anything(),
        'user-1',
        expect.objectContaining({
          name: 'receipt.jpg',
          type: 'image/jpeg',
        }),
        expect.objectContaining({
          upload_source: 'api',
          journal_entry_id: 'je-123',
        })
      )
    })

    it('rejects invalid data URI', async () => {
      const res = await handleMcpRequest(
        mcpRequest('tools/call', {
          name: 'gnubok_categorize_with_receipt',
          arguments: {
            transaction_id: 'tx-1',
            category: 'expense_office',
            file_data: 'not-a-data-uri',
            filename: 'receipt.jpg',
            mime_type: 'image/jpeg',
          },
        })
      )
      const result = await parseResult(res)
      const parsed = JSON.parse(result.content[0].text)

      expect(parsed.error).toContain('Invalid file_data')
      expect(result.isError).toBe(true)
    })

    it('returns document_error when upload fails', async () => {
      mockUploadDocument.mockRejectedValue(new Error('Storage full'))

      enqueueMany([
        { data: tx, error: null },           // fetch transaction
        { data: { entity_type: 'enskild_firma', fiscal_year_start_month: 1 }, error: null },
        { data: null, error: null },          // fiscal_periods upsert
        { data: null, error: null },          // transaction update
      ])

      const res = await handleMcpRequest(
        mcpRequest('tools/call', {
          name: 'gnubok_categorize_with_receipt',
          arguments: {
            transaction_id: 'tx-1',
            category: 'expense_office',
            file_data: validDataUri,
            filename: 'receipt.jpg',
            mime_type: 'image/jpeg',
          },
        })
      )
      const result = await parseResult(res)
      const parsed = JSON.parse(result.content[0].text)

      expect(parsed.success).toBe(true)
      expect(parsed.journal_entry_created).toBe(true)
      expect(parsed.document_id).toBeNull()
      expect(parsed.document_error).toBe('Storage full')
    })

    it('skips document upload when transaction already has journal entry', async () => {
      const bookedTx = makeTransaction({
        id: 'tx-2',
        journal_entry_id: 'je-existing',
        amount: -100,
      })

      enqueueMany([
        { data: bookedTx, error: null },      // fetch transaction (already booked)
      ])

      const res = await handleMcpRequest(
        mcpRequest('tools/call', {
          name: 'gnubok_categorize_with_receipt',
          arguments: {
            transaction_id: 'tx-2',
            category: 'expense_office',
            file_data: validDataUri,
            filename: 'receipt.jpg',
            mime_type: 'image/jpeg',
          },
        })
      )
      const result = await parseResult(res)
      const parsed = JSON.parse(result.content[0].text)

      // Should not have uploaded — already booked
      expect(mockUploadDocument).not.toHaveBeenCalled()
      expect(parsed.document_id).toBeNull()
    })
  })

  // ── gnubok_categorize_transaction still works after refactor ──

  describe('gnubok_categorize_transaction (refactored)', () => {
    it('returns result without transaction field', async () => {
      const tx = makeTransaction({ id: 'tx-1', amount: -500 })

      enqueueMany([
        { data: tx, error: null },           // fetch transaction
        { data: { entity_type: 'enskild_firma', fiscal_year_start_month: 1 }, error: null },
        { data: null, error: null },          // fiscal_periods upsert
        { data: null, error: null },          // transaction update
      ])

      const res = await handleMcpRequest(
        mcpRequest('tools/call', {
          name: 'gnubok_categorize_transaction',
          arguments: { transaction_id: 'tx-1', category: 'expense_office' },
        })
      )
      const result = await parseResult(res)
      const parsed = JSON.parse(result.content[0].text)

      expect(parsed.success).toBe(true)
      expect(parsed.journal_entry_created).toBe(true)
      expect(parsed.category).toBe('expense_office')
      expect(parsed.transaction).toBeUndefined()
    })
  })

  // ── tools/call structuredContent ──

  describe('tools/call structuredContent', () => {
    it('includes structuredContent for tools with _meta.ui', async () => {
      enqueueMany([{ data: [], error: null }])

      const res = await handleMcpRequest(
        mcpRequest('tools/call', { name: 'gnubok_receipt_matcher', arguments: {} })
      )
      const result = await parseResult(res)

      expect(result.structuredContent).toBeDefined()
      expect(result.content).toBeDefined()
    })

    it('does not include structuredContent for regular tools', async () => {
      const tx = makeTransaction({ id: 'tx-1', amount: -500 })
      enqueueMany([
        { data: tx, error: null },
        { data: { entity_type: 'enskild_firma', fiscal_year_start_month: 1 }, error: null },
        { data: null, error: null },
        { data: null, error: null },
      ])

      const res = await handleMcpRequest(
        mcpRequest('tools/call', {
          name: 'gnubok_categorize_transaction',
          arguments: { transaction_id: 'tx-1', category: 'expense_office' },
        })
      )
      const result = await parseResult(res)

      expect(result.structuredContent).toBeUndefined()
      expect(result.content).toBeDefined()
    })
  })
})
