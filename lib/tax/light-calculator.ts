/**
 * Light Mode Tax Calculator
 *
 * For influencers working through umbrella companies (egenanställningsföretag).
 * They don't pay egenavgifter (the umbrella handles arbetsgivaravgifter).
 * Tax exposure comes from:
 * - Gifts/PR products → personal income tax liability (municipal + church)
 * - Hobby income → egenavgifter + municipal tax on surplus (out of MVP scope)
 */

import type { LightTaxEstimate } from '@/types'

/**
 * Calculate light mode tax liability from gifts
 * NO egenavgifter (umbrella pays arbetsgivaravgifter)
 * NO VAT (umbrella handles)
 * NO grundavdrag (consumed by umbrella salary)
 */
export function calculateLightTax(params: {
  taxableGiftValue: number
  municipalTaxRate: number // e.g. 0.3238 (32.38%)
  churchTaxRate: number    // e.g. 0.0100 (1.00%), 0 if not member
  hobbyIncome?: number
  hobbyExpenses?: number
  bankBalance: number | null
}): LightTaxEstimate {
  const {
    taxableGiftValue,
    municipalTaxRate,
    churchTaxRate,
    hobbyIncome = 0,
    hobbyExpenses = 0,
    bankBalance,
  } = params

  // Gift tax = taxable gift value × (municipal rate + church rate)
  const effectiveRate = municipalTaxRate + churchTaxRate
  const giftTax = Math.round(taxableGiftValue * effectiveRate)

  // Hobby tax (simplified: surplus × egenavgifter + municipal tax)
  const hobbySurplus = Math.max(0, hobbyIncome - hobbyExpenses)
  const hobbyTax = hobbySurplus > 0
    ? Math.round(hobbySurplus * 0.2897 + hobbySurplus * (1 - 0.2897) * municipalTaxRate)
    : 0

  const totalVirtualDebt = giftTax + hobbyTax
  const balance = bankBalance ?? 0
  const safeToSpend = Math.max(0, balance - totalVirtualDebt)
  const safeToSpendPercent = balance > 0 ? (safeToSpend / balance) * 100 : 0

  let safeToSpendLevel: 'green' | 'yellow' | 'red'
  if (safeToSpendPercent > 70) {
    safeToSpendLevel = 'green'
  } else if (safeToSpendPercent > 30) {
    safeToSpendLevel = 'yellow'
  } else {
    safeToSpendLevel = 'red'
  }

  return {
    taxable_gift_value: taxableGiftValue,
    municipal_tax_rate: municipalTaxRate,
    church_tax_rate: churchTaxRate,
    gift_tax: giftTax,
    hobby_tax: hobbyTax,
    total_virtual_debt: totalVirtualDebt,
    safe_to_spend: safeToSpend,
    safe_to_spend_percent: Math.round(safeToSpendPercent),
    safe_to_spend_level: safeToSpendLevel,
  }
}

/**
 * Calculate safe-to-spend from bank balance and tax estimate
 */
export function calculateLightSafeToSpend(
  bankBalance: number | null,
  lightTax: LightTaxEstimate
): { safeToSpend: number; percent: number; level: 'green' | 'yellow' | 'red' } {
  return {
    safeToSpend: lightTax.safe_to_spend,
    percent: lightTax.safe_to_spend_percent,
    level: lightTax.safe_to_spend_level,
  }
}

/**
 * Calculate net payout from gross using umbrella provider fee structure
 * Used in shadow ledger form for auto-calculating fields
 */
export function calculatePayoutNet(params: {
  gross: number
  feePercent: number       // e.g. 6.0
  pensionPercent: number   // e.g. 4.5
  estimatedTaxRate: number // e.g. 0.30
}): {
  serviceFee: number
  pensionDeduction: number
  socialFees: number
  incomeTaxWithheld: number
  net: number
} {
  const { gross, feePercent, pensionPercent, estimatedTaxRate } = params

  // Service fee (umbrella company fee)
  const serviceFee = Math.round(gross * (feePercent / 100) * 100) / 100

  // After fee
  const afterFee = gross - serviceFee

  // Pension deduction (from remaining)
  const pensionDeduction = Math.round(afterFee * (pensionPercent / 100) * 100) / 100

  // Social fees (arbetsgivaravgifter ~31.42% paid by umbrella, deducted from gross)
  const socialFees = Math.round(afterFee * 0.3142 * 100) / 100

  // Taxable base after social fees
  const taxableBase = afterFee - socialFees - pensionDeduction

  // Preliminary income tax
  const incomeTaxWithheld = Math.round(taxableBase * estimatedTaxRate * 100) / 100

  // Net payout
  const net = Math.round((taxableBase - incomeTaxWithheld) * 100) / 100

  return {
    serviceFee,
    pensionDeduction,
    socialFees,
    incomeTaxWithheld,
    net: Math.max(0, net),
  }
}

/**
 * Calculate virtual tax debt for a gift (light mode)
 * Simple: gift value × effective tax rate
 */
export function calculateGiftVirtualTaxDebt(
  giftMarketValue: number,
  municipalTaxRate: number,
  churchTaxRate: number
): number {
  return Math.round(giftMarketValue * (municipalTaxRate + churchTaxRate))
}
