import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { parseBankFile, generateFileHash, detectFileFormat } from '@/lib/import/bank-file/parser'
import { decodeFileContent } from '@/lib/import/bank-file/encoding'
import type { BankFileFormatId } from '@/lib/import/bank-file/types'

/**
 * POST /api/import/bank-file/parse
 *
 * Accepts a bank file (CSV/XML) via FormData, auto-detects format,
 * returns parsed transactions preview with duplicate detection.
 */
export async function POST(request: Request) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const formData = await request.formData()
  const file = formData.get('file') as File | null
  const formatOverride = formData.get('format') as BankFileFormatId | null

  if (!file) {
    return NextResponse.json({ error: 'No file provided' }, { status: 400 })
  }

  // Validate file size (10MB max)
  if (file.size > 10 * 1024 * 1024) {
    return NextResponse.json({ error: 'File too large (max 10MB)' }, { status: 400 })
  }

  try {
    // Read and decode file content
    const arrayBuffer = await file.arrayBuffer()
    const content = decodeFileContent(arrayBuffer)
    const fileHash = generateFileHash(content)

    // Check if this exact file has been imported before
    const { data: existingImport } = await supabase
      .from('bank_file_imports')
      .select('id, status, imported_count, created_at')
      .eq('user_id', user.id)
      .eq('file_hash', fileHash)
      .single()

    if (existingImport && existingImport.status === 'completed') {
      return NextResponse.json({
        error: 'duplicate',
        message: `Den här filen har redan importerats (${existingImport.imported_count} transaktioner, ${new Date(existingImport.created_at).toLocaleDateString('sv-SE')})`,
      }, { status: 409 })
    }

    // Auto-detect or use specified format
    const detectedFormat = formatOverride
      ? null
      : detectFileFormat(content, file.name)

    // Parse the file
    const parseResult = parseBankFile(content, file.name, formatOverride || undefined)

    // Check for existing transactions (duplicate detection for preview)
    let existingCount = 0
    if (parseResult.transactions.length > 0) {
      // Sample check: look for transactions with matching dates and amounts
      const { count } = await supabase
        .from('transactions')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .gte('date', parseResult.date_from || '1970-01-01')
        .lte('date', parseResult.date_to || '2099-12-31')

      existingCount = count || 0
    }

    return NextResponse.json({
      data: {
        parse_result: parseResult,
        detected_format: detectedFormat?.id || formatOverride || null,
        detected_format_name: detectedFormat?.name || parseResult.format_name,
        file_hash: fileHash,
        filename: file.name,
        existing_transaction_count: existingCount,
        // Return first row headers for generic CSV column mapping
        headers: parseResult.format === 'generic_csv'
          ? content.split('\n')[0]?.split(',').map(h => h.trim()) || []
          : null,
      },
    })
  } catch (error) {
    console.error('Bank file parse error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to parse file' },
      { status: 500 }
    )
  }
}
