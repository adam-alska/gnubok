import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock server-only
vi.mock('server-only', () => ({}))

// Mock the core document-analyzer module
const { mockClassify } = vi.hoisted(() => ({
  mockClassify: vi.fn(),
}))

vi.mock('@/lib/ai/document-analyzer', () => ({
  classifyDocument: mockClassify,
}))

import { classifyDocument } from '../classifier'

describe('classifyDocument', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('classifies a supplier invoice', async () => {
    mockClassify.mockResolvedValueOnce({
      type: 'supplier_invoice',
      confidence: 0.95,
      reasoning: 'Contains invoice number, bankgiro, and supplier details',
      isReverseCharge: false,
    })

    const result = await classifyDocument('base64data', 'application/pdf')

    expect(result.type).toBe('supplier_invoice')
    expect(result.confidence).toBe(0.95)
    expect(result.isReverseCharge).toBe(false)
  })

  it('classifies a receipt', async () => {
    mockClassify.mockResolvedValueOnce({
      type: 'receipt',
      confidence: 0.92,
      reasoning: 'Store receipt with line items and total',
    })

    const result = await classifyDocument('base64data', 'image/jpeg')

    expect(result.type).toBe('receipt')
    expect(result.confidence).toBe(0.92)
    expect(result.isReverseCharge).toBeUndefined()
  })

  it('classifies a government letter', async () => {
    mockClassify.mockResolvedValueOnce({
      type: 'government_letter',
      confidence: 0.88,
      reasoning: 'Letter from Skatteverket',
    })

    const result = await classifyDocument('base64data', 'application/pdf')

    expect(result.type).toBe('government_letter')
    expect(result.confidence).toBe(0.88)
    expect(result.isReverseCharge).toBeUndefined()
  })

  it('classifies unknown documents', async () => {
    mockClassify.mockResolvedValueOnce({
      type: 'unknown',
      confidence: 0.5,
      reasoning: 'Cannot determine document type',
    })

    const result = await classifyDocument('base64data', 'image/png')

    expect(result.type).toBe('unknown')
    expect(result.confidence).toBe(0.5)
  })

  it('detects reverse charge on EU invoices', async () => {
    mockClassify.mockResolvedValueOnce({
      type: 'supplier_invoice',
      confidence: 0.93,
      reasoning: 'EU invoice with reverse charge',
      isReverseCharge: true,
    })

    const result = await classifyDocument('base64data', 'application/pdf')

    expect(result.type).toBe('supplier_invoice')
    expect(result.isReverseCharge).toBe(true)
  })

  it('delegates to core classify', async () => {
    mockClassify.mockResolvedValueOnce({
      type: 'receipt',
      confidence: 0.9,
      reasoning: 'Receipt',
    })

    await classifyDocument('base64data', 'image/jpeg')

    expect(mockClassify).toHaveBeenCalledWith('base64data', 'image/jpeg')
  })

  it('propagates errors from core', async () => {
    mockClassify.mockRejectedValueOnce(new Error('Vision API call failed after 3 attempts'))

    await expect(classifyDocument('base64data', 'image/jpeg')).rejects.toThrow(
      'Vision API call failed after 3 attempts'
    )
  })

  it('propagates unsupported MIME type errors', async () => {
    mockClassify.mockRejectedValueOnce(new Error('Unsupported file type: text/plain'))

    await expect(classifyDocument('base64data', 'text/plain')).rejects.toThrow(
      'Unsupported file type: text/plain'
    )
  })
})
