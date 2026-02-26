import type { SupabaseClient } from '@supabase/supabase-js'
import { eventBus } from '@/lib/events'
import { validatePeriodDuration } from '@/lib/bookkeeping/validate-period-duration'
import type { FiscalPeriod, PeriodStatus } from '@/types'

/**
 * Lock a fiscal period — prevents new journal entries from being posted.
 * Requires: period exists, belongs to user, not already locked/closed.
 */
export async function lockPeriod(
  supabase: SupabaseClient,
  userId: string,
  fiscalPeriodId: string
): Promise<FiscalPeriod> {

  // Fetch period
  const { data: period, error: fetchError } = await supabase
    .from('fiscal_periods')
    .select('*')
    .eq('id', fiscalPeriodId)
    .eq('user_id', userId)
    .single()

  if (fetchError || !period) {
    throw new Error('Fiscal period not found')
  }

  if (period.is_closed) {
    throw new Error('Period is already closed')
  }

  if (period.locked_at) {
    throw new Error('Period is already locked')
  }

  const { data: updated, error: updateError } = await supabase
    .from('fiscal_periods')
    .update({ locked_at: new Date().toISOString() })
    .eq('id', fiscalPeriodId)
    .eq('user_id', userId)
    .select()
    .single()

  if (updateError || !updated) {
    throw new Error(`Failed to lock period: ${updateError?.message}`)
  }

  const result = updated as FiscalPeriod

  await eventBus.emit({
    type: 'period.locked',
    payload: { period: result, userId },
  })

  return result
}

/**
 * Close a fiscal period — marks it as permanently closed.
 * Requires: period is locked AND closing_entry_id is set (year-end must run first).
 */
export async function closePeriod(
  supabase: SupabaseClient,
  userId: string,
  fiscalPeriodId: string
): Promise<FiscalPeriod> {

  const { data: period, error: fetchError } = await supabase
    .from('fiscal_periods')
    .select('*')
    .eq('id', fiscalPeriodId)
    .eq('user_id', userId)
    .single()

  if (fetchError || !period) {
    throw new Error('Fiscal period not found')
  }

  if (period.is_closed) {
    throw new Error('Period is already closed')
  }

  if (!period.locked_at) {
    throw new Error('Period must be locked before closing')
  }

  if (!period.closing_entry_id) {
    throw new Error('Year-end closing must be executed before closing the period')
  }

  const { data: updated, error: updateError } = await supabase
    .from('fiscal_periods')
    .update({
      is_closed: true,
      closed_at: new Date().toISOString(),
    })
    .eq('id', fiscalPeriodId)
    .eq('user_id', userId)
    .select()
    .single()

  if (updateError || !updated) {
    throw new Error(`Failed to close period: ${updateError?.message}`)
  }

  return updated as FiscalPeriod
}

/**
 * Create the next fiscal period following the current one.
 * Computes dates based on the current period's length (handles brutet räkenskapsår).
 * Sets previous_period_id for chain validation.
 */
export async function createNextPeriod(
  supabase: SupabaseClient,
  userId: string,
  currentPeriodId: string
): Promise<FiscalPeriod> {

  const { data: current, error: fetchError } = await supabase
    .from('fiscal_periods')
    .select('*')
    .eq('id', currentPeriodId)
    .eq('user_id', userId)
    .single()

  if (fetchError || !current) {
    throw new Error('Current fiscal period not found')
  }

  // Compute next period start (day after current end)
  const nextStart = new Date(current.period_end)
  nextStart.setDate(nextStart.getDate() + 1)

  // Compute period length from current period to handle broken fiscal years
  const currentStart = new Date(current.period_start)
  const currentEnd = new Date(current.period_end)

  // Calculate months difference
  const monthsDiff =
    (currentEnd.getFullYear() - currentStart.getFullYear()) * 12 +
    (currentEnd.getMonth() - currentStart.getMonth())

  // Next period end: add same number of months from next start, then go to end of that month
  const nextEnd = new Date(nextStart)
  nextEnd.setMonth(nextEnd.getMonth() + monthsDiff)
  // Go to end of the month
  nextEnd.setMonth(nextEnd.getMonth() + 1)
  nextEnd.setDate(0)

  const nextStartStr = nextStart.toISOString().split('T')[0]
  const nextEndStr = nextEnd.toISOString().split('T')[0]

  // Validate period duration (max 18 months per BFL 3 kap.)
  const durationError = validatePeriodDuration(nextStartStr, nextEndStr)
  if (durationError) {
    throw new Error(durationError)
  }

  // Check for overlapping periods
  const { data: overlapping } = await supabase
    .from('fiscal_periods')
    .select('id')
    .eq('user_id', userId)
    .lte('period_start', nextEndStr)
    .gte('period_end', nextStartStr)
    .limit(1)

  if (overlapping && overlapping.length > 0) {
    throw new Error('Next fiscal period already exists or overlaps with an existing period')
  }

  // Generate name: e.g. "FY 2025" or "FY 2025/2026"
  const startYear = nextStart.getFullYear()
  const endYear = nextEnd.getFullYear()
  const name = startYear === endYear ? `FY ${startYear}` : `FY ${startYear}/${endYear}`

  const { data: newPeriod, error: insertError } = await supabase
    .from('fiscal_periods')
    .insert({
      user_id: userId,
      name,
      period_start: nextStartStr,
      period_end: nextEndStr,
      previous_period_id: currentPeriodId,
    })
    .select()
    .single()

  if (insertError || !newPeriod) {
    throw new Error(`Failed to create next period: ${insertError?.message}`)
  }

  return newPeriod as FiscalPeriod
}

/**
 * Get status summary for a fiscal period.
 */
export async function getPeriodStatus(
  supabase: SupabaseClient,
  userId: string,
  fiscalPeriodId: string
): Promise<PeriodStatus> {

  const { data: period, error: fetchError } = await supabase
    .from('fiscal_periods')
    .select('*')
    .eq('id', fiscalPeriodId)
    .eq('user_id', userId)
    .single()

  if (fetchError || !period) {
    throw new Error('Fiscal period not found')
  }

  // Count draft entries in this period
  const { count: draftCount } = await supabase
    .from('journal_entries')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('fiscal_period_id', fiscalPeriodId)
    .eq('status', 'draft')

  // Check if next period exists
  const nextStart = new Date(period.period_end)
  nextStart.setDate(nextStart.getDate() + 1)

  const { data: nextPeriod } = await supabase
    .from('fiscal_periods')
    .select('id')
    .eq('user_id', userId)
    .eq('previous_period_id', fiscalPeriodId)
    .maybeSingle()

  return {
    is_locked: !!period.locked_at,
    is_closed: period.is_closed,
    has_closing_entry: !!period.closing_entry_id,
    has_opening_balances: period.opening_balances_set,
    draft_count: draftCount ?? 0,
    next_period_exists: !!nextPeriod,
  }
}
