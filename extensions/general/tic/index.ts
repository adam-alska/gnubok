import type { Extension } from '@/lib/extensions/types'
import { NextResponse } from 'next/server'
import {
  searchCompanyByOrgNumber,
  getBankAccounts,
  getSNICodes,
  getEmails,
  getPhones,
  getCompanyPurpose,
  getFinancialReportSummaries,
} from './lib/tic-client'
import {
  startBankIdAuth,
  pollBankIdSession,
  collectBankIdResult,
  cancelBankIdSession,
  requestEnrichment,
  fetchEnrichmentData,
} from './lib/bankid-client'
import { TICAPIError } from './lib/tic-types'
import type { TICCompanyProfile } from './lib/tic-types'
import type { BankIdCompleteRequest } from './lib/bankid-types'
import type { CompanyLookupResult } from '@/lib/company-lookup/types'
import { hashPersonalNumber, encryptPersonalNumber } from '@/lib/auth/bankid'
import { createServiceClient } from '@/lib/supabase/server'
import crypto from 'crypto'

// Server-side per-IP rate limit for /bankid/start (each call = billable TIC session)
const bankIdStartCooldowns = new Map<string, number>()
const BANKID_START_COOLDOWN_MS = 5_000

/** Map TIC bankAccountType enum to human-readable string */
function bankAccountTypeLabel(type?: number): string {
  switch (type) {
    case 0: return 'bankkonto'
    case 1: return 'bankgiro'
    case 2: return 'plusgiro'
    case 3: return 'iban'
    default: return 'bankkonto'
  }
}

