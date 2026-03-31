import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { generateApiKey, hashApiKey, DEFAULT_SCOPES, validateScopes } from '@/lib/auth/api-keys'
import { requireCompanyId } from '@/lib/company/context'
import type { ApiKeyScope } from '@/lib/auth/api-keys'

/**
 * GET /api/settings/api-keys — List user's API keys (never exposes the key itself)
 */
export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const companyId = await requireCompanyId(supabase, user.id)

  const { data, error } = await supabase
    .from('api_keys')
    .select('id, key_prefix, name, scopes, rate_limit_rpm, last_used_at, revoked_at, created_at')
    .eq('company_id', companyId)
    .order('created_at', { ascending: false })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ data })
}

/**
 * POST /api/settings/api-keys — Create a new API key
 * Returns the full key ONCE. After this, only the prefix is available.
 */
export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const companyId = await requireCompanyId(supabase, user.id)

  let name = 'Unnamed key'
  let scopes: ApiKeyScope[] = DEFAULT_SCOPES
  try {
    const body = await request.json()
    if (body.name && typeof body.name === 'string') {
      name = body.name.slice(0, 100)
    }
    const parsed = validateScopes(body.scopes)
    if (parsed) {
      scopes = parsed
    }
  } catch {
    // Empty body is fine, use defaults
  }

  // Limit to 10 active keys per company
  const { count } = await supabase
    .from('api_keys')
    .select('id', { count: 'exact', head: true })
    .eq('company_id', companyId)
    .is('revoked_at', null)

  if (count !== null && count >= 10) {
    return NextResponse.json(
      { error: 'Maximum 10 active API keys allowed' },
      { status: 400 }
    )
  }

  const { key, hash, prefix } = generateApiKey()

  const { data, error } = await supabase
    .from('api_keys')
    .insert({
      user_id: user.id,
      company_id: companyId,
      key_hash: hash,
      key_prefix: prefix,
      name,
      scopes,
    })
    .select('id, key_prefix, name, scopes, created_at')
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Return the full key exactly once
  return NextResponse.json({
    data: {
      ...data,
      key, // Only time the full key is returned
    },
  })
}
