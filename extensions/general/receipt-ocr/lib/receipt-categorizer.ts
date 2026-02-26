/**
 * Receipt Categorizer - Auto-categorization of receipt line items
 *
 * Maps line item descriptions to BAS accounts and expense categories
 * using pattern matching and AI-suggested categories.
 */

import type { TransactionCategory, ReceiptLineItem, ExtractedLineItem } from '@/types'
import { getTemplateById } from '@/lib/bookkeeping/booking-templates'

// Category mappings from suggested category to TransactionCategory
const CATEGORY_MAPPING: Record<string, TransactionCategory> = {
  equipment: 'expense_equipment',
  software: 'expense_software',
  travel: 'expense_travel',
  office: 'expense_office',
  marketing: 'expense_marketing',
  professional_services: 'expense_professional_services',
  education: 'expense_education',
  other: 'expense_other',
}

// BAS account mappings for expense categories
const BAS_ACCOUNT_MAPPING: Record<TransactionCategory, string> = {
  expense_equipment: '5410', // Förbrukningsinventarier
  expense_software: '5420', // Programvaror
  expense_travel: '5800', // Resekostnader
  expense_office: '5010', // Lokalhyra / Kontorsmaterial
  expense_marketing: '5910', // Annonsering
  expense_professional_services: '6530', // Redovisningstjänster
  expense_education: '6991', // Övriga avdragsgilla kostnader
  expense_representation: '6071', // Representation
  expense_consumables: '5460', // Förbrukningsvaror
  expense_vehicle: '5611', // Drivmedel bil
  expense_telecom: '6200', // Telefon och internet
  expense_bank_fees: '6570', // Bankavgifter
  expense_card_fees: '6570', // Kortavgifter
  expense_currency_exchange: '7960', // Valutakursförluster
  expense_other: '6991', // Övriga avdragsgilla kostnader
  // Non-expense categories (for completeness)
  income_services: '3001',
  income_products: '3001',
  income_other: '3900',
  private: '2013',
  uncategorized: '6991',
}

// Keyword patterns for auto-categorization
const CATEGORY_PATTERNS: Array<{
  category: TransactionCategory
  patterns: RegExp[]
}> = [
  {
    category: 'expense_equipment',
    patterns: [
      /\b(dator|laptop|macbook|ipad|tablet|telefon|iphone|samsung|kamera|camera|mikrofon|microphone|belysning|lighting|stativ|tripod|usb|kabel|adapter|hörlurar|headphones|airpods)\b/i,
      /\b(apple|logitech|sony|canon|nikon|rode|elgato|razer)\b/i,
    ],
  },
  {
    category: 'expense_software',
    patterns: [
      /\b(adobe|microsoft|spotify|netflix|youtube premium|dropbox|google|icloud|canva|notion|slack|zoom|teams|subscription|prenumeration|licens|license)\b/i,
      /\b(app|program|software|saas|cloud)\b/i,
    ],
  },
  {
    category: 'expense_travel',
    patterns: [
      /\b(flyg|flight|hotell|hotel|taxi|uber|bolt|tåg|train|sj|arlanda|bromma|landvetter|bensin|fuel|parkering|parking|biljett|ticket)\b/i,
      /\b(resa|travel|transport|resekostnad)\b/i,
    ],
  },
  {
    category: 'expense_office',
    patterns: [
      /\b(hyra|rent|el|electricity|internet|bredband|vatten|försäkring|insurance|städning|cleaning|kontorsmaterial|papper|toner|skrivare|printer)\b/i,
      /\b(ikea|clas ohlson|biltema|staples|lyreco)\b/i,
    ],
  },
  {
    category: 'expense_marketing',
    patterns: [
      /\b(reklam|advertising|annons|ad|meta ads|facebook ads|instagram ads|google ads|tiktok ads|influencer|sponsor|kampanj|campaign|pr|press)\b/i,
      /\b(marknadsföring|marketing|promotion)\b/i,
    ],
  },
  {
    category: 'expense_professional_services',
    patterns: [
      /\b(konsult|consultant|redovisning|accounting|bokföring|bookkeeping|juridik|legal|advokat|lawyer|revisor|auditor)\b/i,
      /\b(tjänst|service|arvode|fee)\b/i,
    ],
  },
  {
    category: 'expense_education',
    patterns: [
      /\b(kurs|course|utbildning|training|bok|book|seminar|konferens|conference|workshop|webinar|certifiering|certification)\b/i,
      /\b(lärande|learning|studie|study)\b/i,
    ],
  },
]

/**
 * Get the TransactionCategory from AI-suggested category
 */
export function mapSuggestedCategory(suggestedCategory: string | null): TransactionCategory | null {
  if (!suggestedCategory) return null
  return CATEGORY_MAPPING[suggestedCategory] || null
}

/**
 * Map a booking template ID to a TransactionCategory.
 * Falls back to the template's `fallback_category` field.
 */
export function mapTemplateIdToCategory(templateId: string | null | undefined): TransactionCategory | null {
  if (!templateId) return null
  const template = getTemplateById(templateId)
  return template?.fallback_category ?? null
}

/**
 * Get BAS account for a category
 */
export function getBASAccount(category: TransactionCategory): string {
  return BAS_ACCOUNT_MAPPING[category] || '6991'
}

/**
 * Auto-categorize a line item based on description
 */
