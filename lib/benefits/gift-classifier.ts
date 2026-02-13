/**
 * Gift Classifier (Förmånshantering)
 * Classifies gifts/benefits according to Swedish tax rules (Skatteverket guidelines)
 *
 * Key rules:
 * 1. Simple promo items ≤450 SEK without motprestation = tax free
 * 2. Motprestation exists = always taxable
 *    - Business-only use = deductible as expense
 *    - Private use = not deductible
 * 3. >450 SEK + private use = taxable, not deductible
 */

import type { GiftInput, GiftClassification, GiftBookingType } from '@/types'

// Skatteverket's threshold for tax-free promotional items
export const TAX_FREE_PROMO_THRESHOLD = 450 // SEK

// BAS account mappings for gift bookkeeping
export const GIFT_ACCOUNTS = {
  // Taxable gift income
  income: {
    account: '3900',
    name: 'Övriga rörelseintäkter',
  },
  // Deductible equipment (business use only)
  equipment_expense: {
    account: '5400',
    name: 'Förbrukningsinventarier',
  },
  // Deductible props/materials (business use only)
  props_expense: {
    account: '5460',
    name: 'Förbrukningsmaterial/Rekvisita',
  },
}

/**
 * Classify a gift according to Swedish tax rules
 * Implements the decision tree from 07-FUTURE-FEATURES.md
 */
export function classifyGift(input: GiftInput): GiftClassification {
  const { estimatedValue, hasMotprestation, usedInBusiness, usedPrivately, isSimplePromoItem } = input

  // Rule 1: Simple promotional items under threshold = tax free
  // Condition: Simple promo item AND value ≤ 450 SEK AND no motprestation required
  if (isSimplePromoItem && estimatedValue <= TAX_FREE_PROMO_THRESHOLD && !hasMotprestation) {
    return {
      taxable: false,
      marketValue: estimatedValue,
      deductibleAsExpense: false,
      bookingType: 'tax_free',
      reasoning: 'Enklare reklamgåva under 450 kr utan krav på motprestation',
      vatLiable: false,
      vatAmount: 0,
      valueExclVat: estimatedValue,
      neIncomeRuta: null,
      neExpenseRuta: null,
    }
  }

  // Rule 2: Motprestation exists = always taxable WITH VAT (bytestransaktion)
  // When influencer was required to post/mention/review the product
  if (hasMotprestation) {
    // Bytestransaktion: moms ska redovisas, värdet anses vara inkl moms
    const valueExclVat = estimatedValue / 1.25
    const vatAmount = estimatedValue - valueExclVat

    // 2a: Business-only use = taxable but deductible
    if (usedInBusiness && !usedPrivately) {
      return {
        taxable: true,
        marketValue: estimatedValue,
        deductibleAsExpense: true,
        bookingType: 'income_and_expense',
        reasoning:
          'Skattepliktig förmån (motprestation krävdes). Avdragsgill som rekvisita då den endast används i verksamheten. Moms redovisas (bytestransaktion).',
        vatLiable: true,
        vatAmount: Math.round(vatAmount * 100) / 100,
        valueExclVat: Math.round(valueExclVat * 100) / 100,
        neIncomeRuta: 'R1',  // Momspliktig → R1
        neExpenseRuta: 'R6', // Avdragsgill → R6
      }
    }

    // 2b: Private use = taxable but NOT deductible
    return {
      taxable: true,
      marketValue: estimatedValue,
      deductibleAsExpense: false,
      bookingType: 'income',
      reasoning: 'Skattepliktig förmån (motprestation krävdes). Ej avdragsgill då produkten används privat. Moms redovisas (bytestransaktion).',
      vatLiable: true,
      vatAmount: Math.round(vatAmount * 100) / 100,
      valueExclVat: Math.round(valueExclVat * 100) / 100,
      neIncomeRuta: 'R1',  // Momspliktig → R1
      neExpenseRuta: null,
    }
  }

  // Rule 3: High value without motprestation but used privately
  // No explicit agreement but value exceeds promotional threshold
  // Ingen motprestation = ingen moms (inte bytestransaktion)
  if (estimatedValue > TAX_FREE_PROMO_THRESHOLD && usedPrivately) {
    return {
      taxable: true,
      marketValue: estimatedValue,
      deductibleAsExpense: false,
      bookingType: 'income',
      reasoning: 'Värdet överstiger gränsen för skattefria reklamgåvor och produkten används privat. Ingen moms (ej motprestation).',
      vatLiable: false,
      vatAmount: 0,
      valueExclVat: estimatedValue,
      neIncomeRuta: 'R2',  // Momsfri → R2
      neExpenseRuta: null,
    }
  }

  // Rule 4: High value, business use only, no motprestation
  // This is a grey area - generally taxable but deductible if used in business
  // Ingen motprestation = ingen moms (inte bytestransaktion)
  if (estimatedValue > TAX_FREE_PROMO_THRESHOLD && usedInBusiness && !usedPrivately) {
    return {
      taxable: true,
      marketValue: estimatedValue,
      deductibleAsExpense: true,
      bookingType: 'income_and_expense',
      reasoning:
        'Värdet överstiger gränsen för skattefria reklamgåvor. Avdragsgill då produkten endast används i verksamheten. Ingen moms (ej motprestation).',
      vatLiable: false,
      vatAmount: 0,
      valueExclVat: estimatedValue,
      neIncomeRuta: 'R2',   // Momsfri → R2
      neExpenseRuta: 'R6',  // Avdragsgill → R6
    }
  }

  // Default: Value-based classification
  const isTaxable = estimatedValue > TAX_FREE_PROMO_THRESHOLD
  const isDeductible = usedInBusiness && !usedPrivately
  const bookingType: GiftBookingType = isTaxable
    ? (isDeductible ? 'income_and_expense' : 'income')
    : 'tax_free'

  return {
    taxable: isTaxable,
    marketValue: estimatedValue,
    deductibleAsExpense: isDeductible,
    bookingType,
    reasoning: 'Klassificering baserad på värde och användning',
    vatLiable: false,
    vatAmount: 0,
    valueExclVat: estimatedValue,
    neIncomeRuta: isTaxable ? 'R2' : null,       // Momsfri om skattepliktig → R2
    neExpenseRuta: isDeductible ? 'R6' : null,  // Avdragsgill → R6
  }
}

