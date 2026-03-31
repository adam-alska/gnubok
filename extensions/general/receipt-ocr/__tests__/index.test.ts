import { describe, it, expect, vi, beforeEach } from 'vitest'
import { eventBus } from '@/lib/events/bus'

// ============================================================
// Mocks — must be defined before importing the module under test
// ============================================================

let resultIdx: number
let results: Array<{ data?: unknown; error?: unknown }>

function makeBuilder() {
  const b: Record<string, unknown> = {}
  for (const m of ['select', 'eq', 'in', 'is', 'insert', 'upsert', 'update', 'not', 'gte', 'lte', 'or', 'order', 'limit']) {
    b[m] = vi.fn().mockReturnValue(b)
  }
  b.single = vi.fn().mockImplementation(async () => results[resultIdx++] ?? { data: null, error: null })
  b.maybeSingle = vi.fn().mockImplementation(async () => results[resultIdx++] ?? { data: null, error: null })
  b.then = (resolve: (v: unknown) => void) => resolve(results[resultIdx++] ?? { data: null, error: null })
  return b
}

function makeClient(storageOverrides: Record<string, unknown> = {}) {
  return {
    from: vi.fn().mockImplementation(() => makeBuilder()),
    rpc: vi.fn().mockImplementation(async () => results[resultIdx++] ?? { data: null, error: null }),
    storage: {
      from: vi.fn().mockReturnValue({
        download: vi.fn().mockResolvedValue({
          data: new Blob(['fake-image']),
          error: null,
        }),
        getPublicUrl: vi.fn().mockReturnValue({
          data: { publicUrl: 'https://example.com/receipt.jpg' },
        }),
        ...storageOverrides,
      }),
    },
  }
}

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => makeClient()),
}))

vi.mock('../lib/receipt-analyzer', () => ({
  analyzeReceipt: vi.fn().mockResolvedValue({
    merchant: { name: 'ICA', orgNumber: null, vatNumber: null, isForeign: false },
    receipt: { date: '2024-06-15', time: '14:30', currency: 'SEK' },
    lineItems: [
      { description: 'Mjölk', quantity: 1, unitPrice: 19, lineTotal: 19, vatRate: 12, suggestedCategory: null, confidence: 0.9 },
    ],
    totals: { subtotal: 19, vatAmount: 2.04, total: 19 },
    flags: { isRestaurant: false, isSystembolaget: false, isForeignMerchant: false },
    confidence: 0.92,
  }),
}))

vi.mock('../lib/receipt-matcher', () => ({
  autoMatchReceipts: vi.fn().mockReturnValue([]),
}))

import { createClient } from '@/lib/supabase/server'
import { analyzeReceipt } from '../lib/receipt-analyzer'
import { autoMatchReceipts } from '../lib/receipt-matcher'
import { getSettings, saveSettings, receiptOcrExtension } from '../index'
import { extensionRegistry } from '@/lib/extensions/registry'

beforeEach(() => {
  vi.clearAllMocks()
  eventBus.clear()
  extensionRegistry.clear()
  resultIdx = 0
  results = []
  // Reset the mock to use default makeClient
  vi.mocked(createClient).mockImplementation(async () => makeClient() as never)
})

// ============================================================
// Settings tests
// ============================================================

describe('getSettings', () => {
  it('returns defaults when no DB record', async () => {
    results = [{ data: null, error: { code: 'PGRST116' } }]

    const settings = await getSettings('user-1')
    expect(settings.autoOcrEnabled).toBe(true)
    expect(settings.autoMatchEnabled).toBe(true)
    expect(settings.autoMatchThreshold).toBe(0.8)
    expect(settings.ocrConfidenceThreshold).toBe(0.6)
  })

  it('merges DB value with defaults', async () => {
    results = [{ data: { value: { autoOcrEnabled: false } }, error: null }]

    const settings = await getSettings('user-1')
    expect(settings.autoOcrEnabled).toBe(false)
    expect(settings.autoMatchEnabled).toBe(true)
  })
})

describe('saveSettings', () => {
  it('merges partial into current settings', async () => {
    results = [
      // getSettings read
      { data: { value: { autoOcrEnabled: true, autoMatchEnabled: true, autoMatchThreshold: 0.8, ocrConfidenceThreshold: 0.6 } }, error: null },
      // upsert (thenable)
      { data: null, error: null },
    ]

    const result = await saveSettings('user-1', { autoMatchThreshold: 0.9 })
    expect(result.autoMatchThreshold).toBe(0.9)
    expect(result.autoOcrEnabled).toBe(true)
  })
})

