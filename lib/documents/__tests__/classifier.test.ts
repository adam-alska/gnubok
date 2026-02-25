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

import { classifyDocument } from '../classifier'

function makeResponse(json: Record<string, unknown>) {
  return {
    content: [{ type: 'text', text: JSON.stringify(json) }],
  }
}

describe('classifyDocument', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('classifies a supplier invoice', async () => {
    mockCreate.mockResolvedValueOnce(
      makeResponse({
        type: 'supplier_invoice',
        confidence: 0.95,
        reasoning: 'Contains invoice number, bankgiro, and supplier details',
        isReverseCharge: false,
      })
    )

    const result = await classifyDocument('base64data', 'application/pdf')

    expect(result.type).toBe('supplier_invoice')
    expect(result.confidence).toBe(0.95)
    expect(result.isReverseCharge).toBe(false)
  })

  it('classifies a receipt', async () => {
    mockCreate.mockResolvedValueOnce(
      makeResponse({
        type: 'receipt',
        confidence: 0.92,
        reasoning: 'Store receipt with line items and total',
      })
    )

    const result = await classifyDocument('base64data', 'image/jpeg')

    expect(result.type).toBe('receipt')
    expect(result.confidence).toBe(0.92)
    expect(result.isReverseCharge).toBeUndefined()
  })

  it('classifies a government letter', async () => {
    mockCreate.mockResolvedValueOnce(
      makeResponse({
        type: 'government_letter',
        confidence: 0.88,
        reasoning: 'Letter from Skatteverket',
      })
    )

    const result = await classifyDocument('base64data', 'application/pdf')

    expect(result.type).toBe('government_letter')
    expect(result.confidence).toBe(0.88)
    expect(result.isReverseCharge).toBeUndefined()
  })

  it('classifies unknown documents', async () => {
    mockCreate.mockResolvedValueOnce(
      makeResponse({
        type: 'unknown',
        confidence: 0.5,
        reasoning: 'Cannot determine document type',
      })
    )

    const result = await classifyDocument('base64data', 'image/png')

    expect(result.type).toBe('unknown')
    expect(result.confidence).toBe(0.5)
  })

  it('detects reverse charge on EU invoices', async () => {
    mockCreate.mockResolvedValueOnce(
      makeResponse({
        type: 'supplier_invoice',
        confidence: 0.93,
        reasoning: 'EU invoice with reverse charge',
        isReverseCharge: true,
      })
    )

    const result = await classifyDocument('base64data', 'application/pdf')

    expect(result.type).toBe('supplier_invoice')
    expect(result.isReverseCharge).toBe(true)
  })

  it('retries on API error', async () => {
    mockCreate
      .mockRejectedValueOnce(new Error('API timeout'))
      .mockResolvedValueOnce(
        makeResponse({
          type: 'receipt',
          confidence: 0.9,
          reasoning: 'Receipt',
        })
      )

    const result = await classifyDocument('base64data', 'image/jpeg')

    expect(result.type).toBe('receipt')
    expect(mockCreate).toHaveBeenCalledTimes(2)
  })

  it('throws on JSON parse error without retry', async () => {
    mockCreate.mockResolvedValueOnce({
      content: [{ type: 'text', text: 'not valid json' }],
    })

    await expect(classifyDocument('base64data', 'image/jpeg')).rejects.toThrow(
      'Failed to parse AI response'
    )
    expect(mockCreate).toHaveBeenCalledTimes(1)
  })

  it('throws on unsupported MIME type', async () => {
    await expect(classifyDocument('base64data', 'text/plain')).rejects.toThrow(
      'Unsupported file type: text/plain'
    )
    expect(mockCreate).not.toHaveBeenCalled()
  })

  it('falls back to unknown for invalid type values', async () => {
    mockCreate.mockResolvedValueOnce(
      makeResponse({
        type: 'invalid_type',
        confidence: 0.8,
        reasoning: 'Test',
      })
    )

    const result = await classifyDocument('base64data', 'image/jpeg')

    expect(result.type).toBe('unknown')
  })

  it('handles PDF content blocks correctly', async () => {
    mockCreate.mockResolvedValueOnce(
      makeResponse({
        type: 'supplier_invoice',
        confidence: 0.95,
        reasoning: 'PDF invoice',
        isReverseCharge: false,
      })
    )

    await classifyDocument('base64data', 'application/pdf')

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: [
          {
            role: 'user',
            content: expect.arrayContaining([
              expect.objectContaining({ type: 'document' }),
            ]),
          },
        ],
      })
    )
  })

  it('handles image content blocks correctly', async () => {
    mockCreate.mockResolvedValueOnce(
      makeResponse({
        type: 'receipt',
        confidence: 0.9,
        reasoning: 'Image receipt',
      })
    )

    await classifyDocument('base64data', 'image/png')

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: [
          {
            role: 'user',
            content: expect.arrayContaining([
              expect.objectContaining({ type: 'image' }),
            ]),
          },
        ],
      })
    )
  })

  it('strips markdown code blocks from response', async () => {
    mockCreate.mockResolvedValueOnce({
      content: [
        {
          type: 'text',
          text: '```json\n{"type":"receipt","confidence":0.9,"reasoning":"Test"}\n```',
        },
      ],
    })

    const result = await classifyDocument('base64data', 'image/jpeg')
    expect(result.type).toBe('receipt')
  })

  it('throws after max retries', async () => {
    mockCreate
      .mockRejectedValueOnce(new Error('API error 1'))
      .mockRejectedValueOnce(new Error('API error 2'))
      .mockRejectedValueOnce(new Error('API error 3'))

    await expect(classifyDocument('base64data', 'image/jpeg')).rejects.toThrow(
      'Document classification failed after 3 attempts'
    )
    expect(mockCreate).toHaveBeenCalledTimes(3)
  })
})
