import { describe, it, expect } from 'vitest'
import { fetchCandidateTransactions } from '@/extensions/general/inbox-smart-match/lib/fetch-candidates'
import { createQueuedMockSupabase } from '@/tests/helpers'
import type { ReceiptExtractionResult } from '@/types'

function makeReceipt(overrides?: Partial<ReceiptExtractionResult>): ReceiptExtractionResult {
  return {
    merchant: { name: 'Willys Hemma', orgNumber: null, vatNumber: null, isForeign: false },
    receipt: { date: '2026-04-15', time: null, currency: 'SEK' },
    lineItems: [],
    totals: { subtotal: 239, vatAmount: 60, total: 299 },
    flags: { isRestaurant: false, isSystembolaget: false, isForeignMerchant: false },
    confidence: 0.9,
    ...overrides,
  } as ReceiptExtractionResult
}

describe('fetchCandidateTransactions', () => {
  it('returns empty list when extracted data is missing', async () => {
    const { supabase } = createQueuedMockSupabase()
    const result = await fetchCandidateTransactions(supabase as never, 'company-1', null)
    expect(result).toEqual([])
  })

  it('returns empty list when no anchors could be derived', async () => {
    const { supabase } = createQueuedMockSupabase()
    const result = await fetchCandidateTransactions(
      supabase as never,
      'company-1',
      makeReceipt({ totals: { subtotal: 0, vatAmount: 0, total: 0 } } as never)
    )
    expect(result).toEqual([])
  })

  it('ranks candidates by amount proximity and returns top 5', async () => {
    const { supabase, enqueue } = createQueuedMockSupabase()
    // 1. already-matched lookup (none)
    enqueue({ data: [] })
    // 2. candidate transactions
    enqueue({
      data: [
        { id: 't1', date: '2026-04-15', description: 'A', amount: -400, amount_sek: null, currency: 'SEK', merchant_name: null },
        { id: 't2', date: '2026-04-14', description: 'B', amount: -299, amount_sek: null, currency: 'SEK', merchant_name: null }, // perfect match
        { id: 't3', date: '2026-04-16', description: 'C', amount: -305, amount_sek: null, currency: 'SEK', merchant_name: null }, // close
        { id: 't4', date: '2026-04-15', description: 'D', amount: -150, amount_sek: null, currency: 'SEK', merchant_name: null },
        { id: 't5', date: '2026-04-13', description: 'E', amount: -298, amount_sek: null, currency: 'SEK', merchant_name: null },
        { id: 't6', date: '2026-04-15', description: 'F', amount: -600, amount_sek: null, currency: 'SEK', merchant_name: null },
      ],
    })

    const result = await fetchCandidateTransactions(supabase as never, 'company-1', makeReceipt())

    expect(result).toHaveLength(5)
    expect(result[0].id).toBe('t2') // exact match sorted first
    expect(result[1].id).toBe('t5') // ±1 next
  })

  it('excludes transactions already claimed by other inbox items', async () => {
    const { supabase, enqueue } = createQueuedMockSupabase()
    // 1. already-matched lookup — t2 is already taken
    enqueue({ data: [{ matched_transaction_id: 't2' }] })
    // 2. candidate transactions
    enqueue({
      data: [
        { id: 't1', date: '2026-04-15', description: 'A', amount: -400, amount_sek: null, currency: 'SEK', merchant_name: null },
        { id: 't2', date: '2026-04-14', description: 'B', amount: -299, amount_sek: null, currency: 'SEK', merchant_name: null },
        { id: 't3', date: '2026-04-16', description: 'C', amount: -305, amount_sek: null, currency: 'SEK', merchant_name: null },
      ],
    })

    const result = await fetchCandidateTransactions(supabase as never, 'company-1', makeReceipt())
    const ids = result.map((c) => c.id)
    expect(ids).not.toContain('t2')
    expect(ids).toContain('t3')
  })

  it('uses amount_sek when receipt is foreign currency', async () => {
    const { supabase, enqueue } = createQueuedMockSupabase()
    enqueue({ data: [] }) // no already-matched
    enqueue({
      data: [
        { id: 't1', date: '2026-04-15', description: 'USD-denom', amount: -895, amount_sek: -895, currency: 'SEK', merchant_name: null },
      ],
    })

    const usdReceipt = makeReceipt({
      receipt: { date: '2026-04-15', time: null, currency: 'USD' },
      totals: { subtotal: 80, vatAmount: 0, total: 85 },
    } as never)

    const result = await fetchCandidateTransactions(supabase as never, 'company-1', usdReceipt)
    // Amount doesn't perfectly match but the function should return it anyway
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('t1')
  })
})
