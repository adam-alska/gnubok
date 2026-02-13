/**
 * Receipt Matcher - Fuzzy matching between receipts and transactions
 *
 * Uses date variance, amount tolerance, and merchant name similarity
 * to find potential transaction matches for receipts.
 */

import type { Transaction, Receipt, ReceiptMatchCandidate } from '@/types'

// Matching configuration
const DATE_TOLERANCE_DAYS = 3 // Allow ±3 days variance
const AMOUNT_TOLERANCE_PERCENT = 0.05 // Allow ±5% variance (for currency conversion)
const MIN_MATCH_CONFIDENCE = 0.4 // Minimum confidence to consider a match

/**
 * Find potential transaction matches for a receipt
 */
export function findTransactionMatches(
  receipt: Receipt,
  transactions: Transaction[]
): ReceiptMatchCandidate[] {
  if (!receipt.receipt_date || !receipt.total_amount) {
    return []
  }

  const receiptDate = new Date(receipt.receipt_date)
  const receiptAmount = Math.abs(receipt.total_amount)
  const merchantName = (receipt.merchant_name || '').toLowerCase()

  const candidates: ReceiptMatchCandidate[] = []

  for (const transaction of transactions) {
    // Skip already matched transactions
    if (transaction.receipt_id) continue

    // Only match expense transactions (negative amounts)
    if (transaction.amount >= 0) continue

    const transactionDate = new Date(transaction.date)
    const transactionAmount = Math.abs(transaction.amount)

    // Calculate date variance
    const dateVariance = Math.abs(
      (receiptDate.getTime() - transactionDate.getTime()) / (1000 * 60 * 60 * 24)
    )

    // Skip if outside date tolerance
    if (dateVariance > DATE_TOLERANCE_DAYS) continue

    // Calculate amount variance
    const amountVariance = Math.abs(receiptAmount - transactionAmount) / receiptAmount

    // Skip if outside amount tolerance (unless it's a foreign receipt with currency conversion)
    if (amountVariance > AMOUNT_TOLERANCE_PERCENT && !receipt.is_foreign_merchant) continue
    if (amountVariance > 0.15) continue // Hard limit even for foreign

    // Calculate merchant similarity
    const transactionMerchant = (transaction.merchant_name || transaction.description || '').toLowerCase()
    const merchantSimilarity = calculateMerchantSimilarity(merchantName, transactionMerchant)

    // Calculate overall confidence
    const { confidence, matchReasons } = calculateMatchConfidence(
      dateVariance,
      amountVariance,
      merchantSimilarity,
      receipt,
      transaction
    )

    if (confidence >= MIN_MATCH_CONFIDENCE) {
      candidates.push({
        transaction,
        confidence,
        matchReasons,
        dateVariance,
        amountVariance,
      })
    }
  }

  // Sort by confidence (highest first)
  return candidates.sort((a, b) => b.confidence - a.confidence)
}

/**
 * Calculate merchant name similarity using Levenshtein distance
 */
function calculateMerchantSimilarity(name1: string, name2: string): number {
  if (!name1 || !name2) return 0

  // Normalize names
  const n1 = normalizeMerchantName(name1)
  const n2 = normalizeMerchantName(name2)

  // Check for exact match
  if (n1 === n2) return 1

  // Check if one contains the other
  if (n1.includes(n2) || n2.includes(n1)) return 0.9

  // Check for word overlap
  const words1 = n1.split(/\s+/)
  const words2 = n2.split(/\s+/)
  const commonWords = words1.filter((w) => words2.includes(w))

  if (commonWords.length > 0) {
    const overlapScore = commonWords.length / Math.max(words1.length, words2.length)
    if (overlapScore >= 0.5) return 0.7 + overlapScore * 0.2
  }

  // Calculate Levenshtein similarity
  const distance = levenshteinDistance(n1, n2)
  const maxLength = Math.max(n1.length, n2.length)
  const similarity = 1 - distance / maxLength

  return similarity
}

/**
 * Normalize merchant name for comparison
 */
function normalizeMerchantName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^\w\såäöé]/g, '') // Remove special chars except Swedish letters
    .replace(/\b(ab|hb|kb|ek|för|stiftelse)\b/g, '') // Remove company suffixes
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Calculate Levenshtein distance between two strings
 */
function levenshteinDistance(str1: string, str2: string): number {
  const m = str1.length
  const n = str2.length

  // Create matrix
  const dp: number[][] = Array(m + 1)
    .fill(null)
    .map(() => Array(n + 1).fill(0))

  // Initialize first row and column
  for (let i = 0; i <= m; i++) dp[i][0] = i
  for (let j = 0; j <= n; j++) dp[0][j] = j

  // Fill the matrix
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = str1[i - 1] === str2[j - 1] ? 0 : 1
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1, // deletion
        dp[i][j - 1] + 1, // insertion
        dp[i - 1][j - 1] + cost // substitution
      )
    }
  }

  return dp[m][n]
}

