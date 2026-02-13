/**
 * Contract Analyzer using Claude AI
 *
 * Analyzes contract text and extracts structured data.
 */

import Anthropic from '@anthropic-ai/sdk'
import type {
  ContractExtractionResult,
  ConfidenceLevel,
  DeliverableType,
  PlatformType,
  BillingFrequency,
  DeadlineType,
  ReferenceEvent,
} from '@/types'

const anthropic = new Anthropic()

// Maximum retries for API calls
const MAX_RETRIES = 3
const RETRY_DELAY_MS = 1000

/**
 * Analyze contract PDF using Claude AI
 * Claude can read PDFs directly via document input
 */
export async function analyzeContract(pdfBase64: string): Promise<ContractExtractionResult> {
  const systemPrompt = `Du är en svensk avtalsexpert som analyserar influencer- och marknadsföringsavtal.
Din uppgift är att extrahera strukturerad information från avtalsdokument.

VIKTIGT:
- Extrahera endast information som faktiskt finns i avtalet
- Gissa inte på värden - använd null för saknade fält
- Organisationsnummer ska vara i formatet XXXXXX-XXXX
- Datum ska vara i ISO-format (YYYY-MM-DD)
- Belopp ska vara numeriska värden utan valutasymboler
- Ange konfidensnivå för varje huvudsektion: "high", "medium", "low", eller "missing"

Om avtalet är på engelska, extrahera ändå data och översätt kategorinamn till svenska.`

  const userPrompt = `Analysera det bifogade avtalsdokumentet (PDF) och extrahera strukturerad information.

Returnera ett JSON-objekt med följande struktur:

{
  "parties": {
    "brand": {
      "name": "Företagsnamn",
      "orgNumber": "XXXXXX-XXXX eller null",
      "email": "email eller null",
      "contactPerson": "namn eller null"
    },
    "agency": null eller samma struktur som brand
  },
  "financials": {
    "amount": numeriskt belopp eller null,
    "currency": "SEK" eller annan valutakod,
    "vatIncluded": true/false/null,
    "paymentTerms": antal dagar eller null,
    "billingFrequency": "upfront"/"on_delivery"/"monthly"/"split" eller null
  },
  "deliverables": [
    {
      "type": "video"/"image"/"story"/"reel"/"post"/"raw_material",
      "quantity": antal,
      "platform": "instagram"/"tiktok"/"youtube"/"blog"/"podcast"/"other" eller null,
      "account": "@kontonamn eller null",
      "dueDate": "YYYY-MM-DD" eller null,
      "description": "beskrivning eller null"
    }
  ],
  "period": {
    "startDate": "YYYY-MM-DD" eller null,
    "endDate": "YYYY-MM-DD" eller null,
    "publicationDate": "YYYY-MM-DD" eller null (specifikt publiceringsdatum om angivet),
    "draftDeadline": "YYYY-MM-DD" eller null (deadline för utkast/granskning om angivet)
  },
  "exclusivity": {
    "categories": ["Kategori1", "Kategori2"],
    "excludedBrands": ["Varumärke1", "Varumärke2"],
    "prePeriodDays": antal dagar före eller null,
    "postPeriodDays": antal dagar efter eller null,
    "postReference": "publication"/"delivery"/"approval"/"contract" eller null
  },

  EXKLUSIVITET - Sök specifikt efter:
  - Klausuler som "non-compete", "exclusivity", "competing brands", "exklusivitet", "konkurrensklausul", "konkurrerande varumärken"
  - Extrahera perioden i dagar. Konvertera veckor till dagar (1 vecka = 7 dagar, 4 veckor = 28 dagar)
  - Exempel: "No competing brands for 4 weeks after publication" → postPeriodDays: 28, postReference: "publication"
  - Kategorier kan vara: branschkategorier som "skönhet", "mode", "livsmedel", "teknik" etc.
  - excludedBrands: specifikt namngivna konkurrenter som nämns
  "deadlines": [
    {
      "description": "Beskrivning av deadline",
      "type": "delivery"/"approval"/"invoicing"/"report"/"revision"/"assets"/"spark_ad"/"statistics"/"other",
      "absoluteDate": "YYYY-MM-DD" eller null,
      "isRelative": true/false,
      "referenceEvent": "publication"/"delivery"/"approval"/"contract" eller null,
      "offsetDays": antal dagar relativt referenspunkt eller null
    }
  ],
  "rights": {
    "usageType": "organic"/"paid"/"both" eller null,
    "usagePeriodMonths": antal månader eller null,
    "ownership": "influencer"/"client" eller null
  },
  "campaignName": "Kampanjens namn om angivet" eller null,
  "signingDate": "YYYY-MM-DD" eller null,
  "confidence": {
    "parties": "high"/"medium"/"low"/"missing",
    "financials": "high"/"medium"/"low"/"missing",
    "deliverables": "high"/"medium"/"low"/"missing",
    "period": "high"/"medium"/"low"/"missing",
    "exclusivity": "high"/"medium"/"low"/"missing",
    "deadlines": "high"/"medium"/"low"/"missing",
    "rights": "high"/"medium"/"low"/"missing"
  }
}

Returnera ENDAST JSON-objektet, ingen annan text.`

  let lastError: Error | null = null

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const message = await anthropic.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 4096,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'document',
                source: {
                  type: 'base64',
                  media_type: 'application/pdf',
                  data: pdfBase64,
                },
              },
              {
                type: 'text',
                text: userPrompt,
              },
            ],
          },
        ],
        system: systemPrompt,
      })

      // Extract the text content
      const content = message.content[0]
      if (content.type !== 'text') {
        throw new Error('Unexpected response type from AI')
      }

      // Parse the JSON response - strip markdown code blocks if present
      let jsonText = content.text.trim()

      // Remove markdown code blocks if Claude wrapped the response
      if (jsonText.startsWith('```json')) {
        jsonText = jsonText.slice(7) // Remove ```json
      } else if (jsonText.startsWith('```')) {
        jsonText = jsonText.slice(3) // Remove ```
      }
      if (jsonText.endsWith('```')) {
        jsonText = jsonText.slice(0, -3) // Remove trailing ```
      }
      jsonText = jsonText.trim()

      const parsed = JSON.parse(jsonText)

      // Validate and clean the result
      return validateAndCleanResult(parsed)
    } catch (error) {
      lastError = error instanceof Error ? error : new Error('Unknown error')

      // Don't retry on JSON parse errors - the response format is wrong
      if (error instanceof SyntaxError) {
        throw new Error(`Failed to parse AI response: ${lastError.message}`)
      }

      // Wait before retrying
      if (attempt < MAX_RETRIES - 1) {
        await sleep(RETRY_DELAY_MS * (attempt + 1))
      }
    }
  }

  throw new Error(`Contract analysis failed after ${MAX_RETRIES} attempts: ${lastError?.message}`)
}

