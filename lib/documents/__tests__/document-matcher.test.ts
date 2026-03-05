import { describe, it, expect, vi, beforeEach } from 'vitest'
import { matchDocumentToTransactions } from '../document-matcher'
import { makeInvoiceInboxItem, makeTransaction } from '@/tests/helpers'
import type { InvoiceExtractionResult, ReceiptExtractionResult } from '@/types'

describe('matchDocumentToTransactions', () => {
  const mockSupabase = {} as never // Not used when candidateTransactions is provided

  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('supplier_invoice matching', () => {
    const baseExtraction: InvoiceExtractionResult = {
      supplier: {
        name: 'Telia AB',
        orgNumber: '556103-4249',
        vatNumber: 'SE556103424901',
        address: 'Stockholm',
        bankgiro: '5820-5093',
        plusgiro: null,
      },
      invoice: {
        invoiceNumber: 'INV-2024-001',
        invoiceDate: '2024-06-10',
        dueDate: '2024-06-20',
        paymentReference: '73401284756',
        currency: 'SEK',
      },
      lineItems: [],
      totals: { subtotal: 800, vatAmount: 200, total: 1000 },
      vatBreakdown: [],
      confidence: 0.95,
    }

    it('returns null for government_letter type', async () => {
      const item = makeInvoiceInboxItem({
        document_type: 'government_letter',
        extracted_data: baseExtraction as unknown as Record<string, unknown>,
      })
      const result = await matchDocumentToTransactions(mockSupabase, 'user-1', item, [])
      expect(result).toBeNull()
    })

    it('returns null when no extracted_data', async () => {
      const item = makeInvoiceInboxItem({ extracted_data: null })
      const result = await matchDocumentToTransactions(mockSupabase, 'user-1', item, [])
      expect(result).toBeNull()
    })

    it('returns null when no candidate transactions', async () => {
      const item = makeInvoiceInboxItem({
        status: 'ready',
        extracted_data: baseExtraction as unknown as Record<string, unknown>,
      })
      const result = await matchDocumentToTransactions(mockSupabase, 'user-1', item, [])
      expect(result).toBeNull()
    })

    it('pass 1: matches by payment reference with 0.98 confidence', async () => {
      const item = makeInvoiceInboxItem({
        status: 'ready',
        extracted_data: baseExtraction as unknown as Record<string, unknown>,
      })
      const tx = makeTransaction({
        amount: -1000,
        reference: '73401284756',
        date: '2024-06-20',
      })

      const result = await matchDocumentToTransactions(mockSupabase, 'user-1', item, [tx])
      expect(result).not.toBeNull()
      expect(result!.confidence).toBe(0.98)
      expect(result!.method).toBe('payment_reference')
      expect(result!.transactionId).toBe(tx.id)
    })

    it('pass 1: matches with whitespace/dash-normalized references', async () => {
      const item = makeInvoiceInboxItem({
        status: 'ready',
        extracted_data: baseExtraction as unknown as Record<string, unknown>,
      })
      const tx = makeTransaction({
        amount: -1000,
        reference: '734 012 847 56',
        date: '2024-06-20',
      })

      const result = await matchDocumentToTransactions(mockSupabase, 'user-1', item, [tx])
      expect(result).not.toBeNull()
      expect(result!.confidence).toBe(0.98)
      expect(result!.method).toBe('payment_reference')
    })

    it('pass 2: matches by exact amount + bankgiro with 0.92 confidence', async () => {
      const extractionNoRef = {
        ...baseExtraction,
        invoice: { ...baseExtraction.invoice, paymentReference: null },
      }
      const item = makeInvoiceInboxItem({
        status: 'ready',
        extracted_data: extractionNoRef as unknown as Record<string, unknown>,
      })
      const tx = makeTransaction({
        amount: -1000,
        reference: null,
        description: 'BETALNING 58205093',
        date: '2024-06-20',
      })

      const result = await matchDocumentToTransactions(mockSupabase, 'user-1', item, [tx])
      expect(result).not.toBeNull()
      expect(result!.confidence).toBe(0.92)
      expect(result!.method).toBe('payment_reference')
    })

    it('pass 3: matches by exact amount + date proximity with 0.85 confidence', async () => {
      const extractionNoBg = {
        ...baseExtraction,
        invoice: { ...baseExtraction.invoice, paymentReference: null },
        supplier: { ...baseExtraction.supplier, bankgiro: null, plusgiro: null },
      }
      const item = makeInvoiceInboxItem({
        status: 'ready',
        extracted_data: extractionNoBg as unknown as Record<string, unknown>,
      })
      const tx = makeTransaction({
        amount: -1000,
        reference: null,
        description: 'PAYMENT',
        date: '2024-06-22',
        merchant_name: null,
      })

      const result = await matchDocumentToTransactions(mockSupabase, 'user-1', item, [tx])
      expect(result).not.toBeNull()
      expect(result!.confidence).toBe(0.85)
      expect(result!.method).toBe('amount_date')
    })

    it('pass 3: matches with lower confidence at 6–14 days', async () => {
      const extractionNoBg = {
        ...baseExtraction,
        invoice: { ...baseExtraction.invoice, paymentReference: null },
        supplier: { ...baseExtraction.supplier, bankgiro: null, plusgiro: null },
      }
      const item = makeInvoiceInboxItem({
        status: 'ready',
        extracted_data: extractionNoBg as unknown as Record<string, unknown>,
      })
      const tx = makeTransaction({
        amount: -1000,
        reference: null,
        description: 'PAYMENT',
        date: '2024-06-28', // 8 days after due date
        merchant_name: null,
      })

      const result = await matchDocumentToTransactions(mockSupabase, 'user-1', item, [tx])
      expect(result).not.toBeNull()
      expect(result!.confidence).toBe(0.75)
      expect(result!.method).toBe('amount_date')
    })

    it('pass 3: does not match if date is >14 days away', async () => {
      const extractionNoBg = {
        ...baseExtraction,
        invoice: { ...baseExtraction.invoice, paymentReference: null },
        supplier: { ...baseExtraction.supplier, bankgiro: null, plusgiro: null },
      }
      const item = makeInvoiceInboxItem({
        status: 'ready',
        extracted_data: extractionNoBg as unknown as Record<string, unknown>,
      })
      const tx = makeTransaction({
        amount: -1000,
        reference: null,
        description: 'PAYMENT',
        date: '2024-07-06', // 16 days after due date
        merchant_name: null,
      })

      const result = await matchDocumentToTransactions(mockSupabase, 'user-1', item, [tx])
      expect(result).toBeNull()
    })

    it('pass 4: matches by fuzzy amount + supplier name with 0.70 confidence', async () => {
      const extractionMinimal = {
        ...baseExtraction,
        invoice: {
          ...baseExtraction.invoice,
          paymentReference: null,
          dueDate: null,
          invoiceDate: null,
        },
        supplier: {
          ...baseExtraction.supplier,
          bankgiro: null,
          plusgiro: null,
          name: 'Telia Sverige',
        },
      }
      const item = makeInvoiceInboxItem({
        status: 'ready',
        extracted_data: extractionMinimal as unknown as Record<string, unknown>,
      })
      const tx = makeTransaction({
        amount: -1000,
        reference: null,
        description: 'telia faktura april',
        date: '2024-06-15',
        merchant_name: null,
      })

      const result = await matchDocumentToTransactions(mockSupabase, 'user-1', item, [tx])
      expect(result).not.toBeNull()
      expect(result!.confidence).toBe(0.70)
      expect(result!.method).toBe('amount_merchant')
    })

    it('prefers higher confidence matches', async () => {
      const item = makeInvoiceInboxItem({
        status: 'ready',
        extracted_data: baseExtraction as unknown as Record<string, unknown>,
      })

      const txWithRef = makeTransaction({
        amount: -1000,
        reference: '73401284756',
        date: '2024-06-20',
      })
      const txWithAmount = makeTransaction({
        amount: -1000,
        reference: null,
        description: 'BETALNING',
        date: '2024-06-20',
      })

      const result = await matchDocumentToTransactions(mockSupabase, 'user-1', item, [txWithAmount, txWithRef])
      expect(result!.confidence).toBe(0.98)
      expect(result!.transactionId).toBe(txWithRef.id)
    })
  })

  describe('receipt matching', () => {
    const receiptExtraction: ReceiptExtractionResult = {
      merchant: {
        name: 'ICA Maxi',
        orgNumber: null,
        vatNumber: null,
        isForeign: false,
      },
      receipt: {
        date: '2024-06-15',
        time: '14:30',
        currency: 'SEK',
      },
      lineItems: [],
      totals: { subtotal: 239.2, vatAmount: 59.8, total: 299 },
      flags: {
        isRestaurant: false,
        isSystembolaget: false,
        isForeignMerchant: false,
      },
      confidence: 0.92,
    }

    it('matches receipt to transaction with high confidence', async () => {
      const item = makeInvoiceInboxItem({
        document_type: 'receipt',
        status: 'ready',
        extracted_data: receiptExtraction as unknown as Record<string, unknown>,
      })
      const tx = makeTransaction({
        amount: -299,
        date: '2024-06-15',
        merchant_name: 'ICA Maxi',
        description: 'ICA MAXI STOCKHOLM',
      })

      const result = await matchDocumentToTransactions(mockSupabase, 'user-1', item, [tx])
      expect(result).not.toBeNull()
      expect(result!.method).toBe('receipt_match')
      expect(result!.confidence).toBeGreaterThanOrEqual(0.60)
    })

    it('returns null when amount is too different', async () => {
      const item = makeInvoiceInboxItem({
        document_type: 'receipt',
        status: 'ready',
        extracted_data: receiptExtraction as unknown as Record<string, unknown>,
      })
      const tx = makeTransaction({
        amount: -500,
        date: '2024-06-15',
        merchant_name: 'ICA Maxi',
      })

      const result = await matchDocumentToTransactions(mockSupabase, 'user-1', item, [tx])
      expect(result).toBeNull()
    })

    it('returns null when date is too far away', async () => {
      const item = makeInvoiceInboxItem({
        document_type: 'receipt',
        status: 'ready',
        extracted_data: receiptExtraction as unknown as Record<string, unknown>,
      })
      const tx = makeTransaction({
        amount: -299,
        date: '2024-06-25', // 10 days after
        merchant_name: 'ICA Maxi',
      })

      const result = await matchDocumentToTransactions(mockSupabase, 'user-1', item, [tx])
      expect(result).toBeNull()
    })

    it('skips transactions with existing receipt_id', async () => {
      const item = makeInvoiceInboxItem({
        document_type: 'receipt',
        status: 'ready',
        extracted_data: receiptExtraction as unknown as Record<string, unknown>,
      })
      const tx = makeTransaction({
        amount: -299,
        date: '2024-06-15',
        merchant_name: 'ICA Maxi',
        receipt_id: 'existing-receipt',
      })

      const result = await matchDocumentToTransactions(mockSupabase, 'user-1', item, [tx])
      expect(result).toBeNull()
    })

    it('returns null when total is 0 or null', async () => {
      const zeroExtraction = {
        ...receiptExtraction,
        totals: { ...receiptExtraction.totals, total: 0 },
      }
      const item = makeInvoiceInboxItem({
        document_type: 'receipt',
        status: 'ready',
        extracted_data: zeroExtraction as unknown as Record<string, unknown>,
      })
      const tx = makeTransaction({ amount: -299, date: '2024-06-15' })

      const result = await matchDocumentToTransactions(mockSupabase, 'user-1', item, [tx])
      expect(result).toBeNull()
    })
  })
})
