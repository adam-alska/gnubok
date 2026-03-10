import { FortnoxRateLimiter, fetchAllPages } from '../fortnox-paginated-fetcher'

// Mock global fetch
const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

describe('FortnoxRateLimiter', () => {
  it('allows requests under the limit', async () => {
    const limiter = new FortnoxRateLimiter()
    const start = Date.now()

    // 5 requests should be instant
    for (let i = 0; i < 5; i++) {
      await limiter.waitIfNeeded()
    }

    expect(Date.now() - start).toBeLessThan(500)
  })
})

describe('fetchAllPages', () => {
  const rateLimiter = new FortnoxRateLimiter()

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('fetches a single page', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          Customers: [
            { CustomerNumber: '1', Name: 'Test' },
            { CustomerNumber: '2', Name: 'Test 2' },
          ],
          MetaInformation: {
            '@CurrentPage': 1,
            '@TotalPages': 1,
            '@TotalResources': 2,
          },
        }),
    })

    const result = await fetchAllPages(
      'test-token',
      '/3/customers',
      'Customers',
      rateLimiter
    )

    expect(result).toHaveLength(2)
    expect(result[0]).toEqual({ CustomerNumber: '1', Name: 'Test' })

    expect(mockFetch).toHaveBeenCalledTimes(1)
    const callUrl = mockFetch.mock.calls[0][0]
    expect(callUrl).toContain('/3/customers')
    expect(callUrl).toContain('page=1')
  })

  it('fetches multiple pages', async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            Items: [{ id: 1 }],
            MetaInformation: {
              '@CurrentPage': 1,
              '@TotalPages': 3,
              '@TotalResources': 3,
            },
          }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            Items: [{ id: 2 }],
            MetaInformation: {
              '@CurrentPage': 2,
              '@TotalPages': 3,
              '@TotalResources': 3,
            },
          }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            Items: [{ id: 3 }],
            MetaInformation: {
              '@CurrentPage': 3,
              '@TotalPages': 3,
              '@TotalResources': 3,
            },
          }),
      })

    const result = await fetchAllPages(
      'test-token',
      '/3/items',
      'Items',
      rateLimiter
    )

    expect(result).toHaveLength(3)
    expect(mockFetch).toHaveBeenCalledTimes(3)
  })

  it('passes financial year as query param', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          Accounts: [],
          MetaInformation: { '@CurrentPage': 1, '@TotalPages': 1, '@TotalResources': 0 },
        }),
    })

    await fetchAllPages('test-token', '/3/accounts', 'Accounts', rateLimiter, 2)

    const callUrl = mockFetch.mock.calls[0][0]
    expect(callUrl).toContain('financialyear=2')
  })

  it('throws on API error', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 403,
      text: () => Promise.resolve('Forbidden'),
    })

    await expect(
      fetchAllPages('test-token', '/3/customers', 'Customers', rateLimiter)
    ).rejects.toThrow('Fortnox API error 403')
  })

  it('handles empty response key gracefully', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ MetaInformation: null }),
    })

    const result = await fetchAllPages(
      'test-token',
      '/3/test',
      'NonExistent',
      rateLimiter
    )

    expect(result).toEqual([])
  })
})
