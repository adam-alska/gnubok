import type { Extension, ExtensionContext } from '@/lib/extensions/types'
import { NextResponse } from 'next/server'
import {
  createConsent,
  getConsent,
  generateOtc,
  getAuthUrl,
  exchangeAuthToken,
  submitProviderToken,
  deleteConsent,
  fetchCompanyInfo,
  fetchSIEExport,
} from './lib/arcim-client'
import { mapCompanyInfo } from './lib/entity-mapper'
import { executeMigration } from './lib/migration-orchestrator'
import type { ArcimProvider } from './types'
import { ARCIM_PROVIDERS } from './types'
import { parseSIEFile, validateSIEFile } from '@/lib/import/sie-parser'
import { suggestMappings, getMappingStats, isSystemAccount } from '@/lib/import/account-mapper'
import { loadMappings, generateImportPreview, executeSIEImport, saveMappings } from '@/lib/import/sie-import'
import { BAS_REFERENCE } from '@/lib/bookkeeping/bas-reference'

/**
 * Arcim Migration extension
 *
 * Migrates bookkeeping data from external Swedish accounting systems
 * (Fortnox, Visma, Bokio, Björn Lundén, Briox) into gnubok via
 * the Arcim Sync unified API gateway.
 *
 * Bookkeeping data (accounts, balances, vouchers) is imported via SIE
 * files fetched from the gateway. Entity data (customers, suppliers,
 * invoices) is imported via the REST API.
 *
 * Required environment variables:
 * - ARCIM_SYNC_GATEWAY_URL
 * - ARCIM_SYNC_API_KEY
 */
