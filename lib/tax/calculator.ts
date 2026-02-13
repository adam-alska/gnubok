import type { EntityType, TaxEstimate, TaxWarningLevel, TaxWarningStatus, SchablonavdragSummary } from '@/types'

// Current Swedish tax rates (2026)
const TAX_RATES = {
  egenavgifter: 0.2897, // 28.97% for EF
  bolagsskatt: 0.206, // 20.6% for AB
  arbetsgivaravgifter: 0.3142, // 31.42% employer contributions
  municipalTax: 0.3238, // 32.38% average municipal tax for 2026
  stateTax: 0.20, // 20% state income tax on high incomes
}

// State income tax threshold (brytpunkt) for 2026
const STATE_TAX_THRESHOLD = 643100 // Taxable income above this gets +20% state tax
// Note: The "brytpunkt" is 660,400 kr but that includes grundavdrag

// F-skatt warning thresholds (percentage difference)
const WARNING_THRESHOLDS = {
  safe: 0.05, // < 5% difference
  info: 0.15, // 5-15% difference
  warning: 0.30, // 15-30% difference
  // > 30% = danger
}

/**
 * Calculate progressive grundavdrag (basic deduction) for 2026
 * Based on Skatteverket's table - varies by income level
 *
 * Income ranges and corresponding grundavdrag:
 * - 0 - 25,100: grundavdrag = income (no tax)
 * - 25,100 - 58,900: 25,100 kr
 * - 58,900 - 161,000: Progressive increase up to 45,600 kr
 * - 161,000 - 184,900: 45,600 kr (maximum)
 * - 184,900 - 466,000: Progressive decrease
 * - 466,000+: 17,400 kr (minimum for high earners)
 */
export function calculateGrundavdrag(taxableIncome: number): number {
  if (taxableIncome <= 0) return 0

  // Very low income - grundavdrag equals income (no tax)
  if (taxableIncome <= 25100) {
    return taxableIncome
  }

  // Low income - minimum grundavdrag
  if (taxableIncome <= 58900) {
    return 25100
  }

  // Rising phase - interpolate between 25,100 and 45,600
  if (taxableIncome <= 161000) {
    const progress = (taxableIncome - 58900) / (161000 - 58900)
    return Math.round(25100 + progress * (45600 - 25100))
  }

  // Maximum grundavdrag zone
  if (taxableIncome <= 184900) {
    return 45600
  }

  // Declining phase - interpolate between 45,600 and 17,400
  if (taxableIncome <= 466000) {
    const progress = (taxableIncome - 184900) / (466000 - 184900)
    return Math.round(45600 - progress * (45600 - 17400))
  }

  // High earners - minimum grundavdrag
  return 17400
}

/**
 * Calculate tax estimates for Enskild Firma
 * @param netIncome - Net income after expenses
 * @param preliminaryTaxPaidYTD - Preliminary tax paid year to date
 * @param schablonavdrag - Optional schablonavdrag summary for deductions
 * @param momsFromUnpaidInvoices - VAT from unpaid invoices that needs to be paid
 */
export function calculateEFTax(
  netIncome: number,
  preliminaryTaxPaidYTD: number = 0,
  schablonavdrag?: SchablonavdragSummary | null,
  momsFromUnpaidInvoices: number = 0
): TaxEstimate {
  // Apply schablonavdrag deductions to net income
  const schablonavdragDeduction = schablonavdrag?.total_deduction || 0
  const adjustedNetIncome = netIncome - schablonavdragDeduction

  if (adjustedNetIncome <= 0) {
    return {
      egenavgifter: 0,
      income_tax: 0,
      state_tax: 0,
      moms_to_pay: momsFromUnpaidInvoices,
      total_tax_liability: momsFromUnpaidInvoices,
      preliminary_paid_ytd: preliminaryTaxPaidYTD,
      difference: momsFromUnpaidInvoices - preliminaryTaxPaidYTD,
      schablonavdrag_deduction: schablonavdragDeduction,
    }
  }

  // Egenavgifter (self-employment contributions) - 28.97%
  const egenavgifter = adjustedNetIncome * TAX_RATES.egenavgifter

  // Taxable income (after egenavgifter deduction)
  // 25% of egenavgifter is deductible from taxable income
  const egenavgifterDeduction = egenavgifter * 0.25
  const taxableIncome = adjustedNetIncome - egenavgifterDeduction

  // Calculate progressive grundavdrag based on income level
  const grundavdrag = calculateGrundavdrag(taxableIncome)
  const incomeAfterGrundavdrag = Math.max(0, taxableIncome - grundavdrag)

  // Municipal income tax (~32.38% average for 2026)
  const municipalTax = incomeAfterGrundavdrag * TAX_RATES.municipalTax

  // State income tax (20% on income above threshold)
  // Only applies to taxable income above 643,100 kr
  const incomeAboveThreshold = Math.max(0, incomeAfterGrundavdrag - STATE_TAX_THRESHOLD)
  const stateTax = incomeAboveThreshold * TAX_RATES.stateTax

  const totalIncomeTax = municipalTax + stateTax
  const totalTax = egenavgifter + totalIncomeTax + momsFromUnpaidInvoices

  return {
    egenavgifter: Math.round(egenavgifter),
    income_tax: Math.round(municipalTax),
    state_tax: Math.round(stateTax),
    moms_to_pay: Math.round(momsFromUnpaidInvoices),
    total_tax_liability: Math.round(totalTax),
    preliminary_paid_ytd: preliminaryTaxPaidYTD,
    difference: Math.round(totalTax - preliminaryTaxPaidYTD),
    schablonavdrag_deduction: schablonavdragDeduction,
    grundavdrag: Math.round(grundavdrag),
  }
}

