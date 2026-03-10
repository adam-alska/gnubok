import type { SupabaseClient } from '@supabase/supabase-js'
import { createQueuedMockSupabase } from '@/tests/helpers'

// Mock dependencies
vi.mock('../oauth', () => ({
  refreshAccessToken: vi.fn().mockResolvedValue({
    access_token: 'refreshed-token',
    refresh_token: 'new-refresh',
    expires_in: 3600,
  }),
}))

vi.mock('../fortnox-sync', () => ({
  syncFortnoxSIEData: vi.fn().mockResolvedValue({
    success: true,
    accountsActivated: 5,
    journalEntriesCreated: 10,
    openingBalanceCreated: true,
    importId: 'import-1',
    fiscalPeriodId: 'fp-1',
    fiscalYearStart: '2025-01-01',
    fiscalYearEnd: '2025-12-31',
    companyName: 'Test AB',
    warnings: [],
    errors: [],
  }),
}))

vi.mock('../fortnox-paginated-fetcher', () => {
  const MockRateLimiter = class {
    waitIfNeeded = vi.fn().mockResolvedValue(undefined)
  }
  return {
    FortnoxRateLimiter: MockRateLimiter,
    fetchAllPages: vi.fn().mockResolvedValue([]),
    fetchDetails: vi.fn().mockResolvedValue([]),
  }
})

vi.mock('../fortnox-importers', () => ({
  importFortnoxCustomers: vi.fn().mockResolvedValue({ created: 3, updated: 1, skipped: 0, errors: [] }),
  importFortnoxSuppliers: vi.fn().mockResolvedValue({ created: 2, updated: 0, skipped: 0, errors: [] }),
  importFortnoxInvoices: vi.fn().mockResolvedValue({ created: 5, updated: 0, skipped: 0, errors: [] }),
  importFortnoxSupplierInvoices: vi.fn().mockResolvedValue({ created: 1, updated: 0, skipped: 0, errors: [] }),
  importFortnoxInvoicePayments: vi.fn().mockResolvedValue({ created: 0, updated: 4, skipped: 0, errors: [] }),
  importFortnoxSupplierInvoicePayments: vi.fn().mockResolvedValue({ created: 0, updated: 1, skipped: 0, errors: [] }),
}))

import { syncFortnoxData } from '../fortnox-sync-orchestrator'

const userId = 'user-123'
const connectionId = 'conn-456'

describe('syncFortnoxData', () => {
  const { supabase: rawSupabase, enqueue: enqueueUser, reset: resetUser } = createQueuedMockSupabase()
  const { supabase: rawAdminClient, enqueue: enqueueAdmin, reset: resetAdmin } = createQueuedMockSupabase()
  const supabase = rawSupabase as unknown as SupabaseClient
  const adminClient = rawAdminClient as unknown as SupabaseClient

  beforeEach(() => {
    vi.clearAllMocks()
    resetUser()
    resetAdmin()
  })

  function enqueueTokens(grantedScopes: string[] = []) {
    enqueueAdmin({
      data: {
        access_token: 'test-token',
        refresh_token: 'test-refresh',
        token_expires_at: new Date(Date.now() + 3600_000).toISOString(),
        granted_scopes: grantedScopes,
      },
      error: null,
    })
  }

  it('returns error when no tokens found', async () => {
    enqueueAdmin({ data: null, error: { message: 'Not found' } })

    const result = await syncFortnoxData(
      supabase, adminClient, userId, connectionId, ['sie4'], 1
    )

    expect(result.success).toBe(false)
    expect(result.errors[0]).toContain('No tokens found')
  })

  it('syncs SIE data type', async () => {
    enqueueTokens(['bookkeeping'])
    // last_synced_at update
    enqueueAdmin({ data: null, error: null })

    const result = await syncFortnoxData(
      supabase, adminClient, userId, connectionId, ['sie4'], 1
    )

    expect(result.success).toBe(true)
    expect(result.results).toHaveLength(1)
    expect(result.results[0].dataTypeId).toBe('sie4')
    expect(result.results[0].success).toBe(true)
    expect(result.results[0].sieResult).toBeDefined()
  })

  it('requires financialYear for SIE', async () => {
    enqueueTokens(['bookkeeping'])
    enqueueAdmin({ data: null, error: null })

    const result = await syncFortnoxData(
      supabase, adminClient, userId, connectionId, ['sie4']
    )

    expect(result.results[0].success).toBe(false)
    expect(result.results[0].errors[0]).toContain('Financial year is required')
  })

  it('syncs raw JSON data types', async () => {
    enqueueTokens(['costcenter'])
    // upsert to provider_sync_data
    enqueueUser({ data: null, error: null })
    // last_synced_at
    enqueueAdmin({ data: null, error: null })

    const result = await syncFortnoxData(
      supabase, adminClient, userId, connectionId, ['costcenters']
    )

    expect(result.success).toBe(true)
    expect(result.results).toHaveLength(1)
    expect(result.results[0].dataTypeId).toBe('costcenters')
  })

  it('reports scope mismatch when all scopes missing', async () => {
    enqueueTokens(['bookkeeping']) // Only bookkeeping granted
    enqueueAdmin({ data: null, error: null })

    const result = await syncFortnoxData(
      supabase, adminClient, userId, connectionId,
      ['employees'] // Requires 'salary' scope
    )

    expect(result.success).toBe(false)
    expect(result.scopeMismatch).not.toBeNull()
    expect(result.scopeMismatch!.missingScopes).toContain('salary')
  })

  it('orders dependencies correctly', async () => {
    enqueueTokens(['customer', 'invoice', 'supplier'])
    // For gnubok_table types: fetchAllPages + fetchDetails + importFunction
    // customers (phase 1), suppliers (phase 1), invoices (phase 2), invoicepayments (phase 3)
    enqueueAdmin({ data: null, error: null }) // last_synced_at

    const result = await syncFortnoxData(
      supabase, adminClient, userId, connectionId,
      ['invoices', 'customers', 'suppliers']
    )

    // Should have all three results
    expect(result.results).toHaveLength(3)

    // Verify dependency order: customers/suppliers before invoices
    const customerIndex = result.results.findIndex((r) => r.dataTypeId === 'customers')
    const supplierIndex = result.results.findIndex((r) => r.dataTypeId === 'suppliers')
    const invoiceIndex = result.results.findIndex((r) => r.dataTypeId === 'invoices')

    expect(customerIndex).toBeLessThan(invoiceIndex)
    expect(supplierIndex).toBeLessThan(invoiceIndex)
  })

  it('proceeds with available types when some scopes are missing', async () => {
    enqueueTokens(['bookkeeping', 'customer'])
    // last_synced_at update
    enqueueAdmin({ data: null, error: null })

    const result = await syncFortnoxData(
      supabase, adminClient, userId, connectionId,
      ['customers', 'employees'], // employees requires 'salary' scope
    )

    // Should only sync customers (employees filtered out)
    expect(result.results).toHaveLength(1)
    expect(result.results[0].dataTypeId).toBe('customers')
    expect(result.scopeMismatch).not.toBeNull()
  })
})
