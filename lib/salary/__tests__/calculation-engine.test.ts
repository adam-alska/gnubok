import { describe, it, expect, vi, beforeEach } from 'vitest'
import { calculateSalary, calculateKarensavdrag, calculateSjuklon, calculateAvgifterRate } from '../calculation-engine'
import type { PayrollConfig } from '../payroll-config'
import type { TaxTableRate } from '../tax-tables'

// Mock personnummer module
vi.mock('../personnummer', () => ({
  decryptPersonnummer: (encrypted: string) => {
    // Return mock personnummer based on encrypted value
    if (encrypted === 'mock_old_person') return '193501011234'
    if (encrypted === 'mock_young_person') return '200301011234'
    if (encrypted === 'mock_senior_person') return '195801011234'
    return '199001011234' // Default: born 1990
  },
  calculateAgeAtYearStart: (pnr: string, year: number) => {
    const birthYear = parseInt(pnr.slice(0, 4))
    return year - birthYear
  },
}))

const config2026: PayrollConfig = {
  configYear: 2026,
  avgifterTotal: 0.3142,
  avgifterAlderspension: 0.1021,
  avgifterSjukforsakring: 0.0355,
  avgifterForaldraforsakring: 0.0200,
  avgifterEfterlevandepension: 0.0030,
  avgifterArbetsmarknad: 0.0264,
  avgifterArbetsskada: 0.0010,
  avgifterAllmanLoneavgift: 0.1262,
  avgifterReduced65plus: 0.1021,
  avgifterYouthRate: 0.2081,
  avgifterYouthSalaryCap: 25000,
  avgifterVaxaStodRate: 0.1021,
  avgifterVaxaStodCap: 35000,
  avgifterMinimumAnnual: 1000,
  egenavgifterTotal: 0.2897,
  slpRate: 0.2426,
  prisbasbelopp: 59200,
  inkomstbasbelopp: 83400,
  maxPgi: 625500,
  sgiCeiling: 592000,
  statligSkattBrytpunkt: 660400,
  traktamenteHeldag: 300,
  traktamenteHalvdag: 150,
  traktamenteNatt: 150,
  milersattningEgenBil: 25,
  milersattningFormansbilFossil: 12,
  milersattningFormansbilEl: 9.50,
  kostformanHeldag: 310,
  kostformanLunch: 124,
  kostformanFrukost: 62,
  friskvardCap: 5000,
  bilformanSlr: 0.0255,
  sjuklonRate: 0.80,
  karensavdragFactor: 0.20,
  maxKarensavdragPerYear: 10,
  reducedAvgiftAge: 67,
}

const emptyTaxRates: TaxTableRate[] = []

function makeBasicInput(overrides = {}) {
  return {
    employmentType: 'employee' as const,
    salaryType: 'monthly' as const,
    monthlySalary: 40000,
    employmentDegree: 100,
    taxTableNumber: null,
    taxColumn: 1,
    isSidoinkomst: false,
    jamkningPercentage: null,
    jamkningValidFrom: null,
    jamkningValidTo: null,
    fSkattStatus: 'a_skatt',
    personnummer: 'mock_standard',
    paymentDate: '2026-04-25',
    vacationRule: 'procentregeln' as const,
    vacationDaysPerYear: 25,
    semestertillaggRate: 0.0043,
    vaxaStodEligible: false,
    vaxaStodStart: null,
    vaxaStodEnd: null,
    lineItems: [],
    ...overrides,
  }
}

