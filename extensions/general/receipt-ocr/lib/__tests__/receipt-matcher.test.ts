import { describe, it, expect } from 'vitest'
import {
  findTransactionMatches,
  autoMatchReceipts,
  filterUnmatchedTransactions,
  filterUnmatchedReceipts,
} from '../receipt-matcher'
import { makeReceipt, makeTransaction } from '@/tests/helpers'

describe('findTransactionMatches', () => {
  it('exact date + exact amount → high confidence', () => {
    const receipt = makeReceipt({
      receipt_date: '2024-06-15',
      total_amount: 299,
      merchant_name: 'ICA Maxi',
    })
    const transactions = [
      makeTransaction({
        date: '2024-06-15',
        amount: -299,
        merchant_name: 'ICA Maxi',
        receipt_id: null,
      }),
    ]

    const matches = findTransactionMatches(receipt, transactions)
    expect(matches).toHaveLength(1)
    expect(matches[0].confidence).toBeGreaterThanOrEqual(0.8)
    expect(matches[0].dateVariance).toBe(0)
  })

  it('date within ±3 days → matches with lower confidence', () => {
    const receipt = makeReceipt({
      receipt_date: '2024-06-15',
      total_amount: 500,
      merchant_name: '',
    })
    const transactions = [
      makeTransaction({
        date: '2024-06-17',
        amount: -500,
        merchant_name: '',
        receipt_id: null,
      }),
    ]

    const matches = findTransactionMatches(receipt, transactions)
    expect(matches.length).toBeGreaterThanOrEqual(1)
    expect(matches[0].dateVariance).toBeCloseTo(2, 0)
  })

  it('date outside ±3 days → no match', () => {
    const receipt = makeReceipt({
      receipt_date: '2024-06-15',
      total_amount: 500,
      merchant_name: '',
    })
    const transactions = [
      makeTransaction({
        date: '2024-06-25',
        amount: -500,
        merchant_name: '',
        receipt_id: null,
      }),
    ]

    const matches = findTransactionMatches(receipt, transactions)
    expect(matches).toHaveLength(0)
  })

  it('amount within 5% tolerance → matches', () => {
    const receipt = makeReceipt({
      receipt_date: '2024-06-15',
      total_amount: 1000,
      merchant_name: '',
    })
    // 4% off = 960
    const transactions = [
      makeTransaction({
        date: '2024-06-15',
        amount: -960,
        merchant_name: '',
        receipt_id: null,
      }),
    ]

    const matches = findTransactionMatches(receipt, transactions)
    expect(matches.length).toBeGreaterThanOrEqual(1)
  })

  it('amount outside tolerance → no match', () => {
    const receipt = makeReceipt({
      receipt_date: '2024-06-15',
      total_amount: 1000,
      merchant_name: '',
      is_foreign_merchant: false,
    })
    // 10% off = 900 (way above 5%)
    const transactions = [
      makeTransaction({
        date: '2024-06-15',
        amount: -900,
        merchant_name: '',
        receipt_id: null,
      }),
    ]

    const matches = findTransactionMatches(receipt, transactions)
    expect(matches).toHaveLength(0)
  })

  it('merchant name similarity boosts confidence', () => {
    const receipt = makeReceipt({
      receipt_date: '2024-06-15',
      total_amount: 500,
      merchant_name: 'Coop Konsum',
    })

    const txWithMerchant = makeTransaction({
      id: 'tx-with',
      date: '2024-06-15',
      amount: -500,
      merchant_name: 'Coop Konsum Stockholm',
      receipt_id: null,
    })
    const txWithout = makeTransaction({
      id: 'tx-without',
      date: '2024-06-15',
      amount: -500,
      merchant_name: '',
      receipt_id: null,
    })

    const matchesWithMerchant = findTransactionMatches(receipt, [txWithMerchant])
    const matchesWithout = findTransactionMatches(receipt, [txWithout])

    // Both should match since date+amount are exact
    expect(matchesWithMerchant.length).toBeGreaterThanOrEqual(1)
    expect(matchesWithout.length).toBeGreaterThanOrEqual(1)

    // Merchant match should have higher confidence
    expect(matchesWithMerchant[0].confidence).toBeGreaterThan(
      matchesWithout[0].confidence
    )
  })

  it('skips already-matched transactions (receipt_id set)', () => {
    const receipt = makeReceipt({
      receipt_date: '2024-06-15',
      total_amount: 299,
    })
    const transactions = [
      makeTransaction({
        date: '2024-06-15',
        amount: -299,
        receipt_id: 'already-matched',
      }),
    ]

    const matches = findTransactionMatches(receipt, transactions)
    expect(matches).toHaveLength(0)
  })

  it('skips income transactions (amount >= 0)', () => {
    const receipt = makeReceipt({
      receipt_date: '2024-06-15',
      total_amount: 299,
    })
    const transactions = [
      makeTransaction({
        date: '2024-06-15',
        amount: 299, // income, positive
        receipt_id: null,
      }),
    ]

    const matches = findTransactionMatches(receipt, transactions)
    expect(matches).toHaveLength(0)
  })
})

