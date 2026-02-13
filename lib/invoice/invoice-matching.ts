import { createClient } from '@/lib/supabase/server'
import type { Invoice, Transaction, Customer } from '@/types'

export interface InvoiceMatch {
  invoice: Invoice & { customer?: Customer }
  confidence: number
  matchReason: string
}

/**
 * Confidence thresholds for invoice matching
 */
const CONFIDENCE = {
  EXACT_AMOUNT_CUSTOMER: 0.95,
  EXACT_AMOUNT_ONLY: 0.80,
  FUZZY_AMOUNT_CUSTOMER: 0.70,
  FUZZY_AMOUNT_ONLY: 0.50,
  MIN_THRESHOLD: 0.50,
}

/**
 * Fuzzy amount tolerance (±1% for FX fees)
 */
const FUZZY_TOLERANCE = 0.01

/**
 * Check if two amounts match exactly (within rounding)
 */
function amountsMatchExact(transactionAmount: number, invoiceTotal: number): boolean {
  // Round to 2 decimal places for comparison
  const txRounded = Math.round(transactionAmount * 100) / 100
  const invRounded = Math.round(invoiceTotal * 100) / 100
  return txRounded === invRounded
}

/**
 * Check if two amounts match within fuzzy tolerance (±1%)
 */
function amountsMatchFuzzy(transactionAmount: number, invoiceTotal: number): boolean {
  if (invoiceTotal === 0) return false
  const diff = Math.abs(transactionAmount - invoiceTotal)
  const tolerance = invoiceTotal * FUZZY_TOLERANCE
  return diff <= tolerance
}

/**
 * Check if customer name appears in transaction counterparty
 */
function customerNameMatches(
  customerName: string | undefined,
  transactionDescription: string,
  merchantName: string | null
): boolean {
  if (!customerName) return false

  const searchTerms = customerName.toLowerCase().split(/\s+/).filter(term => term.length > 2)
  const searchText = `${transactionDescription} ${merchantName || ''}`.toLowerCase()

  // Check if any significant word from customer name appears in transaction
  return searchTerms.some(term => searchText.includes(term))
}

/**
 * Calculate confidence score and match reason for an invoice match
 */
function calculateMatchScore(
  transaction: Transaction,
  invoice: Invoice & { customer?: Customer }
): { confidence: number; matchReason: string } {
  const transactionAmount = transaction.amount
  const invoiceTotal = invoice.total

  const exactAmount = amountsMatchExact(transactionAmount, invoiceTotal)
  const fuzzyAmount = !exactAmount && amountsMatchFuzzy(transactionAmount, invoiceTotal)
  const customerMatch = customerNameMatches(
    invoice.customer?.name,
    transaction.description,
    transaction.merchant_name
  )

  if (exactAmount && customerMatch) {
    return {
      confidence: CONFIDENCE.EXACT_AMOUNT_CUSTOMER,
      matchReason: `Exakt belopp (${invoiceTotal} ${invoice.currency}) och kundnamn matchar`,
    }
  }

  if (exactAmount) {
    return {
      confidence: CONFIDENCE.EXACT_AMOUNT_ONLY,
      matchReason: `Exakt belopp (${invoiceTotal} ${invoice.currency})`,
    }
  }

  if (fuzzyAmount && customerMatch) {
    return {
      confidence: CONFIDENCE.FUZZY_AMOUNT_CUSTOMER,
      matchReason: `Belopp nära (±1%) och kundnamn matchar`,
    }
  }

  if (fuzzyAmount) {
    return {
      confidence: CONFIDENCE.FUZZY_AMOUNT_ONLY,
      matchReason: `Belopp nära (±1%)`,
    }
  }

  return { confidence: 0, matchReason: '' }
}

/**
 * Find invoices that potentially match a bank transaction
 *
 * Only matches income transactions (amount > 0) against unpaid invoices
 * Returns matches sorted by confidence, filtered to >= 50% confidence
 */
export async function findMatchingInvoices(
  userId: string,
  transaction: Transaction
): Promise<InvoiceMatch[]> {
  // Only match income transactions
  if (transaction.amount <= 0) {
    return []
  }

  const supabase = await createClient()

  // Query unpaid invoices (sent or overdue) with customer info
  const { data: invoices, error } = await supabase
    .from('invoices')
    .select(`
      *,
      customer:customers(*)
    `)
    .eq('user_id', userId)
    .in('status', ['sent', 'overdue'])
    .order('due_date', { ascending: true })

  if (error || !invoices) {
    console.error('Failed to fetch invoices for matching:', error)
    return []
  }

  const matches: InvoiceMatch[] = []

  for (const invoice of invoices) {
    // Currency filter - must match or be SEK equivalent
    const currencyMatch =
      invoice.currency === transaction.currency ||
      (transaction.currency === 'SEK' && invoice.total_sek != null)

    if (!currencyMatch) continue

    // Use SEK amount for comparison if currencies differ
    const compareAmount =
      invoice.currency === transaction.currency
        ? invoice.total
        : invoice.total_sek || invoice.total

    const transactionAmount = transaction.amount

    // Check if amounts are close enough to consider
    const amountDiff = Math.abs(transactionAmount - compareAmount)
    const tolerance = compareAmount * FUZZY_TOLERANCE
    if (amountDiff > tolerance && transactionAmount !== compareAmount) {
      continue
    }

    // Calculate score
    const invoiceWithAdjustedTotal = {
      ...invoice,
      total: compareAmount, // Use the comparable amount
    }

    const { confidence, matchReason } = calculateMatchScore(
      transaction,
      invoiceWithAdjustedTotal as Invoice & { customer?: Customer }
    )

    if (confidence >= CONFIDENCE.MIN_THRESHOLD) {
      matches.push({
        invoice: invoice as Invoice & { customer?: Customer },
        confidence,
        matchReason,
      })
    }
  }

  // Sort by confidence descending
  matches.sort((a, b) => b.confidence - a.confidence)

  return matches
}

/**
 * Get the best matching invoice for a transaction
 * Returns the highest confidence match if it meets the threshold
 */
export async function getBestInvoiceMatch(
  userId: string,
  transaction: Transaction,
  minConfidence: number = 0.80
): Promise<InvoiceMatch | null> {
  const matches = await findMatchingInvoices(userId, transaction)

  if (matches.length > 0 && matches[0].confidence >= minConfidence) {
    return matches[0]
  }

  return null
}
