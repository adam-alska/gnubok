import type { PayrollConfig } from './payroll-config'
import type { TaxTableRate } from './tax-tables'
import { lookupTaxAmount, calculateJamkningTax, calculateSidoinkomstTax } from './tax-tables'
import { calculateAgeAtYearStart, decryptPersonnummer } from './personnummer'
import type { SalaryLineItemType } from '@/types'

// ============================================================
// Types
// ============================================================

export interface SalaryCalculationInput {
  /** Employee data */
  employmentType: 'employee' | 'company_owner' | 'board_member'
  salaryType: 'monthly' | 'hourly'
  monthlySalary: number
  hourlyRate?: number
  hoursWorked?: number
  employmentDegree: number // 1-100

  /** Tax */
  taxTableNumber: number | null
  taxColumn: number
  isSidoinkomst: boolean
  jamkningPercentage: number | null
  jamkningValidFrom: string | null
  jamkningValidTo: string | null
  fSkattStatus: string

  /** Age (from personnummer) */
  personnummer: string // encrypted — will be decrypted for age calc
  paymentDate: string

  /** Vacation */
  vacationRule: 'procentregeln' | 'sammaloneregeln'
  vacationDaysPerYear: number
  semestertillaggRate: number

  /** Växa-stöd */
  vaxaStodEligible: boolean
  vaxaStodStart: string | null
  vaxaStodEnd: string | null

  /** Line items */
  lineItems: CalculationLineItem[]
}

export interface CalculationLineItem {
  itemType: SalaryLineItemType
  amount: number
  isTaxable: boolean
  isAvgiftBasis: boolean
  isVacationBasis: boolean
  isGrossDeduction: boolean
  isNetDeduction: boolean
}

export interface CalculationStep {
  label: string
  formula: string
  input: Record<string, number | string>
  output: number
}

export interface SalaryCalculationResult {
  grossSalary: number
  grossDeductions: number
  benefitValues: number
  taxableIncome: number
  taxWithheld: number
  netDeductions: number
  netSalary: number
  avgifterRate: number
  avgifterAmount: number
  avgifterBasis: number
  vacationAccrual: number
  vacationAccrualAvgifter: number
  totalEmployerCost: number
  steps: CalculationStep[]
}

export interface AvgifterCalculation {
  rate: number
  amount: number
  basis: number
  category: 'standard' | 'reduced_65plus' | 'youth' | 'vaxa_stod' | 'exempt'
  steps: CalculationStep[]
}

// ============================================================
// Rounding helper
// ============================================================

function r(x: number): number {
  return Math.round(x * 100) / 100
}

// ============================================================
// Main calculation
// ============================================================

/**
 * Calculate salary for one employee in a salary run.
 * Follows the legally mandated processing order:
 *   1. Base salary
 *   2. Add additions (overtime, bonus, etc.)
 *   3. Subtract absence deductions
 *   4. Apply bruttolöneavdrag (MUST be before tax)
 *   5. Add förmånsvärden to tax base
 *   6. Tax withholding
 *   7. Net salary
 *   8. Employer contributions (avgifter)
 *   9. Vacation accrual
 *  10. Avgifter on vacation accrual
 */
