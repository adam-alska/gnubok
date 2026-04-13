import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { requireCompanyId } from '@/lib/company/context'
import { requireWritePermission } from '@/lib/auth/require-write'
import { z } from 'zod'
import { validateBody } from '@/lib/api/validate'

const BookingTemplateLineSchema = z.object({
  account: z.string().regex(/^\d{4}$/),
  label: z.string().min(1),
  side: z.enum(['debit', 'credit']),
  type: z.enum(['business', 'vat', 'settlement']),
  ratio: z.number().min(0).max(10).optional(),
  vat_rate: z.number().min(0).max(1).optional(),
})

const CreateBookingTemplateSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(2000).default(''),
  category: z.enum([
    'eu_trade', 'tax_account', 'private_transfer',
    'salary', 'representation', 'year_end',
    'vat', 'financial', 'other',
  ]).default('other'),
  entity_type: z.enum(['all', 'enskild_firma', 'aktiebolag']).default('all'),
  lines: z.array(BookingTemplateLineSchema).min(2),
  team_id: z.string().uuid().optional(),
})

/**
 * GET /api/settings/booking-templates
 * Returns all templates visible to the current user:
 * system + company + team templates.
 */
export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // RLS handles scoping (system OR company OR team)
  const { data, error } = await supabase
    .from('booking_template_library')
    .select('*')
    .eq('is_active', true)
    .order('is_system', { ascending: false })
    .order('category')
    .order('name')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ data })
}

/**
 * POST /api/settings/booking-templates
 * Create a company-scoped or team-scoped template.
 */
export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const writeCheck = await requireWritePermission(supabase, user.id)
  if (!writeCheck.ok) return writeCheck.response

  const result = await validateBody(request, CreateBookingTemplateSchema)
  if (!result.success) return result.response

  const body = result.data
  const companyId = body.team_id ? null : await requireCompanyId(supabase, user.id)

  const { data, error } = await supabase
    .from('booking_template_library')
    .insert({
      company_id: companyId,
      team_id: body.team_id ?? null,
      created_by: user.id,
      name: body.name,
      description: body.description,
      category: body.category,
      entity_type: body.entity_type,
      lines: body.lines,
      is_system: false,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ data }, { status: 201 })
}

/**
 * DELETE /api/settings/booking-templates
 * Soft-delete a template by id (company or team scope only, never system).
 */
export async function DELETE(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const writeCheck = await requireWritePermission(supabase, user.id)
  if (!writeCheck.ok) return writeCheck.response

  let id: string | undefined
  try {
    const body = await request.json()
    id = body?.id
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

  // RLS prevents deleting system templates (btl_delete policy checks NOT is_system)
  const { error } = await supabase
    .from('booking_template_library')
    .update({ is_active: false })
    .eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ data: { success: true } })
}
