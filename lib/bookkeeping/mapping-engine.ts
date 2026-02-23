import { createClient } from '@/lib/supabase/server'
import {
  generateInputVatLine,
  generateReverseChargeLines,
  extractNetAmount,
  extractVatAmount,
} from './vat-entries'
import type {
  MappingRule,
  MappingResult,
  RiskLevel,
  Transaction,
  VatJournalLine,
} from '@/types'

// Capitalization threshold in SEK (half-year rule: 29,400 for 2024)
const CAPITALIZATION_THRESHOLD = 29400

/**
 * Evaluate all mapping rules against a transaction and return the best match
 *
 * Evaluation order (by priority):
 * 1. User override rules (priority 1-49)
 * 2. MCC code rules (priority 50-69)
 * 3. Merchant name pattern rules (priority 70-89)
 * 4. Amount threshold rules (priority 90-99)
 * 5. Risk fallback (priority 100) → 2013 (private)
 */
export async function evaluateMappingRules(
  userId: string,
  transaction: Transaction
): Promise<MappingResult> {
  const supabase = await createClient()

  // Fetch all active rules (user-specific + system defaults), ordered by priority
  const { data: rules, error } = await supabase
    .from('mapping_rules')
    .select('*')
    .eq('is_active', true)
    .or(`user_id.eq.${userId},user_id.is.null`)
    .order('priority', { ascending: true })

  if (error || !rules || rules.length === 0) {
    return getDefaultResult(transaction)
  }

  // Evaluate each rule in priority order
  for (const rule of rules as MappingRule[]) {
    if (matchesRule(rule, transaction)) {
      return buildResult(rule, transaction)
    }
  }

  return getDefaultResult(transaction)
}

/**
 * Check if a transaction matches a mapping rule
 */
function matchesRule(rule: MappingRule, transaction: Transaction): boolean {
  // MCC code matching
  if (rule.mcc_codes && rule.mcc_codes.length > 0) {
    if (!transaction.mcc_code || !rule.mcc_codes.includes(transaction.mcc_code)) {
      return false
    }
  }

  // Merchant name pattern matching (case-insensitive)
  if (rule.merchant_pattern) {
    const merchantName = transaction.merchant_name || transaction.description || ''
    try {
      const regex = new RegExp(rule.merchant_pattern, 'i')
      if (!regex.test(merchantName)) {
        return false
      }
    } catch {
      // Invalid regex, try simple includes
      if (!merchantName.toLowerCase().includes(rule.merchant_pattern.toLowerCase())) {
        return false
      }
    }
  }

  // Description pattern matching
  if (rule.description_pattern) {
    try {
      const regex = new RegExp(rule.description_pattern, 'i')
      if (!regex.test(transaction.description)) {
        return false
      }
    } catch {
      if (!transaction.description.toLowerCase().includes(rule.description_pattern.toLowerCase())) {
        return false
      }
    }
  }

  // Amount threshold matching
  const absAmount = Math.abs(transaction.amount)
  if (rule.amount_min != null && absAmount < rule.amount_min) {
    return false
  }
  if (rule.amount_max != null && absAmount > rule.amount_max) {
    return false
  }

  return true
}

/**
 * Build a MappingResult from a matched rule
 */
function buildResult(rule: MappingRule, transaction: Transaction): MappingResult {
  const absAmount = Math.abs(transaction.amount)
  const isExpense = transaction.amount < 0

  let debitAccount = rule.debit_account || (isExpense ? '6991' : '1930')
  let creditAccount = rule.credit_account || (isExpense ? '1930' : '3001')

  // Check capitalization threshold for equipment
  if (
    rule.capitalization_threshold &&
    absAmount > rule.capitalization_threshold &&
    rule.capitalized_debit_account
  ) {
    debitAccount = rule.capitalized_debit_account
  }

  // If default_private, override to 2013
  if (rule.default_private && isExpense) {
    debitAccount = '2013'
  }

  // Generate VAT lines if applicable
  const vatLines: VatJournalLine[] = []
  if (isExpense && !rule.default_private && rule.vat_treatment) {
    if (rule.vat_treatment === 'reverse_charge') {
      // EU reverse charge: fiktiv moms (offsetting entries)
      const rcLines = generateReverseChargeLines(absAmount)
      for (const rcl of rcLines) {
        vatLines.push({
          account_number: rcl.account_number,
          debit_amount: rcl.debit_amount,
          credit_amount: rcl.credit_amount,
          description: rcl.line_description || '',
        })
      }
    } else if (rule.vat_treatment === 'standard_25' || rule.vat_treatment === 'reduced_12' || rule.vat_treatment === 'reduced_6') {
      const vatRate =
        rule.vat_treatment === 'standard_25' ? 0.25
        : rule.vat_treatment === 'reduced_12' ? 0.12
        : 0.06
      const vatLine = generateInputVatLine(absAmount, vatRate)
      if (vatLine) {
        vatLines.push({
          account_number: vatLine.account_number,
          debit_amount: vatLine.debit_amount,
          credit_amount: vatLine.credit_amount,
          description: vatLine.line_description || '',
        })
      }
    }
  }

  return {
    rule,
    debit_account: debitAccount,
    credit_account: creditAccount,
    risk_level: rule.risk_level,
    confidence: rule.confidence_score,
    requires_review: rule.requires_review,
    default_private: rule.default_private,
    vat_lines: vatLines,
    description: rule.rule_name,
  }
}

/**
 * Default result when no rule matches (uncategorized)
 */
function getDefaultResult(transaction: Transaction): MappingResult {
  const isExpense = transaction.amount < 0

  return {
    rule: null,
    debit_account: isExpense ? '6991' : '1930',
    credit_account: isExpense ? '1930' : '3001',
    risk_level: 'MEDIUM',
    confidence: 0.1,
    requires_review: true,
    default_private: false,
    vat_lines: [],
    description: 'Obokförd transaktion',
  }
}

/**
 * Save a user-level mapping rule learned from categorization
 */
export async function saveUserMappingRule(
  userId: string,
  merchantName: string,
  debitAccount: string,
  creditAccount: string,
  isPrivate: boolean
): Promise<void> {
  const supabase = await createClient()

  // Escape special regex characters in merchant name
  const escapedMerchant = merchantName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

  const { error } = await supabase.from('mapping_rules').insert({
    user_id: userId,
    rule_name: `Learned: ${merchantName}`,
    rule_type: 'merchant_name',
    priority: 10, // User overrides have highest priority
    merchant_pattern: escapedMerchant,
    debit_account: debitAccount,
    credit_account: creditAccount,
    risk_level: 'NONE',
    default_private: isPrivate,
    requires_review: false,
    confidence_score: 0.95,
  })

  if (error) {
    console.error('Failed to save user mapping rule:', error)
  }
}
