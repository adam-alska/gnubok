import { describe, it, expect, vi, beforeEach } from 'vitest'
import { eventBus } from '@/lib/events/bus'
import {
  createQueuedMockSupabase,
  makeSupplierInvoice,
} from '@/tests/helpers'

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}))

vi.mock('@/lib/bookkeeping/supplier-invoice-entries', () => ({
  createSupplierInvoiceRegistrationEntry: vi.fn(),
}))

import { createClient } from '@/lib/supabase/server'
import { createSupplierInvoiceRegistrationEntry } from '@/lib/bookkeeping/supplier-invoice-entries'
import { registerSupplierInvoiceHandler } from '../supplier-invoice-handler'

const mockCreateClient = vi.mocked(createClient)
const mockCreateEntry = vi.mocked(createSupplierInvoiceRegistrationEntry)

describe('Supplier Invoice Core Handler', () => {
  let unsubscribe: () => void

  beforeEach(() => {
    vi.clearAllMocks()
    eventBus.clear()
    unsubscribe = registerSupplierInvoiceHandler()
  })

  afterEach(() => {
    unsubscribe()
  })

  it('creates registration journal entry for accrual method', async () => {
    const { supabase, enqueueMany } = createQueuedMockSupabase()
    enqueueMany([
      // 1. company_settings
      { data: { accounting_method: 'accrual' }, error: null },
      // 2. supplier_invoice_items
      { data: [{ id: 'item-1', account_number: '6200', line_total: 1000, sort_order: 0 }], error: null },
      // 3. supplier (type)
      { data: { supplier_type: 'swedish_business' }, error: null },
      // 4. Update invoice with journal entry id
      { data: null, error: null },
    ])
    mockCreateClient.mockResolvedValue(supabase as never)
    mockCreateEntry.mockResolvedValue({ id: 'je-1' } as never)

    const invoice = makeSupplierInvoice({ id: 'si-1', supplier_id: 'sup-1' })

    await eventBus.emit({
      type: 'supplier_invoice.confirmed',
      payload: {
        inboxItem: { id: 'inbox-1' } as never,
        supplierInvoice: invoice,
        userId: 'user-1',
      },
    })

    expect(mockCreateEntry).toHaveBeenCalledWith(
      'user-1',
      invoice,
      expect.any(Array),
      'swedish_business'
    )
  })

  it('skips journal entry for cash method', async () => {
    const { supabase, enqueueMany } = createQueuedMockSupabase()
    enqueueMany([
      // company_settings with cash method
      { data: { accounting_method: 'cash' }, error: null },
    ])
    mockCreateClient.mockResolvedValue(supabase as never)

    const invoice = makeSupplierInvoice({ id: 'si-2' })

    await eventBus.emit({
      type: 'supplier_invoice.confirmed',
      payload: {
        inboxItem: { id: 'inbox-2' } as never,
        supplierInvoice: invoice,
        userId: 'user-1',
      },
    })

    expect(mockCreateEntry).not.toHaveBeenCalled()
  })

  it('handles journal entry creation failure gracefully', async () => {
    const { supabase, enqueueMany } = createQueuedMockSupabase()
    enqueueMany([
      { data: { accounting_method: 'accrual' }, error: null },
      { data: [{ id: 'item-1', account_number: '6200', line_total: 500, sort_order: 0 }], error: null },
      { data: { supplier_type: 'swedish_business' }, error: null },
    ])
    mockCreateClient.mockResolvedValue(supabase as never)
    mockCreateEntry.mockRejectedValue(new Error('No fiscal period'))

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const invoice = makeSupplierInvoice({ id: 'si-3' })

    // Should not throw
    await eventBus.emit({
      type: 'supplier_invoice.confirmed',
      payload: {
        inboxItem: { id: 'inbox-3' } as never,
        supplierInvoice: invoice,
        userId: 'user-1',
      },
    })

    expect(consoleSpy).toHaveBeenCalledWith(
      '[supplier-invoice-handler] Failed to create registration journal entry:',
      expect.any(Error)
    )

    consoleSpy.mockRestore()
  })
})
