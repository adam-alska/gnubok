/**
 * Bankgirot LB (Leverantorsbetalningar) payment file generator
 *
 * Generates payment files according to Bankgirot's standard format
 * for supplier payments (leverantorsbetalningar).
 *
 * File structure:
 *   TK 11 - Opening record (header)
 *   TK 14 - Payment record (one per payment)
 *   TK 29 - Total record (footer)
 *
 * Reference: Bankgirot technical specification for LB payments
 */

export interface PaymentFileRecord {
  supplierName: string
  amount: number // Amount in ore (cents), e.g. 10000 = 100.00 SEK
  paymentDate: string // YYMMDD
  receiverBankgiro?: string
  receiverPlusgiro?: string
  ocrReference?: string
  freeTextReference?: string
}

export interface PaymentFileInput {
  senderBankgiro: string
  creationDate: string // YYMMDD
  payments: PaymentFileRecord[]
}

export interface PaymentFileResult {
  content: string
  totalAmount: number
  paymentCount: number
}

/**
 * Pad a string to the right with spaces to reach the desired length
 */
function padRight(str: string, length: number): string {
  return str.slice(0, length).padEnd(length, ' ')
}

/**
 * Pad a number to the left with zeros to reach the desired length
 */
function padLeft(num: string | number, length: number): string {
  return String(num).slice(0, length).padStart(length, '0')
}

/**
 * Format a bankgiro number by removing dashes and spaces
 */
function formatBankgiro(bg: string): string {
  return bg.replace(/[-\s]/g, '')
}

/**
 * Convert amount from SEK to ore (cents)
 * E.g., 1234.56 -> 123456
 */
function amountToOre(amount: number): number {
  return Math.round(amount * 100)
}

/**
 * Format a date string (YYYY-MM-DD or Date) to YYMMDD
 */
function formatDate(dateStr: string): string {
  const date = new Date(dateStr)
  const yy = String(date.getFullYear()).slice(2)
  const mm = padLeft(date.getMonth() + 1, 2)
  const dd = padLeft(date.getDate(), 2)
  return `${yy}${mm}${dd}`
}

/**
 * Generate TK 11 - Opening record (header)
 *
 * Pos 1-2:   TK "11"
 * Pos 3-12:  Sender bankgiro (10 chars, right-aligned, zero-padded)
 * Pos 13-18: Creation date YYMMDD
 * Pos 19-42: Product name "LEVERANTORSBETALNINGAR  "
 * Pos 43-62: Reserved (spaces)
 * Pos 63-80: Reserved (spaces)
 */
function generateHeaderRecord(senderBankgiro: string, creationDate: string): string {
  const tk = '11'
  const bg = padLeft(formatBankgiro(senderBankgiro), 10)
  const date = creationDate.length === 6 ? creationDate : formatDate(creationDate)
  const product = padRight('LEVERANTORSBETALNINGAR', 24)
  const reserved = padRight('', 44)

  return `${tk}${bg}${date}${product}${reserved}`
}

/**
 * Generate TK 14 - Payment record (with bankgiro recipient)
 *
 * Pos 1-2:   TK "14"
 * Pos 3-12:  Receiver bankgiro (10 chars, right-aligned, zero-padded)
 * Pos 13-24: OCR/reference (12 chars, right-aligned, zero-padded)
 * Pos 25-36: Amount in ore (12 chars, right-aligned, zero-padded)
 * Pos 37-42: Payment date YYMMDD
 * Pos 43-47: Reserved (spaces)
 * Pos 48-52: Information to sender (5 chars, spaces)
 * Pos 53-80: Reserved (spaces)
 */
