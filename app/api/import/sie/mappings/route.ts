import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { saveMappings } from '@/lib/import/sie-import'
import type { AccountMapping } from '@/lib/import/types'
import { apiLimiter, rateLimitResponse } from '@/lib/rate-limit'
import { validateBody, SaveMappingsInputSchema, UpdateMappingInputSchema } from '@/lib/validation'

/**
 * GET /api/import/sie/mappings
 * Get all saved account mappings for the user
 */
export async function GET() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { success, remaining, reset } = apiLimiter.check(user.id)
  if (!success) return rateLimitResponse(reset)

  const { data, error } = await supabase
    .from('sie_account_mappings')
    .select('*')
    .eq('user_id', user.id)
    .order('source_account')

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ data })
}

/**
 * POST /api/import/sie/mappings
 * Save account mappings (bulk upsert)
 */
export async function POST(request: Request) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { success: postRl, remaining: postRem, reset: postReset } = apiLimiter.check(user.id)
  if (!postRl) return rateLimitResponse(postReset)

  const raw = await request.json()
  const validation = validateBody(SaveMappingsInputSchema, raw)
  if (!validation.success) return validation.response
  const mappings = validation.data.mappings as unknown as AccountMapping[]

  try {
    await saveMappings(user.id, mappings)
    return NextResponse.json({ success: true })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to save mappings' },
      { status: 500 }
    )
  }
}

/**
 * PUT /api/import/sie/mappings
 * Update a single mapping
 */
export async function PUT(request: Request) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { success: putRl, remaining: putRem, reset: putReset } = apiLimiter.check(user.id)
  if (!putRl) return rateLimitResponse(putReset)

  const raw = await request.json()
  const validation = validateBody(UpdateMappingInputSchema, raw)
  if (!validation.success) return validation.response
  const { sourceAccount, targetAccount } = validation.data

  const { data, error } = await supabase
    .from('sie_account_mappings')
    .upsert({
      user_id: user.id,
      source_account: sourceAccount,
      target_account: targetAccount,
      confidence: 1.0,
      match_type: 'manual',
    }, {
      onConflict: 'user_id,source_account',
    })
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ data })
}

/**
 * DELETE /api/import/sie/mappings
 * Delete a specific mapping or all mappings
 */
export async function DELETE(request: Request) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { success: delRl, remaining: delRem, reset: delReset } = apiLimiter.check(user.id)
  if (!delRl) return rateLimitResponse(delReset)

  const { searchParams } = new URL(request.url)
  const sourceAccount = searchParams.get('sourceAccount')

  if (sourceAccount) {
    // Delete specific mapping
    const { error } = await supabase
      .from('sie_account_mappings')
      .delete()
      .eq('user_id', user.id)
      .eq('source_account', sourceAccount)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
  } else {
    // Delete all mappings
    const { error } = await supabase
      .from('sie_account_mappings')
      .delete()
      .eq('user_id', user.id)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
  }

  return NextResponse.json({ success: true })
}
