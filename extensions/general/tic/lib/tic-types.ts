/** Search response wrapper */
export interface TICCompanyResponse {
  facet_counts: unknown[]
  found: number
  hits: Array<{
    document: TICCompanyDocument
  }>
}

/** Full company document from TIC search */
export interface TICCompanyDocument {
  companyId: number
  registrationNumber: string
  names: Array<{
    nameOrIdentifier: string
    companyNamingType: string
    companyNameDecidedAt?: number
    firstSeenAt?: number
  }>
  legalEntityType: string
  registrationDate: number
  mostRecentPurpose?: string
  mostRecentRegisteredAddress?: {
    street?: string
    streetAddress?: string
    postalCode?: string
    city?: string
    countryCodeAlpha3?: string
  }
  isRegisteredForVAT?: boolean
  isRegisteredForFTax?: boolean
  isRegisteredForPayroll?: boolean
  activityStatus?: string
  cSector?: {
    categoryCode: number
    categoryCodeDescription: string
  }
  cOwnership?: {
    categoryCode: number
    categoryCodeDescription: string
  }
  cNbrEmployeesInterval?: {
    categoryCode: number
    categoryCodeDescription: string
  }
  cTurnoverInterval?: {
    categoryCode: number
    categoryCodeDescription: string
  }
  mostRecentFinancialSummary?: {
    periodStart: number
    periodEnd: number
    isAudited?: boolean
    rs_NetSalesK?: number
    rs_OperatingProfitOrLossK?: number
    bs_TotalAssetsK?: number
    fn_NumberOfEmployees?: number
    km_OperatingMargin?: number
    km_NetProfitMargin?: number
    km_EquityAssetsRatio?: number
  }
}

/** Bank account from /bank-accounts endpoint */
export interface TICBankAccount {
  bankAccountType?: number // 0=Unknown, 1=Bankgiro, 2=Plusgiro, 3=IBAN, etc.
  accountNumber?: string
  swift_BIC?: string
  firstSeenAtUtc?: string
  lastSeenAtUtc?: string
}

/** SNI code from /se/sni endpoint */
export interface TICSNICode {
  sni_2007Code?: string
  sni_2007Name?: string
  sni_2007Section?: string
  isPrimary?: boolean
}

/** Email address from /email-addresses endpoint */
export interface TICEmail {
  emailAddress?: string
  firstSeenAtUtc?: string
  lastSeenAtUtc?: string
}

/** Phone number from /phone-numbers endpoint */
export interface TICPhone {
  phoneNumber?: string
  firstSeenAtUtc?: string
  lastSeenAtUtc?: string
}

/** Company purpose from /purpose endpoint */
export interface TICCompanyPurpose {
  companyPurposeId?: number
  purpose?: string
  firstSeenAtUtc?: string
  lastUpdatedAtUtc?: string
}

/** Financial report summary from /financial-report-summaries endpoint */
export interface TICFinancialReportSummary {
  financialReportSummaryId?: number
  title?: string
  arrivalDate?: string
  registrationDate?: string
  periodStart?: string
  periodEnd?: string
  isInterimReport?: boolean
  isConsolidatedAccounts?: boolean
  isAudited?: boolean
  auditOpinion?: string
}

/** Normalized company profile for workspace display */
export interface TICCompanyProfile {
  companyId: number
  orgNumber: string
  companyName: string
  legalEntityType: string
  registrationDate: number
  activityStatus: string | null
  purpose: string | null
  address: { street: string | null; postalCode: string | null; city: string | null } | null
  registration: { fTax: boolean; vat: boolean; payroll: boolean }
  sector: { code: number; description: string } | null
  employeeRange: string | null
  turnoverRange: string | null
  email: string | null
  phone: string | null
  sniCodes: { code: string; name: string }[]
  bankAccounts: { type: string; accountNumber: string; bic: string | null }[]
  financials: {
    periodStart: number
    periodEnd: number
    netSalesK: number | null
    operatingProfitK: number | null
    totalAssetsK: number | null
    numberOfEmployees: number | null
    operatingMargin: number | null
    netProfitMargin: number | null
    equityAssetsRatio: number | null
  } | null
  financialReports: TICFinancialReportSummary[]
  fetchedAt: string
}

export class TICAPIError extends Error {
  constructor(
    message: string,
    public statusCode?: number,
    public code?: string
  ) {
    super(message)
    this.name = 'TICAPIError'
  }
}
