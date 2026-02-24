/**
 * Export VAT Monitor Engine
 *
 * Analyses journal entry data to produce a momsdeklaration preview
 * focused on export and intra-community trade. Maps BAS accounts to
 * momsdeklaration boxes, breaks down revenue by destination type,
 * and validates invoice-to-account consistency.
 *
 * Pure functions — no Supabase, no React, no side effects.
 *
 * Complements the core VatDeclaration report by adding:
 *   - Revenue breakdown by destination (domestic / EU / non-EU)
 *   - Invoice-level validation (vat_treatment vs account)
 *   - Period-over-period comparison
 *
 * Reference: Skatteverket momsdeklaration (SKV 4700)
 */

import {
  ACCOUNT_TO_BOX,
  BOX_LABELS,
  type MomsBox,
} from '@/extensions/export/shared/moms-box-mapping'

// ── Types ────────────────────────────────────────────────────

/** Journal entry line data pre-fetched from GL */
export interface GLLine {
  account_number: string
  debit_amount: number
  credit_amount: number
}

/** Invoice data for validation (subset of core Invoice type) */
export interface VatMonitorInvoice {
  id: string
  invoice_number: string
  vat_treatment: string
  moms_ruta: string | null
  customer_id: string
}

/** Customer data for validation */
export interface VatMonitorCustomer {
  id: string
  name: string
  country: string
  vat_number: string | null
  vat_number_validated: boolean
}

/** A single momsdeklaration box result */
export interface VatBoxData {
  boxNumber: MomsBox
  label: string
  amount: number
  accounts: string[]
}

/** Revenue breakdown by destination type */
export interface RevenueBreakdown {
  domestic: { amount: number; percentage: number }
  euGoods: { amount: number; percentage: number }
  euServices: { amount: number; percentage: number }
  exportGoods: { amount: number; percentage: number }
  exportServices: { amount: number; percentage: number }
  triangular: { amount: number; percentage: number }
  totalRevenue: number
}

/** Warning about VAT data quality */
export interface VatMonitorWarning {
  type:
    | 'vat_treatment_mismatch'
    | 'missing_vat_number'
    | 'unvalidated_vat_number'
    | 'wrong_account'
  severity: 'error' | 'warning'
  invoiceId?: string
  invoiceNumber?: string
  customerName?: string
  message: string
}

/** Period comparison delta for a destination type */
export interface PeriodDelta {
  current: number
  previous: number
  change: number
  changePercent: number | null
}

/** Complete VAT Monitor report */
export interface VatMonitorReport {
  period: { year: number; month?: number; quarter?: number }
  boxes: VatBoxData[]
  revenueBreakdown: RevenueBreakdown
  vatSummary: {
    outputVat25: number
    outputVat12: number
    outputVat6: number
    totalOutputVat: number
    inputVat: number
    netVat: number
    isRefund: boolean
  }
  warnings: VatMonitorWarning[]
  comparison: PeriodComparison | null
}

/** Period-over-period comparison */
export interface PeriodComparison {
  domestic: PeriodDelta
  euGoods: PeriodDelta
  euServices: PeriodDelta
  exportGoods: PeriodDelta
  exportServices: PeriodDelta
  triangular: PeriodDelta
  totalRevenue: PeriodDelta
  netVat: PeriodDelta
}

/** Options for generating the VAT Monitor report */
export interface VatMonitorOptions {
  glLines: GLLine[]
  invoices?: VatMonitorInvoice[]
  customers?: VatMonitorCustomer[]
  year: number
  month?: number
  quarter?: number
  previousGlLines?: GLLine[]
}

// ── Revenue account groups ──────────────────────────────────

const DOMESTIC_ACCOUNTS = ['3001', '3002', '3003']
const EU_GOODS_ACCOUNTS = ['3108', '3521']
const EU_SERVICES_ACCOUNTS = ['3308']
const EXPORT_GOODS_ACCOUNTS = ['3105', '3522']
const EXPORT_SERVICES_ACCOUNTS = ['3305']
const TRIANGULATION_ACCOUNTS = ['3109']

