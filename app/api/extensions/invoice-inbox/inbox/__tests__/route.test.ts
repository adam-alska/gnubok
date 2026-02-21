import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createQueuedMockSupabase, createMockRequest, parseJsonResponse, makeInvoiceInboxItem } from '@/tests/helpers'

// Mock dependencies
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}))

vi.mock('@/lib/init', () => ({
  ensureInitialized: vi.fn(),
}))

vi.mock('@/lib/events/bus', () => ({
  eventBus: { emit: vi.fn().mockResolvedValue(undefined), clear: vi.fn() },
}))

vi.mock('server-only', () => ({}))

vi.mock('@/extensions/general/invoice-inbox/lib/invoice-analyzer', () => ({
  analyzeInvoice: vi.fn(),
}))

vi.mock('@/extensions/general/invoice-inbox/lib/supplier-matcher', () => ({
  matchSupplier: vi.fn(),
}))

vi.mock('@/extensions/general/invoice-inbox', () => ({
  getSettings: vi.fn().mockResolvedValue({
    autoProcessEnabled: true,
    autoMatchSupplierEnabled: true,
    supplierMatchThreshold: 0.7,
    inboxEmail: null,
  }),
}))

import { createClient } from '@/lib/supabase/server'
import { GET } from '../route'

const mockCreateClient = vi.mocked(createClient)

describe('Invoice Inbox Routes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('GET /api/extensions/invoice-inbox/inbox', () => {
    it('returns 401 when not authenticated', async () => {
      const { supabase } = createQueuedMockSupabase()
      supabase.auth.getUser.mockResolvedValue({
        data: { user: null },
        error: { message: 'Not authenticated' },
      })
      mockCreateClient.mockResolvedValue(supabase as never)

      const request = createMockRequest('/api/extensions/invoice-inbox/inbox')
      const response = await GET(request)
      const { status } = await parseJsonResponse(response)

      expect(status).toBe(401)
    })

    it('returns inbox items for authenticated user', async () => {
      const items = [
        makeInvoiceInboxItem({ id: 'item-1', status: 'ready' }),
        makeInvoiceInboxItem({ id: 'item-2', status: 'pending' }),
      ]

      const { supabase, enqueueMany } = createQueuedMockSupabase()
      supabase.auth.getUser.mockResolvedValue({
        data: { user: { id: 'user-1' } },
        error: null,
      })
      enqueueMany([
        { data: items, error: null },
      ])
      mockCreateClient.mockResolvedValue(supabase as never)

      const request = createMockRequest('/api/extensions/invoice-inbox/inbox')
      const response = await GET(request)
      const { status, body } = await parseJsonResponse<{ data: unknown[] }>(response)

      expect(status).toBe(200)
      expect(body.data).toHaveLength(2)
    })

    it('filters by status when provided', async () => {
      const { supabase, enqueueMany } = createQueuedMockSupabase()
      supabase.auth.getUser.mockResolvedValue({
        data: { user: { id: 'user-1' } },
        error: null,
      })
      enqueueMany([
        { data: [makeInvoiceInboxItem({ status: 'ready' })], error: null },
      ])
      mockCreateClient.mockResolvedValue(supabase as never)

      const request = createMockRequest('/api/extensions/invoice-inbox/inbox', {
        searchParams: { status: 'ready' },
      })
      const response = await GET(request)
      const { status } = await parseJsonResponse(response)

      expect(status).toBe(200)
    })

    it('returns 500 on database error', async () => {
      const { supabase, enqueueMany } = createQueuedMockSupabase()
      supabase.auth.getUser.mockResolvedValue({
        data: { user: { id: 'user-1' } },
        error: null,
      })
      enqueueMany([
        { data: null, error: { message: 'Database error' } },
      ])
      mockCreateClient.mockResolvedValue(supabase as never)

      const request = createMockRequest('/api/extensions/invoice-inbox/inbox')
      const response = await GET(request)
      const { status } = await parseJsonResponse(response)

      expect(status).toBe(500)
    })
  })
})
