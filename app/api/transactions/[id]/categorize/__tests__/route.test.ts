import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  createMockRequest,
  parseJsonResponse,
  createMockRouteParams,
  createQueuedMockSupabase,
  makeTransaction,
} from '@/tests/helpers'
import { eventBus } from '@/lib/events'

const { supabase: mockSupabase, enqueue, reset } = createQueuedMockSupabase()
vi.mock('@/lib/supabase/server', () => ({
  createClient: () => Promise.resolve(mockSupabase),
}))

vi.mock('@/lib/init', () => ({
  ensureInitialized: vi.fn(),
}))

const mockBuildMappingResultFromCategory = vi.fn()
vi.mock('@/lib/bookkeeping/category-mapping', () => ({
  buildMappingResultFromCategory: (...args: unknown[]) =>
    mockBuildMappingResultFromCategory(...args),
}))

const mockCreateTransactionJournalEntry = vi.fn()
vi.mock('@/lib/bookkeeping/transaction-entries', () => ({
  createTransactionJournalEntry: (...args: unknown[]) =>
    mockCreateTransactionJournalEntry(...args),
}))

const mockSaveUserMappingRule = vi.fn()
vi.mock('@/lib/bookkeeping/mapping-engine', () => ({
  saveUserMappingRule: (...args: unknown[]) => mockSaveUserMappingRule(...args),
}))

import { POST } from '../route'

