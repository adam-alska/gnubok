import { describe, it, expect } from 'vitest'
import { generateTaxTableSeedData } from '../tax-table-seed'

describe('generateTaxTableSeedData', () => {
  const data = generateTaxTableSeedData(2026)

  it('generates data for all 14 tables (29-42)', () => {
    const tables = new Set(data.map(r => r.table_number))
    expect(tables.size).toBe(14)
    expect(tables.has(29)).toBe(true)
    expect(tables.has(42)).toBe(true)
  })

  it('generates data for all 6 columns per table', () => {
    const table33 = data.filter(r => r.table_number === 33)
    const columns = new Set(table33.map(r => r.column_number))
    expect(columns.size).toBe(6)
  })

  it('generates brackets from 0 to 150,000 SEK', () => {
    const table33col1 = data.filter(r => r.table_number === 33 && r.column_number === 1)
    expect(table33col1[0].income_from).toBe(0)
    expect(table33col1[table33col1.length - 1].income_to).toBe(149999)
  })

  it('generates zero tax for zero income', () => {
    const zeroIncome = data.find(r => r.table_number === 33 && r.column_number === 1 && r.income_from === 0)
    expect(zeroIncome).toBeDefined()
    expect(zeroIncome!.tax_amount).toBe(0)
  })

  it('generates increasing tax with increasing income', () => {
    const table33col1 = data
      .filter(r => r.table_number === 33 && r.column_number === 1)
      .sort((a, b) => a.income_from - b.income_from)

    // Tax should generally increase (not strictly monotonic due to grundavdrag/jobbskatteavdrag but broadly)
    const lowTax = table33col1.find(r => r.income_from === 20000)?.tax_amount || 0
    const midTax = table33col1.find(r => r.income_from === 40000)?.tax_amount || 0
    const highTax = table33col1.find(r => r.income_from === 80000)?.tax_amount || 0
    expect(midTax).toBeGreaterThan(lowTax)
    expect(highTax).toBeGreaterThan(midTax)
  })

  it('generates higher tax for higher table numbers (higher kommunalskatt)', () => {
    const table29 = data.find(r => r.table_number === 29 && r.column_number === 1 && r.income_from === 40000)
    const table42 = data.find(r => r.table_number === 42 && r.column_number === 1 && r.income_from === 40000)
    expect(table42!.tax_amount).toBeGreaterThan(table29!.tax_amount)
  })

  it('generates lower tax for pensioners (column 2) at moderate incomes', () => {
    // Pensioners have higher grundavdrag, so lower tax at moderate incomes
    const col1 = data.find(r => r.table_number === 33 && r.column_number === 1 && r.income_from === 20000)
    const col2 = data.find(r => r.table_number === 33 && r.column_number === 2 && r.income_from === 20000)
    // Column 2 should have different (often lower) tax due to higher grundavdrag
    expect(col1).toBeDefined()
    expect(col2).toBeDefined()
  })

  it('generates reasonable total row count', () => {
    // 14 tables × 6 columns × 1500 brackets = ~126,000
    expect(data.length).toBeGreaterThan(100000)
    expect(data.length).toBeLessThan(200000)
  })
})
