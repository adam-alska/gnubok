import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { generateINK2Declaration } from '@/lib/reports/ink2/ink2-engine'
import {
  generateSRUSubmission,
  getZipFilename,
} from '@/lib/reports/ink2/sru-generator'
import { requireCompanyId } from '@/lib/company/context'
import JSZip from 'jszip'

/**
 * GET /api/reports/ink2
 *
 * Generate INK2 declaration for aktiebolag.
 *
 * Query parameters:
 * - period_id: Fiscal period ID (required)
 * - format: 'json' (default) or 'sru' for SRU file download (ZIP with INFO.SRU + BLANKETTER.SRU)
 */
export async function GET(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const companyId = await requireCompanyId(supabase, user.id)

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
    const declaration = await generateINK2Declaration(supabase, companyId, periodId)

    if (format === 'sru') {
      const submission = generateSRUSubmission(declaration)

      // Encode both files as ISO 8859-1 (Latin-1) — required by Skatteverket
      const infoBytes = encodeISO88591(submission.infoSru)
      const blanketterBytes = encodeISO88591(submission.blanketterSru)

      // Create ZIP with both files
      const zip = new JSZip()
      zip.file('INFO.SRU', infoBytes)
      zip.file('BLANKETTER.SRU', blanketterBytes)

      const zipArrayBuffer = await zip.generateAsync({ type: 'arraybuffer' })
      const filename = getZipFilename(declaration)

      return new NextResponse(zipArrayBuffer, {
        status: 200,
        headers: {
          'Content-Type': 'application/zip',
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

/**
 * Encode a string as ISO 8859-1 (Latin-1) bytes.
 * Characters outside the Latin-1 range are replaced with '?'.
 */
function encodeISO88591(str: string): Uint8Array {
  const bytes = new Uint8Array(str.length)
  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i)
    bytes[i] = code <= 0xFF ? code : 0x3F // '?' for unmappable chars
  }
  return bytes
}
