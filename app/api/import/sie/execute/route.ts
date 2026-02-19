import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { parseSIEFile, detectEncoding, decodeBuffer } from '@/lib/import/sie-parser'
import { suggestMappings } from '@/lib/import/account-mapper'
import { executeSIEImport } from '@/lib/import/sie-import'
import type { AccountMapping, SIEAccountMappingRecord } from '@/lib/import/types'
import { uploadLimiter, rateLimitResponse } from '@/lib/rate-limit'

/**
 * POST /api/import/sie/execute
 * Execute the SIE import
 */
export async function POST(request: Request) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { success, remaining, reset } = uploadLimiter.check(user.id)
  if (!success) return rateLimitResponse(reset)

  try {
    // Get form data with file and options
    const formData = await request.formData()
    const file = formData.get('file') as File | null
    const mappingsJson = formData.get('mappings') as string | null
    const optionsJson = formData.get('options') as string | null

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }

    // Parse options
    const options = optionsJson ? JSON.parse(optionsJson) : {
      createFiscalPeriod: true,
      importOpeningBalances: true,
      importTransactions: true,
      voucherSeries: 'B',
    }

    // Read and decode file
    const arrayBuffer = await file.arrayBuffer()
    const encoding = detectEncoding(arrayBuffer)
    const content = decodeBuffer(arrayBuffer, encoding)

    // Parse the SIE file
    const parsed = parseSIEFile(content)

    // Get mappings - either from request or generate new ones
    let mappings: AccountMapping[]

    if (mappingsJson) {
      mappings = JSON.parse(mappingsJson)
    } else {
      // Fetch user's chart of accounts and generate mappings
      const { data: basAccounts } = await supabase
        .from('chart_of_accounts')
        .select('*')
        .eq('user_id', user.id)
        .eq('is_active', true)
        .order('account_number')

      if (!basAccounts || basAccounts.length === 0) {
        return NextResponse.json({
          error: 'No chart of accounts found. Please complete onboarding first.',
        }, { status: 400 })
      }

      // Load stored mappings
      const { data: storedMappings } = await supabase
        .from('sie_account_mappings')
        .select('*')
        .eq('user_id', user.id)

      mappings = suggestMappings(
        parsed.accounts,
        basAccounts,
        (storedMappings as SIEAccountMappingRecord[]) || undefined
      )
    }

    // Validate all accounts are mapped
    const unmapped = mappings.filter((m) => !m.targetAccount)
    if (unmapped.length > 0) {
      return NextResponse.json({
        error: 'validation',
        message: `${unmapped.length} account(s) are not mapped`,
        unmappedAccounts: unmapped.map((m) => ({
          account: m.sourceAccount,
          name: m.sourceName,
        })),
      }, { status: 400 })
    }

    // Execute the import
    const result = await executeSIEImport(
      user.id,
      parsed,
      mappings,
      {
        filename: file.name,
        fileContent: content,
        createFiscalPeriod: options.createFiscalPeriod,
        importOpeningBalances: options.importOpeningBalances,
        importTransactions: options.importTransactions,
        voucherSeries: options.voucherSeries || 'B',
      }
    )

    if (!result.success) {
      return NextResponse.json({
        error: 'import',
        message: 'Import completed with errors',
        result,
      }, { status: 400 })
    }

    return NextResponse.json({
      success: true,
      result,
    })
  } catch (error) {
    console.error('SIE import error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to import SIE file' },
      { status: 500 }
    )
  }
}