export const ticExtension: Extension = {
  id: 'tic',
  name: 'Bolagsuppgifter',
  version: '1.0.0',
  sector: 'general',

  apiRoutes: [
    {
      method: 'GET',
      path: '/lookup',
      handler: async (request: Request, ctx?) => {
        const log = ctx?.log ?? console
        const url = new URL(request.url)
        const orgNumber = url.searchParams.get('org_number')

        if (!orgNumber) {
          return NextResponse.json(
            { error: 'org_number query parameter is required' },
            { status: 400 }
          )
        }

        try {
          // Phase 1: Search — returns name, address, registration flags
          const doc = await searchCompanyByOrgNumber(orgNumber)

          if (!doc) {
            return NextResponse.json(
              { error: 'Company not found' },
              { status: 404 }
            )
          }

          // Extract company name (prefer 'name' type over other naming types)
          const nameEntry =
            doc.names.find((n) => n.companyNamingType === 'name') ?? doc.names[0]
          const companyName = nameEntry?.nameOrIdentifier ?? ''

          const isCeased = doc.activityStatus === 'ceased'

          const address = doc.mostRecentRegisteredAddress
            ? {
                street: doc.mostRecentRegisteredAddress.streetAddress
                  ?? doc.mostRecentRegisteredAddress.street
                  ?? null,
                postalCode: doc.mostRecentRegisteredAddress.postalCode ?? null,
                city: doc.mostRecentRegisteredAddress.city ?? null,
              }
            : null

          const registration = {
            fTax: doc.isRegisteredForFTax ?? false,
            vat: doc.isRegisteredForVAT ?? false,
          }

          // Phase 2: Supplementary data (non-blocking)
          const companyId = doc.companyId
          const [bankResult, sniResult, emailResult, phoneResult] =
            await Promise.allSettled([
              getBankAccounts(companyId),
              getSNICodes(companyId),
              getEmails(companyId),
              getPhones(companyId),
            ])

          const bankAccounts =
            bankResult.status === 'fulfilled' && bankResult.value
              ? bankResult.value.map((ba) => ({
                  type: bankAccountTypeLabel(ba.bankAccountType),
                  accountNumber: ba.accountNumber ?? '',
                  bic: ba.swift_BIC ?? null,
                }))
              : []

          const sniCodes =
            sniResult.status === 'fulfilled' && sniResult.value
              ? sniResult.value.map((s) => ({
                  code: s.sni_2007Code ?? '',
                  name: s.sni_2007Name ?? '',
                }))
              : []

          const email =
            emailResult.status === 'fulfilled' && emailResult.value?.[0]?.emailAddress
              ? emailResult.value[0].emailAddress
              : null

          const phone =
            phoneResult.status === 'fulfilled' && phoneResult.value?.[0]?.phoneNumber
              ? phoneResult.value[0].phoneNumber
              : null

          // Log Phase 2 failures for debugging
          if (bankResult.status === 'rejected') {
            log.warn('[tic] bank accounts fetch failed', { reason: String(bankResult.reason) })
          }
          if (sniResult.status === 'rejected') {
            log.warn('[tic] SNI codes fetch failed', { reason: String(sniResult.reason) })
          }

          const result: CompanyLookupResult = {
            companyName,
            isCeased,
            address,
            registration,
            bankAccounts,
            email,
            phone,
            sniCodes,
          }

          return NextResponse.json({ data: result })
        } catch (error) {
          if (error instanceof TICAPIError) {
            log.error('[tic] lookup failed', {
              message: error.message,
              statusCode: error.statusCode,
              code: error.code,
            })

            if (error.code === 'NOT_CONFIGURED') {
              return NextResponse.json(
                { error: 'TIC is not configured' },
                { status: 503 }
              )
            }

            if (error.code === 'RATE_LIMIT_EXCEEDED') {
              return NextResponse.json(
                { error: 'Rate limit exceeded, try again later' },
                { status: 429 }
              )
            }
          }

          log.error('[tic] unexpected error', { error: String(error) })
          return NextResponse.json(
            { error: 'Failed to look up company' },
            { status: 500 }
          )
        }
      },
    },
    {
      method: 'GET',
      path: '/profile',
      handler: async (request: Request, ctx?) => {
        const log = ctx?.log ?? console
        const url = new URL(request.url)
        const orgNumber = url.searchParams.get('org_number')

        if (!orgNumber) {
          return NextResponse.json(
            { error: 'org_number query parameter is required' },
            { status: 400 }
          )
        }

        try {
          const doc = await searchCompanyByOrgNumber(orgNumber)

          if (!doc) {
            return NextResponse.json(
              { error: 'Company not found' },
              { status: 404 }
            )
          }

          const nameEntry =
            doc.names.find((n) => n.companyNamingType === 'name') ?? doc.names[0]
          const companyName = nameEntry?.nameOrIdentifier ?? ''
          const companyId = doc.companyId

          // Phase 2: Supplementary data (non-blocking)
          const [bankResult, sniResult, emailResult, phoneResult, purposeResult, reportsResult] =
            await Promise.allSettled([
              getBankAccounts(companyId),
              getSNICodes(companyId),
              getEmails(companyId),
              getPhones(companyId),
              getCompanyPurpose(companyId),
              getFinancialReportSummaries(companyId),
            ])

          const bankAccounts =
            bankResult.status === 'fulfilled' && bankResult.value
              ? bankResult.value.map((ba) => ({
                  type: bankAccountTypeLabel(ba.bankAccountType),
                  accountNumber: ba.accountNumber ?? '',
                  bic: ba.swift_BIC ?? null,
                }))
              : []

          const sniCodes =
            sniResult.status === 'fulfilled' && sniResult.value
              ? sniResult.value.map((s) => ({
                  code: s.sni_2007Code ?? '',
                  name: s.sni_2007Name ?? '',
                }))
              : []

          const email =
            emailResult.status === 'fulfilled' && emailResult.value?.[0]?.emailAddress
              ? emailResult.value[0].emailAddress
              : null

          const phone =
            phoneResult.status === 'fulfilled' && phoneResult.value?.[0]?.phoneNumber
              ? phoneResult.value[0].phoneNumber
              : null

          const financialReports =
            reportsResult.status === 'fulfilled' && reportsResult.value
              ? reportsResult.value
              : []

          // Use dedicated purpose endpoint, fall back to search result
          const purpose =
            purposeResult.status === 'fulfilled' && purposeResult.value?.[0]?.purpose
              ? purposeResult.value[0].purpose
              : doc.mostRecentPurpose ?? null

          // Log Phase 2 failures
          if (bankResult.status === 'rejected') {
            log.warn('[tic] profile: bank accounts fetch failed', { reason: String(bankResult.reason) })
          }
          if (sniResult.status === 'rejected') {
            log.warn('[tic] profile: SNI codes fetch failed', { reason: String(sniResult.reason) })
          }
          if (reportsResult.status === 'rejected') {
            log.warn('[tic] profile: financial reports fetch failed', { reason: String(reportsResult.reason) })
          }

          const fin = doc.mostRecentFinancialSummary
          const financials = fin
            ? {
                periodStart: fin.periodStart,
                periodEnd: fin.periodEnd,
                netSalesK: fin.rs_NetSalesK ?? null,
                operatingProfitK: fin.rs_OperatingProfitOrLossK ?? null,
                totalAssetsK: fin.bs_TotalAssetsK ?? null,
                numberOfEmployees: fin.fn_NumberOfEmployees ?? null,
                operatingMargin: fin.km_OperatingMargin ?? null,
                netProfitMargin: fin.km_NetProfitMargin ?? null,
                equityAssetsRatio: fin.km_EquityAssetsRatio ?? null,
              }
            : null

          const profile: TICCompanyProfile = {
            companyId,
            orgNumber: doc.registrationNumber,
            companyName,
            legalEntityType: doc.legalEntityType,
            registrationDate: doc.registrationDate,
            activityStatus: doc.activityStatus ?? null,
            purpose,
            address: doc.mostRecentRegisteredAddress
              ? {
                  street: doc.mostRecentRegisteredAddress.streetAddress
                    ?? doc.mostRecentRegisteredAddress.street
                    ?? null,
                  postalCode: doc.mostRecentRegisteredAddress.postalCode ?? null,
                  city: doc.mostRecentRegisteredAddress.city ?? null,
                }
              : null,
            registration: {
              fTax: doc.isRegisteredForFTax ?? false,
              vat: doc.isRegisteredForVAT ?? false,
              payroll: doc.isRegisteredForPayroll ?? false,
            },
            sector: doc.cSector
              ? { code: doc.cSector.categoryCode, description: doc.cSector.categoryCodeDescription }
              : null,
            employeeRange: doc.cNbrEmployeesInterval?.categoryCodeDescription ?? null,
            turnoverRange: doc.cTurnoverInterval?.categoryCodeDescription ?? null,
            email,
            phone,
            sniCodes,
            bankAccounts,
            financials,
            financialReports,
            fetchedAt: new Date().toISOString(),
          }

          return NextResponse.json({ data: profile })
        } catch (error) {
          if (error instanceof TICAPIError) {
            log.error('[tic] profile failed', {
              message: error.message,
              statusCode: error.statusCode,
              code: error.code,
            })

            if (error.code === 'NOT_CONFIGURED') {
              return NextResponse.json(
                { error: 'TIC is not configured' },
                { status: 503 }
              )
            }

            if (error.code === 'RATE_LIMIT_EXCEEDED') {
              return NextResponse.json(
                { error: 'Rate limit exceeded, try again later' },
                { status: 429 }
              )
            }
          }

          log.error('[tic] profile unexpected error', { error: String(error) })
          return NextResponse.json(
            { error: 'Failed to fetch company profile' },
            { status: 500 }
          )
        }
      },
    },
    // ── BankID Authentication ──────────────────────────────────────
    // Routes for BankID login/signup via TIC Identity API.
    // skipAuth: true on auth routes (user has no Supabase session yet).

    {
      method: 'POST',
      path: '/bankid/start',
      skipAuth: true,
      handler: async (request: Request) => {
        try {
          const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
            || request.headers.get('x-real-ip')
            || '127.0.0.1'

          // Per-IP rate limit (each start = billable TIC session)
          const now = Date.now()
          const lastStart = bankIdStartCooldowns.get(ip) ?? 0
          if (now - lastStart < BANKID_START_COOLDOWN_MS) {
            return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
          }
          bankIdStartCooldowns.set(ip, now)

          // Prevent map from growing unbounded
          if (bankIdStartCooldowns.size > 10_000) {
            const cutoff = now - BANKID_START_COOLDOWN_MS
            for (const [k, v] of bankIdStartCooldowns) {
              if (v < cutoff) bankIdStartCooldowns.delete(k)
            }
          }

          const userAgent = request.headers.get('user-agent') || undefined

          const session = await startBankIdAuth(ip, userAgent)
          return NextResponse.json({ data: session })
        } catch (error) {
          if (error instanceof TICAPIError) {
            if (error.code === 'NOT_CONFIGURED') {
              return NextResponse.json({ error: 'BankID is not configured' }, { status: 503 })
            }
            if (error.code === 'RATE_LIMIT_EXCEEDED') {
              return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 })
            }
          }
          console.error('[tic/bankid] start failed', error)
          return NextResponse.json({ error: 'Failed to start BankID session' }, { status: 500 })
        }
      },
    },

    {
      method: 'POST',
      path: '/bankid/poll',
      skipAuth: true,
      handler: async (request: Request) => {
        try {
          const body = await request.json()
          const sessionId = body?.sessionId
          if (!sessionId || typeof sessionId !== 'string') {
            return NextResponse.json({ error: 'sessionId is required' }, { status: 400 })
          }

          const result = await pollBankIdSession(sessionId)
          if (result.status !== 'pending') {
            console.log('[tic/bankid] poll status:', result.status, result.hintCode, result.user?.personalNumber ? 'has-user' : 'no-user')
          }
          return NextResponse.json({ data: result })
        } catch (error) {
          if (error instanceof TICAPIError) {
            if (error.code === 'RATE_LIMIT_EXCEEDED') {
              return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 })
            }
          }
          console.error('[tic/bankid] poll failed', error)
          return NextResponse.json({ error: 'Failed to poll BankID session' }, { status: 500 })
        }
      },
    },

    {
      method: 'POST',
      path: '/bankid/complete',
      skipAuth: true,
      handler: async (request: Request) => {
        try {
          const body: BankIdCompleteRequest = await request.json()
          const { sessionId, mode, email } = body

          if (!sessionId || !mode) {
            return NextResponse.json(
              { error: 'sessionId and mode are required' },
              { status: 400 }
            )
          }

          const trimmedEmail = email?.trim().toLowerCase()

          if (mode === 'signup' && !trimmedEmail) {
            return NextResponse.json(
              { error: 'email is required for signup' },
              { status: 400 }
            )
          }

          // Verify BankID session is complete
          const session = await collectBankIdResult(sessionId)
          if (session.status !== 'complete' || !session.user) {
            return NextResponse.json(
              { error: 'session_invalid', message: 'BankID session is not complete' },
              { status: 400 }
            )
          }

          const { personalNumber, givenName, surname, name } = session.user
          const pnrHash = hashPersonalNumber(personalNumber)
          const supabase = createServiceClient()

          // Look up existing BankID identity
          const { data: existing } = await supabase
            .from('bankid_identities')
            .select('user_id')
            .eq('personal_number_hash', pnrHash)
            .single()

          if (mode === 'login') {
            if (!existing) {
              return NextResponse.json({
                error: 'no_account',
                givenName,
                surname,
              }, { status: 404 })
            }

            // Returning user — generate magic link
            const { data: userData } = await supabase.auth.admin.getUserById(existing.user_id)
            if (!userData?.user?.email) {
              return NextResponse.json(
                { error: 'session_invalid', message: 'User account not found' },
                { status: 500 }
              )
            }

            const { data: link, error: linkError } = await supabase.auth.admin.generateLink({
              type: 'magiclink',
              email: userData.user.email,
            })

            if (linkError || !link?.properties?.hashed_token) {
              console.error('[tic/bankid] generateLink failed', linkError)
              return NextResponse.json(
                { error: 'Failed to create session' },
                { status: 500 }
              )
            }

            return NextResponse.json({
              data: {
                tokenHash: link.properties.hashed_token,
                type: 'magiclink',
                isNewUser: false,
              },
            })
          }

          // mode === 'signup'
          if (existing) {
            return NextResponse.json(
              { error: 'already_linked', message: 'This BankID is already linked to an account' },
              { status: 409 }
            )
          }

          // Check if email is already taken by a non-BankID user
          const { data: existingByEmail } = await supabase
            .from('profiles')
            .select('id')
            .eq('email', trimmedEmail!)
            .single()

          let userId: string
          let isNewUser = true

          if (existingByEmail) {
            // Email already exists — link BankID to existing account
            userId = existingByEmail.id
            isNewUser = false

            await supabase.auth.admin.updateUserById(userId, {
              app_metadata: { bankid_linked: true },
              user_metadata: { full_name: name },
            })
          } else {
            // Create new Supabase user
            const randomPassword = crypto.randomBytes(32).toString('base64url')
            const { data: newUser, error: createError } = await supabase.auth.admin.createUser({
              email: trimmedEmail!,
              email_confirm: true,
              password: randomPassword,
              user_metadata: { full_name: name },
            })

            if (createError || !newUser?.user) {
              console.error('[tic/bankid] createUser failed', { email: trimmedEmail, status: createError?.status, code: (createError as any)?.code, message: createError?.message })
              return NextResponse.json(
                { error: 'Failed to create account', message: createError?.message },
                { status: 500 }
              )
            }

            userId = newUser.user.id

            // Mark user as BankID-linked (skips TOTP MFA)
            await supabase.auth.admin.updateUserById(userId, {
              app_metadata: { bankid_linked: true },
            })
          }

          // Store BankID identity
          const { error: insertError } = await supabase
            .from('bankid_identities')
            .insert({
              user_id: userId,
              personal_number_hash: pnrHash,
              personal_number_enc: encryptPersonalNumber(personalNumber),
              given_name: givenName,
              surname,
            })

          if (insertError) {
            console.error('[tic/bankid] insert bankid_identities failed', insertError)
            return NextResponse.json(
              { error: 'Failed to link BankID identity' },
              { status: 500 }
            )
          }

          // Generate magic link for session
          const { data: link, error: linkError } = await supabase.auth.admin.generateLink({
            type: 'magiclink',
            email: trimmedEmail!,
          })

          if (linkError || !link?.properties?.hashed_token) {
            console.error('[tic/bankid] generateLink failed for new user', linkError)
            return NextResponse.json(
              { error: 'Account created but failed to create session' },
              { status: 500 }
            )
          }

          // Attempt enrichment and store for onboarding pre-fill
          try {
            const enrichment = await requestEnrichment(sessionId, ['SPAR', 'CompanyRoles'])
            if (enrichment.status === 'Completed' && enrichment.secureUrl) {
              const enrichmentData = await fetchEnrichmentData(enrichment.secureUrl)
              console.log('[tic/bankid] enrichment success', {
                hasSpar: !!enrichmentData.spar,
                companyCount: enrichmentData.companyRoles?.length ?? 0,
              })

              // Store enrichment data in extension_data for the onboarding page to read
              await supabase
                .from('extension_data')
                .upsert({
                  user_id: userId,
                  extension_id: 'tic',
                  key: 'bankid_enrichment',
                  value: enrichmentData,
                }, { onConflict: 'user_id,extension_id,key' })
            }
          } catch (enrichError) {
            // Enrichment is optional — don't fail signup
            console.warn('[tic/bankid] enrichment failed (non-blocking)', enrichError)
          }

          return NextResponse.json({
            data: {
              tokenHash: link.properties.hashed_token,
              type: 'magiclink',
              isNewUser,
            },
          })
        } catch (error) {
          if (error instanceof TICAPIError) {
            console.error('[tic/bankid] complete TIC error', {
              message: error.message,
              code: error.code,
            })
            return NextResponse.json(
              { error: 'BankID verification failed' },
              { status: 502 }
            )
          }
          console.error('[tic/bankid] complete unexpected error', error)
          return NextResponse.json(
            { error: 'Failed to complete BankID authentication' },
            { status: 500 }
          )
        }
      },
    },

    {
      method: 'DELETE',
      path: '/bankid/:sessionId',
      skipAuth: true,
      handler: async (request: Request) => {
        try {
          const url = new URL(request.url)
          const sessionId = url.searchParams.get('_sessionId')
          if (!sessionId) {
            return NextResponse.json({ error: 'sessionId is required' }, { status: 400 })
          }

          await cancelBankIdSession(sessionId)
          return NextResponse.json({ data: { cancelled: true } })
        } catch (error) {
          console.error('[tic/bankid] cancel failed', error)
          return NextResponse.json({ error: 'Failed to cancel session' }, { status: 500 })
        }
      },
    },

    {
      method: 'POST',
      path: '/bankid/link',
      // skipAuth: false — requires existing Supabase session
      handler: async (request: Request, ctx?) => {
        try {
          const body = await request.json()
          const { sessionId } = body

          if (!sessionId || !ctx?.userId) {
            return NextResponse.json({ error: 'sessionId is required' }, { status: 400 })
          }

          // Verify BankID session
          const session = await collectBankIdResult(sessionId)
          if (session.status !== 'complete' || !session.user) {
            return NextResponse.json(
              { error: 'session_invalid', message: 'BankID session is not complete' },
              { status: 400 }
            )
          }

          const { personalNumber, givenName, surname } = session.user
          const pnrHash = hashPersonalNumber(personalNumber)
          const supabase = createServiceClient()

          // Check personnummer not already linked to another user
          const { data: existing } = await supabase
            .from('bankid_identities')
            .select('user_id')
            .eq('personal_number_hash', pnrHash)
            .single()

          if (existing && existing.user_id !== ctx.userId) {
            return NextResponse.json(
              { error: 'already_linked', message: 'This BankID is already linked to another account' },
              { status: 409 }
            )
          }

          if (existing && existing.user_id === ctx.userId) {
            return NextResponse.json({ data: { linked: true, alreadyLinked: true } })
          }

          // Link BankID to current user
          const { error: insertError } = await supabase
            .from('bankid_identities')
            .insert({
              user_id: ctx.userId,
              personal_number_hash: pnrHash,
              personal_number_enc: encryptPersonalNumber(personalNumber),
              given_name: givenName,
              surname,
            })

          if (insertError) {
            console.error('[tic/bankid] link insert failed', insertError)
            return NextResponse.json(
              { error: 'Failed to link BankID' },
              { status: 500 }
            )
          }

          // Mark user as BankID-linked (skips TOTP MFA)
          await supabase.auth.admin.updateUserById(ctx.userId, {
            app_metadata: { bankid_linked: true },
          })

          return NextResponse.json({ data: { linked: true } })
        } catch (error) {
          console.error('[tic/bankid] link failed', error)
          return NextResponse.json(
            { error: 'Failed to link BankID' },
            { status: 500 }
          )
        }
      },
    },

    {
      method: 'POST',
      path: '/bankid/unlink',
      // skipAuth: false — requires existing Supabase session
      handler: async (_request: Request, ctx?) => {
        try {
          if (!ctx?.userId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
          }

          const supabase = createServiceClient()

          // Delete bankid_identities row
          const { error: deleteError } = await supabase
            .from('bankid_identities')
            .delete()
            .eq('user_id', ctx.userId)

          if (deleteError) {
            console.error('[tic/bankid] unlink delete failed', deleteError)
            return NextResponse.json({ error: 'Failed to unlink BankID' }, { status: 500 })
          }

          // Clear app_metadata.bankid_linked so MFA enforcement resumes
          await supabase.auth.admin.updateUserById(ctx.userId, {
            app_metadata: { bankid_linked: false },
          })

          return NextResponse.json({ data: { unlinked: true } })
        } catch (error) {
          console.error('[tic/bankid] unlink failed', error)
          return NextResponse.json({ error: 'Failed to unlink BankID' }, { status: 500 })
        }
      },
    },
  ],

  eventHandlers: [],
}