describe('POST /api/transactions/[id]/categorize', () => {
  const mockUser = { id: 'user-1', email: 'test@test.se' }
  const defaultMappingResult = {
    rule: null,
    debit_account: '6200',
    credit_account: '1930',
    risk_level: 'NONE',
    confidence: 1,
    requires_review: false,
    default_private: false,
    vat_lines: [{ account_number: '2641', debit_amount: 62.5, credit_amount: 0, description: 'Ingående moms' }],
    description: 'Test expense',
  }

  beforeEach(() => {
    vi.clearAllMocks()
    reset()
    eventBus.clear()
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: mockUser } })
    mockBuildMappingResultFromCategory.mockReturnValue(defaultMappingResult)
  })

  it('returns 401 when not authenticated', async () => {
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: null } })

    const request = createMockRequest('/api/transactions/tx-1/categorize', {
      method: 'POST',
      body: { is_business: true, category: 'expense_software' },
    })
    const response = await POST(request, createMockRouteParams({ id: 'tx-1' }))
    const { status, body } = await parseJsonResponse(response)

    expect(status).toBe(401)
    expect(body).toEqual({ error: 'Unauthorized' })
  })

  it('returns 404 when transaction not found', async () => {
    enqueue({ data: null, error: { message: 'Not found' } })

    const request = createMockRequest('/api/transactions/tx-999/categorize', {
      method: 'POST',
      body: { is_business: true, category: 'expense_software' },
    })
    const response = await POST(request, createMockRouteParams({ id: 'tx-999' }))
    const { status, body } = await parseJsonResponse<{ error: string }>(response)

    expect(status).toBe(404)
    expect(body.error).toBe('Transaction not found')
  })

  it('updates category only when transaction already has journal entry', async () => {
    const tx = makeTransaction({
      id: 'tx-1',
      journal_entry_id: 'je-existing',
      category: 'uncategorized',
    })
    // Fetch transaction
    enqueue({ data: tx, error: null })
    // Update transaction
    enqueue({ data: null, error: null })

    const request = createMockRequest('/api/transactions/tx-1/categorize', {
      method: 'POST',
      body: { is_business: true, category: 'expense_software' },
    })
    const response = await POST(request, createMockRouteParams({ id: 'tx-1' }))
    const { status, body } = await parseJsonResponse<{
      success: boolean
      already_had_journal_entry: boolean
      journal_entry_id: string
    }>(response)

    expect(status).toBe(200)
    expect(body.success).toBe(true)
    expect(body.already_had_journal_entry).toBe(true)
    expect(body.journal_entry_id).toBe('je-existing')
    expect(mockCreateTransactionJournalEntry).not.toHaveBeenCalled()
  })

  it('creates journal entry for business expense', async () => {
    const tx = makeTransaction({
      id: 'tx-1',
      amount: -500,
      merchant_name: 'GitHub',
      journal_entry_id: null,
    })

    // Fetch transaction
    enqueue({ data: tx, error: null })
    // Fetch company settings
    enqueue({ data: { entity_type: 'enskild_firma', fiscal_year_start_month: 1 }, error: null })
    // ensureFiscalPeriod: check existing
    enqueue({ data: [{ id: 'period-1' }], error: null })

    mockCreateTransactionJournalEntry.mockResolvedValue({ id: 'je-1' })
    mockSaveUserMappingRule.mockResolvedValue(undefined)

    // Update transaction
    enqueue({ data: null, error: null })

    const emitSpy = vi.spyOn(eventBus, 'emit')

    const request = createMockRequest('/api/transactions/tx-1/categorize', {
      method: 'POST',
      body: { is_business: true, category: 'expense_software' },
    })
    const response = await POST(request, createMockRouteParams({ id: 'tx-1' }))
    const { status, body } = await parseJsonResponse<{
      success: boolean
      journal_entry_created: boolean
      journal_entry_id: string
      category: string
    }>(response)

    expect(status).toBe(200)
    expect(body.success).toBe(true)
    expect(body.journal_entry_created).toBe(true)
    expect(body.journal_entry_id).toBe('je-1')
    expect(body.category).toBe('expense_software')
    expect(mockSaveUserMappingRule).toHaveBeenCalledWith(
      'user-1',
      'GitHub',
      '6200',
      '1930',
      false
    )
    expect(emitSpy).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'transaction.categorized' })
    )
  })

  it('returns success with error when journal entry creation fails (non-blocking)', async () => {
    const tx = makeTransaction({
      id: 'tx-1',
      amount: -500,
      merchant_name: 'Test',
      journal_entry_id: null,
    })

    enqueue({ data: tx, error: null })
    enqueue({ data: { entity_type: 'enskild_firma', fiscal_year_start_month: 1 }, error: null })
    enqueue({ data: [{ id: 'period-1' }], error: null })

    mockCreateTransactionJournalEntry.mockRejectedValue(new Error('Period locked'))

    // Update transaction
    enqueue({ data: null, error: null })

    const request = createMockRequest('/api/transactions/tx-1/categorize', {
      method: 'POST',
      body: { is_business: true, category: 'expense_software' },
    })
    const response = await POST(request, createMockRouteParams({ id: 'tx-1' }))
    const { status, body } = await parseJsonResponse<{
      success: boolean
      journal_entry_created: boolean
      journal_entry_error: string
    }>(response)

    expect(status).toBe(200)
    expect(body.success).toBe(true)
    expect(body.journal_entry_created).toBe(false)
    expect(body.journal_entry_error).toBe('Period locked')
  })

  it('returns 500 when transaction update fails', async () => {
    const tx = makeTransaction({
      id: 'tx-1',
      journal_entry_id: null,
      merchant_name: null,
    })

    enqueue({ data: tx, error: null })
    enqueue({ data: { entity_type: 'enskild_firma', fiscal_year_start_month: 1 }, error: null })
    enqueue({ data: [{ id: 'period-1' }], error: null })

    mockCreateTransactionJournalEntry.mockResolvedValue({ id: 'je-1' })

    // Transaction update fails
    enqueue({ data: null, error: { message: 'Update failed' } })

    const request = createMockRequest('/api/transactions/tx-1/categorize', {
      method: 'POST',
      body: { is_business: true, category: 'expense_software' },
    })
    const response = await POST(request, createMockRouteParams({ id: 'tx-1' }))
    const { status, body } = await parseJsonResponse<{ error: string }>(response)

    expect(status).toBe(500)
    expect(body.error).toBe('Failed to update transaction')
  })

  it('returns 400 when mapping result has empty debit_account', async () => {
    const tx = makeTransaction({
      id: 'tx-1',
      amount: -500,
      journal_entry_id: null,
    })

    enqueue({ data: tx, error: null })
    enqueue({ data: { entity_type: 'enskild_firma', fiscal_year_start_month: 1 }, error: null })

    mockBuildMappingResultFromCategory.mockReturnValue({
      ...defaultMappingResult,
      debit_account: '',
    })

    const request = createMockRequest('/api/transactions/tx-1/categorize', {
      method: 'POST',
      body: { is_business: true, category: 'expense_software' },
    })
    const response = await POST(request, createMockRouteParams({ id: 'tx-1' }))
    const { status, body } = await parseJsonResponse<{ error: string }>(response)

    expect(status).toBe(400)
    expect(body.error).toBe('Invalid account mapping: debit and credit accounts are required')
    expect(mockCreateTransactionJournalEntry).not.toHaveBeenCalled()
  })

  it('categorizes as private when is_business is false', async () => {
    const tx = makeTransaction({
      id: 'tx-1',
      journal_entry_id: null,
      merchant_name: null,
    })

    enqueue({ data: tx, error: null })
    enqueue({ data: { entity_type: 'enskild_firma', fiscal_year_start_month: 1 }, error: null })
    enqueue({ data: [{ id: 'period-1' }], error: null })

    mockCreateTransactionJournalEntry.mockResolvedValue({ id: 'je-1' })

    // Update transaction
    enqueue({ data: null, error: null })

    const request = createMockRequest('/api/transactions/tx-1/categorize', {
      method: 'POST',
      body: { is_business: false },
    })
    const response = await POST(request, createMockRouteParams({ id: 'tx-1' }))
    const { status, body } = await parseJsonResponse<{
      success: boolean
      category: string
    }>(response)

    expect(status).toBe(200)
    expect(body.category).toBe('private')
    // Should NOT save mapping rule for private transactions
    expect(mockSaveUserMappingRule).not.toHaveBeenCalled()
  })
})
