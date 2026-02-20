import { createClient } from '@/lib/supabase/server'

export interface MonthlyBreakdownMonth {
  label: string
  income: number
  expenses: number
  net: number
}

export interface MonthlyBreakdown {
  months: MonthlyBreakdownMonth[]
}

const MONTH_LABELS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'Maj', 'Jun',
  'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dec',
]

/**
 * Generate monthly income vs expenses breakdown for a fiscal period.
 *
 * Groups posted journal entry lines by month and account class:
 * - Class 3 (30xx) = revenue (credit side)
 * - Class 4-7 (40xx-79xx) = expenses (debit side)
 */
export async function generateMonthlyBreakdown(
  userId: string,
  fiscalPeriodId: string
): Promise<MonthlyBreakdown> {
  const supabase = await createClient()

  // Get the fiscal period date range
  const { data: period, error: periodError } = await supabase
    .from('fiscal_periods')
    .select('start_date, end_date')
    .eq('id', fiscalPeriodId)
    .eq('user_id', userId)
    .single()

  if (periodError || !period) {
    return { months: [] }
  }

  // Get all posted journal entry lines for this period with their entry dates
  const { data: lines, error: linesError } = await supabase
    .from('journal_entry_lines')
    .select(`
      account_number,
      debit,
      credit,
      journal_entry:journal_entries!inner(
        entry_date,
        status,
        user_id,
        fiscal_period_id
      )
    `)
    .eq('journal_entries.fiscal_period_id', fiscalPeriodId)
    .eq('journal_entries.user_id', userId)
    .eq('journal_entries.status', 'posted')

  if (linesError || !lines) {
    return { months: [] }
  }

  // Build monthly aggregates
  const monthMap = new Map<number, { income: number; expenses: number }>()

  // Initialize all months in the period range
  const startDate = new Date(period.start_date)
  const endDate = new Date(period.end_date)
  const startMonth = startDate.getMonth()
  const endMonth = endDate.getMonth() + (endDate.getFullYear() - startDate.getFullYear()) * 12

  for (let m = startMonth; m <= endMonth; m++) {
    monthMap.set(m % 12, { income: 0, expenses: 0 })
  }

  for (const line of lines) {
    const entry = line.journal_entry as unknown as {
      entry_date: string
      status: string
      user_id: string
      fiscal_period_id: string
    }
    const accountClass = parseInt(line.account_number.charAt(0))
    const entryDate = new Date(entry.entry_date)
    const month = entryDate.getMonth()

    if (!monthMap.has(month)) {
      monthMap.set(month, { income: 0, expenses: 0 })
    }

    const bucket = monthMap.get(month)!

    if (accountClass === 3) {
      // Revenue accounts: credit side represents revenue
      bucket.income = Math.round((bucket.income + line.credit - line.debit) * 100) / 100
    } else if (accountClass >= 4 && accountClass <= 7) {
      // Expense accounts: debit side represents expenses
      bucket.expenses = Math.round((bucket.expenses + line.debit - line.credit) * 100) / 100
    }
  }

  // Convert to sorted array
  const months: MonthlyBreakdownMonth[] = []
  const sortedMonths = Array.from(monthMap.entries()).sort((a, b) => {
    // Handle year boundaries (e.g., Nov-Dec-Jan for broken fiscal year)
    const aAdj = a[0] < startMonth ? a[0] + 12 : a[0]
    const bAdj = b[0] < startMonth ? b[0] + 12 : b[0]
    return aAdj - bAdj
  })

  for (const [month, data] of sortedMonths) {
    months.push({
      label: MONTH_LABELS[month],
      income: data.income,
      expenses: data.expenses,
      net: Math.round((data.income - data.expenses) * 100) / 100,
    })
  }

  return { months }
}
