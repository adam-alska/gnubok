import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import type { Gift, GiftSummary } from '@/types'

/**
 * GET /api/gifts/summary
 * Get gift summary for a year (used in dashboard and reports)
 * Query params: year (optional, defaults to current year)
 */
export async function GET(request: Request) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Parse query params
  const { searchParams } = new URL(request.url)
  const yearParam = searchParams.get('year')
  const year = yearParam ? parseInt(yearParam) : new Date().getFullYear()

  // Build date range for the year
  const startDate = `${year}-01-01`
  const endDate = `${year}-12-31`

  const { data: gifts, error } = await supabase
    .from('gifts')
    .select('estimated_value, classification')
    .eq('user_id', user.id)
    .gte('date', startDate)
    .lte('date', endDate)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Calculate summary
  const summary: GiftSummary = {
    year,
    total_count: gifts.length,
    total_value: 0,
    taxable_count: 0,
    taxable_value: 0,
    tax_free_count: 0,
    tax_free_value: 0,
    deductible_count: 0,
    deductible_value: 0,
  }

  for (const gift of gifts as Pick<Gift, 'estimated_value' | 'classification'>[]) {
    const value = Number(gift.estimated_value)
    const classification = gift.classification

    summary.total_value += value

    if (classification?.taxable) {
      summary.taxable_count++
      summary.taxable_value += value
    } else {
      summary.tax_free_count++
      summary.tax_free_value += value
    }

    if (classification?.deductibleAsExpense) {
      summary.deductible_count++
      summary.deductible_value += value
    }
  }

  // Round values to 2 decimal places
  summary.total_value = Math.round(summary.total_value * 100) / 100
  summary.taxable_value = Math.round(summary.taxable_value * 100) / 100
  summary.tax_free_value = Math.round(summary.tax_free_value * 100) / 100
  summary.deductible_value = Math.round(summary.deductible_value * 100) / 100

  return NextResponse.json({ data: summary })
}
