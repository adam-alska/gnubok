import { createClient } from '@/lib/supabase/server'
import type { Transaction, Invoice, Customer, MappingRule } from '@/types'
import type {
  BankReconciliationItem,
  MatchSuggestion,
  SplitEntry,
} from '@/types/bank-reconciliation'

// =============================================================================
// Confidence thresholds
// =============================================================================

const CONFIDENCE = {
  OCR_MATCH: 0.99,
  AMOUNT_AND_CUSTOMER: 0.95,
  EXACT_AMOUNT: 0.80,
  RULE_MATCH: 0.75,
  FUZZY_MATCH: 0.60,
  MIN_AUTO_MATCH: 0.80,
  MIN_SUGGESTION: 0.40,
}

const FUZZY_TOLERANCE = 0.01 // 1%

// =============================================================================
// Utility functions
// =============================================================================

function amountsMatchExact(a: number, b: number): boolean {
  return Math.round(a * 100) === Math.round(b * 100)
}

function amountsMatchFuzzy(a: number, b: number): boolean {
  if (b === 0) return false
  const diff = Math.abs(a - b)
  return diff <= Math.abs(b) * FUZZY_TOLERANCE
}

function extractOCRFromDescription(description: string): string | null {
  // Swedish OCR numbers: typically 2-25 digits, often at the end of a description
  // Common patterns: "OCR 12345678", "Ref: 12345678", just a long number
  const ocrPatterns = [
    /OCR\s*[:.]?\s*(\d{2,25})/i,
    /Ref\s*[:.]?\s*(\d{2,25})/i,
    /Referens\s*[:.]?\s*(\d{2,25})/i,
    /Betalningsreferens\s*[:.]?\s*(\d{2,25})/i,
  ]

  for (const pattern of ocrPatterns) {
    const match = description.match(pattern)
    if (match) return match[1]
  }

  return null
}

function normalizeDescription(desc: string): string {
  return desc.toLowerCase().replace(/[^a-z0-9åäö]/g, ' ').replace(/\s+/g, ' ').trim()
}

function descriptionSimilarity(a: string, b: string): number {
  const wordsA = new Set(normalizeDescription(a).split(' ').filter(w => w.length > 2))
  const wordsB = new Set(normalizeDescription(b).split(' ').filter(w => w.length > 2))

  if (wordsA.size === 0 || wordsB.size === 0) return 0

  let matches = 0
  for (const word of wordsA) {
    if (wordsB.has(word)) matches++
  }

  return matches / Math.max(wordsA.size, wordsB.size)
}

function customerNameInDescription(
  customerName: string | undefined,
  description: string,
  merchantName: string | null
): boolean {
  if (!customerName) return false
  const searchTerms = customerName.toLowerCase().split(/\s+/).filter(t => t.length > 2)
  const searchText = `${description} ${merchantName || ''}`.toLowerCase()
  return searchTerms.some(term => searchText.includes(term))
}

// =============================================================================
// Core matching: auto-match all transactions
// =============================================================================

export async function autoMatchTransactions(
  userId: string,
  sessionId: string,
  transactions: Transaction[],
  invoices: (Invoice & { customer?: Customer })[],
  supplierInvoices: Array<{
    id: string
    invoice_number: string
    ocr_number: string | null
    total: number
    due_date: string
    supplier_id: string | null
    supplier_name?: string
  }>,
  rules: MappingRule[]
): Promise<{
  matched: number
  unmatched: number
  items: BankReconciliationItem[]
}> {
  const supabase = await createClient()
  let matched = 0
  let unmatched = 0
  const items: BankReconciliationItem[] = []

  for (const tx of transactions) {
    const suggestions = generateSuggestions(tx, invoices, supplierInvoices, rules)

    // Pick the best match if confidence is high enough
    const bestMatch = suggestions.length > 0 ? suggestions[0] : null
    const isAutoMatch = bestMatch && bestMatch.confidence >= CONFIDENCE.MIN_AUTO_MATCH

    const itemData = {
      session_id: sessionId,
      transaction_id: tx.id,
      match_type: isAutoMatch
        ? (bestMatch!.type === 'invoice' || bestMatch!.type === 'supplier_invoice'
          ? 'auto_invoice' as const
          : 'auto_rule' as const)
        : 'unmatched' as const,
      matched_invoice_id: isAutoMatch && bestMatch!.type === 'invoice'
        ? bestMatch!.id
        : null,
      matched_supplier_invoice_id: isAutoMatch && bestMatch!.type === 'supplier_invoice'
        ? bestMatch!.id
        : null,
      confidence_score: bestMatch?.confidence ?? 0,
      is_reconciled: false,
      notes: bestMatch ? bestMatch.matchReason : null,
    }

    const { data: item, error } = await supabase
      .from('bank_reconciliation_items')
      .insert(itemData)
      .select()
      .single()

    if (error) {
      console.error('Failed to create reconciliation item:', error)
      continue
    }

    if (isAutoMatch) {
      matched++
    } else {
      unmatched++
    }

    items.push({ ...item, transaction: tx })
  }

  return { matched, unmatched, items }
}

