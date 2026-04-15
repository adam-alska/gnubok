import { describe, it, expect, vi, beforeEach } from 'vitest'
import { buildAGIPayload } from '../lib/agi-mappers'
import type { AGIEmployeeData, AGITotals } from '@/lib/salary/agi/xml-generator'

// Mock personnummer decryption
vi.mock('@/lib/salary/personnummer', () => ({
  decryptPersonnummer: vi.fn((encrypted: string) => {
    // Simulate decryption: in tests, we use plaintext personnummer
    if (encrypted === 'INVALID') throw new Error('Decryption failed')
    return encrypted
  }),
}))

function makeEmployee(overrides: Partial<AGIEmployeeData> = {}): AGIEmployeeData {
  return {
    personnummer: '199001011234',
    specificationNumber: 1,
    grossSalary: 35000,
    taxWithheld: 8000,
    avgifterBasis: 35000,
    ...overrides,
  }
}

function makeTotals(overrides: Partial<AGITotals> = {}): AGITotals {
  return {
    totalTax: 8000,
    totalAvgifterBasis: 35000,
    avgifterByCategory: {
      standard: { basis: 35000, amount: 10997 },
    },
    ...overrides,
  }
}

describe('buildAGIPayload', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('builds payload with correct structure', () => {
    const result = buildAGIPayload([makeEmployee()], makeTotals())

    expect(result).toMatchObject({
      rattelse: false,
      huvuduppgift: {
        avdragenSkatt: 8000,
        summaArbetsgivaravgifterUnderlag: 35000,
        avgifterUnderlagStandard: 35000,
      },
      individuppgifter: [
        {
          personnummer: '199001011234',
          specifikationsnummer: 1,
          kontantBruttoloen: 35000,
          avdragenSkatt: 8000,
          underlagArbetsgivaravgifter: 35000,
        },
      ],
    })
  })

  it('sets rattelse flag for corrections', () => {
    const result = buildAGIPayload([makeEmployee()], makeTotals(), true)
    expect(result.rattelse).toBe(true)
  })

  it('omits zero-value fields from individuppgift', () => {
    const emp = makeEmployee({
      benefitCar: 0,
      benefitMeals: undefined,
      sickDays: 0,
    })
    const result = buildAGIPayload([emp], makeTotals())
    const ind = result.individuppgifter[0]

    expect(ind.formanBil).toBeUndefined()
    expect(ind.formanKost).toBeUndefined()
    expect(ind.sjukfranvaroDagar).toBeUndefined()
  })

  it('includes benefit values when present', () => {
    const emp = makeEmployee({
      benefitCar: 4500,
      benefitHousing: 3000,
      benefitMeals: 1800,
      benefitOther: 500,
    })
    const result = buildAGIPayload([emp], makeTotals())
    const ind = result.individuppgifter[0]

    expect(ind.formanBil).toBe(4500)
    expect(ind.formanBostad).toBe(3000)
    expect(ind.formanKost).toBe(1800)
    expect(ind.formanOvrigt).toBe(500)
  })

  it('includes absence fields when present', () => {
    const emp = makeEmployee({
      sickDays: 3,
      vabDays: 2,
      parentalDays: 5,
    })
    const result = buildAGIPayload([emp], makeTotals())
    const ind = result.individuppgifter[0]

    expect(ind.sjukfranvaroDagar).toBe(3)
    expect(ind.vabDagar).toBe(2)
    expect(ind.foraldraledigDagar).toBe(5)
  })

  it('includes F-skatt payment field', () => {
    const emp = makeEmployee({ fSkattPayment: 50000 })
    const result = buildAGIPayload([emp], makeTotals())

    expect(result.individuppgifter[0].ersattningFSkatt).toBe(50000)
  })

  it('rounds all amounts to whole kronor', () => {
    const emp = makeEmployee({
      grossSalary: 35000.75,
      taxWithheld: 8000.49,
      avgifterBasis: 35000.5,
    })
    const result = buildAGIPayload([emp], makeTotals())
    const ind = result.individuppgifter[0]

    expect(ind.kontantBruttoloen).toBe(35001)
    expect(ind.avdragenSkatt).toBe(8000)
    expect(ind.underlagArbetsgivaravgifter).toBe(35001)
  })

  it('handles multiple avgifter categories', () => {
    const totals = makeTotals({
      avgifterByCategory: {
        standard: { basis: 70000, amount: 21994 },
        reduced65plus: { basis: 30000, amount: 3063 },
        youth: { basis: 25000, amount: 5203 },
      },
    })
    const result = buildAGIPayload([makeEmployee()], totals)
    const hu = result.huvuduppgift

    expect(hu.avgifterUnderlagStandard).toBe(70000)
    expect(hu.avgifterUnderlagAlderspension).toBe(30000)
    expect(hu.avgifterUnderlagUngdom).toBe(25000)
  })

  it('handles multiple employees', () => {
    const employees = [
      makeEmployee({ specificationNumber: 1, grossSalary: 35000 }),
      makeEmployee({ specificationNumber: 2, personnummer: '199512152345', grossSalary: 28000 }),
    ]
    const result = buildAGIPayload(employees, makeTotals({ totalTax: 15000, totalAvgifterBasis: 63000 }))

    expect(result.individuppgifter).toHaveLength(2)
    expect(result.individuppgifter[0].specifikationsnummer).toBe(1)
    expect(result.individuppgifter[1].specifikationsnummer).toBe(2)
    expect(result.individuppgifter[1].personnummer).toBe('199512152345')
  })

  it('throws if personnummer cannot be decrypted', () => {
    const emp = makeEmployee({ personnummer: 'INVALID' })

    expect(() => buildAGIPayload([emp], makeTotals())).toThrow(
      /Kunde inte dekryptera personnummer.*FK570=1/
    )
  })

  it('omits huvuduppgift fields when zero', () => {
    const totals: AGITotals = {
      totalTax: 0,
      totalAvgifterBasis: 0,
      avgifterByCategory: {},
    }
    const result = buildAGIPayload([makeEmployee({ grossSalary: 0, taxWithheld: 0, avgifterBasis: 0 })], totals)
    const hu = result.huvuduppgift

    expect(hu.avdragenSkatt).toBeUndefined()
    expect(hu.summaArbetsgivaravgifterUnderlag).toBeUndefined()
    expect(hu.avgifterUnderlagStandard).toBeUndefined()
  })
})
