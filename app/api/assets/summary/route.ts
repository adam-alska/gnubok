import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { apiLimiter, rateLimitResponse } from '@/lib/rate-limit'
import type { AssetSummary } from '@/types/fixed-assets'

export async function GET() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { success, remaining, reset } = apiLimiter.check(user.id)
  if (!success) return rateLimitResponse(reset)

  // Fetch all assets for user
  const { data: assets, error } = await supabase
    .from('assets')
    .select('id, acquisition_cost, status')
    .eq('user_id', user.id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const allAssets = assets || []

  // Calculate total acquisition cost
  const totalAcquisitionCost = allAssets.reduce(
    (sum, a) => sum + Number(a.acquisition_cost),
    0
  )

  // Count fully depreciated
  const fullyDepreciated = allAssets.filter(
    (a) => a.status === 'fully_depreciated'
  ).length

  // Calculate total book value from latest depreciation schedule entries
  // For each active asset, get the latest schedule entry up to today
  const today = new Date().toISOString().split('T')[0]
  const activeAssetIds = allAssets
    .filter((a) => a.status === 'active' || a.status === 'fully_depreciated')
    .map((a) => a.id)

  let totalBookValue = totalAcquisitionCost
  let totalDepreciationThisYear = 0

  if (activeAssetIds.length > 0) {
    // Get latest depreciation entry per asset up to today
    const { data: scheduleEntries } = await supabase
      .from('depreciation_schedule')
      .select('asset_id, book_value, accumulated_depreciation, period_date')
      .in('asset_id', activeAssetIds)
      .lte('period_date', today)
      .order('period_date', { ascending: false })

    if (scheduleEntries && scheduleEntries.length > 0) {
      // Group by asset_id and take the latest entry for each
      const latestByAsset = new Map<string, { book_value: number; accumulated_depreciation: number }>()
      for (const entry of scheduleEntries) {
        if (!latestByAsset.has(entry.asset_id)) {
          latestByAsset.set(entry.asset_id, {
            book_value: Number(entry.book_value),
            accumulated_depreciation: Number(entry.accumulated_depreciation),
          })
        }
      }

      // Sum up book values from depreciation data
      totalBookValue = 0
      for (const a of allAssets) {
        if (a.status === 'disposed' || a.status === 'sold' || a.status === 'written_off') continue
        const latest = latestByAsset.get(a.id)
        if (latest) {
          totalBookValue += latest.book_value
        } else {
          totalBookValue += Number(a.acquisition_cost)
        }
      }
    }

    // Calculate this year's depreciation
    const yearStart = `${new Date().getFullYear()}-01-01`
    const { data: yearEntries } = await supabase
      .from('depreciation_schedule')
      .select('depreciation_amount')
      .in('asset_id', activeAssetIds)
      .gte('period_date', yearStart)
      .lte('period_date', today)

    if (yearEntries) {
      totalDepreciationThisYear = yearEntries.reduce(
        (sum, e) => sum + Number(e.depreciation_amount),
        0
      )
    }
  }

  const summary: AssetSummary = {
    totalAssets: allAssets.filter(
      (a) => a.status === 'active' || a.status === 'fully_depreciated'
    ).length,
    totalAcquisitionCost: Math.round(totalAcquisitionCost * 100) / 100,
    totalBookValue: Math.round(totalBookValue * 100) / 100,
    totalDepreciationThisYear: Math.round(totalDepreciationThisYear * 100) / 100,
    fullyDepreciated,
  }

  return NextResponse.json({ data: summary })
}