// =============================================================================
// Suggest matches for a single transaction
// =============================================================================

export function generateSuggestions(
  transaction: Transaction,
  invoices: (Invoice & { customer?: Customer })[],
  supplierInvoices: Array<{
    id: string
    invoice_number: string
    ocr_number: string | null
    total: number
    due_date: string
    supplier_id: string | null
    supplier_name?: string
  }>,
  rules: MappingRule[]
): MatchSuggestion[] {
  const suggestions: MatchSuggestion[] = []
  const txAmount = transaction.amount
  const txDesc = transaction.description
  const ocrFromTx = extractOCRFromDescription(txDesc)

  // --- Income transactions: match against outgoing invoices ---
  if (txAmount > 0) {
    for (const invoice of invoices) {
      // Skip already paid invoices
      if (invoice.status === 'paid' || invoice.status === 'cancelled' || invoice.status === 'credited') continue

      const invoiceTotal = invoice.currency === transaction.currency
        ? invoice.total
        : (invoice.total_sek ?? invoice.total)

      // 1. OCR matching (highest confidence)
      if (ocrFromTx && invoice.invoice_number) {
        const normalizedOCR = ocrFromTx.replace(/^0+/, '')
        const normalizedInvNum = invoice.invoice_number.replace(/[^0-9]/g, '').replace(/^0+/, '')
        if (normalizedOCR === normalizedInvNum || ocrFromTx === invoice.invoice_number) {
          suggestions.push({
            type: 'invoice',
            id: invoice.id,
            label: `Faktura ${invoice.invoice_number}`,
            description: invoice.customer?.name || 'Okand kund',
            confidence: CONFIDENCE.OCR_MATCH,
            matchReason: `OCR-nummer matchar fakturanummer ${invoice.invoice_number}`,
            invoice,
          })
          continue
        }
      }

      // 2. Exact amount + customer name
      const exactAmount = amountsMatchExact(txAmount, invoiceTotal)
      const customerMatch = customerNameInDescription(
        invoice.customer?.name,
        txDesc,
        transaction.merchant_name
      )

      if (exactAmount && customerMatch) {
        suggestions.push({
          type: 'invoice',
          id: invoice.id,
          label: `Faktura ${invoice.invoice_number}`,
          description: `${invoice.customer?.name || 'Okand kund'} - ${invoiceTotal} ${invoice.currency}`,
          confidence: CONFIDENCE.AMOUNT_AND_CUSTOMER,
          matchReason: `Exakt belopp (${invoiceTotal} ${invoice.currency}) och kundnamn matchar`,
          invoice,
        })
        continue
      }

      // 3. Exact amount only
      if (exactAmount) {
        suggestions.push({
          type: 'invoice',
          id: invoice.id,
          label: `Faktura ${invoice.invoice_number}`,
          description: `${invoice.customer?.name || 'Okand kund'} - ${invoiceTotal} ${invoice.currency}`,
          confidence: CONFIDENCE.EXACT_AMOUNT,
          matchReason: `Exakt belopp (${invoiceTotal} ${invoice.currency})`,
          invoice,
        })
        continue
      }

      // 4. Fuzzy amount + customer name
      if (amountsMatchFuzzy(txAmount, invoiceTotal) && customerMatch) {
        suggestions.push({
          type: 'invoice',
          id: invoice.id,
          label: `Faktura ${invoice.invoice_number}`,
          description: `${invoice.customer?.name || 'Okand kund'} - ${invoiceTotal} ${invoice.currency}`,
          confidence: 0.70,
          matchReason: `Belopp nara (+-1%) och kundnamn matchar`,
          invoice,
        })
        continue
      }

      // 5. Fuzzy amount
      if (amountsMatchFuzzy(txAmount, invoiceTotal)) {
        suggestions.push({
          type: 'invoice',
          id: invoice.id,
          label: `Faktura ${invoice.invoice_number}`,
          description: `${invoice.customer?.name || 'Okand kund'} - ${invoiceTotal} ${invoice.currency}`,
          confidence: CONFIDENCE.FUZZY_MATCH,
          matchReason: `Belopp nara (+-1%): ${invoiceTotal} ${invoice.currency}`,
          invoice,
        })
      }
    }
  }

  // --- Expense transactions: match against supplier invoices ---
  if (txAmount < 0) {
    const absTxAmount = Math.abs(txAmount)

    for (const si of supplierInvoices) {
      // 1. OCR matching for supplier invoices
      if (ocrFromTx && si.ocr_number) {
        const normalizedOCR = ocrFromTx.replace(/^0+/, '')
        const normalizedSiOCR = si.ocr_number.replace(/^0+/, '')
        if (normalizedOCR === normalizedSiOCR) {
          suggestions.push({
            type: 'supplier_invoice',
            id: si.id,
            label: `Leverantorsfaktura ${si.invoice_number}`,
            description: si.supplier_name || 'Okand leverantor',
            confidence: CONFIDENCE.OCR_MATCH,
            matchReason: `OCR-nummer matchar leverantorsfaktura ${si.invoice_number}`,
            supplierInvoice: {
              id: si.id,
              invoice_number: si.invoice_number,
              supplier_name: si.supplier_name || 'Okand',
              total: si.total,
              due_date: si.due_date,
            },
          })
          continue
        }
      }

      // 2. Exact amount match
      if (amountsMatchExact(absTxAmount, si.total)) {
        const supplierInDescription = si.supplier_name
          ? normalizeDescription(txDesc).includes(normalizeDescription(si.supplier_name).split(' ')[0])
          : false

        suggestions.push({
          type: 'supplier_invoice',
          id: si.id,
          label: `Leverantorsfaktura ${si.invoice_number}`,
          description: `${si.supplier_name || 'Okand leverantor'} - ${si.total} SEK`,
          confidence: supplierInDescription ? CONFIDENCE.AMOUNT_AND_CUSTOMER : CONFIDENCE.EXACT_AMOUNT,
          matchReason: supplierInDescription
            ? `Exakt belopp och leverantorsnamn matchar`
            : `Exakt belopp (${si.total} SEK)`,
          supplierInvoice: {
            id: si.id,
            invoice_number: si.invoice_number,
            supplier_name: si.supplier_name || 'Okand',
            total: si.total,
            due_date: si.due_date,
          },
        })
        continue
      }

      // 3. Fuzzy amount match
      if (amountsMatchFuzzy(absTxAmount, si.total)) {
        suggestions.push({
          type: 'supplier_invoice',
          id: si.id,
          label: `Leverantorsfaktura ${si.invoice_number}`,
          description: `${si.supplier_name || 'Okand leverantor'} - ${si.total} SEK`,
          confidence: CONFIDENCE.FUZZY_MATCH,
          matchReason: `Belopp nara (+-1%): ${si.total} SEK`,
          supplierInvoice: {
            id: si.id,
            invoice_number: si.invoice_number,
            supplier_name: si.supplier_name || 'Okand',
            total: si.total,
            due_date: si.due_date,
          },
        })
      }
    }
  }

  // --- Rule-based matching for expenses ---
  if (txAmount < 0) {
    for (const rule of rules) {
      if (!rule.is_active) continue

      let ruleMatches = false
      const absTxAmount = Math.abs(txAmount)

      // Check merchant pattern
      if (rule.merchant_pattern && transaction.merchant_name) {
        const pattern = new RegExp(rule.merchant_pattern, 'i')
        if (pattern.test(transaction.merchant_name)) ruleMatches = true
      }

      // Check description pattern
      if (rule.description_pattern) {
        const pattern = new RegExp(rule.description_pattern, 'i')
        if (pattern.test(txDesc)) ruleMatches = true
      }

      // Check MCC codes
      if (rule.mcc_codes && transaction.mcc_code) {
        if (rule.mcc_codes.includes(transaction.mcc_code)) ruleMatches = true
      }

      // Check amount range
      if (rule.amount_min !== null && rule.amount_max !== null) {
        if (absTxAmount >= rule.amount_min && absTxAmount <= rule.amount_max) {
          ruleMatches = ruleMatches || rule.rule_type === 'amount_threshold'
        }
      }

      if (ruleMatches && rule.debit_account && rule.credit_account) {
        suggestions.push({
          type: 'rule',
          id: rule.id,
          label: rule.rule_name,
          description: `Konto ${rule.debit_account} / ${rule.credit_account}`,
          confidence: CONFIDENCE.RULE_MATCH,
          matchReason: `Matchad av bokforingsregel: ${rule.rule_name}`,
          rule,
        })
      }
    }
  }

  // Sort by confidence descending
  suggestions.sort((a, b) => b.confidence - a.confidence)

  // Filter to minimum threshold
  return suggestions.filter(s => s.confidence >= CONFIDENCE.MIN_SUGGESTION)
}