export function calculateSalary(
  input: SalaryCalculationInput,
  config: PayrollConfig,
  taxRates: TaxTableRate[]
): SalaryCalculationResult {
  const steps: CalculationStep[] = []

  // ─── Step 1: Base salary ───
  let baseSalary: number
  if (input.salaryType === 'monthly') {
    baseSalary = r(input.monthlySalary * (input.employmentDegree / 100))
    steps.push({
      label: 'Grundlön',
      formula: 'monthly_salary × (employment_degree / 100)',
      input: { monthly_salary: input.monthlySalary, employment_degree: input.employmentDegree },
      output: baseSalary,
    })
  } else {
    const hours = input.hoursWorked || 0
    const rate = input.hourlyRate || 0
    baseSalary = r(rate * hours)
    steps.push({
      label: 'Grundlön (timavlönad)',
      formula: 'hourly_rate × hours_worked',
      input: { hourly_rate: rate, hours_worked: hours },
      output: baseSalary,
    })
  }

  // ─── Step 2: Add additions ───
  const additions = input.lineItems.filter(
    li => ['overtime', 'bonus', 'commission'].includes(li.itemType) && li.amount > 0
  )
  const totalAdditions = r(additions.reduce((sum, li) => sum + li.amount, 0))
  if (totalAdditions > 0) {
    steps.push({
      label: 'Tillägg (övertid, bonus, provision)',
      formula: 'sum(additions)',
      input: { count: additions.length },
      output: totalAdditions,
    })
  }

  // ─── Step 3: Subtract absence deductions ───
  const absenceItems = input.lineItems.filter(
    li => ['sick_karens', 'sick_day2_14', 'sick_day15_plus', 'vab', 'parental_leave', 'vacation'].includes(li.itemType)
  )
  const totalAbsence = r(absenceItems.reduce((sum, li) => sum + li.amount, 0))
  if (totalAbsence !== 0) {
    steps.push({
      label: 'Frånvaro (sjuk, VAB, semester, föräldraledig)',
      formula: 'sum(absence_items)',
      input: { count: absenceItems.length },
      output: totalAbsence,
    })
  }

  // ─── Step 4: Bruttolöneavdrag (MUST be before tax) ───
  const grossDeductionItems = input.lineItems.filter(li => li.isGrossDeduction)
  const totalGrossDeductions = r(Math.abs(grossDeductionItems.reduce((sum, li) => sum + li.amount, 0)))
  if (totalGrossDeductions > 0) {
    steps.push({
      label: 'Bruttolöneavdrag',
      formula: 'sum(gross_deductions)',
      input: { count: grossDeductionItems.length },
      output: -totalGrossDeductions,
    })
  }

  // Gross salary = base + additions + absence (may be negative for deductions) - gross deductions
  const grossSalary = r(baseSalary + totalAdditions + totalAbsence - totalGrossDeductions)
  steps.push({
    label: 'Bruttolön',
    formula: 'base + additions + absence - gross_deductions',
    input: { base: baseSalary, additions: totalAdditions, absence: totalAbsence, gross_deductions: totalGrossDeductions },
    output: grossSalary,
  })

  // ─── Step 5: Add förmånsvärden to tax base ───
  const benefitItems = input.lineItems.filter(
    li => ['benefit_car', 'benefit_housing', 'benefit_meals', 'benefit_wellness', 'benefit_other'].includes(li.itemType)
  )
  const totalBenefits = r(benefitItems.reduce((sum, li) => sum + li.amount, 0))
  if (totalBenefits > 0) {
    steps.push({
      label: 'Förmånsvärden',
      formula: 'sum(benefit_values)',
      input: { count: benefitItems.length },
      output: totalBenefits,
    })
  }

  const taxableIncome = r(grossSalary + totalBenefits)
  steps.push({
    label: 'Skattegrundande inkomst',
    formula: 'gross_salary + benefit_values',
    input: { gross_salary: grossSalary, benefit_values: totalBenefits },
    output: taxableIncome,
  })

  // ─── Step 6: Tax withholding ───
  let taxWithheld: number
  const paymentYear = parseInt(input.paymentDate.split('-')[0])

  if (input.fSkattStatus === 'f_skatt') {
    // F-skatt holder: no withholding
    taxWithheld = 0
    steps.push({
      label: 'Skatteavdrag (F-skatt)',
      formula: '0 (F-skattsedel, inget avdrag)',
      input: {},
      output: 0,
    })
  } else if (input.fSkattStatus === 'not_verified') {
    // Unverified: flat 30%
    taxWithheld = r(taxableIncome * 0.30)
    steps.push({
      label: 'Skatteavdrag (ej verifierad)',
      formula: 'taxable_income × 30%',
      input: { taxable_income: taxableIncome },
      output: taxWithheld,
    })
  } else if (input.isSidoinkomst) {
    // Sidoinkomst: flat 30%
    taxWithheld = calculateSidoinkomstTax(taxableIncome)
    steps.push({
      label: 'Skatteavdrag (sidoinkomst 30%)',
      formula: 'taxable_income × 30%',
      input: { taxable_income: taxableIncome },
      output: taxWithheld,
    })
  } else if (input.jamkningPercentage !== null && isJamkningValid(input.jamkningValidFrom, input.jamkningValidTo, input.paymentDate)) {
    // Jämkning
    taxWithheld = calculateJamkningTax(taxableIncome, input.jamkningPercentage)
    steps.push({
      label: `Skatteavdrag (jämkning ${input.jamkningPercentage}%)`,
      formula: 'taxable_income × jamkning_percentage / 100',
      input: { taxable_income: taxableIncome, jamkning_percentage: input.jamkningPercentage },
      output: taxWithheld,
    })
  } else if (input.taxTableNumber) {
    // Normal tax table lookup
    taxWithheld = lookupTaxAmount(input.taxTableNumber, input.taxColumn, taxableIncome, taxRates)
    steps.push({
      label: `Skatteavdrag (tabell ${input.taxTableNumber}, kolumn ${input.taxColumn})`,
      formula: `lookup(table=${input.taxTableNumber}, column=${input.taxColumn}, income=${Math.round(taxableIncome)})`,
      input: { table: input.taxTableNumber, column: input.taxColumn, taxable_income: taxableIncome },
      output: taxWithheld,
    })
  } else {
    // Fallback: flat 30%
    taxWithheld = r(taxableIncome * 0.30)
    steps.push({
      label: 'Skatteavdrag (30% schablon)',
      formula: 'taxable_income × 30%',
      input: { taxable_income: taxableIncome },
      output: taxWithheld,
    })
  }

  // ─── Step 7: Net salary ───
  const netDeductionItems = input.lineItems.filter(li => li.isNetDeduction)
  const totalNetDeductions = r(Math.abs(netDeductionItems.reduce((sum, li) => sum + li.amount, 0)))

  const netSalary = r(grossSalary - taxWithheld - totalNetDeductions)
  steps.push({
    label: 'Nettolön',
    formula: 'gross - tax - net_deductions',
    input: { gross: grossSalary, tax: taxWithheld, net_deductions: totalNetDeductions },
    output: netSalary,
  })

  // ─── Step 8: Employer contributions (avgifter) ───
  const avgifterCalc = calculateAvgifterRate(input, config, paymentYear)
  const avgifterBasis = r(grossSalary + totalBenefits)
  const avgifterAmount = r(avgifterBasis * avgifterCalc.rate)
  steps.push(...avgifterCalc.steps)
  steps.push({
    label: 'Arbetsgivaravgifter',
    formula: 'avgifter_basis × rate',
    input: { avgifter_basis: avgifterBasis, rate: avgifterCalc.rate },
    output: avgifterAmount,
  })

  // ─── Step 9: Vacation accrual ───
  const vacationBasisItems = input.lineItems.filter(li => li.isVacationBasis)
  const vacationBasis = r(
    baseSalary + vacationBasisItems.reduce((sum, li) => sum + li.amount, 0)
  )
  let vacationAccrual: number
  if (input.vacationRule === 'procentregeln') {
    const rate = input.vacationDaysPerYear >= 30 ? 0.144 : 0.12
    vacationAccrual = r(vacationBasis * rate)
    steps.push({
      label: `Semesteravsättning (procentregeln ${rate * 100}%)`,
      formula: 'vacation_basis × rate',
      input: { vacation_basis: vacationBasis, rate },
      output: vacationAccrual,
    })
  } else {
    // Sammalöneregeln: daily rate × semestertillägg × days
    const dailyRate = r(input.monthlySalary / 21)
    const tillagg = r(dailyRate * input.semestertillaggRate * input.vacationDaysPerYear)
    vacationAccrual = tillagg
    steps.push({
      label: `Semesteravsättning (sammalöneregeln, tillägg ${input.semestertillaggRate * 100}%)`,
      formula: 'daily_rate × semestertillagg_rate × vacation_days',
      input: { daily_rate: dailyRate, semestertillagg_rate: input.semestertillaggRate, vacation_days: input.vacationDaysPerYear },
      output: vacationAccrual,
    })
  }

  // ─── Step 10: Avgifter on vacation accrual ───
  const vacationAccrualAvgifter = r(vacationAccrual * avgifterCalc.rate)
  steps.push({
    label: 'Arbetsgivaravgifter på semesteravsättning',
    formula: 'vacation_accrual × avgifter_rate',
    input: { vacation_accrual: vacationAccrual, avgifter_rate: avgifterCalc.rate },
    output: vacationAccrualAvgifter,
  })

  const totalEmployerCost = r(grossSalary + avgifterAmount + vacationAccrual + vacationAccrualAvgifter)
  steps.push({
    label: 'Total arbetsgivarkostnad',
    formula: 'gross + avgifter + vacation_accrual + vacation_avgifter',
    input: { gross: grossSalary, avgifter: avgifterAmount, vacation_accrual: vacationAccrual, vacation_avgifter: vacationAccrualAvgifter },
    output: totalEmployerCost,
  })

  return {
    grossSalary,
    grossDeductions: totalGrossDeductions,
    benefitValues: totalBenefits,
    taxableIncome,
    taxWithheld,
    netDeductions: totalNetDeductions,
    netSalary,
    avgifterRate: avgifterCalc.rate,
    avgifterAmount,
    avgifterBasis,
    vacationAccrual,
    vacationAccrualAvgifter,
    totalEmployerCost,
    steps,
  }
}