export const arcimMigrationExtension: Extension = {
  id: 'arcim-migration',
  name: 'Systemmigration (Arcim Sync)',
  version: '1.0.0',

  apiRoutes: [
    // ── List available providers ───────────────────────────────────
    {
      method: 'GET',
      path: '/providers',
      handler: async () => {
        return NextResponse.json({ providers: ARCIM_PROVIDERS })
      },
    },

    // ── Start consent flow (create consent + OTC) ─────────────────
    {
      method: 'POST',
      path: '/connect',
      handler: async (request: Request, ctx?: ExtensionContext) => {
        const log = ctx?.log ?? console
        const supabase = ctx?.supabase ?? await (await import('@/lib/supabase/server')).createClient()
        const { data: { user } } = await supabase.auth.getUser()

        if (!user) {
          return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        const { provider, companyName, orgNumber } = await request.json() as {
          provider: ArcimProvider
          companyName?: string
          orgNumber?: string
        }

        if (!provider) {
          return NextResponse.json({ error: 'provider is required' }, { status: 400 })
        }

        const providerInfo = ARCIM_PROVIDERS.find(p => p.id === provider)
        if (!providerInfo) {
          return NextResponse.json({ error: 'Invalid provider' }, { status: 400 })
        }

        try {
          // Create consent in Arcim Sync
          const consent = await createConsent(
            provider,
            `gnubok-migration-${user.id}`,
            orgNumber,
            companyName
          )

          // Store consent ID in extension settings for this user
          if (ctx?.settings) {
            await ctx.settings.set('consent_id', consent.id)
            await ctx.settings.set('provider', provider)
          }

          if (providerInfo.authType === 'oauth') {
            // Generate OTC for OAuth flow
            const otc = await generateOtc(consent.id)

            // Build the OAuth callback URL using the current app URL (localhost in dev, production in prod)
            const appUrl = process.env.NEXT_PUBLIC_APP_URL || ''
            const callbackUrl = `${appUrl}/api/extensions/ext/arcim-migration/callback`

            // Encode consentId + provider in state so the callback doesn't depend on session storage
            const statePayload = JSON.stringify({ otc: otc.code, consentId: consent.id, provider })
            const stateEncoded = Buffer.from(statePayload).toString('base64url')

            // Pass callbackUrl as redirectUri so Fortnox redirects here (works for localhost and production)
            const { url } = await getAuthUrl(provider, stateEncoded, callbackUrl)

            return NextResponse.json({
              consentId: consent.id,
              authType: 'oauth',
              authUrl: url,
              otcCode: otc.code,
            })
          } else {
            // Token-based providers: consent is ready for direct use
            return NextResponse.json({
              consentId: consent.id,
              authType: 'token',
            })
          }
        } catch (error) {
          log.error('Failed to create consent:', error)
          return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Failed to connect' },
            { status: 500 }
          )
        }
      },
    },

    // ── Submit API token for token-based providers (Bokio, etc.) ──
    {
      method: 'POST',
      path: '/submit-token',
      handler: async (request: Request, ctx?: ExtensionContext) => {
        const log = ctx?.log ?? console
        const supabase = ctx?.supabase ?? await (await import('@/lib/supabase/server')).createClient()
        const { data: { user } } = await supabase.auth.getUser()

        if (!user) {
          return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        const { consentId, provider, apiToken, companyId } = await request.json() as {
          consentId: string
          provider: ArcimProvider
          apiToken: string
          companyId?: string
        }

        if (!consentId || !provider) {
          return NextResponse.json(
            { error: 'consentId and provider are required' },
            { status: 400 }
          )
        }

        // BL uses server-side client credentials — only needs companyId
        // Bokio and Briox need an API token
        if (provider !== 'bjornlunden' && !apiToken) {
          return NextResponse.json(
            { error: 'apiToken is required for this provider' },
            { status: 400 }
          )
        }

        // Bokio and BL require companyId
        if ((provider === 'bokio' || provider === 'bjornlunden') && !companyId) {
          return NextResponse.json(
            { error: 'companyId is required for this provider' },
            { status: 400 }
          )
        }

        try {
          await submitProviderToken(consentId, provider, apiToken || 'client_credentials', companyId)
          return NextResponse.json({ success: true, consentId })
        } catch (error) {
          log.error('Submit token error:', error)
          return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Failed to submit token' },
            { status: 500 }
          )
        }
      },
    },

    // ── OAuth callback ────────────────────────────────────────────
    // This handler is called by the OAuth provider redirect. It does NOT
    // require user auth — the request comes from the provider, not the user's
    // browser session. Authentication is validated via the OTC code + consent.
    // The 'skipAuth' flag is checked by the extension dispatch route.
    {
      method: 'GET',
      path: '/callback',
      skipAuth: true,
      handler: async (request: Request, ctx?: ExtensionContext) => {
        const log = ctx?.log ?? console
        const url = new URL(request.url)
        const code = url.searchParams.get('code')
        const stateRaw = url.searchParams.get('state')

        if (!code || !stateRaw) {
          return NextResponse.json({ error: 'Missing code or state' }, { status: 400 })
        }

        try {
          // Decode state — supports both new format (base64url JSON with consentId/provider)
          // and legacy format (plain OTC code string)
          let consentId: string | null = null
          let provider: ArcimProvider | null = null
          let otcCode: string = stateRaw

          try {
            const decoded = JSON.parse(Buffer.from(stateRaw, 'base64url').toString())
            if (decoded.consentId && decoded.provider && decoded.otc) {
              consentId = decoded.consentId
              provider = decoded.provider as ArcimProvider
              otcCode = decoded.otc
            }
          } catch {
            // Legacy: state is just the OTC code — fall back to ctx.settings
          }

          // Fall back to session-based settings if state didn't contain the data
          if (!consentId || !provider) {
            consentId = ctx?.settings
              ? await ctx.settings.get<string>('consent_id')
              : null
            provider = ctx?.settings
              ? await ctx.settings.get<ArcimProvider>('provider')
              : null
          }

          if (!consentId || !provider) {
            return NextResponse.json({ error: 'No active migration session' }, { status: 400 })
          }

          // The redirectUri used for the token exchange must match the one used in the auth URL
          const appUrl = process.env.NEXT_PUBLIC_APP_URL || ''
          const redirectUri = `${appUrl}/api/extensions/ext/arcim-migration/callback`

          await exchangeAuthToken(consentId, provider, otcCode, code, redirectUri)

          // Redirect to import page with success
          return NextResponse.redirect(`${appUrl}/import?migration=connected&consentId=${consentId}`)
        } catch (error) {
          log.error('OAuth callback error:', error)
          const appUrl = process.env.NEXT_PUBLIC_APP_URL || ''
          return NextResponse.redirect(`${appUrl}/import?migration=error`)
        }
      },
    },

    // ── Preview: fetch company info + SIE stats before migration ──
    {
      method: 'GET',
      path: '/preview',
      handler: async (request: Request, ctx?: ExtensionContext) => {
        const log = ctx?.log ?? console
        const supabase = ctx?.supabase ?? await (await import('@/lib/supabase/server')).createClient()
        const { data: { user } } = await supabase.auth.getUser()

        if (!user) {
          return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        const url = new URL(request.url)
        const consentId = url.searchParams.get('consentId')

        if (!consentId) {
          return NextResponse.json({ error: 'consentId is required' }, { status: 400 })
        }

        try {
          // Verify consent is accepted
          const consent = await getConsent(consentId)
          if (consent.status !== 1) {
            return NextResponse.json(
              { error: 'Consent is not accepted. Complete OAuth first.' },
              { status: 400 }
            )
          }

          // Fetch company info for preview (non-blocking — continue if it fails)
          let mapped = null
          try {
            const companyInfo = await fetchCompanyInfo(consentId)
            mapped = companyInfo ? mapCompanyInfo(companyInfo) : null
          } catch (err) {
            log.info('Company info fetch failed:', err instanceof Error ? err.message : String(err))
          }

          // Try to fetch SIE stats (non-blocking — continue if it fails)
          let sieAvailable = false
          let sieStats: { accountCount: number; transactionCount: number; fiscalYears: number[] } | null = null

          try {
            log.info(`Fetching SIE export for consent ${consentId}...`)
            const sieResult = await fetchSIEExport(consentId, 4)
            log.info(`SIE export response: ${sieResult.files.length} files returned`)
            if (sieResult.files.length > 0) {
              sieAvailable = true
              const totalAccounts = Math.max(...sieResult.files.map(f => f.accountCount))
              const totalTransactions = sieResult.files.reduce((sum, f) => sum + f.transactionCount, 0)
              const fiscalYears = sieResult.files.map(f => f.fiscalYear).sort()
              sieStats = { accountCount: totalAccounts, transactionCount: totalTransactions, fiscalYears }
              log.info(`SIE stats: ${totalAccounts} accounts, ${totalTransactions} transactions, years: ${fiscalYears.join(', ')}`)
            } else {
              log.info('SIE export returned empty files array')
            }
          } catch (err) {
            log.info('SIE export failed:', err instanceof Error ? err.message : String(err))
          }

          return NextResponse.json({
            consent: {
              id: consent.id,
              provider: consent.provider,
              status: consent.status,
              companyName: consent.companyName,
            },
            companyInfo: mapped,
            sieAvailable,
            sieStats,
          })
        } catch (error) {
          log.error('Preview error:', error)
          return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Preview failed' },
            { status: 500 }
          )
        }
      },
    },

    // ── Fetch + parse SIE data for mapping step ───────────────────
    {
      method: 'GET',
      path: '/sie-data',
      handler: async (request: Request, ctx?: ExtensionContext) => {
        const log = ctx?.log ?? console
        const supabase = ctx?.supabase ?? await (await import('@/lib/supabase/server')).createClient()
        const { data: { user } } = await supabase.auth.getUser()

        if (!user) {
          return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        const url = new URL(request.url)
        const consentId = url.searchParams.get('consentId')

        if (!consentId) {
          return NextResponse.json({ error: 'consentId is required' }, { status: 400 })
        }

        try {
          // Fetch SIE from gateway
          const sieResult = await fetchSIEExport(consentId, 4)
          if (sieResult.files.length === 0) {
            return NextResponse.json({ error: 'No SIE data available' }, { status: 404 })
          }

          // Parse most recent file for preview/validation
          const sieFile = sieResult.files[sieResult.files.length - 1]
          const parsed = parseSIEFile(sieFile.rawContent)
          const validation = validateSIEFile(parsed)

          // Collect ALL unique accounts across ALL fiscal year files
          // so mappings cover every account that will be imported
          const allAccountsMap = new Map<string, { number: string; name: string }>()
          for (const file of sieResult.files) {
            const fileParsed = parseSIEFile(file.rawContent)
            for (const acc of fileParsed.accounts) {
              if (!allAccountsMap.has(acc.number)) {
                allAccountsMap.set(acc.number, { number: acc.number, name: acc.name })
              }
            }
          }
          // Filter out source-system internal accounts (e.g. Fortnox 0099)
          // that have no BAS equivalent — same as core SIE import
          const allAccounts = [...allAccountsMap.values()]
            .filter(a => !isSystemAccount(a.number))
            .map(a => ({ number: a.number, name: a.name }))

          // Load existing user mappings
          const existingMappings = await loadMappings(supabase, user.id)
          const existingRecords = [...existingMappings.values()].map(m => ({
            id: '',
            user_id: user.id,
            source_account: m.sourceAccount,
            source_name: m.sourceName,
            target_account: m.targetAccount,
            confidence: m.confidence,
            match_type: m.matchType,
            created_at: '',
            updated_at: '',
          }))

          // Suggest mappings using accounts from ALL fiscal years
          const basAccounts = BAS_REFERENCE.map(b => ({
            account_number: b.account_number,
            account_name: b.account_name,
          }))
          const mappings = suggestMappings(allAccounts, basAccounts, existingRecords)
          const mappingStats = getMappingStats(mappings)

          log.info(`Account mapping: ${allAccounts.length} unique accounts across ${sieResult.files.length} files, ${mappingStats.unmapped} unmapped`)

          // Generate preview
          const preview = generateImportPreview(parsed, mappings)

          // Collect all raw SIE content (all fiscal years)
          const allRawContent = sieResult.files.map(f => f.rawContent)

          return NextResponse.json({
            parsed,
            mappings,
            mappingStats,
            preview,
            validation,
            rawContent: allRawContent,
            basAccounts: BAS_REFERENCE,
          })
        } catch (error) {
          log.error('SIE data fetch error:', error)
          return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Failed to fetch SIE data' },
            { status: 500 }
          )
        }
      },
    },

    // ── Import SIE data (accounts, balances, vouchers) ────────────
    {
      method: 'POST',
      path: '/import-sie',
      handler: async (request: Request, ctx?: ExtensionContext) => {
        const log = ctx?.log ?? console
        const supabase = ctx?.supabase ?? await (await import('@/lib/supabase/server')).createClient()
        const { data: { user } } = await supabase.auth.getUser()

        if (!user) {
          return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        const { rawContent, mappings, options } = await request.json() as {
          rawContent: string
          mappings: import('@/lib/import/types').AccountMapping[]
          options: {
            createFiscalPeriod: boolean
            importOpeningBalances: boolean
            importTransactions: boolean
            voucherSeries?: string
          }
        }

        if (!rawContent || !mappings) {
          return NextResponse.json({ error: 'rawContent and mappings are required' }, { status: 400 })
        }

        try {
          // Parse the SIE content
          const parsed = parseSIEFile(rawContent)

          // Save the user's mappings for future use
          await saveMappings(supabase, user.id, mappings)

          // Execute the import via core engine
          const result = await executeSIEImport(supabase, user.id, parsed, mappings, {
            filename: `migration-sie-${Date.now()}.se`,
            fileContent: rawContent,
            createFiscalPeriod: options.createFiscalPeriod,
            importOpeningBalances: options.importOpeningBalances,
            importTransactions: options.importTransactions,
            voucherSeries: options.voucherSeries,
          })

          log.info('SIE import completed:', {
            success: result.success,
            journalEntriesCreated: result.journalEntriesCreated,
            errors: result.errors.length,
            errorDetails: result.errors.slice(0, 10),
          })

          return NextResponse.json(result)
        } catch (error) {
          log.error('SIE import failed:', error)
          return NextResponse.json(
            { error: error instanceof Error ? error.message : 'SIE import failed' },
            { status: 500 }
          )
        }
      },
    },

    // ── Execute entity migration (customers, suppliers, invoices) ──
    {
      method: 'POST',
      path: '/migrate',
      handler: async (request: Request, ctx?: ExtensionContext) => {
        const log = ctx?.log ?? console
        const supabase = ctx?.supabase ?? await (await import('@/lib/supabase/server')).createClient()
        const { data: { user } } = await supabase.auth.getUser()

        if (!user) {
          return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        const {
          consentId,
          importCompanyInfo = true,
          importCustomers = true,
          importSuppliers = true,
          importSalesInvoices = true,
          importSupplierInvoices = true,
        } = await request.json() as {
          consentId: string
          importCompanyInfo?: boolean
          importCustomers?: boolean
          importSuppliers?: boolean
          importSalesInvoices?: boolean
          importSupplierInvoices?: boolean
        }

        if (!consentId) {
          return NextResponse.json({ error: 'consentId is required' }, { status: 400 })
        }

        try {
          // Verify consent
          const consent = await getConsent(consentId)
          if (consent.status !== 1) {
            return NextResponse.json(
              { error: 'Consent is not accepted' },
              { status: 400 }
            )
          }

          log.info(`Starting migration for user ${user.id} from ${consent.provider}`)

          const results = await executeMigration({
            consentId,
            userId: user.id,
            supabase,
            importCompanyInfo,
            importCustomers,
            importSuppliers,
            importSalesInvoices,
            importSupplierInvoices,
          })

          log.info('Migration completed:', results)

          return NextResponse.json({ success: true, results })
        } catch (error) {
          log.error('Migration failed:', error)
          return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Migration failed' },
            { status: 500 }
          )
        }
      },
    },

    // ── Disconnect / revoke consent ───────────────────────────────
    {
      method: 'DELETE',
      path: '/disconnect',
      handler: async (request: Request, ctx?: ExtensionContext) => {
        const log = ctx?.log ?? console
        const supabase = ctx?.supabase ?? await (await import('@/lib/supabase/server')).createClient()
        const { data: { user } } = await supabase.auth.getUser()

        if (!user) {
          return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        const { consentId } = await request.json() as { consentId: string }

        if (!consentId) {
          return NextResponse.json({ error: 'consentId is required' }, { status: 400 })
        }

        try {
          await deleteConsent(consentId)

          // Clear stored consent from settings
          if (ctx?.settings) {
            await ctx.settings.set('consent_id', null)
            await ctx.settings.set('provider', null)
          }

          return NextResponse.json({ success: true })
        } catch (error) {
          log.error('Disconnect error:', error)
          return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Disconnect failed' },
            { status: 500 }
          )
        }
      },
    },
  ],

  eventHandlers: [],
}
