import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock server-only
vi.mock('server-only', () => ({}))

// Mock vision client
const { mockCallVision } = vi.hoisted(() => ({
  mockCallVision: vi.fn(),
}))

vi.mock('../vision-client', () => ({
  callVision: mockCallVision,
}))

// Mock template prompt
vi.mock('@/lib/bookkeeping/template-prompt', () => ({
  buildTemplatePromptSection: () => 'TEMPLATE_SECTION',
}))

import {
  analyzeDocument,
  extractReceipt,
  extractInvoice,
  classifyDocument,
  validateExtractionConsistency,
} from '../document-analyzer'

const mockReceiptResponse = {
  merchant: { name: 'ICA Maxi', orgNumber: '5561234567', vatNumber: null, isForeign: false },
  receipt: { date: '2024-06-15', time: '14:30', currency: 'SEK' },
  lineItems: [
    { description: 'Mjölk', quantity: 1, unitPrice: 15, lineTotal: 15, vatRate: 12, suggestedCategory: 'other' },
  ],
  totals: { subtotal: 13.39, vatAmount: 1.61, total: 15 },
  flags: { isRestaurant: false, isSystembolaget: false, isForeignMerchant: false },
  confidence: 0.92,
}

const mockInvoiceResponse = {
  supplier: { name: 'Telenor AB', orgNumber: '5561234567', vatNumber: 'SE556123456701', address: 'Stockholm', bankgiro: '123-4567', plusgiro: null },
  invoice: { invoiceNumber: 'F-2024-001', invoiceDate: '2024-06-01', dueDate: '2024-06-30', paymentReference: '1234567890', currency: 'SEK' },
  lineItems: [
    { description: 'Mobilabonnemang', quantity: 1, unitPrice: 299, lineTotal: 299, vatRate: 25, accountSuggestion: '6200' },
  ],
  totals: { subtotal: 239.2, vatAmount: 59.8, total: 299 },
  vatBreakdown: [{ rate: 25, base: 239.2, amount: 59.8 }],
  confidence: 0.95,
}

describe('classifyDocument', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('classifies a supplier invoice', async () => {
    mockCallVision.mockResolvedValueOnce({
      type: 'supplier_invoice',
      confidence: 0.95,
      reasoning: 'Contains invoice number and bankgiro',
      isReverseCharge: false,
    })

    const result = await classifyDocument('base64data', 'application/pdf')

    expect(result.type).toBe('supplier_invoice')
    expect(result.confidence).toBe(0.95)
    expect(result.isReverseCharge).toBe(false)
    expect(mockCallVision).toHaveBeenCalledWith(
      expect.objectContaining({ maxTokens: 1024 })
    )
  })

  it('classifies a receipt', async () => {
    mockCallVision.mockResolvedValueOnce({
      type: 'receipt',
      confidence: 0.92,
      reasoning: 'Store receipt',
    })

    const result = await classifyDocument('base64data', 'image/jpeg')

    expect(result.type).toBe('receipt')
    expect(result.isReverseCharge).toBeUndefined()
  })

  it('falls back to unknown for invalid type', async () => {
    mockCallVision.mockResolvedValueOnce({
      type: 'invalid_type',
      confidence: 0.8,
      reasoning: 'Test',
    })

    const result = await classifyDocument('base64data', 'image/jpeg')

    expect(result.type).toBe('unknown')
  })
})

