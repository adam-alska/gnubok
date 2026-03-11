/**
 * Paginated fetcher for Fortnox API v3 with rate limiting.
 * Fortnox enforces ~25 requests per 5 seconds.
 */

import type { FortnoxMetaInformation } from './fortnox-types'

/**
 * Thrown when Fortnox returns error 2000663 ("Har inte behörighet för scope").
 * This means the OAuth token doesn't have the scope required for the endpoint.
 */
export class FortnoxScopeError extends Error {
  constructor(endpoint: string) {
    super(`Missing Fortnox scope for endpoint: ${endpoint}`)
    this.name = 'FortnoxScopeError'
  }
}

/**
 * Thrown when the Fortnox account lacks the required license/module
 * (e.g. payroll module not enabled). Error code 0 with "Behörighet saknas".
 */
export class FortnoxLicenseError extends Error {
  constructor(endpoint: string) {
    super(`Fortnox-kontot saknar licens för: ${endpoint}`)
    this.name = 'FortnoxLicenseError'
  }
}

const RATE_LIMIT_WINDOW_MS = 5000
const MAX_REQUESTS_PER_WINDOW = 25

export class FortnoxRateLimiter {
  private timestamps: number[] = []

  async waitIfNeeded(): Promise<void> {
    const now = Date.now()
    // Remove timestamps outside the window
    this.timestamps = this.timestamps.filter((t) => now - t < RATE_LIMIT_WINDOW_MS)

    if (this.timestamps.length >= MAX_REQUESTS_PER_WINDOW) {
      const oldestInWindow = this.timestamps[0]
      const waitMs = RATE_LIMIT_WINDOW_MS - (now - oldestInWindow) + 100
      if (waitMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, waitMs))
      }
      // Clean up again after waiting
      const afterWait = Date.now()
      this.timestamps = this.timestamps.filter((t) => afterWait - t < RATE_LIMIT_WINDOW_MS)
    }

    this.timestamps.push(Date.now())
  }
}

interface FetchPageOptions {
  accessToken: string
  baseUrl: string
  responseKey: string
  rateLimiter: FortnoxRateLimiter
  financialYear?: number
}

async function fetchPage<T>(
  options: FetchPageOptions,
  page: number
): Promise<{ items: T[]; meta: FortnoxMetaInformation | null }> {
  const { accessToken, baseUrl, responseKey, rateLimiter, financialYear } = options

  await rateLimiter.waitIfNeeded()

  const url = new URL(`https://api.fortnox.se${baseUrl}`)
  url.searchParams.set('page', String(page))
  if (financialYear !== undefined) {
    url.searchParams.set('financialyear', String(financialYear))
  }

  const response = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${accessToken}` },
  })

  if (!response.ok) {
    const body = await response.text()
    // Detect Fortnox scope permission error (code 2000663)
    if (response.status === 400 && body.includes('2000663')) {
      throw new FortnoxScopeError(baseUrl)
    }
    // Detect missing license/module (code 0, "Behörighet saknas")
    if (response.status === 400 && body.includes('Beh\u00f6righet saknas')) {
      throw new FortnoxLicenseError(baseUrl)
    }
    throw new Error(`Fortnox API error ${response.status}: ${body}`)
  }

  const data = await response.json()
  const items = (data[responseKey] ?? []) as T[]
  const meta = (data.MetaInformation ?? null) as FortnoxMetaInformation | null

  return { items, meta }
}

/**
 * Fetch all pages of a paginated Fortnox endpoint.
 */
export async function fetchAllPages<T>(
  accessToken: string,
  endpoint: string,
  responseKey: string,
  rateLimiter: FortnoxRateLimiter,
  financialYear?: number
): Promise<T[]> {
  const options: FetchPageOptions = {
    accessToken,
    baseUrl: endpoint,
    responseKey,
    rateLimiter,
    financialYear,
  }

  const firstPage = await fetchPage<T>(options, 1)
  const allItems = [...firstPage.items]

  if (firstPage.meta && firstPage.meta['@TotalPages'] > 1) {
    const totalPages = firstPage.meta['@TotalPages']
    for (let page = 2; page <= totalPages; page++) {
      const result = await fetchPage<T>(options, page)
      allItems.push(...result.items)
    }
  }

  return allItems
}

/**
 * Fetch a single (non-paginated) resource from Fortnox.
 * Used for endpoints like /3/companyinformation and /3/settings/lockedperiod
 * that return a single object instead of a paginated list.
 */
export async function fetchSingleResource<T>(
  accessToken: string,
  endpoint: string,
  responseKey: string,
  rateLimiter: FortnoxRateLimiter
): Promise<T> {
  await rateLimiter.waitIfNeeded()

  const url = `https://api.fortnox.se${endpoint}`
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })

  if (!response.ok) {
    const body = await response.text()
    if (response.status === 400 && body.includes('2000663')) {
      throw new FortnoxScopeError(endpoint)
    }
    if (response.status === 400 && body.includes('Beh\u00f6righet saknas')) {
      throw new FortnoxLicenseError(endpoint)
    }
    throw new Error(`Fortnox API error ${response.status}: ${body}`)
  }

  const data = await response.json()
  return data[responseKey] as T
}

/**
 * Fetch individual detail records from Fortnox.
 * Used when the list endpoint returns abbreviated data.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function fetchDetails<TList extends Record<string, any>, TDetail>(
  accessToken: string,
  endpoint: string,
  detailResponseKey: string,
  items: TList[],
  idField: keyof TList & string,
  rateLimiter: FortnoxRateLimiter
): Promise<TDetail[]> {
  const details: TDetail[] = []

  for (const item of items) {
    const id = item[idField]
    await rateLimiter.waitIfNeeded()

    const url = `https://api.fortnox.se${endpoint}/${id}`
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })

    if (!response.ok) {
      console.error(`[fortnox-fetcher] Detail fetch failed for ${endpoint}/${id}: ${response.status}`)
      continue
    }

    const data = await response.json()
    const detail = data[detailResponseKey] as TDetail | undefined
    if (detail) {
      details.push(detail)
    }
  }

  return details
}
