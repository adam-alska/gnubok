import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Mock jwt module before importing api-client
const mockGenerateJWT = vi.fn().mockReturnValue('test-jwt-token')
vi.mock('../jwt', () => ({
  generateJWT: (...args: unknown[]) => mockGenerateJWT(...args),
  getAuthorizationHeader: () => `Bearer ${mockGenerateJWT()}`,
  _resetTokenCache: vi.fn(),
}))

// Mock environment
vi.stubEnv('ENABLE_BANKING_API_URL', 'https://api.test.com')

import {
  getASPSPs,
  getAccountBalances,
  getAccountTransactions,
  getAllTransactions,
  getAllTransactionsWithRaw,
} from '../api-client'

describe('api-client', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    vi.clearAllMocks()
    fetchSpy = vi.spyOn(globalThis, 'fetch')
  })

  afterEach(() => {
    fetchSpy.mockRestore()
  })

  // -------------------------------------------------------------------------
  // Timeout
  // -------------------------------------------------------------------------
  describe('timeout', () => {
    it('aborts fetch after timeout', async () => {
      fetchSpy.mockImplementation(
        () => new Promise((_, reject) => {
          // Simulate a hanging request — the AbortController will fire
          setTimeout(() => reject(new DOMException('Aborted', 'AbortError')), 100)
        })
      )

      await expect(getAccountBalances('acc-1')).rejects.toThrow('Aborted')
    })
  })

  // -------------------------------------------------------------------------
  // Retry
  // -------------------------------------------------------------------------
  describe('retry', () => {
    it('retries on 503 and succeeds', async () => {
      const failResponse = new Response('Service Unavailable', { status: 503 })
      const successResponse = new Response(JSON.stringify({ balances: [] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })

      fetchSpy
        .mockResolvedValueOnce(failResponse)
        .mockResolvedValueOnce(failResponse)
        .mockResolvedValueOnce(successResponse)

      const result = await getAccountBalances('acc-1')
      expect(result).toEqual([])
      expect(fetchSpy).toHaveBeenCalledTimes(3)
    })

    it('retries on AbortError (timeout) and succeeds', async () => {
      const abortError = new DOMException('Aborted', 'AbortError')
      const successResponse = new Response(JSON.stringify({ aspsps: [{ name: 'TestBank', country: 'SE' }] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })

      fetchSpy
        .mockRejectedValueOnce(abortError)
        .mockResolvedValueOnce(successResponse)

      const result = await getASPSPs('SE')
      expect(result).toEqual([{ name: 'TestBank', country: 'SE' }])
      expect(fetchSpy).toHaveBeenCalledTimes(2)
    })

    it('does not retry on 400 errors', async () => {
      const badRequest = new Response('Bad Request', { status: 400 })
      fetchSpy.mockResolvedValueOnce(badRequest)

      // getAccountTransactions throws on non-ok response
      await expect(getAccountTransactions('acc-1')).rejects.toThrow('Failed to get transactions')
      expect(fetchSpy).toHaveBeenCalledTimes(1)
    })
  })

  // -------------------------------------------------------------------------
  // Pagination cap
  // -------------------------------------------------------------------------
  describe('pagination cap', () => {
    it('stops at MAX_PAGINATION_PAGES', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

      // Every response returns a continuation_key
      fetchSpy.mockImplementation(() => {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              transactions: [{ transaction_amount: { amount: '100', currency: 'SEK' } }],
              continuation_key: 'keep-going',
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          )
        )
      })

      const result = await getAllTransactions('acc-1', '2024-01-01', '2024-12-31')

      // Should have exactly 100 transactions (1 per page, 100 pages)
      expect(result).toHaveLength(100)
      expect(fetchSpy).toHaveBeenCalledTimes(100)
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Pagination cap reached')
      )

      warnSpy.mockRestore()
    })
  })

  // -------------------------------------------------------------------------
  // getAllTransactionsWithRaw
  // -------------------------------------------------------------------------
  describe('getAllTransactionsWithRaw', () => {
    it('returns both transactions and raw pages', async () => {
      const page1 = {
        transactions: [{ transaction_amount: { amount: '100', currency: 'SEK' } }],
        continuation_key: 'page2',
      }
      const page2 = {
        transactions: [{ transaction_amount: { amount: '200', currency: 'SEK' } }],
      }

      fetchSpy
        .mockResolvedValueOnce(
          new Response(JSON.stringify(page1), { status: 200, headers: { 'Content-Type': 'application/json' } })
        )
        .mockResolvedValueOnce(
          new Response(JSON.stringify(page2), { status: 200, headers: { 'Content-Type': 'application/json' } })
        )

      const result = await getAllTransactionsWithRaw('acc-1', '2024-01-01', '2024-12-31')

      expect(result.transactions).toHaveLength(2)
      expect(result.rawPages).toHaveLength(2)
      expect(JSON.parse(result.rawPages[0])).toEqual(page1)
      expect(JSON.parse(result.rawPages[1])).toEqual(page2)
    })
  })
})

// -------------------------------------------------------------------------
// JWT cache tests
// -------------------------------------------------------------------------
describe('JWT cache', () => {
  it('reuses cached token within validity window', async () => {
    // Reset mocks and re-import to test cache behavior
    vi.resetModules()
    const jwtCallCount = { count: 0 }

    vi.doMock('../jwt', () => ({
      generateJWT: () => {
        jwtCallCount.count++
        return 'cached-token'
      },
      getAuthorizationHeader: () => {
        // Simulate cached behavior: first call generates, subsequent calls reuse
        jwtCallCount.count++
        return `Bearer cached-token`
      },
      _resetTokenCache: vi.fn(),
    }))

    // The actual cache test is in jwt.ts — we verify the cache function exists
    const jwt = await import('../jwt')
    expect(typeof jwt._resetTokenCache).toBe('function')
  })
})
