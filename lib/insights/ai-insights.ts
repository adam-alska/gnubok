import Anthropic from '@anthropic-ai/sdk'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { AIAdvice, AIAdviceItem } from '@/types/financial-insights'
import { getMonthlyTrend, calculateKPIs } from './financial-analysis'

const anthropic = new Anthropic()

/**
 * Generate AI-powered financial advice using Claude.
 * Results are cached for 24 hours to avoid excessive API calls.
 */
export async function generateAIInsight(
  userId: string,
  supabase: SupabaseClient
): Promise<AIAdvice> {
  // Check cache first
  const cached = await getCachedAdvice(userId, supabase)
  if (cached) {
    return { ...cached, cached: true }
  }

  // Gather context data
  const [trend, kpis] = await Promise.all([
    getMonthlyTrend(userId, supabase),
    calculateKPIs(userId, new Date(), supabase),
  ])

  // Get company info
  const { data: settings } = await supabase
    .from('company_settings')
    .select('entity_type, company_name')
    .eq('user_id', userId)
    .single()

  // Get overdue info
  const { count: overdueCount } = await supabase
    .from('invoices')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('status', 'overdue')

  // Build the prompt context
  const recentMonths = trend.slice(-6)
  const financialContext = buildFinancialContext(
    recentMonths,
    kpis,
    settings?.entity_type || 'enskild_firma',
    settings?.company_name || 'Foretaget',
    overdueCount || 0
  )

  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1500,
      messages: [
        {
          role: 'user',
          content: `Du ar en erfaren ekonomisk radgivare for svenska smabolag. Analysera foljande ekonomiska data och ge 3-5 konkreta, handlingsbara rad pa svenska. Var specifik och anvand siffror fran datan.

${financialContext}

Svara i foljande JSON-format (inget annat):
{
  "insights": [
    {
      "title": "Kort rubrik",
      "description": "Detaljerad beskrivning med specifika rad och siffror",
      "category": "cost_reduction|revenue_growth|cash_flow|tax|general",
      "priority": "high|medium|low"
    }
  ]
}`,
        },
      ],
    })

    const text = response.content[0].type === 'text' ? response.content[0].text : ''

    // Parse the JSON response
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      return getDefaultAdvice()
    }

    const parsed = JSON.parse(jsonMatch[0]) as { insights: AIAdviceItem[] }
    const advice: AIAdvice = {
      insights: parsed.insights.slice(0, 5),
      generatedAt: new Date().toISOString(),
      cached: false,
    }

    // Cache the result
    await cacheAdvice(userId, advice, supabase)

    return advice
  } catch (error) {
    console.error('AI insight generation failed:', error)
    return getDefaultAdvice()
  }
}

function buildFinancialContext(
  recentMonths: Array<{ month: string; label: string; revenue: number; expenses: number; profit: number }>,
  kpis: { revenue: number; expenses: number; net_income: number; cash_balance: number; accounts_receivable: number; accounts_payable: number; operating_margin_pct: number; days_sales_outstanding: number; current_ratio: number; burn_rate: number; runway_months: number },
  entityType: string,
  companyName: string,
  overdueCount: number
): string {
  const monthlyDetails = recentMonths
    .map(m => `  ${m.label}: Intakter ${formatSEK(m.revenue)}, Kostnader ${formatSEK(m.expenses)}, Resultat ${formatSEK(m.profit)}`)
    .join('\n')

  return `FORETAG: ${companyName} (${entityType === 'aktiebolag' ? 'Aktiebolag' : 'Enskild firma'})

SENASTE 6 MANADERS RESULTAT:
${monthlyDetails}

NUVARANDE NYCKELTAL (aret hittills):
- Intakter YTD: ${formatSEK(kpis.revenue)}
- Kostnader YTD: ${formatSEK(kpis.expenses)}
- Nettoresultat: ${formatSEK(kpis.net_income)}
- Kassabehallning: ${formatSEK(kpis.cash_balance)}
- Kundfordringar: ${formatSEK(kpis.accounts_receivable)}
- Leverantorsskulder: ${formatSEK(kpis.accounts_payable)}
- Rorelsemarginal: ${kpis.operating_margin_pct}%
- Kundfordringarnas omloppstid (DSO): ${kpis.days_sales_outstanding} dagar
- Likviditetskvot: ${kpis.current_ratio}
- Forsenade fakturor: ${overdueCount} st
${kpis.burn_rate > 0 ? `- Burn rate: ${formatSEK(kpis.burn_rate)}/manad\n- Runway: ${kpis.runway_months} manader` : ''}`
}

function formatSEK(amount: number): string {
  return new Intl.NumberFormat('sv-SE', {
    style: 'currency',
    currency: 'SEK',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount)
}

async function getCachedAdvice(
  userId: string,
  supabase: SupabaseClient
): Promise<AIAdvice | null> {
  const { data } = await supabase
    .from('ai_insights_cache')
    .select('response, created_at')
    .eq('user_id', userId)
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false })
    .limit(1)
    .single()

  if (data) {
    try {
      return JSON.parse(data.response) as AIAdvice
    } catch {
      return null
    }
  }

  return null
}

async function cacheAdvice(
  userId: string,
  advice: AIAdvice,
  supabase: SupabaseClient
): Promise<void> {
  const expiresAt = new Date()
  expiresAt.setHours(expiresAt.getHours() + 24)

  await supabase.from('ai_insights_cache').insert({
    user_id: userId,
    prompt_hash: 'financial_advice_v1',
    response: JSON.stringify(advice),
    model: 'claude-sonnet-4-20250514',
    expires_at: expiresAt.toISOString(),
  })
}

function getDefaultAdvice(): AIAdvice {
  return {
    insights: [
      {
        title: 'Granska dina storsta kostnadsposter',
        description: 'Ga igenom dina topp-5 kostnadskategorier och identifiera var det finns mojlighet att minska utgifterna. Aven sma besparingar per manad summeras over aret.',
        category: 'cost_reduction',
        priority: 'medium',
      },
      {
        title: 'Folja upp obetalda fakturor regelbundet',
        description: 'Satt upp en rutin for att folja upp obetalda fakturor varje vecka. Snabbare betalningar forbattrar kassaflodet avsevart.',
        category: 'cash_flow',
        priority: 'high',
      },
      {
        title: 'Planera for skattebetalningar',
        description: 'Se till att du har tillrackligt avsatt for kommande skatter. En tumregel ar att lagga undan 30-50% av vinsten beroende pa foretagsform.',
        category: 'tax',
        priority: 'medium',
      },
    ],
    generatedAt: new Date().toISOString(),
    cached: false,
  }
}
