import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  createQueuedMockSupabase,
  createMockRequest,
  createMockRouteParams,
  parseJsonResponse,
  makeInvoiceInboxItem,
  makeSupplier,
} from '@/tests/helpers'

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

vi.mock('@/lib/bookkeeping/supplier-invoice-entries', () => ({
  createSupplierInvoiceRegistrationEntry: vi.fn().mockResolvedValue({ id: 'je-1' }),
}))

import { createClient } from '@/lib/supabase/server'
import { POST } from '../route'

const mockCreateClient = vi.mocked(createClient)

describe('Invoice Inbox Confirm Route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns 401 when not authenticated', async () => {
    const { supabase } = createQueuedMockSupabase()
    supabase.auth.getUser.mockResolvedValue({
      data: { user: null },
      error: { message: 'Not authenticated' },
    })
    mockCreateClient.mockResolvedValue(supabase as never)

    const request = createMockRequest('/api/extensions/invoice-inbox/inbox/item-1/confirm', {
      method: 'POST',
      body: {},
    })
    const response = await POST(request, createMockRouteParams({ id: 'item-1' }))
    const { status } = await parseJsonResponse(response)

    expect(status).toBe(401)
  })

  it('returns 404 when item not found', async () => {
    const { supabase, enqueueMany } = createQueuedMockSupabase()
    supabase.auth.getUser.mockResolvedValue({
      data: { user: { id: 'user-1' } },
      error: null,
    })
    enqueueMany([
      { data: null, error: { message: 'Not found' } }, // inbox item fetch
    ])
    mockCreateClient.mockResolvedValue(supabase as never)

    const request = createMockRequest('/api/extensions/invoice-inbox/inbox/item-1/confirm', {
      method: 'POST',
      body: {},
    })
    const response = await POST(request, createMockRouteParams({ id: 'item-1' }))
    const { status } = await parseJsonResponse(response)

    expect(status).toBe(404)
  })

  it('returns 400 when already confirmed', async () => {
    const { supabase, enqueueMany } = createQueuedMockSupabase()
    supabase.auth.getUser.mockResolvedValue({
      data: { user: { id: 'user-1' } },
      error: null,
    })
    enqueueMany([
      { data: makeInvoiceInboxItem({ status: 'confirmed' }), error: null },
    ])
    mockCreateClient.mockResolvedValue(supabase as never)

    const request = createMockRequest('/api/extensions/invoice-inbox/inbox/item-1/confirm', {
      method: 'POST',
      body: {},
    })
    const response = await POST(request, createMockRouteParams({ id: 'item-1' }))
    const { status } = await parseJsonResponse(response)

    expect(status).toBe(400)
  })

  it('returns 400 when no extracted data', async () => {
    const { supabase, enqueueMany } = createQueuedMockSupabase()
    supabase.auth.getUser.mockResolvedValue({
      data: { user: { id: 'user-1' } },
      error: null,
    })
    enqueueMany([
      { data: makeInvoiceInboxItem({ status: 'ready', extracted_data: null }), error: null },
    ])
    mockCreateClient.mockResolvedValue(supabase as never)

    const request = createMockRequest('/api/extensions/invoice-inbox/inbox/item-1/confirm', {
      method: 'POST',
      body: {},
    })
    const response = await POST(request, createMockRouteParams({ id: 'item-1' }))
    const { status } = await parseJsonResponse(response)

    expect(status).toBe(400)
  })

  it('creates new supplier when no match and confirms successfully', async () => {
    const extractedData = {
      supplier: {
        name: 'New Supplier AB',
        orgNumber: '556123-4567',
        vatNumber: null,
        address: null,
        bankgiro: '123-4567',
        plusgiro: null,
      },
      invoice: {
        invoiceNumber: 'F-001',
        invoiceDate: '2024-06-15',
        dueDate: '2024-07-15',
        paymentReference: '1234567890',
        currency: 'SEK',
      },
      lineItems: [
        { description: 'Kontorsmaterial', quantity: 10, unitPrice: 50, lineTotal: 500, vatRate: 25, accountSuggestion: '6100' },
      ],
      totals: { subtotal: 500, vatAmount: 125, total: 625 },
      vatBreakdown: [{ rate: 25, base: 500, amount: 125 }],
      confidence: 0.92,
    }

    const { supabase, enqueueMany } = createQueuedMockSupabase()
    supabase.auth.getUser.mockResolvedValue({
      data: { user: { id: 'user-1' } },
      error: null,
    })

    enqueueMany([
      // 1. Fetch inbox item
      { data: makeInvoiceInboxItem({ id: 'item-1', status: 'ready', extracted_data: extractedData as unknown as Record<string, unknown> }), error: null },
      // 2. Create new supplier
      { data: makeSupplier({ id: 'new-supplier-1', name: 'New Supplier AB' }), error: null },
      // 3. Verify supplier
      { data: makeSupplier({ id: 'new-supplier-1', name: 'New Supplier AB' }), error: null },
      // 4. Get arrival number
      { data: 42, error: null },
      // 5. Insert supplier invoice
      { data: { id: 'si-1', total: 625 }, error: null },
      // 6. Insert items
      { data: null, error: null },
      // 7. Get company settings
      { data: { accounting_method: 'accrual' }, error: null },
      // 8. Update invoice with journal entry id
      { data: null, error: null },
      // 9. Update inbox item as confirmed
      { data: null, error: null },
    ])
    mockCreateClient.mockResolvedValue(supabase as never)

    const request = createMockRequest('/api/extensions/invoice-inbox/inbox/item-1/confirm', {
      method: 'POST',
      body: {},
    })
    const response = await POST(request, createMockRouteParams({ id: 'item-1' }))
    const { status, body } = await parseJsonResponse<{ data: { id: string } }>(response)

    expect(status).toBe(200)
    expect(body.data).toBeDefined()
  })

  it('uses existing supplier when matched', async () => {
    const extractedData = {
      supplier: {
        name: 'Existing Supplier',
        orgNumber: null,
        vatNumber: null,
        address: null,
        bankgiro: null,
        plusgiro: null,
      },
      invoice: {
        invoiceNumber: 'F-002',
        invoiceDate: '2024-06-15',
        dueDate: '2024-07-15',
        paymentReference: null,
        currency: 'SEK',
      },
      lineItems: [],
      totals: { subtotal: 1000, vatAmount: 250, total: 1250 },
      vatBreakdown: [],
      confidence: 0.85,
    }

    const { supabase, enqueueMany } = createQueuedMockSupabase()
    supabase.auth.getUser.mockResolvedValue({
      data: { user: { id: 'user-1' } },
      error: null,
    })

    enqueueMany([
      // 1. Fetch inbox item (has matched_supplier_id)
      { data: makeInvoiceInboxItem({
        id: 'item-2',
        status: 'ready',
        extracted_data: extractedData as unknown as Record<string, unknown>,
        matched_supplier_id: 'existing-supplier-1',
      }), error: null },
      // 2. Verify supplier
      { data: makeSupplier({ id: 'existing-supplier-1', default_expense_account: '5410' }), error: null },
      // 3. Get arrival number
      { data: 43, error: null },
      // 4. Insert supplier invoice
      { data: { id: 'si-2', total: 1250 }, error: null },
      // 5. Insert items
      { data: null, error: null },
      // 6. Get company settings
      { data: { accounting_method: 'cash' }, error: null },
      // 7. Update inbox item as confirmed
      { data: null, error: null },
    ])
    mockCreateClient.mockResolvedValue(supabase as never)

    const request = createMockRequest('/api/extensions/invoice-inbox/inbox/item-2/confirm', {
      method: 'POST',
      body: {},
    })
    const response = await POST(request, createMockRouteParams({ id: 'item-2' }))
    const { status } = await parseJsonResponse(response)

    expect(status).toBe(200)
  })
})
