import type { SupabaseClient } from '@supabase/supabase-js'
import type { FinancialInsight, InsightType, InsightSeverity } from '@/types/financial-insights'
import { generateCashFlowForecast, calculateKPIs, getMonthlyTrend } from './financial-analysis'

interface InsightCandidate {
  insight_type: InsightType
  severity: InsightSeverity
  title: string
  description: string
  action_text: string | null
  action_url: string | null
  data: Record<string, unknown>
}

/**
 * Generate all applicable insights for a user.
 * Runs multiple checks and creates insight records in the database.
 */
export async function generateInsights(
  userId: string,
  supabase: SupabaseClient
): Promise<FinancialInsight[]> {
  // Clear old non-dismissed insights that are expired or stale (> 7 days old)
  const sevenDaysAgo = new Date()
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)

  await supabase
    .from('financial_insights')
    .delete()
    .eq('user_id', userId)
    .eq('is_dismissed', false)
    .lt('created_at', sevenDaysAgo.toISOString())

  // Also clean expired insights
  await supabase
    .from('financial_insights')
    .delete()
    .eq('user_id', userId)
    .lt('expires_at', new Date().toISOString())

  const candidates: InsightCandidate[] = []

  // Run all checks in parallel
  const [
    cashFlowInsights,
    spendingInsights,
    revenueInsights,
    overdueInsights,
    complianceInsights,
    taxInsights,
  ] = await Promise.all([
    checkCashFlowWarnings(userId, supabase),
    checkSpendingAnomalies(userId, supabase),
    checkRevenueTrends(userId, supabase),
    checkOverdueInvoices(userId, supabase),
    checkComplianceReminders(userId, supabase),
    checkTaxOptimization(userId, supabase),
  ])

  candidates.push(...cashFlowInsights)
  candidates.push(...spendingInsights)
  candidates.push(...revenueInsights)
  candidates.push(...overdueInsights)
  candidates.push(...complianceInsights)
  candidates.push(...taxInsights)

  if (candidates.length === 0) {
    // Fetch existing insights
    const { data: existing } = await supabase
      .from('financial_insights')
      .select('*')
      .eq('user_id', userId)
      .eq('is_dismissed', false)
      .order('created_at', { ascending: false })

    return (existing || []) as FinancialInsight[]
  }

  // Deduplicate: don't create insights of same type if already active
  const { data: existingInsights } = await supabase
    .from('financial_insights')
    .select('insight_type')
    .eq('user_id', userId)
    .eq('is_dismissed', false)
    .gte('created_at', sevenDaysAgo.toISOString())

  const existingTypes = new Set((existingInsights || []).map(i => i.insight_type))

  const newCandidates = candidates.filter(c => !existingTypes.has(c.insight_type))

  if (newCandidates.length > 0) {
    const rows = newCandidates.map(c => ({
      user_id: userId,
      insight_type: c.insight_type,
      severity: c.severity,
      title: c.title,
      description: c.description,
      action_text: c.action_text,
      action_url: c.action_url,
      data: c.data,
      expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    }))

    await supabase.from('financial_insights').insert(rows)
  }

  // Return all active insights
  const { data: allInsights } = await supabase
    .from('financial_insights')
    .select('*')
    .eq('user_id', userId)
    .eq('is_dismissed', false)
    .order('severity', { ascending: true }) // critical first
    .order('created_at', { ascending: false })

  return (allInsights || []) as FinancialInsight[]
}

// ============================================================
// Individual Check Functions
// ============================================================