// =============================================================================
// Suggest matches for a single item (fetches data and runs engine)
// =============================================================================

export async function suggestMatches(
  userId: string,
  transaction: Transaction
): Promise<MatchSuggestion[]> {
  const supabase = await createClient()

  // Fetch unpaid invoices
  const { data: invoices } = await supabase
    .from('invoices')
    .select('*, customer:customers(*)')
    .eq('user_id', userId)
    .in('status', ['sent', 'overdue'])

  // Fetch unpaid supplier invoices
  const { data: supplierInvoices } = await supabase
    .from('supplier_invoices')
    .select('*, supplier:suppliers(name)')
    .eq('user_id', userId)
    .in('status', ['received', 'attested', 'approved'])

  // Fetch active mapping rules
  const { data: rules } = await supabase
    .from('mapping_rules')
    .select('*')
    .or(`user_id.eq.${userId},user_id.is.null`)
    .eq('is_active', true)
    .order('priority', { ascending: true })

  const formattedSupplierInvoices = (supplierInvoices || []).map(si => ({
    id: si.id,
    invoice_number: si.invoice_number,
    ocr_number: si.ocr_number,
    total: si.total,
    due_date: si.due_date,
    supplier_id: si.supplier_id,
    supplier_name: si.supplier?.name || undefined,
  }))

  return generateSuggestions(
    transaction,
    (invoices || []) as (Invoice & { customer?: Customer })[],
    formattedSupplierInvoices,
    (rules || []) as MappingRule[]
  )
}