describe('calculateSalary', () => {
  it('calculates basic monthly salary correctly', () => {
    const result = calculateSalary(makeBasicInput(), config2026, emptyTaxRates)

    expect(result.grossSalary).toBe(40000)
    // With no tax table, falls back to 30%
    expect(result.taxWithheld).toBe(12000)
    expect(result.netSalary).toBe(28000)
    expect(result.avgifterRate).toBe(0.3142)
    expect(result.avgifterAmount).toBe(Math.round(40000 * 0.3142 * 100) / 100)
    expect(result.vacationAccrual).toBe(Math.round(40000 * 0.12 * 100) / 100)
    expect(result.steps.length).toBeGreaterThan(0)
  })

  it('applies employment degree', () => {
    const result = calculateSalary(
      makeBasicInput({ employmentDegree: 50 }),
      config2026,
      emptyTaxRates
    )

    expect(result.grossSalary).toBe(20000)
    expect(result.taxWithheld).toBe(6000) // 30% of 20000
    expect(result.netSalary).toBe(14000)
  })

  it('calculates hourly salary', () => {
    const result = calculateSalary(
      makeBasicInput({
        salaryType: 'hourly',
        monthlySalary: 0,
        hourlyRate: 250,
        hoursWorked: 160,
      }),
      config2026,
      emptyTaxRates
    )

    expect(result.grossSalary).toBe(40000) // 250 * 160
  })

  it('applies sidoinkomst flat 30%', () => {
    const result = calculateSalary(
      makeBasicInput({ isSidoinkomst: true }),
      config2026,
      emptyTaxRates
    )

    expect(result.taxWithheld).toBe(12000) // 30% of 40000
  })

  it('applies f-skatt with 0% withholding', () => {
    const result = calculateSalary(
      makeBasicInput({ fSkattStatus: 'f_skatt' }),
      config2026,
      emptyTaxRates
    )

    expect(result.taxWithheld).toBe(0)
    expect(result.netSalary).toBe(40000)
  })

  it('applies unverified flat 30%', () => {
    const result = calculateSalary(
      makeBasicInput({ fSkattStatus: 'not_verified' }),
      config2026,
      emptyTaxRates
    )

    expect(result.taxWithheld).toBe(12000)
  })

  it('applies jämkning when valid', () => {
    const result = calculateSalary(
      makeBasicInput({
        jamkningPercentage: 15,
        jamkningValidFrom: '2026-01-01',
        jamkningValidTo: '2026-12-31',
      }),
      config2026,
      emptyTaxRates
    )

    expect(result.taxWithheld).toBe(6000) // 15% of 40000
  })

  it('does not apply jämkning when outside date range', () => {
    const result = calculateSalary(
      makeBasicInput({
        jamkningPercentage: 15,
        jamkningValidFrom: '2025-01-01',
        jamkningValidTo: '2025-12-31',
        paymentDate: '2026-04-25',
      }),
      config2026,
      emptyTaxRates
    )

    // Should fall back to 30% since jämkning expired
    expect(result.taxWithheld).toBe(12000)
  })

  it('handles line item additions', () => {
    const result = calculateSalary(
      makeBasicInput({
        lineItems: [
          { itemType: 'bonus', amount: 5000, isTaxable: true, isAvgiftBasis: true, isVacationBasis: true, isGrossDeduction: false, isNetDeduction: false },
        ],
      }),
      config2026,
      emptyTaxRates
    )

    expect(result.grossSalary).toBe(45000) // 40000 + 5000
    expect(result.taxWithheld).toBe(13500) // 30% of 45000
  })

  it('applies gross deductions before tax', () => {
    const result = calculateSalary(
      makeBasicInput({
        lineItems: [
          { itemType: 'gross_deduction_pension', amount: -5000, isTaxable: true, isAvgiftBasis: true, isVacationBasis: false, isGrossDeduction: true, isNetDeduction: false },
        ],
      }),
      config2026,
      emptyTaxRates
    )

    expect(result.grossSalary).toBe(35000) // 40000 - 5000
    expect(result.grossDeductions).toBe(5000)
    expect(result.taxWithheld).toBe(10500) // 30% of 35000 (tax on reduced amount)
  })

  it('applies net deductions after tax', () => {
    const result = calculateSalary(
      makeBasicInput({
        lineItems: [
          { itemType: 'net_deduction_advance', amount: -3000, isTaxable: false, isAvgiftBasis: false, isVacationBasis: false, isGrossDeduction: false, isNetDeduction: true },
        ],
      }),
      config2026,
      emptyTaxRates
    )

    expect(result.grossSalary).toBe(40000) // Unaffected
    expect(result.taxWithheld).toBe(12000) // 30% of 40000 (tax on full amount)
    expect(result.netDeductions).toBe(3000)
    expect(result.netSalary).toBe(25000) // 40000 - 12000 - 3000
  })

  it('calculates vacation accrual with procentregeln', () => {
    const result = calculateSalary(
      makeBasicInput({ vacationRule: 'procentregeln', vacationDaysPerYear: 25 }),
      config2026,
      emptyTaxRates
    )

    expect(result.vacationAccrual).toBe(Math.round(40000 * 0.12 * 100) / 100)
  })

  it('uses 14.4% for 30+ vacation days', () => {
    const result = calculateSalary(
      makeBasicInput({ vacationRule: 'procentregeln', vacationDaysPerYear: 30 }),
      config2026,
      emptyTaxRates
    )

    expect(result.vacationAccrual).toBe(Math.round(40000 * 0.144 * 100) / 100)
  })

  it('adds benefit values to tax base but not gross', () => {
    const result = calculateSalary(
      makeBasicInput({
        lineItems: [
          { itemType: 'benefit_car', amount: 3000, isTaxable: true, isAvgiftBasis: true, isVacationBasis: false, isGrossDeduction: false, isNetDeduction: false },
        ],
      }),
      config2026,
      emptyTaxRates
    )

    expect(result.grossSalary).toBe(40000) // Benefits don't add to gross
    expect(result.benefitValues).toBe(3000)
    expect(result.taxableIncome).toBe(43000) // gross + benefits
    expect(result.taxWithheld).toBe(12900) // 30% of 43000
    expect(result.netSalary).toBe(27100) // 40000 - 12900
  })

  it('includes employer cost calculation', () => {
    const result = calculateSalary(makeBasicInput(), config2026, emptyTaxRates)

    const expectedAvgifter = Math.round(40000 * 0.3142 * 100) / 100
    const expectedVacation = Math.round(40000 * 0.12 * 100) / 100
    const expectedVacationAvgifter = Math.round(expectedVacation * 0.3142 * 100) / 100
    const expectedCost = Math.round((40000 + expectedAvgifter + expectedVacation + expectedVacationAvgifter) * 100) / 100

    expect(result.totalEmployerCost).toBe(expectedCost)
  })
})

