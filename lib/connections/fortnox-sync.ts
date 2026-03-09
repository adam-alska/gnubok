import type { SupabaseClient } from '@supabase/supabase-js'
import type { SIESyncResult } from '@/types'
import { refreshAccessToken } from './oauth'
import { fetchFortnoxSIE } from './fortnox-api'
import { detectEncoding, decodeBuffer, parseSIEFile } from '@/lib/import/sie-parser'
import { checkDuplicateImport, executeSIEImport } from '@/lib/import/sie-import'
import { suggestMappings } from '@/lib/import/account-mapper'
import { getBASReference } from '@/lib/bookkeeping/bas-reference'

export async function syncFortnoxSIEData(
  supabase: SupabaseClient,
  adminClient: SupabaseClient,
  userId: string,
  connectionId: string,
  financialYear: number
): Promise<SIESyncResult> {
  const errors: string[] = []
  const warnings: string[] = []

  // 1. Fetch tokens
  const { data: tokenData, error: tokenError } = await adminClient
    .from('provider_connection_tokens')
    .select('*')
    .eq('connection_id', connectionId)
    .single()

  if (tokenError || !tokenData) {
    console.error('[fortnox-sync] Token fetch failed:', tokenError)
    return {
      success: false, accountsActivated: 0, journalEntriesCreated: 0,
      openingBalanceCreated: false, importId: null, fiscalPeriodId: null,
      fiscalYearStart: null, fiscalYearEnd: null, companyName: null,
      warnings, errors: ['No tokens found for connection'],
    }
  }

  let accessToken = tokenData.access_token
  console.log(`[fortnox-sync] Token found, expires: ${tokenData.token_expires_at}, has refresh: ${!!tokenData.refresh_token}`)

  // 2. Refresh if expired
  if (tokenData.token_expires_at) {
    const expiresAt = new Date(tokenData.token_expires_at)
    const bufferMs = 5 * 60 * 1000
    if (expiresAt.getTime() - bufferMs < Date.now() && tokenData.refresh_token) {
      try {
        const refreshed = await refreshAccessToken('fortnox', tokenData.refresh_token)
        accessToken = refreshed.access_token
        await adminClient
          .from('provider_connection_tokens')
          .update({
            access_token: refreshed.access_token,
            refresh_token: refreshed.refresh_token ?? tokenData.refresh_token,
            token_expires_at: refreshed.expires_in
              ? new Date(Date.now() + refreshed.expires_in * 1000).toISOString()
              : tokenData.token_expires_at,
          })
          .eq('connection_id', connectionId)
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Token refresh failed'
        return {
          success: false, accountsActivated: 0, journalEntriesCreated: 0,
          openingBalanceCreated: false, importId: null, fiscalPeriodId: null,
          fiscalYearStart: null, fiscalYearEnd: null, companyName: null,
          warnings, errors: [msg],
        }
      }
    }
  }

  // 3. Fetch SIE file
  const sieBuffer = await fetchFortnoxSIE(accessToken, financialYear)
  if (!sieBuffer) {
    return {
      success: false, accountsActivated: 0, journalEntriesCreated: 0,
      openingBalanceCreated: false, importId: null, fiscalPeriodId: null,
      fiscalYearStart: null, fiscalYearEnd: null, companyName: null,
      warnings, errors: ['Failed to download SIE file from Fortnox'],
    }
  }

  // 4. Decode and parse
  const encoding = detectEncoding(sieBuffer)
  const content = decodeBuffer(sieBuffer, encoding)
  const parsed = parseSIEFile(content)

  // 5. Check for duplicate import
  const existing = await checkDuplicateImport(supabase, userId, content)
  if (existing) {
    return {
      success: false, accountsActivated: 0, journalEntriesCreated: 0,
      openingBalanceCreated: false, importId: existing.id, fiscalPeriodId: null,
      fiscalYearStart: null, fiscalYearEnd: null, companyName: parsed.header.companyName ?? null,
      warnings, errors: ['This SIE file has already been imported'],
    }
  }

  // 6. Get user's chart of accounts for mapping
  const { data: userAccounts } = await supabase
    .from('chart_of_accounts')
    .select('account_number, account_name')
    .eq('user_id', userId)
    .eq('is_active', true)

  const mappableAccounts = (userAccounts || []).map((a) => ({
    account_number: a.account_number,
    account_name: a.account_name,
  }))

  // 7. Suggest mappings
  const mappings = suggestMappings(parsed.accounts, mappableAccounts)

  // 8. Auto-activate missing BAS accounts
  let accountsActivated = 0
  const unmappedAccounts = mappings.filter((m) => m.targetAccount === '')

  for (const mapping of unmappedAccounts) {
    const basAccount = getBASReference(mapping.sourceAccount)
    if (basAccount) {
      // Check if account exists but is inactive
      const { data: existing } = await supabase
        .from('chart_of_accounts')
        .select('id, is_active')
        .eq('user_id', userId)
        .eq('account_number', basAccount.account_number)
        .single()

      if (existing && !existing.is_active) {
        await supabase
          .from('chart_of_accounts')
          .update({ is_active: true })
          .eq('id', existing.id)
        accountsActivated++
      } else if (!existing) {
        await supabase.from('chart_of_accounts').insert({
          user_id: userId,
          account_number: basAccount.account_number,
          account_name: basAccount.account_name,
          account_type: basAccount.account_type,
          normal_balance: basAccount.normal_balance,
          is_active: true,
          sru_code: basAccount.sru_code,
        })
        accountsActivated++
      }

      // Update mapping
      mapping.targetAccount = basAccount.account_number
      mapping.targetName = basAccount.account_name
      mapping.confidence = 0.8
      mapping.matchType = 'exact'
    } else {
      warnings.push(`No BAS account found for ${mapping.sourceAccount} (${mapping.sourceName})`)
    }
  }

  // 9. Validate all accounts are mapped
  const stillUnmapped = mappings.filter((m) => m.targetAccount === '')
  if (stillUnmapped.length > 0) {
    for (const m of stillUnmapped) {
      errors.push(`Unmapped account: ${m.sourceAccount} (${m.sourceName})`)
    }
    return {
      success: false, accountsActivated, journalEntriesCreated: 0,
      openingBalanceCreated: false, importId: null, fiscalPeriodId: null,
      fiscalYearStart: null, fiscalYearEnd: null, companyName: parsed.header.companyName ?? null,
      warnings, errors,
    }
  }

  // 10. Extract fiscal year info
  const fiscalYear0 = parsed.header.fiscalYears.find((fy) => fy.yearIndex === 0)
  const fiscalYearStart = fiscalYear0?.start
    ? `${fiscalYear0.start.getFullYear()}-${String(fiscalYear0.start.getMonth() + 1).padStart(2, '0')}-${String(fiscalYear0.start.getDate()).padStart(2, '0')}`
    : null
  const fiscalYearEnd = fiscalYear0?.end
    ? `${fiscalYear0.end.getFullYear()}-${String(fiscalYear0.end.getMonth() + 1).padStart(2, '0')}-${String(fiscalYear0.end.getDate()).padStart(2, '0')}`
    : null

  // 11. Execute import
  try {
    const result = await executeSIEImport(supabase, userId, parsed, mappings, {
      filename: `fortnox-sie4-fy${financialYear}.se`,
      fileContent: content,
      createFiscalPeriod: true,
      importOpeningBalances: true,
      importTransactions: true,
      voucherSeries: 'B',
    })

    warnings.push(...result.warnings)

    if (!result.success) {
      errors.push(...result.errors)
      return {
        success: false, accountsActivated, journalEntriesCreated: result.journalEntriesCreated,
        openingBalanceCreated: result.openingBalanceEntryId !== null, importId: result.importId,
        fiscalPeriodId: result.fiscalPeriodId, fiscalYearStart, fiscalYearEnd,
        companyName: parsed.header.companyName ?? null, warnings, errors,
      }
    }

    // Update connection last_synced_at
    await adminClient
      .from('provider_connections')
      .update({ last_synced_at: new Date().toISOString() })
      .eq('id', connectionId)

    return {
      success: true,
      accountsActivated,
      journalEntriesCreated: result.journalEntriesCreated,
      openingBalanceCreated: result.openingBalanceEntryId !== null,
      importId: result.importId,
      fiscalPeriodId: result.fiscalPeriodId,
      fiscalYearStart,
      fiscalYearEnd,
      companyName: parsed.header.companyName ?? null,
      warnings,
      errors: [],
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'SIE import failed'
    return {
      success: false, accountsActivated, journalEntriesCreated: 0,
      openingBalanceCreated: false, importId: null, fiscalPeriodId: null,
      fiscalYearStart, fiscalYearEnd, companyName: parsed.header.companyName ?? null,
      warnings, errors: [msg],
    }
  }
}
