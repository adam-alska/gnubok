/**
 * Import functions that map Fortnox resources to gnubok tables.
 * Each function handles deduplication via external_id + external_provider.
 */

import type { SupabaseClient } from '@supabase/supabase-js'

/** Extract a useful error message from any thrown value (including Supabase PostgrestError objects). */
function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message
  if (typeof err === 'object' && err !== null && 'message' in err) {
    return String((err as { message: unknown }).message)
  }
  return String(err)
}
import type {
  FortnoxCustomerDetail,
  FortnoxSupplierDetail,
  FortnoxInvoiceDetail,
  FortnoxInvoiceRow,
  FortnoxSupplierInvoiceDetail,
  FortnoxInvoicePayment,
  FortnoxSupplierInvoicePayment,
} from './fortnox-types'

export interface ImportResult {
  created: number
  updated: number
  skipped: number
  errors: string[]
}

function emptyResult(): ImportResult {
  return { created: 0, updated: 0, skipped: 0, errors: [] }
}

/**
 * Infer customer_type from Fortnox data.
 * - If country is not SE, it's an EU or international customer
 * - If VAT number exists, it's likely a company
 * - Fortnox Type field: 'PRIVATE' | 'COMPANY'
 */
function inferCustomerType(
  c: FortnoxCustomerDetail
): 'individual' | 'company' | 'eu_company' | 'eu_individual' | 'non_eu' {
  const country = (c.CountryCode ?? 'SE').toUpperCase()
  const isSwedish = country === 'SE' || country === ''
  const hasVat = !!c.VATNumber

  if (isSwedish) {
    return c.Type === 'PRIVATE' ? 'individual' : 'company'
  }

  // EU countries (simplified check — covers most common)
  const euCountries = new Set([
    'AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR',
    'DE', 'GR', 'HU', 'IE', 'IT', 'LV', 'LT', 'LU', 'MT', 'NL',
    'PL', 'PT', 'RO', 'SK', 'SI', 'ES',
  ])

  if (euCountries.has(country)) {
    return hasVat ? 'eu_company' : 'eu_individual'
  }

  return 'non_eu'
}

function inferSupplierType(
  s: FortnoxSupplierDetail
): 'domestic' | 'eu' | 'non_eu' {
  const country = (s.CountryCode ?? 'SE').toUpperCase()
  const isSwedish = country === 'SE' || country === ''

  if (isSwedish) return 'domestic'

  const euCountries = new Set([
    'AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR',
    'DE', 'GR', 'HU', 'IE', 'IT', 'LV', 'LT', 'LU', 'MT', 'NL',
    'PL', 'PT', 'RO', 'SK', 'SI', 'ES',
  ])

  return euCountries.has(country) ? 'eu' : 'non_eu'
}

function fortnoxCountryToIso(countryCode: string | null): string {
  if (!countryCode || countryCode === '') return 'SE'
  return countryCode.toUpperCase()
}

// --- Customer import ---

export async function importFortnoxCustomers(
  supabase: SupabaseClient,
  userId: string,
  customers: FortnoxCustomerDetail[]
): Promise<ImportResult> {
  const result = emptyResult()

  for (const c of customers) {
    if (c.Active === false) {
      result.skipped++
      continue
    }

    try {
      // Check for existing by external_id
      const { data: existing } = await supabase
        .from('customers')
        .select('id')
        .eq('user_id', userId)
        .eq('external_provider', 'fortnox')
        .eq('external_id', c.CustomerNumber)
        .maybeSingle()

      const customerData = {
        user_id: userId,
        name: c.Name,
        customer_type: inferCustomerType(c),
        email: c.Email || null,
        phone: c.Phone1 || null,
        address_line1: c.Address1 || null,
        address_line2: c.Address2 || null,
        postal_code: c.ZipCode || null,
        city: c.City || null,
        country: fortnoxCountryToIso(c.CountryCode),
        org_number: c.OrganisationNumber || null,
        vat_number: c.VATNumber || null,
        vat_number_validated: !!c.VATNumber,
        external_id: c.CustomerNumber,
        external_provider: 'fortnox',
      }

      if (existing) {
        const { error } = await supabase
          .from('customers')
          .update(customerData)
          .eq('id', existing.id)
        if (error) throw error
        result.updated++
      } else {
        const { error } = await supabase
          .from('customers')
          .insert(customerData)
        if (error) throw error
        result.created++
      }
    } catch (err) {
      const msg = errorMessage(err)
      result.errors.push(`Customer ${c.CustomerNumber} (${c.Name}): ${msg}`)
    }
  }

  return result
}