/**
 * Calculate tax estimates for Aktiebolag
 * @param profit - Company profit
 * @param salaryCostsYTD - Salary costs year to date (for reference)
 * @param preliminaryTaxPaidYTD - Preliminary tax paid year to date
 * @param momsFromUnpaidInvoices - VAT from unpaid invoices
 */
export function calculateABTax(
  profit: number,
  salaryCostsYTD: number = 0,
  preliminaryTaxPaidYTD: number = 0,
  momsFromUnpaidInvoices: number = 0
): TaxEstimate {
  // Bolagsskatt on profit
  const bolagsskatt = profit > 0 ? profit * TAX_RATES.bolagsskatt : 0

  // Arbetsgivaravgifter on salaries (already included in salary costs usually)
  // This is just for reference
  const arbetsgivaravgifter = salaryCostsYTD * TAX_RATES.arbetsgivaravgifter

  const totalTax = bolagsskatt + momsFromUnpaidInvoices

  return {
    bolagsskatt: Math.round(bolagsskatt),
    moms_to_pay: Math.round(momsFromUnpaidInvoices),
    total_tax_liability: Math.round(totalTax),
    preliminary_paid_ytd: preliminaryTaxPaidYTD,
    difference: Math.round(totalTax - preliminaryTaxPaidYTD),
  }
}

/**
 * Calculate available balance (after tax reservations)
 */
export function calculateAvailableBalance(
  currentBalance: number,
  taxEstimate: TaxEstimate
): number {
  const taxReservation = Math.max(0, taxEstimate.total_tax_liability - taxEstimate.preliminary_paid_ytd)
  return Math.max(0, currentBalance - taxReservation)
}

/**
 * Get tax warning status (legacy - simplified version)
 */
export function getTaxWarningStatus(
  taxEstimate: TaxEstimate
): { level: 'ok' | 'warning' | 'danger'; message: string } {
  const enhanced = getEnhancedTaxWarningStatus(taxEstimate, 0)
  // Map new levels to legacy format
  const levelMap: Record<TaxWarningLevel, 'ok' | 'warning' | 'danger'> = {
    safe: 'ok',
    info: 'warning',
    warning: 'warning',
    danger: 'danger',
  }
  return {
    level: levelMap[enhanced.level],
    message: enhanced.message,
  }
}

/**
 * Get enhanced tax warning status with more detail
 * @param taxEstimate - Current tax estimate
 * @param preliminaryTaxMonthly - Monthly preliminary tax amount
 * @param currentMonth - Current month (1-12), defaults to current date
 */
