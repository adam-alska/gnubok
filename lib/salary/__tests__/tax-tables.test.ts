import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  lookupTaxAmount,
  calculateJamkningTax,
  calculateSidoinkomstTax,
  fetchTaxTableRates,
  clearTaxTableCache,
  TaxTableUnavailableError,
} from '../tax-tables'
import type { TaxTableRate } from '../tax-tables'

const sampleRates: TaxTableRate[] = [
  { tableYear: 2026, tableNumber: 33, columnNumber: 1, incomeFrom: 0, incomeTo: 2200, taxAmount: 0 },
  { tableYear: 2026, tableNumber: 33, columnNumber: 1, incomeFrom: 2201, incomeTo: 20000, taxAmount: 2800 },
  { tableYear: 2026, tableNumber: 33, columnNumber: 1, incomeFrom: 20001, incomeTo: 30000, taxAmount: 5600 },
  { tableYear: 2026, tableNumber: 33, columnNumber: 1, incomeFrom: 30001, incomeTo: 40000, taxAmount: 8900 },
  { tableYear: 2026, tableNumber: 33, columnNumber: 1, incomeFrom: 40001, incomeTo: 50000, taxAmount: 12500 },
  { tableYear: 2026, tableNumber: 33, columnNumber: 1, incomeFrom: 50001, incomeTo: 60000, taxAmount: 16800 },
]

describe('lookupTaxAmount', () => {
  it('returns 0 for income below minimum bracket', () => {
    expect(lookupTaxAmount(33, 1, 1500, sampleRates)).toBe(0)
  })

  it('matches correct bracket for mid-range income', () => {
    expect(lookupTaxAmount(33, 1, 25000, sampleRates)).toBe(5600)
  })

  it('matches bracket boundary exactly', () => {
    expect(lookupTaxAmount(33, 1, 20001, sampleRates)).toBe(5600)
    expect(lookupTaxAmount(33, 1, 30000, sampleRates)).toBe(5600)
  })

  it('uses last bracket for income exceeding all brackets', () => {
    expect(lookupTaxAmount(33, 1, 100000, sampleRates)).toBe(16800)
  })

  it('throws TaxTableUnavailableError when no matching rates exist (no silent 30% fallback)', () => {
    expect(() => lookupTaxAmount(99, 1, 40000, sampleRates)).toThrow(TaxTableUnavailableError)
    expect(() => lookupTaxAmount(99, 1, 40000, sampleRates)).toThrow(/table 99/)
  })

  it('filters by correct column', () => {
    const rates: TaxTableRate[] = [
      ...sampleRates,
      { tableYear: 2026, tableNumber: 33, columnNumber: 2, incomeFrom: 0, incomeTo: 50000, taxAmount: 999 },
    ]
    expect(lookupTaxAmount(33, 2, 30000, rates)).toBe(999)
  })
})

describe('calculateJamkningTax', () => {
  it('calculates tax using custom percentage', () => {
    expect(calculateJamkningTax(40000, 20)).toBe(8000)
  })

  it('rounds to 2 decimal places', () => {
    expect(calculateJamkningTax(33333, 15.5)).toBe(5166.62)
  })
})

describe('calculateSidoinkomstTax', () => {
  it('calculates flat 30%', () => {
    expect(calculateSidoinkomstTax(40000)).toBe(12000)
  })

  it('rounds to 2 decimal places', () => {
    expect(calculateSidoinkomstTax(33333)).toBe(9999.90)
  })
})

describe('fetchTaxTableRates fallback behavior', () => {
  const originalFetch = globalThis.fetch

  beforeEach(() => {
    clearTaxTableCache()
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
    clearTaxTableCache()
  })

  it("falls back to local data when the Skatteverket API fails for a supported year", async () => {
    // Mock fetch to simulate API outage
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('network down'))

    const result = await fetchTaxTableRates(2026, 33, 1)

    expect(result.source).toBe('fallback')
    expect(result.rates.length).toBeGreaterThan(0)
    // Every rate should match the requested table/column/year
    for (const r of result.rates) {
      expect(r.tableYear).toBe(2026)
      expect(r.tableNumber).toBe(33)
      expect(r.columnNumber).toBe(1)
    }
  })

  it('marks source as api when the API returns data', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        resultCount: 1,
        results: [
          {
            'år': '2026',
            'tabellnr': '33',
            'inkomst fr.o.m.': '20001',
            'inkomst t.o.m.': '20100',
            'kolumn 1': '2800',
            'kolumn 2': '0',
            'kolumn 3': '2500',
            'kolumn 4': '100',
            'kolumn 5': '2800',
            'kolumn 6': '3000',
          },
        ],
      }),
    } as Response)

    const result = await fetchTaxTableRates(2026, 33, 1)

    expect(result.source).toBe('api')
    expect(result.rates[0].taxAmount).toBe(2800)
  })

  it('throws TaxTableUnavailableError when API fails and year has no fallback', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('network down'))

    await expect(fetchTaxTableRates(2020, 33, 1)).rejects.toBeInstanceOf(TaxTableUnavailableError)
    await expect(fetchTaxTableRates(2020, 33, 1)).rejects.toThrow(/2020/)
  })

  it('caches the fallback result so repeat calls do not re-trigger the failed API', async () => {
    const fetchSpy = vi.fn().mockRejectedValue(new Error('network down'))
    globalThis.fetch = fetchSpy

    await fetchTaxTableRates(2026, 33, 1)
    await fetchTaxTableRates(2026, 33, 1)

    // Only one API attempt despite two calls — second hit the cache
    expect(fetchSpy).toHaveBeenCalledTimes(1)
  })
})