const OUTPUT_VAT_ACCOUNTS: Record<string, string> = {
  '2611': '25%',
  '2621': '12%',
  '2631': '6%',
}

const INPUT_VAT_ACCOUNTS = ['2641', '2645']

// All accounts this engine cares about
const ALL_ACCOUNTS = [
  ...DOMESTIC_ACCOUNTS,
  ...EU_GOODS_ACCOUNTS,
  ...EU_SERVICES_ACCOUNTS,
  ...EXPORT_GOODS_ACCOUNTS,
  ...EXPORT_SERVICES_ACCOUNTS,
  ...TRIANGULATION_ACCOUNTS,
  ...Object.keys(OUTPUT_VAT_ACCOUNTS),
  ...INPUT_VAT_ACCOUNTS,
]

// ── Expected vat_treatment for revenue account groups ───────

const ACCOUNT_EXPECTED_VAT_TREATMENT: Record<string, string[]> = {
  '3001': ['standard_25'],
  '3002': ['reduced_12'],
  '3003': ['reduced_6'],
  '3108': ['reverse_charge'],
  '3521': ['reverse_charge'],
  '3109': ['reverse_charge'],
  '3308': ['reverse_charge'],
  '3105': ['export'],
  '3522': ['export'],
  '3305': ['export'],
}

// ── Core engine ──────────────────────────────────────────────

/**
 * Generate a VAT Monitor report from pre-fetched GL data.
 */
export function generateVatMonitorReport(options: VatMonitorOptions): VatMonitorReport {
  const { glLines, invoices, customers, year, month, quarter, previousGlLines } = options

  const warnings: VatMonitorWarning[] = []

  // Step 1: Aggregate GL lines into account credit balances
  const accountBalances = aggregateGLLines(glLines)

  // Step 2: Map accounts to boxes
  const boxes = buildBoxes(accountBalances)

  // Step 3: Calculate revenue breakdown
  const revenueBreakdown = calculateRevenueBreakdown(accountBalances)

  // Step 4: Calculate VAT summary
  const vatSummary = calculateVatSummary(accountBalances)

  // Step 5: Validate invoices if provided
  if (invoices && customers) {
    validateInvoices(invoices, customers, warnings)
  }

  // Step 6: Calculate period comparison if previous data provided
  let comparison: PeriodComparison | null = null
  if (previousGlLines) {
    const prevBalances = aggregateGLLines(previousGlLines)
    const prevBreakdown = calculateRevenueBreakdown(prevBalances)
    const prevVat = calculateVatSummary(prevBalances)
    comparison = buildComparison(revenueBreakdown, prevBreakdown, vatSummary.netVat, prevVat.netVat)
  }

  return {
    period: { year, month, quarter },
    boxes,
    revenueBreakdown,
    vatSummary,
    warnings,
    comparison,
  }
}

// ── GL aggregation ──────────────────────────────────────────

/**
 * Aggregate GL lines into net balances per account.
 * Revenue accounts: credit balance (credit - debit).
 * VAT accounts: see sign per account type.
 */
function aggregateGLLines(lines: GLLine[]): Map<string, number> {
  const balances = new Map<string, number>()

  for (const line of lines) {
    if (!ALL_ACCOUNTS.includes(line.account_number)) continue

    const credit = Number(line.credit_amount) || 0
    const debit = Number(line.debit_amount) || 0

    // Input VAT is debit-side, all others are credit-side
    const isInputVat = INPUT_VAT_ACCOUNTS.includes(line.account_number)
    const balance = isInputVat ? (debit - credit) : (credit - debit)

    balances.set(
      line.account_number,
      round2((balances.get(line.account_number) ?? 0) + balance),
    )
  }

  return balances
}