/**
 * Validate and clean the extraction result
 */
function validateAndCleanResult(raw: unknown): ContractExtractionResult {
  // Type guard
  if (!raw || typeof raw !== 'object') {
    throw new Error('Invalid extraction result: not an object')
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data = raw as any

  // Extract nested objects safely
  const parties = data.parties || {}
  const financials = data.financials || {}
  const period = data.period || {}
  const exclusivity = data.exclusivity || {}
  const rights = data.rights || {}

  // Build validated result with defaults
  const result: ContractExtractionResult = {
    parties: {
      brand: validateParty(parties.brand),
      agency: validateParty(parties.agency),
    },
    financials: {
      amount: validateNumber(financials.amount),
      currency: validateString(financials.currency) || 'SEK',
      vatIncluded: validateBoolean(financials.vatIncluded),
      paymentTerms: validateNumber(financials.paymentTerms),
      billingFrequency: validateEnum<BillingFrequency>(
        financials.billingFrequency,
        ['upfront', 'on_delivery', 'monthly', 'split']
      ),
    },
    deliverables: validateDeliverables(data.deliverables),
    period: {
      startDate: validateDate(period.startDate),
      endDate: validateDate(period.endDate),
      publicationDate: validateDate(period.publicationDate),
      draftDeadline: validateDate(period.draftDeadline),
    },
    exclusivity: {
      categories: validateStringArray(exclusivity.categories),
      excludedBrands: validateStringArray(exclusivity.excludedBrands),
      prePeriodDays: validateNumber(exclusivity.prePeriodDays),
      postPeriodDays: validateNumber(exclusivity.postPeriodDays),
      postReference: validateEnum<ReferenceEvent>(
        exclusivity.postReference,
        ['publication', 'delivery', 'approval', 'contract']
      ),
    },
    deadlines: validateDeadlines(data.deadlines),
    rights: {
      usageType: validateEnum<'organic' | 'paid' | 'both'>(
        rights.usageType,
        ['organic', 'paid', 'both']
      ),
      usagePeriodMonths: validateNumber(rights.usagePeriodMonths),
      ownership: validateEnum<'influencer' | 'client'>(
        rights.ownership,
        ['influencer', 'client']
      ),
    },
    campaignName: validateString(data.campaignName),
    signingDate: validateDate(data.signingDate),
    confidence: validateConfidence(data.confidence),
  }

  return result
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function validateParty(data: any): import('@/types').ExtractedParty | null {
  if (!data || typeof data !== 'object') return null
  if (!data.name) return null

  return {
    name: String(data.name),
    orgNumber: validateOrgNumber(data.orgNumber),
    email: validateEmail(data.email),
    contactPerson: validateString(data.contactPerson),
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function validateDeliverables(data: any): import('@/types').ExtractedDeliverable[] {
  if (!Array.isArray(data)) return []

  return data
    .filter((item) => item && typeof item === 'object')
    .map((item) => ({
      type: validateEnum<DeliverableType>(
        item.type,
        ['video', 'image', 'story', 'reel', 'post', 'raw_material']
      ) || 'post',
      quantity: validateNumber(item.quantity) || 1,
      platform: validateEnum<PlatformType>(
        item.platform,
        ['instagram', 'tiktok', 'youtube', 'blog', 'podcast', 'other']
      ),
      account: validateString(item.account),
      dueDate: validateDate(item.dueDate),
      description: validateString(item.description),
    }))
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function validateDeadlines(data: any): import('@/types').ExtractedDeadline[] {
  if (!Array.isArray(data)) return []

  return data
    .filter((item) => item && typeof item === 'object' && item.description)
    .map((item) => ({
      description: String(item.description),
      type: validateEnum<DeadlineType>(
        item.type,
        ['delivery', 'approval', 'invoicing', 'report', 'revision', 'assets', 'spark_ad', 'statistics', 'other']
      ) || 'other',
      absoluteDate: validateDate(item.absoluteDate),
      isRelative: Boolean(item.isRelative),
      referenceEvent: validateEnum<ReferenceEvent>(
        item.referenceEvent,
        ['publication', 'delivery', 'approval', 'contract']
      ),
      offsetDays: validateNumber(item.offsetDays),
    }))
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function validateConfidence(data: any): Record<string, ConfidenceLevel> {
  const defaultConfidence: Record<string, ConfidenceLevel> = {
    parties: 'missing',
    financials: 'missing',
    deliverables: 'missing',
    period: 'missing',
    exclusivity: 'missing',
    deadlines: 'missing',
    rights: 'missing',
  }

  if (!data || typeof data !== 'object') return defaultConfidence

  const levels: ConfidenceLevel[] = ['high', 'medium', 'low', 'missing']

  for (const key of Object.keys(defaultConfidence)) {
    if (data[key] && levels.includes(data[key])) {
      defaultConfidence[key] = data[key]
    }
  }

  return defaultConfidence
}

function validateString(value: unknown): string | null {
  if (typeof value === 'string' && value.trim()) {
    return value.trim()
  }
  return null
}

function validateNumber(value: unknown): number | null {
  if (typeof value === 'number' && !isNaN(value)) {
    return value
  }
  if (typeof value === 'string') {
    const parsed = parseFloat(value.replace(/[^\d.-]/g, ''))
    if (!isNaN(parsed)) {
      return parsed
    }
  }
  return null
}

function validateBoolean(value: unknown): boolean | null {
  if (typeof value === 'boolean') return value
  return null
}

function validateDate(value: unknown): string | null {
  if (typeof value !== 'string') return null

  // Try parsing as ISO date
  const date = new Date(value)
  if (isNaN(date.getTime())) return null

  // Return as YYYY-MM-DD
  return date.toISOString().split('T')[0]
}

function validateEmail(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const email = value.trim().toLowerCase()
  // Basic email validation
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return email
  }
  return null
}

function validateOrgNumber(value: unknown): string | null {
  if (typeof value !== 'string') return null

  // Remove all non-digits
  const digits = value.replace(/\D/g, '')

  // Swedish org numbers are 10 digits
  if (digits.length === 10) {
    return `${digits.slice(0, 6)}-${digits.slice(6)}`
  }

  return null
}

function validateStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value
    .filter((item) => typeof item === 'string' && item.trim())
    .map((item) => String(item).trim())
}

function validateEnum<T extends string>(value: unknown, allowed: T[]): T | null {
  if (typeof value === 'string' && allowed.includes(value as T)) {
    return value as T
  }
  return null
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
