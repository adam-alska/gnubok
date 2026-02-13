import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

/**
 * POST /api/deadlines/[id]/complete
 * Toggle completion status of a deadline
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  const { id } = await params

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // First, get current deadline state
  const { data: existing, error: fetchError } = await supabase
    .from('deadlines')
    .select('is_completed')
    .eq('id', id)
    .eq('user_id', user.id)
    .single()

  if (fetchError) {
    if (fetchError.code === 'PGRST116') {
      return NextResponse.json({ error: 'Deadline not found' }, { status: 404 })
    }
    return NextResponse.json({ error: fetchError.message }, { status: 500 })
  }

  // Toggle completion
  const newCompletedState = !existing.is_completed
  const { data, error } = await supabase
    .from('deadlines')
    .update({
      is_completed: newCompletedState,
      completed_at: newCompletedState ? new Date().toISOString() : null,
    })
    .eq('id', id)
    .eq('user_id', user.id)
    .select('*, customer:customers(id, name)')
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ data })
}
