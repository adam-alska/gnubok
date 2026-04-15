import type { AGIEmployeeData, AGITotals } from '@/lib/salary/agi/xml-generator'
import type { SkatteverketAGIInlamning, SkatteverketHuvuduppgift, SkatteverketIndividuppgift } from '../types'
import { decryptPersonnummer } from '@/lib/salary/personnummer'

// Re-export shared formatting utilities
export { formatRedovisare, formatRedovisningsperiod } from '@/lib/skatteverket/format'

/**
 * Convert gnubok salary run data to Skatteverket AGI JSON payload.
 *
 * JSON property names are derived from Skatteverket's XML element names,
 * following the same camelCase convention as the Momsdeklaration API.
 * The exact names should be verified against the RAML spec on Utvecklarportalen.
 *
 * CRITICAL: FK570 (specifikationsnummer) must stay consistent per employee.
 * Using a different number creates a new record instead of a correction.
 */
export function buildAGIPayload(
  employees: AGIEmployeeData[],
  totals: AGITotals,
  isCorrection: boolean = false
): SkatteverketAGIInlamning {
  const huvuduppgift = buildHuvuduppgift(totals)
  const individuppgifter = employees.map(emp => buildIndividuppgift(emp))

  return {
    rattelse: isCorrection,
    huvuduppgift,
    individuppgifter,
  }
}

function buildHuvuduppgift(totals: AGITotals): SkatteverketHuvuduppgift {
  const result: SkatteverketHuvuduppgift = {}

  if (totals.totalTax > 0) {
    result.avdragenSkatt = Math.round(totals.totalTax)
  }
  if (totals.totalAvgifterBasis > 0) {
    result.summaArbetsgivaravgifterUnderlag = Math.round(totals.totalAvgifterBasis)
  }

  // Avgifter by category (rutor 060-062)
  if (totals.avgifterByCategory.standard) {
    result.avgifterUnderlagStandard = Math.round(totals.avgifterByCategory.standard.basis)
  }
  if (totals.avgifterByCategory.reduced65plus) {
    result.avgifterUnderlagAlderspension = Math.round(totals.avgifterByCategory.reduced65plus.basis)
  }
  if (totals.avgifterByCategory.youth) {
    result.avgifterUnderlagUngdom = Math.round(totals.avgifterByCategory.youth.basis)
  }

  return result
}

function buildIndividuppgift(emp: AGIEmployeeData): SkatteverketIndividuppgift {
  // Decrypt personnummer — must be plaintext for Skatteverket
  let personnummer: string
  try {
    personnummer = decryptPersonnummer(emp.personnummer)
  } catch {
    throw new Error(
      `Kunde inte dekryptera personnummer för anställd med FK570=${emp.specificationNumber}. ` +
      'AGI kan inte skickas utan giltigt personnummer.'
    )
  }

  const result: SkatteverketIndividuppgift = {
    personnummer,
    specifikationsnummer: emp.specificationNumber,
  }

  // Only include non-zero values (Skatteverket treats absent fields as 0)
  if (emp.grossSalary > 0) result.kontantBruttoloen = Math.round(emp.grossSalary)
  if (emp.taxWithheld > 0) result.avdragenSkatt = Math.round(emp.taxWithheld)
  if (emp.avgifterBasis > 0) result.underlagArbetsgivaravgifter = Math.round(emp.avgifterBasis)
  if (emp.fSkattPayment && emp.fSkattPayment > 0) result.ersattningFSkatt = Math.round(emp.fSkattPayment)

  // Benefits (rutor 012-019)
  if (emp.benefitCar && emp.benefitCar > 0) result.formanBil = Math.round(emp.benefitCar)
  if (emp.benefitFuel && emp.benefitFuel > 0) result.formanDrivmedel = Math.round(emp.benefitFuel)
  if (emp.benefitHousing && emp.benefitHousing > 0) result.formanBostad = Math.round(emp.benefitHousing)
  if (emp.benefitMeals && emp.benefitMeals > 0) result.formanKost = Math.round(emp.benefitMeals)
  if (emp.benefitOther && emp.benefitOther > 0) result.formanOvrigt = Math.round(emp.benefitOther)

  // Absence fields (from 2025)
  if (emp.sickDays && emp.sickDays > 0) result.sjukfranvaroDagar = Math.round(emp.sickDays)
  if (emp.vabDays && emp.vabDays > 0) result.vabDagar = Math.round(emp.vabDays)
  if (emp.parentalDays && emp.parentalDays > 0) result.foraldraledigDagar = Math.round(emp.parentalDays)

  return result
}
