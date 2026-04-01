import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { validateBody } from '@/lib/api/validate'
import { validatePeriodDuration } from '@/lib/bookkeeping/validate-period-duration'
import { requireCompanyId } from '@/lib/company/context'
import { z } from 'zod'

const UpdateFiscalPeriodSchema = z.object({
  name: z.string().min(1).optional(),
  period_start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Startdatum måste vara i format ÅÅÅÅ-MM-DD').optional(),
  period_end: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Slutdatum måste vara i format ÅÅÅÅ-MM-DD').optional(),
})

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

  const companyId = await requireCompanyId(supabase, user.id)

  const validation = await validateBody(request, UpdateFiscalPeriodSchema)
  if (!validation.success) return validation.response
  const body = validation.data

  // Fetch the period
  const { data: period, error: fetchError } = await supabase
    .from('fiscal_periods')
    .select('*')
    .eq('id', id)
    .eq('company_id', companyId)
    .single()

  if (fetchError || !period) {
    return NextResponse.json({ error: 'Räkenskapsår hittades inte' }, { status: 404 })
  }

  // Cannot edit locked or closed periods
  if (period.locked_at) {
    return NextResponse.json({ error: 'Kan inte ändra ett låst räkenskapsår' }, { status: 400 })
  }
  if (period.is_closed) {
    return NextResponse.json({ error: 'Kan inte ändra ett stängt räkenskapsår' }, { status: 400 })
  }

  // If dates are being changed, check for existing journal entries
  if (body.period_start || body.period_end) {
    const { count: entryCount } = await supabase
      .from('journal_entries')
      .select('id', { count: 'exact', head: true })
      .eq('company_id', companyId)
      .eq('fiscal_period_id', id)
      .in('status', ['posted', 'reversed'])

    if (entryCount && entryCount > 0) {
      return NextResponse.json(
        { error: `Kan inte ändra datum: ${entryCount} bokförda verifikationer finns i perioden. Ta bort eller flytta dem först.` },
        { status: 400 }
      )
    }

    const newStart = body.period_start || period.period_start
    const newEnd = body.period_end || period.period_end

    // Validate period duration (max 18 months per BFL 3 kap.)
    const durationError = validatePeriodDuration(newStart, newEnd)
    if (durationError) {
      return NextResponse.json({ error: durationError }, { status: 400 })
    }

    // Check for overlapping periods (excluding this one)
    const { data: overlapping } = await supabase
      .from('fiscal_periods')
      .select('id, name')
      .eq('company_id', companyId)
      .neq('id', id)
      .lte('period_start', newEnd)
      .gte('period_end', newStart)
      .limit(1)

    if (overlapping && overlapping.length > 0) {
      return NextResponse.json(
        { error: `Överlappar med befintligt räkenskapsår: ${overlapping[0].name}` },
        { status: 409 }
      )
    }
  }

  // Build update object
  const updates: Record<string, unknown> = {}
  if (body.name) updates.name = body.name
  if (body.period_start) updates.period_start = body.period_start
  if (body.period_end) updates.period_end = body.period_end

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ data: period })
  }

  const { data: updated, error: updateError } = await supabase
    .from('fiscal_periods')
    .update(updates)
    .eq('id', id)
    .eq('company_id', companyId)
    .select()
    .single()

  if (updateError) {
    // Database CHECK constraints will catch invalid month boundaries
    const msg = updateError.message
    if (msg.includes('period_start') || msg.includes('period_end')) {
      return NextResponse.json(
        { error: 'Perioden måste börja den 1:a i en månad och sluta sista dagen i en månad' },
        { status: 400 }
      )
    }
    return NextResponse.json({ error: msg }, { status: 500 })
  }

  return NextResponse.json({ data: updated })
}
