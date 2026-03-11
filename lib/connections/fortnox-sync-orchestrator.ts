/**
 * Orchestrates a full Fortnox data sync across multiple resource types.
 * Handles dependency ordering, scope checking, and result aggregation.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { FortnoxSyncResult, FortnoxResourceSyncResult } from '@/types'
import { refreshAccessToken } from './oauth'
import { getFortnoxDataType, getMissingScopesForTypes } from './fortnox-data-types'
import type { FortnoxDataType } from './fortnox-data-types'
import { FortnoxRateLimiter, FortnoxScopeError, FortnoxLicenseError, fetchAllPages, fetchDetails, fetchSingleResource } from './fortnox-paginated-fetcher'
import { syncFortnoxSIEData } from './fortnox-sync'

/** Extract a useful error message from any thrown value (including Supabase PostgrestError objects). */
function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message
  if (typeof err === 'object' && err !== null && 'message' in err) {
    return String((err as { message: unknown }).message)
  }
  return String(err)
}
import {
  importFortnoxCustomers,
  importFortnoxSuppliers,
  importFortnoxInvoices,
  importFortnoxSupplierInvoices,
  importFortnoxInvoicePayments,
  importFortnoxSupplierInvoicePayments,
} from './fortnox-importers'
import type {
  FortnoxCustomerListItem,
  FortnoxCustomerDetail,
  FortnoxSupplierListItem,
  FortnoxSupplierDetail,
  FortnoxInvoiceListItem,
  FortnoxInvoiceDetail,
  FortnoxSupplierInvoiceListItem,
  FortnoxSupplierInvoiceDetail,
  FortnoxInvoicePayment,
  FortnoxSupplierInvoicePayment,
} from './fortnox-types'

/**
 * Dependency-ordered sync phases. Resources within the same phase run sequentially.
 * Phase 1: customers, suppliers (no deps)
 * Phase 2: invoices, supplier invoices (depend on customers/suppliers)
 * Phase 3: payments (depend on invoices)
 * Phase 4: SIE import (independent but heavy)
 * Phase 5: raw JSON types (no deps)
 */
const PHASE_ORDER: Record<string, number> = {
  customers: 1,
  suppliers: 1,
  invoices: 2,
  supplierinvoices: 2,
  invoicepayments: 3,
  supplierinvoicepayments: 3,
  sie4: 4,
}

function getSyncOrder(dataTypeId: string): number {
  return PHASE_ORDER[dataTypeId] ?? 5
}

interface TokenInfo {
  accessToken: string
  grantedScopes: string[]
}

async function getTokens(
  adminClient: SupabaseClient,
  connectionId: string
): Promise<TokenInfo | null> {
  const { data: tokenData, error } = await adminClient
    .from('provider_connection_tokens')
    .select('*')
    .eq('connection_id', connectionId)
    .single()

  if (error || !tokenData) return null

  let accessToken = tokenData.access_token

  // Refresh if expired
  if (tokenData.token_expires_at) {
    const expiresAt = new Date(tokenData.token_expires_at)
    const bufferMs = 5 * 60 * 1000
    if (expiresAt.getTime() - bufferMs < Date.now() && tokenData.refresh_token) {
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
    }
  }

  return {
    accessToken,
    grantedScopes: tokenData.granted_scopes || [],
  }
}