// =============================================================================
// Reconcile a single item
// =============================================================================

export async function reconcileTransaction(
  userId: string,
  itemId: string,
  matchType: string,
  matchId?: string,
  notes?: string
): Promise<BankReconciliationItem> {
  const supabase = await createClient()

  const updateData: Record<string, unknown> = {
    match_type: matchType,
    is_reconciled: true,
    reconciled_at: new Date().toISOString(),
    notes: notes || null,
  }

  if (matchType === 'auto_invoice' || matchType === 'manual') {
    if (matchId) {
      // Determine if it is a regular invoice or supplier invoice
      const { data: invoice } = await supabase
        .from('invoices')
        .select('id')
        .eq('id', matchId)
        .eq('user_id', userId)
        .single()

      if (invoice) {
        updateData.matched_invoice_id = matchId
      } else {
        updateData.matched_supplier_invoice_id = matchId
      }
    }
  }

  const { data, error } = await supabase
    .from('bank_reconciliation_items')
    .update(updateData)
    .eq('id', itemId)
    .select(`
      *,
      transaction:transactions(*)
    `)
    .single()

  if (error) {
    throw new Error(`Kunde inte avstamma transaktion: ${error.message}`)
  }

  return data as BankReconciliationItem
}

// =============================================================================
// Create journal entry from a reconciled item
// =============================================================================

