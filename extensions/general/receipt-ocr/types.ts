import type { TransactionCategory, Transaction } from '@/types'

// Receipt extraction status
export type ReceiptStatus = 'pending' | 'processing' | 'extracted' | 'confirmed' | 'error'

// Receipt record
export interface Receipt {
  id: string
  user_id: string

  // Image storage
  image_url: string
  image_thumbnail_url: string | null

  // Extraction status
  status: ReceiptStatus
  extraction_confidence: number | null

  // Extracted header data
  merchant_name: string | null
  merchant_org_number: string | null
  merchant_vat_number: string | null
  receipt_date: string | null
  receipt_time: string | null
  total_amount: number | null
  currency: string
  vat_amount: number | null

  // Special flags
  is_restaurant: boolean
  is_systembolaget: boolean
  is_foreign_merchant: boolean

  // Restaurant representation data
  representation_persons: number | null
  representation_purpose: string | null

  // Transaction matching
  matched_transaction_id: string | null
  match_confidence: number | null

  // Raw extraction data
  raw_extraction: ReceiptExtractionResult | null

  created_at: string
  updated_at: string

  // Relations (populated when fetched)
  line_items?: ReceiptLineItem[]
  matched_transaction?: Transaction
}

// Receipt line item record
export interface ReceiptLineItem {
  id: string
  receipt_id: string

  // Extracted data
  description: string
  quantity: number
  unit_price: number | null
  line_total: number
  vat_rate: number | null
  vat_amount: number | null

  // Classification
  is_business: boolean | null
  category: TransactionCategory | null
  bas_account: string | null

  // Confidence
  extraction_confidence: number | null
  suggested_category: string | null

  sort_order: number
  created_at: string
}

// AI extraction result from Claude Vision
export interface ReceiptExtractionResult {
  merchant: {
    name: string | null
    orgNumber: string | null
    vatNumber: string | null
    isForeign: boolean
  }
  receipt: {
    date: string | null
    time: string | null
    currency: string
  }
  lineItems: ExtractedLineItem[]
  totals: {
    subtotal: number | null
    vatAmount: number | null
    total: number | null
  }
  flags: {
    isRestaurant: boolean
    isSystembolaget: boolean
    isForeignMerchant: boolean
  }
  confidence: number
}

// Extracted line item from AI
export interface ExtractedLineItem {
  description: string
  quantity: number
  unitPrice: number | null
  lineTotal: number
  vatRate: number | null
  suggestedCategory: string | null
  confidence?: number
}

// Match candidate for receipt-to-transaction matching
export interface ReceiptMatchCandidate {
  transaction: Transaction
  confidence: number
  matchReasons: string[]
  dateVariance: number
  amountVariance: number
}

// Input for creating a receipt
export interface CreateReceiptInput {
  image_url: string
  image_thumbnail_url?: string
}

// Input for confirming receipt line items
export interface ConfirmReceiptInput {
  line_items: ConfirmLineItemInput[]
  matched_transaction_id?: string
  representation_persons?: number
  representation_purpose?: string
}

export interface ConfirmLineItemInput {
  id: string
  is_business: boolean
  category?: TransactionCategory
  bas_account?: string
}

// Receipt queue summary
export interface ReceiptQueueSummary {
  unmatched_receipts_count: number
  unmatched_transactions_count: number
  pending_review_count: number
  streak_count: number
}

// Camera quality feedback
export interface CameraQualityFeedback {
  lightingOk: boolean
  distanceOk: boolean
  focusOk: boolean
  readyToCapture: boolean
  message?: string
}

// Swedish labels for receipt status
export const RECEIPT_STATUS_LABELS: Record<ReceiptStatus, string> = {
  pending: 'Väntar',
  processing: 'Analyserar',
  extracted: 'Extraherat',
  confirmed: 'Bekräftat',
  error: 'Fel'
}
