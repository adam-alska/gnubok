import { describe, it, expect } from 'vitest'
import { generateSCBCsv, generateSCBFilename } from '../scb-csv-generator'
import type { IntrastatReport, IntrastatLine } from '../intrastat-engine'

// ── Fixtures ────────────────────────────────────────────────

function makeLine(overrides: Partial<IntrastatLine> = {}): IntrastatLine {
  return {
    cnCode: '72163100',
    partnerCountry: 'DE',
    countryOfOrigin: 'SE',
    transactionNature: '11',
    deliveryTerms: 'FCA',
    invoicedValue: 100000,
    netMass: 4550,
    supplementaryUnit: null,
    supplementaryUnitType: null,
    partnerVatId: 'DE123456789',
    ...overrides,
  }
}

function makeReport(overrides: Partial<IntrastatReport> = {}): IntrastatReport {
  return {
    period: { year: 2026, month: 1 },
    reporterVatNumber: 'SE556677889901',
    reporterName: 'Test AB',
    flowType: 'dispatch',
    lines: [makeLine()],
    totals: { invoicedValue: 100000, netMass: 4550, lineCount: 1 },
    thresholdStatus: {
      cumulativeValue: 100000,
      threshold: 12000000,
      isObligated: false,
      percentageUsed: 0.83,
    },
    warnings: [],
    invoiceCount: 1,
    ...overrides,
  }
}

// ── CSV generation ──────────────────────────────────────────