describe('autoMatchReceipts', () => {
  it('returns matches above threshold', () => {
    const receipts = [
      makeReceipt({
        id: 'r1',
        receipt_date: '2024-06-15',
        total_amount: 500,
        merchant_name: 'Coop',
        matched_transaction_id: null,
      }),
    ]
    const transactions = [
      makeTransaction({
        id: 'tx1',
        date: '2024-06-15',
        amount: -500,
        merchant_name: 'Coop',
        receipt_id: null,
      }),
    ]

    const results = autoMatchReceipts(receipts, transactions, 0.5)
    expect(results).toHaveLength(1)
    expect(results[0].receipt.id).toBe('r1')
    expect(results[0].match.confidence).toBeGreaterThanOrEqual(0.5)
  })

  it('respects custom threshold', () => {
    const receipts = [
      makeReceipt({
        id: 'r1',
        receipt_date: '2024-06-15',
        total_amount: 500,
        merchant_name: '',
        matched_transaction_id: null,
      }),
    ]
    const transactions = [
      makeTransaction({
        id: 'tx1',
        date: '2024-06-17', // 2 days off, no merchant → moderate confidence
        amount: -500,
        merchant_name: '',
        receipt_id: null,
      }),
    ]

    // With a very high threshold, it should not match
    const highThreshold = autoMatchReceipts(receipts, transactions, 0.99)
    expect(highThreshold).toHaveLength(0)

    // With a lower threshold, it should match
    const lowThreshold = autoMatchReceipts(receipts, transactions, 0.4)
    expect(lowThreshold).toHaveLength(1)
  })

  it('skips already-matched receipts', () => {
    const receipts = [
      makeReceipt({
        id: 'r1',
        receipt_date: '2024-06-15',
        total_amount: 500,
        matched_transaction_id: 'existing-tx',
      }),
    ]
    const transactions = [
      makeTransaction({
        date: '2024-06-15',
        amount: -500,
        receipt_id: null,
      }),
    ]

    const results = autoMatchReceipts(receipts, transactions)
    expect(results).toHaveLength(0)
  })
})

describe('filterUnmatchedTransactions', () => {
  it('returns only unmatched expenses', () => {
    const transactions = [
      makeTransaction({ id: 't1', receipt_id: null, amount: -100 }),
      makeTransaction({ id: 't2', receipt_id: 'r1', amount: -200 }), // matched
      makeTransaction({ id: 't3', receipt_id: null, amount: 300 }), // income
    ]

    const result = filterUnmatchedTransactions(transactions)
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('t1')
  })
})

describe('filterUnmatchedReceipts', () => {
  it('returns only confirmed unmatched receipts', () => {
    const receipts = [
      makeReceipt({ id: 'r1', status: 'confirmed', matched_transaction_id: null }),
      makeReceipt({ id: 'r2', status: 'confirmed', matched_transaction_id: 'tx1' }),
      makeReceipt({ id: 'r3', status: 'extracted', matched_transaction_id: null }),
    ]

    const result = filterUnmatchedReceipts(receipts)
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('r1')
  })
})
