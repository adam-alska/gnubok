import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import {
  AI_EXTENSIONS,
  hasAiConsent,
  grantAiConsent,
  revokeAiConsent,
  isAiExtension,
} from '@/lib/extensions/ai-consent'
import { requireCompanyId } from '@/lib/company/context'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const companyId = await requireCompanyId(supabase, user.id)

  const statuses: Record<string, boolean> = {}
  for (const ext of AI_EXTENSIONS) {
    statuses[ext] = await hasAiConsent(supabase, companyId, ext)
  }

  return NextResponse.json({ data: statuses })
}

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const companyId = await requireCompanyId(supabase, user.id)

  const body = await request.json()
  const { extension_id } = body

  if (!extension_id || !isAiExtension(extension_id)) {
    return NextResponse.json(
      { error: 'Invalid or non-AI extension_id' },
      { status: 400 }
    )
  }

  await grantAiConsent(supabase, user.id, companyId, extension_id)
  return NextResponse.json({ data: { consented: true } })
}

export async function DELETE(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const companyId = await requireCompanyId(supabase, user.id)

  const body = await request.json()
  const { extension_id } = body

  if (!extension_id || !isAiExtension(extension_id)) {
    return NextResponse.json(
      { error: 'Invalid or non-AI extension_id' },
      { status: 400 }
    )
  }

  await revokeAiConsent(supabase, user.id, companyId, extension_id)
  return NextResponse.json({ data: { consented: false } })
}