async function syncGnubokTable(
  supabase: SupabaseClient,
  userId: string,
  dataType: FortnoxDataType,
  accessToken: string,
  rateLimiter: FortnoxRateLimiter,
  financialYear?: number
): Promise<FortnoxResourceSyncResult> {
  const startTime = Date.now()

  try {
    switch (dataType.id) {
      case 'customers': {
        const listItems = await fetchAllPages<FortnoxCustomerListItem>(
          accessToken, dataType.endpoint, dataType.responseKey, rateLimiter
        )
        const details = await fetchDetails<FortnoxCustomerListItem, FortnoxCustomerDetail>(
          accessToken, dataType.endpoint, 'Customer', listItems, 'CustomerNumber', rateLimiter
        )
        const result = await importFortnoxCustomers(supabase, userId, details)
        return {
          dataTypeId: dataType.id,
          name: dataType.name,
          success: result.errors.length === 0,
          created: result.created,
          updated: result.updated,
          skipped: result.skipped,
          errors: result.errors,
          durationMs: Date.now() - startTime,
        }
      }

      case 'suppliers': {
        const listItems = await fetchAllPages<FortnoxSupplierListItem>(
          accessToken, dataType.endpoint, dataType.responseKey, rateLimiter
        )
        const details = await fetchDetails<FortnoxSupplierListItem, FortnoxSupplierDetail>(
          accessToken, dataType.endpoint, 'Supplier', listItems, 'SupplierNumber', rateLimiter
        )
        const result = await importFortnoxSuppliers(supabase, userId, details)
        return {
          dataTypeId: dataType.id,
          name: dataType.name,
          success: result.errors.length === 0,
          created: result.created,
          updated: result.updated,
          skipped: result.skipped,
          errors: result.errors,
          durationMs: Date.now() - startTime,
        }
      }

      case 'invoices': {
        const listItems = await fetchAllPages<FortnoxInvoiceListItem>(
          accessToken, dataType.endpoint, dataType.responseKey, rateLimiter, financialYear
        )
        const details = await fetchDetails<FortnoxInvoiceListItem, FortnoxInvoiceDetail>(
          accessToken, dataType.endpoint, 'Invoice', listItems, 'DocumentNumber', rateLimiter
        )
        const result = await importFortnoxInvoices(supabase, userId, details)
        return {
          dataTypeId: dataType.id,
          name: dataType.name,
          success: result.errors.length === 0,
          created: result.created,
          updated: result.updated,
          skipped: result.skipped,
          errors: result.errors,
          durationMs: Date.now() - startTime,
        }
      }

      case 'supplierinvoices': {
        const listItems = await fetchAllPages<FortnoxSupplierInvoiceListItem>(
          accessToken, dataType.endpoint, dataType.responseKey, rateLimiter, financialYear
        )
        const details = await fetchDetails<FortnoxSupplierInvoiceListItem, FortnoxSupplierInvoiceDetail>(
          accessToken, dataType.endpoint, 'SupplierInvoice', listItems, 'GivenNumber', rateLimiter
        )
        const result = await importFortnoxSupplierInvoices(supabase, userId, details)
        return {
          dataTypeId: dataType.id,
          name: dataType.name,
          success: result.errors.length === 0,
          created: result.created,
          updated: result.updated,
          skipped: result.skipped,
          errors: result.errors,
          durationMs: Date.now() - startTime,
        }
      }

      case 'invoicepayments': {
        const items = await fetchAllPages<FortnoxInvoicePayment>(
          accessToken, dataType.endpoint, dataType.responseKey, rateLimiter
        )
        const result = await importFortnoxInvoicePayments(supabase, userId, items)
        return {
          dataTypeId: dataType.id,
          name: dataType.name,
          success: result.errors.length === 0,
          created: result.created,
          updated: result.updated,
          skipped: result.skipped,
          errors: result.errors,
          durationMs: Date.now() - startTime,
        }
      }

      case 'supplierinvoicepayments': {
        const items = await fetchAllPages<FortnoxSupplierInvoicePayment>(
          accessToken, dataType.endpoint, dataType.responseKey, rateLimiter
        )
        const result = await importFortnoxSupplierInvoicePayments(supabase, userId, items)
        return {
          dataTypeId: dataType.id,
          name: dataType.name,
          success: result.errors.length === 0,
          created: result.created,
          updated: result.updated,
          skipped: result.skipped,
          errors: result.errors,
          durationMs: Date.now() - startTime,
        }
      }

      default:
        return {
          dataTypeId: dataType.id,
          name: dataType.name,
          success: false,
          created: 0, updated: 0, skipped: 0,
          errors: [`No importer for data type: ${dataType.id}`],
          durationMs: Date.now() - startTime,
        }
    }
  } catch (err) {
    return {
      dataTypeId: dataType.id,
      name: dataType.name,
      success: false,
      created: 0, updated: 0, skipped: 0,
      errors: [err instanceof FortnoxLicenseError
        ? `Fortnox-kontot saknar licens för ${dataType.name}`
        : errorMessage(err)],
      durationMs: Date.now() - startTime,
    }
  }
}

