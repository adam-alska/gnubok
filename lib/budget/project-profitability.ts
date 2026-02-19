import type { SupabaseClient } from '@supabase/supabase-js'
import type { ProjectProfitability } from '@/types/budget-costcenters'

/**
 * Calculate project profitability by summing revenue and expense journal entries
 * tagged with the given project.
 */
export async function calculateProjectProfitability(
  projectId: string,
  supabase: SupabaseClient
): Promise<ProjectProfitability> {
  // Fetch the project
  const { data: project, error: projectError } = await supabase
    .from('projects')
    .select('id, project_number, name, budget_amount')
    .eq('id', projectId)
    .single()

  if (projectError || !project) {
    throw new Error('Projekt hittades inte')
  }

  // Fetch all journal entry lines tagged with this project
  const { data: lines, error: linesError } = await supabase
    .from('journal_entry_lines')
    .select(`
      account_number,
      debit_amount,
      credit_amount,
      journal_entry_id,
      journal_entries!inner(entry_date, status)
    `)
    .eq('project_id', projectId)

  if (linesError) {
    throw new Error('Kunde inte hämta bokföringsposter')
  }

  // Filter to posted entries only
  const postedLines = (lines || []).filter(
    (l: Record<string, unknown>) => {
      const je = l.journal_entries as { status: string; entry_date: string } | null
      return je?.status === 'posted'
    }
  )

  // Get account info for classification
  const accountNumbers = [...new Set(postedLines.map(l => l.account_number))]
  const { data: accounts } = await supabase
    .from('chart_of_accounts')
    .select('account_number, account_class')
    .in('account_number', accountNumbers.length > 0 ? accountNumbers : ['__none__'])

  const accountClassMap = new Map(
    (accounts || []).map(a => [a.account_number, a.account_class as number])
  )

  // Calculate totals
  let totalRevenue = 0
  let totalExpenses = 0

  // Monthly breakdowns
  const revenueByMonth = new Map<string, number>()
  const expenseByMonth = new Map<string, number>()

  for (const line of postedLines) {
    const je = line.journal_entries as unknown as { entry_date: string; status: string }
    const accountClass = accountClassMap.get(line.account_number) || parseInt(line.account_number[0]) || 0
    const entryDate = new Date(je.entry_date)
    const monthKey = `${entryDate.getFullYear()}-${String(entryDate.getMonth() + 1).padStart(2, '0')}`

    if (accountClass === 3) {
      // Revenue: credit normal
      const amount = (line.credit_amount || 0) - (line.debit_amount || 0)
      totalRevenue += amount
      revenueByMonth.set(monthKey, (revenueByMonth.get(monthKey) || 0) + amount)
    } else if (accountClass >= 4 && accountClass <= 7) {
      // Expenses: debit normal
      const amount = (line.debit_amount || 0) - (line.credit_amount || 0)
      totalExpenses += amount
      expenseByMonth.set(monthKey, (expenseByMonth.get(monthKey) || 0) + amount)
    }
  }

  const grossMargin = totalRevenue - totalExpenses
  const grossMarginPercentage = totalRevenue !== 0
    ? (grossMargin / totalRevenue) * 100
    : 0
  const netResult = grossMargin
  const netMarginPercentage = totalRevenue !== 0
    ? (netResult / totalRevenue) * 100
    : 0
  const budgetUtilization = project.budget_amount > 0
    ? (totalExpenses / project.budget_amount) * 100
    : 0

  // Collect all months and sort
  const allMonths = new Set([...revenueByMonth.keys(), ...expenseByMonth.keys()])
  const sortedMonths = [...allMonths].sort()

  return {
    project_id: project.id,
    project_number: project.project_number,
    project_name: project.name,
    budget_amount: project.budget_amount || 0,
    total_revenue: Math.round(totalRevenue * 100) / 100,
    total_expenses: Math.round(totalExpenses * 100) / 100,
    gross_margin: Math.round(grossMargin * 100) / 100,
    gross_margin_percentage: Math.round(grossMarginPercentage * 100) / 100,
    net_result: Math.round(netResult * 100) / 100,
    net_margin_percentage: Math.round(netMarginPercentage * 100) / 100,
    budget_utilization: Math.round(budgetUtilization * 100) / 100,
    revenue_by_month: sortedMonths.map(month => ({
      month,
      amount: Math.round((revenueByMonth.get(month) || 0) * 100) / 100,
    })),
    expense_by_month: sortedMonths.map(month => ({
      month,
      amount: Math.round((expenseByMonth.get(month) || 0) * 100) / 100,
    })),
  }
}
