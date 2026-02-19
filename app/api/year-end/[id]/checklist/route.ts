import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { apiLimiter, rateLimitResponse } from '@/lib/rate-limit'
import type { YearEndChecklist, YearEndChecklistItem } from '@/types/year-end'

/**
 * PATCH /api/year-end/[id]/checklist
 * Toggle a checklist item
 * Body: { key: string, isCompleted: boolean }
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { success, reset } = apiLimiter.check(user.id)
  if (!success) return rateLimitResponse(reset)

  const body = await request.json()
  const { key, isCompleted } = body

  if (!key || typeof isCompleted !== 'boolean') {
    return NextResponse.json(
      { error: 'key och isCompleted kravs' },
      { status: 400 }
    )
  }

  // Fetch current closing
  const { data: closing, error: fetchError } = await supabase
    .from('year_end_closings')
    .select('checklist_data, status')
    .eq('id', id)
    .eq('user_id', user.id)
    .single()

  if (fetchError || !closing) {
    return NextResponse.json({ error: 'Bokslut hittades inte' }, { status: 404 })
  }

  if (closing.status === 'completed') {
    return NextResponse.json({ error: 'Bokslutet är redan genomfört' }, { status: 400 })
  }

  // Update checklist item
  const checklist = closing.checklist_data as YearEndChecklist
  const itemIndex = checklist.items.findIndex((item: YearEndChecklistItem) => item.key === key)

  if (itemIndex === -1) {
    return NextResponse.json({ error: 'Checklistepunkt hittades inte' }, { status: 404 })
  }

  checklist.items[itemIndex].isCompleted = isCompleted
  checklist.items[itemIndex].completedAt = isCompleted
    ? new Date().toISOString()
    : undefined

  // Recalculate counts
  checklist.completedCount = checklist.items.filter(
    (item: YearEndChecklistItem) => item.isCompleted
  ).length
  checklist.totalCount = checklist.items.length

  // Save
  const { data: updated, error: updateError } = await supabase
    .from('year_end_closings')
    .update({ checklist_data: checklist })
    .eq('id', id)
    .select('checklist_data')
    .single()

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 })
  }

  return NextResponse.json({ data: updated.checklist_data })
}