async function syncRawJson(
  supabase: SupabaseClient,
  userId: string,
  connectionId: string,
  dataType: FortnoxDataType,
  accessToken: string,
  rateLimiter: FortnoxRateLimiter,
  financialYear?: number
): Promise<FortnoxResourceSyncResult> {
  const startTime = Date.now()

  try {
    let data: unknown
    let recordCount: number

    if (dataType.singleResource) {
      // Single-resource endpoint (e.g. /3/companyinformation, /3/settings/lockedperiod)
      const resource = await fetchSingleResource<Record<string, unknown>>(
        accessToken, dataType.endpoint, dataType.responseKey, rateLimiter
      )
      data = resource
      recordCount = 1
    } else {
      // Paginated list endpoint
      const items = await fetchAllPages<Record<string, unknown>>(
        accessToken,
        dataType.endpoint,
        dataType.responseKey,
        rateLimiter,
        dataType.requiresFinancialYear ? financialYear : undefined
      )
      data = items
      recordCount = items.length
    }

    // Upsert into provider_sync_data
    const { error } = await supabase
      .from('provider_sync_data')
      .upsert(
        {
          user_id: userId,
          connection_id: connectionId,
          resource_type: dataType.id,
          provider: 'fortnox',
          data,
          record_count: recordCount,
          synced_at: new Date().toISOString(),
        },
        { onConflict: 'user_id,connection_id,resource_type' }
      )

    if (error) throw error

    return {
      dataTypeId: dataType.id,
      name: dataType.name,
      success: true,
      created: recordCount,
      updated: 0,
      skipped: 0,
      errors: [],
      durationMs: Date.now() - startTime,
    }
  } catch (err) {
    return {
      dataTypeId: dataType.id,
      name: dataType.name,
      success: false,
      created: 0, updated: 0, skipped: 0,
      errors: [err instanceof FortnoxLicenseError
        ? `Fortnox-kontot saknar licens för ${dataType.name}`
        : errorMessage(err)],
      durationMs: Date.now() - startTime,
    }
  }
}

/**
 * Main sync orchestrator. Fetches selected data types from Fortnox
 * and imports them into gnubok tables or stores as raw JSON.
 */
