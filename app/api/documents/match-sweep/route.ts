import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { runDocumentMatchingSweep } from '@/lib/documents/batch-match'
import { requireCompanyId } from '@/lib/company/context'
import { requireWritePermission } from '@/lib/auth/require-write'

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const writeCheck = await requireWritePermission(supabase, user.id)
  if (!writeCheck.ok) return writeCheck.response

  const companyId = await requireCompanyId(supabase, user.id)

  // Optional: pass specific inbox item IDs to match
  let inboxItemIds: string[] | undefined
  try {
    const body = await request.json()
    if (Array.isArray(body?.inboxItemIds)) {
      inboxItemIds = body.inboxItemIds
    }
  } catch {
    // No body or invalid JSON — sweep all unmatched items
  }

  try {
    const result = await runDocumentMatchingSweep(supabase, companyId, inboxItemIds)
    return NextResponse.json({ data: result })
  } catch (error) {
    console.error('[match-sweep] Failed:', error)
    return NextResponse.json({ error: 'Match sweep failed' }, { status: 500 })
  }
}
