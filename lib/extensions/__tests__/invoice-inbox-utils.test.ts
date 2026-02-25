import { describe, it, expect } from 'vitest'
import {
  getStatusLabel,
  getStatusVariant,
  getConfidenceLabel,
  formatExtractionSummary,
} from '../invoice-inbox-utils'
import type { InboxItemStatus } from '@/types'
import type { InvoiceExtractionResult } from '@/types'

describe('getStatusLabel', () => {
  const cases: [InboxItemStatus, string][] = [
    ['pending', 'Väntar'],
    ['processing', 'Bearbetar'],
    ['ready', 'Klar'],
    ['confirmed', 'Bekräftad'],
    ['rejected', 'Avvisad'],
    ['error', 'Fel'],
  ]

  it.each(cases)('returns "%s" → "%s"', (status, expected) => {
    expect(getStatusLabel(status)).toBe(expected)
  })
})

describe('getStatusVariant', () => {
  const cases: [InboxItemStatus, string][] = [
    ['pending', 'secondary'],
    ['processing', 'default'],
    ['ready', 'warning'],
    ['confirmed', 'success'],
    ['rejected', 'destructive'],
    ['error', 'destructive'],
  ]

  it.each(cases)('returns "%s" → "%s"', (status, expected) => {
    expect(getStatusVariant(status)).toBe(expected)
  })
})

describe('getConfidenceLabel', () => {
  it('returns unknown for null', () => {
    expect(getConfidenceLabel(null)).toEqual({ label: 'Okänd', variant: 'outline' })
  })

  it('returns high for >= 0.9', () => {
    expect(getConfidenceLabel(0.95)).toEqual({ label: 'Hög', variant: 'success' })
    expect(getConfidenceLabel(0.9)).toEqual({ label: 'Hög', variant: 'success' })
  })

  it('returns medium for 0.7-0.89', () => {
    expect(getConfidenceLabel(0.85)).toEqual({ label: 'Medium', variant: 'warning' })
    expect(getConfidenceLabel(0.7)).toEqual({ label: 'Medium', variant: 'warning' })
  })

  it('returns low for < 0.7', () => {
    expect(getConfidenceLabel(0.5)).toEqual({ label: 'Låg', variant: 'destructive' })
    expect(getConfidenceLabel(0.0)).toEqual({ label: 'Låg', variant: 'destructive' })
  })
})

describe('formatExtractionSummary', () => {
  it('handles null data', () => {
    expect(formatExtractionSummary(null)).toEqual({
      supplierName: '',
      total: 0,
      lineCount: 0,
    })
  })

  it('handles undefined data', () => {
    expect(formatExtractionSummary(undefined)).toEqual({
      supplierName: '',
      total: 0,
      lineCount: 0,
    })
  })

  it('extracts summary from complete data', () => {
    const data: InvoiceExtractionResult = {
      supplier: {
        name: 'Acme AB',
        orgNumber: '556123-4567',
        vatNumber: null,
        address: null,
        bankgiro: null,
        plusgiro: null,
      },
      invoice: {
        invoiceNumber: 'INV-001',
        invoiceDate: '2025-01-15',
        dueDate: '2025-02-15',
        paymentReference: null,
        currency: 'SEK',
      },
      lineItems: [
        { description: 'Item 1', quantity: 1, unitPrice: 100, lineTotal: 100, vatRate: 25, accountSuggestion: null },
        { description: 'Item 2', quantity: 2, unitPrice: 50, lineTotal: 100, vatRate: 25, accountSuggestion: null },
      ],
      totals: { subtotal: 200, vatAmount: 50, total: 250 },
      vatBreakdown: [{ rate: 25, base: 200, amount: 50 }],
      confidence: 0.92,
    }

    expect(formatExtractionSummary(data)).toEqual({
      supplierName: 'Acme AB',
      total: 250,
      lineCount: 2,
    })
  })

  it('handles null supplier name', () => {
    const data: InvoiceExtractionResult = {
      supplier: { name: null, orgNumber: null, vatNumber: null, address: null, bankgiro: null, plusgiro: null },
      invoice: { invoiceNumber: null, invoiceDate: null, dueDate: null, paymentReference: null, currency: 'SEK' },
      lineItems: [],
      totals: { subtotal: null, vatAmount: null, total: null },
      vatBreakdown: [],
      confidence: 0.5,
    }

    expect(formatExtractionSummary(data)).toEqual({
      supplierName: '',
      total: 0,
      lineCount: 0,
    })
  })
})
