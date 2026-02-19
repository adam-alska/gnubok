import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { apiLimiter, rateLimitResponse } from '@/lib/rate-limit'

/**
 * POST /api/asset-categories/seed
 * Seeds the default Swedish asset categories for the authenticated user.
 * Idempotent: does nothing if categories already exist.
 */
export async function POST() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { success, remaining, reset } = apiLimiter.check(user.id)
  if (!success) return rateLimitResponse(reset)

  // Check if user already has categories
  const { count } = await supabase
    .from('asset_categories')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', user.id)

  if (count && count > 0) {
    return NextResponse.json({ data: { seeded: false, message: 'Kategorier finns redan' } })
  }

  const defaultCategories = [
    {
      user_id: user.id,
      code: 'BYGGNADER',
      name: 'Byggnader',
      asset_account: '1110',
      depreciation_account: '1119',
      expense_account: '7820',
      default_useful_life_months: 600,
      default_depreciation_method: 'straight_line',
      is_system: true,
    },
    {
      user_id: user.id,
      code: 'MASKINER',
      name: 'Maskiner och tekniska anläggningar',
      asset_account: '1210',
      depreciation_account: '1219',
      expense_account: '7831',
      default_useful_life_months: 60,
      default_depreciation_method: 'straight_line',
      is_system: true,
    },
    {
      user_id: user.id,
      code: 'INVENTARIER',
      name: 'Inventarier',
      asset_account: '1220',
      depreciation_account: '1229',
      expense_account: '7832',
      default_useful_life_months: 60,
      default_depreciation_method: 'straight_line',
      is_system: true,
    },
    {
      user_id: user.id,
      code: 'FORDON',
      name: 'Fordon',
      asset_account: '1240',
      depreciation_account: '1249',
      expense_account: '7834',
      default_useful_life_months: 60,
      default_depreciation_method: 'straight_line',
      is_system: true,
    },
    {
      user_id: user.id,
      code: 'DATORER',
      name: 'Datorer och IT-utrustning',
      asset_account: '1250',
      depreciation_account: '1259',
      expense_account: '7833',
      default_useful_life_months: 36,
      default_depreciation_method: 'straight_line',
      is_system: true,
    },
    {
      user_id: user.id,
      code: 'IMMATERIELLA',
      name: 'Immateriella tillgångar',
      asset_account: '1010',
      depreciation_account: '1019',
      expense_account: '7810',
      default_useful_life_months: 60,
      default_depreciation_method: 'straight_line',
      is_system: true,
    },
  ]

  const { error } = await supabase
    .from('asset_categories')
    .insert(defaultCategories)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ data: { seeded: true, count: defaultCategories.length } })
}