function generatePaymentRecord(payment: PaymentFileRecord): string {
  const tk = '14'

  // Determine recipient
  let receiverField: string
  if (payment.receiverBankgiro) {
    receiverField = padLeft(formatBankgiro(payment.receiverBankgiro), 10)
  } else if (payment.receiverPlusgiro) {
    receiverField = padLeft(payment.receiverPlusgiro.replace(/[-\s]/g, ''), 10)
  } else {
    receiverField = padLeft('', 10)
  }

  // Reference
  const reference = payment.ocrReference
    ? padLeft(payment.ocrReference.replace(/\s/g, ''), 12)
    : padRight(payment.freeTextReference || '', 12)

  // Amount in ore
  const amountOre = amountToOre(payment.amount)
  const amountField = padLeft(amountOre, 12)

  // Payment date
  const dateField = payment.paymentDate.length === 6
    ? payment.paymentDate
    : formatDate(payment.paymentDate)

  const reserved1 = padRight('', 5)
  const infoToSender = padRight('', 5)
  const reserved2 = padRight('', 28)

  return `${tk}${receiverField}${reference}${amountField}${dateField}${reserved1}${infoToSender}${reserved2}`
}

/**
 * Generate TK 29 - Total record (footer)
 *
 * Pos 1-2:   TK "29"
 * Pos 3-10:  Sender bankgiro (8 chars, right-aligned, zero-padded)
 * Pos 11-18: Number of payment records (8 chars, right-aligned, zero-padded)
 * Pos 19-30: Total amount in ore (12 chars, right-aligned, zero-padded)
 * Pos 31-31: Negative total flag ("0" for positive)
 * Pos 32-80: Reserved (spaces)
 */
function generateTotalRecord(
  senderBankgiro: string,
  paymentCount: number,
  totalAmountOre: number
): string {
  const tk = '29'
  const bg = padLeft(formatBankgiro(senderBankgiro), 8)
  const count = padLeft(paymentCount, 8)
  const total = padLeft(totalAmountOre, 12)
  const negativeFlag = '0'
  const reserved = padRight('', 49)

  return `${tk}${bg}${count}${total}${negativeFlag}${reserved}`
}

/**
 * Generate a complete Bankgiro LB payment file
 *
 * @param input - Payment file input data
 * @returns Payment file content, total amount, and payment count
 */
export function generateBankgiroPaymentFile(input: PaymentFileInput): PaymentFileResult {
  const lines: string[] = []

  // Creation date
  const creationDate = input.creationDate.length === 6
    ? input.creationDate
    : formatDate(input.creationDate)

  // Header record (TK 11)
  lines.push(generateHeaderRecord(input.senderBankgiro, creationDate))

  // Payment records (TK 14)
  let totalAmountOre = 0
  let paymentCount = 0

  for (const payment of input.payments) {
    lines.push(generatePaymentRecord(payment))
    totalAmountOre += amountToOre(payment.amount)
    paymentCount++
  }

  // Total record (TK 29)
  lines.push(generateTotalRecord(input.senderBankgiro, paymentCount, totalAmountOre))

  return {
    content: lines.join('\r\n'),
    totalAmount: totalAmountOre / 100,
    paymentCount,
  }
}

/**
 * Build payment file input from supplier invoices and company settings
 */
export function buildPaymentFileInput(
  senderBankgiro: string,
  paymentDate: string,
  invoices: Array<{
    total: number
    supplier?: {
      name: string
      bankgiro: string | null
      plusgiro: string | null
    } | null
    ocr_number: string | null
    payment_reference: string | null
    invoice_number: string
  }>
): PaymentFileInput {
  const payments: PaymentFileRecord[] = invoices.map((invoice) => ({
    supplierName: invoice.supplier?.name || 'Okänd leverantör',
    amount: invoice.total,
    paymentDate: paymentDate,
    receiverBankgiro: invoice.supplier?.bankgiro || undefined,
    receiverPlusgiro: invoice.supplier?.plusgiro || undefined,
    ocrReference: invoice.ocr_number || invoice.payment_reference || undefined,
    freeTextReference: !invoice.ocr_number && !invoice.payment_reference
      ? invoice.invoice_number
      : undefined,
  }))

  return {
    senderBankgiro: formatBankgiro(senderBankgiro),
    creationDate: paymentDate,
    payments,
  }
}
