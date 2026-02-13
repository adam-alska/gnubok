import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

/**
 * GET /api/exclusivities/conflicts
 * Check for exclusivity conflicts
 * Query params:
 *   - categories: comma-separated list of categories to check
 *   - start_date: ISO date string
 *   - end_date: ISO date string
 *   - exclude_campaign_id: campaign to exclude from check (optional)
 */
export async function GET(request: Request) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const categoriesParam = searchParams.get('categories')
  const startDate = searchParams.get('start_date')
  const endDate = searchParams.get('end_date')
  const excludeCampaignId = searchParams.get('exclude_campaign_id')

  if (!categoriesParam || !startDate || !endDate) {
    return NextResponse.json({
      error: 'Missing required parameters: categories, start_date, end_date'
    }, { status: 400 })
  }

  const categories = categoriesParam.split(',').map(c => c.trim().toLowerCase())

  // Find overlapping exclusivities
  let query = supabase
    .from('exclusivities')
    .select(`
      *,
      campaign:campaigns(id, name, customer_id, customer:customers(id, name))
    `)
    .eq('user_id', user.id)
    .lte('start_date', endDate)
    .gte('end_date', startDate)

  if (excludeCampaignId) {
    query = query.neq('campaign_id', excludeCampaignId)
  }

  const { data: existingExclusivities, error } = await query

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Find conflicts
  const conflicts = []
  if (existingExclusivities) {
    for (const existing of existingExclusivities) {
      const overlappingCategories = categories.filter(cat =>
        existing.categories.some((existingCat: string) =>
          existingCat.toLowerCase() === cat
        )
      )

      if (overlappingCategories.length > 0) {
        // Calculate exact overlap period
        const overlapStart = startDate > existing.start_date ? startDate : existing.start_date
        const overlapEnd = endDate < existing.end_date ? endDate : existing.end_date

        conflicts.push({
          exclusivity_id: existing.id,
          campaign_id: existing.campaign?.id,
          campaign_name: existing.campaign?.name,
          customer_name: existing.campaign?.customer?.name,
          categories: existing.categories,
          overlapping_categories: overlappingCategories,
          exclusivity_start: existing.start_date,
          exclusivity_end: existing.end_date,
          overlap_start: overlapStart,
          overlap_end: overlapEnd,
          overlap_days: Math.ceil(
            (new Date(overlapEnd).getTime() - new Date(overlapStart).getTime()) / (1000 * 60 * 60 * 24)
          ) + 1
        })
      }
    }
  }

  return NextResponse.json({
    has_conflicts: conflicts.length > 0,
    conflicts,
    checked: {
      categories,
      start_date: startDate,
      end_date: endDate
    }
  })
}