/**
 * Calculate overall match confidence and reasons
 */
function calculateMatchConfidence(
  dateVariance: number,
  amountVariance: number,
  merchantSimilarity: number,
  receipt: Receipt,
  transaction: Transaction
): { confidence: number; matchReasons: string[] } {
  const matchReasons: string[] = []
  let totalWeight = 0
  let weightedScore = 0

  // Date score (weight: 25%)
  const dateScore = Math.max(0, 1 - dateVariance / DATE_TOLERANCE_DAYS)
  if (dateScore >= 0.8) {
    matchReasons.push(dateVariance === 0 ? 'Exakt datum' : `Datum ±${Math.round(dateVariance)} dagar`)
  }
  weightedScore += dateScore * 0.25
  totalWeight += 0.25

  // Amount score (weight: 40%)
  const amountScore = Math.max(0, 1 - amountVariance / AMOUNT_TOLERANCE_PERCENT)
  if (amountVariance < 0.01) {
    matchReasons.push('Exakt belopp')
  } else if (amountVariance < AMOUNT_TOLERANCE_PERCENT) {
    matchReasons.push(`Belopp ±${Math.round(amountVariance * 100)}%`)
  }
  weightedScore += amountScore * 0.4
  totalWeight += 0.4

  // Merchant score (weight: 35%)
  if (merchantSimilarity > 0) {
    if (merchantSimilarity >= 0.9) {
      matchReasons.push('Handlare matchar')
    } else if (merchantSimilarity >= 0.6) {
      matchReasons.push('Trolig handlarmatch')
    }
    weightedScore += merchantSimilarity * 0.35
    totalWeight += 0.35
  }

  // Bonus for MCC match (if transaction has MCC and receipt is flagged)
  if (receipt.is_restaurant && transaction.mcc_code) {
    const restaurantMCCs = [5812, 5813, 5814]
    if (restaurantMCCs.includes(transaction.mcc_code)) {
      matchReasons.push('Restaurang MCC matchar')
      weightedScore += 0.1
    }
  }

  const confidence = totalWeight > 0 ? weightedScore / totalWeight : 0

  return {
    confidence: Math.round(confidence * 100) / 100,
    matchReasons,
  }
}

/**
 * Get unmatched transactions for a user
 * (transactions without linked receipts)
 */
export function filterUnmatchedTransactions(transactions: Transaction[]): Transaction[] {
  return transactions.filter((t) => !t.receipt_id && t.amount < 0)
}

/**
 * Get unmatched receipts for a user
 * (confirmed receipts without linked transactions)
 */
export function filterUnmatchedReceipts(receipts: Receipt[]): Receipt[] {
  return receipts.filter((r) => !r.matched_transaction_id && r.status === 'confirmed')
}

/**
 * Auto-match receipts to transactions
 * Returns matches with confidence >= threshold
 */
export function autoMatchReceipts(
  receipts: Receipt[],
  transactions: Transaction[],
  confidenceThreshold: number = 0.8
): Array<{ receipt: Receipt; match: ReceiptMatchCandidate }> {
  const results: Array<{ receipt: Receipt; match: ReceiptMatchCandidate }> = []

  for (const receipt of receipts) {
    if (receipt.matched_transaction_id) continue

    const matches = findTransactionMatches(receipt, transactions)
    const bestMatch = matches[0]

    if (bestMatch && bestMatch.confidence >= confidenceThreshold) {
      results.push({ receipt, match: bestMatch })
      // Mark the transaction as used so it's not matched again
      // (Note: this mutates the transaction, caller should be aware)
    }
  }

  return results
}

/**
 * Calculate match statistics for queue display
 */
export function calculateMatchStats(
  receipts: Receipt[],
  transactions: Transaction[]
): {
  unmatchedReceiptsCount: number
  unmatchedTransactionsCount: number
  pendingReviewCount: number
  matchedCount: number
} {
  const unmatchedReceipts = filterUnmatchedReceipts(receipts)
  const unmatchedTransactions = filterUnmatchedTransactions(transactions)
  const pendingReview = receipts.filter((r) => r.status === 'extracted')
  const matched = receipts.filter((r) => r.matched_transaction_id)

  return {
    unmatchedReceiptsCount: unmatchedReceipts.length,
    unmatchedTransactionsCount: unmatchedTransactions.length,
    pendingReviewCount: pendingReview.length,
    matchedCount: matched.length,
  }
}
