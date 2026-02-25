/**
 * Receipt Matcher - Fuzzy matching between receipts and transactions
 *
 * Uses date variance, amount tolerance, and merchant name similarity
 * to find potential transaction matches for receipts.
 *
 * Core matching utilities (levenshtein, merchant similarity) are imported
 * from @/lib/documents/core-receipt-matcher and re-exported for backward compat.
 */

import type { Transaction, Receipt, ReceiptMatchCandidate } from '@/types'
import {
  calculateMerchantSimilarity,
  calculateMatchConfidence,
  levenshteinDistance,
  normalizeMerchantName,
  DATE_TOLERANCE_DAYS,
  AMOUNT_TOLERANCE_PERCENT,
  MIN_MATCH_CONFIDENCE,
} from '@/lib/documents/core-receipt-matcher'

// Re-export core functions for backward compatibility
export { calculateMerchantSimilarity, levenshteinDistance, normalizeMerchantName }

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
    const { confidence, matchReasons } = calculateReceiptMatchConfidence(
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
 * Wrapper around core calculateMatchConfidence that adds receipt-specific
 * MCC bonus logic for backward compatibility.
 */
function calculateReceiptMatchConfidence(
  dateVariance: number,
  amountVariance: number,
  merchantSimilarity: number,
  receipt: Receipt,
  transaction: Transaction
): { confidence: number; matchReasons: string[] } {
  const result = calculateMatchConfidence(dateVariance, amountVariance, merchantSimilarity)

  // Bonus for MCC match (receipt-specific: restaurant MCC codes)
  if (receipt.is_restaurant && transaction.mcc_code) {
    const restaurantMCCs = [5812, 5813, 5814]
    if (restaurantMCCs.includes(transaction.mcc_code)) {
      result.matchReasons.push('Restaurang MCC matchar')
      result.confidence = Math.round((result.confidence + 0.1) * 100) / 100
    }
  }

  return result
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