/** Sum balances for a set of accounts */
function sumAccounts(balances: Map<string, number>, accounts: string[]): number {
  return round2(accounts.reduce((sum, acc) => sum + (balances.get(acc) ?? 0), 0))
}

// ── Box building ────────────────────────────────────────────

function buildBoxes(balances: Map<string, number>): VatBoxData[] {
  // Group accounts by box
  const boxAccounts = new Map<MomsBox, string[]>()
  const boxAmounts = new Map<MomsBox, number>()

  for (const [account, balance] of balances) {
    const box = ACCOUNT_TO_BOX[account]
    if (!box) continue

    if (!boxAccounts.has(box)) boxAccounts.set(box, [])
    boxAccounts.get(box)!.push(account)

    boxAmounts.set(box, round2((boxAmounts.get(box) ?? 0) + balance))
  }

  // Build sorted box list
  const boxes: VatBoxData[] = []
  for (const [box, amount] of boxAmounts) {
    boxes.push({
      boxNumber: box,
      label: BOX_LABELS[box],
      amount: round2(amount),
      accounts: boxAccounts.get(box) ?? [],
    })
  }

  // Add box 49 (net VAT = output - input)
  const outputVat = sumAccounts(balances, Object.keys(OUTPUT_VAT_ACCOUNTS))
  const inputVat = sumAccounts(balances, INPUT_VAT_ACCOUNTS)
  const netVat = round2(outputVat - inputVat)

  boxes.push({
    boxNumber: '49',
    label: BOX_LABELS['49'],
    amount: netVat,
    accounts: [...Object.keys(OUTPUT_VAT_ACCOUNTS), ...INPUT_VAT_ACCOUNTS],
  })

  // Sort by box number
  boxes.sort((a, b) => a.boxNumber.localeCompare(b.boxNumber))

  return boxes
}

// ── Revenue breakdown ───────────────────────────────────────

function calculateRevenueBreakdown(balances: Map<string, number>): RevenueBreakdown {
  const domestic = sumAccounts(balances, DOMESTIC_ACCOUNTS)
  const euGoods = sumAccounts(balances, EU_GOODS_ACCOUNTS)
  const euServices = sumAccounts(balances, EU_SERVICES_ACCOUNTS)
  const exportGoods = sumAccounts(balances, EXPORT_GOODS_ACCOUNTS)
  const exportServices = sumAccounts(balances, EXPORT_SERVICES_ACCOUNTS)
  const triangular = sumAccounts(balances, TRIANGULATION_ACCOUNTS)

  const totalRevenue = round2(domestic + euGoods + euServices + exportGoods + exportServices + triangular)

  const pct = (amount: number) => totalRevenue > 0 ? round2((amount / totalRevenue) * 100) : 0

  return {
    domestic: { amount: domestic, percentage: pct(domestic) },
    euGoods: { amount: euGoods, percentage: pct(euGoods) },
    euServices: { amount: euServices, percentage: pct(euServices) },
    exportGoods: { amount: exportGoods, percentage: pct(exportGoods) },
    exportServices: { amount: exportServices, percentage: pct(exportServices) },
    triangular: { amount: triangular, percentage: pct(triangular) },
    totalRevenue,
  }
}

// ── VAT summary ─────────────────────────────────────────────

function calculateVatSummary(balances: Map<string, number>) {
  const outputVat25 = balances.get('2611') ?? 0
  const outputVat12 = balances.get('2621') ?? 0
  const outputVat6 = balances.get('2631') ?? 0
  const totalOutputVat = round2(outputVat25 + outputVat12 + outputVat6)
  const inputVat = sumAccounts(balances, INPUT_VAT_ACCOUNTS)
  const netVat = round2(totalOutputVat - inputVat)

  return {
    outputVat25: round2(outputVat25),
    outputVat12: round2(outputVat12),
    outputVat6: round2(outputVat6),
    totalOutputVat,
    inputVat: round2(inputVat),
    netVat,
    isRefund: netVat < 0,
  }
}

