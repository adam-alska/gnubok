import { createQueuedMockSupabase, createMockRequest, parseJsonResponse, createMockRouteParams } from '@/tests/helpers'

const mockRequireAuth = vi.fn()
vi.mock('@/lib/auth/require-auth', () => ({
  requireAuth: () => mockRequireAuth(),
}))

const { supabase: mockSupabase, enqueue, reset } = createQueuedMockSupabase()
const { supabase: mockAdminClient, enqueue: enqueueAdmin, reset: resetAdmin } = createQueuedMockSupabase()

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
  createServiceClient: () => Promise.resolve(mockAdminClient),
}))

vi.mock('@/lib/connections/fortnox-sync-orchestrator', () => ({
  syncFortnoxData: vi.fn().mockResolvedValue({
    success: true,
    results: [
      {
        dataTypeId: 'customers',
        name: 'Kunder',
        success: true,
        created: 5,
        updated: 2,
        skipped: 0,
        errors: [],
        durationMs: 1200,
      },
    ],
    scopeMismatch: null,
    totalDurationMs: 1200,
    errors: [],
  }),
}))

import { POST } from '../route'
import { syncFortnoxData } from '@/lib/connections/fortnox-sync-orchestrator'

const mockUser = { id: 'user-123', email: 'test@example.com' }

function postRequest(body: unknown) {
  return createMockRequest('/api/connections/conn-1/sync-data', {
    method: 'POST',
    body,
  })
}

describe('POST /api/connections/[id]/sync-data', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    reset()
    resetAdmin()
    mockRequireAuth.mockResolvedValue({ user: mockUser, supabase: mockSupabase })
  })

  it('returns 401 when not authenticated', async () => {
    const { NextResponse } = await import('next/server')
    mockRequireAuth.mockResolvedValue({
      error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    })

    const request = postRequest({ dataTypeIds: ['customers'] })
    const params = createMockRouteParams({ id: 'conn-1' })
    const response = await POST(request, { params })
    const { status } = await parseJsonResponse(response)

    expect(status).toBe(401)
  })

  it('returns 400 for missing dataTypeIds', async () => {
    const request = postRequest({ financialYear: 1 })
    const params = createMockRouteParams({ id: 'conn-1' })
    const response = await POST(request, { params })
    const { status } = await parseJsonResponse(response)

    expect(status).toBe(400)
  })

  it('returns 404 when connection not found', async () => {
    enqueue({ data: null, error: { code: 'PGRST116', message: 'not found' } })

    const request = postRequest({ dataTypeIds: ['customers'] })
    const params = createMockRouteParams({ id: 'nonexistent' })
    const response = await POST(request, { params })
    const { status, body } = await parseJsonResponse(response)

    expect(status).toBe(404)
    expect(body.error).toBe('Connection not found')
  })

  it('returns 400 when connection is not active', async () => {
    enqueue({ data: { id: 'conn-1', provider: 'fortnox', status: 'expired' }, error: null })

    const request = postRequest({ dataTypeIds: ['customers'] })
    const params = createMockRouteParams({ id: 'conn-1' })
    const response = await POST(request, { params })
    const { status, body } = await parseJsonResponse(response)

    expect(status).toBe(400)
    expect(body.error).toBe('Connection is not active')
  })

  it('returns 400 for non-Fortnox provider', async () => {
    enqueue({ data: { id: 'conn-1', provider: 'visma', status: 'active' }, error: null })

    const request = postRequest({ dataTypeIds: ['customers'] })
    const params = createMockRouteParams({ id: 'conn-1' })
    const response = await POST(request, { params })
    const { status, body } = await parseJsonResponse(response)

    expect(status).toBe(400)
    expect(body.error).toBe('Data sync is only supported for Fortnox')
  })

  it('calls syncFortnoxData with correct params on success', async () => {
    enqueue({ data: { id: 'conn-1', provider: 'fortnox', status: 'active' }, error: null })

    const request = postRequest({
      dataTypeIds: ['customers', 'sie4'],
      financialYear: 2,
    })
    const params = createMockRouteParams({ id: 'conn-1' })
    const response = await POST(request, { params })
    const { status, body } = await parseJsonResponse(response)

    expect(status).toBe(200)
    expect(body.data.success).toBe(true)
    expect(body.data.results).toHaveLength(1)

    expect(syncFortnoxData).toHaveBeenCalledWith(
      mockSupabase,
      mockAdminClient,
      'user-123',
      'conn-1',
      ['customers', 'sie4'],
      2
    )
  })

  it('passes undefined financialYear when not provided', async () => {
    enqueue({ data: { id: 'conn-1', provider: 'fortnox', status: 'active' }, error: null })

    const request = postRequest({ dataTypeIds: ['customers'] })
    const params = createMockRouteParams({ id: 'conn-1' })
    await POST(request, { params })

    expect(syncFortnoxData).toHaveBeenCalledWith(
      mockSupabase,
      mockAdminClient,
      'user-123',
      'conn-1',
      ['customers'],
      undefined
    )
  })
})
