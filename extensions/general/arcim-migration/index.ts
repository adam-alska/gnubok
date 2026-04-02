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
  resolveConsent,
  fetchCompanyInfoDirect,
} from './lib/provider-client'
import { mapCompanyInfo } from './lib/entity-mapper'
import { executeMigration } from './lib/migration-orchestrator'
import type { ArcimProvider } from './types'
import { ARCIM_PROVIDERS } from './types'
import { parseSIEFile, validateSIEFile } from '@/lib/import/sie-parser'
import { suggestMappings, getMappingStats, isSystemAccount } from '@/lib/import/account-mapper'
import { loadMappings, generateImportPreview, executeSIEImport, saveMappings } from '@/lib/import/sie-import'
import { BAS_REFERENCE } from '@/lib/bookkeeping/bas-reference'
import { FortnoxClient } from '@/lib/providers/fortnox/client'
import type { ProviderName } from '@/lib/providers/types'

/** Fiscal years we support importing — older data is not needed */
const ALLOWED_FISCAL_YEARS = new Set([2024, 2025, 2026])

const fortnoxClient = new FortnoxClient()

/**
 * Provider Migration extension
 *
 * Migrates bookkeeping data from external Swedish accounting systems
 * (Fortnox, Visma, Bokio, Björn Lundén, Briox) into gnubok by talking
 * directly to each provider's API.
 *
 * Bookkeeping data (accounts, balances, vouchers) is imported via SIE
 * files fetched from providers. Entity data (customers, suppliers,
 * invoices) is imported via the provider REST APIs.
 */
