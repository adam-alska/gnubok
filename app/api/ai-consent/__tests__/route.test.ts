import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createMockRequest, parseJsonResponse } from '@/tests/helpers'

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}))

vi.mock('@/lib/extensions/ai-consent', () => ({
  AI_EXTENSIONS: ['receipt-ocr', 'ai-categorization', 'ai-chat'],
  hasAiConsent: vi.fn(),
  grantAiConsent: vi.fn(),
  revokeAiConsent: vi.fn(),
  isAiExtension: vi.fn((id: string) =>
    ['receipt-ocr', 'ai-categorization', 'ai-chat'].includes(id)
  ),
}))

import { createClient } from '@/lib/supabase/server'
import { hasAiConsent, grantAiConsent, revokeAiConsent } from '@/lib/extensions/ai-consent'
import { GET, POST, DELETE } from '../route'

const mockCreateClient = vi.mocked(createClient)
const mockHasAiConsent = vi.mocked(hasAiConsent)
const mockGrantAiConsent = vi.mocked(grantAiConsent)
const mockRevokeAiConsent = vi.mocked(revokeAiConsent)

function mockAuth(userId: string | null) {
  mockCreateClient.mockResolvedValue({
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: userId ? { id: userId } : null },
      }),
    },
  } as any)
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('GET /api/ai-consent', () => {
  it('returns 401 when not authenticated', async () => {
    mockAuth(null)
    const { status } = await parseJsonResponse(await GET())
    expect(status).toBe(401)
  })

  it('returns consent status for all AI extensions', async () => {
    mockAuth('user-1')
    mockHasAiConsent
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true)

    const { status, body } = await parseJsonResponse<{ data: Record<string, boolean> }>(
      await GET()
    )

    expect(status).toBe(200)
    expect(body.data).toEqual({
      'receipt-ocr': true,
      'ai-categorization': false,
      'ai-chat': true,
    })
  })
})

describe('POST /api/ai-consent', () => {
  it('returns 401 when not authenticated', async () => {
    mockAuth(null)
    const req = createMockRequest('/api/ai-consent', {
      method: 'POST',
      body: { extension_id: 'receipt-ocr' },
    })
    const { status } = await parseJsonResponse(await POST(req))
    expect(status).toBe(401)
  })

  it('grants consent for valid AI extension', async () => {
    mockAuth('user-1')
    mockGrantAiConsent.mockResolvedValue(undefined)

    const req = createMockRequest('/api/ai-consent', {
      method: 'POST',
      body: { extension_id: 'receipt-ocr' },
    })
    const { status, body } = await parseJsonResponse<{ data: { consented: boolean } }>(
      await POST(req)
    )

    expect(status).toBe(200)
    expect(body.data.consented).toBe(true)
    expect(mockGrantAiConsent).toHaveBeenCalledWith(expect.anything(), 'user-1', 'receipt-ocr')
  })

  it('returns 400 for non-AI extension', async () => {
    mockAuth('user-1')

    const req = createMockRequest('/api/ai-consent', {
      method: 'POST',
      body: { extension_id: 'enable-banking' },
    })
    const { status } = await parseJsonResponse(await POST(req))
    expect(status).toBe(400)
  })
})

describe('DELETE /api/ai-consent', () => {
  it('returns 401 when not authenticated', async () => {
    mockAuth(null)
    const req = createMockRequest('/api/ai-consent', {
      method: 'DELETE',
      body: { extension_id: 'ai-chat' },
    })
    const { status } = await parseJsonResponse(await DELETE(req))
    expect(status).toBe(401)
  })

  it('revokes consent for valid AI extension', async () => {
    mockAuth('user-1')
    mockRevokeAiConsent.mockResolvedValue(undefined)

    const req = createMockRequest('/api/ai-consent', {
      method: 'DELETE',
      body: { extension_id: 'ai-chat' },
    })
    const { status, body } = await parseJsonResponse<{ data: { consented: boolean } }>(
      await DELETE(req)
    )

    expect(status).toBe(200)
    expect(body.data.consented).toBe(false)
    expect(mockRevokeAiConsent).toHaveBeenCalledWith(expect.anything(), 'user-1', 'ai-chat')
  })
})
