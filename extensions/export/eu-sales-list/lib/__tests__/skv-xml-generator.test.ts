import { describe, it, expect } from 'vitest'
import { generateSKVXml, generateXMLFilename } from '../skv-xml-generator'
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

describe('generateSKVXml', () => {
  it('starts with XML declaration', () => {
    const xml = generateSKVXml(makeReport())
    expect(xml).toMatch(/^<\?xml version="1\.0" encoding="UTF-8"\?>/)
  })

  it('wraps content in KVPS root element', () => {
    const xml = generateSKVXml(makeReport())
    expect(xml).toContain('<KVPS>')
    expect(xml).toContain('</KVPS>')
  })

  it('includes reporter VAT number', () => {
    const xml = generateSKVXml(makeReport())
    expect(xml).toContain('<Momsregistreringsnummer>SE556677889901</Momsregistreringsnummer>')
  })

  it('includes reporter name', () => {
    const xml = generateSKVXml(makeReport())
    expect(xml).toContain('<Namn>Test AB</Namn>')
  })

  it('includes quarterly period info', () => {
    const xml = generateSKVXml(makeReport())
    expect(xml).toContain('<Ar>2026</Ar>')
    expect(xml).toContain('<Kvartal>1</Kvartal>')
    expect(xml).toContain('<Redovisningstyp>Kvartal</Redovisningstyp>')
  })

  it('includes monthly period info', () => {
    const report = makeReport({ period: { year: 2026, month: 3 }, filingType: 'monthly' })
    const xml = generateSKVXml(report)
    expect(xml).toContain('<Manad>03</Manad>')
    expect(xml).toContain('<Redovisningstyp>Manad</Redovisningstyp>')
  })

  it('includes customer line with goods and services', () => {
    const xml = generateSKVXml(makeReport())
    expect(xml).toContain('<KopareVATnr>DE123456789</KopareVATnr>')
    expect(xml).toContain('<KopareLand>DE</KopareLand>')
    expect(xml).toContain('<VarorBeloppSEK>50000</VarorBeloppSEK>')
    expect(xml).toContain('<TjansterBeloppSEK>30000</TjansterBeloppSEK>')
  })

  it('omits zero amount elements', () => {
    const xml = generateSKVXml(makeReport())
    // Triangulation is 0, should not appear in line
    expect(xml).not.toContain('<TriangelhandelBeloppSEK>0</TriangelhandelBeloppSEK>')
  })

  it('includes triangulation when non-zero', () => {
    const report = makeReport({
      lines: [{
        customerVatNumber: 'DE123',
        customerName: 'Test',
        customerCountry: 'DE',
        customerId: 'c-1',
        goodsAmount: 0,
        servicesAmount: 0,
        triangulationAmount: 15000,
        invoiceCount: 1,
      }],
    })

    const xml = generateSKVXml(report)
    expect(xml).toContain('<TriangelhandelBeloppSEK>15000</TriangelhandelBeloppSEK>')
  })

  it('skips lines with all zero amounts', () => {
    const report = makeReport({
      lines: [
        {
          customerVatNumber: 'DE111',
          customerName: 'Zero',
          customerCountry: 'DE',
          customerId: 'c-1',
          goodsAmount: 0,
          servicesAmount: 0,
          triangulationAmount: 0,
          invoiceCount: 0,
        },
        {
          customerVatNumber: 'FR222',
          customerName: 'NonZero',
          customerCountry: 'FR',
          customerId: 'c-2',
          goodsAmount: 10000,
          servicesAmount: 0,
          triangulationAmount: 0,
          invoiceCount: 1,
        },
      ],
    })

    const xml = generateSKVXml(report)
    expect(xml).not.toContain('DE111')
    expect(xml).toContain('FR222')
  })

  it('includes totals section', () => {
    const xml = generateSKVXml(makeReport())
    expect(xml).toContain('<VarorTotaltSEK>50000</VarorTotaltSEK>')
    expect(xml).toContain('<TjansterTotaltSEK>30000</TjansterTotaltSEK>')
    expect(xml).toContain('<TotaltSEK>80000</TotaltSEK>')
  })

  it('rounds amounts to whole SEK', () => {
    const report = makeReport({
      lines: [{
        customerVatNumber: 'DE123',
        customerName: 'Test',
        customerCountry: 'DE',
        customerId: 'c-1',
        goodsAmount: 12345.67,
        servicesAmount: 0,
        triangulationAmount: 0,
        invoiceCount: 1,
      }],
      totals: { goods: 12345.67, services: 0, triangulation: 0, total: 12345.67 },
    })

    const xml = generateSKVXml(report)
    expect(xml).toContain('<VarorBeloppSEK>12346</VarorBeloppSEK>')
  })

  it('escapes XML special characters in names', () => {
    const report = makeReport({
      reporterName: 'Foo & Bar <AB>',
      lines: [{
        customerVatNumber: 'DE123',
        customerName: 'Test',
        customerCountry: 'DE',
        customerId: 'c-1',
        goodsAmount: 1000,
        servicesAmount: 0,
        triangulationAmount: 0,
        invoiceCount: 1,
      }],
    })

    const xml = generateSKVXml(report)
    expect(xml).toContain('Foo &amp; Bar &lt;AB&gt;')
    expect(xml).not.toContain('Foo & Bar <AB>')
  })
})

describe('generateXMLFilename', () => {
  it('generates quarterly filename', () => {
    const filename = generateXMLFilename(makeReport())
    expect(filename).toBe('KVPS_SE556677889901_2026-Q1.xml')
  })

  it('generates monthly filename', () => {
    const report = makeReport({ period: { year: 2026, month: 11 }, filingType: 'monthly' })
    const filename = generateXMLFilename(report)
    expect(filename).toBe('KVPS_SE556677889901_2026-11.xml')
  })
})
