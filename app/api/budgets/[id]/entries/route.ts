import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { validateBody, CreateBudgetEntryInputSchema, BulkUpdateBudgetEntriesSchema } from '@/lib/validation'
import { apiLimiter, rateLimitResponse } from '@/lib/rate-limit'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  const { id: budgetId } = await params

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { success, reset } = apiLimiter.check(user.id)
  if (!success) return rateLimitResponse(reset)

  // Verify budget ownership
  const { data: budget, error: budgetError } = await supabase
    .from('budgets')
    .select('id')
    .eq('id', budgetId)
    .eq('user_id', user.id)
    .single()

  if (budgetError || !budget) {
    return NextResponse.json({ error: 'Budget hittades inte' }, { status: 404 })
  }

  const { searchParams } = new URL(request.url)
  const costCenterId = searchParams.get('cost_center_id')
  const projectId = searchParams.get('project_id')

  let query = supabase
    .from('budget_entries')
    .select(`
      *,
      cost_center:cost_centers(id, code, name),
      project:projects(id, project_number, name)
    `)
    .eq('budget_id', budgetId)
    .order('account_number')

  if (costCenterId) {
    query = query.eq('cost_center_id', costCenterId)
  }

  if (projectId) {
    query = query.eq('project_id', projectId)
  }

  const { data: entries, error } = await query

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Fetch account names
  const accountNumbers = [...new Set((entries || []).map(e => e.account_number))]
  let accountMap: Record<string, { name: string; class: number }> = {}

  if (accountNumbers.length > 0) {
    const { data: accounts } = await supabase
      .from('chart_of_accounts')
      .select('account_number, account_name, account_class')
      .in('account_number', accountNumbers)

    accountMap = (accounts || []).reduce((acc: Record<string, { name: string; class: number }>, a) => {
      acc[a.account_number] = { name: a.account_name, class: a.account_class }
      return acc
    }, {})
  }

  const enrichedEntries = (entries || []).map(entry => ({
    ...entry,
    account_name: accountMap[entry.account_number]?.name || entry.account_number,
    account_class: accountMap[entry.account_number]?.class || parseInt(entry.account_number[0]) || 0,
  }))

  return NextResponse.json({ data: enrichedEntries })
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  const { id: budgetId } = await params

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { success: rl, reset } = apiLimiter.check(user.id)
  if (!rl) return rateLimitResponse(reset)

  // Verify budget ownership and not locked
  const { data: budget, error: budgetError } = await supabase
    .from('budgets')
    .select('id, status')
    .eq('id', budgetId)
    .eq('user_id', user.id)
    .single()

  if (budgetError || !budget) {
    return NextResponse.json({ error: 'Budget hittades inte' }, { status: 404 })
  }

  if (budget.status === 'locked') {
    return NextResponse.json({ error: 'Budgeten är låst' }, { status: 403 })
  }

  const raw = await request.json()
  const validation = validateBody(CreateBudgetEntryInputSchema, raw)
  if (!validation.success) return validation.response
  const body = validation.data

  const annualTotal = (body.month_1 || 0) + (body.month_2 || 0) + (body.month_3 || 0) +
    (body.month_4 || 0) + (body.month_5 || 0) + (body.month_6 || 0) +
    (body.month_7 || 0) + (body.month_8 || 0) + (body.month_9 || 0) +
    (body.month_10 || 0) + (body.month_11 || 0) + (body.month_12 || 0)

  const { data, error } = await supabase
    .from('budget_entries')
    .insert({
      budget_id: budgetId,
      account_number: body.account_number,
      cost_center_id: body.cost_center_id || null,
      project_id: body.project_id || null,
      month_1: body.month_1 || 0,
      month_2: body.month_2 || 0,
      month_3: body.month_3 || 0,
      month_4: body.month_4 || 0,
      month_5: body.month_5 || 0,
      month_6: body.month_6 || 0,
      month_7: body.month_7 || 0,
      month_8: body.month_8 || 0,
      month_9: body.month_9 || 0,
      month_10: body.month_10 || 0,
      month_11: body.month_11 || 0,
      month_12: body.month_12 || 0,
      annual_total: body.annual_total || annualTotal,
      notes: body.notes,
    })
    .select()
    .single()

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json({ error: 'Budgetpost för detta konto/kostnadsställe/projekt finns redan' }, { status: 409 })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ data })
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  const { id: budgetId } = await params

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { success: rl, reset } = apiLimiter.check(user.id)
  if (!rl) return rateLimitResponse(reset)

  // Verify budget ownership and not locked
  const { data: budget, error: budgetError } = await supabase
    .from('budgets')
    .select('id, status')
    .eq('id', budgetId)
    .eq('user_id', user.id)
    .single()

  if (budgetError || !budget) {
    return NextResponse.json({ error: 'Budget hittades inte' }, { status: 404 })
  }

  if (budget.status === 'locked') {
    return NextResponse.json({ error: 'Budgeten är låst' }, { status: 403 })
  }

  const raw = await request.json()
  const validation = validateBody(BulkUpdateBudgetEntriesSchema, raw)
  if (!validation.success) return validation.response
  const body = validation.data

  const results: Array<{ id: string; success: boolean; error?: string }> = []

  for (const entry of body.entries) {
    const updateData: Record<string, unknown> = {}

    const monthKeys = [
      'month_1', 'month_2', 'month_3', 'month_4',
      'month_5', 'month_6', 'month_7', 'month_8',
      'month_9', 'month_10', 'month_11', 'month_12',
    ] as const

    let hasMonthUpdate = false
    for (const key of monthKeys) {
      if (entry[key] !== undefined) {
        updateData[key] = entry[key]
        hasMonthUpdate = true
      }
    }

    if (entry.notes !== undefined) updateData.notes = entry.notes

    // Recalculate annual total if months were updated
    if (hasMonthUpdate) {
      // Need to fetch current values to calculate the total
      const { data: current } = await supabase
        .from('budget_entries')
        .select('*')
        .eq('id', entry.id)
        .eq('budget_id', budgetId)
        .single()

      if (current) {
        const merged = { ...current, ...updateData }
        updateData.annual_total =
          (Number(merged.month_1) || 0) + (Number(merged.month_2) || 0) +
          (Number(merged.month_3) || 0) + (Number(merged.month_4) || 0) +
          (Number(merged.month_5) || 0) + (Number(merged.month_6) || 0) +
          (Number(merged.month_7) || 0) + (Number(merged.month_8) || 0) +
          (Number(merged.month_9) || 0) + (Number(merged.month_10) || 0) +
          (Number(merged.month_11) || 0) + (Number(merged.month_12) || 0)
      }
    }

    if (entry.annual_total !== undefined && !hasMonthUpdate) {
      updateData.annual_total = entry.annual_total
    }

    const { error } = await supabase
      .from('budget_entries')
      .update(updateData)
      .eq('id', entry.id)
      .eq('budget_id', budgetId)

    if (error) {
      results.push({ id: entry.id, success: false, error: error.message })
    } else {
      results.push({ id: entry.id, success: true })
    }
  }

  const hasErrors = results.some(r => !r.success)
  return NextResponse.json(
    { data: results },
    { status: hasErrors ? 207 : 200 }
  )
}