// ── Invoice validation ──────────────────────────────────────

function validateInvoices(
  invoices: VatMonitorInvoice[],
  customers: VatMonitorCustomer[],
  warnings: VatMonitorWarning[],
) {
  const customerMap = new Map(customers.map(c => [c.id, c]))

  for (const invoice of invoices) {
    const customer = customerMap.get(invoice.customer_id)

    // Check: reverse_charge invoices should have EU customer with VAT number
    if (invoice.vat_treatment === 'reverse_charge' && customer) {
      if (!customer.vat_number) {
        warnings.push({
          type: 'missing_vat_number',
          severity: 'error',
          invoiceId: invoice.id,
          invoiceNumber: invoice.invoice_number,
          customerName: customer.name,
          message: `Faktura ${invoice.invoice_number} (${customer.name}) har omvänd skattskyldighet men kunden saknar VAT-nummer.`,
        })
      } else if (!customer.vat_number_validated) {
        warnings.push({
          type: 'unvalidated_vat_number',
          severity: 'warning',
          invoiceId: invoice.id,
          invoiceNumber: invoice.invoice_number,
          customerName: customer.name,
          message: `Faktura ${invoice.invoice_number} (${customer.name}): VAT-nummer ${customer.vat_number} har inte validerats via VIES.`,
        })
      }
    }

    // Check: moms_ruta consistency with vat_treatment
    if (invoice.moms_ruta && invoice.vat_treatment) {
      const expectedBoxes = getExpectedBoxesForTreatment(invoice.vat_treatment)
      if (expectedBoxes.length > 0 && !expectedBoxes.includes(invoice.moms_ruta)) {
        warnings.push({
          type: 'vat_treatment_mismatch',
          severity: 'warning',
          invoiceId: invoice.id,
          invoiceNumber: invoice.invoice_number,
          message: `Faktura ${invoice.invoice_number} har momsbehandling "${invoice.vat_treatment}" men moms_ruta "${invoice.moms_ruta}" (förväntat: ${expectedBoxes.join('/')}).`,
        })
      }
    }
  }
}

/** Get expected momsdeklaration boxes for a vat_treatment value */
function getExpectedBoxesForTreatment(vatTreatment: string): string[] {
  switch (vatTreatment) {
    case 'standard_25':
    case 'reduced_12':
    case 'reduced_6':
      return ['05']
    case 'reverse_charge':
      return ['35', '38', '39']
    case 'export':
      return ['36', '40']
    default:
      return []
  }
}

// ── Period comparison ───────────────────────────────────────

function buildComparison(
  current: RevenueBreakdown,
  previous: RevenueBreakdown,
  currentNetVat: number,
  previousNetVat: number,
): PeriodComparison {
  return {
    domestic: makeDelta(current.domestic.amount, previous.domestic.amount),
    euGoods: makeDelta(current.euGoods.amount, previous.euGoods.amount),
    euServices: makeDelta(current.euServices.amount, previous.euServices.amount),
    exportGoods: makeDelta(current.exportGoods.amount, previous.exportGoods.amount),
    exportServices: makeDelta(current.exportServices.amount, previous.exportServices.amount),
    triangular: makeDelta(current.triangular.amount, previous.triangular.amount),
    totalRevenue: makeDelta(current.totalRevenue, previous.totalRevenue),
    netVat: makeDelta(currentNetVat, previousNetVat),
  }
}

function makeDelta(current: number, previous: number): PeriodDelta {
  const change = round2(current - previous)
  const changePercent = previous !== 0 ? round2((change / Math.abs(previous)) * 100) : null

  return { current, previous, change, changePercent }
}

// ── Helpers ─────────────────────────────────────────────────

function round2(value: number): number {
  return Math.round(value * 100) / 100
}

// ── Exported constants for API route ────────────────────────

/** All BAS accounts that the VAT Monitor needs from GL */
export const VAT_MONITOR_ACCOUNTS = ALL_ACCOUNTS
