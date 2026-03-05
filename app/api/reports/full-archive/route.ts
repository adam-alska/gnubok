import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { generateFullArchive } from '@/lib/reports/full-archive-export'

export async function GET(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const periodId = searchParams.get('period_id')

  if (!periodId) {
    return NextResponse.json({ error: 'period_id is required' }, { status: 400 })
  }

  try {
    const zipBuffer = await generateFullArchive(supabase, user.id, {
      period_id: periodId,
      include_documents: searchParams.get('include_documents') !== 'false',
    })

    return new NextResponse(zipBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="arkiv_${periodId}.zip"`,
      },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to generate archive'
    const status = message.includes('not found') ? 404 : 500
    return NextResponse.json({ error: message }, { status })
  }
}
