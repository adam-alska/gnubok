import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  BudgetVsActualRow,
  BudgetVsActualReport,
  BudgetVsActualSection,
  DistributionPattern,
} from '@/types/budget-costcenters'

// Month field keys for budget entries
const MONTH_KEYS = [
  'month_1', 'month_2', 'month_3', 'month_4',
  'month_5', 'month_6', 'month_7', 'month_8',
  'month_9', 'month_10', 'month_11', 'month_12',
] as const

// Account class section titles
const SECTION_TITLES: Record<number, string> = {
  3: 'Intäkter (klass 3)',
  4: 'Varuinköp & direkta kostnader (klass 4)',
  5: 'Lokalkostnader (klass 5)',
  6: 'Övriga externa kostnader (klass 6)',
  7: 'Personalkostnader (klass 7)',
  8: 'Finansiella poster (klass 8)',
}

/**
 * Calculate budget vs actual for a given budget.
 * Groups rows by account class and calculates monthly actuals from journal entries.
 */
export async function calculateBudgetVsActual(
  budgetId: string,
  supabase: SupabaseClient
): Promise<BudgetVsActualReport> {
  // Fetch the budget with fiscal period
  const { data: budget, error: budgetError } = await supabase
    .from('budgets')
    .select(`
      *,
      fiscal_period:fiscal_periods(id, name, period_start, period_end)
    `)
    .eq('id', budgetId)
    .single()

  if (budgetError || !budget) {
    throw new Error('Budget hittades inte')
  }

  const fiscalPeriod = budget.fiscal_period
  if (!fiscalPeriod) {
    throw new Error('Räkenskapsperiod saknas för budgeten')
  }

  // Fetch all budget entries
  const { data: entries, error: entriesError } = await supabase
    .from('budget_entries')
    .select('*')
    .eq('budget_id', budgetId)
    .order('account_number')

  if (entriesError) {
    throw new Error('Kunde inte hämta budgetposter')
  }

  // Fetch account names for all referenced accounts
  const accountNumbers = [...new Set((entries || []).map(e => e.account_number))]
  const { data: accounts } = await supabase
    .from('chart_of_accounts')
    .select('account_number, account_name, account_class')
    .in('account_number', accountNumbers.length > 0 ? accountNumbers : ['__none__'])

  const accountMap = new Map(
    (accounts || []).map(a => [a.account_number, { name: a.account_name, class: a.account_class }])
  )

  // Fetch actual journal entry lines for the fiscal period
  const { data: journalEntries } = await supabase
    .from('journal_entries')
    .select('id, entry_date')
    .eq('fiscal_period_id', fiscalPeriod.id)
    .eq('status', 'posted')

  const journalEntryIds = (journalEntries || []).map(je => je.id)
  const journalEntryDateMap = new Map(
    (journalEntries || []).map(je => [je.id, je.entry_date])
  )

  let journalLines: Array<{
    journal_entry_id: string
    account_number: string
    debit_amount: number
    credit_amount: number
    cost_center_id: string | null
    project_id: string | null
  }> = []

  if (journalEntryIds.length > 0) {
    // Fetch in batches if needed
    const batchSize = 500
    for (let i = 0; i < journalEntryIds.length; i += batchSize) {
      const batch = journalEntryIds.slice(i, i + batchSize)
      const { data: lines } = await supabase
        .from('journal_entry_lines')
        .select('journal_entry_id, account_number, debit_amount, credit_amount, cost_center_id, project_id')
        .in('journal_entry_id', batch)

      if (lines) {
        journalLines = journalLines.concat(lines)
      }
    }
  }

  // Calculate month from the fiscal period start
  const periodStart = new Date(fiscalPeriod.period_start)
  const startMonth = periodStart.getMonth() // 0-based

  // Build actual amounts per account/cost_center/project/month
  type ActualKey = string
  function makeKey(accountNumber: string, costCenterId: string | null, projectId: string | null): ActualKey {
    return `${accountNumber}|${costCenterId || ''}|${projectId || ''}`
  }

  const actualsByKeyAndMonth = new Map<ActualKey, number[]>()

  for (const line of journalLines) {
    const entryDate = journalEntryDateMap.get(line.journal_entry_id)
    if (!entryDate) continue

    const date = new Date(entryDate)
    const lineMonth = date.getMonth() // 0-based
    // Calculate month index relative to fiscal period start (0-11)
    let monthIndex = lineMonth - startMonth
    if (monthIndex < 0) monthIndex += 12

    if (monthIndex < 0 || monthIndex > 11) continue

    const key = makeKey(line.account_number, line.cost_center_id, line.project_id)
    if (!actualsByKeyAndMonth.has(key)) {
      actualsByKeyAndMonth.set(key, new Array(12).fill(0))
    }

    const months = actualsByKeyAndMonth.get(key)!
    // For revenue accounts (class 3), credit is positive
    // For expense accounts (class 4-8), debit is positive
    const accountInfo = accountMap.get(line.account_number)
    const accountClass = accountInfo?.class || parseInt(line.account_number[0]) || 0

    if (accountClass === 3) {
      months[monthIndex] += (line.credit_amount || 0) - (line.debit_amount || 0)
    } else {
      months[monthIndex] += (line.debit_amount || 0) - (line.credit_amount || 0)
    }
  }

  // Build BudgetVsActualRow for each budget entry
  const rows: BudgetVsActualRow[] = (entries || []).map(entry => {
    const accountInfo = accountMap.get(entry.account_number)
    const key = makeKey(entry.account_number, entry.cost_center_id, entry.project_id)
    const actualMonths = actualsByKeyAndMonth.get(key) || new Array(12).fill(0)

    const budgetMonths = MONTH_KEYS.map(k => Number(entry[k]) || 0)
    const varianceMonths = actualMonths.map((actual, i) => actual - budgetMonths[i])

    const budgetTotal = budgetMonths.reduce((s, v) => s + v, 0)
    const actualTotal = actualMonths.reduce((s, v) => s + v, 0)
    const varianceTotal = actualTotal - budgetTotal
    const variancePercentage = budgetTotal !== 0
      ? ((actualTotal - budgetTotal) / Math.abs(budgetTotal)) * 100
      : 0

    return {
      account_number: entry.account_number,
      account_name: accountInfo?.name || entry.account_number,
      account_class: accountInfo?.class || parseInt(entry.account_number[0]) || 0,
      cost_center_id: entry.cost_center_id,
      cost_center_name: null, // filled below if needed
      project_id: entry.project_id,
      project_name: null,
      budget_months: budgetMonths,
      actual_months: actualMonths,
      variance_months: varianceMonths,
      budget_total: budgetTotal,
      actual_total: actualTotal,
      variance_total: varianceTotal,
      variance_percentage: Math.round(variancePercentage * 100) / 100,
    }
  })

  // Group by account class into sections
  const sectionMap = new Map<number, BudgetVsActualRow[]>()
  for (const row of rows) {
    const cls = row.account_class
    if (!sectionMap.has(cls)) {
      sectionMap.set(cls, [])
    }
    sectionMap.get(cls)!.push(row)
  }

  const sections: BudgetVsActualSection[] = []
  const sortedClasses = [...sectionMap.keys()].sort()

  for (const cls of sortedClasses) {
    const sectionRows = sectionMap.get(cls)!
    sectionRows.sort((a, b) => a.account_number.localeCompare(b.account_number))

    sections.push({
      title: SECTION_TITLES[cls] || `Klass ${cls}`,
      account_class: cls,
      rows: sectionRows,
      subtotal_budget: sectionRows.reduce((s, r) => s + r.budget_total, 0),
      subtotal_actual: sectionRows.reduce((s, r) => s + r.actual_total, 0),
      subtotal_variance: sectionRows.reduce((s, r) => s + r.variance_total, 0),
    })
  }

  const revenueSection = sections.find(s => s.account_class === 3)
  const expenseSections = sections.filter(s => s.account_class >= 4)

  const totalRevenueBudget = revenueSection?.subtotal_budget || 0
  const totalRevenueActual = revenueSection?.subtotal_actual || 0
  const totalExpenseBudget = expenseSections.reduce((s, sec) => s + sec.subtotal_budget, 0)
  const totalExpenseActual = expenseSections.reduce((s, sec) => s + sec.subtotal_actual, 0)

  return {
    budget_name: budget.name,
    period_start: fiscalPeriod.period_start,
    period_end: fiscalPeriod.period_end,
    sections,
    total_revenue_budget: totalRevenueBudget,
    total_revenue_actual: totalRevenueActual,
    total_expense_budget: totalExpenseBudget,
    total_expense_actual: totalExpenseActual,
    net_result_budget: totalRevenueBudget - totalExpenseBudget,
    net_result_actual: totalRevenueActual - totalExpenseActual,
  }
}