// ============================================================
// Avgifter calculation
// ============================================================

/**
 * Determine arbetsgivaravgifter rate based on employee age, växa-stöd, etc.
 */
export function calculateAvgifterRate(
  input: SalaryCalculationInput,
  config: PayrollConfig,
  paymentYear: number
): AvgifterCalculation {
  const steps: CalculationStep[] = []

  // Decrypt personnummer to calculate age
  let pnr: string
  try {
    pnr = decryptPersonnummer(input.personnummer)
  } catch {
    // If decryption fails, assume standard rate
    return {
      rate: config.avgifterTotal,
      amount: 0,
      basis: 0,
      category: 'standard',
      steps: [{ label: 'Avgiftskategori', formula: 'standard (personnummer ej dekrypterbart)', input: {}, output: config.avgifterTotal }],
    }
  }

  const ageAtYearStart = calculateAgeAtYearStart(pnr, paymentYear)

  // Born ≤1937: 0%
  const birthYear = parseInt(pnr.slice(0, 4))
  if (birthYear <= 1937) {
    steps.push({
      label: 'Avgiftskategori',
      formula: 'Född ≤1937: 0%',
      input: { birth_year: birthYear },
      output: 0,
    })
    return { rate: 0, amount: 0, basis: 0, category: 'exempt', steps }
  }

  // 67+ at year start (reduced — only ålderspension)
  if (ageAtYearStart >= config.reducedAvgiftAge) {
    steps.push({
      label: 'Avgiftskategori',
      formula: `Ålder ${ageAtYearStart} ≥ ${config.reducedAvgiftAge}: reducerad (${config.avgifterReduced65plus * 100}%)`,
      input: { age: ageAtYearStart, threshold: config.reducedAvgiftAge },
      output: config.avgifterReduced65plus,
    })
    return { rate: config.avgifterReduced65plus, amount: 0, basis: 0, category: 'reduced_65plus', steps }
  }

  // Växa-stöd eligible
  if (input.vaxaStodEligible && input.vaxaStodStart && input.vaxaStodEnd) {
    const payDate = input.paymentDate
    if (payDate >= input.vaxaStodStart && payDate <= input.vaxaStodEnd && config.avgifterVaxaStodRate !== null) {
      steps.push({
        label: 'Avgiftskategori',
        formula: `Växa-stöd: ${(config.avgifterVaxaStodRate ?? 0) * 100}% på första ${config.avgifterVaxaStodCap} SEK`,
        input: { vaxa_cap: config.avgifterVaxaStodCap ?? 0 },
        output: config.avgifterVaxaStodRate ?? 0,
      })
      return { rate: config.avgifterVaxaStodRate ?? config.avgifterTotal, amount: 0, basis: 0, category: 'vaxa_stod', steps }
    }
  }

  // Youth rate (2026: ages 19-23, Apr-Sep only)
  if (config.avgifterYouthRate !== null && ageAtYearStart >= 19 && ageAtYearStart <= 23) {
    const [, monthStr] = input.paymentDate.split('-')
    const month = parseInt(monthStr)
    // Youth rate valid Apr 2026 - Sep 2027
    if (paymentYear === 2026 && month >= 4 && month <= 12) {
      steps.push({
        label: 'Avgiftskategori',
        formula: `Ungdomsrabatt (${ageAtYearStart} år): ${config.avgifterYouthRate * 100}% på första ${config.avgifterYouthSalaryCap} SEK`,
        input: { age: ageAtYearStart, cap: config.avgifterYouthSalaryCap ?? 0 },
        output: config.avgifterYouthRate,
      })
      return { rate: config.avgifterYouthRate, amount: 0, basis: 0, category: 'youth', steps }
    }
  }

  // Standard rate
  steps.push({
    label: 'Avgiftskategori',
    formula: `Standard: ${config.avgifterTotal * 100}%`,
    input: { age: ageAtYearStart },
    output: config.avgifterTotal,
  })
  return { rate: config.avgifterTotal, amount: 0, basis: 0, category: 'standard', steps }
}

