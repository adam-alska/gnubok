import { createClient } from '@/lib/supabase/server'
import { fetchAllRows } from '@/lib/supabase/fetch-all'
import { NextResponse } from 'next/server'
import { parseSIEFile, detectEncoding, decodeBuffer } from '@/lib/import/sie-parser'
import { suggestMappings } from '@/lib/import/account-mapper'
import { executeSIEImport } from '@/lib/import/sie-import'
import { BAS_REFERENCE } from '@/lib/bookkeeping/bas-data'
import { getBASReference } from '@/lib/bookkeeping/bas-reference'
import type { AccountMapping, SIEAccountMappingRecord } from '@/lib/import/types'

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
      // Match against full BAS reference (not just user's active chart)
      const { data: storedMappings } = await supabase
        .from('sie_account_mappings')
        .select('*')
        .eq('user_id', user.id)

      mappings = suggestMappings(
        parsed.accounts,
        BAS_REFERENCE,
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

    // Auto-activate any mapped BAS accounts not yet in the user's chart
    const mappedAccountNumbers = [
      ...new Set(mappings.filter((m) => m.targetAccount).map((m) => m.targetAccount)),
    ]

    const existingAccounts = await fetchAllRows(({ from, to }) =>
      supabase
        .from('chart_of_accounts')
        .select('account_number')
        .eq('user_id', user.id)
        .in('account_number', mappedAccountNumbers)
        .range(from, to)
    )

    // Build a lookup from SIE mappings for account names (used for bas_range accounts)
    const mappingNameLookup = new Map<string, string>()
    for (const m of mappings) {
      if (m.targetAccount) {
        mappingNameLookup.set(m.targetAccount, m.targetName || m.sourceName)
      }
    }

    const existingNumbers = new Set(existingAccounts.map((a) => a.account_number))
    const accountsToActivate = mappedAccountNumbers
      .filter((num) => !existingNumbers.has(num))
      .map((num) => {
        const ref = getBASReference(num)
        if (ref) {
          // Account exists in BAS reference — use full metadata
          return {
            user_id: user.id,
            account_number: ref.account_number,
            account_name: ref.account_name,
            account_class: ref.account_class,
            account_group: ref.account_group,
            account_type: ref.account_type,
            normal_balance: ref.normal_balance,
            plan_type: 'full_bas' as const,
            is_active: true,
            is_system_account: false,
            description: ref.description,
            sru_code: ref.sru_code,
            sort_order: parseInt(ref.account_number),
          }
        }

        // Account not in BAS reference (sub-account like 1241 Personbilar).
        // Derive metadata from the account number.
        const accountClass = parseInt(num.charAt(0), 10)
        const accountGroup = num.substring(0, 2)
        const accountName = mappingNameLookup.get(num) || `Konto ${num}`
        const accountType =
          accountClass === 1 ? 'asset'
            : accountClass === 2 ? 'liability'
              : accountClass === 3 ? 'revenue'
                : 'expense'
        const normalBalance =
          accountClass <= 1 || accountClass >= 4 ? 'debit' : 'credit'

        return {
          user_id: user.id,
          account_number: num,
          account_name: accountName,
          account_class: accountClass,
          account_group: accountGroup,
          account_type: accountType,
          normal_balance: normalBalance,
          plan_type: 'full_bas' as const,
          is_active: true,
          is_system_account: false,
          description: accountName,
          sru_code: null,
          sort_order: parseInt(num),
        }
      })

    if (accountsToActivate.length > 0) {
      const { error: activateError } = await supabase
        .from('chart_of_accounts')
        .insert(accountsToActivate)

      if (activateError) {
        return NextResponse.json({
          error: `Failed to activate accounts: ${activateError.message}`,
        }, { status: 500 })
      }
    }

    // Execute the import
    const result = await executeSIEImport(
      supabase,
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
