import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createMockRequest, parseJsonResponse, createQueuedMockSupabase } from '@/tests/helpers'

const mockUser = { id: 'user-1', email: 'test@example.com' }

// Mock requireAuth
const mockRequireAuth = vi.fn()
vi.mock('@/lib/auth/require-auth', () => ({
  requireAuth: () => mockRequireAuth(),
}))

// Mock service client
const { supabase: mockAdminClient, enqueue: enqueueAdmin, reset: resetAdmin } = createQueuedMockSupabase()
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
  createServiceClient: () => Promise.resolve(mockAdminClient),
}))

// Mock token exchange
vi.mock('@/lib/connections/token-exchange', () => ({
  exchangeBrioxToken: vi.fn().mockResolvedValue({ access_token: 'briox-token', expires_in: 3600 }),
  getBjornLundenToken: vi.fn().mockResolvedValue({ access_token: 'bl-token', expires_in: 3600 }),
}))

import { GET, POST } from '../route'

describe('GET /api/connections', () => {
  const { supabase: mockSupabase, enqueue, reset } = createQueuedMockSupabase()

  beforeEach(() => {
    vi.clearAllMocks()
    reset()
    resetAdmin()
  })

  it('returns 401 when not authenticated', async () => {
    const { NextResponse } = await import('next/server')
    mockRequireAuth.mockResolvedValue({
      user: null,
      supabase: mockSupabase,
      error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    })

    const request = createMockRequest('/api/connections')
    const response = await GET()
    const { status, body } = await parseJsonResponse(response)

    expect(status).toBe(401)
    expect(body).toEqual({ error: 'Unauthorized' })
  })

  it('returns connections for authenticated user', async () => {
    const connections = [
      { id: 'conn-1', provider: 'fortnox', status: 'active' },
    ]

    mockRequireAuth.mockResolvedValue({
      user: mockUser,
      supabase: mockSupabase,
      error: null,
    })
    enqueue({ data: connections, error: null })

    const response = await GET()
    const { status, body } = await parseJsonResponse<{ data: unknown[] }>(response)

    expect(status).toBe(200)
    expect(body.data).toEqual(connections)
  })
})

describe('POST /api/connections', () => {
  const { supabase: mockSupabase, enqueue, reset } = createQueuedMockSupabase()

  beforeEach(() => {
    vi.clearAllMocks()
    reset()
    resetAdmin()
  })

  it('returns 401 when not authenticated', async () => {
    const { NextResponse } = await import('next/server')
    mockRequireAuth.mockResolvedValue({
      user: null,
      supabase: mockSupabase,
      error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    })

    const request = createMockRequest('/api/connections', {
      method: 'POST',
      body: { provider: 'bokio', api_key: 'key', company_id: 'cid' },
    })
    const response = await POST(request)
    const { status } = await parseJsonResponse(response)

    expect(status).toBe(401)
  })

  it('returns 400 for invalid body', async () => {
    mockRequireAuth.mockResolvedValue({
      user: mockUser,
      supabase: mockSupabase,
      error: null,
    })

    const request = createMockRequest('/api/connections', {
      method: 'POST',
      body: { provider: 'invalid' },
    })
    const response = await POST(request)
    const { status } = await parseJsonResponse(response)

    expect(status).toBe(400)
  })

  it('returns 409 when active connection exists', async () => {
    mockRequireAuth.mockResolvedValue({
      user: mockUser,
      supabase: mockSupabase,
      error: null,
    })

    // Existing connection found
    enqueue({ data: [{ id: 'existing' }], error: null })

    const request = createMockRequest('/api/connections', {
      method: 'POST',
      body: { provider: 'bokio', api_key: 'key', company_id: 'cid' },
    })
    const response = await POST(request)
    const { status } = await parseJsonResponse(response)

    expect(status).toBe(409)
  })

  it('creates connection successfully for bokio', async () => {
    mockRequireAuth.mockResolvedValue({
      user: mockUser,
      supabase: mockSupabase,
      error: null,
    })

    const createdConn = { id: 'conn-new', provider: 'bokio', status: 'active' }

    // No existing connection
    enqueue({ data: [], error: null })
    // Insert connection
    enqueue({ data: createdConn, error: null })
    // Insert token (admin)
    enqueueAdmin({ data: {}, error: null })

    const request = createMockRequest('/api/connections', {
      method: 'POST',
      body: { provider: 'bokio', api_key: 'test-key', company_id: 'test-cid' },
    })
    const response = await POST(request)
    const { status, body } = await parseJsonResponse<{ data: { id: string } }>(response)

    expect(status).toBe(201)
    expect(body.data.id).toBe('conn-new')
  })
})