// --- Supplier import ---

export async function importFortnoxSuppliers(
  supabase: SupabaseClient,
  userId: string,
  suppliers: FortnoxSupplierDetail[]
): Promise<ImportResult> {
  const result = emptyResult()

  for (const s of suppliers) {
    if (s.Active === false) {
      result.skipped++
      continue
    }

    try {
      const { data: existing } = await supabase
        .from('suppliers')
        .select('id')
        .eq('user_id', userId)
        .eq('external_provider', 'fortnox')
        .eq('external_id', s.SupplierNumber)
        .maybeSingle()

      const supplierData = {
        user_id: userId,
        name: s.Name,
        supplier_type: inferSupplierType(s),
        email: s.Email || null,
        phone: s.Phone1 || null,
        address_line1: s.Address1 || null,
        address_line2: s.Address2 || null,
        postal_code: s.ZipCode || null,
        city: s.City || null,
        country: fortnoxCountryToIso(s.CountryCode),
        org_number: s.OrganisationNumber || null,
        vat_number: s.VATNumber || null,
        bankgiro: s.BG || null,
        plusgiro: s.PG || null,
        bank_account: s.BankAccountNumber || null,
        iban: s.IBAN || null,
        bic: s.BIC || null,
        default_expense_account: s.PreDefinedAccount || null,
        default_currency: s.Currency || 'SEK',
        external_id: s.SupplierNumber,
        external_provider: 'fortnox',
      }

      if (existing) {
        const { error } = await supabase
          .from('suppliers')
          .update(supplierData)
          .eq('id', existing.id)
        if (error) throw error
        result.updated++
      } else {
        const { error } = await supabase
          .from('suppliers')
          .insert(supplierData)
        if (error) throw error
        result.created++
      }
    } catch (err) {
      const msg = errorMessage(err)
      result.errors.push(`Supplier ${s.SupplierNumber} (${s.Name}): ${msg}`)
    }
  }

  return result
}

// --- Invoice import ---

function mapVatRate(vatPercent: number): number {
  // Fortnox VAT is in percentage (25, 12, 6, 0)
  return Math.round(vatPercent * 100) / 100
}

function mapInvoiceRows(rows: FortnoxInvoiceRow[]): Array<{
  sort_order: number
  description: string
  quantity: number
  unit: string
  unit_price: number
  line_total: number
  vat_rate: number
  vat_amount: number
}> {
  return rows.map((row, idx) => ({
    sort_order: idx + 1,
    description: row.Description || '',
    quantity: row.DeliveredQuantity,
    unit: row.Unit || 'st',
    unit_price: Math.round(row.Price * 100) / 100,
    line_total: Math.round(row.Total * 100) / 100,
    vat_rate: mapVatRate(row.VAT),
    vat_amount: Math.round((row.Total * row.VAT) / 100 * 100) / 100,
  }))
}

