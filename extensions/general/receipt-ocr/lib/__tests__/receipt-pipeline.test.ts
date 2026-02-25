import { describe, it, expect, vi, beforeEach } from 'vitest'
import { eventBus } from '@/lib/events/bus'

// Mock server-only
vi.mock('server-only', () => ({}))

// Mock receipt analyzer
vi.mock('../receipt-analyzer', () => ({
  analyzeReceipt: vi.fn(),
}))

// Mock receipt categorizer
vi.mock('../receipt-categorizer', () => ({
  processLineItems: vi.fn(),
}))

// Mock receipt matcher
vi.mock('../receipt-matcher', () => ({
  autoMatchReceipts: vi.fn(),
}))

// Mock event bus
vi.mock('@/lib/events/bus', () => ({
  eventBus: { emit: vi.fn(), clear: vi.fn() },
}))

import { processReceiptFromDocument } from '../receipt-pipeline'
import { analyzeReceipt } from '../receipt-analyzer'
import { processLineItems } from '../receipt-categorizer'
import { autoMatchReceipts } from '../receipt-matcher'

function createMockSupabase() {
  const mockResult = { data: null, error: null }

  const chain = {
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    single: vi.fn().mockImplementation(() => Promise.resolve(mockResult)),
    eq: vi.fn().mockReturnThis(),
    is: vi.fn().mockReturnThis(),
    lt: vi.fn().mockReturnThis(),
    gte: vi.fn().mockReturnThis(),
    lte: vi.fn().mockReturnThis(),
  }

  const supabase = {
    from: vi.fn().mockReturnValue(chain),
  }

  return { supabase, chain, setResult: (data: unknown, error: unknown = null) => {
    mockResult.data = data as null
    mockResult.error = error as null
  } }
}

const mockExtraction = {
  merchant: {
    name: 'ICA Maxi',
    orgNumber: '556123-4567',
    vatNumber: null,
    isForeign: false,
  },
  receipt: {
    date: '2024-06-15',
    time: '14:30',
    currency: 'SEK',
  },
  lineItems: [
    { description: 'Mjölk', quantity: 1, unitPrice: 15, lineTotal: 15, vatRate: 12, suggestedCategory: 'other' },
  ],
  totals: { subtotal: 13.39, vatAmount: 1.61, total: 15 },
  flags: { isRestaurant: false, isSystembolaget: false, isForeignMerchant: false },
  confidence: 0.92,
}

describe('processReceiptFromDocument', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    eventBus.clear()
    vi.mocked(analyzeReceipt).mockResolvedValue(mockExtraction)
    vi.mocked(processLineItems).mockReturnValue([
      { ...mockExtraction.lineItems[0], category: 'expense_other' as const, basAccount: '6991', confidence: 0.8 },
    ])
    vi.mocked(autoMatchReceipts).mockReturnValue([])
  })

  it('creates receipt record with extracted data', async () => {
    const { supabase, chain, setResult } = createMockSupabase()

    const receipt = {
      id: 'receipt-1',
      user_id: 'user-1',
      status: 'extracted',
      merchant_name: 'ICA Maxi',
      total_amount: 15,
      receipt_date: '2024-06-15',
    }

    // First from() = receipts insert
    setResult(receipt)

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await processReceiptFromDocument(supabase as any, 'user-1', 'base64data', 'image/jpeg', {
      documentId: 'doc-1',
      source: 'email',
      emailFrom: 'sender@example.com',
      storageUrl: 'https://storage.example.com/file.jpg',
    })

    expect(result.receipt.id).toBe('receipt-1')
    expect(analyzeReceipt).toHaveBeenCalledWith('base64data', 'image/jpeg')
    expect(processLineItems).toHaveBeenCalledWith(mockExtraction.lineItems)

    // Verify receipt insert includes source and email_from
    expect(chain.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        source: 'email',
        email_from: 'sender@example.com',
        document_id: 'doc-1',
      })
    )
  })

  it('emits receipt.extracted event', async () => {
    const { supabase, setResult } = createMockSupabase()
    const receipt = { id: 'receipt-1', user_id: 'user-1' }
    setResult(receipt)

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await processReceiptFromDocument(supabase as any, 'user-1', 'base64data', 'image/jpeg', {
      documentId: 'doc-1',
      source: 'upload',
      storageUrl: 'https://storage.example.com/file.jpg',
    })

    expect(eventBus.emit).toHaveBeenCalledWith({
      type: 'receipt.extracted',
      payload: expect.objectContaining({
        receipt,
        documentId: 'doc-1',
        confidence: 0.92,
        userId: 'user-1',
      }),
    })
  })

  it('throws when receipt insert fails', async () => {
    const { supabase, setResult } = createMockSupabase()
    setResult(null, { message: 'insert failed' })

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await expect(processReceiptFromDocument(supabase as any, 'user-1', 'base64data', 'image/jpeg', {
      documentId: null,
      source: 'upload',
      storageUrl: 'https://storage.example.com/file.jpg',
    })).rejects.toThrow('Failed to create receipt')
  })

  it('sets email_from to null when not provided', async () => {
    const { supabase, chain, setResult } = createMockSupabase()
    setResult({ id: 'receipt-1', user_id: 'user-1' })

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await processReceiptFromDocument(supabase as any, 'user-1', 'base64data', 'image/jpeg', {
      documentId: null,
      source: 'upload',
      storageUrl: 'https://storage.example.com/file.jpg',
    })

    expect(chain.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        source: 'upload',
        email_from: null,
      })
    )
  })
})