export function getEnhancedTaxWarningStatus(
  taxEstimate: TaxEstimate,
  preliminaryTaxMonthly: number,
  currentMonth: number = new Date().getMonth() + 1
): TaxWarningStatus {
  // Calculate percentage difference
  const percentageDifference =
    taxEstimate.total_tax_liability > 0
      ? taxEstimate.difference / taxEstimate.total_tax_liability
      : 0

  // Determine warning level
  let level: TaxWarningLevel
  if (taxEstimate.difference <= 0) {
    level = 'safe'
  } else if (percentageDifference < WARNING_THRESHOLDS.safe) {
    level = 'safe'
  } else if (percentageDifference < WARNING_THRESHOLDS.info) {
    level = 'info'
  } else if (percentageDifference < WARNING_THRESHOLDS.warning) {
    level = 'warning'
  } else {
    level = 'danger'
  }

  // Calculate year-end projection
  const remainingMonths = 12 - currentMonth
  const projectedPreliminaryPayments =
    taxEstimate.preliminary_paid_ytd + preliminaryTaxMonthly * remainingMonths

  // Project total tax assuming same income rate
  const monthsElapsed = currentMonth
  const projectedAnnualIncome =
    monthsElapsed > 0
      ? (taxEstimate.total_tax_liability / monthsElapsed) * 12
      : taxEstimate.total_tax_liability

  const yearEndProjection = {
    estimatedTotalTax: Math.round(projectedAnnualIncome),
    projectedPreliminaryPayments: Math.round(projectedPreliminaryPayments),
    projectedDifference: Math.round(projectedAnnualIncome - projectedPreliminaryPayments),
  }

  // Generate message and recommendation
  let message: string
  let recommendation: string | undefined

  switch (level) {
    case 'safe':
      message = 'Du ligger bra till med din preliminärskatt'
      break
    case 'info':
      message = 'Din beräknade skatt är något högre än inbetald preliminärskatt'
      recommendation = `Överväg att öka din månatliga F-skatt med ca ${formatCurrency(
        Math.ceil((taxEstimate.difference / remainingMonths) * 1.1)
      )} för att undvika kvarskatt.`
      break
    case 'warning':
      message = `Du kan behöva betala ${formatCurrency(taxEstimate.difference)} extra i skatt`
      recommendation = `Vi rekommenderar att du höjer din månatliga F-skatt till ${formatCurrency(
        Math.ceil(preliminaryTaxMonthly + taxEstimate.difference / Math.max(remainingMonths, 1))
      )} för resten av året.`
      break
    case 'danger':
      message = `Stor skillnad! Du kan behöva betala ${formatCurrency(
        taxEstimate.difference
      )} extra i skatt vid deklaration`
      recommendation = `Kontakta Skatteverket för att justera din F-skatt. Nuvarande skillnad är ${Math.round(
        percentageDifference * 100
      )}% av beräknad skatt.`
      break
  }

  return {
    level,
    message,
    percentageDifference,
    yearEndProjection,
    recommendation,
  }
}

/**
 * Helper to format currency for messages
 */
function formatCurrency(amount: number): string {
  return `${Math.round(amount).toLocaleString('sv-SE')} kr`
}

/**
 * Format tax breakdown for display
 */
export function formatTaxBreakdown(
  entityType: EntityType,
  taxEstimate: TaxEstimate
): { label: string; amount: number }[] {
  const items: { label: string; amount: number }[] = []

  if (entityType === 'enskild_firma') {
    if (taxEstimate.egenavgifter) {
      items.push({ label: 'Egenavgifter (28,97%)', amount: taxEstimate.egenavgifter })
    }
    if (taxEstimate.income_tax) {
      items.push({ label: 'Kommunalskatt (~32%)', amount: taxEstimate.income_tax })
    }
    if (taxEstimate.state_tax && taxEstimate.state_tax > 0) {
      items.push({ label: 'Statlig skatt (20%)', amount: taxEstimate.state_tax })
    }
  } else {
    if (taxEstimate.bolagsskatt) {
      items.push({ label: 'Bolagsskatt (20,6%)', amount: taxEstimate.bolagsskatt })
    }
  }

  if (taxEstimate.moms_to_pay > 0) {
    items.push({ label: 'Moms att betala', amount: taxEstimate.moms_to_pay })
  }

  return items
}

/**
 * Calculate balance breakdown for display
 * Shows disponibelt, skatt reservation, and moms reservation separately
 */
export function calculateBalanceBreakdown(
  currentBalance: number,
  taxEstimate: TaxEstimate
): {
  disponibelt: number
  skattReservation: number
  momsReservation: number
  totalLocked: number
} {
  // VAT reservation (separate from income tax)
  const momsReservation = Math.max(0, taxEstimate.moms_to_pay)

  // Income tax/egenavgifter reservation (excluding VAT and what's already paid)
  const incomeTaxLiability = taxEstimate.total_tax_liability - momsReservation
  const skattReservation = Math.max(0, incomeTaxLiability - taxEstimate.preliminary_paid_ytd)

  const totalLocked = skattReservation + momsReservation
  const disponibelt = Math.max(0, currentBalance - totalLocked)

  return {
    disponibelt,
    skattReservation,
    momsReservation,
    totalLocked,
  }
}

/**
 * Calculate available balance (after tax reservations)
 * Enhanced version that returns more details
 */
export function calculateAvailableBalanceDetailed(
  currentBalance: number,
  taxEstimate: TaxEstimate
): {
  availableBalance: number
  breakdown: ReturnType<typeof calculateBalanceBreakdown>
} {
  const breakdown = calculateBalanceBreakdown(currentBalance, taxEstimate)
  return {
    availableBalance: breakdown.disponibelt,
    breakdown,
  }
}