// ============================================================
// Sjuklön helpers
// ============================================================

/**
 * Calculate karensavdrag (sick leave deduction day 1).
 * Formula: 20% × (monthly_salary × 12 / 52 × sjuklön_rate)
 */
export function calculateKarensavdrag(monthlySalary: number, config: PayrollConfig): number {
  const weeklySjuklon = r(monthlySalary * 12 / 52 * config.sjuklonRate)
  return r(weeklySjuklon * config.karensavdragFactor)
}

/**
 * Calculate sjuklön for days 2-14.
 * Formula: 80% × daily_rate × (sick_days - 1)
 */
export function calculateSjuklon(
  monthlySalary: number,
  sickDays: number,
  config: PayrollConfig
): { karensavdrag: number; sjuklon: number; totalDeduction: number; steps: CalculationStep[] } {
  const steps: CalculationStep[] = []
  const dailyRate = r(monthlySalary / 21)

  // Karensavdrag
  const karensavdrag = calculateKarensavdrag(monthlySalary, config)
  steps.push({
    label: 'Karensavdrag',
    formula: '20% × (monthly × 12/52 × 80%)',
    input: { monthly_salary: monthlySalary },
    output: karensavdrag,
  })

  // Sjuklön day 2-14
  const sjuklonDays = Math.min(Math.max(sickDays - 1, 0), 13)
  const sjuklon = r(dailyRate * config.sjuklonRate * sjuklonDays)
  steps.push({
    label: 'Sjuklön dag 2-14',
    formula: 'daily_rate × 80% × (sick_days - 1)',
    input: { daily_rate: dailyRate, sjuklon_rate: config.sjuklonRate, days: sjuklonDays },
    output: sjuklon,
  })

  // Total deduction from pay = salary they would have earned - sjuklön they get
  const fullPayForPeriod = r(dailyRate * sickDays)
  const totalDeduction = r(-(fullPayForPeriod - sjuklon + karensavdrag))
  steps.push({
    label: 'Netto sjukavdrag',
    formula: '-(full_pay - sjuklon + karensavdrag)',
    input: { full_pay: fullPayForPeriod, sjuklon, karensavdrag },
    output: totalDeduction,
  })

  return { karensavdrag, sjuklon, totalDeduction, steps }
}

