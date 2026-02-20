import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  createMockRequest,
  parseJsonResponse,
  createMockRouteParams,
  createQueuedMockSupabase,
  makeInvoice,
  makeCustomer,
} from '@/tests/helpers'

const { supabase: mockSupabase, enqueue, reset } = createQueuedMockSupabase()
vi.mock('@/lib/supabase/server', () => ({
  createClient: () => Promise.resolve(mockSupabase),
}))

const mockCreateInvoicePaymentJournalEntry = vi.fn()
const mockCreateInvoiceCashEntry = vi.fn()
vi.mock('@/lib/bookkeeping/invoice-entries', () => ({
  createInvoicePaymentJournalEntry: (...args: unknown[]) =>
    mockCreateInvoicePaymentJournalEntry(...args),
  createInvoiceCashEntry: (...args: unknown[]) =>
    mockCreateInvoiceCashEntry(...args),
}))

import { POST } from '../route'

describe('POST /api/invoices/[id]/mark-paid', () => {
  const mockUser = { id: 'user-1', email: 'test@test.se' }

  beforeEach(() => {
    vi.clearAllMocks()
    reset()
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: mockUser } })
  })

  it('returns 401 when not authenticated', async () => {
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: null } })

    const request = createMockRequest('/api/invoices/inv-1/mark-paid', { method: 'POST' })
    const response = await POST(request, createMockRouteParams({ id: 'inv-1' }))
    const { status, body } = await parseJsonResponse(response)

    expect(status).toBe(401)
    expect(body).toEqual({ error: 'Unauthorized' })
  })

  it('returns 404 when invoice not found', async () => {
    enqueue({ data: null, error: { message: 'Not found' } })

    const request = createMockRequest('/api/invoices/inv-1/mark-paid', { method: 'POST' })
    const response = await POST(request, createMockRouteParams({ id: 'inv-1' }))
    const { status, body } = await parseJsonResponse<{ error: string }>(response)

    expect(status).toBe(404)
    expect(body.error).toBe('Fakturan hittades inte')
  })

  it('returns 400 when invoice is in draft status', async () => {
    const invoice = makeInvoice({ status: 'draft' })
    enqueue({ data: invoice, error: null })

    const request = createMockRequest('/api/invoices/inv-1/mark-paid', { method: 'POST' })
    const response = await POST(request, createMockRouteParams({ id: 'inv-1' }))
    const { status, body } = await parseJsonResponse<{ error: string }>(response)

    expect(status).toBe(400)
    expect(body.error).toBe('Fakturan kan inte markeras som betald i nuvarande status')
  })

  it('returns 400 when invoice is already paid', async () => {
    const invoice = makeInvoice({ status: 'paid' })
    enqueue({ data: invoice, error: null })

    const request = createMockRequest('/api/invoices/inv-1/mark-paid', { method: 'POST' })
    const response = await POST(request, createMockRouteParams({ id: 'inv-1' }))
    const { status, body } = await parseJsonResponse<{ error: string }>(response)

    expect(status).toBe(400)
    expect(body.error).toBe('Fakturan kan inte markeras som betald i nuvarande status')
  })

  it('returns 400 when invoice is credited', async () => {
    const invoice = makeInvoice({ status: 'credited' })
    enqueue({ data: invoice, error: null })

    const request = createMockRequest('/api/invoices/inv-1/mark-paid', { method: 'POST' })
    const response = await POST(request, createMockRouteParams({ id: 'inv-1' }))
    const { status, body } = await parseJsonResponse<{ error: string }>(response)

    expect(status).toBe(400)
  })

  it('marks sent invoice as paid with accrual method', async () => {
    const customer = makeCustomer()
    const invoice = makeInvoice({
      id: 'inv-1',
      status: 'sent',
      total: 12500,
      customer,
    })

    // Fetch invoice
    enqueue({ data: invoice, error: null })
    // Update invoice status
    enqueue({ data: null, error: null })
    // Fetch company settings
    enqueue({ data: { accounting_method: 'accrual', entity_type: 'enskild_firma' }, error: null })

    mockCreateInvoicePaymentJournalEntry.mockResolvedValue({ id: 'je-1' })

    const request = createMockRequest('/api/invoices/inv-1/mark-paid', { method: 'POST' })
    const response = await POST(request, createMockRouteParams({ id: 'inv-1' }))
    const { status, body } = await parseJsonResponse<{
      success: boolean
      status: string
      paid_amount: number
      journal_entry_id: string | null
    }>(response)

    expect(status).toBe(200)
    expect(body.success).toBe(true)
    expect(body.status).toBe('paid')
    expect(body.paid_amount).toBe(12500)
    expect(body.journal_entry_id).toBe('je-1')
    expect(mockCreateInvoicePaymentJournalEntry).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({ id: 'inv-1' }),
      expect.any(String)
    )
  })

  it('marks overdue invoice as paid with cash method', async () => {
    const customer = makeCustomer()
    const invoice = makeInvoice({
      id: 'inv-1',
      status: 'overdue',
      total: 12500,
      customer,
    })

    enqueue({ data: invoice, error: null })
    enqueue({ data: null, error: null })
    enqueue({ data: { accounting_method: 'cash', entity_type: 'enskild_firma' }, error: null })

    mockCreateInvoiceCashEntry.mockResolvedValue({ id: 'je-2' })

    const request = createMockRequest('/api/invoices/inv-1/mark-paid', { method: 'POST' })
    const response = await POST(request, createMockRouteParams({ id: 'inv-1' }))
    const { status, body } = await parseJsonResponse<{
      success: boolean
      journal_entry_id: string | null
    }>(response)

    expect(status).toBe(200)
    expect(body.success).toBe(true)
    expect(body.journal_entry_id).toBe('je-2')
    expect(mockCreateInvoiceCashEntry).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({ id: 'inv-1' }),
      expect.any(String),
      'enskild_firma'
    )
  })

  it('returns success with null journal_entry_id when journal entry creation fails', async () => {
    const invoice = makeInvoice({ id: 'inv-1', status: 'sent', total: 12500 })

    enqueue({ data: invoice, error: null })
    enqueue({ data: null, error: null })
    enqueue({ data: { accounting_method: 'accrual', entity_type: 'enskild_firma' }, error: null })

    mockCreateInvoicePaymentJournalEntry.mockRejectedValue(new Error('Period locked'))

    const request = createMockRequest('/api/invoices/inv-1/mark-paid', { method: 'POST' })
    const response = await POST(request, createMockRouteParams({ id: 'inv-1' }))
    const { status, body } = await parseJsonResponse<{
      success: boolean
      journal_entry_id: string | null
    }>(response)

    expect(status).toBe(200)
    expect(body.success).toBe(true)
    expect(body.journal_entry_id).toBeNull()
  })
})