describe('extractReceipt', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('extracts receipt data', async () => {
    mockCallVision.mockResolvedValueOnce(mockReceiptResponse)

    const result = await extractReceipt('base64data', 'image/jpeg')

    expect(result.merchant.name).toBe('ICA Maxi')
    expect(result.merchant.orgNumber).toBe('556123-4567')
    expect(result.receipt.date).toBe('2024-06-15')
    expect(result.lineItems).toHaveLength(1)
    expect(result.totals.total).toBe(15)
    expect(result.confidence).toBe(0.92)
  })

  it('retries with correction prompt on consistency failure', async () => {
    const badResponse = {
      ...mockReceiptResponse,
      lineItems: [
        { description: 'Item', quantity: 1, unitPrice: 100, lineTotal: 100, vatRate: 25 },
      ],
      totals: { subtotal: 80, vatAmount: 20, total: 200 }, // 100 != 200 → inconsistent
      confidence: 0.9,
    }

    const goodResponse = {
      ...mockReceiptResponse,
      lineItems: [
        { description: 'Item', quantity: 1, unitPrice: 200, lineTotal: 200, vatRate: 25 },
      ],
      totals: { subtotal: 160, vatAmount: 40, total: 200 },
      confidence: 0.85,
    }

    mockCallVision
      .mockResolvedValueOnce(badResponse)
      .mockResolvedValueOnce(goodResponse)

    const result = await extractReceipt('base64data', 'image/jpeg')

    expect(mockCallVision).toHaveBeenCalledTimes(2)
    expect(result.totals.total).toBe(200)
    expect(result.lineItems[0].lineTotal).toBe(200)
  })

  it('returns original with reduced confidence if retry also fails', async () => {
    const badResponse = {
      ...mockReceiptResponse,
      lineItems: [
        { description: 'Item', quantity: 1, unitPrice: 100, lineTotal: 100, vatRate: 25 },
      ],
      totals: { subtotal: 80, vatAmount: 20, total: 200 },
      confidence: 0.9,
    }

    mockCallVision
      .mockResolvedValueOnce(badResponse)
      .mockRejectedValueOnce(new Error('Retry failed'))

    const result = await extractReceipt('base64data', 'image/jpeg')

    expect(result.confidence).toBeCloseTo(0.63, 1) // 0.9 * 0.7
  })
})

describe('extractInvoice', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('extracts invoice data', async () => {
    mockCallVision.mockResolvedValueOnce(mockInvoiceResponse)

    const result = await extractInvoice('base64data', 'application/pdf')

    expect(result.supplier.name).toBe('Telenor AB')
    expect(result.supplier.orgNumber).toBe('556123-4567')
    expect(result.invoice.invoiceNumber).toBe('F-2024-001')
    expect(result.lineItems).toHaveLength(1)
    expect(result.lineItems[0].accountSuggestion).toBe('6200')
    expect(result.vatBreakdown).toHaveLength(1)
    expect(result.confidence).toBe(0.95)
  })
})

describe('analyzeDocument', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('classifies and extracts receipt in one call', async () => {
    mockCallVision.mockResolvedValueOnce({
      classification: { type: 'receipt', confidence: 0.93, reasoning: 'Receipt' },
      receipt: mockReceiptResponse,
      invoice: null,
    })

    const result = await analyzeDocument('base64data', 'image/jpeg')

    expect(result.classification.type).toBe('receipt')
    expect(result.receipt).toBeDefined()
    expect(result.receipt!.merchant.name).toBe('ICA Maxi')
    expect(result.invoice).toBeUndefined()
    expect(mockCallVision).toHaveBeenCalledTimes(1) // Single call
  })

  it('classifies and extracts invoice in one call', async () => {
    mockCallVision.mockResolvedValueOnce({
      classification: { type: 'supplier_invoice', confidence: 0.95, reasoning: 'Invoice', isReverseCharge: false },
      receipt: null,
      invoice: mockInvoiceResponse,
    })

    const result = await analyzeDocument('base64data', 'application/pdf')

    expect(result.classification.type).toBe('supplier_invoice')
    expect(result.invoice).toBeDefined()
    expect(result.invoice!.supplier.name).toBe('Telenor AB')
    expect(result.receipt).toBeUndefined()
  })

  it('falls back to extractReceipt when type=receipt but receipt data missing', async () => {
    mockCallVision
      .mockResolvedValueOnce({
        classification: { type: 'receipt', confidence: 0.8, reasoning: 'Receipt' },
        receipt: null,
        invoice: null,
      })
      .mockResolvedValueOnce(mockReceiptResponse) // fallback extractReceipt call

    const result = await analyzeDocument('base64data', 'image/jpeg')

    expect(result.classification.type).toBe('receipt')
    expect(result.receipt).toBeDefined()
    expect(mockCallVision).toHaveBeenCalledTimes(2) // unified + fallback
  })

  it('falls back to extractInvoice when type=supplier_invoice but invoice data missing', async () => {
    mockCallVision
      .mockResolvedValueOnce({
        classification: { type: 'supplier_invoice', confidence: 0.9, reasoning: 'Invoice' },
        receipt: null,
        invoice: null,
      })
      .mockResolvedValueOnce(mockInvoiceResponse)

    const result = await analyzeDocument('base64data', 'application/pdf')

    expect(result.classification.type).toBe('supplier_invoice')
    expect(result.invoice).toBeDefined()
    expect(mockCallVision).toHaveBeenCalledTimes(2)
  })

  it('returns classification only for government_letter', async () => {
    mockCallVision.mockResolvedValueOnce({
      classification: { type: 'government_letter', confidence: 0.88, reasoning: 'From Skatteverket' },
    })

    const result = await analyzeDocument('base64data', 'application/pdf')

    expect(result.classification.type).toBe('government_letter')
    expect(result.receipt).toBeUndefined()
    expect(result.invoice).toBeUndefined()
    expect(mockCallVision).toHaveBeenCalledTimes(1)
  })

  it('returns classification only for unknown', async () => {
    mockCallVision.mockResolvedValueOnce({
      classification: { type: 'unknown', confidence: 0.5, reasoning: 'Cannot determine' },
    })

    const result = await analyzeDocument('base64data', 'image/png')

    expect(result.classification.type).toBe('unknown')
    expect(mockCallVision).toHaveBeenCalledTimes(1)
  })
})