/**
 * Create budget entries from a previous fiscal period's actual results.
 * Copies actual amounts and applies an optional percentage adjustment.
 */
export async function createBudgetFromPreviousYear(
  sourceFiscalPeriodId: string,
  targetBudgetId: string,
  adjustmentPercent: number,
  supabase: SupabaseClient
): Promise<{ created: number }> {
  // Get source fiscal period
  const { data: sourcePeriod, error: spError } = await supabase
    .from('fiscal_periods')
    .select('id, period_start, period_end')
    .eq('id', sourceFiscalPeriodId)
    .single()

  if (spError || !sourcePeriod) {
    throw new Error('Källperiod hittades inte')
  }

  // Get all posted journal entries in the source period
  const { data: journalEntries } = await supabase
    .from('journal_entries')
    .select('id, entry_date')
    .eq('fiscal_period_id', sourceFiscalPeriodId)
    .eq('status', 'posted')

  if (!journalEntries || journalEntries.length === 0) {
    return { created: 0 }
  }

  const journalEntryIds = journalEntries.map(je => je.id)
  const journalEntryDateMap = new Map(
    journalEntries.map(je => [je.id, je.entry_date])
  )

  // Fetch all lines
  let allLines: Array<{
    journal_entry_id: string
    account_number: string
    debit_amount: number
    credit_amount: number
    cost_center_id: string | null
    project_id: string | null
  }> = []

  const batchSize = 500
  for (let i = 0; i < journalEntryIds.length; i += batchSize) {
    const batch = journalEntryIds.slice(i, i + batchSize)
    const { data: lines } = await supabase
      .from('journal_entry_lines')
      .select('journal_entry_id, account_number, debit_amount, credit_amount, cost_center_id, project_id')
      .in('journal_entry_id', batch)

    if (lines) {
      allLines = allLines.concat(lines)
    }
  }

  // Get account info
  const accountNumbers = [...new Set(allLines.map(l => l.account_number))]
  const { data: accounts } = await supabase
    .from('chart_of_accounts')
    .select('account_number, account_class')
    .in('account_number', accountNumbers.length > 0 ? accountNumbers : ['__none__'])

  const accountClassMap = new Map(
    (accounts || []).map(a => [a.account_number, a.account_class as number])
  )

  // Aggregate by account/cost_center/project/month
  const periodStart = new Date(sourcePeriod.period_start)
  const startMonth = periodStart.getMonth()

  type AggKey = string
  const aggregated = new Map<AggKey, {
    account_number: string
    cost_center_id: string | null
    project_id: string | null
    months: number[]
  }>()

  for (const line of allLines) {
    const entryDate = journalEntryDateMap.get(line.journal_entry_id)
    if (!entryDate) continue

    const date = new Date(entryDate)
    let monthIndex = date.getMonth() - startMonth
    if (monthIndex < 0) monthIndex += 12
    if (monthIndex < 0 || monthIndex > 11) continue

    const key = `${line.account_number}|${line.cost_center_id || ''}|${line.project_id || ''}`

    if (!aggregated.has(key)) {
      aggregated.set(key, {
        account_number: line.account_number,
        cost_center_id: line.cost_center_id,
        project_id: line.project_id,
        months: new Array(12).fill(0),
      })
    }

    const entry = aggregated.get(key)!
    const accountClass = accountClassMap.get(line.account_number) || parseInt(line.account_number[0]) || 0

    if (accountClass === 3) {
      entry.months[monthIndex] += (line.credit_amount || 0) - (line.debit_amount || 0)
    } else {
      entry.months[monthIndex] += (line.debit_amount || 0) - (line.credit_amount || 0)
    }
  }

  // Apply adjustment and create budget entries
  const multiplier = 1 + (adjustmentPercent / 100)

  const budgetEntries = [...aggregated.values()]
    .filter(agg => {
      const accountClass = accountClassMap.get(agg.account_number) || parseInt(agg.account_number[0]) || 0
      return accountClass >= 3 && accountClass <= 8
    })
    .map(agg => {
      const adjustedMonths = agg.months.map(m => Math.round(m * multiplier * 100) / 100)
      const annualTotal = adjustedMonths.reduce((s, v) => s + v, 0)

      return {
        budget_id: targetBudgetId,
        account_number: agg.account_number,
        cost_center_id: agg.cost_center_id,
        project_id: agg.project_id,
        month_1: adjustedMonths[0],
        month_2: adjustedMonths[1],
        month_3: adjustedMonths[2],
        month_4: adjustedMonths[3],
        month_5: adjustedMonths[4],
        month_6: adjustedMonths[5],
        month_7: adjustedMonths[6],
        month_8: adjustedMonths[7],
        month_9: adjustedMonths[8],
        month_10: adjustedMonths[9],
        month_11: adjustedMonths[10],
        month_12: adjustedMonths[11],
        annual_total: Math.round(annualTotal * 100) / 100,
      }
    })

  if (budgetEntries.length === 0) {
    return { created: 0 }
  }

  // Insert in batches
  let created = 0
  for (let i = 0; i < budgetEntries.length; i += 100) {
    const batch = budgetEntries.slice(i, i + 100)
    const { error } = await supabase
      .from('budget_entries')
      .insert(batch)

    if (error) {
      throw new Error(`Kunde inte skapa budgetposter: ${error.message}`)
    }
    created += batch.length
  }

  return { created }
}