// ============================================================
// Extension object tests
// ============================================================

describe('receiptOcrExtension', () => {
  it('has correct id, name, version', () => {
    expect(receiptOcrExtension.id).toBe('receipt-ocr')
    expect(receiptOcrExtension.name).toBe('Receipt OCR')
    expect(receiptOcrExtension.version).toBe('1.0.0')
  })

  it('has event handlers for document.uploaded and transaction.synced', () => {
    expect(receiptOcrExtension.eventHandlers).toBeDefined()
    const types = receiptOcrExtension.eventHandlers!.map((h) => h.eventType)
    expect(types).toContain('document.uploaded')
    expect(types).toContain('transaction.synced')
  })
})

// ============================================================
// handleDocumentUploaded gate tests
// ============================================================

describe('handleDocumentUploaded gates', () => {
  it('skips non-image mime types', async () => {
    extensionRegistry.register(receiptOcrExtension)

    await eventBus.emit({
      type: 'document.uploaded',
      payload: {
        document: {
          id: 'doc-1',
          mime_type: 'application/pdf',
          storage_path: 'docs/file.pdf',
        } as never,
        userId: 'user-1',
        companyId: 'company-1',
      },
    })

    expect(analyzeReceipt).not.toHaveBeenCalled()
  })

  it('skips when autoOcrEnabled is false', async () => {
    // Settings return autoOcr disabled
    results = [
      { data: { value: { autoOcrEnabled: false, autoMatchEnabled: true, autoMatchThreshold: 0.8, ocrConfidenceThreshold: 0.6 } }, error: null },
    ]

    extensionRegistry.register(receiptOcrExtension)

    await eventBus.emit({
      type: 'document.uploaded',
      payload: {
        document: {
          id: 'doc-1',
          mime_type: 'image/jpeg',
          storage_path: 'docs/receipt.jpg',
        } as never,
        userId: 'user-1',
        companyId: 'company-1',
      },
    })

    expect(analyzeReceipt).not.toHaveBeenCalled()
  })

  it('skips when confidence below threshold', async () => {
    // Settings with very high threshold (0.99, above the 0.92 from analyzeReceipt mock)
    results = [
      { data: { value: { autoOcrEnabled: true, autoMatchEnabled: true, autoMatchThreshold: 0.8, ocrConfidenceThreshold: 0.99 } }, error: null },
    ]

    vi.mocked(createClient).mockImplementation(async () =>
      makeClient({
        download: vi.fn().mockResolvedValue({
          data: new Blob(['fake-image-data']),
          error: null,
        }),
      }) as never
    )

    extensionRegistry.register(receiptOcrExtension)

    await eventBus.emit({
      type: 'document.uploaded',
      payload: {
        document: {
          id: 'doc-1',
          mime_type: 'image/jpeg',
          storage_path: 'docs/receipt.jpg',
        } as never,
        userId: 'user-1',
        companyId: 'company-1',
      },
    })

    // analyzeReceipt IS called but confidence (0.92) < threshold (0.99)
    expect(analyzeReceipt).toHaveBeenCalled()
  })
})

// ============================================================
// handleTransactionSynced gate tests
// ============================================================

describe('handleTransactionSynced gates', () => {
  it('skips when autoMatchEnabled is false', async () => {
    results = [
      { data: { value: { autoOcrEnabled: true, autoMatchEnabled: false, autoMatchThreshold: 0.8, ocrConfidenceThreshold: 0.6 } }, error: null },
    ]

    extensionRegistry.register(receiptOcrExtension)

    await eventBus.emit({
      type: 'transaction.synced',
      payload: {
        transactions: [{ id: 'tx1', amount: -100 }] as never,
        userId: 'user-1',
        companyId: 'company-1',
      },
    })

    expect(autoMatchReceipts).not.toHaveBeenCalled()
  })

  it('skips when no expense transactions', async () => {
    results = [
      { data: { value: { autoOcrEnabled: true, autoMatchEnabled: true, autoMatchThreshold: 0.8, ocrConfidenceThreshold: 0.6 } }, error: null },
    ]

    extensionRegistry.register(receiptOcrExtension)

    await eventBus.emit({
      type: 'transaction.synced',
      payload: {
        transactions: [{ id: 'tx1', amount: 500 }] as never, // income
        userId: 'user-1',
        companyId: 'company-1',
      },
    })

    expect(autoMatchReceipts).not.toHaveBeenCalled()
  })
})