export async function importFortnoxInvoices(
  supabase: SupabaseClient,
  userId: string,
  invoices: FortnoxInvoiceDetail[]
): Promise<ImportResult> {
  const result = emptyResult()

  for (const inv of invoices) {
    if (inv.Cancelled) {
      result.skipped++
      continue
    }

    try {
      // Check for existing
      const { data: existing } = await supabase
        .from('invoices')
        .select('id')
        .eq('user_id', userId)
        .eq('external_provider', 'fortnox')
        .eq('external_id', inv.DocumentNumber)
        .maybeSingle()

      if (existing) {
        result.skipped++
        continue
      }

      // Look up customer by external_id
      const { data: customer } = await supabase
        .from('customers')
        .select('id')
        .eq('user_id', userId)
        .eq('external_provider', 'fortnox')
        .eq('external_id', inv.CustomerNumber)
        .maybeSingle()

      if (!customer) {
        result.errors.push(
          `Invoice ${inv.DocumentNumber}: Customer ${inv.CustomerNumber} not found. Import customers first.`
        )
        continue
      }

      // Determine status
      let status: string
      if (inv.Balance === 0 && inv.Total > 0) {
        status = 'paid'
      } else if (inv.Sent) {
        status = 'sent'
      } else if (inv.Booked) {
        status = 'finalized'
      } else {
        status = 'draft'
      }

      // Determine VAT treatment from rows
      const vatRates = (inv.InvoiceRows || []).map((r) => r.VAT)
      const maxVat = Math.max(...vatRates, 0)
      let vatTreatment = 'standard_25'
      if (maxVat === 12) vatTreatment = 'reduced_12'
      else if (maxVat === 6) vatTreatment = 'reduced_6'
      else if (maxVat === 0) vatTreatment = 'exempt'

      const paidAmount = inv.Total - inv.Balance
      const invoiceData = {
        user_id: userId,
        customer_id: customer.id,
        invoice_number: inv.DocumentNumber,
        invoice_date: inv.InvoiceDate,
        due_date: inv.DueDate,
        status,
        currency: inv.Currency || 'SEK',
        subtotal: Math.round(inv.Net * 100) / 100,
        vat_amount: Math.round(inv.TotalVAT * 100) / 100,
        total: Math.round(inv.Total * 100) / 100,
        vat_treatment: vatTreatment,
        vat_rate: maxVat,
        your_reference: inv.YourReference || null,
        our_reference: inv.OurReference || null,
        notes: inv.Comments || null,
        paid_amount: Math.round(paidAmount * 100) / 100,
        paid_at: inv.FinalPayDate || null,
        external_id: inv.DocumentNumber,
        external_provider: 'fortnox',
      }

      const { data: newInvoice, error: insertError } = await supabase
        .from('invoices')
        .insert(invoiceData)
        .select('id')
        .single()

      if (insertError) throw insertError

      // Insert invoice items
      const rows = mapInvoiceRows(inv.InvoiceRows || [])
      if (rows.length > 0 && newInvoice) {
        const itemsToInsert = rows.map((row) => ({
          invoice_id: newInvoice.id,
          ...row,
        }))

        const { error: itemsError } = await supabase
          .from('invoice_items')
          .insert(itemsToInsert)

        if (itemsError) {
          result.errors.push(`Invoice ${inv.DocumentNumber} items: ${itemsError.message}`)
        }
      }

      result.created++
    } catch (err) {
      const msg = errorMessage(err)
      result.errors.push(`Invoice ${inv.DocumentNumber}: ${msg}`)
    }
  }

  return result
}

// --- Supplier Invoice import ---

