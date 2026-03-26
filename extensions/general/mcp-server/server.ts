import { NextResponse } from 'next/server'
import {
  extractBearerToken,
  validateApiKey,
  createServiceClientNoCookies,
} from '@/lib/auth/api-keys'
import type { SupabaseClient } from '@supabase/supabase-js'
import { buildMappingResultFromCategory } from '@/lib/bookkeeping/category-mapping'
import { createTransactionJournalEntry } from '@/lib/bookkeeping/transaction-entries'
import { upsertCounterpartyTemplate, findCounterpartyTemplatesBatch, formatCounterpartyName } from '@/lib/bookkeeping/counterparty-templates'
import { eventBus } from '@/lib/events/bus'
import { getVatRules, getAvailableVatRates } from '@/lib/invoices/vat-rules'
import { fetchExchangeRate, convertToSEK } from '@/lib/currency/riksbanken'
import { generateIncomeStatement } from '@/lib/reports/income-statement'
import {
  calculateGrossMargin,
  calculateCashPosition,
  calculateExpenseRatio,
  calculateAvgPaymentDays,
} from '@/lib/reports/kpi'
import { generateTrialBalance } from '@/lib/reports/trial-balance'
import { generateARLedger } from '@/lib/reports/ar-ledger'
import { generateMonthlyBreakdown } from '@/lib/reports/monthly-breakdown'
import { RECEIPT_MATCHER_HTML } from './widget-html'
import { generateBalanceSheet } from '@/lib/reports/balance-sheet'
import { generateGeneralLedger } from '@/lib/reports/general-ledger'
import { generateSupplierLedger } from '@/lib/reports/supplier-ledger'
import { getReconciliationStatus } from '@/lib/reconciliation/bank-reconciliation'
import { createInvoicePaymentJournalEntry, createInvoiceCashEntry, createInvoiceJournalEntry } from '@/lib/bookkeeping/invoice-entries'
import { reverseEntry } from '@/lib/bookkeeping/engine'
import { getSuggestedCategories } from '@/lib/transactions/category-suggestions'
import { renderToBuffer } from '@react-pdf/renderer'
import { InvoicePDF } from '@/lib/invoices/pdf-template'
import { getEmailService } from '@/lib/email/service'
import {
  generateInvoiceEmailHtml,
  generateInvoiceEmailText,
  generateInvoiceEmailSubject,
} from '@/lib/email/invoice-templates'
import { uploadDocument } from '@/lib/core/documents/document-service'
// ensureInitialized() is called by the extension router (ext/[...path]/route.ts)
// which dispatches to this handler — no duplicate call needed here.
import type { Transaction, TransactionCategory, EntityType, VatTreatment, Invoice, Currency, CompanySettings, Customer, InvoiceItem } from '@/types'

// ── JSON-RPC types ───────────────────────────────────────────

interface JsonRpcRequest {
  jsonrpc: '2.0'
  id?: string | number
  method: string
  params?: Record<string, unknown>
}

interface JsonRpcResponse {
  jsonrpc: '2.0'
  id: string | number | null
  result?: unknown
  error?: { code: number; message: string; data?: unknown }
}

// ── MCP Tool definition ──────────────────────────────────────

interface McpToolAnnotations {
  readOnlyHint?: boolean
  destructiveHint?: boolean
  idempotentHint?: boolean
  openWorldHint?: boolean
}

interface McpTool {
  name: string
  description: string
  inputSchema: Record<string, unknown>
  annotations: McpToolAnnotations
  _meta?: { ui: { resourceUri: string } }
  execute: (
    args: Record<string, unknown>,
    userId: string,
    supabase: SupabaseClient
  ) => Promise<unknown>
}

// ── Shared constants ─────────────────────────────────────────

const VALID_CATEGORIES = [
  'income_services', 'income_products', 'income_other',
  'expense_equipment', 'expense_software', 'expense_travel', 'expense_office',
  'expense_marketing', 'expense_professional_services', 'expense_education',
  'expense_representation', 'expense_consumables', 'expense_vehicle',
  'expense_telecom', 'expense_bank_fees', 'expense_card_fees',
  'expense_currency_exchange', 'expense_other', 'private',
] as const

const VALID_VAT_TREATMENTS = [
  'standard_25', 'reduced_12', 'reduced_6', 'reverse_charge', 'export', 'exempt',
] as const

// ── Pending operations staging ───────────────────────────────

async function stagePendingOperation(
  supabase: SupabaseClient,
  userId: string,
  operationType: string,
  title: string,
  params: Record<string, unknown>,
  previewData: Record<string, unknown>
): Promise<{ staged: true; operation_id: string; message: string; preview: Record<string, unknown> }> {
  const { data, error } = await supabase
    .from('pending_operations')
    .insert({
      user_id: userId,
      operation_type: operationType,
      title,
      params,
      preview_data: previewData,
    })
    .select('id')
    .single()

  if (error) throw new Error(`Failed to stage operation: ${error.message}`)

  return {
    staged: true,
    operation_id: data.id,
    message: 'Operation staged for review. Open the gnubok web app to approve or reject it.',
    preview: previewData,
  }
}

// ── Shared categorization logic ──────────────────────────────

async function categorizeTransactionCore(
  txId: string,
  category: TransactionCategory,
  vatTreatment: VatTreatment | undefined,
  userId: string,
  supabase: SupabaseClient,
  confirm: boolean = false
): Promise<{
  preview?: boolean
  success?: boolean
  journal_entry_created?: boolean
  journal_entry_id?: string | null
  journal_entry_error?: string | null
  category: string
  debit_account: string
  credit_account: string
  amount: number
  currency: string
  vat_lines?: Array<{ account_number: string; debit_amount: number; credit_amount: number; description: string }>
  message?: string
  transaction?: Transaction
}> {
  // Validate category
  if (!VALID_CATEGORIES.includes(category as typeof VALID_CATEGORIES[number])) {
    throw new Error(
      `Invalid category "${category}". Valid categories: ${VALID_CATEGORIES.join(', ')}`
    )
  }

  if (vatTreatment && !VALID_VAT_TREATMENTS.includes(vatTreatment as typeof VALID_VAT_TREATMENTS[number])) {
    throw new Error(
      `Invalid vat_treatment "${vatTreatment}". Valid: ${VALID_VAT_TREATMENTS.join(', ')}`
    )
  }

  const isBusiness = category !== 'private'

  // Fetch the transaction
  const { data: transaction, error: fetchError } = await supabase
    .from('transactions')
    .select('*')
    .eq('id', txId)
    .eq('user_id', userId)
    .single()

  if (fetchError || !transaction) {
    throw new Error('Transaction not found. Check the transaction_id is correct.')
  }

  if (transaction.journal_entry_id) {
    return {
      success: true,
      journal_entry_created: false,
      journal_entry_id: transaction.journal_entry_id,
      journal_entry_error: 'Transaction already has a journal entry — use gnubok_list_uncategorized_transactions to find unbooked ones.',
      category,
      debit_account: '',
      credit_account: '',
      amount: Math.abs(transaction.amount),
      currency: transaction.currency,
      transaction: transaction as Transaction,
    }
  }

  // Get entity type
  const { data: settings } = await supabase
    .from('company_settings')
    .select('entity_type, fiscal_year_start_month')
    .eq('user_id', userId)
    .single()

  const entityType: EntityType = (settings?.entity_type as EntityType) || 'enskild_firma'

  // Build mapping
  const mappingResult = buildMappingResultFromCategory(
    category,
    transaction as Transaction,
    isBusiness,
    entityType,
    vatTreatment
  )

  if (!mappingResult.debit_account || !mappingResult.credit_account) {
    throw new Error(
      `No account mapping for category "${category}" with entity type "${entityType}". ` +
      'Try a different category or check your chart of accounts.'
    )
  }

  // Preview mode: return what would happen without executing
  if (!confirm) {
    return {
      preview: true,
      category,
      debit_account: mappingResult.debit_account,
      credit_account: mappingResult.credit_account,
      amount: Math.abs(transaction.amount),
      currency: transaction.currency,
      vat_lines: mappingResult.vat_lines.map(v => ({
        account_number: v.account_number,
        debit_amount: v.debit_amount,
        credit_amount: v.credit_amount,
        description: v.description,
      })),
      message: 'Preview only — no changes made. Call again with confirm: true to create the journal entry.',
    }
  }

  // Ensure fiscal period exists
  const fiscalYearStartMonth = settings?.fiscal_year_start_month ?? 1
  const txDate = new Date(transaction.date)
  const txMonth = txDate.getMonth() + 1
  const txYear = txDate.getFullYear()

  let periodStartYear: number
  if (fiscalYearStartMonth === 1) {
    periodStartYear = txYear
  } else if (txMonth >= fiscalYearStartMonth) {
    periodStartYear = txYear
  } else {
    periodStartYear = txYear - 1
  }

  const startMonth = String(fiscalYearStartMonth).padStart(2, '0')
  const periodStart = `${periodStartYear}-${startMonth}-01`

  const endYear = fiscalYearStartMonth === 1 ? periodStartYear : periodStartYear + 1
  const endMonth = fiscalYearStartMonth === 1 ? 12 : fiscalYearStartMonth - 1
  const lastDay = new Date(endYear, endMonth, 0).getDate()
  const periodEnd = `${endYear}-${String(endMonth).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`

  const periodName = fiscalYearStartMonth === 1
    ? `Räkenskapsår ${periodStartYear}`
    : `Räkenskapsår ${periodStartYear}/${endYear}`

  await supabase
    .from('fiscal_periods')
    .upsert(
      { user_id: userId, name: periodName, period_start: periodStart, period_end: periodEnd },
      { onConflict: 'user_id,period_start,period_end' }
    )

  // Create journal entry
  let journalEntryId: string | null = null
  let journalEntryError: string | null = null

  try {
    const journalEntry = await createTransactionJournalEntry(
      supabase,
      userId,
      transaction as Transaction,
      mappingResult
    )
    if (journalEntry) {
      journalEntryId = journalEntry.id
    }
  } catch (err) {
    journalEntryError = err instanceof Error ? err.message : 'Unknown error'
  }

  // Update transaction
  await supabase
    .from('transactions')
    .update({
      is_business: isBusiness,
      category,
      journal_entry_id: journalEntryId,
    })
    .eq('id', txId)

  // Emit event so extensions (mapping rules, etc.) can react
  await eventBus.emit({
    type: 'transaction.categorized',
    payload: {
      transaction: transaction as Transaction,
      account: mappingResult.debit_account,
      taxCode: mappingResult.vat_lines[0]?.account_number || '',
      userId,
    },
  })

  // Upsert counterparty template for future auto-matching
  try {
    await upsertCounterpartyTemplate(
      supabase, userId, transaction as Transaction, mappingResult, 'user_approved'
    )
  } catch {
    // Non-critical
  }

  return {
    success: true,
    journal_entry_created: !!journalEntryId,
    journal_entry_id: journalEntryId,
    journal_entry_error: journalEntryError,
    category,
    debit_account: mappingResult.debit_account,
    credit_account: mappingResult.credit_account,
    amount: Math.abs(transaction.amount),
    currency: transaction.currency,
    transaction: transaction as Transaction,
  }
}

