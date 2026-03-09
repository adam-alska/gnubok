import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createMockRequest, parseJsonResponse, createQueuedMockSupabase, createMockRouteParams } from '@/tests/helpers'

const mockUser = { id: 'user-1', email: 'test@example.com' }

const mockRequireAuth = vi.fn()
vi.mock('@/lib/auth/require-auth', () => ({
  requireAuth: () => mockRequireAuth(),
}))

const { supabase: mockAdminClient, enqueue: enqueueAdmin, reset: resetAdmin } = createQueuedMockSupabase()
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
  createServiceClient: () => Promise.resolve(mockAdminClient),
}))

import { DELETE } from '../route'

describe('DELETE /api/connections/[id]', () => {
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

    const request = createMockRequest('/api/connections/conn-1', { method: 'DELETE' })
    const response = await DELETE(request, createMockRouteParams({ id: 'conn-1' }))
    const { status } = await parseJsonResponse(response)

    expect(status).toBe(401)
  })

  it('returns 404 when connection not found', async () => {
    mockRequireAuth.mockResolvedValue({
      user: mockUser,
      supabase: mockSupabase,
      error: null,
    })

    enqueue({ data: null, error: { message: 'Not found' } })

    const request = createMockRequest('/api/connections/conn-1', { method: 'DELETE' })
    const response = await DELETE(request, createMockRouteParams({ id: 'conn-1' }))
    const { status } = await parseJsonResponse(response)

    expect(status).toBe(404)
  })

  it('disconnects successfully', async () => {
    mockRequireAuth.mockResolvedValue({
      user: mockUser,
      supabase: mockSupabase,
      error: null,
    })

    // Connection found
    enqueue({ data: { id: 'conn-1', user_id: 'user-1' }, error: null })
    // Delete tokens (admin)
    enqueueAdmin({ data: null, error: null })
    // Update status to revoked
    enqueue({ data: null, error: null })

    const request = createMockRequest('/api/connections/conn-1', { method: 'DELETE' })
    const response = await DELETE(request, createMockRouteParams({ id: 'conn-1' }))
    const { status, body } = await parseJsonResponse<{ data: { success: boolean } }>(response)

    expect(status).toBe(200)
    expect(body.data.success).toBe(true)
  })
})