export const arcimMigrationExtension: Extension = {
  id: 'arcim-migration',
  name: 'Systemmigration',
  version: '2.0.0',

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

        const companyId = ctx?.companyId ?? user.id

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
          // Create consent directly in Supabase
          const consent = await createConsent(
            companyId,
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

            // Build the OAuth callback URL
            const appUrl = process.env.NEXT_PUBLIC_APP_URL || ''
            const callbackUrl = `${appUrl}/api/extensions/ext/arcim-migration/callback`

            // Encode consentId + provider in state
            const statePayload = JSON.stringify({ otc: otc.code, consentId: consent.id, provider })
            const stateEncoded = Buffer.from(statePayload).toString('base64url')

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
        if (provider !== 'bjornlunden' && !apiToken) {
          return NextResponse.json(
            { error: 'apiToken is required for this provider' },
            { status: 400 }
          )
        }

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
          let consentId: string | null = null
          let provider: ArcimProvider | null = null

          try {
            const decoded = JSON.parse(Buffer.from(stateRaw, 'base64url').toString())
            if (decoded.consentId && decoded.provider) {
              consentId = decoded.consentId
              provider = decoded.provider as ArcimProvider
            }
          } catch {
            // Legacy fallback
          }

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

          const appUrl = process.env.NEXT_PUBLIC_APP_URL || ''
          const redirectUri = `${appUrl}/api/extensions/ext/arcim-migration/callback`

          // Exchange OAuth code directly with the provider
          await exchangeAuthToken(consentId, provider, code, redirectUri)

          // Return an HTML page that notifies the opener tab and closes itself
          const html = `<!DOCTYPE html><html><body><script>
            if (window.opener) {
              window.opener.postMessage({ type: 'arcim-oauth-success', consentId: '${consentId}' }, '${appUrl}');
              window.close();
            } else {
              window.location.href = '${appUrl}/import?migration=connected&consentId=${consentId}';
            }
          </script><p>Anslutningen lyckades. Du kan stänga denna flik.</p></body></html>`

          return new Response(html, {
            status: 200,
            headers: { 'Content-Type': 'text/html' },
          })
        } catch (error) {
          log.error('OAuth callback error:', error)
          const appUrl = process.env.NEXT_PUBLIC_APP_URL || ''

          const html = `<!DOCTYPE html><html><body><script>
            if (window.opener) {
              window.opener.postMessage({ type: 'arcim-oauth-error' }, '${appUrl}');
              window.close();
            } else {
              window.location.href = '${appUrl}/import?migration=error';
            }
          </script><p>Något gick fel. Du kan stänga denna flik.</p></body></html>`

          return new Response(html, {
            status: 200,
            headers: { 'Content-Type': 'text/html' },
          })
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

        const companyId = ctx?.companyId ?? user.id

        const url = new URL(request.url)
        const consentId = url.searchParams.get('consentId')

        if (!consentId) {
          return NextResponse.json({ error: 'consentId is required' }, { status: 400 })
        }

        try {
          const consent = await getConsent(consentId)
          if (consent.status !== 1) {
            return NextResponse.json(
              { error: 'Consent is not accepted. Complete OAuth first.' },
              { status: 400 }
            )
          }

          // Resolve consent to get access token
          const resolved = await resolveConsent(companyId, consentId)
          const provider = resolved.consent.provider as ProviderName

          // Fetch company info directly from provider
          let mapped = null
          try {
            const companyInfo = await fetchCompanyInfoDirect(provider, resolved.accessToken, resolved.providerCompanyId)
            mapped = companyInfo ? mapCompanyInfo(companyInfo) : null
          } catch (err) {
            log.info('Company info fetch failed:', err instanceof Error ? err.message : String(err))
          }

          // Try to fetch SIE data (Fortnox has native SIE export)
          let sieAvailable = false
          let sieStats: { accountCount: number; transactionCount: number; fiscalYears: number[] } | null = null

          if (provider === 'fortnox') {
            try {
              log.info(`Fetching SIE export from Fortnox for consent ${consentId}...`)
              // Fortnox SIE export endpoint: /3/sie/{type}?financialyear={id}
              // First get financial years
              const fyResponse = await fortnoxClient.get<Record<string, unknown>>(
                resolved.accessToken,
                '/financialyears'
              )
              const years = (fyResponse['FinancialYears'] as Record<string, unknown>[] | undefined) ?? []
              const allowedYears = years
                .map(fy => ({
                  id: fy['Id'] as number,
                  fromDate: fy['FromDate'] as string,
                  toDate: fy['ToDate'] as string,
                }))
                .filter(fy => {
                  const year = new Date(fy.fromDate).getFullYear()
                  return ALLOWED_FISCAL_YEARS.has(year)
                })

              if (allowedYears.length > 0) {
                // Fetch SIE type 4 for the most recent allowed year to get stats
                const latestYear = allowedYears[allowedYears.length - 1]
                const sieContent = await fortnoxClient.getText(
                  resolved.accessToken,
                  `/sie/4?financialyear=${latestYear.id}`
                )
                if (sieContent) {
                  const parsed = parseSIEFile(sieContent)
                  sieAvailable = true
                  sieStats = {
                    accountCount: parsed.accounts.length,
                    transactionCount: parsed.vouchers.length,
                    fiscalYears: allowedYears.map(fy => new Date(fy.fromDate).getFullYear()),
                  }
                }
              }
            } catch (err) {
              log.info('SIE export failed:', err instanceof Error ? err.message : String(err))
            }
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

        const companyId = ctx?.companyId ?? user.id

        const url = new URL(request.url)
        const consentId = url.searchParams.get('consentId')

        if (!consentId) {
          return NextResponse.json({ error: 'consentId is required' }, { status: 400 })
        }

        try {
          // Resolve consent
          const resolved = await resolveConsent(companyId, consentId)
          const provider = resolved.consent.provider as ProviderName

          if (provider !== 'fortnox') {
            return NextResponse.json(
              { error: `SIE export is currently only supported for Fortnox. Provider: ${provider}` },
              { status: 400 }
            )
          }

          // Fetch financial years from Fortnox
          const fyResponse = await fortnoxClient.get<Record<string, unknown>>(
            resolved.accessToken,
            '/financialyears'
          )
          const years = (fyResponse['FinancialYears'] as Record<string, unknown>[] | undefined) ?? []
          const allowedYears = years
            .map(fy => ({
              id: fy['Id'] as number,
              fromDate: fy['FromDate'] as string,
              toDate: fy['ToDate'] as string,
            }))
            .filter(fy => {
              const year = new Date(fy.fromDate).getFullYear()
              return ALLOWED_FISCAL_YEARS.has(year)
            })

          if (allowedYears.length === 0) {
            return NextResponse.json({ error: 'No SIE data available for fiscal years 2024–2026' }, { status: 404 })
          }

          // Fetch SIE type 4 for each allowed year
          const sieFiles: { fiscalYear: number; rawContent: string }[] = []
          for (const fy of allowedYears) {
            try {
              const sieContent = await fortnoxClient.getText(
                resolved.accessToken,
                `/sie/4?financialyear=${fy.id}`
              )
              if (sieContent) {
                sieFiles.push({
                  fiscalYear: new Date(fy.fromDate).getFullYear(),
                  rawContent: sieContent,
                })
              }
            } catch (err) {
              log.info(`Failed to fetch SIE for year ${fy.id}:`, err instanceof Error ? err.message : String(err))
            }
          }

          if (sieFiles.length === 0) {
            return NextResponse.json({ error: 'No SIE data available for fiscal years 2024–2026' }, { status: 404 })
          }

          // Parse most recent file for preview/validation
          const sieFile = sieFiles[sieFiles.length - 1]
          const parsed = parseSIEFile(sieFile.rawContent)
          const validation = validateSIEFile(parsed)

          // Collect ALL unique accounts across ALL fiscal year files
          const allAccountsMap = new Map<string, { number: string; name: string }>()
          for (const file of sieFiles) {
            const fileParsed = parseSIEFile(file.rawContent)
            for (const acc of fileParsed.accounts) {
              if (!allAccountsMap.has(acc.number)) {
                allAccountsMap.set(acc.number, { number: acc.number, name: acc.name })
              }
            }
          }
          const allAccounts = [...allAccountsMap.values()]
            .filter(a => !isSystemAccount(a.number))
            .map(a => ({ number: a.number, name: a.name }))

          // Load existing user mappings
          const existingMappings = await loadMappings(supabase, companyId)
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

          // Suggest mappings
          const basAccounts = BAS_REFERENCE.map(b => ({
            account_number: b.account_number,
            account_name: b.account_name,
          }))
          const mappings = suggestMappings(allAccounts, basAccounts, existingRecords)
          const mappingStats = getMappingStats(mappings)

          log.info(`Account mapping: ${allAccounts.length} unique accounts across ${sieFiles.length} files, ${mappingStats.unmapped} unmapped`)

          const preview = generateImportPreview(parsed, mappings)
          const allRawContent = sieFiles.map(f => f.rawContent)

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

        const companyId = ctx?.companyId ?? user.id

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
          const parsed = parseSIEFile(rawContent)

          await saveMappings(supabase, user.id, mappings)

          const result = await executeSIEImport(supabase, companyId, user.id, parsed, mappings, {
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

        const companyId = ctx?.companyId ?? user.id

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
            companyId,
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