export async function syncFortnoxData(
  supabase: SupabaseClient,
  adminClient: SupabaseClient,
  userId: string,
  connectionId: string,
  dataTypeIds: string[],
  financialYear?: number
): Promise<FortnoxSyncResult> {
  const totalStartTime = Date.now()

  // 1. Get and refresh tokens
  let tokens: TokenInfo | null
  try {
    tokens = await getTokens(adminClient, connectionId)
  } catch (err) {
    return {
      success: false,
      results: [],
      scopeMismatch: null,
      totalDurationMs: Date.now() - totalStartTime,
      errors: [err instanceof Error ? err.message : 'Token refresh failed'],
    }
  }

  if (!tokens) {
    return {
      success: false,
      results: [],
      scopeMismatch: null,
      totalDurationMs: Date.now() - totalStartTime,
      errors: ['No tokens found for connection'],
    }
  }

  // 2. Check scope mismatch (skip if no scopes recorded — legacy connection)
  let missingScopes = tokens.grantedScopes.length > 0
    ? getMissingScopesForTypes(dataTypeIds, tokens.grantedScopes)
    : []
  if (missingScopes.length > 0) {
    // Filter to only types with available scopes
    const availableTypeIds = dataTypeIds.filter((id) => {
      const dt = getFortnoxDataType(id)
      return dt && tokens!.grantedScopes.includes(dt.requiredScope)
    })

    const unavailableTypeIds = dataTypeIds.filter((id) => !availableTypeIds.includes(id))

    // If all types need missing scopes, return scope mismatch
    if (availableTypeIds.length === 0) {
      return {
        success: false,
        results: [],
        scopeMismatch: {
          missingScopes,
          affectedDataTypes: unavailableTypeIds,
        },
        totalDurationMs: Date.now() - totalStartTime,
        errors: ['All selected data types require scopes not granted by the current connection.'],
      }
    }

    // Otherwise, proceed with available types and report mismatch
    dataTypeIds = availableTypeIds
  }

  // 3. Resolve data types and sort by dependency order
  const resolvedTypes = dataTypeIds
    .map((id) => getFortnoxDataType(id))
    .filter((dt): dt is FortnoxDataType => dt !== undefined)
    .sort((a, b) => getSyncOrder(a.id) - getSyncOrder(b.id))

  // 4. Execute sync in order
  const rateLimiter = new FortnoxRateLimiter()
  const results: FortnoxResourceSyncResult[] = []

  for (const dataType of resolvedTypes) {
    let result: FortnoxResourceSyncResult

    switch (dataType.syncTarget) {
      case 'sie_import': {
        if (financialYear === undefined) {
          result = {
            dataTypeId: dataType.id,
            name: dataType.name,
            success: false,
            created: 0, updated: 0, skipped: 0,
            errors: ['Financial year is required for SIE import'],
            durationMs: 0,
          }
        } else {
          const startTime = Date.now()
          const sieResult = await syncFortnoxSIEData(
            supabase, adminClient, userId, connectionId, financialYear
          )
          result = {
            dataTypeId: dataType.id,
            name: dataType.name,
            success: sieResult.success,
            created: sieResult.journalEntriesCreated,
            updated: sieResult.accountsActivated,
            skipped: 0,
            errors: sieResult.errors,
            durationMs: Date.now() - startTime,
            sieResult,
          }
        }
        break
      }

      case 'gnubok_table':
        result = await syncGnubokTable(
          supabase, userId, dataType, tokens.accessToken, rateLimiter, financialYear
        )
        break

      case 'raw_json':
        result = await syncRawJson(
          supabase, userId, connectionId, dataType,
          tokens.accessToken, rateLimiter, financialYear
        )
        break

      default:
        result = {
          dataTypeId: dataType.id,
          name: dataType.name,
          success: false,
          created: 0, updated: 0, skipped: 0,
          errors: [`Unknown sync target: ${dataType.syncTarget}`],
          durationMs: 0,
        }
    }

    results.push(result)

    // Record sync metadata for non-raw_json types (raw_json already upserts in syncRawJson)
    if (result.success && dataType.syncTarget !== 'raw_json') {
      await supabase
        .from('provider_sync_data')
        .upsert(
          {
            user_id: userId,
            connection_id: connectionId,
            resource_type: dataType.id,
            provider: 'fortnox',
            data: [],
            record_count: result.created + result.updated,
            synced_at: new Date().toISOString(),
          },
          { onConflict: 'user_id,connection_id,resource_type' }
        )
    }
  }

  // 5. Detect runtime scope failures and update granted_scopes
  const runtimeScopeFailedTypes: string[] = []
  for (const r of results) {
    if (!r.success && r.errors.some((e) => e.includes('Missing Fortnox scope'))) {
      runtimeScopeFailedTypes.push(r.dataTypeId)
    }
  }

  if (runtimeScopeFailedTypes.length > 0) {
    // Determine which scopes actually failed
    const failedScopes = new Set<string>()
    for (const id of runtimeScopeFailedTypes) {
      const dt = getFortnoxDataType(id)
      if (dt) failedScopes.add(dt.requiredScope)
    }

    // Update granted_scopes in DB to remove scopes that Fortnox rejected
    const correctedScopes = tokens.grantedScopes.filter((s) => !failedScopes.has(s))
    await adminClient
      .from('provider_connection_tokens')
      .update({ granted_scopes: correctedScopes })
      .eq('connection_id', connectionId)

    // Merge into scopeMismatch
    const allMissingScopes = [...new Set([...missingScopes, ...failedScopes])]
    const allAffectedTypes = [...new Set([
      ...runtimeScopeFailedTypes,
      ...dataTypeIds.filter((id) => {
        const dt = getFortnoxDataType(id)
        return dt && missingScopes.includes(dt.requiredScope)
      }),
    ])]

    missingScopes = allMissingScopes
    // Update the results: replace raw error message with user-friendly one
    for (const r of results) {
      if (runtimeScopeFailedTypes.includes(r.dataTypeId)) {
        r.errors = ['Saknar behörighet i Fortnox']
      }
    }

    // 6. Update last_synced_at
    await adminClient
      .from('provider_connections')
      .update({ last_synced_at: new Date().toISOString() })
      .eq('id', connectionId)

    const allSucceeded = results.every((r) => r.success)

    return {
      success: allSucceeded,
      results,
      scopeMismatch: {
        missingScopes: allMissingScopes,
        affectedDataTypes: allAffectedTypes,
      },
      totalDurationMs: Date.now() - totalStartTime,
      errors: [],
    }
  }

  // 6. Update last_synced_at
  await adminClient
    .from('provider_connections')
    .update({ last_synced_at: new Date().toISOString() })
    .eq('id', connectionId)

  const allSucceeded = results.every((r) => r.success)

  return {
    success: allSucceeded,
    results,
    scopeMismatch: missingScopes.length > 0
      ? {
          missingScopes,
          affectedDataTypes: dataTypeIds.filter((id) => {
            const dt = getFortnoxDataType(id)
            return dt && !tokens!.grantedScopes.includes(dt.requiredScope)
          }),
        }
      : null,
    totalDurationMs: Date.now() - totalStartTime,
    errors: [],
  }
}
