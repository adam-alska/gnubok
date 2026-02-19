import type { SupabaseClient } from '@supabase/supabase-js'
import { calculateKPIs } from './financial-analysis'

/**
 * Take a KPI snapshot for all active users.
 * Designed to be called by a cron job (daily).
 */
export async function takeKPISnapshot(supabase: SupabaseClient): Promise<{
  processed: number
  errors: number
}> {
  // Get all users with company settings (active users)
  const { data: users, error: userError } = await supabase
    .from('company_settings')
    .select('user_id')
    .eq('onboarding_complete', true)

  if (userError || !users) {
    console.error('Failed to fetch users for KPI snapshot:', userError)
    return { processed: 0, errors: 1 }
  }

  const today = new Date()
  const dateStr = today.toISOString().split('T')[0]
  const dayOfWeek = today.getDay()
  const dayOfMonth = today.getDate()

  let processed = 0
  let errors = 0

  for (const { user_id } of users) {
    try {
      const kpis = await calculateKPIs(user_id, today, supabase)

      // Always take daily snapshot
      await upsertSnapshot(supabase, user_id, dateStr, 'daily', kpis)

      // Weekly snapshot on Mondays
      if (dayOfWeek === 1) {
        await upsertSnapshot(supabase, user_id, dateStr, 'weekly', kpis)
      }

      // Monthly snapshot on the 1st
      if (dayOfMonth === 1) {
        await upsertSnapshot(supabase, user_id, dateStr, 'monthly', kpis)
      }

      processed++
    } catch (err) {
      console.error(`KPI snapshot failed for user ${user_id}:`, err)
      errors++
    }
  }

  return { processed, errors }
}

/**
 * Take a KPI snapshot for a single user.
 */
export async function takeUserKPISnapshot(
  userId: string,
  supabase: SupabaseClient
): Promise<void> {
  const today = new Date()
  const dateStr = today.toISOString().split('T')[0]
  const kpis = await calculateKPIs(userId, today, supabase)

  await upsertSnapshot(supabase, userId, dateStr, 'daily', kpis)
}

async function upsertSnapshot(
  supabase: SupabaseClient,
  userId: string,
  date: string,
  periodType: 'daily' | 'weekly' | 'monthly',
  kpis: {
    revenue: number
    expenses: number
    net_income: number
    gross_margin_pct: number
    operating_margin_pct: number
    accounts_receivable: number
    accounts_payable: number
    cash_balance: number
    invoice_count: number
    average_invoice_value: number
    days_sales_outstanding: number
    current_ratio: number
    quick_ratio: number
    burn_rate: number
    runway_months: number
  }
): Promise<void> {
  const { error } = await supabase
    .from('kpi_snapshots')
    .upsert(
      {
        user_id: userId,
        snapshot_date: date,
        period_type: periodType,
        revenue: kpis.revenue,
        expenses: kpis.expenses,
        net_income: kpis.net_income,
        gross_margin_pct: kpis.gross_margin_pct,
        operating_margin_pct: kpis.operating_margin_pct,
        accounts_receivable: kpis.accounts_receivable,
        accounts_payable: kpis.accounts_payable,
        cash_balance: kpis.cash_balance,
        invoice_count: kpis.invoice_count,
        average_invoice_value: kpis.average_invoice_value,
        days_sales_outstanding: kpis.days_sales_outstanding,
        current_ratio: kpis.current_ratio,
        quick_ratio: kpis.quick_ratio,
        burn_rate: kpis.burn_rate,
        runway_months: kpis.runway_months,
      },
      {
        onConflict: 'user_id,snapshot_date,period_type',
      }
    )

  if (error) {
    console.error('Snapshot upsert failed:', error)
    throw error
  }
}
