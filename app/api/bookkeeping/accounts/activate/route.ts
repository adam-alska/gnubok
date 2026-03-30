import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { getBASReference } from '@/lib/bookkeeping/bas-reference'
import { requireCompanyId } from '@/lib/company/context'

/**
 * POST /api/bookkeeping/accounts/activate
 *
 * Batch-activate BAS accounts for a user.
 * Accepts { account_numbers: string[] } and creates chart_of_accounts rows from reference data.
 * Skips any accounts that already exist for the user.
 */
export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const companyId = await requireCompanyId(supabase, user.id)

  const body = await request.json()
  const accountNumbers: string[] = body.account_numbers

  if (!Array.isArray(accountNumbers) || accountNumbers.length === 0) {
    return NextResponse.json({ error: 'account_numbers array required' }, { status: 400 })
  }

  // Check which accounts already exist
  const { data: existing } = await supabase
    .from('chart_of_accounts')
    .select('account_number')
    .eq('company_id', companyId)
    .in('account_number', accountNumbers)

  const existingNumbers = new Set((existing || []).map((a) => a.account_number))

  // Build rows for accounts that don't already exist
  const newAccounts = accountNumbers
    .filter((num) => !existingNumbers.has(num))
    .map((num) => {
      const ref = getBASReference(num)
      if (!ref) return null

      return {
        user_id: user.id,
        company_id: companyId,
        account_number: ref.account_number,
        account_name: ref.account_name,
        account_class: ref.account_class,
        account_group: ref.account_group,
        account_type: ref.account_type,
        normal_balance: ref.normal_balance,
        plan_type: 'full_bas' as const,
        is_active: true,
        is_system_account: false,
        description: ref.description,
        sru_code: ref.sru_code,
        sort_order: parseInt(ref.account_number),
      }
    })
    .filter(Boolean)

  if (newAccounts.length === 0) {
    return NextResponse.json({
      data: [],
      message: 'All accounts already activated',
      activated: 0,
      skipped: accountNumbers.length,
    })
  }

  const { data, error } = await supabase
    .from('chart_of_accounts')
    .insert(newAccounts)
    .select()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({
    data,
    activated: data?.length || 0,
    skipped: accountNumbers.length - (data?.length || 0),
  })
}
