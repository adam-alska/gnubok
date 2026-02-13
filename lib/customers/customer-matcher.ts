/**
 * Customer Matcher
 *
 * Fuzzy matching of extracted parties to existing customers.
 */

import Fuse, { IFuseOptions } from 'fuse.js'
import type {
  Customer,
  ExtractedParty,
  CustomerMatchResult,
  CreateCustomerInput,
  CustomerType,
} from '@/types'

// Fuse.js configuration for fuzzy name matching
const FUSE_OPTIONS: IFuseOptions<Customer> = {
  keys: ['name'],
  threshold: 0.3, // Lower = stricter matching
  includeScore: true,
  minMatchCharLength: 3,
}

/**
 * Match an extracted party to existing customers
 */
export function matchCustomer(
  extractedParty: ExtractedParty,
  customers: Customer[]
): CustomerMatchResult {
  // Try exact org number match first
  if (extractedParty.orgNumber) {
    const normalizedOrgNumber = normalizeOrgNumber(extractedParty.orgNumber)
    const exactMatch = customers.find(
      (c) => c.org_number && normalizeOrgNumber(c.org_number) === normalizedOrgNumber
    )

    if (exactMatch) {
      return {
        matchType: 'exact',
        customer: exactMatch,
        confidence: 1.0,
        matchedOn: ['org_number'],
      }
    }
  }

  // Try email domain match
  if (extractedParty.email) {
    const domain = extractEmailDomain(extractedParty.email)
    if (domain) {
      const emailMatch = customers.find((c) => {
        if (!c.email) return false
        return extractEmailDomain(c.email) === domain
      })

      if (emailMatch) {
        return {
          matchType: 'probable',
          customer: emailMatch,
          confidence: 0.8,
          matchedOn: ['email'],
        }
      }
    }
  }

  // Try fuzzy name match
  if (extractedParty.name && customers.length > 0) {
    const fuse = new Fuse(customers, FUSE_OPTIONS)
    const results = fuse.search(extractedParty.name)

    if (results.length > 0) {
      const bestMatch = results[0]
      const score = bestMatch.score ?? 1
      const confidence = 1 - score // Fuse score is inverse

      if (confidence >= 0.7) {
        return {
          matchType: 'probable',
          customer: bestMatch.item,
          confidence,
          matchedOn: ['name'],
        }
      }
    }
  }

  // No match found - suggest creating new customer
  return {
    matchType: 'none',
    customer: null,
    confidence: 0,
    matchedOn: [],
    suggestedNewCustomer: createSuggestedCustomer(extractedParty),
  }
}

/**
 * Match both brand and agency from extraction
 */
export function matchParties(
  brandParty: ExtractedParty | null,
  agencyParty: ExtractedParty | null,
  customers: Customer[]
): {
  brandMatch: CustomerMatchResult | null
  agencyMatch: CustomerMatchResult | null
} {
  return {
    brandMatch: brandParty ? matchCustomer(brandParty, customers) : null,
    agencyMatch: agencyParty ? matchCustomer(agencyParty, customers) : null,
  }
}

/**
 * Create a suggested customer input from extracted party
 */
function createSuggestedCustomer(party: ExtractedParty): Partial<CreateCustomerInput> {
  const suggested: Partial<CreateCustomerInput> = {
    name: party.name,
    customer_type: determineCustomerType(party),
  }

  if (party.orgNumber) {
    suggested.org_number = party.orgNumber
  }

  if (party.email) {
    suggested.email = party.email
  }

  // Default to Sweden for Swedish org numbers
  if (party.orgNumber) {
    suggested.country = 'Sweden'
  }

  return suggested
}

/**
 * Determine customer type based on party info
 */
function determineCustomerType(party: ExtractedParty): CustomerType {
  // Swedish org numbers indicate Swedish business
  if (party.orgNumber) {
    return 'swedish_business'
  }

  // Without org number, default to individual
  return 'individual'
}

/**
 * Normalize org number for comparison
 */
function normalizeOrgNumber(orgNumber: string): string {
  // Remove all non-digits and return
  return orgNumber.replace(/\D/g, '')
}

/**
 * Extract email domain
 */
function extractEmailDomain(email: string): string | null {
  const match = email.toLowerCase().match(/@([^@]+)$/)
  if (match) {
    const domain = match[1]
    // Ignore generic email providers
    const genericDomains = [
      'gmail.com',
      'hotmail.com',
      'outlook.com',
      'yahoo.com',
      'icloud.com',
      'live.com',
      'me.com',
    ]
    if (!genericDomains.includes(domain)) {
      return domain
    }
  }
  return null
}

/**
 * Calculate overall match quality
 */
export function calculateMatchQuality(match: CustomerMatchResult): 'excellent' | 'good' | 'poor' | 'none' {
  if (match.matchType === 'exact') {
    return 'excellent'
  }

  if (match.matchType === 'probable') {
    if (match.confidence >= 0.9) return 'excellent'
    if (match.confidence >= 0.7) return 'good'
    return 'poor'
  }

  return 'none'
}

/**
 * Check if two customers might be the same
 */
export function areLikelySameCustomer(a: Customer, b: Customer): boolean {
  // Same org number
  if (a.org_number && b.org_number) {
    if (normalizeOrgNumber(a.org_number) === normalizeOrgNumber(b.org_number)) {
      return true
    }
  }

  // Same email domain (non-generic)
  if (a.email && b.email) {
    const domainA = extractEmailDomain(a.email)
    const domainB = extractEmailDomain(b.email)
    if (domainA && domainB && domainA === domainB) {
      return true
    }
  }

  // Fuzzy name match
  const fuse = new Fuse([a], { ...FUSE_OPTIONS, threshold: 0.2 })
  const results = fuse.search(b.name)
  if (results.length > 0 && results[0].score !== undefined && results[0].score < 0.2) {
    return true
  }

  return false
}
