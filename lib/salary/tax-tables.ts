/**
 * Tax table lookup via Skatteverket's open data API.
 *
 * Uses the free, public EntryScape rowstore API — no authentication required.
 * Endpoints:
 *   - Tax tables: https://skatteverket.entryscape.net/rowstore/dataset/88320397-5c32-4c16-ae79-d36d95b17b95
 *   - Kommun rates: https://skatteverket.entryscape.net/rowstore/dataset/c67b320b-ffee-4876-b073-dd9236cd2a99
 *
 * Per Skatteförfarandelagen: Tax withholding must use the correct table/column
 * for each employee based on their folkbokföringskommun.
 *
 * Results are cached in-memory per salary run calculation to avoid redundant
 * API calls (one call fetches all brackets for a table/column combination).
 */

import { createLogger } from '@/lib/logger'

const log = createLogger('tax-tables')

const TAX_TABLE_API = 'https://skatteverket.entryscape.net/rowstore/dataset/88320397-5c32-4c16-ae79-d36d95b17b95'
const KOMMUN_RATES_API = 'https://skatteverket.entryscape.net/rowstore/dataset/c67b320b-ffee-4876-b073-dd9236cd2a99'

export interface TaxTableRate {
  tableYear: number
  tableNumber: number
  columnNumber: number
  incomeFrom: number
  incomeTo: number
  taxAmount: number
}

// In-memory cache: "year-table-column" → rates
const rateCache = new Map<string, { rates: TaxTableRate[]; fetchedAt: number }>()
const CACHE_TTL_MS = 60 * 60 * 1000 // 1 hour

/**
 * Look up tax amount for a given monthly income using Skatteverket's API.
 *
 * Fetches the matching bracket from the API (or cache) and returns the
 * tax amount in SEK for the given income.
 */
export async function lookupTaxFromApi(
  tableNumber: number,
  column: number,
  monthlyIncome: number,
  year: number = new Date().getFullYear()
): Promise<number> {
  const rates = await fetchTaxTableRates(year, tableNumber, column)
  return lookupTaxAmount(tableNumber, column, monthlyIncome, rates)
}

/**
 * Look up the tax amount from pre-loaded rates (pure function, no API call).
 */
export function lookupTaxAmount(
  tableNumber: number,
  column: number,
  monthlyIncome: number,
  rates: TaxTableRate[]
): number {
  const roundedIncome = Math.round(monthlyIncome)

  const matchingRates = rates.filter(
    r => r.tableNumber === tableNumber && r.columnNumber === column
  )

  if (matchingRates.length === 0) {
    // Fallback: 30% flat rate if table not found
    return Math.round(roundedIncome * 0.30 * 100) / 100
  }

  matchingRates.sort((a, b) => a.incomeFrom - b.incomeFrom)

  for (const rate of matchingRates) {
    if (roundedIncome >= rate.incomeFrom && roundedIncome <= rate.incomeTo) {
      return rate.taxAmount
    }
  }

  // Above all brackets — use last bracket
  const lastRate = matchingRates[matchingRates.length - 1]
  if (roundedIncome > lastRate.incomeTo) {
    return lastRate.taxAmount
  }

  return 0
}

/**
 * Fetch tax table rates from Skatteverket's open data API.
 * Returns all brackets for a specific year/table/column combination.
 * Results are cached in-memory for 1 hour.
 */