describe('generateSCBCsv', () => {
  it('starts with UTF-8 BOM', () => {
    const csv = generateSCBCsv(makeReport())
    expect(csv.charCodeAt(0)).toBe(0xFEFF)
  })

  it('has correct header row', () => {
    const csv = generateSCBCsv(makeReport())
    const lines = csv.replace('\uFEFF', '').split('\r\n')
    expect(lines[0]).toBe(
      'CN-kod;Partnerland;Ursprungsland;Transaktionstyp;Leveransvillkor;Fakturerat värde (SEK);Nettovikt (kg);Kompletterande enhet;Partner-VAT'
    )
  })

  it('uses semicolons as delimiter', () => {
    const csv = generateSCBCsv(makeReport())
    const lines = csv.replace('\uFEFF', '').split('\r\n')
    // Header has 9 columns = 8 semicolons
    expect(lines[0].split(';')).toHaveLength(9)
    // Data row also has 9 columns
    expect(lines[1].split(';')).toHaveLength(9)
  })

  it('uses CRLF line endings', () => {
    const csv = generateSCBCsv(makeReport())
    expect(csv).toContain('\r\n')
    // Should not contain lone LF without preceding CR
    const withoutCRLF = csv.replace(/\r\n/g, '')
    expect(withoutCRLF).not.toContain('\n')
  })

  it('ends with CRLF', () => {
    const csv = generateSCBCsv(makeReport())
    expect(csv.endsWith('\r\n')).toBe(true)
  })

  it('renders data row with correct values', () => {
    const csv = generateSCBCsv(makeReport())
    const lines = csv.replace('\uFEFF', '').split('\r\n')
    const cols = lines[1].split(';')
    expect(cols[0]).toBe('72163100')    // CN-kod
    expect(cols[1]).toBe('DE')           // Partnerland
    expect(cols[2]).toBe('SE')           // Ursprungsland
    expect(cols[3]).toBe('11')           // Transaktionstyp
    expect(cols[4]).toBe('FCA')          // Leveransvillkor
    expect(cols[5]).toBe('100000')       // Fakturerat värde
    expect(cols[6]).toBe('4550')         // Nettovikt
    expect(cols[7]).toBe('')             // Kompletterande enhet (null)
    expect(cols[8]).toBe('DE123456789')  // Partner-VAT
  })

  it('rounds invoiced value to whole SEK', () => {
    const csv = generateSCBCsv(makeReport({
      lines: [makeLine({ invoicedValue: 123456.78 })],
    }))
    const lines = csv.replace('\uFEFF', '').split('\r\n')
    const value = lines[1].split(';')[5]
    expect(value).toBe('123457') // Rounded up
  })

  it('formats integer mass without decimals', () => {
    const csv = generateSCBCsv(makeReport({
      lines: [makeLine({ netMass: 4550 })],
    }))
    const lines = csv.replace('\uFEFF', '').split('\r\n')
    const mass = lines[1].split(';')[6]
    expect(mass).toBe('4550')
  })

  it('formats fractional mass with up to 3 decimal places', () => {
    const csv = generateSCBCsv(makeReport({
      lines: [makeLine({ netMass: 45.123 })],
    }))
    const lines = csv.replace('\uFEFF', '').split('\r\n')
    const mass = lines[1].split(';')[6]
    expect(mass).toBe('45.123')
  })

  it('removes trailing zeros from mass', () => {
    const csv = generateSCBCsv(makeReport({
      lines: [makeLine({ netMass: 45.1 })],
    }))
    const lines = csv.replace('\uFEFF', '').split('\r\n')
    const mass = lines[1].split(';')[6]
    expect(mass).toBe('45.1')
  })

  it('rounds mass to max 3 decimal places', () => {
    const csv = generateSCBCsv(makeReport({
      lines: [makeLine({ netMass: 45.12345 })],
    }))
    const lines = csv.replace('\uFEFF', '').split('\r\n')
    const mass = lines[1].split(';')[6]
    expect(mass).toBe('45.123')
  })

  it('includes supplementary unit when present', () => {
    const csv = generateSCBCsv(makeReport({
      lines: [makeLine({ supplementaryUnit: 150 })],
    }))
    const lines = csv.replace('\uFEFF', '').split('\r\n')
    const suppUnit = lines[1].split(';')[7]
    expect(suppUnit).toBe('150')
  })

  it('rounds supplementary unit to whole number', () => {
    const csv = generateSCBCsv(makeReport({
      lines: [makeLine({ supplementaryUnit: 150.7 })],
    }))
    const lines = csv.replace('\uFEFF', '').split('\r\n')
    const suppUnit = lines[1].split(';')[7]
    expect(suppUnit).toBe('151')
  })

  it('renders multiple data rows', () => {
    const report = makeReport({
      lines: [
        makeLine({ cnCode: '72163100', partnerCountry: 'DE' }),
        makeLine({ cnCode: '84818019', partnerCountry: 'FI', partnerVatId: 'FI12345678' }),
      ],
    })
    const csv = generateSCBCsv(report)
    const lines = csv.replace('\uFEFF', '').split('\r\n').filter(l => l.length > 0)
    expect(lines).toHaveLength(3) // header + 2 data rows
    expect(lines[1].split(';')[0]).toBe('72163100')
    expect(lines[2].split(';')[0]).toBe('84818019')
  })

  it('generates empty CSV with only header when no lines', () => {
    const csv = generateSCBCsv(makeReport({ lines: [] }))
    const lines = csv.replace('\uFEFF', '').split('\r\n').filter(l => l.length > 0)
    expect(lines).toHaveLength(1) // header only
    expect(lines[0]).toContain('CN-kod')
  })
})

// ── Filename generation ─────────────────────────────────────

describe('generateSCBFilename', () => {
  it('generates correct filename', () => {
    const filename = generateSCBFilename(makeReport())
    expect(filename).toBe('INTRASTAT_SE556677889901_2026-01.csv')
  })

  it('pads single-digit month', () => {
    const filename = generateSCBFilename(makeReport({ period: { year: 2026, month: 3 } }))
    expect(filename).toBe('INTRASTAT_SE556677889901_2026-03.csv')
  })

  it('does not pad double-digit month', () => {
    const filename = generateSCBFilename(makeReport({ period: { year: 2026, month: 12 } }))
    expect(filename).toBe('INTRASTAT_SE556677889901_2026-12.csv')
  })

  it('strips whitespace from VAT number', () => {
    const filename = generateSCBFilename(makeReport({ reporterVatNumber: 'SE 5566 7788 9901' }))
    expect(filename).toBe('INTRASTAT_SE556677889901_2026-01.csv')
  })
})