// ── Tools ────────────────────────────────────────────────────

const tools: McpTool[] = [
  {
    name: 'gnubok_list_uncategorized_transactions',
    description:
      'List bank transactions that have not been categorized (no journal entry yet). ' +
      'Use this to see what needs bookkeeping attention.\n\n' +
      'Args:\n' +
      '  - limit (number, optional): Max results, 1–100 (default: 20)\n' +
      '  - offset (number, optional): Skip first N results for pagination (default: 0)\n\n' +
      'Returns JSON:\n' +
      '  { transactions: [{ id, date, description, amount, currency, merchant_name, reference }],\n' +
      '    count: number, total_count: number, has_more: boolean, next_offset?: number }\n\n' +
      'Examples:\n' +
      '  - "Show my uncategorized transactions" → call with no args\n' +
      '  - "Show next 50" → call with limit=50\n' +
      '  - "Show page 2" → call with offset=20\n\n' +
      'Error: Returns error text if the database query fails.',
    inputSchema: {
      type: 'object',
      properties: {
        limit: {
          type: 'number',
          description: 'Max results to return, 1–100 (default 20)',
        },
        offset: {
          type: 'number',
          description: 'Number of results to skip for pagination (default 0)',
        },
      },
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    async execute(args, userId, supabase) {
      const limit = Math.min(Math.max(1, Number(args.limit) || 20), 100)
      const offset = Math.max(0, Number(args.offset) || 0)

      // Get total count
      const { count: totalCount, error: countError } = await supabase
        .from('transactions')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId)
        .is('journal_entry_id', null)

      if (countError) throw new Error(`Database error: ${countError.message}`)

      const { data, error } = await supabase
        .from('transactions')
        .select(
          'id, date, description, amount, currency, merchant_name, reference, is_business, category'
        )
        .eq('user_id', userId)
        .is('journal_entry_id', null)
        .order('date', { ascending: false })
        .range(offset, offset + limit - 1)

      if (error) throw new Error(`Database error: ${error.message}`)

      const total = totalCount ?? 0
      const hasMore = total > offset + (data?.length ?? 0)

      return {
        transactions: data,
        count: data?.length ?? 0,
        total_count: total,
        has_more: hasMore,
        ...(hasMore ? { next_offset: offset + (data?.length ?? 0) } : {}),
      }
    },
  },

  {
    name: 'gnubok_categorize_transaction',
    description:
      'Categorize a bank transaction and stage the journal entry for user approval.\n\n' +
      'This tool stages the operation — the user reviews and approves it in the gnubok web app. ' +
      'The journal entry is NOT created until the user approves.\n\n' +
      'Args:\n' +
      '  - transaction_id (string, required): UUID of the transaction from gnubok_list_uncategorized_transactions\n' +
      '  - category (string, required): One of: ' + VALID_CATEGORIES.join(', ') + '\n' +
      '  - vat_treatment (string, optional): One of: ' + VALID_VAT_TREATMENTS.join(', ') + '. ' +
      'Defaults to standard_25 for business expenses.\n\n' +
      'Returns JSON:\n' +
      '  { staged: true, operation_id, message, preview: { debit_account, credit_account, amount, vat_lines } }\n\n' +
      'Examples:\n' +
      '  - "Book that as office supplies, 25% VAT" → category="expense_software"\n' +
      '  - "Mark as private" → category="private" (no journal entry created for private)\n' +
      '  - "Book as consulting income" → category="income_services"\n\n' +
      'Errors:\n' +
      '  - "Transaction not found" if the ID is invalid or belongs to another user\n' +
      '  - "Transaction already has a journal entry" if already categorized\n' +
      '  - "Invalid account mapping" if the category/entity type combination has no mapping',
    inputSchema: {
      type: 'object',
      properties: {
        transaction_id: {
          type: 'string',
          description: 'UUID of the transaction to categorize',
        },
        category: {
          type: 'string',
          description: 'Transaction category',
          enum: [...VALID_CATEGORIES],
        },
        vat_treatment: {
          type: 'string',
          description: 'VAT treatment override',
          enum: [...VALID_VAT_TREATMENTS],
        },
      },
      required: ['transaction_id', 'category'],
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false,
    },
    async execute(args, userId, supabase) {
      // Compute the preview (accounts, amounts, VAT lines)
      const result = await categorizeTransactionCore(
        args.transaction_id as string,
        args.category as TransactionCategory,
        args.vat_treatment as VatTreatment | undefined,
        userId,
        supabase,
        false // preview mode — execution happens via web UI commit
      )

      // If already has a journal entry, pass through as-is
      if (result.success && result.journal_entry_created === false) {
        const { transaction: _tx, ...publicResult } = result
        return publicResult
      }

      // Fetch transaction description for the title
      const { data: tx } = await supabase
        .from('transactions')
        .select('description, merchant_name, amount, currency')
        .eq('id', args.transaction_id as string)
        .eq('user_id', userId)
        .single()

      const txDesc = tx
        ? `${tx.merchant_name || tx.description || 'Transaktion'} ${tx.amount} ${tx.currency}`
        : String(args.transaction_id)

      // Stage for user approval
      return stagePendingOperation(supabase, userId, 'categorize_transaction',
        `Kategorisera: ${txDesc}`,
        {
          transaction_id: args.transaction_id,
          category: args.category,
          vat_treatment: args.vat_treatment || null,
        },
        {
          debit_account: result.debit_account,
          credit_account: result.credit_account,
          amount: result.amount,
          currency: result.currency,
          vat_lines: result.vat_lines || [],
          category: result.category,
        }
      )
    },
  },

  // ── Receipt matcher tool ──────────────────────────────────────

  {
    name: 'gnubok_receipt_matcher',
    description:
      'Open the receipt matcher widget. Shows uncategorized transactions with drag-and-drop ' +
      'receipt attachment. Renders an interactive UI inline in the conversation.\n\n' +
      'Args:\n' +
      '  - limit (number, optional): Max transactions to show, 1–50 (default: 20)\n\n' +
      'Returns JSON:\n' +
      '  { transactions: [...], categories: [...], vat_treatments: [...] }\n\n' +
      'Examples:\n' +
      '  - "Match my receipts" → call with no args\n' +
      '  - "Open receipt matcher" → call with no args',
    inputSchema: {
      type: 'object',
      properties: {
        limit: {
          type: 'number',
          description: 'Max transactions to show, 1–50 (default 20)',
        },
      },
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    _meta: { ui: { resourceUri: 'ui://receipt-matcher/app.html' } },
    async execute(args, userId, supabase) {
      const limit = Math.min(Math.max(1, Number(args.limit) || 20), 50)

      const { data, error } = await supabase
        .from('transactions')
        .select(
          'id, date, description, amount, currency, merchant_name, reference, is_business, category'
        )
        .eq('user_id', userId)
        .is('journal_entry_id', null)
        .order('date', { ascending: false })
        .limit(limit)

      if (error) throw new Error(`Database error: ${error.message}`)

      return {
        transactions: data ?? [],
        categories: [...VALID_CATEGORIES],
        vat_treatments: [...VALID_VAT_TREATMENTS],
      }
    },
  },

  // ── Customer tools ───────────────────────────────────────────

  {
    name: 'gnubok_list_customers',
    description:
      'List all customers. Use this to look up customer IDs for invoice creation.\n\n' +
      'Args: none\n\n' +
      'Returns JSON:\n' +
      '  { customers: [{ id, name, customer_type, email, org_number, vat_number, default_payment_terms }],\n' +
      '    count: number }',
    inputSchema: { type: 'object', properties: {} },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    async execute(_args, userId, supabase) {
      const { data, error } = await supabase
        .from('customers')
        .select('id, name, customer_type, email, org_number, vat_number, default_payment_terms, city, country')
        .eq('user_id', userId)
        .order('name')

      if (error) throw new Error(`Database error: ${error.message}`)

      return { customers: data, count: data?.length ?? 0 }
    },
  },

  {
    name: 'gnubok_create_customer',
    description:
      'Stage a new customer for user approval. Required before creating invoices.\n\n' +
      'The customer is NOT created immediately — it is staged for the user to review ' +
      'and approve in the gnubok web app.\n\n' +
      'Args:\n' +
      '  - name (string, required): Customer/company name\n' +
      '  - customer_type (string, required): individual, swedish_business, eu_business, non_eu_business\n' +
      '  - email (string, optional): Contact email\n' +
      '  - org_number (string, optional): Swedish org number (for swedish_business)\n' +
      '  - vat_number (string, optional): EU VAT number (for eu_business, triggers VIES validation)\n' +
      '  - payment_terms (number, optional): Days until due (default 30)\n' +
      '  - address (string, optional): Street address\n' +
      '  - postal_code (string, optional)\n' +
      '  - city (string, optional)\n' +
      '  - country (string, optional): Defaults to Sweden\n\n' +
      'Returns JSON: { staged: true, operation_id, message, preview }\n\n' +
      'Examples:\n' +
      '  - "Add Acme AB" → name="Acme AB", customer_type="swedish_business"\n' +
      '  - "Add a German client" → customer_type="eu_business", country="Germany"',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Customer name' },
        customer_type: {
          type: 'string',
          enum: ['individual', 'swedish_business', 'eu_business', 'non_eu_business'],
          description: 'Customer type',
        },
        email: { type: 'string', description: 'Email address' },
        org_number: { type: 'string', description: 'Swedish org number' },
        vat_number: { type: 'string', description: 'EU VAT number' },
        payment_terms: { type: 'number', description: 'Payment terms in days (default 30)' },
        address: { type: 'string', description: 'Street address' },
        postal_code: { type: 'string' },
        city: { type: 'string' },
        country: { type: 'string', description: 'Country (default Sweden)' },
      },
      required: ['name', 'customer_type'],
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false,
    },
    async execute(args, userId, supabase) {
      const name = args.name as string
      const customerType = args.customer_type as string

      if (!name?.trim()) throw new Error('Customer name is required.')
      if (!['individual', 'swedish_business', 'eu_business', 'non_eu_business'].includes(customerType)) {
        throw new Error('Invalid customer_type. Must be: individual, swedish_business, eu_business, non_eu_business')
      }

      const params = {
        name: name.trim(),
        customer_type: customerType,
        email: (args.email as string) || null,
        org_number: (args.org_number as string) || null,
        vat_number: (args.vat_number as string) || null,
        payment_terms: Number(args.payment_terms) || 30,
        address: (args.address as string) || null,
        postal_code: (args.postal_code as string) || null,
        city: (args.city as string) || null,
        country: (args.country as string) || 'Sweden',
      }

      return stagePendingOperation(supabase, userId, 'create_customer',
        `Ny kund: ${params.name}`,
        params,
        params // params ARE the preview for customers
      )
    },
  },

  // ── Invoice tools ────────────────────────────────────────────

  {
    name: 'gnubok_list_invoices',
    description:
      'List invoices, optionally filtered by status.\n\n' +
      'Args:\n' +
      '  - status (string, optional): Filter by status: draft, sent, paid, overdue, cancelled, credited\n' +
      '  - limit (number, optional): Max results, 1–100 (default 50)\n\n' +
      'Returns JSON:\n' +
      '  { invoices: [{ id, invoice_number, status, customer_name, total, currency, invoice_date, due_date }],\n' +
      '    count: number, total_count: number }\n\n' +
      'Examples:\n' +
      '  - "Show unpaid invoices" → status="sent"\n' +
      '  - "Show overdue invoices" → status="overdue"',
    inputSchema: {
      type: 'object',
      properties: {
        status: {
          type: 'string',
          enum: ['draft', 'sent', 'paid', 'overdue', 'cancelled', 'credited'],
          description: 'Filter by invoice status',
        },
        limit: { type: 'number', description: 'Max results (default 50, max 100)' },
      },
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    async execute(args, userId, supabase) {
      const limit = Math.min(Math.max(1, Number(args.limit) || 50), 100)
      const status = args.status as string | undefined

      let query = supabase
        .from('invoices')
        .select('id, invoice_number, status, customer_id, total, currency, invoice_date, due_date, document_type, customers(name)', { count: 'exact' })
        .eq('user_id', userId)

      if (status) {
        query = query.eq('status', status)
      }

      const { data, error, count } = await query
        .order('invoice_date', { ascending: false })
        .limit(limit)

      if (error) throw new Error(`Database error: ${error.message}`)

      const invoices = (data ?? []).map((inv: Record<string, unknown>) => ({
        id: inv.id,
        invoice_number: inv.invoice_number,
        status: inv.status,
        customer_name: (inv.customers as Record<string, unknown>)?.name ?? null,
        total: inv.total,
        currency: inv.currency,
        invoice_date: inv.invoice_date,
        due_date: inv.due_date,
        document_type: inv.document_type,
      }))

      return {
        invoices,
        count: invoices.length,
        total_count: count ?? invoices.length,
      }
    },
  },

  {
    name: 'gnubok_create_invoice',
    description:
      'Stage a new invoice for user approval. Validates inputs and calculates VAT preview.\n\n' +
      'The invoice is NOT created immediately — it is staged for the user to review ' +
      'and approve in the gnubok web app. The invoice number is assigned at approval time.\n\n' +
      'Args:\n' +
      '  - customer_id (string, required): UUID from gnubok_list_customers\n' +
      '  - items (array, required): Line items, each with:\n' +
      '      - description (string): What was sold/delivered\n' +
      '      - quantity (number): How many\n' +
      '      - unit (string): Unit of measure (st, tim, dag, mån)\n' +
      '      - unit_price (number): Price per unit excl. VAT\n' +
      '      - vat_rate (number, optional): Override VAT rate (0–100)\n' +
      '  - invoice_date (string, optional): YYYY-MM-DD (default today)\n' +
      '  - due_date (string, optional): YYYY-MM-DD (default based on payment terms)\n' +
      '  - currency (string, optional): SEK, EUR, USD, GBP, NOK, DKK (default SEK)\n' +
      '  - our_reference (string, optional)\n' +
      '  - your_reference (string, optional)\n' +
      '  - notes (string, optional): Notes printed on invoice\n\n' +
      'Returns JSON: { staged: true, operation_id, message, preview }\n\n' +
      'Examples:\n' +
      '  - "Invoice Acme for 15000 kr consulting" → items=[{description:"Konsulttjänster",quantity:1,unit:"st",unit_price:15000}]\n' +
      '  - "Invoice 10 hours at 1500/h" → items=[{description:"Konsulttjänster",quantity:10,unit:"tim",unit_price:1500}]',
    inputSchema: {
      type: 'object',
      properties: {
        customer_id: { type: 'string', description: 'Customer UUID' },
        items: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              description: { type: 'string' },
              quantity: { type: 'number' },
              unit: { type: 'string', description: 'st, tim, dag, mån' },
              unit_price: { type: 'number', description: 'Price per unit excl. VAT' },
              vat_rate: { type: 'number', description: 'VAT rate 0–100 (optional override)' },
            },
            required: ['description', 'quantity', 'unit', 'unit_price'],
          },
          description: 'Invoice line items',
        },
        invoice_date: { type: 'string', description: 'YYYY-MM-DD (default today)' },
        due_date: { type: 'string', description: 'YYYY-MM-DD (default from payment terms)' },
        currency: { type: 'string', enum: ['SEK', 'EUR', 'USD', 'GBP', 'NOK', 'DKK'] },
        our_reference: { type: 'string' },
        your_reference: { type: 'string' },
        notes: { type: 'string' },
      },
      required: ['customer_id', 'items'],
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false,
    },
    async execute(args, userId, supabase) {
      const customerId = args.customer_id as string
      const items = args.items as Array<{
        description: string
        quantity: number
        unit: string
        unit_price: number
        vat_rate?: number
      }>

      if (!customerId) throw new Error('customer_id is required. Use gnubok_list_customers to find IDs.')
      if (!items?.length) throw new Error('At least one item is required.')

      for (const [i, item] of items.entries()) {
        if (!item.description?.trim()) throw new Error(`Item ${i + 1}: description is required`)
        if (!item.quantity || item.quantity <= 0) throw new Error(`Item ${i + 1}: quantity must be positive`)
        if (!item.unit?.trim()) throw new Error(`Item ${i + 1}: unit is required (st, tim, dag)`)
        if (item.unit_price == null) throw new Error(`Item ${i + 1}: unit_price is required`)
      }

      const today = new Date().toISOString().split('T')[0]
      const currency = ((args.currency as string) || 'SEK') as Currency
      const invoiceDate = (args.invoice_date as string) || today

      // Fetch customer (full row for VAT rules)
      const { data: customer, error: custError } = await supabase
        .from('customers')
        .select('*')
        .eq('id', customerId)
        .eq('user_id', userId)
        .single()

      if (custError || !customer) {
        throw new Error('Customer not found. Use gnubok_list_customers to find valid IDs.')
      }

      // VAT rules from customer type (same logic as web UI)
      const vatRules = getVatRules(customer.customer_type, customer.vat_number_validated)
      const availableRates = getAvailableVatRates(customer.customer_type, customer.vat_number_validated)
      const allowedRates = new Set(availableRates.map((r) => r.rate))

      // Calculate per-item VAT
      const subtotal = items.reduce((s, item) => s + item.quantity * item.unit_price, 0)
      let vatAmount = 0
      for (const item of items) {
        const itemRate = item.vat_rate !== undefined ? item.vat_rate : vatRules.rate
        if (!allowedRates.has(itemRate)) {
          throw new Error(
            `VAT rate ${itemRate}% is not allowed for customer type "${customer.customer_type}". ` +
            `Allowed rates: ${availableRates.map((r) => r.rate + '%').join(', ')}`
          )
        }
        const lineTotal = item.quantity * item.unit_price
        vatAmount += Math.round(lineTotal * itemRate / 100 * 100) / 100
      }
      const total = subtotal + vatAmount

      // Due date from payment terms if not provided
      let dueDate = args.due_date as string | undefined
      if (!dueDate) {
        const d = new Date(invoiceDate)
        d.setDate(d.getDate() + (customer.default_payment_terms || 30))
        dueDate = d.toISOString().split('T')[0]
      }

      // Stage for user approval instead of creating directly
      return stagePendingOperation(supabase, userId, 'create_invoice',
        `Ny faktura: ${customer.name} ${Math.round(total * 100) / 100} ${currency}`,
        {
          customer_id: customerId,
          items,
          invoice_date: invoiceDate,
          due_date: dueDate,
          currency,
          our_reference: (args.our_reference as string) || null,
          your_reference: (args.your_reference as string) || null,
          notes: (args.notes as string) || null,
        },
        {
          customer_name: customer.name,
          customer_type: customer.customer_type,
          items: items.map(item => ({
            ...item,
            line_total: item.quantity * item.unit_price,
            vat_rate: item.vat_rate ?? vatRules.rate,
          })),
          subtotal: Math.round(subtotal * 100) / 100,
          vat_amount: Math.round(vatAmount * 100) / 100,
          total: Math.round(total * 100) / 100,
          currency,
          vat_treatment: vatRules.treatment,
          invoice_date: invoiceDate,
          due_date: dueDate,
        }
      )
    },
  },

  // ── Report tools ─────────────────────────────────────────────

  {
    name: 'gnubok_get_trial_balance',
    description:
      'Get the trial balance (huvudbok) for a fiscal period. Shows all account balances.\n\n' +
      'Args:\n' +
      '  - period_id (string, optional): Fiscal period UUID. If omitted, uses the most recent period.\n\n' +
      'Returns JSON:\n' +
      '  { rows: [{ account_number, account_name, period_debit, period_credit, closing_debit, closing_credit }],\n' +
      '    total_debit: number, total_credit: number, is_balanced: boolean, period_name: string }\n\n' +
      'Examples:\n' +
      '  - "What are my account balances?" → call with no args\n' +
      '  - "Trial balance for last year" → provide the period_id',
    inputSchema: {
      type: 'object',
      properties: {
        period_id: { type: 'string', description: 'Fiscal period UUID (default: most recent)' },
      },
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    async execute(args, userId, supabase) {
      let periodId = args.period_id as string | undefined

      // If no period specified, find the most recent one
      if (!periodId) {
        const { data: periods } = await supabase
          .from('fiscal_periods')
          .select('id, name')
          .eq('user_id', userId)
          .order('period_start', { ascending: false })
          .limit(1)
          .single()

        if (!periods) {
          throw new Error('No fiscal periods found. Categorize some transactions first to auto-create a period.')
        }
        periodId = periods.id
      }

      // Get period info
      const { data: period } = await supabase
        .from('fiscal_periods')
        .select('id, name, period_start, period_end')
        .eq('id', periodId)
        .eq('user_id', userId)
        .single()

      if (!period) throw new Error('Fiscal period not found.')

      // Aggregate journal entry lines
      const { data: lines, error } = await supabase
        .from('journal_entry_lines')
        .select('account_number, debit_amount, credit_amount, journal_entries!inner(status, user_id, fiscal_period_id)')
        .eq('journal_entries.user_id', userId)
        .eq('journal_entries.fiscal_period_id', periodId)
        .in('journal_entries.status', ['posted', 'reversed'])

      if (error) throw new Error(`Database error: ${error.message}`)

      // Get account names
      const { data: accounts } = await supabase
        .from('chart_of_accounts')
        .select('account_number, account_name')
        .eq('user_id', userId)

      const accountMap = new Map((accounts ?? []).map((a: { account_number: string; account_name: string }) => [a.account_number, a.account_name]))

      // Aggregate by account
      const totals = new Map<string, { debit: number; credit: number }>()
      for (const line of lines ?? []) {
        const acc = line.account_number
        const existing = totals.get(acc) ?? { debit: 0, credit: 0 }
        existing.debit += Number(line.debit_amount) || 0
        existing.credit += Number(line.credit_amount) || 0
        totals.set(acc, existing)
      }

      const rows = Array.from(totals.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([accNum, t]) => {
          const net = Math.round((t.debit - t.credit) * 100) / 100
          return {
            account_number: accNum,
            account_name: accountMap.get(accNum) ?? accNum,
            period_debit: Math.round(t.debit * 100) / 100,
            period_credit: Math.round(t.credit * 100) / 100,
            closing_debit: net > 0 ? net : 0,
            closing_credit: net < 0 ? Math.abs(net) : 0,
          }
        })

      const totalDebit = Math.round(rows.reduce((s, r) => s + r.closing_debit, 0) * 100) / 100
      const totalCredit = Math.round(rows.reduce((s, r) => s + r.closing_credit, 0) * 100) / 100

      return {
        rows,
        total_debit: totalDebit,
        total_credit: totalCredit,
        is_balanced: Math.abs(totalDebit - totalCredit) < 0.01,
        period_name: period.name,
        period_start: period.period_start,
        period_end: period.period_end,
        account_count: rows.length,
      }
    },
  },

  {
    name: 'gnubok_get_vat_report',
    description:
      'Get the VAT declaration (momsdeklaration) for a period. Shows all rutor (boxes) for SKV 4700.\n\n' +
      'Args:\n' +
      '  - period_type (string, required): monthly, quarterly, yearly\n' +
      '  - year (number, required): e.g. 2025\n' +
      '  - period (number, required): 1–12 for monthly, 1–4 for quarterly, 1 for yearly\n\n' +
      'Returns JSON: VAT declaration with all rutor (05, 10, 11, 12, 48, 49, etc.)\n' +
      '  ruta49 = VAT to pay (positive) or refund (negative)\n\n' +
      'Examples:\n' +
      '  - "VAT for Q1 2025" → period_type="quarterly", year=2025, period=1\n' +
      '  - "VAT for March 2025" → period_type="monthly", year=2025, period=3',
    inputSchema: {
      type: 'object',
      properties: {
        period_type: {
          type: 'string',
          enum: ['monthly', 'quarterly', 'yearly'],
          description: 'Period type',
        },
        year: { type: 'number', description: 'Year (e.g. 2025)' },
        period: { type: 'number', description: '1–12 for monthly, 1–4 for quarterly, 1 for yearly' },
      },
      required: ['period_type', 'year', 'period'],
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    async execute(args, userId, supabase) {
      const periodType = args.period_type as string
      const year = Number(args.year)
      const period = Number(args.period)

      if (!['monthly', 'quarterly', 'yearly'].includes(periodType)) {
        throw new Error('period_type must be: monthly, quarterly, yearly')
      }
      if (!year || year < 2000 || year > 2100) throw new Error('year must be between 2000 and 2100')
      if (periodType === 'monthly' && (period < 1 || period > 12)) throw new Error('period must be 1–12 for monthly')
      if (periodType === 'quarterly' && (period < 1 || period > 4)) throw new Error('period must be 1–4 for quarterly')

      // Calculate date range
      let startDate: string
      let endDate: string

      if (periodType === 'monthly') {
        startDate = `${year}-${String(period).padStart(2, '0')}-01`
        const lastDay = new Date(year, period, 0).getDate()
        endDate = `${year}-${String(period).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`
      } else if (periodType === 'quarterly') {
        const startMonth = (period - 1) * 3 + 1
        const endMonth = period * 3
        startDate = `${year}-${String(startMonth).padStart(2, '0')}-01`
        const lastDay = new Date(year, endMonth, 0).getDate()
        endDate = `${year}-${String(endMonth).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`
      } else {
        startDate = `${year}-01-01`
        endDate = `${year}-12-31`
      }

      // Get all posted journal entry lines in the date range
      const { data: lines, error } = await supabase
        .from('journal_entry_lines')
        .select('account_number, debit_amount, credit_amount, journal_entries!inner(entry_date, status, user_id)')
        .eq('journal_entries.user_id', userId)
        .in('journal_entries.status', ['posted', 'reversed'])
        .gte('journal_entries.entry_date', startDate)
        .lte('journal_entries.entry_date', endDate)

      if (error) throw new Error(`Database error: ${error.message}`)

      // Aggregate by account
      const accountTotals = new Map<string, { debit: number; credit: number }>()
      for (const line of lines ?? []) {
        const acc = line.account_number
        const existing = accountTotals.get(acc) ?? { debit: 0, credit: 0 }
        existing.debit += Number(line.debit_amount) || 0
        existing.credit += Number(line.credit_amount) || 0
        accountTotals.set(acc, existing)
      }

      function creditBalance(acc: string): number {
        const t = accountTotals.get(acc)
        return t ? Math.round((t.credit - t.debit) * 100) / 100 : 0
      }

      function debitBalance(acc: string): number {
        const t = accountTotals.get(acc)
        return t ? Math.round((t.debit - t.credit) * 100) / 100 : 0
      }

      // Map accounts to rutor
      const ruta05 = creditBalance('3001') + creditBalance('3002') + creditBalance('3003')
      const ruta10 = creditBalance('2611')
      const ruta11 = creditBalance('2621')
      const ruta12 = creditBalance('2631')
      const ruta39 = creditBalance('3308')
      const ruta40 = creditBalance('3305')
      const ruta48 = debitBalance('2641') + debitBalance('2645')
      const ruta49 = Math.round((ruta10 + ruta11 + ruta12 - ruta48) * 100) / 100

      const monthNames = ['Januari', 'Februari', 'Mars', 'April', 'Maj', 'Juni',
        'Juli', 'Augusti', 'September', 'Oktober', 'November', 'December']

      let periodLabel: string
      if (periodType === 'monthly') periodLabel = `${monthNames[period - 1]} ${year}`
      else if (periodType === 'quarterly') periodLabel = `Q${period} ${year}`
      else periodLabel = `${year}`

      return {
        period: { type: periodType, year, period, start: startDate, end: endDate },
        period_label: periodLabel,
        rutor: {
          ruta05: Math.abs(ruta05),
          ruta10: Math.abs(ruta10),
          ruta11: Math.abs(ruta11),
          ruta12: Math.abs(ruta12),
          ruta39: Math.abs(ruta39),
          ruta40: Math.abs(ruta40),
          ruta48: Math.abs(ruta48),
          ruta49,
        },
        summary: ruta49 > 0
          ? `Moms att betala: ${Math.abs(ruta49).toFixed(2)} kr`
          : ruta49 < 0
            ? `Moms att få tillbaka: ${Math.abs(ruta49).toFixed(2)} kr`
            : 'Noll i moms',
      }
    },
  },

  // ── KPI & Income Statement tools ─────────────────────────────

  {
    name: 'gnubok_get_kpi_report',
    description:
      'Get key performance indicators for the business. Returns gross margin, net result, cash position, ' +
      'receivables, expense ratio, average payment days, VAT liability, and monthly trend data.\n\n' +
      'Args:\n' +
      '  - period_id (string, optional): Fiscal period UUID. If omitted, uses the most recent period.\n\n' +
      'Returns JSON:\n' +
      '  { gross_margin: %|null, net_result: SEK, cash_position: SEK, outstanding_receivables: SEK,\n' +
      '    overdue_receivables: SEK, expense_ratio: %|null, avg_payment_days: days|null,\n' +
      '    vat_liability: SEK, total_revenue: SEK, total_expenses: SEK,\n' +
      '    months: [{ label, income, expenses, net }] }\n\n' +
      'Examples:\n' +
      '  - "How is my business doing?" → call with no args\n' +
      '  - "What are my KPIs?" → call with no args\n' +
      '  - "Show me the numbers" → call with no args',
    inputSchema: {
      type: 'object',
      properties: {
        period_id: { type: 'string', description: 'Fiscal period UUID (default: most recent)' },
      },
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    async execute(args, userId, supabase) {
      let periodId = args.period_id as string | undefined

      if (!periodId) {
        const { data: periods } = await supabase
          .from('fiscal_periods')
          .select('id')
          .eq('user_id', userId)
          .order('period_start', { ascending: false })
          .limit(1)
          .single()

        if (!periods) {
          throw new Error('No fiscal periods found. Categorize some transactions first.')
        }
        periodId = periods.id
      }

      // Verify period belongs to user
      const { data: period } = await supabase
        .from('fiscal_periods')
        .select('id, name, period_start, period_end')
        .eq('id', periodId)
        .eq('user_id', userId)
        .single()

      if (!period) throw new Error('Fiscal period not found.')

      // Run queries in parallel (same as the KPI API route)
      const [incomeStatement, trialBalance, arLedger, monthlyBreakdown, paidInvoices] =
        await Promise.all([
          generateIncomeStatement(supabase, userId, periodId!),
          generateTrialBalance(supabase, userId, periodId!),
          generateARLedger(supabase, userId),
          generateMonthlyBreakdown(supabase, userId, periodId!),
          supabase
            .from('invoices')
            .select('invoice_date, paid_at')
            .eq('user_id', userId)
            .eq('status', 'paid')
            .not('paid_at', 'is', null),
        ])

      const grossMargin = calculateGrossMargin(incomeStatement)
      const cashPosition = calculateCashPosition(trialBalance.rows)
      const expenseRatio = calculateExpenseRatio(incomeStatement)
      const avgPaymentDays = calculateAvgPaymentDays(
        (paidInvoices.data ?? []) as { invoice_date: string; paid_at: string }[]
      )

      // AR ledger uses entries, each with invoices that have outstanding amounts
      const outstandingReceivables = arLedger.total_outstanding
      const overdueReceivables = arLedger.total_overdue

      // VAT liability from trial balance
      const getClosing = (accNum: string) => {
        const row = trialBalance.rows.find((r) => r.account_number === accNum)
        if (!row) return 0
        return row.closing_credit - row.closing_debit
      }
      const vatLiability = Math.round(
        (getClosing('2611') + getClosing('2621') + getClosing('2631') -
          getClosing('2641') - getClosing('2645')) * 100
      ) / 100

      return {
        period_name: period.name,
        period_start: period.period_start,
        period_end: period.period_end,
        gross_margin: grossMargin,
        net_result: incomeStatement.net_result,
        cash_position: cashPosition,
        outstanding_receivables: Math.round(outstandingReceivables * 100) / 100,
        overdue_receivables: Math.round(overdueReceivables * 100) / 100,
        expense_ratio: expenseRatio,
        avg_payment_days: avgPaymentDays,
        paid_invoice_count: paidInvoices.data?.length ?? 0,
        vat_liability: vatLiability,
        total_revenue: incomeStatement.total_revenue,
        total_expenses: incomeStatement.total_expenses,
        months: monthlyBreakdown.months,
      }
    },
  },

  {
    name: 'gnubok_get_income_statement',
    description:
      'Get the income statement (resultaträkning) for a fiscal period. Shows revenue, expenses, ' +
      'and net result broken down by account category.\n\n' +
      'Args:\n' +
      '  - period_id (string, optional): Fiscal period UUID. If omitted, uses the most recent period.\n\n' +
      'Returns JSON:\n' +
      '  { revenue_sections, total_revenue, expense_sections, total_expenses, net_result,\n' +
      '    period: { start, end } }\n\n' +
      'Examples:\n' +
      '  - "What is my profit this year?" → call with no args\n' +
      '  - "Show my income statement" → call with no args',
    inputSchema: {
      type: 'object',
      properties: {
        period_id: { type: 'string', description: 'Fiscal period UUID (default: most recent)' },
      },
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    async execute(args, userId, supabase) {
      let periodId = args.period_id as string | undefined

      if (!periodId) {
        const { data: periods } = await supabase
          .from('fiscal_periods')
          .select('id')
          .eq('user_id', userId)
          .order('period_start', { ascending: false })
          .limit(1)
          .single()

        if (!periods) {
          throw new Error('No fiscal periods found. Categorize some transactions first.')
        }
        periodId = periods.id
      }

      const { data: period } = await supabase
        .from('fiscal_periods')
        .select('id, name, period_start, period_end')
        .eq('id', periodId)
        .eq('user_id', userId)
        .single()

      if (!period) throw new Error('Fiscal period not found.')

      const result = await generateIncomeStatement(supabase, userId, periodId!)
      result.period = { start: period.period_start, end: period.period_end }

      return {
        period_name: period.name,
        ...result,
      }
    },
  },

  // ── Invoice Operations ───────────────────────────────────────

  {
    name: 'gnubok_mark_invoice_as_paid',
    description:
      'Mark an invoice as paid and create the payment journal entry. ' +
      'Supports both accrual (faktureringsmetoden) and cash (kontantmetoden) accounting.\n\n' +
      'Args:\n' +
      '  - invoice_id (string, required): UUID of the invoice\n' +
      '  - payment_date (string, optional): ISO date YYYY-MM-DD (default: today)\n\n' +
      'Returns JSON:\n' +
      '  { success: true, status: "paid", paid_at: string, paid_amount: number, journal_entry_id?: string }\n\n' +
      'Accrual: creates clearing entry (Debit 1930, Credit 1510).\n' +
      'Cash: creates revenue entry (Debit 1930, Credit 30xx/26xx).\n\n' +
      'Errors:\n' +
      '  - Invoice must be in "sent" or "overdue" status\n' +
      '  - Invoice not found if ID is invalid or belongs to another user',
    inputSchema: {
      type: 'object',
      properties: {
        invoice_id: { type: 'string', description: 'UUID of the invoice' },
        payment_date: { type: 'string', description: 'Payment date YYYY-MM-DD (default: today)' },
      },
      required: ['invoice_id'],
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false,
    },
    async execute(args, userId, supabase) {
      const invoiceId = args.invoice_id as string
      if (!invoiceId) throw new Error('invoice_id is required')

      const { data: invoice, error: invoiceError } = await supabase
        .from('invoices')
        .select('*, customer:customers(*), items:invoice_items(*)')
        .eq('id', invoiceId)
        .eq('user_id', userId)
        .single()

      if (invoiceError || !invoice) throw new Error('Invoice not found')
      if (invoice.status !== 'sent' && invoice.status !== 'overdue') {
        throw new Error('Invoice can only be marked as paid when status is "sent" or "overdue"')
      }

      const now = new Date().toISOString()
      const paymentDate = (args.payment_date as string) || now.split('T')[0]

      const { data: settings } = await supabase
        .from('company_settings')
        .select('accounting_method, entity_type')
        .eq('user_id', userId)
        .single()

      const accountingMethod = settings?.accounting_method || 'accrual'
      const entityType = (settings?.entity_type as EntityType) || 'enskild_firma'
      const isRealInvoice = !invoice.document_type || invoice.document_type === 'invoice'
      let journalEntryId: string | null = null

      if (isRealInvoice) {
        if (accountingMethod === 'accrual') {
          const je = await createInvoicePaymentJournalEntry(
            supabase, userId, invoice as Invoice, paymentDate, undefined, invoice.customer?.name
          )
          journalEntryId = je?.id ?? null
        } else {
          const je = await createInvoiceCashEntry(
            supabase, userId, invoice as Invoice, paymentDate, entityType, invoice.customer?.name
          )
          journalEntryId = je?.id ?? null
        }
      }

      const { error: updateError } = await supabase
        .from('invoices')
        .update({ status: 'paid', paid_at: now, paid_amount: invoice.total })
        .eq('id', invoiceId)
        .eq('user_id', userId)

      if (updateError) throw new Error('Failed to update invoice status')

      return {
        success: true,
        status: 'paid',
        paid_at: now,
        paid_amount: invoice.total,
        journal_entry_id: journalEntryId,
      }
    },
  },

  {
    name: 'gnubok_send_invoice',
    description:
      'Send an invoice to the customer via email with a PDF attachment. ' +
      'Also creates the revenue journal entry (accrual method) and stores the PDF.\n\n' +
      'Args:\n' +
      '  - invoice_id (string, required): UUID of the invoice to send\n\n' +
      'Returns JSON:\n' +
      '  { success: true, message: string, messageId?: string }\n\n' +
      'Prerequisites:\n' +
      '  - Customer must have an email address\n' +
      '  - Email service must be configured (RESEND_API_KEY)\n' +
      '  - Company settings must exist\n\n' +
      'Errors:\n' +
      '  - "Email service not configured" if RESEND_API_KEY is missing\n' +
      '  - "Customer has no email address" if customer email is empty\n' +
      '  - "Company settings missing" if not set up',
    inputSchema: {
      type: 'object',
      properties: {
        invoice_id: { type: 'string', description: 'UUID of the invoice to send' },
      },
      required: ['invoice_id'],
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
    async execute(args, userId, supabase) {
      const invoiceId = args.invoice_id as string
      if (!invoiceId) throw new Error('invoice_id is required')

      const emailService = getEmailService()
      if (!emailService.isConfigured()) {
        throw new Error('Email service not configured. Ensure RESEND_API_KEY and RESEND_FROM_EMAIL are set.')
      }

      const { data: invoice, error: invoiceError } = await supabase
        .from('invoices')
        .select('*, customer:customers(*), items:invoice_items(*)')
        .eq('id', invoiceId)
        .eq('user_id', userId)
        .single()

      if (invoiceError || !invoice) throw new Error('Invoice not found')

      const customer = invoice.customer as Customer
      if (!customer.email) throw new Error('Customer has no email address. Update customer details first.')

      const { data: company, error: companyError } = await supabase
        .from('company_settings')
        .select('*')
        .eq('user_id', userId)
        .single()

      if (companyError || !company) throw new Error('Company settings missing')

      const items = (invoice.items as InvoiceItem[]).sort(
        (a: InvoiceItem, b: InvoiceItem) => a.sort_order - b.sort_order
      )

      // If credit note, fetch original invoice number
      let originalInvoiceNumber: string | undefined
      if (invoice.credited_invoice_id) {
        const { data: orig } = await supabase
          .from('invoices')
          .select('invoice_number')
          .eq('id', invoice.credited_invoice_id)
          .single()
        if (orig) originalInvoiceNumber = orig.invoice_number
      }

      // Generate PDF
      const pdfBuffer = await renderToBuffer(
        InvoicePDF({
          invoice: invoice as Invoice,
          customer,
          items,
          company: company as CompanySettings,
          originalInvoiceNumber,
        })
      )

      // Determine filename
      const isCreditNote = !!invoice.credited_invoice_id
      const docType = invoice.document_type || 'invoice'
      let filename: string
      if (isCreditNote) filename = `kreditfaktura-${invoice.invoice_number}.pdf`
      else if (docType === 'proforma') filename = `proformafaktura-${invoice.invoice_number}.pdf`
      else if (docType === 'delivery_note') filename = `foljesedel-${invoice.invoice_number}.pdf`
      else filename = `faktura-${invoice.invoice_number}.pdf`

      // Get user email for CC
      const { data: { user: authUser } } = await supabase.auth.admin.getUserById(userId)
      const ccAddress = company.email || authUser?.email

      // Send email
      const emailData = { invoice: invoice as Invoice, customer, company: company as CompanySettings }
      const result = await emailService.sendEmail({
        to: customer.email,
        cc: ccAddress,
        subject: generateInvoiceEmailSubject(emailData),
        html: generateInvoiceEmailHtml(emailData),
        text: generateInvoiceEmailText(emailData),
        replyTo: company.email || undefined,
        fromName: company.company_name,
        attachments: [{ filename, content: pdfBuffer, contentType: 'application/pdf' }],
      })

      if (!result.success) throw new Error(`Failed to send email: ${result.error}`)

      // Update status to sent
      await supabase.from('invoices').update({ status: 'sent' }).eq('id', invoiceId).eq('user_id', userId)

      // Create journal entry (non-blocking)
      const isRealInvoice = !invoice.document_type || invoice.document_type === 'invoice'
      let createdJournalEntryId: string | undefined
      if (isRealInvoice && (company.accounting_method === 'accrual' || !company.accounting_method)) {
        try {
          const je = await createInvoiceJournalEntry(
            supabase, userId, invoice as Invoice, (company as CompanySettings).entity_type
          )
          if (je) {
            createdJournalEntryId = je.id
            await supabase.from('invoices').update({ journal_entry_id: je.id }).eq('id', invoiceId)
          }
        } catch {
          // Non-blocking
        }
      }

      // Store PDF as document (non-blocking)
      if (isRealInvoice) {
        try {
          const pdfArrayBuffer = new Uint8Array(pdfBuffer).buffer as ArrayBuffer
          await uploadDocument(supabase, userId, {
            name: filename,
            buffer: pdfArrayBuffer,
            type: 'application/pdf',
          }, {
            upload_source: 'system',
            journal_entry_id: createdJournalEntryId,
          })
        } catch {
          // Non-blocking
        }
      }

      await eventBus.emit({ type: 'invoice.sent', payload: { invoice: invoice as Invoice, userId } })

      return {
        success: true,
        message: `Invoice ${invoice.invoice_number} sent to ${customer.email}`,
        messageId: result.messageId,
      }
    },
  },

  {
    name: 'gnubok_mark_invoice_as_sent',
    description:
      'Mark a draft invoice as sent without sending an email. Use this when the invoice ' +
      'was delivered outside the system (e.g., printed or sent manually).\n\n' +
      'Args:\n' +
      '  - invoice_id (string, required): UUID of the draft invoice\n\n' +
      'Returns JSON:\n' +
      '  { success: true, status: "sent", journal_entry_id?: string }\n\n' +
      'Under accrual method: creates the revenue journal entry.\n' +
      'Under cash method: no journal entry (booking at payment).\n\n' +
      'Errors:\n' +
      '  - Invoice must be in "draft" status',
    inputSchema: {
      type: 'object',
      properties: {
        invoice_id: { type: 'string', description: 'UUID of the draft invoice' },
      },
      required: ['invoice_id'],
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false,
    },
    async execute(args, userId, supabase) {
      const invoiceId = args.invoice_id as string
      if (!invoiceId) throw new Error('invoice_id is required')

      const { data: invoice, error: invoiceError } = await supabase
        .from('invoices')
        .select('*, customer:customers(*), items:invoice_items(*)')
        .eq('id', invoiceId)
        .eq('user_id', userId)
        .single()

      if (invoiceError || !invoice) throw new Error('Invoice not found')
      if (invoice.status !== 'draft') throw new Error('Only draft invoices can be marked as sent')

      const { error: updateError } = await supabase
        .from('invoices')
        .update({ status: 'sent' })
        .eq('id', invoiceId)
        .eq('user_id', userId)

      if (updateError) throw new Error('Failed to update invoice status')

      const { data: settings } = await supabase
        .from('company_settings')
        .select('accounting_method, entity_type')
        .eq('user_id', userId)
        .single()

      const isRealInvoice = !invoice.document_type || invoice.document_type === 'invoice'
      let journalEntryId: string | null = null

      if (isRealInvoice && (settings?.accounting_method === 'accrual' || !settings?.accounting_method)) {
        try {
          const je = await createInvoiceJournalEntry(
            supabase, userId, invoice as Invoice,
            (settings?.entity_type as EntityType) || 'enskild_firma',
            invoice.customer?.name
          )
          if (je) {
            journalEntryId = je.id
            await supabase.from('invoices').update({ journal_entry_id: je.id }).eq('id', invoiceId)
          }
        } catch {
          // Non-blocking
        }
      }

      return { success: true, status: 'sent', journal_entry_id: journalEntryId }
    },
  },

  // ── Supplier Operations (Read-Only) ──────────────────────────

  {
    name: 'gnubok_list_suppliers',
    description:
      'List all suppliers (leverantörer) with contact and payment details.\n\n' +
      'Args: none\n\n' +
      'Returns JSON:\n' +
      '  { suppliers: [{ id, name, supplier_type, email, org_number, vat_number,\n' +
      '    default_expense_account, default_payment_terms, city, country }], count: number }',
    inputSchema: { type: 'object', properties: {} },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    async execute(_args, userId, supabase) {
      const { data, error } = await supabase
        .from('suppliers')
        .select('id, name, supplier_type, email, phone, org_number, vat_number, default_expense_account, default_payment_terms, default_currency, city, country')
        .eq('user_id', userId)
        .order('name', { ascending: true })

      if (error) throw new Error(`Database error: ${error.message}`)

      return { suppliers: data ?? [], count: data?.length ?? 0 }
    },
  },

  {
    name: 'gnubok_list_supplier_invoices',
    description:
      'List supplier invoices (leverantörsfakturor) with optional status filter.\n\n' +
      'Args:\n' +
      '  - status (string, optional): Filter by status — "registered", "approved", "overdue", "paid",\n' +
      '    "to_pay" (approved + overdue), or "all" (default)\n' +
      '  - limit (number, optional): Max results, 1–100 (default 50)\n\n' +
      'Returns JSON:\n' +
      '  { invoices: [{ id, supplier_invoice_number, invoice_date, due_date, status,\n' +
      '    total, total_sek, currency, vat_treatment, supplier: { id, name } }],\n' +
      '    count: number }',
    inputSchema: {
      type: 'object',
      properties: {
        status: {
          type: 'string',
          description: 'Filter: registered, approved, overdue, paid, to_pay, all (default)',
          enum: ['registered', 'approved', 'overdue', 'paid', 'to_pay', 'all'],
        },
        limit: { type: 'number', description: 'Max results 1–100 (default 50)' },
      },
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    async execute(args, userId, supabase) {
      const limit = Math.min(Math.max(1, Number(args.limit) || 50), 100)
      const status = (args.status as string) || 'all'

      let query = supabase
        .from('supplier_invoices')
        .select('id, supplier_invoice_number, invoice_date, due_date, status, total, total_sek, currency, vat_treatment, remaining_amount, supplier:suppliers(id, name)')
        .eq('user_id', userId)

      if (status !== 'all') {
        if (status === 'to_pay') {
          query = query.in('status', ['approved', 'overdue'])
        } else {
          query = query.eq('status', status)
        }
      }

      const { data, error } = await query.order('due_date', { ascending: true }).limit(limit)

      if (error) throw new Error(`Database error: ${error.message}`)

      return { invoices: data ?? [], count: data?.length ?? 0 }
    },
  },

  // ── Counterparty Templates & Suggestions ─────────────────────

  {
    name: 'gnubok_get_counterparty_templates',
    description:
      'List active counterparty categorization templates. These are learned patterns from ' +
      'previous categorizations, used for auto-matching future transactions.\n\n' +
      'Args:\n' +
      '  - limit (number, optional): Max results, 1–200 (default 100)\n\n' +
      'Returns JSON:\n' +
      '  { templates: [{ id, counterparty_name, debit_account, credit_account,\n' +
      '    vat_treatment, category, occurrence_count, confidence, source }],\n' +
      '    count: number }',
    inputSchema: {
      type: 'object',
      properties: {
        limit: { type: 'number', description: 'Max results 1–200 (default 100)' },
      },
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    async execute(args, userId, supabase) {
      const limit = Math.min(Math.max(1, Number(args.limit) || 100), 200)

      const { data, error } = await supabase
        .from('categorization_templates')
        .select('id, counterparty_name, counterparty_aliases, debit_account, credit_account, vat_treatment, vat_account, category, line_pattern, occurrence_count, confidence, last_seen_date, source')
        .eq('user_id', userId)
        .eq('is_active', true)
        .order('occurrence_count', { ascending: false })
        .limit(limit)

      if (error) throw new Error(`Database error: ${error.message}`)

      return {
        templates: (data ?? []).map((t) => ({
          ...t,
          counterparty_name_display: formatCounterpartyName(t.counterparty_name),
        })),
        count: data?.length ?? 0,
      }
    },
  },

  {
    name: 'gnubok_suggest_categories',
    description:
      'Get category and template suggestions for uncategorized transactions. Uses mapping rules, ' +
      'pattern matching, user history, and counterparty templates to suggest the most likely categories.\n\n' +
      'Args:\n' +
      '  - transaction_ids (string[], required): Up to 20 transaction UUIDs\n\n' +
      'Returns JSON:\n' +
      '  { suggestions: { [tx_id]: [{ category, label, account, confidence, source }] },\n' +
      '    counterparty_matches: { [tx_id]: { template_name, confidence, match_method } } }\n\n' +
      'Sources: "mapping_rule" (highest), "pattern" (keyword), "history" (past categorizations).\n' +
      'Counterparty matches use exact, normalized, or fuzzy Levenshtein matching.',
    inputSchema: {
      type: 'object',
      properties: {
        transaction_ids: {
          type: 'array',
          items: { type: 'string' },
          description: 'Up to 20 transaction UUIDs',
        },
      },
      required: ['transaction_ids'],
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    async execute(args, userId, supabase) {
      const ids = args.transaction_ids as string[]
      if (!ids || ids.length === 0) throw new Error('transaction_ids is required (non-empty array)')
      const limitedIds = ids.slice(0, 20)

      // Fetch transactions
      const { data: transactions, error: txError } = await supabase
        .from('transactions')
        .select('*')
        .eq('user_id', userId)
        .in('id', limitedIds)

      if (txError) throw new Error(`Database error: ${txError.message}`)
      if (!transactions || transactions.length === 0) throw new Error('No transactions found')

      // Fetch mapping rules
      const { data: mappingRules } = await supabase
        .from('mapping_rules')
        .select('*')
        .or(`user_id.eq.${userId},user_id.is.null`)
        .eq('is_active', true)
        .order('priority', { ascending: false })

      // Build category history from past categorizations
      const { data: historicalTxns } = await supabase
        .from('transactions')
        .select('category')
        .eq('user_id', userId)
        .not('is_business', 'is', null)
        .neq('category', 'uncategorized')
        .neq('category', 'private')
        .limit(200)

      const categoryHistory: Record<string, number> = {}
      for (const tx of historicalTxns || []) {
        if (tx.category) categoryHistory[tx.category] = (categoryHistory[tx.category] || 0) + 1
      }

      // Batch counterparty template matching
      const counterpartyMatches = await findCounterpartyTemplatesBatch(
        supabase, userId, transactions as Transaction[]
      )

      // Generate suggestions per transaction
      const suggestions: Record<string, unknown[]> = {}
      const counterpartyResult: Record<string, unknown> = {}

      for (const tx of transactions) {
        suggestions[tx.id] = getSuggestedCategories(
          tx as Transaction, mappingRules ?? [], categoryHistory
        )

        const cpMatch = counterpartyMatches.get(tx.id)
        if (cpMatch) {
          counterpartyResult[tx.id] = {
            template_name: formatCounterpartyName(cpMatch.template.counterparty_name),
            debit_account: cpMatch.template.debit_account,
            credit_account: cpMatch.template.credit_account,
            category: cpMatch.template.category,
            confidence: cpMatch.confidence,
            match_method: cpMatch.matchMethod,
            occurrence_count: cpMatch.template.occurrence_count,
          }
        }
      }

      return { suggestions, counterparty_matches: counterpartyResult }
    },
  },

  // ── Accounts & Chart of Accounts ─────────────────────────────

  {
    name: 'gnubok_list_accounts',
    description:
      'List accounts from the chart of accounts (kontoplan) with optional filtering.\n\n' +
      'Args:\n' +
      '  - account_class (number, optional): Filter by class (1=assets, 2=liabilities, 3=revenue,\n' +
      '    4–7=expenses, 8=financial)\n' +
      '  - active_only (boolean, optional): Only show active accounts (default: true)\n\n' +
      'Returns JSON:\n' +
      '  { accounts: [{ account_number, account_name, account_class, account_type,\n' +
      '    normal_balance, is_active }], count: number }',
    inputSchema: {
      type: 'object',
      properties: {
        account_class: { type: 'number', description: 'Filter by class (1–8)' },
        active_only: { type: 'boolean', description: 'Only active accounts (default: true)' },
      },
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    async execute(args, userId, supabase) {
      const activeOnly = args.active_only !== false
      const accountClass = args.account_class as number | undefined

      let query = supabase
        .from('chart_of_accounts')
        .select('account_number, account_name, account_class, account_group, account_type, normal_balance, is_active, description')
        .eq('user_id', userId)
        .order('sort_order')

      if (activeOnly) query = query.eq('is_active', true)
      if (accountClass !== undefined) query = query.eq('account_class', accountClass)

      const { data, error } = await query

      if (error) throw new Error(`Database error: ${error.message}`)

      return { accounts: data ?? [], count: data?.length ?? 0 }
    },
  },

  // ── Reports ──────────────────────────────────────────────────

  {
    name: 'gnubok_get_balance_sheet',
    description:
      'Generate balance sheet (balansräkning) for a fiscal period.\n\n' +
      'Args:\n' +
      '  - period_id (string, optional): Fiscal period UUID. If omitted, uses the most recent period.\n\n' +
      'Returns JSON:\n' +
      '  { assets: { sections, total }, equity_and_liabilities: { sections, total },\n' +
      '    is_balanced: boolean, period_name: string, period: { start, end } }',
    inputSchema: {
      type: 'object',
      properties: {
        period_id: { type: 'string', description: 'Fiscal period UUID (default: most recent)' },
      },
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    async execute(args, userId, supabase) {
      let periodId = args.period_id as string | undefined

      if (!periodId) {
        const { data: periods } = await supabase
          .from('fiscal_periods')
          .select('id')
          .eq('user_id', userId)
          .order('period_start', { ascending: false })
          .limit(1)
          .single()

        if (!periods) throw new Error('No fiscal periods found. Create one first.')
        periodId = periods.id
      }

      const { data: period } = await supabase
        .from('fiscal_periods')
        .select('id, name, period_start, period_end')
        .eq('id', periodId)
        .eq('user_id', userId)
        .single()

      if (!period) throw new Error('Fiscal period not found.')

      const result = await generateBalanceSheet(supabase, userId, periodId!)

      return {
        period_name: period.name,
        ...result,
        period: { start: period.period_start, end: period.period_end },
      }
    },
  },

  {
    name: 'gnubok_get_general_ledger',
    description:
      'Generate general ledger (huvudbok) for a fiscal period, optionally filtered by account range.\n\n' +
      'Args:\n' +
      '  - period_id (string, optional): Fiscal period UUID (default: most recent)\n' +
      '  - account_from (string, optional): Starting account number (e.g., "1930")\n' +
      '  - account_to (string, optional): Ending account number (e.g., "1939")\n\n' +
      'Returns JSON:\n' +
      '  { accounts: [{ account_number, account_name, opening_balance,\n' +
      '    entries: [{ date, voucher, description, debit, credit, balance }],\n' +
      '    closing_balance }] }',
    inputSchema: {
      type: 'object',
      properties: {
        period_id: { type: 'string', description: 'Fiscal period UUID (default: most recent)' },
        account_from: { type: 'string', description: 'Starting account number filter' },
        account_to: { type: 'string', description: 'Ending account number filter' },
      },
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    async execute(args, userId, supabase) {
      let periodId = args.period_id as string | undefined

      if (!periodId) {
        const { data: periods } = await supabase
          .from('fiscal_periods')
          .select('id')
          .eq('user_id', userId)
          .order('period_start', { ascending: false })
          .limit(1)
          .single()

        if (!periods) throw new Error('No fiscal periods found.')
        periodId = periods.id
      }

      const accountFrom = args.account_from as string | undefined
      const accountTo = args.account_to as string | undefined

      return await generateGeneralLedger(supabase, userId, periodId!, accountFrom, accountTo)
    },
  },

  {
    name: 'gnubok_get_ar_ledger',
    description:
      'Generate accounts receivable ledger (kundreskontra). Shows outstanding customer invoices ' +
      'with aging information.\n\n' +
      'Args:\n' +
      '  - as_of_date (string, optional): Balance date YYYY-MM-DD (default: today)\n\n' +
      'Returns JSON:\n' +
      '  { customers: [{ name, invoices: [{ invoice_number, date, due_date, total,\n' +
      '    paid_amount, remaining, days_overdue }], total_outstanding }],\n' +
      '    total_outstanding: number }',
    inputSchema: {
      type: 'object',
      properties: {
        as_of_date: { type: 'string', description: 'Balance date YYYY-MM-DD (default: today)' },
      },
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    async execute(args, userId, supabase) {
      const asOfDate = args.as_of_date as string | undefined
      return await generateARLedger(supabase, userId, asOfDate)
    },
  },

  {
    name: 'gnubok_get_supplier_ledger',
    description:
      'Generate accounts payable ledger (leverantörsreskontra). Shows outstanding supplier invoices ' +
      'with aging information.\n\n' +
      'Args:\n' +
      '  - as_of_date (string, optional): Balance date YYYY-MM-DD (default: today)\n\n' +
      'Returns JSON:\n' +
      '  { suppliers: [{ name, invoices: [{ invoice_number, date, due_date, total,\n' +
      '    paid_amount, remaining, days_overdue }], total_outstanding }],\n' +
      '    total_outstanding: number }',
    inputSchema: {
      type: 'object',
      properties: {
        as_of_date: { type: 'string', description: 'Balance date YYYY-MM-DD (default: today)' },
      },
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    async execute(args, userId, supabase) {
      const asOfDate = args.as_of_date as string | undefined
      return await generateSupplierLedger(supabase, userId, asOfDate)
    },
  },

  // ── Transaction Matching ─────────────────────────────────────

  {
    name: 'gnubok_match_transaction_to_invoice',
    description:
      'Match a bank transaction to a customer invoice. Links the transaction to the invoice, ' +
      'creates the payment journal entry, and updates the invoice status. Supports partial payments.\n\n' +
      'If the transaction was previously categorized, the old journal entry is automatically reversed (storno).\n\n' +
      'Args:\n' +
      '  - transaction_id (string, required): UUID of the bank transaction (must be income, amount > 0)\n' +
      '  - invoice_id (string, required): UUID of the invoice to match\n\n' +
      'Returns JSON:\n' +
      '  { success: true, invoice_status: "paid"|"partially_paid", paid_amount: number,\n' +
      '    remaining_amount: number, journal_entry_id?: string }\n\n' +
      'Errors:\n' +
      '  - Transaction must be income (amount > 0)\n' +
      '  - Transaction must not already be linked to an invoice\n' +
      '  - Invoice must be in "sent", "overdue", or "partially_paid" status',
    inputSchema: {
      type: 'object',
      properties: {
        transaction_id: { type: 'string', description: 'UUID of the bank transaction' },
        invoice_id: { type: 'string', description: 'UUID of the invoice to match' },
      },
      required: ['transaction_id', 'invoice_id'],
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false,
    },
    async execute(args, userId, supabase) {
      const transactionId = args.transaction_id as string
      const invoiceId = args.invoice_id as string
      if (!transactionId || !invoiceId) throw new Error('transaction_id and invoice_id are required')

      // Fetch transaction
      const { data: transaction, error: txError } = await supabase
        .from('transactions')
        .select('*')
        .eq('id', transactionId)
        .eq('user_id', userId)
        .single()

      if (txError || !transaction) throw new Error('Transaction not found')
      if (transaction.amount <= 0) throw new Error('Only income transactions (amount > 0) can be matched to invoices')
      if (transaction.invoice_id) throw new Error('Transaction is already linked to an invoice')

      // Fetch invoice
      const { data: invoice, error: invError } = await supabase
        .from('invoices')
        .select('*, customer:customers(*), items:invoice_items(*)')
        .eq('id', invoiceId)
        .eq('user_id', userId)
        .single()

      if (invError || !invoice) throw new Error('Invoice not found')
      if (invoice.status !== 'sent' && invoice.status !== 'overdue' && invoice.status !== 'partially_paid') {
        throw new Error('Invoice is not in a matchable state (must be sent, overdue, or partially_paid)')
      }

      // Storno conflicting journal entry if exists
      if (transaction.journal_entry_id) {
        await reverseEntry(supabase, userId, transaction.journal_entry_id)
        await supabase.from('transactions').update({ journal_entry_id: null }).eq('id', transactionId)
      }

      const now = new Date().toISOString()
      const paidAmount = transaction.amount
      const newPaidAmount = Math.round(((invoice.paid_amount || 0) + paidAmount) * 100) / 100
      const currentRemaining = invoice.remaining_amount ?? (invoice.total - (invoice.paid_amount || 0))
      const newRemaining = Math.max(0, Math.round((currentRemaining - paidAmount) * 100) / 100)
      const isFullyPaid = newRemaining <= 0
      const newStatus = isFullyPaid ? 'paid' : 'partially_paid'

      // Fetch accounting method
      const { data: settings } = await supabase
        .from('company_settings')
        .select('accounting_method, entity_type')
        .eq('user_id', userId)
        .single()

      const accountingMethod = settings?.accounting_method || 'accrual'
      const entityType = (settings?.entity_type as EntityType) || 'enskild_firma'

      // Create journal entry (method-aware)
      let journalEntryId: string | null = null
      let journalEntryError: string | null = null

      try {
        if (accountingMethod === 'cash' && isFullyPaid) {
          const je = await createInvoiceCashEntry(
            supabase, userId, invoice as Invoice, transaction.date, entityType, invoice.customer?.name
          )
          journalEntryId = je?.id ?? null
        } else {
          const je = await createInvoicePaymentJournalEntry(
            supabase, userId, invoice as Invoice, transaction.date, undefined, invoice.customer?.name, paidAmount
          )
          journalEntryId = je?.id ?? null
        }
      } catch (err) {
        journalEntryError = err instanceof Error ? err.message : 'Unknown error'
      }

      // Optimistic lock update on invoice
      const { data: updatedRows, error: updateInvError } = await supabase
        .from('invoices')
        .update({
          status: newStatus,
          paid_at: isFullyPaid ? now : null,
          paid_amount: newPaidAmount,
          remaining_amount: newRemaining,
        })
        .eq('id', invoiceId)
        .in('status', ['sent', 'overdue', 'partially_paid'])
        .select('id')

      if (updateInvError) throw new Error('Failed to update invoice status')
      if (!updatedRows || updatedRows.length === 0) {
        throw new Error('Invoice has already been fully paid or is no longer matchable')
      }

      // Record payment
      const paymentNotes = (accountingMethod === 'cash' && !isFullyPaid)
        ? 'Kontantmetoden: intäkt bokförs vid slutbetalning'
        : null

      const { error: paymentError } = await supabase
        .from('invoice_payments')
        .insert({
          user_id: userId,
          invoice_id: invoiceId,
          payment_date: transaction.date,
          amount: paidAmount,
          currency: invoice.currency,
          exchange_rate: invoice.exchange_rate,
          journal_entry_id: journalEntryId,
          transaction_id: transactionId,
          notes: paymentNotes,
        })

      if (paymentError) {
        if (paymentError.code === '23505') throw new Error('This transaction is already matched to this invoice')
        throw new Error('Failed to record invoice payment')
      }

      // Update transaction
      const { error: updateTxError } = await supabase
        .from('transactions')
        .update({
          invoice_id: invoiceId,
          potential_invoice_id: null,
          journal_entry_id: journalEntryId,
          is_business: true,
          category: 'income_services',
        })
        .eq('id', transactionId)

      if (updateTxError) throw new Error('Failed to link transaction to invoice')

      try {
        eventBus.emit({
          type: 'invoice.match_confirmed',
          payload: { invoice: invoice as Invoice, transaction: transaction as Transaction, userId },
        })
      } catch {
        // Non-critical
      }

      return {
        success: true,
        invoice_status: newStatus,
        paid_at: isFullyPaid ? now : null,
        paid_amount: newPaidAmount,
        remaining_amount: newRemaining,
        journal_entry_id: journalEntryId,
        journal_entry_error: journalEntryError,
      }
    },
  },

  // ── Fiscal Periods ───────────────────────────────────────────

  {
    name: 'gnubok_list_fiscal_periods',
    description:
      'List all fiscal periods (räkenskapsperioder) with their status.\n\n' +
      'Args: none\n\n' +
      'Returns JSON:\n' +
      '  { periods: [{ id, name, period_start, period_end, status }], count: number }\n\n' +
      'Status values: "active" (open), "locked" (no new entries), "closed" (year-end completed).',
    inputSchema: { type: 'object', properties: {} },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    async execute(_args, userId, supabase) {
      const { data, error } = await supabase
        .from('fiscal_periods')
        .select('id, name, period_start, period_end, status')
        .eq('user_id', userId)
        .order('period_start', { ascending: false })

      if (error) throw new Error(`Database error: ${error.message}`)

      return { periods: data ?? [], count: data?.length ?? 0 }
    },
  },

  // ── Reconciliation ───────────────────────────────────────────

  {
    name: 'gnubok_get_reconciliation_status',
    description:
      'Get bank reconciliation status showing matched vs unmatched transactions and ledger entries.\n\n' +
      'Args:\n' +
      '  - date_from (string, optional): Start date YYYY-MM-DD\n' +
      '  - date_to (string, optional): End date YYYY-MM-DD\n\n' +
      'Returns JSON:\n' +
      '  { total_transactions: number, matched: number, unmatched: number,\n' +
      '    match_rate: number, bank_balance: number, ledger_balance: number,\n' +
      '    difference: number }',
    inputSchema: {
      type: 'object',
      properties: {
        date_from: { type: 'string', description: 'Start date YYYY-MM-DD' },
        date_to: { type: 'string', description: 'End date YYYY-MM-DD' },
      },
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    async execute(args, userId, supabase) {
      const dateFrom = args.date_from as string | undefined
      const dateTo = args.date_to as string | undefined
      return await getReconciliationStatus(supabase, userId, dateFrom, dateTo)
    },
  },
]

// ── MCP Protocol Handler ─────────────────────────────────────

const SERVER_INFO = {
  name: 'gnubok',
  version: '1.0.0',
}

const PROTOCOL_VERSION = '2025-03-26'

function jsonRpc(id: string | number | null, result: unknown): JsonRpcResponse {
  return { jsonrpc: '2.0', id, result }
}

function jsonRpcError(
  id: string | number | null,
  code: number,
  message: string,
  data?: unknown
): JsonRpcResponse {
  return { jsonrpc: '2.0', id, error: { code, message, data } }
}

/**
 * Handle an MCP JSON-RPC request.
 * Auth is done via Bearer API key (extension route has skipAuth: true).
 */
export async function handleMcpRequest(request: Request): Promise<Response> {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
  const wwwAuth = `Bearer resource_metadata="${appUrl}/.well-known/oauth-protected-resource"`

  // ── Pre-auth: handle fire-and-forget notifications before auth check ──
  // MCP notifications have no id and don't expect error responses.
  // Checking auth on them would return 401 which confuses clients.
  const clonedRequest = request.clone()
  try {
    const peek = await clonedRequest.json()
    if (peek.method === 'notifications/initialized') {
      return new Response(null, { status: 202 })
    }
  } catch {
    // Not valid JSON — fall through to auth + parse below
  }

  // ── Auth ──
  const token = extractBearerToken(request)
  if (!token) {
    return new Response('Unauthorized', {
      status: 401,
      headers: { 'WWW-Authenticate': wwwAuth },
    })
  }

  const authResult = await validateApiKey(token)
  if ('error' in authResult) {
    const status = authResult.status
    if (status === 429) {
      return new Response(authResult.error, {
        status: 429,
        headers: { 'Content-Type': 'text/plain', 'Retry-After': '60' },
      })
    }
    return new Response('Unauthorized', {
      status: 401,
      headers: { 'WWW-Authenticate': wwwAuth },
    })
  }

  const { userId } = authResult
  const supabase = createServiceClientNoCookies()

  // ── Parse JSON-RPC ──
  let body: JsonRpcRequest
  try {
    body = await request.json()
  } catch {
    return NextResponse.json(
      jsonRpcError(null, -32700, 'Parse error: expected JSON-RPC 2.0 request body'),
      { status: 400 }
    )
  }

  if (body.jsonrpc !== '2.0' || !body.method) {
    return NextResponse.json(
      jsonRpcError(body.id ?? null, -32600, 'Invalid Request: must include jsonrpc="2.0" and method'),
      { status: 400 }
    )
  }

  // ── Dispatch ──
  const { method, id, params } = body

  switch (method) {
    case 'initialize': {
      const SUPPORTED_VERSIONS = new Set(['2025-03-26', '2024-11-05'])
      const clientVersion = (params as Record<string, unknown>)?.protocolVersion as string | undefined
      const negotiatedVersion =
        clientVersion && SUPPORTED_VERSIONS.has(clientVersion) ? clientVersion : PROTOCOL_VERSION
      return NextResponse.json(
        jsonRpc(id ?? null, {
          protocolVersion: negotiatedVersion,
          capabilities: {
            tools: { listChanged: false },
            resources: { listChanged: false },
          },
          serverInfo: SERVER_INFO,
          instructions: 'gnubok — Swedish bookkeeping via conversation. Categorize transactions, manage invoices (create, send, mark paid), view suppliers, match payments, get reports (trial balance, income statement, balance sheet, VAT, KPI, general ledger, AR/AP ledgers), and explore chart of accounts.',
        })
      )
    }

    case 'notifications/initialized':
      // Handled pre-auth above, but if it somehow reaches here, still return 202
      return new Response(null, { status: 202 })

    case 'ping':
      return NextResponse.json(jsonRpc(id ?? null, {}))

    case 'tools/list':
      return NextResponse.json(
        jsonRpc(id ?? null, {
          tools: tools.map((t) => ({
            name: t.name,
            description: t.description,
            inputSchema: t.inputSchema,
            annotations: t.annotations,
            ...(t._meta ? { _meta: t._meta } : {}),
          })),
        })
      )

    case 'tools/call': {
      const toolName = (params as Record<string, unknown>)?.name as string
      const toolArgs = ((params as Record<string, unknown>)?.arguments ?? {}) as Record<
        string,
        unknown
      >

      const tool = tools.find((t) => t.name === toolName)
      if (!tool) {
        const available = tools.map((t) => t.name).join(', ')
        return NextResponse.json(
          jsonRpcError(id ?? null, -32602, `Unknown tool: "${toolName}". Available tools: ${available}`)
        )
      }

      try {
        const result = await tool.execute(toolArgs, userId, supabase)
        const response: Record<string, unknown> = {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        }
        if (tool._meta?.ui) {
          response.structuredContent = result
        }
        return NextResponse.json(jsonRpc(id ?? null, response))
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Tool execution failed'
        return NextResponse.json(
          jsonRpc(id ?? null, {
            content: [{ type: 'text', text: JSON.stringify({ error: message }) }],
            isError: true,
          })
        )
      }
    }

    case 'resources/list':
      return NextResponse.json(
        jsonRpc(id ?? null, {
          resources: [
            {
              uri: 'ui://receipt-matcher/app.html',
              name: 'Receipt Matcher',
              description: 'Interactive widget for matching receipts to uncategorized transactions',
              mimeType: 'text/html;profile=mcp-app',
            },
          ],
        })
      )

    case 'resources/read': {
      const uri = (params as Record<string, unknown>)?.uri as string
      if (uri === 'ui://receipt-matcher/app.html') {
        return NextResponse.json(
          jsonRpc(id ?? null, {
            contents: [
              {
                uri,
                mimeType: 'text/html;profile=mcp-app',
                text: RECEIPT_MATCHER_HTML,
              },
            ],
          })
        )
      }
      return NextResponse.json(
        jsonRpcError(id ?? null, -32602, `Resource not found: "${uri}"`)
      )
    }

    default:
      return NextResponse.json(
        jsonRpcError(id ?? null, -32601, `Method not found: "${method}"`)
      )
  }
}
