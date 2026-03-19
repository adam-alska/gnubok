/**
 * Generic company lookup result — provider-agnostic.
 * Defined in core so onboarding components can import it without
 * violating the CI constraint (no core → @/extensions/ imports).
 */
export interface CompanyLookupResult {
  companyName: string
  isCeased: boolean
  address: { street: string | null; postalCode: string | null; city: string | null } | null
  registration: { fTax: boolean; vat: boolean }
  bankAccounts: { type: string; accountNumber: string; bic: string | null }[]
  email: string | null
  phone: string | null
  sniCodes: { code: string; name: string }[]
}