export async function importFortnoxSupplierInvoices(
  supabase: SupabaseClient,
  userId: string,
  supplierInvoices: FortnoxSupplierInvoiceDetail[]
): Promise<ImportResult> {
  const result = emptyResult()

  for (const si of supplierInvoices) {
    if (si.Cancelled) {
      result.skipped++
      continue
    }

    try {
      const { data: existing } = await supabase
        .from('supplier_invoices')
        .select('id')
        .eq('user_id', userId)
        .eq('external_provider', 'fortnox')
        .eq('external_id', String(si.GivenNumber))
        .maybeSingle()

      if (existing) {
        result.skipped++
        continue
      }

      // Look up supplier by external_id
      const { data: supplier } = await supabase
        .from('suppliers')
        .select('id')
        .eq('user_id', userId)
        .eq('external_provider', 'fortnox')
        .eq('external_id', si.SupplierNumber)
        .maybeSingle()

      if (!supplier) {
        result.errors.push(
          `Supplier invoice ${si.GivenNumber}: Supplier ${si.SupplierNumber} not found. Import suppliers first.`
        )
        continue
      }

      let status: string
      if (si.Balance === 0 && si.Total > 0) {
        status = 'paid'
      } else if (si.Booked) {
        status = 'approved'
      } else {
        status = 'registered'
      }

      const supplierInvoiceData = {
        user_id: userId,
        supplier_id: supplier.id,
        supplier_invoice_number: si.InvoiceNumber,
        invoice_date: si.InvoiceDate,
        due_date: si.DueDate,
        received_date: si.InvoiceDate, // Use invoice date as fallback
        status,
        currency: si.Currency || 'SEK',
        subtotal: Math.round((si.Total - (si.VAT || 0)) * 100) / 100,
        vat_amount: Math.round((si.VAT || 0) * 100) / 100,
        total: Math.round(si.Total * 100) / 100,
        remaining_amount: Math.round(si.Balance * 100) / 100,
        paid_amount: Math.round((si.Total - si.Balance) * 100) / 100,
        external_id: String(si.GivenNumber),
        external_provider: 'fortnox',
      }

      const { error: insertError } = await supabase
        .from('supplier_invoices')
        .insert(supplierInvoiceData)

      if (insertError) throw insertError
      result.created++
    } catch (err) {
      const msg = errorMessage(err)
      result.errors.push(`Supplier invoice ${si.GivenNumber}: ${msg}`)
    }
  }

  return result
}

// --- Invoice Payments import ---

export async function importFortnoxInvoicePayments(
  supabase: SupabaseClient,
  userId: string,
  payments: FortnoxInvoicePayment[]
): Promise<ImportResult> {
  const result = emptyResult()

  for (const payment of payments) {
    try {
      const { data: invoice } = await supabase
        .from('invoices')
        .select('id, total, paid_amount, status')
        .eq('user_id', userId)
        .eq('external_provider', 'fortnox')
        .eq('invoice_number', String(payment.InvoiceNumber))
        .maybeSingle()

      if (!invoice) {
        result.skipped++
        continue
      }

      const newPaidAmount = Math.round(
        ((invoice.paid_amount || 0) + payment.Amount) * 100
      ) / 100
      const isPaid = newPaidAmount >= invoice.total

      const { error } = await supabase
        .from('invoices')
        .update({
          paid_amount: newPaidAmount,
          status: isPaid ? 'paid' : invoice.status,
          paid_at: isPaid ? payment.PaymentDate : null,
        })
        .eq('id', invoice.id)

      if (error) throw error
      result.updated++
    } catch (err) {
      const msg = errorMessage(err)
      result.errors.push(`Invoice payment ${payment.Number}: ${msg}`)
    }
  }

  return result
}

// --- Supplier Invoice Payments import ---

export async function importFortnoxSupplierInvoicePayments(
  supabase: SupabaseClient,
  userId: string,
  payments: FortnoxSupplierInvoicePayment[]
): Promise<ImportResult> {
  const result = emptyResult()

  for (const payment of payments) {
    try {
      const { data: invoice } = await supabase
        .from('supplier_invoices')
        .select('id, total, paid_amount, remaining_amount, status')
        .eq('user_id', userId)
        .eq('external_provider', 'fortnox')
        .eq('supplier_invoice_number', String(payment.InvoiceNumber))
        .maybeSingle()

      if (!invoice) {
        result.skipped++
        continue
      }

      const newPaidAmount = Math.round(
        ((invoice.paid_amount || 0) + payment.Amount) * 100
      ) / 100
      const newRemaining = Math.round((invoice.total - newPaidAmount) * 100) / 100
      const isPaid = newRemaining <= 0

      const { error } = await supabase
        .from('supplier_invoices')
        .update({
          paid_amount: newPaidAmount,
          remaining_amount: Math.max(0, newRemaining),
          status: isPaid ? 'paid' : invoice.status,
          paid_at: isPaid ? payment.PaymentDate : null,
        })
        .eq('id', invoice.id)

      if (error) throw error
      result.updated++
    } catch (err) {
      const msg = errorMessage(err)
      result.errors.push(`Supplier invoice payment ${payment.Number}: ${msg}`)
    }
  }

  return result
}
