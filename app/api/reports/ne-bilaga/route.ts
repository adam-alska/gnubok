import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { generateNEDeclaration } from '@/lib/reports/ne-bilaga/ne-engine'
import {
  generateSRUFile,
  sruFileToString,
  getSRUFilename,
} from '@/lib/reports/sru-export/sru-generator'

/**
 * GET /api/reports/ne-bilaga
 *
 * Generate NE declaration (NE-bilaga) for enskild firma.
 *
 * Query parameters:
 * - period_id: Fiscal period ID (required)
 * - format: 'json' (default) or 'sru' for SRU file download
 *
 * Returns:
 * - JSON: NE declaration with rutor R1-R11 and breakdown
 * - SRU: Downloadable SRU file for Skatteverket submission
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
    const declaration = await generateNEDeclaration(supabase, user.id, periodId)

    if (format === 'sru') {
      // Generate and return SRU file
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

    // Default: return JSON
    return NextResponse.json({ data: declaration })
  } catch (err) {
    console.error('Error generating NE declaration:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to generate NE declaration' },
      { status: 500 }
    )
  }
}
