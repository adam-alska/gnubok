import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  createMockRequest,
  parseJsonResponse,
  createMockRouteParams,
  createQueuedMockSupabase,
  makeTransaction,
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
  createInvoicePaymentJournalEntry: (...args: unknown[]) => mockCreateInvoicePaymentJournalEntry(...args),
  createInvoiceCashEntry: (...args: unknown[]) => mockCreateInvoiceCashEntry(...args),
  getRevenueAccount: vi.fn().mockReturnValue('3001'),
  getOutputVatAccount: vi.fn().mockReturnValue('2611'),
}))

import { POST } from '../route'

const VALID_UUID = '550e8400-e29b-41d4-a716-446655440000'
const VALID_UUID_2 = '550e8400-e29b-41d4-a716-446655440001'

describe('POST /api/transactions/[id]/match-invoice', () => {
  const mockUser = { id: 'user-1', email: 'test@test.se' }

  beforeEach(() => {
    vi.clearAllMocks()
    reset()
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: mockUser } })
  })

  it('returns 401 when not authenticated', async () => {
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: null } })

    const request = createMockRequest('/api/transactions/tx-1/match-invoice', {
      method: 'POST',
      body: { invoice_id: VALID_UUID },
    })
    const response = await POST(request, createMockRouteParams({ id: 'tx-1' }))
    const { status, body } = await parseJsonResponse(response)

    expect(status).toBe(401)
    expect(body).toEqual({ error: 'Unauthorized' })
  })

  it('returns 400 when invoice_id is missing', async () => {
    const request = createMockRequest('/api/transactions/tx-1/match-invoice', {
      method: 'POST',
      body: {},
    })
    const response = await POST(request, createMockRouteParams({ id: 'tx-1' }))
    const { status, body } = await parseJsonResponse<{ error: string }>(response)

    expect(status).toBe(400)
    expect(body.error).toBe('Validation failed')
  })

  it('returns 404 when transaction not found', async () => {
    enqueue({ data: null, error: { message: 'Not found' } })

    const request = createMockRequest('/api/transactions/tx-999/match-invoice', {
      method: 'POST',
      body: { invoice_id: VALID_UUID },
    })
    const response = await POST(request, createMockRouteParams({ id: 'tx-999' }))
    const { status, body } = await parseJsonResponse<{ error: string }>(response)

    expect(status).toBe(404)
    expect(body.error).toBe('Transaction not found')
  })

  it('returns 400 when transaction is an expense (amount <= 0)', async () => {
    const tx = makeTransaction({ id: 'tx-1', amount: -500 })
    enqueue({ data: tx, error: null })

    const request = createMockRequest('/api/transactions/tx-1/match-invoice', {
      method: 'POST',
      body: { invoice_id: VALID_UUID },
    })
    const response = await POST(request, createMockRouteParams({ id: 'tx-1' }))
    const { status, body } = await parseJsonResponse<{ error: string }>(response)

    expect(status).toBe(400)
    expect(body.error).toBe('Only income transactions can be matched to invoices')
  })

  it('returns 400 when transaction is already linked to an invoice', async () => {
    const tx = makeTransaction({ id: 'tx-1', amount: 12500, invoice_id: 'inv-other' })
    enqueue({ data: tx, error: null })

    const request = createMockRequest('/api/transactions/tx-1/match-invoice', {
      method: 'POST',
      body: { invoice_id: VALID_UUID },
    })
    const response = await POST(request, createMockRouteParams({ id: 'tx-1' }))
    const { status, body } = await parseJsonResponse<{ error: string }>(response)

    expect(status).toBe(400)
    expect(body.error).toBe('Transaction is already linked to an invoice')
  })

  it('returns 404 when invoice not found', async () => {
    const tx = makeTransaction({ id: 'tx-1', amount: 12500, invoice_id: null })
    enqueue({ data: tx, error: null })
    enqueue({ data: null, error: { message: 'Not found' } })

    const request = createMockRequest('/api/transactions/tx-1/match-invoice', {
      method: 'POST',
      body: { invoice_id: VALID_UUID_2 },
    })
    const response = await POST(request, createMockRouteParams({ id: 'tx-1' }))
    const { status, body } = await parseJsonResponse<{ error: string }>(response)

    expect(status).toBe(404)
    expect(body.error).toBe('Invoice not found')
  })

  it('returns 400 when invoice is not in unpaid state', async () => {
    const tx = makeTransaction({ id: 'tx-1', amount: 12500, invoice_id: null })
    const invoice = makeInvoice({ id: VALID_UUID, status: 'paid' })
    enqueue({ data: tx, error: null })
    enqueue({ data: invoice, error: null })

    const request = createMockRequest('/api/transactions/tx-1/match-invoice', {
      method: 'POST',
      body: { invoice_id: VALID_UUID },
    })
    const response = await POST(request, createMockRouteParams({ id: 'tx-1' }))
    const { status, body } = await parseJsonResponse<{ error: string }>(response)

    expect(status).toBe(400)
    expect(body.error).toBe('Invoice is not in an unpaid state')
  })

  it('matches transaction to invoice with accrual method', async () => {
    const tx = makeTransaction({ id: 'tx-1', amount: 12500, invoice_id: null, date: '2024-06-15' })
    const customer = makeCustomer()
    const invoice = makeInvoice({
      id: VALID_UUID,
      status: 'sent',
      total: 12500,
      subtotal: 10000,
      vat_amount: 2500,
      invoice_number: 'F-2024001',
      customer,
    })

    // Fetch transaction
    enqueue({ data: tx, error: null })
    // Fetch invoice
    enqueue({ data: invoice, error: null })
    // Fetch company settings
    enqueue({ data: { accounting_method: 'accrual', entity_type: 'enskild_firma' }, error: null })

    mockCreateInvoicePaymentJournalEntry.mockResolvedValue({ id: 'je-1' })

    // Update invoice to paid
    enqueue({ data: null, error: null })
    // Update transaction
    enqueue({ data: null, error: null })

    const request = createMockRequest('/api/transactions/tx-1/match-invoice', {
      method: 'POST',
      body: { invoice_id: VALID_UUID },
    })
    const response = await POST(request, createMockRouteParams({ id: 'tx-1' }))
    const { status, body } = await parseJsonResponse<{
      success: boolean
      invoice_status: string
      paid_amount: number
      journal_entry_id: string
    }>(response)

    expect(status).toBe(200)
    expect(body.success).toBe(true)
    expect(body.invoice_status).toBe('paid')
    expect(body.paid_amount).toBe(12500)
    expect(body.journal_entry_id).toBe('je-1')

    // Verify accrual payment entry was called
    expect(mockCreateInvoicePaymentJournalEntry).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({ id: VALID_UUID }),
      '2024-06-15'
    )
  })

  it('returns success with journal_entry_error when journal entry fails (non-blocking)', async () => {
    const tx = makeTransaction({ id: 'tx-1', amount: 12500, invoice_id: null, date: '2024-06-15' })
    const invoice = makeInvoice({ id: VALID_UUID, status: 'sent', total: 12500 })

    enqueue({ data: tx, error: null })
    enqueue({ data: invoice, error: null })
    enqueue({ data: { accounting_method: 'accrual', entity_type: 'enskild_firma' }, error: null })

    mockCreateInvoicePaymentJournalEntry.mockRejectedValue(new Error('Period locked'))

    // Update invoice
    enqueue({ data: null, error: null })
    // Update transaction
    enqueue({ data: null, error: null })

    const request = createMockRequest('/api/transactions/tx-1/match-invoice', {
      method: 'POST',
      body: { invoice_id: VALID_UUID },
    })
    const response = await POST(request, createMockRouteParams({ id: 'tx-1' }))
    const { status, body } = await parseJsonResponse<{
      success: boolean
      journal_entry_id: null
      journal_entry_error: string
    }>(response)

    expect(status).toBe(200)
    expect(body.success).toBe(true)
    expect(body.journal_entry_id).toBeNull()
    expect(body.journal_entry_error).toBe('Period locked')
  })
})