async function checkCashFlowWarnings(
  userId: string,
  supabase: SupabaseClient
): Promise<InsightCandidate[]> {
  const insights: InsightCandidate[] = []

  try {
    const forecast = await generateCashFlowForecast(userId, 90, supabase)

    // Check for negative balance within different timeframes
    const negativeIn14 = forecast.slice(0, 14).find(d => d.balance < 0)
    const negativeIn30 = forecast.slice(0, 30).find(d => d.balance < 0)
    const negativeIn60 = forecast.slice(0, 60).find(d => d.balance < 0)

    if (negativeIn14) {
      insights.push({
        insight_type: 'cash_flow_warning',
        severity: 'critical',
        title: 'Kritiskt: Negativt kassaflode inom 2 veckor',
        description: `Prognosen visar att kontosaldot kan bli negativt runt ${formatDateSwedish(negativeIn14.date)}. Projicerat saldo: ${formatSEK(negativeIn14.balance)}. Se over inkommande betalningar och utgifter.`,
        action_text: 'Se kassaflodesanalys',
        action_url: '/insights',
        data: { negative_date: negativeIn14.date, projected_balance: negativeIn14.balance },
      })
    } else if (negativeIn30) {
      insights.push({
        insight_type: 'cash_flow_warning',
        severity: 'warning',
        title: 'Varning: Kassaflodet kan bli negativt inom 30 dagar',
        description: `Om ingenting andras beraknas kontosaldot bli negativt runt ${formatDateSwedish(negativeIn30.date)}. Projicerat saldo: ${formatSEK(negativeIn30.balance)}.`,
        action_text: 'Granska prognos',
        action_url: '/insights',
        data: { negative_date: negativeIn30.date, projected_balance: negativeIn30.balance },
      })
    } else if (negativeIn60) {
      insights.push({
        insight_type: 'cash_flow_warning',
        severity: 'info',
        title: 'Obs: Negativt kassaflode mojligt inom 60 dagar',
        description: `Langre prognoser visar att saldot kan bli negativt runt ${formatDateSwedish(negativeIn60.date)}. Ha detta i atanke vid planering av storre utgifter.`,
        action_text: 'Se detaljer',
        action_url: '/insights',
        data: { negative_date: negativeIn60.date, projected_balance: negativeIn60.balance },
      })
    }
  } catch {
    // Silently skip if cash flow generation fails
  }

  return insights
}

async function checkSpendingAnomalies(
  userId: string,
  supabase: SupabaseClient
): Promise<InsightCandidate[]> {
  const insights: InsightCandidate[] = []

  const now = new Date()
  const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  const sixMonthsAgo = new Date(now)
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6)

  const { data: transactions } = await supabase
    .from('transactions')
    .select('amount, amount_sek, date, category, is_business')
    .eq('user_id', userId)
    .eq('is_business', true)
    .lt('amount', 0)
    .gte('date', sixMonthsAgo.toISOString().split('T')[0])

  if (!transactions || transactions.length < 10) return insights

  // Group by category and month
  const categoryMonthly = new Map<string, Map<string, number>>()

  for (const tx of transactions) {
    const cat = tx.category || 'uncategorized'
    const month = tx.date.substring(0, 7)
    if (!categoryMonthly.has(cat)) categoryMonthly.set(cat, new Map())
    const monthMap = categoryMonthly.get(cat)!
    monthMap.set(month, (monthMap.get(month) || 0) + Math.abs(Number(tx.amount_sek || tx.amount)))
  }

  for (const [category, monthMap] of categoryMonthly) {
    if (category === 'uncategorized') continue

    const thisMonthAmount = monthMap.get(thisMonth) || 0
    const otherMonths = Array.from(monthMap.entries())
      .filter(([m]) => m !== thisMonth)
      .map(([, v]) => v)

    if (otherMonths.length < 2) continue

    const average = otherMonths.reduce((s, v) => s + v, 0) / otherMonths.length

    if (average > 0 && thisMonthAmount > average * 1.25) {
      const percentAbove = Math.round(((thisMonthAmount - average) / average) * 100)

      insights.push({
        insight_type: 'spending_anomaly',
        severity: percentAbove > 50 ? 'warning' : 'info',
        title: `Hogre kostnader: ${getCategoryLabel(category)}`,
        description: `Denna manad har du spenderat ${formatSEK(thisMonthAmount)} pa ${getCategoryLabel(category).toLowerCase()}, vilket ar ${percentAbove}% hogre an genomsnittet (${formatSEK(average)}).`,
        action_text: 'Granska transaktioner',
        action_url: '/transactions',
        data: { category, this_month: thisMonthAmount, average, percent_above: percentAbove },
      })
      break // Only report the top anomaly
    }
  }

  return insights
}

