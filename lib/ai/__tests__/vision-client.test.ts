import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock server-only
vi.mock('server-only', () => ({}))

// Mock preprocessing
vi.mock('../preprocess-image', () => ({
  preprocessImage: vi.fn().mockResolvedValue({ base64: 'preprocessed', mimeType: 'image/jpeg' }),
}))

// Mock Anthropic SDK
const { mockCreate } = vi.hoisted(() => {
  const mockCreate = vi.fn()
  return { mockCreate }
})

vi.mock('@anthropic-ai/sdk', () => ({
  default: class MockAnthropic {
    messages = { create: mockCreate }
  },
}))

import { callVision, stripJsonFences } from '../vision-client'
import { preprocessImage } from '../preprocess-image'

function makeResponse(json: Record<string, unknown>) {
  return {
    content: [{ type: 'text', text: JSON.stringify(json) }],
  }
}

describe('callVision', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns parsed JSON from Claude response', async () => {
    mockCreate.mockResolvedValueOnce(
      makeResponse({ type: 'receipt', confidence: 0.95 })
    )

    const result = await callVision({
      base64: 'base64data',
      mimeType: 'image/jpeg',
      systemPrompt: 'System prompt',
      userPrompt: 'User prompt',
    })

    expect(result).toEqual({ type: 'receipt', confidence: 0.95 })
  })

  it('preprocesses images by default', async () => {
    mockCreate.mockResolvedValueOnce(makeResponse({ ok: true }))

    await callVision({
      base64: 'raw-image',
      mimeType: 'image/jpeg',
      systemPrompt: 'S',
      userPrompt: 'U',
    })

    expect(preprocessImage).toHaveBeenCalledWith('raw-image', 'image/jpeg')
  })

  it('skips preprocessing when preprocess=false', async () => {
    mockCreate.mockResolvedValueOnce(makeResponse({ ok: true }))

    await callVision({
      base64: 'raw-image',
      mimeType: 'image/jpeg',
      systemPrompt: 'S',
      userPrompt: 'U',
      preprocess: false,
    })

    expect(preprocessImage).not.toHaveBeenCalled()
  })

  it('skips preprocessing for PDFs', async () => {
    mockCreate.mockResolvedValueOnce(makeResponse({ ok: true }))

    await callVision({
      base64: 'pdf-data',
      mimeType: 'application/pdf',
      systemPrompt: 'S',
      userPrompt: 'U',
    })

    expect(preprocessImage).not.toHaveBeenCalled()
  })

  it('uses document content block for PDFs', async () => {
    mockCreate.mockResolvedValueOnce(makeResponse({ type: 'invoice' }))

    await callVision({
      base64: 'pdf-data',
      mimeType: 'application/pdf',
      systemPrompt: 'S',
      userPrompt: 'U',
    })

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

  it('uses image content block for images', async () => {
    mockCreate.mockResolvedValueOnce(makeResponse({ type: 'receipt' }))

    await callVision({
      base64: 'img-data',
      mimeType: 'image/png',
      systemPrompt: 'S',
      userPrompt: 'U',
      preprocess: false,
    })

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

  it('retries on API error', async () => {
    mockCreate
      .mockRejectedValueOnce(new Error('API timeout'))
      .mockResolvedValueOnce(makeResponse({ ok: true }))

    const result = await callVision({
      base64: 'data',
      mimeType: 'image/jpeg',
      systemPrompt: 'S',
      userPrompt: 'U',
    })

    expect(result).toEqual({ ok: true })
    expect(mockCreate).toHaveBeenCalledTimes(2)
  })

  it('fast-fails on SyntaxError without retrying', async () => {
    mockCreate.mockResolvedValueOnce({
      content: [{ type: 'text', text: 'not valid json at all' }],
    })

    await expect(
      callVision({
        base64: 'data',
        mimeType: 'image/jpeg',
        systemPrompt: 'S',
        userPrompt: 'U',
      })
    ).rejects.toThrow('Failed to parse AI response')

    expect(mockCreate).toHaveBeenCalledTimes(1)
  })

  it('throws after max retries', async () => {
    mockCreate
      .mockRejectedValueOnce(new Error('err1'))
      .mockRejectedValueOnce(new Error('err2'))
      .mockRejectedValueOnce(new Error('err3'))

    await expect(
      callVision({
        base64: 'data',
        mimeType: 'image/jpeg',
        systemPrompt: 'S',
        userPrompt: 'U',
      })
    ).rejects.toThrow('Vision API call failed after 3 attempts')

    expect(mockCreate).toHaveBeenCalledTimes(3)
  })

  it('throws on unsupported file type', async () => {
    await expect(
      callVision({
        base64: 'data',
        mimeType: 'text/plain',
        systemPrompt: 'S',
        userPrompt: 'U',
      })
    ).rejects.toThrow('Unsupported file type: text/plain')
  })

  it('uses custom maxTokens', async () => {
    mockCreate.mockResolvedValueOnce(makeResponse({ ok: true }))

    await callVision({
      base64: 'data',
      mimeType: 'application/pdf',
      systemPrompt: 'S',
      userPrompt: 'U',
      maxTokens: 1024,
    })

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({ max_tokens: 1024 })
    )
  })

  it('strips JSON fences from response', async () => {
    mockCreate.mockResolvedValueOnce({
      content: [
        {
          type: 'text',
          text: '```json\n{"type":"receipt","confidence":0.9}\n```',
        },
      ],
    })

    const result = await callVision({
      base64: 'data',
      mimeType: 'image/jpeg',
      systemPrompt: 'S',
      userPrompt: 'U',
    })

    expect(result).toEqual({ type: 'receipt', confidence: 0.9 })
  })
})

describe('stripJsonFences', () => {
  it('strips ```json ... ``` fences', () => {
    expect(stripJsonFences('```json\n{"a":1}\n```')).toBe('{"a":1}')
  })

  it('strips plain ``` fences', () => {
    expect(stripJsonFences('```\n{"a":1}\n```')).toBe('{"a":1}')
  })

  it('returns plain JSON unchanged', () => {
    expect(stripJsonFences('{"a":1}')).toBe('{"a":1}')
  })

  it('trims whitespace', () => {
    expect(stripJsonFences('  {"a":1}  ')).toBe('{"a":1}')
  })
})