/**
 * Distribute an annual budget amount evenly across 12 months.
 */
export function distributeBudgetEvenly(annualAmount: number): number[] {
  const monthly = Math.round((annualAmount / 12) * 100) / 100
  const months = new Array(12).fill(monthly)
  // Adjust the last month to ensure the total matches exactly
  const total = months.reduce((s: number, v: number) => s + v, 0)
  months[11] = Math.round((months[11] + (annualAmount - total)) * 100) / 100
  return months
}

/**
 * Distribute an annual budget amount according to a seasonal pattern.
 */
export function distributeBudgetSeasonally(
  annualAmount: number,
  pattern: DistributionPattern,
  customWeights?: number[]
): number[] {
  let weights: number[]

  switch (pattern) {
    case 'even':
      return distributeBudgetEvenly(annualAmount)

    case 'q4_heavy':
      // Q1: 7% each month, Q2: 8% each, Q3: 7% each, Q4: 11% each (total: 100%)
      weights = [7, 7, 7, 8, 8, 8, 7, 7, 7, 11, 11, 12]
      break

    case 'summer_low':
      // Summer months (Jun-Aug) reduced, rest compensated
      weights = [9, 9, 9, 9, 9, 6, 5, 5, 9, 10, 10, 10]
      break

    case 'custom':
      if (!customWeights || customWeights.length !== 12) {
        return distributeBudgetEvenly(annualAmount)
      }
      weights = customWeights
      break

    default:
      return distributeBudgetEvenly(annualAmount)
  }

  const totalWeight = weights.reduce((s, w) => s + w, 0)
  const months = weights.map(w => Math.round((annualAmount * w / totalWeight) * 100) / 100)

  // Adjust the last month for rounding
  const total = months.reduce((s, v) => s + v, 0)
  months[11] = Math.round((months[11] + (annualAmount - total)) * 100) / 100

  return months
}