/**
 * Calculate vacation accrual.
 */
export function calculateVacationAccrual(params: {
  monthlySalary: number
  vacationRule: 'procentregeln' | 'sammaloneregeln'
  vacationDaysPerYear: number
  semestertillaggRate: number
  vacationBasis: number
}): { accrual: number; steps: CalculationStep[] } {
  const steps: CalculationStep[] = []

  if (params.vacationRule === 'procentregeln') {
    const rate = params.vacationDaysPerYear >= 30 ? 0.144 : 0.12
    const accrual = r(params.vacationBasis * rate)
    steps.push({
      label: `Semesteravsättning (procentregeln ${rate * 100}%)`,
      formula: 'vacation_basis × rate',
      input: { vacation_basis: params.vacationBasis, rate },
      output: accrual,
    })
    return { accrual, steps }
  } else {
    const dailyRate = r(params.monthlySalary / 21)
    const accrual = r(dailyRate * params.semestertillaggRate * params.vacationDaysPerYear)
    steps.push({
      label: `Semesteravsättning (sammalöneregeln ${params.semestertillaggRate * 100}%)`,
      formula: 'daily_rate × semestertillagg_rate × vacation_days',
      input: { daily_rate: dailyRate, rate: params.semestertillaggRate, days: params.vacationDaysPerYear },
      output: accrual,
    })
    return { accrual, steps }
  }
}

// ============================================================
// Helpers
// ============================================================

function isJamkningValid(
  validFrom: string | null,
  validTo: string | null,
  paymentDate: string
): boolean {
  if (!validFrom || !validTo) return false
  return paymentDate >= validFrom && paymentDate <= validTo
}
