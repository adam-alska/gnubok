import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { ensureInitialized } from '@/lib/init'
import { verifyIntegrity } from '@/lib/core/documents/document-service'

ensureInitialized()

/**
 * POST /api/documents/:id/verify
 * Verify document integrity by re-computing SHA-256 and comparing
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params

  try {
    const result = await verifyIntegrity(supabase, user.id, id)

    return NextResponse.json({ data: result })
  } catch (error) {
    console.error('[documents/verify/POST] Verification failed:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Verification failed' },
      { status: 500 }
    )
  }
}
