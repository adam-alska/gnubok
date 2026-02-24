import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  createMockRequest,
  createQueuedMockSupabase,
  makeTransaction,
  parseJsonResponse,
} from '@/tests/helpers'
import { eventBus } from '@/lib/events'

// Mock init
vi.mock('@/lib/init', () => ({ ensureInitialized: vi.fn() }))

// Mock booking templates
vi.mock('@/lib/bookkeeping/booking-templates', () => ({
  getTemplateById: vi.fn((id: string) => {
    if (id === 'office_supplies') {
      return {
        id: 'office_supplies',
        name_sv: 'Kontorsmaterial',
        name_en: 'Office supplies',
        group: 'office',
        debit_account: '6110',
        credit_account: '1930',
        fallback_category: 'expense_office',
        default_private: false,
        vat_treatment: 'standard_25',
        vat_rate: 0.25,
        deductibility: 'full',
        risk_level: 'LOW',
        requires_review: false,
        entity_applicability: 'all',
        direction: 'expense',
      }
    }
    return null
  }),
  buildMappingResultFromTemplate: vi.fn(() => ({
    rule: null,
    debit_account: '6110',
    credit_account: '1930',
    risk_level: 'LOW',
    confidence: 1.0,
    requires_review: false,
    default_private: false,
    vat_lines: [],
    description: 'Kontorsmaterial',
  })),
}))

// Mock transaction entries
const mockCreateTransactionJournalEntry = vi.fn().mockResolvedValue({ id: 'je-1' })
vi.mock('@/lib/bookkeeping/transaction-entries', () => ({
  createTransactionJournalEntry: (...args: unknown[]) => mockCreateTransactionJournalEntry(...args),
}))

// Mock mapping engine
const mockSaveUserMappingRule = vi.fn().mockResolvedValue(undefined)
vi.mock('@/lib/bookkeeping/mapping-engine', () => ({
  saveUserMappingRule: (...args: unknown[]) => mockSaveUserMappingRule(...args),
}))

// Mock Supabase — set up once, re-configure per test via auth mock + queue
const mockCreateClient = vi.fn()
vi.mock('@/lib/supabase/server', () => ({
  createClient: (...args: unknown[]) => mockCreateClient(...args),
}))

describe('POST /api/transactions/batch-describe', () => {
  let POST: typeof import('../route').POST

  beforeEach(async () => {
    vi.clearAllMocks()
    eventBus.clear()
    const mod = await import('../route')
    POST = mod.POST
  })

  it('returns 401 when not authenticated', async () => {
    const { supabase } = createQueuedMockSupabase()
    supabase.auth.getUser.mockResolvedValue({
      data: { user: null },
      error: { message: 'Not authenticated' },
    })
    mockCreateClient.mockResolvedValue(supabase)

    const req = createMockRequest('/api/transactions/batch-describe', {
      method: 'POST',
      body: {
        merchant_name: 'Staples',
        template_id: 'office_supplies',
        is_business: true,
      },
    })

    const res = await POST(req)
    const { status, body } = await parseJsonResponse(res)

    expect(status).toBe(401)
    expect(body).toHaveProperty('error', 'Unauthorized')
  })

  it('returns 400 for invalid template_id', async () => {
    const { supabase } = createQueuedMockSupabase()
    supabase.auth.getUser.mockResolvedValue({
      data: { user: { id: 'user-1' } },
      error: null,
    })
    mockCreateClient.mockResolvedValue(supabase)

    const req = createMockRequest('/api/transactions/batch-describe', {
      method: 'POST',
      body: {
        merchant_name: 'Staples',
        template_id: 'nonexistent_template',
        is_business: true,
      },
    })

    const res = await POST(req)
    const { status, body } = await parseJsonResponse(res)

    expect(status).toBe(400)
    expect(body).toHaveProperty('error', 'Invalid template_id')
  })

  it('applies template to uncategorized merchant transactions', async () => {
    const tx1 = makeTransaction({ id: 'tx-1', merchant_name: 'Staples', amount: -299 })
    const tx2 = makeTransaction({ id: 'tx-2', merchant_name: 'Staples', amount: -150 })

    const { supabase, enqueueMany } = createQueuedMockSupabase()
    supabase.auth.getUser.mockResolvedValue({
      data: { user: { id: 'user-1' } },
      error: null,
    })
    enqueueMany([
      // company_settings
      { data: { entity_type: 'enskild_firma', fiscal_year_start_month: 1 }, error: null },
      // fetch uncategorized transactions
      { data: [tx1, tx2], error: null },
      // fiscal period upsert for tx1
      { data: null, error: null },
      // transaction update for tx1
      { data: null, error: null },
      // fiscal period upsert for tx2
      { data: null, error: null },
      // transaction update for tx2
      { data: null, error: null },
    ])
    mockCreateClient.mockResolvedValue(supabase)

    const req = createMockRequest('/api/transactions/batch-describe', {
      method: 'POST',
      body: {
        merchant_name: 'Staples',
        template_id: 'office_supplies',
        is_business: true,
        user_description: 'office supplies purchase',
      },
    })

    const res = await POST(req)
    const { status, body } = await parseJsonResponse<{ data: { applied: number; errors: string[] } }>(res)

    expect(status).toBe(200)
    expect(body.data.applied).toBe(2)
    expect(body.data.errors).toHaveLength(0)

    // Verify journal entries were created
    expect(mockCreateTransactionJournalEntry).toHaveBeenCalledTimes(2)

    // Verify mapping rule was saved with user description
    expect(mockSaveUserMappingRule).toHaveBeenCalledWith(
      'user-1',
      'Staples',
      '6110',
      '1930',
      false,
      'office supplies purchase',
      'office_supplies'
    )
  })

  it('returns 0 applied when no uncategorized transactions exist', async () => {
    const { supabase, enqueueMany } = createQueuedMockSupabase()
    supabase.auth.getUser.mockResolvedValue({
      data: { user: { id: 'user-1' } },
      error: null,
    })
    enqueueMany([
      // company_settings
      { data: { entity_type: 'enskild_firma', fiscal_year_start_month: 1 }, error: null },
      // fetch uncategorized transactions — empty
      { data: [], error: null },
    ])
    mockCreateClient.mockResolvedValue(supabase)

    const req = createMockRequest('/api/transactions/batch-describe', {
      method: 'POST',
      body: {
        merchant_name: 'Unknown Merchant',
        template_id: 'office_supplies',
        is_business: true,
      },
    })

    const res = await POST(req)
    const { status, body } = await parseJsonResponse<{ data: { applied: number } }>(res)

    expect(status).toBe(200)
    expect(body.data.applied).toBe(0)
  })
})