export async function createJournalEntryFromReconciliation(
  userId: string,
  itemId: string,
  debitAccount: string,
  creditAccount: string,
  description?: string
): Promise<string> {
  const supabase = await createClient()

  // Get the item with transaction
  const { data: item, error: itemError } = await supabase
    .from('bank_reconciliation_items')
    .select('*, transaction:transactions(*)')
    .eq('id', itemId)
    .single()

  if (itemError || !item) {
    throw new Error('Kunde inte hitta avstamningsposten')
  }

  const tx = item.transaction as Transaction
  const amount = Math.abs(tx.amount)
  const entryDate = tx.date
  const entryDescription = description || tx.description

  // Get the current fiscal period
  const { data: period } = await supabase
    .from('fiscal_periods')
    .select('id')
    .eq('user_id', userId)
    .lte('period_start', entryDate)
    .gte('period_end', entryDate)
    .eq('is_closed', false)
    .single()

  if (!period) {
    throw new Error('Ingen oppen rakenskapsperiod hittad for detta datum')
  }

  // Get next voucher number
  const { data: maxVoucher } = await supabase
    .from('journal_entries')
    .select('voucher_number')
    .eq('user_id', userId)
    .eq('fiscal_period_id', period.id)
    .eq('voucher_series', 'A')
    .order('voucher_number', { ascending: false })
    .limit(1)
    .single()

  const nextVoucher = (maxVoucher?.voucher_number || 0) + 1

  // Create journal entry
  const { data: entry, error: entryError } = await supabase
    .from('journal_entries')
    .insert({
      user_id: userId,
      fiscal_period_id: period.id,
      voucher_number: nextVoucher,
      voucher_series: 'A',
      entry_date: entryDate,
      description: entryDescription,
      source_type: 'bank_transaction',
      source_id: tx.id,
      status: 'posted',
    })
    .select()
    .single()

  if (entryError || !entry) {
    throw new Error(`Kunde inte skapa verifikation: ${entryError?.message}`)
  }

  // Create journal lines
  const lines = [
    {
      journal_entry_id: entry.id,
      account_number: debitAccount,
      debit_amount: amount,
      credit_amount: 0,
      line_description: entryDescription,
      sort_order: 1,
    },
    {
      journal_entry_id: entry.id,
      account_number: creditAccount,
      debit_amount: 0,
      credit_amount: amount,
      line_description: entryDescription,
      sort_order: 2,
    },
  ]

  const { error: linesError } = await supabase
    .from('journal_entry_lines')
    .insert(lines)

  if (linesError) {
    throw new Error(`Kunde inte skapa verifikationsrader: ${linesError.message}`)
  }

  // Update the reconciliation item with journal entry ID
  await supabase
    .from('bank_reconciliation_items')
    .update({ journal_entry_id: entry.id })
    .eq('id', itemId)

  // Also update the transaction with journal entry ID
  await supabase
    .from('transactions')
    .update({ journal_entry_id: entry.id })
    .eq('id', tx.id)

  return entry.id
}

// =============================================================================
// Split transaction into multiple bookings
// =============================================================================