export async function fetchTaxTableRates(
  year: number,
  tableNumber: number,
  column: number
): Promise<TaxTableRate[]> {
  const cacheKey = `${year}-${tableNumber}-${column}`
  const cached = rateCache.get(cacheKey)
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return cached.rates
  }

  try {
    // Fetch all B-rows (absolute amounts) for this table/year
    // The API field names have Swedish characters: "år", "inkomst fr.o.m.", "inkomst t.o.m."
    const params = new URLSearchParams({
      'år': year.toString(),
      'tabellnr': tableNumber.toString(),
      'antal dgr': '30B', // Monthly table, absolute amounts
      '_limit': '500',
    })

    const url = `${TAX_TABLE_API}?${params.toString()}`
    log.info(`Fetching tax table ${tableNumber} col ${column} for ${year} from Skatteverket API`)

    const response = await fetch(url, {
      headers: { 'Accept': 'application/json' },
      signal: AbortSignal.timeout(10000),
    })

    if (!response.ok) {
      throw new Error(`Skatteverket API returned ${response.status}`)
    }

    const data = await response.json() as {
      results: Array<{
        'år': string
        'tabellnr': string
        'inkomst fr.o.m.': string
        'inkomst t.o.m.': string
        'kolumn 1': string
        'kolumn 2': string
        'kolumn 3': string
        'kolumn 4': string
        'kolumn 5': string
        'kolumn 6': string
      }>
      resultCount: number
    }

    // If more than 500 results, fetch remaining pages
    let allResults = data.results
    if (data.resultCount > 500) {
      let offset = 500
      while (offset < data.resultCount) {
        const pageParams = new URLSearchParams({
          'år': year.toString(),
          'tabellnr': tableNumber.toString(),
          'antal dgr': '30B',
          '_limit': '500',
          '_offset': offset.toString(),
        })
        const pageRes = await fetch(`${TAX_TABLE_API}?${pageParams.toString()}`, {
          headers: { 'Accept': 'application/json' },
          signal: AbortSignal.timeout(10000),
        })
        if (pageRes.ok) {
          const pageData = await pageRes.json() as { results: typeof data.results }
          allResults = allResults.concat(pageData.results)
        }
        offset += 500
      }
    }

    // Parse results — each row has all 6 columns, we extract the requested one
    const columnKey = `kolumn ${column}` as keyof typeof allResults[0]
    const rates: TaxTableRate[] = allResults.map(r => ({
      tableYear: year,
      tableNumber: tableNumber,
      columnNumber: column,
      incomeFrom: parseInt(r['inkomst fr.o.m.']) || 0,
      incomeTo: parseInt(r['inkomst t.o.m.']) || 9999999,
      taxAmount: parseInt(r[columnKey] as string) || 0,
    }))

    // Cache the results
    rateCache.set(cacheKey, { rates, fetchedAt: Date.now() })

    log.info(`Fetched ${rates.length} tax brackets for table ${tableNumber} col ${column} (${year})`)
    return rates
  } catch (err) {
    log.warn(`Failed to fetch tax table from API: ${err instanceof Error ? err.message : 'unknown'}. Falling back to 30%.`)
    return []
  }
}

/**
 * Fetch all tax table rates for a year (all tables/columns for a salary run).
 * Used by the calculate route for bulk lookups.
 */
export async function fetchAllTaxTableRatesForRun(
  year: number,
  tableNumbers: number[],
  columns: number[]
): Promise<TaxTableRate[]> {
  const allRates: TaxTableRate[] = []
  const uniquePairs = new Set<string>()

  for (const table of tableNumbers) {
    for (const col of columns) {
      const key = `${table}-${col}`
      if (uniquePairs.has(key)) continue
      uniquePairs.add(key)

      const rates = await fetchTaxTableRates(year, table, col)
      allRates.push(...rates)
    }
  }

  return allRates
}

/**
 * Fetch kommun → tax table number mapping from Skatteverket's open data API.
 */
export async function fetchKommunTaxRates(year: number): Promise<Array<{
  kommun: string
  totalRate: number
  tableNumber: number
}>> {
  const params = new URLSearchParams({
    'år': year.toString(),
    '_limit': '500',
  })

  const response = await fetch(`${KOMMUN_RATES_API}?${params.toString()}`, {
    headers: { 'Accept': 'application/json' },
    signal: AbortSignal.timeout(10000),
  })

  if (!response.ok) {
    throw new Error(`Kommun rates API returned ${response.status}`)
  }

  const data = await response.json() as {
    results: Array<{
      'kommun': string
      'summa, exkl. kyrkoavgift': string
    }>
  }

  // Deduplicate by kommun (multiple församlingar per kommun)
  const byKommun = new Map<string, number>()
  for (const r of data.results) {
    const rate = parseFloat(r['summa, exkl. kyrkoavgift'])
    if (!byKommun.has(r.kommun)) {
      byKommun.set(r.kommun, rate)
    }
  }

  return Array.from(byKommun.entries()).map(([kommun, rate]) => ({
    kommun,
    totalRate: rate,
    // Table number: round total rate. ≤0.50 rounds down, ≥0.51 rounds up
    tableNumber: Math.round(rate),
  }))
}

// ── Legacy compatibility (used by calculation-engine.ts) ──

/**
 * Calculate tax using jämkning (custom percentage from Skatteverket decision).
 */
export function calculateJamkningTax(monthlyIncome: number, jamkningPercentage: number): number {
  return Math.round(monthlyIncome * (jamkningPercentage / 100) * 100) / 100
}

/**
 * Calculate tax for sidoinkomst (flat 30%).
 */
export function calculateSidoinkomstTax(monthlyIncome: number): number {
  return Math.round(monthlyIncome * 0.30 * 100) / 100
}

/**
 * Clear the in-memory tax table cache. Used in tests.
 */
export function clearTaxTableCache(): void {
  rateCache.clear()
}
