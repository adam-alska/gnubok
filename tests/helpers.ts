/**
 * Shared test helpers — mock factories and fixture builders
 */
import { vi } from 'vitest'
import type {
  Receipt,
  Transaction,
  FiscalPeriod,
  JournalEntry,
  JournalEntryLine,
  DocumentAttachment,
  TaxCode,
} from '@/types'

// ============================================================
// Chainable Supabase mock
// ============================================================

/**
 * Creates a deeply chainable mock that mirrors the Supabase client API.
 *
 * Usage:
 *   const { supabase, mockResult } = createMockSupabase()
 *   mockResult({ data: [...], error: null })
 *   const { data } = await supabase.from('table').select('*').eq('id', '1').single()
 */
export function createMockSupabase() {
  // The value that terminal calls (.single(), .maybeSingle(), or the chain itself) resolve to
  let pendingResult: { data: unknown; error: unknown; count?: number | null } = {
    data: null,
    error: null,
  }

  const mockResult = (result: {
    data?: unknown
    error?: unknown
    count?: number | null
  }) => {
    pendingResult = {
      data: result.data ?? null,
      error: result.error ?? null,
      count: result.count ?? null,
    }
  }

  // Build a proxy that returns itself for any chained method call,
  // and resolves to pendingResult when awaited.
  const buildChain = (): unknown => {
    const handler: ProxyHandler<object> = {
      get(_target, prop) {
        if (prop === 'then') {
          // Make the chain thenable — resolves to pendingResult
          return (resolve: (v: unknown) => void) => resolve(pendingResult)
        }
        // Return a function that returns a new chain
        return (..._args: unknown[]) => buildChain()
      },
    }
    return new Proxy({}, handler)
  }

  // Storage mock
  const storageMock = {
    from: vi.fn().mockReturnValue({
      upload: vi.fn().mockResolvedValue({ data: {}, error: null }),
      download: vi.fn().mockResolvedValue({
        data: new Blob(['test']),
        error: null,
      }),
      remove: vi.fn().mockResolvedValue({ data: [], error: null }),
      getPublicUrl: vi.fn().mockReturnValue({
        data: { publicUrl: 'https://example.com/file.jpg' },
      }),
    }),
  }

  const supabase = {
    from: vi.fn().mockImplementation(() => buildChain()),
    rpc: vi.fn().mockImplementation(() => buildChain()),
    storage: storageMock,
  }

  return { supabase, mockResult }
}

// ============================================================
// Fixture factories
// ============================================================

let _counter = 0
const nextId = () => `test-${++_counter}`

export function makeReceipt(overrides: Partial<Receipt> = {}): Receipt {
  return {
    id: nextId(),
    user_id: 'user-1',
    image_url: 'https://example.com/receipt.jpg',
    image_thumbnail_url: null,
    status: 'confirmed',
    extraction_confidence: 0.95,
    merchant_name: 'ICA Maxi',
    merchant_org_number: null,
    merchant_vat_number: null,
    receipt_date: '2024-06-15',
    receipt_time: '14:30',
    total_amount: 299.0,
    currency: 'SEK',
    vat_amount: 59.8,
    is_restaurant: false,
    is_systembolaget: false,
    is_foreign_merchant: false,
    representation_persons: null,
    representation_purpose: null,
    matched_transaction_id: null,
    match_confidence: null,
    raw_extraction: null,
    created_at: '2024-06-15T14:30:00Z',
    updated_at: '2024-06-15T14:30:00Z',
    ...overrides,
  }
}

export function makeTransaction(overrides: Partial<Transaction> = {}): Transaction {
  return {
    id: nextId(),
    user_id: 'user-1',
    bank_connection_id: null,
    external_id: null,
    date: '2024-06-15',
    description: 'ICA MAXI STOCKHOLM',
    amount: -299.0,
    currency: 'SEK',
    amount_sek: null,
    exchange_rate: null,
    exchange_rate_date: null,
    category: 'uncategorized',
    is_business: null,
    invoice_id: null,
    supplier_invoice_id: null,
    potential_invoice_id: null,
    journal_entry_id: null,
    mcc_code: null,
    merchant_name: 'ICA Maxi',
    receipt_id: null,
    notes: null,
    created_at: '2024-06-15T14:30:00Z',
    updated_at: '2024-06-15T14:30:00Z',
    ...overrides,
  }
}

export function makeFiscalPeriod(overrides: Partial<FiscalPeriod> = {}): FiscalPeriod {
  return {
    id: nextId(),
    user_id: 'user-1',
    name: 'FY 2024',
    period_start: '2024-01-01',
    period_end: '2024-12-31',
    is_closed: false,
    closed_at: null,
    locked_at: null,
    retention_expires_at: null,
    opening_balances_set: false,
    closing_entry_id: null,
    opening_balance_entry_id: null,
    previous_period_id: null,
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
    ...overrides,
  }
}

export function makeJournalEntry(overrides: Partial<JournalEntry> = {}): JournalEntry {
  return {
    id: nextId(),
    user_id: 'user-1',
    fiscal_period_id: 'period-1',
    voucher_number: 1,
    voucher_series: 'A',
    entry_date: '2024-06-15',
    description: 'Test entry',
    source_type: 'manual',
    source_id: null,
    status: 'posted',
    committed_at: '2024-06-15T14:30:00Z',
    reversed_by_id: null,
    reverses_id: null,
    correction_of_id: null,
    attachment_urls: null,
    created_at: '2024-06-15T14:30:00Z',
    updated_at: '2024-06-15T14:30:00Z',
    ...overrides,
  }
}

export function makeJournalEntryLine(
  overrides: Partial<JournalEntryLine> = {}
): JournalEntryLine {
  return {
    id: nextId(),
    journal_entry_id: 'entry-1',
    account_number: '1930',
    account_id: null,
    debit_amount: 0,
    credit_amount: 0,
    currency: 'SEK',
    amount_in_currency: null,
    exchange_rate: null,
    line_description: null,
    tax_code: null,
    cost_center: null,
    project: null,
    sort_order: 0,
    created_at: '2024-06-15T14:30:00Z',
    ...overrides,
  }
}

export function makeDocumentAttachment(
  overrides: Partial<DocumentAttachment> = {}
): DocumentAttachment {
  return {
    id: nextId(),
    user_id: 'user-1',
    storage_path: 'documents/user-1/file.pdf',
    file_name: 'file.pdf',
    file_size_bytes: 1024,
    mime_type: 'application/pdf',
    sha256_hash: 'abc123',
    version: 1,
    original_id: null,
    superseded_by_id: null,
    is_current_version: true,
    uploaded_by: 'user-1',
    upload_source: 'file_upload',
    digitization_date: '2024-06-15T14:30:00Z',
    journal_entry_id: null,
    journal_entry_line_id: null,
    prev_version_hash: null,
    last_integrity_check_at: null,
    created_at: '2024-06-15T14:30:00Z',
    updated_at: '2024-06-15T14:30:00Z',
    ...overrides,
  }
}

export function makeTaxCode(overrides: Partial<TaxCode> = {}): TaxCode {
  return {
    id: nextId(),
    user_id: null,
    code: 'MP1',
    description: 'Utgående moms 25%',
    rate: 25,
    moms_basis_boxes: ['05'],
    moms_tax_boxes: ['10'],
    moms_input_boxes: [],
    is_output_vat: true,
    is_reverse_charge: false,
    is_eu: false,
    is_export: false,
    is_oss: false,
    is_system: true,
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
    ...overrides,
  }
}