describe('calculateKarensavdrag', () => {
  it('calculates 20% of weekly sjuklön', () => {
    // Formula: 20% × (40000 × 12/52 × 0.80)
    const expected = Math.round(0.20 * (40000 * 12 / 52 * 0.80) * 100) / 100
    expect(calculateKarensavdrag(40000, config2026)).toBe(expected)
  })
})

describe('calculateSjuklon', () => {
  it('calculates karensavdrag + sjuklön for sick days', () => {
    const result = calculateSjuklon(40000, 5, config2026)

    expect(result.karensavdrag).toBeGreaterThan(0)
    expect(result.sjuklon).toBeGreaterThan(0)
    expect(result.steps.length).toBeGreaterThan(0)
  })

  it('handles 1-day sick leave (karens only)', () => {
    const result = calculateSjuklon(40000, 1, config2026)

    expect(result.karensavdrag).toBeGreaterThan(0)
    expect(result.sjuklon).toBe(0) // No sjuklön for day 1
  })

  it('caps at 13 sjuklön days (day 2-14)', () => {
    const result14 = calculateSjuklon(40000, 14, config2026)
    const result20 = calculateSjuklon(40000, 20, config2026)

    // sjuklön should be the same for 14 and 20 days (capped at day 14)
    expect(result14.sjuklon).toBe(result20.sjuklon)
  })
})

describe('calculateAvgifterRate', () => {
  it('returns standard rate for normal employee', () => {
    const result = calculateAvgifterRate(
      makeBasicInput(),
      config2026,
      2026
    )

    expect(result.rate).toBe(0.3142)
    expect(result.category).toBe('standard')
  })

  it('returns reduced rate for 67+ employee', () => {
    const result = calculateAvgifterRate(
      makeBasicInput({ personnummer: 'mock_senior_person' }),
      config2026,
      2026
    )

    expect(result.rate).toBe(0.1021)
    expect(result.category).toBe('reduced_65plus')
  })

  it('returns 0% for born ≤1937', () => {
    const result = calculateAvgifterRate(
      makeBasicInput({ personnummer: 'mock_old_person' }),
      config2026,
      2026
    )

    expect(result.rate).toBe(0)
    expect(result.category).toBe('exempt')
  })

  it('returns växa-stöd rate when eligible', () => {
    const result = calculateAvgifterRate(
      makeBasicInput({
        vaxaStodEligible: true,
        vaxaStodStart: '2025-01-01',
        vaxaStodEnd: '2026-12-31',
      }),
      config2026,
      2026
    )

    expect(result.rate).toBe(0.1021)
    expect(result.category).toBe('vaxa_stod')
  })
})
