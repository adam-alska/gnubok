import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { getRecommendedModules, groupRecommendationsByCategory } from '@/lib/onboarding/module-recommender'
import type { BusinessProfile } from '@/types/onboarding'

export async function POST(request: Request) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const { sectorSlug, businessProfile } = body as {
    sectorSlug: string
    businessProfile: BusinessProfile
  }

  if (!sectorSlug) {
    return NextResponse.json(
      { error: 'Missing sectorSlug' },
      { status: 400 }
    )
  }

  const recommendations = getRecommendedModules(sectorSlug, businessProfile || {})
  const grouped = groupRecommendationsByCategory(recommendations)

  return NextResponse.json({
    data: {
      recommendations,
      grouped,
    },
  })
}