/**
 * Generate a CSV export of budget vs actual data.
 */
export function generateBudgetVsActualCSV(report: BudgetVsActualReport): string {
  const monthHeaders = [
    'Jan', 'Feb', 'Mar', 'Apr', 'Maj', 'Jun',
    'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dec',
  ]

  const lines: string[] = []

  // Header row
  const headerCols = ['Konto', 'Kontonamn']
  for (const m of monthHeaders) {
    headerCols.push(`${m} Budget`, `${m} Utfall`, `${m} Avvikelse`)
  }
  headerCols.push('Helår Budget', 'Helår Utfall', 'Helår Avvikelse', 'Avvikelse %')
  lines.push(headerCols.join(';'))

  for (const section of report.sections) {
    // Section header
    lines.push(`"${section.title}"`)

    for (const row of section.rows) {
      const cols: (string | number)[] = [row.account_number, `"${row.account_name}"`]
      for (let i = 0; i < 12; i++) {
        cols.push(
          formatCSVNumber(row.budget_months[i]),
          formatCSVNumber(row.actual_months[i]),
          formatCSVNumber(row.variance_months[i])
        )
      }
      cols.push(
        formatCSVNumber(row.budget_total),
        formatCSVNumber(row.actual_total),
        formatCSVNumber(row.variance_total),
        formatCSVNumber(row.variance_percentage)
      )
      lines.push(cols.join(';'))
    }

    // Section subtotal
    lines.push(`"","Summa ${section.title}",${
      new Array(36).fill('').join(';')
    };${formatCSVNumber(section.subtotal_budget)};${formatCSVNumber(section.subtotal_actual)};${formatCSVNumber(section.subtotal_variance)};""`)
  }

  // Grand totals
  lines.push('')
  lines.push(`"","Totala intäkter",${''.padStart(36 * 2 - 2, ';')};${formatCSVNumber(report.total_revenue_budget)};${formatCSVNumber(report.total_revenue_actual)};${formatCSVNumber(report.total_revenue_actual - report.total_revenue_budget)};""`)
  lines.push(`"","Totala kostnader",${''.padStart(36 * 2 - 2, ';')};${formatCSVNumber(report.total_expense_budget)};${formatCSVNumber(report.total_expense_actual)};${formatCSVNumber(report.total_expense_actual - report.total_expense_budget)};""`)
  lines.push(`"","Nettoresultat",${''.padStart(36 * 2 - 2, ';')};${formatCSVNumber(report.net_result_budget)};${formatCSVNumber(report.net_result_actual)};${formatCSVNumber(report.net_result_actual - report.net_result_budget)};""`)

  return lines.join('\n')
}

function formatCSVNumber(num: number): string {
  return num.toFixed(2).replace('.', ',')
}
