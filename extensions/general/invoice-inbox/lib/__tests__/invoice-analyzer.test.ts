import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock server-only
vi.mock('server-only', () => ({}))

// Mock the core document-analyzer module
const { mockExtractInvoice } = vi.hoisted(() => ({
  mockExtractInvoice: vi.fn(),
}))

vi.mock('@/lib/ai/document-analyzer', () => ({
  extractInvoice: mockExtractInvoice,
}))

import { analyzeInvoice } from '../invoice-analyzer'

describe('Invoice Analyzer', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  const validExtraction = {
    supplier: {
      name: 'Kontorsbolaget AB',
      orgNumber: '556123-4567',
      vatNumber: 'SE5561234567',
      address: 'Storgatan 1, 111 22 Stockholm',
      bankgiro: '123-4567',
      plusgiro: null,
    },
    invoice: {
      invoiceNumber: 'F-2024-001',
      invoiceDate: '2024-06-15',
      dueDate: '2024-07-15',
      paymentReference: '1234567890',
      currency: 'SEK',
    },
    lineItems: [
      {
        description: 'Kontorsmaterial',
        quantity: 10,
        unitPrice: 50,
        lineTotal: 500,
        vatRate: 25,
        accountSuggestion: '6100',
      },
    ],
    totals: {
      subtotal: 500,
      vatAmount: 125,
      total: 625,
    },
    vatBreakdown: [
      { rate: 25, base: 500, amount: 125 },
    ],
    confidence: 0.92,
  }

  it('delegates to extractInvoice from core', async () => {
    mockExtractInvoice.mockResolvedValueOnce(validExtraction)

    const result = await analyzeInvoice('base64data', 'application/pdf')

    expect(mockExtractInvoice).toHaveBeenCalledWith('base64data', 'application/pdf')
    expect(result.supplier.name).toBe('Kontorsbolaget AB')
    expect(result.supplier.orgNumber).toBe('556123-4567')
    expect(result.invoice.invoiceNumber).toBe('F-2024-001')
    expect(result.lineItems).toHaveLength(1)
    expect(result.lineItems[0].lineTotal).toBe(500)
    expect(result.totals.total).toBe(625)
    expect(result.confidence).toBe(0.92)
  })

  it('works with image mime types', async () => {
    mockExtractInvoice.mockResolvedValueOnce(validExtraction)

    const result = await analyzeInvoice('base64data', 'image/jpeg')

    expect(mockExtractInvoice).toHaveBeenCalledWith('base64data', 'image/jpeg')
    expect(result.supplier.name).toBe('Kontorsbolaget AB')
  })

  it('propagates errors from core', async () => {
    mockExtractInvoice.mockRejectedValueOnce(new Error('Vision API call failed after 3 attempts'))

    await expect(analyzeInvoice('base64data', 'application/pdf')).rejects.toThrow(
      'Vision API call failed after 3 attempts'
    )
  })

  it('propagates unsupported file type errors', async () => {
    mockExtractInvoice.mockRejectedValueOnce(new Error('Unsupported file type: text/plain'))

    await expect(analyzeInvoice('base64data', 'text/plain')).rejects.toThrow(
      'Unsupported file type'
    )
  })

  it('returns validated account suggestions', async () => {
    const extractionWithAccounts = {
      ...validExtraction,
      lineItems: [
        { description: 'Item', quantity: 1, unitPrice: 100, lineTotal: 100, vatRate: 25, accountSuggestion: '6100' },
        { description: 'Bad', quantity: 1, unitPrice: 50, lineTotal: 50, vatRate: 25, accountSuggestion: null },
      ],
    }
    mockExtractInvoice.mockResolvedValueOnce(extractionWithAccounts)

    const result = await analyzeInvoice('base64data', 'application/pdf')
    expect(result.lineItems[0].accountSuggestion).toBe('6100')
    expect(result.lineItems[1].accountSuggestion).toBeNull()
  })
})
