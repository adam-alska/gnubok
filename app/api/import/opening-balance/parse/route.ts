import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { parseOpeningBalanceFile } from '@/lib/import/opening-balance/parser'
import type { DetectedColumns } from '@/lib/import/opening-balance/types'

const ALLOWED_EXTENSIONS = ['.xlsx', '.xls', '.csv', '.ods']
const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10MB

/**
 * POST /api/import/opening-balance/parse
 *
 * Accepts an Excel/CSV file via FormData, auto-detects columns,
 * returns parsed opening balance rows with BAS matching.
 */
export async function POST(request: Request) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const formData = await request.formData()
  const file = formData.get('file') as File | null
  const columnOverridesRaw = formData.get('column_overrides') as string | null

  if (!file) {
    return NextResponse.json({ error: 'Ingen fil bifogad' }, { status: 400 })
  }

  // Validate file size
  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json(
      { error: 'Filen är för stor (max 10MB)' },
      { status: 400 },
    )
  }

  // Validate file extension
  const ext = '.' + file.name.split('.').pop()?.toLowerCase()
  if (!ALLOWED_EXTENSIONS.includes(ext)) {
    return NextResponse.json(
      { error: `Filformatet stöds inte. Tillåtna format: ${ALLOWED_EXTENSIONS.join(', ')}` },
      { status: 400 },
    )
  }

  try {
    const buffer = await file.arrayBuffer()

    // Parse optional column overrides
    let columnOverrides: DetectedColumns | undefined
    if (columnOverridesRaw) {
      try {
        columnOverrides = JSON.parse(columnOverridesRaw)
      } catch {
        return NextResponse.json(
          { error: 'Ogiltigt kolumnmappningsformat' },
          { status: 400 },
        )
      }
    }

    const result = parseOpeningBalanceFile(buffer, file.name, columnOverrides)

    return NextResponse.json({ data: result })
  } catch (error) {
    console.error('Opening balance parse error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Kunde inte tolka filen' },
      { status: 500 },
    )
  }
}
