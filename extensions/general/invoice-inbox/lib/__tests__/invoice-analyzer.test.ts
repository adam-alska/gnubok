import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock server-only
vi.mock('server-only', () => ({}))

// Mock Anthropic SDK - vi.hoisted ensures the variable is available before vi.mock hoisting
const { mockCreate } = vi.hoisted(() => {
  const mockCreate = vi.fn()
  return { mockCreate }
})

vi.mock('@anthropic-ai/sdk', () => {
  return {
    default: class MockAnthropic {
      messages = { create: mockCreate }
    },
  }
})

import { analyzeInvoice } from '../invoice-analyzer'

describe('Invoice Analyzer', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  const validExtractionJson = JSON.stringify({
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
  })

  it('parses valid AI response for PDF', async () => {
    mockCreate.mockResolvedValue({
      content: [{ type: 'text', text: validExtractionJson }],
    })

    const result = await analyzeInvoice('base64data', 'application/pdf')

    expect(result.supplier.name).toBe('Kontorsbolaget AB')
    expect(result.supplier.orgNumber).toBe('556123-4567')
    expect(result.invoice.invoiceNumber).toBe('F-2024-001')
    expect(result.lineItems).toHaveLength(1)
    expect(result.lineItems[0].lineTotal).toBe(500)
    expect(result.totals.total).toBe(625)
    expect(result.confidence).toBe(0.92)
  })

  it('parses valid AI response for image', async () => {
    mockCreate.mockResolvedValue({
      content: [{ type: 'text', text: validExtractionJson }],
    })

    const result = await analyzeInvoice('base64data', 'image/jpeg')

    expect(result.supplier.name).toBe('Kontorsbolaget AB')
    expect(mockCreate).toHaveBeenCalledTimes(1)
  })

  it('strips markdown code blocks from response', async () => {
    mockCreate.mockResolvedValue({
      content: [{ type: 'text', text: '```json\n' + validExtractionJson + '\n```' }],
    })

    const result = await analyzeInvoice('base64data', 'application/pdf')
    expect(result.supplier.name).toBe('Kontorsbolaget AB')
  })

  it('validates org number format', async () => {
    mockCreate.mockResolvedValue({
      content: [{ type: 'text', text: JSON.stringify({
        supplier: { name: 'Test', orgNumber: '5561234567', vatNumber: null, address: null, bankgiro: null, plusgiro: null },
        invoice: { invoiceNumber: null, invoiceDate: null, dueDate: null, paymentReference: null, currency: 'SEK' },
        lineItems: [],
        totals: { subtotal: 0, vatAmount: 0, total: 0 },
        vatBreakdown: [],
        confidence: 0.5,
      }) }],
    })

    const result = await analyzeInvoice('base64data', 'application/pdf')
    expect(result.supplier.orgNumber).toBe('556123-4567') // Formatted with dash
  })

  it('rejects invalid VAT numbers', async () => {
    mockCreate.mockResolvedValue({
      content: [{ type: 'text', text: JSON.stringify({
        supplier: { name: 'Test', orgNumber: null, vatNumber: 'DE123', address: null, bankgiro: null, plusgiro: null },
        invoice: { invoiceNumber: null, invoiceDate: null, dueDate: null, paymentReference: null, currency: 'SEK' },
        lineItems: [],
        totals: { subtotal: 0, vatAmount: 0, total: 0 },
        vatBreakdown: [],
        confidence: 0.5,
      }) }],
    })

    const result = await analyzeInvoice('base64data', 'application/pdf')
    expect(result.supplier.vatNumber).toBeNull() // Not SE-prefixed
  })

  it('throws on JSON parse error without retrying', async () => {
    mockCreate.mockResolvedValue({
      content: [{ type: 'text', text: 'not json at all' }],
    })

    await expect(analyzeInvoice('base64data', 'application/pdf')).rejects.toThrow('Failed to parse AI response')
    expect(mockCreate).toHaveBeenCalledTimes(1) // No retry for parse errors
  })

  it('retries on API errors', async () => {
    mockCreate
      .mockRejectedValueOnce(new Error('API timeout'))
      .mockResolvedValueOnce({
        content: [{ type: 'text', text: validExtractionJson }],
      })

    const result = await analyzeInvoice('base64data', 'application/pdf')
    expect(result.supplier.name).toBe('Kontorsbolaget AB')
    expect(mockCreate).toHaveBeenCalledTimes(2)
  })

  it('throws after max retries', async () => {
    mockCreate.mockRejectedValue(new Error('API timeout'))

    await expect(analyzeInvoice('base64data', 'application/pdf')).rejects.toThrow(
      'Invoice analysis failed after 3 attempts'
    )
    expect(mockCreate).toHaveBeenCalledTimes(3)
  })

  it('rejects unsupported file types', async () => {
    await expect(analyzeInvoice('base64data', 'text/plain')).rejects.toThrow(
      'Unsupported file type'
    )
  })

  it('validates account number suggestions', async () => {
    mockCreate.mockResolvedValue({
      content: [{ type: 'text', text: JSON.stringify({
        supplier: { name: 'Test', orgNumber: null, vatNumber: null, address: null, bankgiro: null, plusgiro: null },
        invoice: { invoiceNumber: null, invoiceDate: null, dueDate: null, paymentReference: null, currency: 'SEK' },
        lineItems: [
          { description: 'Item', quantity: 1, unitPrice: 100, lineTotal: 100, vatRate: 25, accountSuggestion: '6100' },
          { description: 'Bad', quantity: 1, unitPrice: 50, lineTotal: 50, vatRate: 25, accountSuggestion: 'abc' },
        ],
        totals: { subtotal: 150, vatAmount: 37.5, total: 187.5 },
        vatBreakdown: [],
        confidence: 0.8,
      }) }],
    })

    const result = await analyzeInvoice('base64data', 'application/pdf')
    expect(result.lineItems[0].accountSuggestion).toBe('6100')
    expect(result.lineItems[1].accountSuggestion).toBeNull()
  })
})
