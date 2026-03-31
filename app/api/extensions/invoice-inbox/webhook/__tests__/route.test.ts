import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createQueuedMockSupabase, parseJsonResponse } from '@/tests/helpers'

// Mock server-only
vi.mock('server-only', () => ({}))

// Hoisted mocks to avoid reference-before-initialization
const { mockVerify, mockServiceClientFn } = vi.hoisted(() => {
  return {
    mockVerify: vi.fn(),
    mockServiceClientFn: vi.fn(),
  }
})

// Mock svix
vi.mock('svix', () => ({
  Webhook: class MockWebhook {
    verify = mockVerify
  },
}))

// Mock Supabase SSR
vi.mock('@supabase/ssr', () => ({
  createServerClient: (...args: unknown[]) => mockServiceClientFn(...args),
}))

// Mock email handler
vi.mock('@/extensions/general/invoice-inbox/lib/email-handler', () => ({
  parseInboundPayload: vi.fn(),
  extractAttachments: vi.fn(),
  resolveUserFromEmail: vi.fn(),
}))

// Mock unified document analyzer
vi.mock('@/lib/ai/document-analyzer', () => ({
  analyzeDocument: vi.fn(),
}))

// Mock supplier matcher
vi.mock('@/extensions/general/invoice-inbox/lib/supplier-matcher', () => ({
  matchSupplier: vi.fn(),
}))

// Mock receipt pipeline
vi.mock('@/extensions/general/receipt-ocr/lib/receipt-pipeline', () => ({
  processReceiptFromDocument: vi.fn(),
}))

import { POST } from '../route'
import { parseInboundPayload, extractAttachments, resolveUserFromEmail } from '@/extensions/general/invoice-inbox/lib/email-handler'

const mockParseInboundPayload = vi.mocked(parseInboundPayload)
const mockExtractAttachments = vi.mocked(extractAttachments)
const mockResolveUserFromEmail = vi.mocked(resolveUserFromEmail)

describe('Invoice Inbox Webhook Route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.RESEND_WEBHOOK_SECRET = 'test-secret'
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://localhost:54321'
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key'
  })

  function makeWebhookRequest(body: unknown = {}) {
    const bodyStr = JSON.stringify(body)
    return new Request('http://localhost:3000/api/extensions/invoice-inbox/webhook', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'svix-id': 'msg_test123',
        'svix-timestamp': String(Math.floor(Date.now() / 1000)),
        'svix-signature': 'v1,test-signature',
      },
      body: bodyStr,
    })
  }

  it('returns 400 when webhook headers are missing', async () => {
    const request = new Request('http://localhost:3000/api/extensions/invoice-inbox/webhook', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    })

    const response = await POST(request)
    const { status } = await parseJsonResponse(response)
    expect(status).toBe(400)
  })

  it('returns 401 when signature verification fails', async () => {
    mockVerify.mockImplementation(() => {
      throw new Error('Invalid signature')
    })

    const response = await POST(makeWebhookRequest({ from: 'test@test.com', to: 'inbox@co.com' }))
    const { status } = await parseJsonResponse(response)
    expect(status).toBe(401)
  })

  it('returns 400 when payload is invalid', async () => {
    mockVerify.mockReturnValue(undefined)
    mockParseInboundPayload.mockReturnValue(null)

    const response = await POST(makeWebhookRequest({}))
    const { status } = await parseJsonResponse(response)
    expect(status).toBe(400)
  })

  it('returns 404 when user not found for email', async () => {
    const { supabase } = createQueuedMockSupabase()
    mockServiceClientFn.mockReturnValue(supabase)

    mockVerify.mockReturnValue(undefined)
    mockParseInboundPayload.mockReturnValue({
      from: 'supplier@test.com',
      to: 'unknown@inbox.com',
      subject: 'Invoice',
      html: null,
      text: null,
      attachments: [],
      created_at: '2024-06-15T10:00:00Z',
    })
    mockResolveUserFromEmail.mockResolvedValue(null)

    const response = await POST(makeWebhookRequest({ from: 'supplier@test.com', to: 'unknown@inbox.com' }))
    const { status } = await parseJsonResponse(response)
    expect(status).toBe(404)
  })

  it('returns success with 0 processed when no attachments', async () => {
    const { supabase, enqueueMany } = createQueuedMockSupabase()
    mockServiceClientFn.mockReturnValue(supabase)

    mockVerify.mockReturnValue(undefined)
    mockParseInboundPayload.mockReturnValue({
      from: 'supplier@test.com',
      to: 'inbox@myco.com',
      subject: 'No attachments',
      html: null,
      text: null,
      attachments: [],
      created_at: '2024-06-15T10:00:00Z',
    })
    mockExtractAttachments.mockReturnValue([])
    mockResolveUserFromEmail.mockResolvedValue({ userId: 'user-1', companyId: 'company-1' })

    // Insert inbox item with error status
    enqueueMany([
      { data: { id: 'item-1' }, error: null },
    ])

    const response = await POST(makeWebhookRequest({ from: 'supplier@test.com', to: 'inbox@myco.com' }))
    const { status, body } = await parseJsonResponse<{ data: { processed: number } }>(response)

    expect(status).toBe(200)
    expect(body.data.processed).toBe(0)
  })
})
