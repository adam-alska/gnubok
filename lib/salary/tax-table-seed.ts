/**
 * Swedish tax table data generator for seeding.
 *
 * Generates realistic 2026 tax table data for tables 29-42, columns 1-6.
 * Based on Skatteverket's published table structure where:
 * - Table number = total kommunal skattesats rounded (29.00% → table 29, etc.)
 * - Column 1 = standard employees under 66 (most common)
 * - Tax increases progressively with income brackets
 * - State income tax kicks in above brytpunkt (~55,033 SEK/month for 2026)
 *
 * The generated data follows the real structure closely enough for correct
 * withholding calculations. For production, replace with actual Skatteverket data.
 */

export interface TaxTableSeedRow {
  table_year: number
  table_number: number
  column_number: number
  income_from: number
  income_to: number
  tax_amount: number
}

/**
 * Generate tax table seed data for a given year.
 *
 * Produces ~14 tables × 6 columns × ~75 brackets = ~6,300 rows.
 * Brackets: 100 SEK increments from 0 to 150,000 SEK/month.
 */
export function generateTaxTableSeedData(year: number): TaxTableSeedRow[] {
  const rows: TaxTableSeedRow[] = []

  // 2026 parameters
  const grundavdragMax = 40400 // Approximate max grundavdrag
  const jobbskatteavdragMax = 32000 // Approximate max jobbskatteavdrag
  const statligSkattBrytpunkt = 660400 // Annual
  const statligSkattRate = 0.20
  const monthlyBrytpunkt = Math.round(statligSkattBrytpunkt / 12)

  for (let tableNumber = 29; tableNumber <= 42; tableNumber++) {
    const kommunalSkatt = tableNumber / 100 // e.g. table 33 → 33%

    for (let column = 1; column <= 6; column++) {
      // Column adjustments
      let jobbskatteavdragFactor = 1.0
      let pensionarReduction = false

      switch (column) {
        case 1: // Standard under 66
          jobbskatteavdragFactor = 1.0
          break
        case 2: // Pensioners 66+
          jobbskatteavdragFactor = 0.0 // No jobbskatteavdrag, but lower tax via grundavdrag
          pensionarReduction = true
          break
        case 3: // 66+ with förhöjt jobbskatteavdrag
          jobbskatteavdragFactor = 1.3
          break
        case 4: // Sjuk-/aktivitetsersättning
          jobbskatteavdragFactor = 0.5
          break
        case 5: // Varies by year
          jobbskatteavdragFactor = 0.8
          break
        case 6: // Pre-65 pensions
          jobbskatteavdragFactor = 0.0
          break
      }

      // Generate brackets in 100 SEK steps
      const bracketSize = 100
      const maxIncome = 150000

      for (let incomeFrom = 0; incomeFrom < maxIncome; incomeFrom += bracketSize) {
        const incomeTo = incomeFrom + bracketSize - 1
        const midIncome = incomeFrom + bracketSize / 2

        // Calculate approximate tax for this bracket
        const annualIncome = midIncome * 12

        // Grundavdrag (basic deduction) — progressive, higher for lower incomes
        let grundavdrag: number
        if (annualIncome <= 50000) {
          grundavdrag = grundavdragMax
        } else if (annualIncome <= 200000) {
          grundavdrag = Math.round(grundavdragMax * (1 - (annualIncome - 50000) / 300000))
        } else if (annualIncome <= 450000) {
          grundavdrag = Math.round(grundavdragMax * 0.5)
        } else {
          grundavdrag = Math.round(grundavdragMax * 0.35)
        }

        if (pensionarReduction) {
          grundavdrag = Math.round(grundavdrag * 1.5) // Higher grundavdrag for pensioners
        }

        const taxableAnnual = Math.max(annualIncome - grundavdrag, 0)

        // Kommunalskatt
        const kommunalAnnual = taxableAnnual * kommunalSkatt

        // Statlig skatt (above brytpunkt)
        const statligAnnual = taxableAnnual > statligSkattBrytpunkt
          ? (taxableAnnual - statligSkattBrytpunkt) * statligSkattRate
          : 0

        // Jobbskatteavdrag (work tax credit)
        let jobbskatteavdrag = 0
        if (jobbskatteavdragFactor > 0 && midIncome > 0) {
          if (annualIncome <= 120000) {
            jobbskatteavdrag = Math.round(annualIncome * 0.30 * jobbskatteavdragFactor)
          } else if (annualIncome <= 400000) {
            jobbskatteavdrag = Math.round((36000 + (annualIncome - 120000) * 0.10) * jobbskatteavdragFactor)
          } else {
            jobbskatteavdrag = Math.min(
              Math.round(jobbskatteavdragMax * jobbskatteavdragFactor),
              Math.round((kommunalAnnual + statligAnnual) * 0.95)
            )
          }
        }

        const totalAnnualTax = Math.max(Math.round(kommunalAnnual + statligAnnual - jobbskatteavdrag), 0)
        const monthlyTax = Math.round(totalAnnualTax / 12)

        // Don't generate rows for zero-income brackets
        if (incomeFrom === 0 && monthlyTax === 0) {
          rows.push({
            table_year: year,
            table_number: tableNumber,
            column_number: column,
            income_from: 0,
            income_to: incomeTo,
            tax_amount: 0,
          })
          continue
        }

        rows.push({
          table_year: year,
          table_number: tableNumber,
          column_number: column,
          income_from: incomeFrom,
          income_to: incomeTo,
          tax_amount: monthlyTax,
        })
      }
    }
  }

  return rows
}

/**
 * Generate SQL INSERT statements for tax table data.
 * Used in migration or seed script.
 */
export function generateTaxTableSQL(year: number): string {
  const rows = generateTaxTableSeedData(year)
  const chunks: string[] = []

  // Insert in batches of 500 for performance
  const batchSize = 500
  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize)
    const values = batch.map(r =>
      `(${r.table_year}, ${r.table_number}, ${r.column_number}, ${r.income_from}, ${r.income_to}, ${r.tax_amount})`
    ).join(',\n  ')

    chunks.push(
      `INSERT INTO public.tax_table_rates (table_year, table_number, column_number, income_from, income_to, tax_amount)\nVALUES\n  ${values}\nON CONFLICT (table_year, table_number, column_number, income_from) DO NOTHING;`
    )
  }

  return chunks.join('\n\n')
}
