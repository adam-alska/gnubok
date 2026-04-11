import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  parseJsonResponse,
  createMockRouteParams,
  createQueuedMockSupabase,
  makeTransaction,
} from '@/tests/helpers'

const { supabase: mockSupabase, enqueue, reset } = createQueuedMockSupabase()
vi.mock('@/lib/supabase/server', () => ({
  createClient: () => Promise.resolve(mockSupabase),
}))

vi.mock('@/lib/company/context', () => ({
  requireCompanyId: vi.fn().mockResolvedValue('company-1'),
  getActiveCompanyId: vi.fn().mockResolvedValue('company-1'),
}))

vi.mock('@/lib/auth/require-write', () => ({
  requireWritePermission: vi.fn().mockResolvedValue({ ok: true }),
}))

import { DELETE } from '../route'

describe('DELETE /api/transactions/[id]', () => {
  const mockUser = { id: 'user-1', email: 'test@test.se' }

  beforeEach(() => {
    vi.clearAllMocks()
    reset()
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: mockUser } })
  })

  it('returns 401 when not authenticated', async () => {
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: null } })

    const request = new Request('http://localhost/api/transactions/tx-1', { method: 'DELETE' })
    const response = await DELETE(request, createMockRouteParams({ id: 'tx-1' }))
    const { status, body } = await parseJsonResponse(response)

    expect(status).toBe(401)
    expect(body).toEqual({ error: 'Unauthorized' })
  })

  it('returns 404 when transaction not found', async () => {
    enqueue({ data: null, error: { message: 'Not found' } })

    const request = new Request('http://localhost/api/transactions/tx-1', { method: 'DELETE' })
    const response = await DELETE(request, createMockRouteParams({ id: 'tx-1' }))
    const { status, body } = await parseJsonResponse(response)

    expect(status).toBe(404)
    expect(body).toEqual({ error: 'Transaction not found' })
  })

  it('returns 409 when transaction has a journal entry', async () => {
    const tx = makeTransaction({ journal_entry_id: 'je-1', bank_connection_id: null, import_source: null })
    enqueue({ data: tx, error: null })

    const request = new Request('http://localhost/api/transactions/tx-1', { method: 'DELETE' })
    const response = await DELETE(request, createMockRouteParams({ id: 'tx-1' }))
    const { status, body } = await parseJsonResponse<{ error: string }>(response)

    expect(status).toBe(409)
    expect(body.error).toContain('booked')
  })

  it('allows deleting unbooked bank-synced transactions', async () => {
    const tx = makeTransaction({ bank_connection_id: 'bc-1', journal_entry_id: null, import_source: null })
    enqueue({ data: tx, error: null }) // fetch
    enqueue({ data: null, error: null }) // delete

    const request = new Request('http://localhost/api/transactions/tx-1', { method: 'DELETE' })
    const response = await DELETE(request, createMockRouteParams({ id: 'tx-1' }))
    const { status, body } = await parseJsonResponse(response)

    expect(status).toBe(200)
    expect(body).toEqual({ success: true })
  })

  it('allows deleting unbooked imported transactions', async () => {
    const tx = makeTransaction({ import_source: 'csv_nordea', journal_entry_id: null, bank_connection_id: null })
    enqueue({ data: tx, error: null }) // fetch
    enqueue({ data: null, error: null }) // delete

    const request = new Request('http://localhost/api/transactions/tx-1', { method: 'DELETE' })
    const response = await DELETE(request, createMockRouteParams({ id: 'tx-1' }))
    const { status, body } = await parseJsonResponse(response)

    expect(status).toBe(200)
    expect(body).toEqual({ success: true })
  })

  it('deletes a manually added unbooked transaction', async () => {
    const tx = makeTransaction({ journal_entry_id: null, bank_connection_id: null, import_source: null })
    enqueue({ data: tx, error: null }) // fetch
    enqueue({ data: null, error: null }) // delete

    const request = new Request('http://localhost/api/transactions/tx-1', { method: 'DELETE' })
    const response = await DELETE(request, createMockRouteParams({ id: 'tx-1' }))
    const { status, body } = await parseJsonResponse(response)

    expect(status).toBe(200)
    expect(body).toEqual({ success: true })
  })

  it('returns 500 when deletion fails', async () => {
    const tx = makeTransaction({ journal_entry_id: null, bank_connection_id: null, import_source: null })
    enqueue({ data: tx, error: null }) // fetch
    enqueue({ data: null, error: { message: 'DB error' } }) // delete fails

    const request = new Request('http://localhost/api/transactions/tx-1', { method: 'DELETE' })
    const response = await DELETE(request, createMockRouteParams({ id: 'tx-1' }))
    const { status, body } = await parseJsonResponse(response)

    expect(status).toBe(500)
    expect(body).toEqual({ error: 'Failed to delete transaction' })
  })
})
