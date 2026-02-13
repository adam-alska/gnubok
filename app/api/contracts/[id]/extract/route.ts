import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { pdfToBase64, getPDFInfo } from '@/lib/contracts/pdf-extractor'
import { analyzeContract } from '@/lib/contracts/contract-analyzer'
import { matchParties } from '@/lib/customers/customer-matcher'
import type { ContractExtractionResult, Customer } from '@/types'

// Rate limiting map (in production, use Redis or similar)
const extractionTimestamps = new Map<string, number[]>()
const RATE_LIMIT = 10 // Max extractions per minute
const RATE_WINDOW_MS = 60 * 1000 // 1 minute

/**
 * POST /api/contracts/[id]/extract
 * Extract and analyze contract content using AI
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  const { id } = await params

  // Authenticate user
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Rate limiting
  const now = Date.now()
  const userTimestamps = extractionTimestamps.get(user.id) || []
  const recentTimestamps = userTimestamps.filter((t) => now - t < RATE_WINDOW_MS)

  if (recentTimestamps.length >= RATE_LIMIT) {
    return NextResponse.json(
      { error: 'Rate limit exceeded. Please try again later.' },
      { status: 429 }
    )
  }

  // Record this extraction attempt
  recentTimestamps.push(now)
  extractionTimestamps.set(user.id, recentTimestamps)

  // Get contract
  const { data: contract, error: fetchError } = await supabase
    .from('contracts')
    .select('*')
    .eq('id', id)
    .eq('user_id', user.id)
    .single()

  if (fetchError) {
    if (fetchError.code === 'PGRST116') {
      return NextResponse.json({ error: 'Contract not found' }, { status: 404 })
    }
    return NextResponse.json({ error: fetchError.message }, { status: 500 })
  }

  // Check if already extracted
  if (contract.extraction_status === 'completed' && contract.extracted_data) {
    // Return cached result
    const customers = await fetchUserCustomers(supabase, user.id)
    const extraction = contract.extracted_data as ContractExtractionResult
    const matches = matchParties(
      extraction.parties.brand,
      extraction.parties.agency,
      customers
    )

    return NextResponse.json({
      data: {
        extraction,
        customerMatches: matches,
        cached: true,
      },
    })
  }

  // Update status to processing
  await supabase
    .from('contracts')
    .update({ extraction_status: 'processing' })
    .eq('id', id)

  try {
    console.log('[Extract] Starting extraction for contract:', id)
    console.log('[Extract] File path:', contract.file_path)

    // Download file from storage
    const { data: fileData, error: downloadError } = await supabase.storage
      .from('contracts')
      .download(contract.file_path)

    if (downloadError) {
      console.error('[Extract] Download error:', downloadError)
      throw new Error(`Failed to download contract: ${downloadError.message}`)
    }

    console.log('[Extract] File downloaded, size:', fileData.size)

    // Check file type
    if (contract.mime_type !== 'application/pdf') {
      throw new Error('Only PDF files are supported for extraction')
    }

    // Convert PDF to base64 for Claude
    console.log('[Extract] Converting PDF to base64...')
    const buffer = Buffer.from(await fileData.arrayBuffer())
    const pdfInfo = getPDFInfo(buffer)

    if (!pdfInfo.isValidSize) {
      throw new Error(`PDF is too large (${pdfInfo.sizeMB.toFixed(1)}MB). Maximum size is 32MB.`)
    }

    const pdfBase64 = pdfToBase64(buffer)
    console.log('[Extract] PDF converted, size:', pdfInfo.sizeMB.toFixed(2), 'MB')

    // Analyze with Claude AI (sending PDF directly)
    console.log('[Extract] Analyzing with Claude AI...')
    const extraction = await analyzeContract(pdfBase64)
    console.log('[Extract] Analysis complete')

    // Get customers for matching
    const customers = await fetchUserCustomers(supabase, user.id)
    const matches = matchParties(
      extraction.parties.brand,
      extraction.parties.agency,
      customers
    )

    // Save extraction result
    await supabase
      .from('contracts')
      .update({
        extracted_data: extraction as unknown as Record<string, unknown>,
        extraction_status: 'completed',
      })
      .eq('id', id)

    return NextResponse.json({
      data: {
        extraction,
        customerMatches: matches,
        cached: false,
      },
    })
  } catch (error) {
    console.error('[Extract] Error:', error)

    // Update status to failed
    await supabase
      .from('contracts')
      .update({
        extraction_status: 'failed',
        extracted_data: {
          error: error instanceof Error ? error.message : 'Unknown error',
        },
      })
      .eq('id', id)

    const message = error instanceof Error ? error.message : 'Extraction failed'
    console.error('[Extract] Returning error:', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

/**
 * GET /api/contracts/[id]/extract
 * Get extraction status and result
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  const { id } = await params

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: contract, error } = await supabase
    .from('contracts')
    .select('extraction_status, extracted_data')
    .eq('id', id)
    .eq('user_id', user.id)
    .single()

  if (error) {
    if (error.code === 'PGRST116') {
      return NextResponse.json({ error: 'Contract not found' }, { status: 404 })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // If completed, also return customer matches
  if (contract.extraction_status === 'completed' && contract.extracted_data) {
    const customers = await fetchUserCustomers(supabase, user.id)
    const extraction = contract.extracted_data as ContractExtractionResult
    const matches = matchParties(
      extraction.parties.brand,
      extraction.parties.agency,
      customers
    )

    return NextResponse.json({
      data: {
        status: contract.extraction_status,
        extraction: contract.extracted_data,
        customerMatches: matches,
      },
    })
  }

  return NextResponse.json({
    data: {
      status: contract.extraction_status,
      extraction: contract.extracted_data,
    },
  })
}

// Helper to fetch user's customers
async function fetchUserCustomers(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string
): Promise<Customer[]> {
  const { data } = await supabase
    .from('customers')
    .select('*')
    .eq('user_id', userId)
    .order('name')

  return data || []
}
