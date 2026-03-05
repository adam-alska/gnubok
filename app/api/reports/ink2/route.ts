import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { generateINK2Declaration } from '@/lib/reports/ink2/ink2-engine'
import {
  generateSRUFile,
  sruFileToString,
  getSRUFilename,
} from '@/lib/reports/ink2/sru-generator'

/**
 * GET /api/reports/ink2
 *
 * Generate INK2 declaration for aktiebolag.
 *
 * Query parameters:
 * - period_id: Fiscal period ID (required)
 * - format: 'json' (default) or 'sru' for SRU file download
 */
export async function GET(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const periodId = searchParams.get('period_id')
  const format = searchParams.get('format') || 'json'

  if (!periodId) {
    return NextResponse.json(
      { error: 'period_id is required' },
      { status: 400 }
    )
  }

  try {
    const declaration = await generateINK2Declaration(supabase, user.id, periodId)

    if (format === 'sru') {
      const sruFile = generateSRUFile(declaration)
      const sruContent = sruFileToString(sruFile)
      const filename = getSRUFilename(declaration)

      return new NextResponse(sruContent, {
        status: 200,
        headers: {
          'Content-Type': 'text/plain; charset=utf-8',
          'Content-Disposition': `attachment; filename="${filename}"`,
        },
      })
    }

    return NextResponse.json({ data: declaration })
  } catch (err) {
    console.error('Error generating INK2 declaration:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to generate INK2 declaration' },
      { status: 500 }
    )
  }
}
