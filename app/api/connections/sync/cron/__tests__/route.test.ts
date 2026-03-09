import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createMockRequest, parseJsonResponse, createQueuedMockSupabase } from '@/tests/helpers'

const { supabase: mockAdminClient, enqueue, reset } = createQueuedMockSupabase()

vi.mock('@supabase/ssr', () => ({
  createServerClient: () => mockAdminClient,
}))

vi.mock('@/lib/connections/sync', () => ({
  syncProviderConnection: vi.fn().mockResolvedValue({ success: true }),
}))

import { GET } from '../route'

describe('GET /api/connections/sync/cron', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    reset()
    vi.stubEnv('CRON_SECRET', 'test-secret')
  })

  it('returns 401 without valid cron secret', async () => {
    const request = createMockRequest('/api/connections/sync/cron')
    const response = await GET(request)
    const { status } = await parseJsonResponse(response)

    expect(status).toBe(401)
  })

  it('returns 401 with wrong secret', async () => {
    const request = new Request('http://localhost:3000/api/connections/sync/cron', {
      headers: { authorization: 'Bearer wrong-secret' },
    })
    const response = await GET(request)
    const { status } = await parseJsonResponse(response)

    expect(status).toBe(401)
  })

  it('returns summary when no connections exist', async () => {
    enqueue({ data: [], error: null })

    const request = new Request('http://localhost:3000/api/connections/sync/cron', {
      headers: { authorization: 'Bearer test-secret' },
    })
    const response = await GET(request)
    const { status, body } = await parseJsonResponse<{ data: { synced: number; failed: number } }>(response)

    expect(status).toBe(200)
    expect(body.data.synced).toBe(0)
    expect(body.data.failed).toBe(0)
  })

  it('syncs active connections', async () => {
    enqueue({
      data: [
        { id: 'conn-1', provider: 'fortnox' },
        { id: 'conn-2', provider: 'visma' },
      ],
      error: null,
    })

    const request = new Request('http://localhost:3000/api/connections/sync/cron', {
      headers: { authorization: 'Bearer test-secret' },
    })
    const response = await GET(request)
    const { status, body } = await parseJsonResponse<{ data: { synced: number; total: number } }>(response)

    expect(status).toBe(200)
    expect(body.data.synced).toBe(2)
    expect(body.data.total).toBe(2)
  })
})