export async function splitTransaction(
  userId: string,
  itemId: string,
  splits: SplitEntry[]
): Promise<string[]> {
  const supabase = await createClient()

  // Get the item with transaction
  const { data: item, error: itemError } = await supabase
    .from('bank_reconciliation_items')
    .select('*, transaction:transactions(*)')
    .eq('id', itemId)
    .single()

  if (itemError || !item) {
    throw new Error('Kunde inte hitta avstamningsposten')
  }

  const tx = item.transaction as Transaction
  const totalAmount = Math.abs(tx.amount)

  // Validate splits sum to total
  const splitsTotal = splits.reduce((sum, s) => sum + Math.abs(s.amount), 0)
  const roundedTotal = Math.round(totalAmount * 100)
  const roundedSplits = Math.round(splitsTotal * 100)

  if (roundedTotal !== roundedSplits) {
    throw new Error(
      `Delbeloppen (${splitsTotal.toFixed(2)}) matchar inte transaktionens totalbelopp (${totalAmount.toFixed(2)})`
    )
  }

  const entryDate = tx.date

  // Get the current fiscal period
  const { data: period } = await supabase
    .from('fiscal_periods')
    .select('id')
    .eq('user_id', userId)
    .lte('period_start', entryDate)
    .gte('period_end', entryDate)
    .eq('is_closed', false)
    .single()

  if (!period) {
    throw new Error('Ingen oppen rakenskapsperiod hittad for detta datum')
  }

  // Get next voucher number
  const { data: maxVoucher } = await supabase
    .from('journal_entries')
    .select('voucher_number')
    .eq('user_id', userId)
    .eq('fiscal_period_id', period.id)
    .eq('voucher_series', 'A')
    .order('voucher_number', { ascending: false })
    .limit(1)
    .single()

  let nextVoucher = (maxVoucher?.voucher_number || 0) + 1
  const journalEntryIds: string[] = []

  // Create one journal entry per split
  for (const split of splits) {
    const amount = Math.abs(split.amount)

    const { data: entry, error: entryError } = await supabase
      .from('journal_entries')
      .insert({
        user_id: userId,
        fiscal_period_id: period.id,
        voucher_number: nextVoucher++,
        voucher_series: 'A',
        entry_date: entryDate,
        description: split.description || tx.description,
        source_type: 'bank_transaction',
        source_id: tx.id,
        status: 'posted',
      })
      .select()
      .single()

    if (entryError || !entry) {
      throw new Error(`Kunde inte skapa verifikation: ${entryError?.message}`)
    }

    const lines = [
      {
        journal_entry_id: entry.id,
        account_number: split.debitAccount,
        debit_amount: amount,
        credit_amount: 0,
        line_description: split.description,
        sort_order: 1,
      },
      {
        journal_entry_id: entry.id,
        account_number: split.creditAccount,
        debit_amount: 0,
        credit_amount: amount,
        line_description: split.description,
        sort_order: 2,
      },
    ]

    // Add VAT line if applicable
    if (split.vatAmount && split.vatAmount > 0) {
      lines.push({
        journal_entry_id: entry.id,
        account_number: '2640', // Ingående moms
        debit_amount: split.vatAmount,
        credit_amount: 0,
        line_description: `Moms - ${split.description}`,
        sort_order: 3,
      })
      // Adjust the debit line amount to subtract VAT
      lines[0].debit_amount = amount - split.vatAmount
    }

    await supabase.from('journal_entry_lines').insert(lines)

    journalEntryIds.push(entry.id)
  }

  // Mark item as split and reconciled
  await supabase
    .from('bank_reconciliation_items')
    .update({
      match_type: 'split',
      is_reconciled: true,
      reconciled_at: new Date().toISOString(),
      journal_entry_id: journalEntryIds[0], // Link to first entry
      notes: `Delad i ${splits.length} poster`,
    })
    .eq('id', itemId)

  return journalEntryIds
}

// =============================================================================
// Undo reconciliation
// =============================================================================

export async function unmatchTransaction(
  userId: string,
  itemId: string
): Promise<void> {
  const supabase = await createClient()

  // Get the item first
  const { data: item, error: itemError } = await supabase
    .from('bank_reconciliation_items')
    .select('*, transaction:transactions(*)')
    .eq('id', itemId)
    .single()

  if (itemError || !item) {
    throw new Error('Kunde inte hitta avstamningsposten')
  }

  // Verify ownership through session
  const { data: session } = await supabase
    .from('bank_reconciliation_sessions')
    .select('user_id')
    .eq('id', item.session_id)
    .single()

  if (!session || session.user_id !== userId) {
    throw new Error('Obehorig atgard')
  }

  // Reset the item
  await supabase
    .from('bank_reconciliation_items')
    .update({
      match_type: 'unmatched',
      matched_invoice_id: null,
      matched_supplier_invoice_id: null,
      journal_entry_id: null,
      confidence_score: 0,
      is_reconciled: false,
      reconciled_at: null,
      notes: null,
    })
    .eq('id', itemId)
}
