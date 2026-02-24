import { describe, it, expect } from 'vitest'
import { generateCSV, generateCSVFilename } from '../csv-generator'
import type { ECSalesListReport } from '../eu-sales-list-engine'

function makeReport(overrides: Partial<ECSalesListReport> = {}): ECSalesListReport {
  return {
    period: { year: 2026, quarter: 1 },
    filingType: 'quarterly',
    reporterVatNumber: 'SE556677889901',
    reporterName: 'Test AB',
    lines: [
      {
        customerVatNumber: 'DE123456789',
        customerName: 'Acme GmbH',
        customerCountry: 'DE',
        customerId: 'cust-1',
        goodsAmount: 50000,
        servicesAmount: 30000,
        triangulationAmount: 0,
        invoiceCount: 3,
      },
    ],
    totals: { goods: 50000, services: 30000, triangulation: 0, total: 80000 },
    warnings: [],
    crossCheck: null,
    invoiceCount: 3,
    customerCount: 1,
    ...overrides,
  }
}

describe('generateCSV', () => {
  it('starts with UTF-8 BOM', () => {
    const csv = generateCSV(makeReport())
    expect(csv.charCodeAt(0)).toBe(0xFEFF)
  })

  it('uses semicolons as delimiter', () => {
    const csv = generateCSV(makeReport())
    const headerLine = csv.split('\r\n')[0].replace('\uFEFF', '')
    expect(headerLine).toContain(';')
    expect(headerLine).not.toContain(',')
  })

  it('has correct header columns', () => {
    const csv = generateCSV(makeReport())
    const header = csv.split('\r\n')[0].replace('\uFEFF', '')
    expect(header).toBe('Land;VAT-nummer;Varuförsäljning (SEK);Tjänsteförsäljning (SEK);Trepartshandel (SEK)')
  })

  it('includes customer data rows', () => {
    const csv = generateCSV(makeReport())
    const lines = csv.split('\r\n')
    expect(lines[1]).toBe('DE;DE123456789;50000;30000;0')
  })

  it('rounds amounts to whole SEK', () => {
    const report = makeReport({
      lines: [{
        customerVatNumber: 'DE123',
        customerName: 'Test',
        customerCountry: 'DE',
        customerId: 'c-1',
        goodsAmount: 12345.67,
        servicesAmount: 89012.34,
        triangulationAmount: 0,
        invoiceCount: 1,
      }],
      totals: { goods: 12345.67, services: 89012.34, triangulation: 0, total: 101358.01 },
    })

    const csv = generateCSV(report)
    const dataLine = csv.split('\r\n')[1]
    expect(dataLine).toBe('DE;DE123;12346;89012;0')
  })

  it('includes summary row', () => {
    const csv = generateCSV(makeReport())
    const lines = csv.split('\r\n')
    const summaryIndex = lines.findIndex(l => l.startsWith('Summa'))
    expect(summaryIndex).toBeGreaterThan(0)
    expect(lines[summaryIndex]).toBe('Summa;;50000;30000;0')
  })

  it('uses CRLF line endings', () => {
    const csv = generateCSV(makeReport())
    expect(csv).toContain('\r\n')
  })

  it('handles multiple customers', () => {
    const report = makeReport({
      lines: [
        {
          customerVatNumber: 'DE111',
          customerName: 'A',
          customerCountry: 'DE',
          customerId: 'c-1',
          goodsAmount: 10000,
          servicesAmount: 0,
          triangulationAmount: 0,
          invoiceCount: 1,
        },
        {
          customerVatNumber: 'FR222',
          customerName: 'B',
          customerCountry: 'FR',
          customerId: 'c-2',
          goodsAmount: 0,
          servicesAmount: 20000,
          triangulationAmount: 0,
          invoiceCount: 2,
        },
      ],
    })

    const csv = generateCSV(report)
    const lines = csv.split('\r\n')
    expect(lines[1]).toBe('DE;DE111;10000;0;0')
    expect(lines[2]).toBe('FR;FR222;0;20000;0')
  })
})

describe('generateCSVFilename', () => {
  it('generates quarterly filename', () => {
    const filename = generateCSVFilename(makeReport())
    expect(filename).toBe('PS_SE556677889901_2026-Q1.csv')
  })

  it('generates monthly filename', () => {
    const report = makeReport({ period: { year: 2026, month: 3 }, filingType: 'monthly' })
    const filename = generateCSVFilename(report)
    expect(filename).toBe('PS_SE556677889901_2026-03.csv')
  })

  it('strips spaces from VAT number', () => {
    const report = makeReport({ reporterVatNumber: 'SE 5566 7788 9901' })
    const filename = generateCSVFilename(report)
    expect(filename).toBe('PS_SE556677889901_2026-Q1.csv')
  })
})
