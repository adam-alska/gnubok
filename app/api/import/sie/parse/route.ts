import { createClient } from '@/lib/supabase/server'
import { fetchAllRows } from '@/lib/supabase/fetch-all'
import { NextResponse } from 'next/server'
import {
  parseSIEFile,
  validateSIEFile,
  detectEncoding,
  decodeBuffer,
  calculateFileHash,
} from '@/lib/import/sie-parser'
import { suggestMappings, getMappingStats } from '@/lib/import/account-mapper'
import { generateImportPreview, checkDuplicateImport } from '@/lib/import/sie-import'
import type { SIEAccountMappingRecord, SIEAccount } from '@/lib/import/types'

/**
 * POST /api/import/sie/parse
 * Parse an uploaded SIE file and return preview data
 */
export async function POST(request: Request) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    // Get form data with file
    const formData = await request.formData()
    const file = formData.get('file') as File | null

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }

    // Validate file type
    const filename = file.name.toLowerCase()
    if (!filename.endsWith('.sie') && !filename.endsWith('.se')) {
      return NextResponse.json(
        { error: 'Invalid file type. Please upload a .sie file' },
        { status: 400 }
      )
    }

    // Read file as ArrayBuffer for encoding detection
    const arrayBuffer = await file.arrayBuffer()
    const encoding = detectEncoding(arrayBuffer)

    // Decode to string
    const content = decodeBuffer(arrayBuffer, encoding)

    // Check for duplicate import
    const duplicate = await checkDuplicateImport(user.id, content)
    if (duplicate) {
      return NextResponse.json({
        error: 'duplicate',
        message: `This file has already been imported on ${new Date(duplicate.imported_at!).toLocaleDateString('sv-SE')}`,
        importId: duplicate.id,
      }, { status: 409 })
    }

    // Parse the SIE file
    const parsed = parseSIEFile(content)

    // Validate the parsed data
    const validation = validateSIEFile(parsed)

    // If there are critical errors, return them
    if (!validation.valid) {
      return NextResponse.json({
        error: 'validation',
        message: 'SIE file has validation errors',
        errors: validation.errors,
        warnings: validation.warnings,
      }, { status: 400 })
    }

    // Fetch user's full chart of accounts (paginated to avoid 1000-row limit)
    const basAccounts = await fetchAllRows(({ from, to }) =>
      supabase
        .from('chart_of_accounts')
        .select('*')
        .eq('user_id', user.id)
        .eq('is_active', true)
        .order('account_number')
        .range(from, to)
    )

    if (basAccounts.length === 0) {
      return NextResponse.json({
        error: 'No chart of accounts found. Please complete onboarding first.',
      }, { status: 400 })
    }

    // Fetch stored mappings from database
    const { data: storedMappings } = await supabase
      .from('sie_account_mappings')
      .select('*')
      .eq('user_id', user.id)

    // Suggest account mappings
    const mappings = suggestMappings(
      parsed.accounts,
      basAccounts,
      (storedMappings as SIEAccountMappingRecord[]) || undefined
    )

    // Generate preview
    const preview = generateImportPreview(parsed, mappings)

    // Calculate file hash for storage
    const fileHash = await calculateFileHash(content)

    return NextResponse.json({
      success: true,
      encoding,
      fileHash,
      parsed: {
        header: parsed.header,
        accounts: parsed.accounts,
        stats: parsed.stats,
        issues: parsed.issues,
      },
      mappings,
      mappingStats: getMappingStats(mappings),
      preview,
      validation: {
        valid: validation.valid,
        errors: validation.errors,
        warnings: validation.warnings,
      },
    })
  } catch (error) {
    console.error('SIE parse error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to parse SIE file' },
      { status: 500 }
    )
  }
}
