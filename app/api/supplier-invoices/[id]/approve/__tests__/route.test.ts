import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  createMockRequest,
  parseJsonResponse,
  createMockRouteParams,
  createQueuedMockSupabase,
  makeSupplierInvoice,
} from '@/tests/helpers'

const { supabase: mockSupabase, enqueue, reset } = createQueuedMockSupabase()
vi.mock('@/lib/supabase/server', () => ({
  createClient: () => Promise.resolve(mockSupabase),
}))

import { POST } from '../route'

describe('POST /api/supplier-invoices/[id]/approve', () => {
  const mockUser = { id: 'user-1', email: 'test@test.se' }

  beforeEach(() => {
    vi.clearAllMocks()
    reset()
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: mockUser } })
  })

  it('returns 401 when not authenticated', async () => {
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: null } })

    const request = createMockRequest('/api/supplier-invoices/inv-1/approve', { method: 'POST' })
    const response = await POST(request, createMockRouteParams({ id: 'inv-1' }))
    const { status, body } = await parseJsonResponse(response)

    expect(status).toBe(401)
    expect(body).toEqual({ error: 'Unauthorized' })
  })

  it('returns 404 when invoice not found', async () => {
    enqueue({ data: null, error: null })

    const request = createMockRequest('/api/supplier-invoices/inv-1/approve', { method: 'POST' })
    const response = await POST(request, createMockRouteParams({ id: 'inv-1' }))
    const { status, body } = await parseJsonResponse<{ error: string }>(response)

    expect(status).toBe(404)
    expect(body.error).toBe('Not found')
  })

  it('returns 400 when invoice is not in registered status', async () => {
    enqueue({ data: { status: 'approved' }, error: null })

    const request = createMockRequest('/api/supplier-invoices/inv-1/approve', { method: 'POST' })
    const response = await POST(request, createMockRouteParams({ id: 'inv-1' }))
    const { status, body } = await parseJsonResponse<{ error: string }>(response)

    expect(status).toBe(400)
    expect(body.error).toBe('Kan bara godkänna registrerade fakturor')
  })

  it('approves registered invoice', async () => {
    const invoice = makeSupplierInvoice({ id: 'inv-1', status: 'registered' })
    const approvedInvoice = { ...invoice, status: 'approved' }

    // First call: fetch invoice status
    enqueue({ data: { status: 'registered' }, error: null })
    // Second call: update + select
    enqueue({ data: approvedInvoice, error: null })

    const request = createMockRequest('/api/supplier-invoices/inv-1/approve', { method: 'POST' })
    const response = await POST(request, createMockRouteParams({ id: 'inv-1' }))
    const { status, body } = await parseJsonResponse<{ data: unknown }>(response)

    expect(status).toBe(200)
    expect(body.data).toEqual(approvedInvoice)
  })
})
