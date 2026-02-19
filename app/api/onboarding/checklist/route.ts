import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data, error } = await supabase
    .from('onboarding_checklist')
    .select('*')
    .eq('user_id', user.id)
    .order('sort_order', { ascending: true })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ data: data || [] })
}

export async function PATCH(request: Request) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const { taskKey, isCompleted } = body as { taskKey: string; isCompleted: boolean }

  if (!taskKey || typeof isCompleted !== 'boolean') {
    return NextResponse.json(
      { error: 'Missing required fields: taskKey, isCompleted' },
      { status: 400 }
    )
  }

  const updateData: Record<string, unknown> = {
    is_completed: isCompleted,
    completed_at: isCompleted ? new Date().toISOString() : null,
  }

  const { data, error } = await supabase
    .from('onboarding_checklist')
    .update(updateData)
    .eq('user_id', user.id)
    .eq('task_key', taskKey)
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ data })
}