/**
 * Validate a gift input before classification
 */
export function validateGiftInput(input: Partial<GiftInput>): { valid: boolean; errors: string[] } {
  const errors: string[] = []

  if (input.estimatedValue === undefined || input.estimatedValue === null) {
    errors.push('Uppskattat värde krävs')
  } else if (input.estimatedValue < 0) {
    errors.push('Värdet kan inte vara negativt')
  } else if (input.estimatedValue > 10000000) {
    errors.push('Orimligt högt värde')
  }

  if (input.hasMotprestation === undefined) {
    errors.push('Ange om motprestation krävdes')
  }

  if (input.usedInBusiness === undefined) {
    errors.push('Ange om produkten används i verksamheten')
  }

  if (input.usedPrivately === undefined) {
    errors.push('Ange om produkten används privat')
  }

  return {
    valid: errors.length === 0,
    errors,
  }
}

/**
 * Get display text for booking type
 */
export function getBookingTypeDisplayText(bookingType: GiftBookingType): string {
  switch (bookingType) {
    case 'tax_free':
      return 'Skattefri'
    case 'income':
      return 'Skattepliktig intäkt'
    case 'income_and_expense':
      return 'Skattepliktig intäkt + avdragsgill kostnad'
    default:
      return 'Okänd'
  }
}

/**
 * Calculate tax impact of a gift
 * For EF: Uses egenavgifter rate (28.97%) + estimated marginal income tax
 * For AB: Uses corporate tax rate (20.6%)
 * For Light: Uses municipal tax rate only (no egenavgifter, umbrella pays)
 */
export function calculateGiftTaxImpact(
  classification: GiftClassification,
  entityType: 'enskild_firma' | 'aktiebolag' | 'light',
  marginalTaxRate: number = 0.32 // Default Swedish municipal tax
): {
  taxableAmount: number
  estimatedTax: number
  netCost: number
} {
  if (!classification.taxable) {
    return {
      taxableAmount: 0,
      estimatedTax: 0,
      netCost: 0,
    }
  }

  const taxableAmount = classification.marketValue
  let estimatedTax: number

  if (entityType === 'light') {
    // Light: No egenavgifter (umbrella pays arbetsgivaravgifter)
    // Just municipal tax + church tax on the gift value
    estimatedTax = taxableAmount * marginalTaxRate
  } else if (entityType === 'enskild_firma') {
    // EF: Egenavgifter (28.97%) + income tax on reduced amount
    const egenavgifterRate = 0.2897
    const incomeAfterEgenavgifter = taxableAmount * (1 - egenavgifterRate)
    estimatedTax = taxableAmount * egenavgifterRate + incomeAfterEgenavgifter * marginalTaxRate
  } else {
    // AB: Corporate tax (20.6%)
    estimatedTax = taxableAmount * 0.206
  }

  // If deductible, the expense offsets some of the income tax
  let netCost = estimatedTax
  if (classification.deductibleAsExpense) {
    const deductionTaxSavings = entityType === 'enskild_firma'
      ? taxableAmount * marginalTaxRate
      : entityType === 'light'
        ? taxableAmount * marginalTaxRate
        : taxableAmount * 0.206
    netCost = estimatedTax - deductionTaxSavings
  }

  return {
    taxableAmount,
    estimatedTax: Math.round(estimatedTax),
    netCost: Math.round(Math.max(0, netCost)),
  }
}

/**
 * Classify a gift with entity-type-aware overrides
 * Light mode: no VAT, no NE-bilaga, deductibleAsExpense always false
 */
export function classifyGiftForEntity(
  input: GiftInput,
  entityType: 'enskild_firma' | 'aktiebolag' | 'light'
): GiftClassification {
  const classification = classifyGift(input)

  if (entityType === 'light') {
    return {
      ...classification,
      vatLiable: false,
      vatAmount: 0,
      valueExclVat: classification.marketValue,
      neIncomeRuta: null,
      neExpenseRuta: null,
      deductibleAsExpense: false,
      bookingType: classification.taxable ? 'income' : 'tax_free',
      reasoning: classification.taxable
        ? `Skattepliktig förmån. Skatten (kommunalskatt) betalas via din deklaration, inte av egenanställningsföretaget.${classification.reasoning ? ' ' + classification.reasoning : ''}`
        : classification.reasoning,
    }
  }

  return classification
}