describe('validateExtractionConsistency', () => {
  it('passes for valid extraction', () => {
    const extraction = {
      ...mockReceiptResponse,
      merchant: { ...mockReceiptResponse.merchant, orgNumber: '556123-4567' },
    } as unknown as import('@/types').ReceiptExtractionResult

    const result = validateExtractionConsistency(extraction, 'receipt')

    expect(result.valid).toBe(true)
    expect(result.issues).toHaveLength(0)
  })

  it('detects line item sum mismatch', () => {
    const extraction = {
      lineItems: [
        { description: 'Item 1', lineTotal: 100, vatRate: 25 },
      ],
      totals: { subtotal: 80, vatAmount: 20, total: 200 },
      confidence: 0.9,
    } as unknown as import('@/types').ReceiptExtractionResult

    const result = validateExtractionConsistency(extraction, 'receipt')

    expect(result.valid).toBe(false)
    expect(result.issues).toContainEqual(expect.stringContaining('Line items sum'))
  })

  it('allows small rounding differences (±1 SEK)', () => {
    const extraction = {
      lineItems: [
        { description: 'Item', lineTotal: 99.5, vatRate: 25 },
      ],
      totals: { subtotal: 80, vatAmount: 20, total: 100 },
      confidence: 0.9,
    } as unknown as import('@/types').ReceiptExtractionResult

    const result = validateExtractionConsistency(extraction, 'receipt')

    expect(result.valid).toBe(true)
  })

  it('detects invalid VAT rates', () => {
    const extraction = {
      lineItems: [
        { description: 'Item', lineTotal: 100, vatRate: 18 },
      ],
      totals: { subtotal: 85, vatAmount: 15, total: 100 },
      confidence: 0.9,
    } as unknown as import('@/types').ReceiptExtractionResult

    const result = validateExtractionConsistency(extraction, 'receipt')

    expect(result.valid).toBe(false)
    expect(result.issues).toContainEqual(expect.stringContaining('Invalid VAT rate 18'))
  })

  it('detects empty descriptions', () => {
    const extraction = {
      lineItems: [
        { description: '', lineTotal: 100, vatRate: 25 },
      ],
      totals: { subtotal: 80, vatAmount: 20, total: 100 },
      confidence: 0.9,
    } as unknown as import('@/types').ReceiptExtractionResult

    const result = validateExtractionConsistency(extraction, 'receipt')

    expect(result.valid).toBe(false)
    expect(result.issues).toContainEqual(expect.stringContaining('empty description'))
  })

  it('detects non-positive totals', () => {
    const extraction = {
      lineItems: [],
      totals: { subtotal: 0, vatAmount: 0, total: -5 },
      confidence: 0.9,
    } as unknown as import('@/types').ReceiptExtractionResult

    const result = validateExtractionConsistency(extraction, 'receipt')

    expect(result.valid).toBe(false)
    expect(result.issues).toContainEqual(expect.stringContaining('Total is -5'))
  })

  it('passes when total is null (not extracted)', () => {
    const extraction = {
      lineItems: [
        { description: 'Item', lineTotal: 100, vatRate: 25 },
      ],
      totals: { subtotal: null, vatAmount: null, total: null },
      confidence: 0.5,
    } as unknown as import('@/types').ReceiptExtractionResult

    const result = validateExtractionConsistency(extraction, 'receipt')

    expect(result.valid).toBe(true)
  })
})
