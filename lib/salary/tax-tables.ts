import type { SupabaseClient } from '@supabase/supabase-js'

export interface TaxTableRate {
  tableYear: number
  tableNumber: number
  columnNumber: number
  incomeFrom: number
  incomeTo: number
  taxAmount: number
}

/**
 * Look up the tax amount for a given monthly income using Skatteverket tax tables.
 *
 * Tax tables work on monthly income brackets:
 * - Find the bracket where income_from <= monthlyIncome <= income_to
 * - Return the tax_amount for that bracket
 *
 * @param tableNumber - Skattetabell number (29-42, based on kommun skattesats)
 * @param column - Column 1-6 per employee category
 * @param monthlyIncome - Monthly taxable income in SEK
 * @param rates - Pre-loaded tax table rates
 */
export function lookupTaxAmount(
  tableNumber: number,
  column: number,
  monthlyIncome: number,
  rates: TaxTableRate[]
): number {
  const roundedIncome = Math.round(monthlyIncome)

  // Filter to matching table and column
  const matchingRates = rates.filter(
    r => r.tableNumber === tableNumber && r.columnNumber === column
  )

  if (matchingRates.length === 0) {
    // Fallback: 30% flat rate if table not found
    return Math.round(roundedIncome * 0.30 * 100) / 100
  }

  // Sort by income_from ascending
  matchingRates.sort((a, b) => a.incomeFrom - b.incomeFrom)

  // Find the bracket
  for (const rate of matchingRates) {
    if (roundedIncome >= rate.incomeFrom && roundedIncome <= rate.incomeTo) {
      return rate.taxAmount
    }
  }

  // If income exceeds all brackets, use the last bracket
  const lastRate = matchingRates[matchingRates.length - 1]
  if (roundedIncome > lastRate.incomeTo) {
    return lastRate.taxAmount
  }

  // Below minimum bracket — no tax
  return 0
}

/**
 * Load tax table rates from database for a specific year and table.
 */
export async function loadTaxTableRates(
  supabase: SupabaseClient,
  year: number,
  tableNumber: number,
  column: number
): Promise<TaxTableRate[]> {
  const { data, error } = await supabase
    .from('tax_table_rates')
    .select('*')
    .eq('table_year', year)
    .eq('table_number', tableNumber)
    .eq('column_number', column)
    .order('income_from', { ascending: true })

  if (error) {
    throw new Error(`Failed to load tax table rates: ${error.message}`)
  }

  return (data || []).map(r => ({
    tableYear: r.table_year,
    tableNumber: r.table_number,
    columnNumber: r.column_number,
    incomeFrom: r.income_from,
    incomeTo: r.income_to,
    taxAmount: r.tax_amount,
  }))
}

/**
 * Load all tax table rates for a year (all tables/columns).
 * Used for bulk operations like salary run calculation.
 */
export async function loadAllTaxTableRates(
  supabase: SupabaseClient,
  year: number
): Promise<TaxTableRate[]> {
  const { data, error } = await supabase
    .from('tax_table_rates')
    .select('*')
    .eq('table_year', year)
    .order('table_number')
    .order('column_number')
    .order('income_from')

  if (error) {
    throw new Error(`Failed to load tax table rates: ${error.message}`)
  }

  return (data || []).map(r => ({
    tableYear: r.table_year,
    tableNumber: r.table_number,
    columnNumber: r.column_number,
    incomeFrom: r.income_from,
    incomeTo: r.income_to,
    taxAmount: r.tax_amount,
  }))
}

/**
 * Calculate tax using jämkning (custom percentage from Skatteverket decision).
 */
export function calculateJamkningTax(monthlyIncome: number, jamkningPercentage: number): number {
  return Math.round(monthlyIncome * (jamkningPercentage / 100) * 100) / 100
}

/**
 * Calculate tax for sidoinkomst (flat 30%).
 */
export function calculateSidoinkomstTax(monthlyIncome: number): number {
  return Math.round(monthlyIncome * 0.30 * 100) / 100
}
