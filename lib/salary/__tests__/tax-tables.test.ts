import { describe, it, expect } from 'vitest'
import { lookupTaxAmount, calculateJamkningTax, calculateSidoinkomstTax } from '../tax-tables'
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

  it('falls back to 30% when table not found', () => {
    expect(lookupTaxAmount(99, 1, 40000, sampleRates)).toBe(12000)
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
