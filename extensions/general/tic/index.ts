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
import { TICAPIError } from './lib/tic-types'
import type { TICCompanyProfile } from './lib/tic-types'
import type { CompanyLookupResult } from '@/lib/company-lookup/types'

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
  ],

  eventHandlers: [],
}