export function categorizeLineItem(description: string): {
  category: TransactionCategory | null
  confidence: number
} {
  const normalizedDescription = description.toLowerCase()

  for (const { category, patterns } of CATEGORY_PATTERNS) {
    for (const pattern of patterns) {
      if (pattern.test(normalizedDescription)) {
        return {
          category,
          confidence: 0.7, // Pattern-based confidence
        }
      }
    }
  }

  return {
    category: null,
    confidence: 0,
  }
}

/**
 * Process extracted line items and add category suggestions
 */
export function processLineItems(
  lineItems: ExtractedLineItem[]
): Array<ExtractedLineItem & { category: TransactionCategory | null; basAccount: string | null }> {
  return lineItems.map((item) => {
    // First try the AI-suggested template ID
    let category = mapTemplateIdToCategory(item.suggestedTemplateId)
    let confidence = category ? (item.confidence || 0.85) : 0

    // Then try the AI-suggested category
    if (!category) {
      category = mapSuggestedCategory(item.suggestedCategory)
      confidence = item.confidence || 0.8
    }

    // If no AI suggestion, try pattern matching
    if (!category) {
      const patternResult = categorizeLineItem(item.description)
      category = patternResult.category
      confidence = patternResult.confidence
    }

    return {
      ...item,
      category,
      basAccount: category ? getBASAccount(category) : null,
      confidence,
    }
  })
}

/**
 * Calculate split amounts for mixed business/private receipt
 */
export function calculateReceiptSplit(
  lineItems: Array<{ lineTotal: number; is_business: boolean | null }>
): {
  businessTotal: number
  privateTotal: number
  unclassifiedTotal: number
  businessPercentage: number
} {
  let businessTotal = 0
  let privateTotal = 0
  let unclassifiedTotal = 0

  for (const item of lineItems) {
    if (item.is_business === true) {
      businessTotal += item.lineTotal
    } else if (item.is_business === false) {
      privateTotal += item.lineTotal
    } else {
      unclassifiedTotal += item.lineTotal
    }
  }

  const total = businessTotal + privateTotal + unclassifiedTotal
  const businessPercentage = total > 0 ? (businessTotal / total) * 100 : 0

  return {
    businessTotal: Math.round(businessTotal * 100) / 100,
    privateTotal: Math.round(privateTotal * 100) / 100,
    unclassifiedTotal: Math.round(unclassifiedTotal * 100) / 100,
    businessPercentage: Math.round(businessPercentage * 10) / 10,
  }
}

/**
 * Aggregate line items by category for summary display
 */
export function aggregateByCategory(
  lineItems: Array<{ lineTotal: number; category: TransactionCategory | null; is_business: boolean | null }>
): Array<{ category: TransactionCategory | null; total: number; count: number }> {
  const aggregation = new Map<TransactionCategory | null, { total: number; count: number }>()

  for (const item of lineItems) {
    // Only aggregate business items
    if (item.is_business !== true) continue

    const existing = aggregation.get(item.category) || { total: 0, count: 0 }
    aggregation.set(item.category, {
      total: existing.total + item.lineTotal,
      count: existing.count + 1,
    })
  }

  return Array.from(aggregation.entries())
    .map(([category, data]) => ({
      category,
      total: Math.round(data.total * 100) / 100,
      count: data.count,
    }))
    .sort((a, b) => b.total - a.total)
}

/**
 * Generate default line item classifications based on receipt flags
 */
export function getDefaultClassification(
  isRestaurant: boolean,
  isSystembolaget: boolean
): {
  defaultIsBusiness: boolean | null
  requiresReview: boolean
  warningMessage: string | null
} {
  if (isSystembolaget) {
    return {
      defaultIsBusiness: false, // Default to private for Systembolaget
      requiresReview: true,
      warningMessage: 'Alkohol från Systembolaget är normalt en privat utgift. Om det är representation, ange syfte och antal personer.',
    }
  }

  if (isRestaurant) {
    return {
      defaultIsBusiness: null, // Need user input
      requiresReview: true,
      warningMessage: 'Restaurangbesök kräver uppgift om antal personer och syfte för att räknas som representation.',
    }
  }

  return {
    defaultIsBusiness: true, // Default to business for normal receipts
    requiresReview: false,
    warningMessage: null,
  }
}

/**
 * Category labels in Swedish
 */
export const CATEGORY_LABELS: Record<TransactionCategory, string> = {
  expense_equipment: 'Utrustning',
  expense_software: 'Programvara',
  expense_travel: 'Resa',
  expense_office: 'Kontor',
  expense_marketing: 'Marknadsföring',
  expense_professional_services: 'Konsulttjänster',
  expense_education: 'Utbildning',
  expense_representation: 'Representation',
  expense_consumables: 'Material',
  expense_vehicle: 'Bil & drivmedel',
  expense_telecom: 'Telefon & internet',
  expense_bank_fees: 'Bankavgift',
  expense_card_fees: 'Kortavgift',
  expense_currency_exchange: 'Valutaväxling',
  expense_other: 'Övrigt',
  income_services: 'Tjänsteintäkt',
  income_products: 'Varuintäkt',
  income_other: 'Övrig intäkt',
  private: 'Privat',
  uncategorized: 'Ej bokförd',
}

/**
 * Get expense categories only (for dropdown)
 */
export function getExpenseCategories(): Array<{ value: TransactionCategory; label: string }> {
  return Object.entries(CATEGORY_LABELS)
    .filter(([key]) => key.startsWith('expense_'))
    .map(([value, label]) => ({
      value: value as TransactionCategory,
      label,
    }))
}
