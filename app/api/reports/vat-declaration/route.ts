import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import {
  calculateVatDeclaration,
  formatPeriodLabel,
} from '@/lib/reports/vat-declaration'
import type { VatPeriodType } from '@/types'

/**
 * GET /api/reports/vat-declaration
 *
 * Calculate VAT declaration (momsdeklaration) for a given period.
 *
 * Query parameters:
 * - periodType: 'monthly' | 'quarterly' | 'yearly'
 * - year: number (e.g., 2025)
 * - period: number (1-12 for monthly, 1-4 for quarterly, 1 for yearly)
 *
 * Returns:
 * - VAT rutor (boxes) according to Swedish tax authority format
 * - Period information
 * - Breakdown by source (invoices, transactions, receipts)
 */
export async function GET(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const periodType = searchParams.get('periodType') as VatPeriodType | null
  const yearStr = searchParams.get('year')
  const periodStr = searchParams.get('period')

  // Validate required parameters
  if (!periodType || !yearStr || !periodStr) {
    return NextResponse.json(
      { error: 'Missing required parameters: periodType, year, period' },
      { status: 400 }
    )
  }

  // Validate periodType
  if (!['monthly', 'quarterly', 'yearly'].includes(periodType)) {
    return NextResponse.json(
      { error: 'Invalid periodType. Must be: monthly, quarterly, or yearly' },
      { status: 400 }
    )
  }

  const year = parseInt(yearStr, 10)
  const period = parseInt(periodStr, 10)

  // Validate year
  if (isNaN(year) || year < 2000 || year > 2100) {
    return NextResponse.json(
      { error: 'Invalid year. Must be between 2000 and 2100' },
      { status: 400 }
    )
  }

  // Validate period based on type
  if (isNaN(period)) {
    return NextResponse.json(
      { error: 'Invalid period' },
      { status: 400 }
    )
  }

  if (periodType === 'monthly' && (period < 1 || period > 12)) {
    return NextResponse.json(
      { error: 'Invalid period for monthly. Must be 1-12' },
      { status: 400 }
    )
  }

  if (periodType === 'quarterly' && (period < 1 || period > 4)) {
    return NextResponse.json(
      { error: 'Invalid period for quarterly. Must be 1-4' },
      { status: 400 }
    )
  }

  if (periodType === 'yearly' && period !== 1) {
    return NextResponse.json(
      { error: 'Invalid period for yearly. Must be 1' },
      { status: 400 }
    )
  }

  try {
    const declaration = await calculateVatDeclaration(
      user.id,
      periodType,
      year,
      period
    )

    return NextResponse.json({
      data: {
        ...declaration,
        periodLabel: formatPeriodLabel(periodType, year, period),
      },
    })
  } catch (err) {
    console.error('Error calculating VAT declaration:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to calculate VAT declaration' },
      { status: 500 }
    )
  }
}
