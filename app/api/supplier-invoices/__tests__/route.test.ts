import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  createMockRequest,
  parseJsonResponse,
  createQueuedMockSupabase,
  makeSupplierInvoice,
  makeSupplier,
} from '@/tests/helpers'

const { supabase: mockSupabase, enqueue, reset } = createQueuedMockSupabase()
vi.mock('@/lib/supabase/server', () => ({
  createClient: () => Promise.resolve(mockSupabase),
}))

vi.mock('@/lib/init', () => ({
  ensureInitialized: vi.fn(),
}))

const mockFindFiscalPeriod = vi.fn()
vi.mock('@/lib/bookkeeping/engine', () => ({
  findFiscalPeriod: (...args: unknown[]) => mockFindFiscalPeriod(...args),
}))

const mockCreateSupplierInvoiceRegistrationEntry = vi.fn()
vi.mock('@/lib/bookkeeping/supplier-invoice-entries', () => ({
  createSupplierInvoiceRegistrationEntry: (...args: unknown[]) =>
    mockCreateSupplierInvoiceRegistrationEntry(...args),
}))

import { eventBus } from '@/lib/events'

import { GET, POST } from '../route'

describe('GET /api/supplier-invoices', () => {
  const mockUser = { id: 'user-1', email: 'test@test.se' }

  beforeEach(() => {
    vi.clearAllMocks()
    reset()
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: mockUser } })
  })

  it('returns 401 when not authenticated', async () => {
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: null } })

    const request = createMockRequest('/api/supplier-invoices')
    const response = await GET(request)
    const { status, body } = await parseJsonResponse(response)

    expect(status).toBe(401)
    expect(body).toEqual({ error: 'Unauthorized' })
  })

  it('returns supplier invoices list', async () => {
    const invoices = [makeSupplierInvoice(), makeSupplierInvoice()]
    enqueue({ data: invoices, error: null })

    const request = createMockRequest('/api/supplier-invoices')
    const response = await GET(request)
    const { status, body } = await parseJsonResponse<{ data: unknown[] }>(response)

    expect(status).toBe(200)
    expect(body.data).toEqual(invoices)
  })

  it('applies status filter', async () => {
    enqueue({ data: [], error: null })

    const request = createMockRequest('/api/supplier-invoices', {
      searchParams: { status: 'registered' },
    })
    const response = await GET(request)
    const { status } = await parseJsonResponse(response)

    expect(status).toBe(200)
    expect(mockSupabase.from).toHaveBeenCalledWith('supplier_invoices')
  })

  it('handles to_pay virtual status', async () => {
    enqueue({ data: [], error: null })

    const request = createMockRequest('/api/supplier-invoices', {
      searchParams: { status: 'to_pay' },
    })
    const response = await GET(request)
    const { status } = await parseJsonResponse(response)

    expect(status).toBe(200)
  })

  it('returns 500 on database error', async () => {
    enqueue({ data: null, error: { message: 'DB error' } })

    const request = createMockRequest('/api/supplier-invoices')
    const response = await GET(request)
    const { status, body } = await parseJsonResponse<{ error: string }>(response)

    expect(status).toBe(500)
    expect(body.error).toBe('DB error')
  })
})

const VALID_UUID = '550e8400-e29b-41d4-a716-446655440000'
const VALID_UUID_2 = '550e8400-e29b-41d4-a716-446655440001'

