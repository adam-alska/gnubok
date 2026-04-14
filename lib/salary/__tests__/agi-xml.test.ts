import { describe, it, expect, vi } from 'vitest'
import { generateAGIXml, buildIndividuppgifterSnapshot } from '../agi/xml-generator'
import type { AGICompanyData, AGIEmployeeData, AGITotals } from '../agi/xml-generator'

// Mock personnummer decryption
vi.mock('../personnummer', () => ({
  decryptPersonnummer: (encrypted: string) => {
    if (encrypted === 'emp1_encrypted') return '199001011234'
    if (encrypted === 'emp2_encrypted') return '198506159876'
    return '000000000000'
  },
}))

const company: AGICompanyData = {
  orgNumber: '556123-4567',
  companyName: 'Test AB',
  periodYear: 2026,
  periodMonth: 4,
  contactName: 'Anna Admin',
  contactPhone: '0701234567',
  contactEmail: 'anna@test.se',
}

const employees: AGIEmployeeData[] = [
  {
    personnummer: 'emp1_encrypted',
    specificationNumber: 1,
    grossSalary: 40000,
    taxWithheld: 12000,
    avgifterBasis: 40000,
    sickDays: 3,
    vabDays: 2,
  },
  {
    personnummer: 'emp2_encrypted',
    specificationNumber: 2,
    grossSalary: 35000,
    taxWithheld: 10500,
    avgifterBasis: 35000,
    benefitCar: 5000,
  },
]

const totals: AGITotals = {
  totalTax: 22500,
  totalAvgifterBasis: 80000,
  avgifterByCategory: {
    standard: { basis: 75000, amount: 23565 },
    reduced65plus: { basis: 5000, amount: 510.50 },
  },
}

describe('generateAGIXml', () => {
  it('generates valid XML with correct root element', () => {
    const xml = generateAGIXml(company, employees, totals)
    expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>')
    expect(xml).toContain('<Skatteverket')
    expect(xml).toContain('</Skatteverket>')
  })

  it('includes program name "gnubok"', () => {
    const xml = generateAGIXml(company, employees, totals)
    expect(xml).toContain('<Programnamn>gnubok</Programnamn>')
  })

  it('includes correct period', () => {
    const xml = generateAGIXml(company, employees, totals)
    expect(xml).toContain('<Period>202604</Period>')
  })

  it('includes org number without dash', () => {
    const xml = generateAGIXml(company, employees, totals)
    expect(xml).toContain('5561234567')
    expect(xml).not.toContain('556123-4567')
  })

  it('includes huvuduppgift with total tax (Ruta 001)', () => {
    const xml = generateAGIXml(company, employees, totals)
    expect(xml).toContain('<AvdragenSkatt faltkod="001">22500</AvdragenSkatt>')
  })

  it('includes avgifter categories (Ruta 060, 061)', () => {
    const xml = generateAGIXml(company, employees, totals)
    expect(xml).toContain('faltkod="060"')
    expect(xml).toContain('faltkod="061"')
  })

  it('decrypts personnummer for FK215', () => {
    const xml = generateAGIXml(company, employees, totals)
    expect(xml).toContain('<Personnummer faltkod="215">199001011234</Personnummer>')
    expect(xml).toContain('<Personnummer faltkod="215">198506159876</Personnummer>')
  })

  it('includes consistent FK570 specifikationsnummer', () => {
    const xml = generateAGIXml(company, employees, totals)
    expect(xml).toContain('<Specifikationsnummer faltkod="570">1</Specifikationsnummer>')
    expect(xml).toContain('<Specifikationsnummer faltkod="570">2</Specifikationsnummer>')
  })

  it('includes gross salary (Ruta 011) per employee', () => {
    const xml = generateAGIXml(company, employees, totals)
    expect(xml).toContain('<KontantBruttoloen faltkod="011">40000</KontantBruttoloen>')
    expect(xml).toContain('<KontantBruttoloen faltkod="011">35000</KontantBruttoloen>')
  })

  it('includes tax withheld (Ruta 001) per employee', () => {
    const xml = generateAGIXml(company, employees, totals)
    // Both HU and IU have AvdragenSkatt
    const matches = xml.match(/AvdragenSkatt/g)
    expect(matches!.length).toBeGreaterThanOrEqual(3) // 1 HU + 2 IU
  })

  it('includes benefit values (Ruta 012 for car)', () => {
    const xml = generateAGIXml(company, employees, totals)
    expect(xml).toContain('<FormanBil faltkod="012">5000</FormanBil>')
  })

  it('includes absence fields FK821-FK823', () => {
    const xml = generateAGIXml(company, employees, totals)
    expect(xml).toContain('<SjukfranvaroDagar faltkod="821">3</SjukfranvaroDagar>')
    expect(xml).toContain('<VabDagar faltkod="822">2</VabDagar>')
  })

  it('omits zero/undefined fields', () => {
    const xml = generateAGIXml(company, employees, totals)
    // Employee 1 has no car benefit
    // Employee 2 has no sick days
    // Check that we don't emit empty tags
    const lines = xml.split('\n')
    for (const line of lines) {
      if (line.includes('faltkod')) {
        expect(line).not.toContain('>0</')
      }
    }
  })

  it('marks corrections with Rattelse flag', () => {
    const xml = generateAGIXml(company, employees, totals, true)
    expect(xml).toContain('<Rattelse>J</Rattelse>')
  })

  it('does not include Rattelse flag for initial filing', () => {
    const xml = generateAGIXml(company, employees, totals, false)
    expect(xml).not.toContain('Rattelse')
  })

  it('escapes XML special characters in company name', () => {
    const specialCompany = { ...company, companyName: 'Test & <Co>' }
    const xml = generateAGIXml(specialCompany, employees, totals)
    expect(xml).not.toContain('Test & <Co>')
  })
})

describe('buildIndividuppgifterSnapshot', () => {
  it('builds snapshot with decrypted personnummer', () => {
    const snapshot = buildIndividuppgifterSnapshot(employees)
    expect(snapshot).toHaveLength(2)
    expect(snapshot[0].personnummer).toBe('199001011234')
    expect(snapshot[1].personnummer).toBe('198506159876')
  })

  it('preserves FK570 for correction reference', () => {
    const snapshot = buildIndividuppgifterSnapshot(employees)
    expect(snapshot[0].fk570).toBe(1)
    expect(snapshot[1].fk570).toBe(2)
  })

  it('includes all required rutor', () => {
    const snapshot = buildIndividuppgifterSnapshot(employees)
    expect(snapshot[0]).toHaveProperty('ruta011', 40000)
    expect(snapshot[0]).toHaveProperty('ruta001', 12000)
    expect(snapshot[0]).toHaveProperty('ruta020', 40000)
    expect(snapshot[0]).toHaveProperty('fk821', 3)
    expect(snapshot[0]).toHaveProperty('fk822', 2)
  })
})