async function checkRevenueTrends(
  userId: string,
  supabase: SupabaseClient
): Promise<InsightCandidate[]> {
  const insights: InsightCandidate[] = []

  try {
    const trend = await getMonthlyTrend(userId, supabase)
    if (trend.length < 3) return insights

    const recent = trend.slice(-3) // Last 3 months

    // Check for declining revenue (2+ consecutive months)
    const isDecliningSteadily =
      recent.length >= 3 &&
      recent[2].revenue < recent[1].revenue &&
      recent[1].revenue < recent[0].revenue &&
      recent[0].revenue > 0

    if (isDecliningSteadily) {
      const declinePercent = Math.round(
        ((recent[0].revenue - recent[2].revenue) / Math.max(recent[0].revenue, 1)) * 100
      )
      insights.push({
        insight_type: 'revenue_trend',
        severity: Math.abs(declinePercent) > 30 ? 'warning' : 'info',
        title: 'Vikande intakter de senaste manaderna',
        description: `Intakterna har minskat tre manader i rad. Fran ${formatSEK(recent[0].revenue)} till ${formatSEK(recent[2].revenue)} (${declinePercent}%). Overväg atgarder for att vanda trenden.`,
        action_text: 'Se trendanalys',
        action_url: '/insights',
        data: { trend: recent, decline_percent: declinePercent },
      })
    }

    // Check for strong growth
    const isGrowing =
      recent.length >= 3 &&
      recent[2].revenue > recent[1].revenue &&
      recent[1].revenue > recent[0].revenue &&
      recent[0].revenue > 0

    if (isGrowing) {
      const growthPercent = Math.round(
        ((recent[2].revenue - recent[0].revenue) / Math.max(recent[0].revenue, 1)) * 100
      )
      if (growthPercent > 20) {
        insights.push({
          insight_type: 'revenue_trend',
          severity: 'info',
          title: 'Stark intaktstillvaxt!',
          description: `Intakterna har okat ${growthPercent}% over de senaste tre manaderna. Fantastisk utveckling! Se till att kassaflodet hanger med.`,
          action_text: 'Se trendanalys',
          action_url: '/insights',
          data: { trend: recent, growth_percent: growthPercent },
        })
      }
    }
  } catch {
    // Skip on error
  }

  return insights
}

async function checkOverdueInvoices(
  userId: string,
  supabase: SupabaseClient
): Promise<InsightCandidate[]> {
  const insights: InsightCandidate[] = []

  const { data: overdueInvoices } = await supabase
    .from('invoices')
    .select('id, invoice_number, total, total_sek, due_date, customer:customers(name)')
    .eq('user_id', userId)
    .eq('status', 'overdue')
    .order('due_date', { ascending: true })

  if (!overdueInvoices || overdueInvoices.length === 0) return insights

  const totalOverdue = overdueInvoices.reduce(
    (sum, inv) => sum + Number(inv.total_sek || inv.total),
    0
  )

  // Check for long-overdue items (> 30 days)
  const thirtyDaysAgo = new Date()
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
  const longOverdue = overdueInvoices.filter(
    inv => new Date(inv.due_date) < thirtyDaysAgo
  )

  if (longOverdue.length > 0) {
    insights.push({
      insight_type: 'overdue_alert',
      severity: 'critical',
      title: `${longOverdue.length} fakturor forsenade mer an 30 dagar`,
      description: `Totalt ${formatSEK(totalOverdue)} i obetalda fakturor, varav ${longOverdue.length} ar mer an 30 dagar forsenade. Skicka paminnelser eller vidta ytterligare atgarder.`,
      action_text: 'Visa forsenade fakturor',
      action_url: '/invoices?status=unpaid',
      data: { overdue_count: overdueInvoices.length, total_overdue: totalOverdue, long_overdue: longOverdue.length },
    })
  } else if (overdueInvoices.length >= 3) {
    insights.push({
      insight_type: 'overdue_alert',
      severity: 'warning',
      title: `${overdueInvoices.length} fakturor ar forsenade`,
      description: `Du har ${overdueInvoices.length} obetalda fakturor med totalt ${formatSEK(totalOverdue)}. Folja upp med kunderna for att sakerstalla betalning.`,
      action_text: 'Visa obetalda fakturor',
      action_url: '/invoices?status=unpaid',
      data: { overdue_count: overdueInvoices.length, total_overdue: totalOverdue },
    })
  }

  return insights
}