describe('POST /api/supplier-invoices', () => {
  const mockUser = { id: 'user-1', email: 'test@test.se' }

  beforeEach(() => {
    vi.clearAllMocks()
    reset()
    eventBus.clear()
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: mockUser } })
  })

  it('returns 401 when not authenticated', async () => {
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: null } })

    const request = createMockRequest('/api/supplier-invoices', {
      method: 'POST',
      body: { supplier_id: VALID_UUID, items: [] },
    })
    const response = await POST(request)
    const { status, body } = await parseJsonResponse(response)

    expect(status).toBe(401)
    expect(body).toEqual({ error: 'Unauthorized' })
  })

  it('returns 404 when supplier not found', async () => {
    enqueue({ data: null, error: { message: 'Not found' } })

    const request = createMockRequest('/api/supplier-invoices', {
      method: 'POST',
      body: {
        supplier_id: VALID_UUID_2,
        supplier_invoice_number: 'LF-001',
        invoice_date: '2024-06-01',
        due_date: '2024-07-01',
        items: [{ description: 'Material', quantity: 1, unit_price: 8000, account_number: '4010' }],
      },
    })
    const response = await POST(request)
    const { status, body } = await parseJsonResponse<{ error: string }>(response)

    expect(status).toBe(404)
    expect(body.error).toBe('Supplier not found')
  })

  it('creates supplier invoice with items and arrival number', async () => {
    const supplier = makeSupplier({ id: VALID_UUID })
    const createdInvoice = makeSupplierInvoice({ id: 'si-1' })

    // Fetch supplier
    enqueue({ data: supplier, error: null })
    // RPC get_next_arrival_number
    enqueue({ data: 5 })
    // Insert invoice
    enqueue({ data: createdInvoice, error: null })
    // Insert items
    enqueue({ data: null, error: null })
    // Fetch company settings
    enqueue({ data: { accounting_method: 'accrual' }, error: null })

    mockCreateSupplierInvoiceRegistrationEntry.mockResolvedValue({ id: 'je-1' })
    // Update invoice with registration_journal_entry_id
    enqueue({ data: null, error: null })

    const request = createMockRequest('/api/supplier-invoices', {
      method: 'POST',
      body: {
        supplier_id: VALID_UUID,
        supplier_invoice_number: 'LF-001',
        invoice_date: '2024-06-01',
        due_date: '2024-07-01',
        items: [
          {
            description: 'Material',
            quantity: 10,
            unit_price: 800,
            account_number: '4010',
            vat_rate: 0.25,
          },
        ],
      },
    })
    const response = await POST(request)
    const { status, body } = await parseJsonResponse<{
      data: { registration_journal_entry_id: string }
    }>(response)

    expect(status).toBe(200)
    expect(body.data).toBeTruthy()
    expect(body.data.registration_journal_entry_id).toBe('je-1')
    expect(mockCreateSupplierInvoiceRegistrationEntry).toHaveBeenCalled()
  })

  it('emits supplier_invoice.registered event', async () => {
    const supplier = makeSupplier({ id: VALID_UUID })
    const createdInvoice = makeSupplierInvoice({ id: 'si-1' })

    enqueue({ data: supplier, error: null })
    enqueue({ data: 5 })
    enqueue({ data: createdInvoice, error: null })
    enqueue({ data: null, error: null })
    enqueue({ data: { accounting_method: 'accrual' }, error: null })

    mockCreateSupplierInvoiceRegistrationEntry.mockResolvedValue({ id: 'je-1' })
    enqueue({ data: null, error: null })

    const emitSpy = vi.spyOn(eventBus, 'emit')

    const request = createMockRequest('/api/supplier-invoices', {
      method: 'POST',
      body: {
        supplier_id: VALID_UUID,
        supplier_invoice_number: 'LF-001',
        invoice_date: '2024-06-01',
        due_date: '2024-07-01',
        items: [
          { description: 'Material', quantity: 10, unit_price: 800, account_number: '4010', vat_rate: 0.25 },
        ],
      },
    })
    const response = await POST(request)
    const { status } = await parseJsonResponse(response)

    expect(status).toBe(200)
    expect(emitSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'supplier_invoice.registered',
        payload: expect.objectContaining({ userId: 'user-1' }),
      })
    )
  })

  it('skips registration entry for cash method', async () => {
    const supplier = makeSupplier({ id: VALID_UUID })
    const createdInvoice = makeSupplierInvoice({ id: 'si-1' })

    enqueue({ data: supplier, error: null })
    enqueue({ data: 6 })
    enqueue({ data: createdInvoice, error: null })
    enqueue({ data: null, error: null })
    enqueue({ data: { accounting_method: 'cash' }, error: null })

    const request = createMockRequest('/api/supplier-invoices', {
      method: 'POST',
      body: {
        supplier_id: VALID_UUID,
        supplier_invoice_number: 'LF-002',
        invoice_date: '2024-06-01',
        due_date: '2024-07-01',
        items: [{ description: 'Service', quantity: 1, unit_price: 5000, account_number: '6200' }],
      },
    })
    const response = await POST(request)
    const { status, body } = await parseJsonResponse<{
      data: { registration_journal_entry_id: null }
    }>(response)

    expect(status).toBe(200)
    expect(body.data.registration_journal_entry_id).toBeNull()
    expect(mockCreateSupplierInvoiceRegistrationEntry).not.toHaveBeenCalled()
  })

  it('rolls back on items insertion failure', async () => {
    const supplier = makeSupplier({ id: VALID_UUID })
    const createdInvoice = makeSupplierInvoice({ id: 'si-1' })

    enqueue({ data: supplier, error: null })
    enqueue({ data: 7 })
    enqueue({ data: createdInvoice, error: null })
    // Items fail
    enqueue({ data: null, error: { message: 'Items insert failed' } })
    // Rollback delete
    enqueue({ data: null, error: null })

    const request = createMockRequest('/api/supplier-invoices', {
      method: 'POST',
      body: {
        supplier_id: VALID_UUID,
        supplier_invoice_number: 'LF-003',
        invoice_date: '2024-06-01',
        due_date: '2024-07-01',
        items: [{ description: 'Test', quantity: 1, unit_price: 1000, account_number: '4010' }],
      },
    })
    const response = await POST(request)
    const { status, body } = await parseJsonResponse<{ error: string }>(response)

    expect(status).toBe(500)
    expect(body.error).toBe('Items insert failed')
  })
})