async function checkComplianceReminders(
  userId: string,
  supabase: SupabaseClient
): Promise<InsightCandidate[]> {
  const insights: InsightCandidate[] = []

  const { data: settings } = await supabase
    .from('company_settings')
    .select('vat_registered, moms_period, entity_type')
    .eq('user_id', userId)
    .single()

  if (!settings) return insights

  const now = new Date()
  const currentMonth = now.getMonth() + 1
  const currentDay = now.getDate()

  // Moms declaration deadline (12th of the month after reporting period)
  if (settings.vat_registered && currentDay <= 12) {
    const momsPeriod = settings.moms_period

    let isDeclarationMonth = false
    if (momsPeriod === 'monthly') {
      isDeclarationMonth = true
    } else if (momsPeriod === 'quarterly') {
      isDeclarationMonth = [2, 5, 8, 11].includes(currentMonth)
    } else if (momsPeriod === 'yearly') {
      isDeclarationMonth = currentMonth === 2 // Feb 12 for annual VAT
    }

    if (isDeclarationMonth && currentDay <= 12) {
      const daysUntil = 12 - currentDay
      insights.push({
        insight_type: 'compliance_reminder',
        severity: daysUntil <= 3 ? 'warning' : 'info',
        title: `Momsdeklaration senast den 12:e`,
        description: `Glom inte att lamna in momsdeklarationen senast den 12:e denna manad. ${daysUntil === 0 ? 'Sista dagen ar idag!' : `${daysUntil} dagar kvar.`}`,
        action_text: 'Till momsrapporten',
        action_url: '/reports/vat',
        data: { deadline_day: 12, days_until: daysUntil },
      })
    }
  }

  // AGI (Arbetsgivardeklaration) - same deadline as moms (12th)
  if (settings.entity_type === 'aktiebolag' && currentDay <= 12) {
    insights.push({
      insight_type: 'compliance_reminder',
      severity: currentDay >= 9 ? 'warning' : 'info',
      title: 'Arbetsgivardeklaration',
      description: `Arbetsgivardeklarationen ska lamnas in senast den 12:e varje manad. ${12 - currentDay} dagar kvar.`,
      action_text: 'Till lonehantering',
      action_url: '/payroll',
      data: { deadline_day: 12, type: 'agi' },
    })
  }

  // Annual report reminder (March-June for most companies)
  if (settings.entity_type === 'aktiebolag' && currentMonth >= 3 && currentMonth <= 6) {
    insights.push({
      insight_type: 'compliance_reminder',
      severity: currentMonth >= 5 ? 'warning' : 'info',
      title: 'Årsredovisning ska lämnas in',
      description: 'Årsredovisningen för föregående år ska lämnas in till Bolagsverket senast 7 månader efter räkenskapsårets slut. Kontrollera din deadline.',
      action_text: 'Se bokslut',
      action_url: '/reports',
      data: { type: 'annual_report' },
    })
  }

  return insights
}

async function checkTaxOptimization(
  userId: string,
  supabase: SupabaseClient
): Promise<InsightCandidate[]> {
  const insights: InsightCandidate[] = []

  const { data: settings } = await supabase
    .from('company_settings')
    .select('entity_type, schablonavdrag_settings')
    .eq('user_id', userId)
    .single()

  if (!settings) return insights

  // Check if schablonavdrag is not enabled
  const schablonavdrag = settings.schablonavdrag_settings as { hemmakontor_enabled?: boolean; bil_enabled?: boolean } | null

  if (settings.entity_type === 'enskild_firma') {
    if (!schablonavdrag?.hemmakontor_enabled) {
      insights.push({
        insight_type: 'tax_optimization',
        severity: 'info',
        title: 'Utnyttja hemmakontoravdrag',
        description: 'Du kan gora schablonavdrag for hemmakontor (2 000-4 000 kr/ar). Aktivera det under installningar for att minska skatten.',
        action_text: 'Aktivera avdrag',
        action_url: '/settings',
        data: { type: 'hemmakontor', potential_savings: 4000 },
      })
    }

    if (!schablonavdrag?.bil_enabled) {
      insights.push({
        insight_type: 'tax_optimization',
        severity: 'info',
        title: 'Kor du i tjansten? Registrera milersattning',
        description: 'Om du anvander egen bil i tjansten kan du gora avdrag pa 25 kr/mil. Aktivera milersattning och borja logga resor.',
        action_text: 'Aktivera milersattning',
        action_url: '/mileage',
        data: { type: 'mileage', rate_per_mil: 25 },
      })
    }
  }

  return insights
}

// ============================================================
// Helper Functions
// ============================================================

function formatSEK(amount: number): string {
  return new Intl.NumberFormat('sv-SE', {
    style: 'currency',
    currency: 'SEK',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount)
}

function formatDateSwedish(dateStr: string): string {
  const d = new Date(dateStr)
  return d.toLocaleDateString('sv-SE', { day: 'numeric', month: 'long' })
}

function getCategoryLabel(category: string): string {
  const labels: Record<string, string> = {
    expense_equipment: 'Utrustning',
    expense_software: 'Programvara',
    expense_travel: 'Resor',
    expense_office: 'Kontorskostnader',
    expense_marketing: 'Marknadsforing',
    expense_professional_services: 'Konsulttjanster',
    expense_education: 'Utbildning',
    expense_bank_fees: 'Bankavgifter',
    expense_card_fees: 'Kortavgifter',
    expense_currency_exchange: 'Valutaväxling',
    expense_other: 'Ovrigt',
  }
  return labels[category] || category
}
