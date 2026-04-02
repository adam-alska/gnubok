/**
 * Migration orchestrator — coordinates the data migration from
 * an external accounting system directly via provider APIs into gnubok.
 *
 * Bookkeeping data (accounts, balances, vouchers) is imported
 * via SIE files through the core SIE import engine. This orchestrator
 * handles only entity-level imports:
 *   1. Company info → pre-fill company_settings
 *   2. Customers → needed before sales invoices
 *   3. Suppliers → needed before supplier invoices
 *   4. Sales invoices (open only)
 *   5. Supplier invoices (open only)
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { MigrationProgress, MigrationResults } from '../types'
import type { ProviderName } from '@/lib/providers/types'
import { resolveConsent } from '@/lib/providers/resolve-consent'
import {
  fetchCompanyInfoDirect,
  fetchCustomersDirect,
  fetchSuppliersDirect,
  fetchSalesInvoicesDirect,
  fetchSupplierInvoicesDirect,
} from '@/lib/providers/provider-data-fetcher'
import {
  mapCustomer,
  mapSupplier,
  mapSalesInvoice,
  mapSupplierInvoice,
  mapCompanyInfo,
  inferTypeFromParty,
} from './entity-mapper'

export interface MigrationOptions {
  consentId: string
  companyId: string
  userId: string
  companyId: string
  supabase: SupabaseClient
  importCompanyInfo?: boolean
  importCustomers?: boolean
  importSuppliers?: boolean
  importSalesInvoices?: boolean
  importSupplierInvoices?: boolean
  onProgress?: (progress: MigrationProgress) => void
}

function emitProgress(options: MigrationOptions, progress: MigrationProgress) {
  options.onProgress?.(progress)
}

// ── Main orchestrator ─────────────────────────────────────────────

export async function executeMigration(options: MigrationOptions): Promise<MigrationResults> {
  const { consentId, companyId, userId, supabase } = options
  const results: MigrationResults = {}

  // Resolve consent to get access token and provider
  const resolved = await resolveConsent(companyId, consentId)
  const provider = resolved.consent.provider as ProviderName
  const accessToken = resolved.accessToken
  const providerCompanyId = resolved.providerCompanyId

  try {
    // ── Step 1: Company information ───────────────────────────────
    if (options.importCompanyInfo !== false) {
      emitProgress(options, { status: 'fetching', currentStep: 'Hämtar företagsinformation...', progress: 5 })
      try {
        const companyInfo = await fetchCompanyInfoDirect(provider, accessToken, providerCompanyId)
        if (companyInfo) {
          const mapped = mapCompanyInfo(companyInfo)
          const { data: existing } = await supabase
            .from('company_settings')
            .select('company_name, org_number, vat_number')
            .eq('company_id', companyId)
            .single()

          const updates: Record<string, unknown> = {}
          if (!existing?.company_name && mapped.company_name) updates.company_name = mapped.company_name
          if (!existing?.org_number && mapped.org_number) updates.org_number = mapped.org_number
          if (!existing?.vat_number && mapped.vat_number) {
            updates.vat_number = mapped.vat_number
            updates.vat_registered = true
          }
          if (mapped.fiscal_year_start_month !== 1) {
            updates.fiscal_year_start_month = mapped.fiscal_year_start_month
          }
          if (mapped.address_line1) updates.address_line1 = mapped.address_line1
          if (mapped.postal_code) updates.postal_code = mapped.postal_code
          if (mapped.city) updates.city = mapped.city
          if (mapped.phone) updates.phone = mapped.phone
          if (mapped.email) updates.email = mapped.email

          if (Object.keys(updates).length > 0) {
            await supabase.from('company_settings').update(updates).eq('company_id', companyId)
          }
          results.companyInfo = { imported: true }
        }
      } catch (err) {
        console.error('Failed to import company info:', err)
        results.companyInfo = { imported: false }
      }
    }

    // ── Step 2: Customers ─────────────────────────────────────────
    const customerIdMap = new Map<string, string>()

    if (options.importCustomers !== false) {
      emitProgress(options, { status: 'importing', currentStep: 'Importerar kunder...', progress: 20 })
      try {
        const customers = await fetchCustomersDirect(provider, accessToken, providerCompanyId)
        let imported = 0
        let skipped = 0

        for (const customer of customers) {
          if (!customer.active) {
            console.log(`[migration] Customer skipped (inactive): ${customer.party.name}`)
            skipped++
            continue
          }

          const orgNumber = customer.party.legalEntity?.companyId ||
            customer.party.identifications?.find(i => i.schemeId === 'SE:ORGNR')?.id
          if (orgNumber) {
            const { data: existing } = await supabase
              .from('customers')
              .select('id')
              .eq('company_id', companyId)
              .eq('org_number', orgNumber)
              .limit(1)

            if (existing && existing.length > 0) {
              console.log(`[migration] Customer skipped (duplicate org_number ${orgNumber}): ${customer.party.name}`)
              customerIdMap.set(customer.id, existing[0].id)
              skipped++
              continue
            }
          }

          const mapped = mapCustomer(customer, userId, companyId)
          const { data: inserted, error } = await supabase
            .from('customers')
            .insert(mapped)
            .select('id')
            .single()

          if (error || !inserted) {
            console.error(`[migration] Customer insert failed: ${customer.party.name}`, error?.message)
            skipped++
          } else {
            customerIdMap.set(customer.id, inserted.id)
            imported++
          }
        }

        results.customers = { total: customers.length, imported, skipped }
      } catch (err) {
        console.error('Failed to import customers:', err)
      }
    }

    // ── Step 3: Suppliers ─────────────────────────────────────────
    const supplierIdMap = new Map<string, string>()

    if (options.importSuppliers !== false) {
      emitProgress(options, { status: 'importing', currentStep: 'Importerar leverantörer...', progress: 40 })
      try {
        const suppliers = await fetchSuppliersDirect(provider, accessToken, providerCompanyId)
        let imported = 0
        let skipped = 0

        for (const supplier of suppliers) {
          if (!supplier.active) {
            console.log(`[migration] Supplier skipped (inactive): ${supplier.party.name}`)
            skipped++
            continue
          }

          const orgNumber = supplier.party.legalEntity?.companyId ||
            supplier.party.identifications?.find(i => i.schemeId === 'SE:ORGNR')?.id
          if (orgNumber) {
            const { data: existing } = await supabase
              .from('suppliers')
              .select('id')
              .eq('company_id', companyId)
              .eq('org_number', orgNumber)
              .limit(1)

            if (existing && existing.length > 0) {
              console.log(`[migration] Supplier skipped (duplicate org_number ${orgNumber}): ${supplier.party.name}`)
              supplierIdMap.set(supplier.id, existing[0].id)
              skipped++
              continue
            }
          }

          const mapped = mapSupplier(supplier, userId, companyId)
          const { data: inserted, error } = await supabase
            .from('suppliers')
            .insert(mapped)
            .select('id')
            .single()

          if (error || !inserted) {
            console.error(`[migration] Supplier insert failed: ${supplier.party.name}`, error?.message)
            skipped++
          } else {
            supplierIdMap.set(supplier.id, inserted.id)
            imported++
          }
        }

        results.suppliers = { total: suppliers.length, imported, skipped }
      } catch (err) {
        console.error('Failed to import suppliers:', err)
      }
    }

    // ── Step 4: Sales invoices (open/unpaid only) ─────────────────
    if (options.importSalesInvoices !== false) {
      emitProgress(options, { status: 'importing', currentStep: 'Importerar kundfakturor...', progress: 60 })
      try {
        const invoices = await fetchSalesInvoicesDirect(provider, accessToken, providerCompanyId)
        const openInvoices = invoices.filter(i =>
          i.status === 'sent' || i.status === 'overdue' || i.status === 'booked'
        )
        console.log(`[migration] Sales invoices: ${invoices.length} total, ${openInvoices.length} open (filtered by status: sent/overdue/booked)`)

        let imported = 0
        let skipped = 0

        for (const inv of openInvoices) {
          const customerOrgNumber = inv.customer.legalEntity?.companyId ||
            inv.customer.identifications?.find(i => i.schemeId === 'SE:ORGNR')?.id

          let customerId: string | null = null

          if (customerOrgNumber) {
            const { data: match } = await supabase
              .from('customers')
              .select('id')
              .eq('company_id', companyId)
              .eq('org_number', customerOrgNumber)
              .limit(1)
            if (match?.[0]) customerId = match[0].id
          }

          if (!customerId) {
            const { data: match } = await supabase
              .from('customers')
              .select('id')
              .eq('company_id', companyId)
              .eq('name', inv.customer.name)
              .limit(1)
            if (match?.[0]) customerId = match[0].id
          }

          if (!customerId) {
            const customerType = inferTypeFromParty(inv.customer)
            const minimalCustomer = {
              user_id: userId,
              company_id: companyId,
              name: inv.customer.name,
              customer_type: customerType,
              default_payment_terms: 30,
              country: inv.customer.postalAddress?.countryCode || (customerType === 'swedish_business' ? 'SE' : null),
              vat_number_validated: false,
            }
            const { data: created, error: custErr } = await supabase
              .from('customers')
              .insert(minimalCustomer)
              .select('id')
              .single()
            if (created) {
              customerId = created.id
            } else {
              console.error(`[migration] Sales invoice ${inv.invoiceNumber} skipped — could not create customer "${inv.customer.name}":`, custErr?.message)
            }
          }

          if (!customerId) {
            console.log(`[migration] Sales invoice ${inv.invoiceNumber} skipped — no customer match for "${inv.customer.name}" (org: ${customerOrgNumber || 'n/a'})`)
            skipped++
            continue
          }

          const { data: existingInv } = await supabase
            .from('invoices')
            .select('id')
            .eq('company_id', companyId)
            .eq('invoice_number', inv.invoiceNumber)
            .limit(1)

          if (existingInv && existingInv.length > 0) {
            console.log(`[migration] Sales invoice ${inv.invoiceNumber} skipped — already exists`)
            skipped++
            continue
          }

          const { invoice: mappedInvoice, items: mappedItems } = mapSalesInvoice(inv, userId, companyId, customerId)

          const { data: insertedInv, error: invError } = await supabase
            .from('invoices')
            .insert(mappedInvoice)
            .select('id')
            .single()

          if (invError || !insertedInv) {
            console.error(`[migration] Sales invoice ${inv.invoiceNumber} insert failed:`, invError?.message)
            skipped++
            continue
          }

          if (mappedItems.length > 0) {
            const itemsWithInvoiceId = mappedItems.map(item => ({
              ...item,
              invoice_id: insertedInv.id,
            }))
            await supabase.from('invoice_items').insert(itemsWithInvoiceId)
          }

          imported++
        }

        results.salesInvoices = { total: openInvoices.length, imported, skipped }
      } catch (err) {
        console.error('Failed to import sales invoices:', err)
      }
    }

    // ── Step 5: Supplier invoices (open/unpaid only) ──────────────
    if (options.importSupplierInvoices !== false) {
      emitProgress(options, { status: 'importing', currentStep: 'Importerar leverantörsfakturor...', progress: 80 })
      try {
        const invoices = await fetchSupplierInvoicesDirect(provider, accessToken, providerCompanyId)
        const openInvoices = invoices.filter(i =>
          i.status === 'sent' || i.status === 'overdue' || i.status === 'booked' || i.status === 'draft'
        )
        console.log(`[migration] Supplier invoices: ${invoices.length} total, ${openInvoices.length} open (filtered by status: sent/overdue/booked/draft)`)

        let imported = 0
        let skipped = 0

        for (const inv of openInvoices) {
          const supplierOrgNumber = inv.supplier.legalEntity?.companyId ||
            inv.supplier.identifications?.find(i => i.schemeId === 'SE:ORGNR')?.id

          let supplierId: string | null = null

          if (supplierOrgNumber) {
            const { data: match } = await supabase
              .from('suppliers')
              .select('id')
              .eq('company_id', companyId)
              .eq('org_number', supplierOrgNumber)
              .limit(1)
            if (match?.[0]) supplierId = match[0].id
          }

          if (!supplierId) {
            const { data: match } = await supabase
              .from('suppliers')
              .select('id')
              .eq('company_id', companyId)
              .eq('name', inv.supplier.name)
              .limit(1)
            if (match?.[0]) supplierId = match[0].id
          }

          if (!supplierId) {
            const supplierType = inferTypeFromParty(inv.supplier)
            const minimalSupplier = {
              user_id: userId,
              company_id: companyId,
              name: inv.supplier.name,
              supplier_type: supplierType,
              default_payment_terms: 30,
              default_currency: 'SEK',
              country: inv.supplier.postalAddress?.countryCode || (supplierType === 'swedish_business' ? 'SE' : null),
            }
            const { data: created, error: supErr } = await supabase
              .from('suppliers')
              .insert(minimalSupplier)
              .select('id')
              .single()
            if (created) {
              supplierId = created.id
            } else {
              console.error(`[migration] Supplier invoice ${inv.invoiceNumber} skipped — could not create supplier "${inv.supplier.name}":`, supErr?.message)
            }
          }

          if (!supplierId) {
            console.log(`[migration] Supplier invoice ${inv.invoiceNumber} skipped — no supplier match for "${inv.supplier.name}" (org: ${supplierOrgNumber || 'n/a'})`)
            skipped++
            continue
          }

          const { data: existingInv } = await supabase
            .from('supplier_invoices')
            .select('id')
            .eq('company_id', companyId)
            .eq('supplier_invoice_number', inv.invoiceNumber)
            .eq('supplier_id', supplierId)
            .limit(1)

          if (existingInv && existingInv.length > 0) {
            console.log(`[migration] Supplier invoice ${inv.invoiceNumber} skipped — already exists for supplier "${inv.supplier.name}"`)
            skipped++
            continue
          }

          const { invoice: mappedInvoice, items: mappedItems } = mapSupplierInvoice(inv, userId, companyId, supplierId)

          // Get next arrival number (ankomstnummer) — required NOT NULL column
          const { data: arrivalNum, error: arrivalError } = await supabase
            .rpc('get_next_arrival_number', { p_company_id: companyId })

          if (arrivalError || arrivalNum == null) {
            console.error(`[migration] Supplier invoice ${inv.invoiceNumber} skipped — could not get arrival number:`, arrivalError?.message)
            skipped++
            continue
          }

          mappedInvoice.arrival_number = arrivalNum

          const { data: insertedInv, error: invError } = await supabase
            .from('supplier_invoices')
            .insert(mappedInvoice)
            .select('id')
            .single()

          if (invError || !insertedInv) {
            console.error(`[migration] Supplier invoice ${inv.invoiceNumber} insert failed for "${inv.supplier.name}":`, invError?.message, JSON.stringify(mappedInvoice, null, 2))
            skipped++
            continue
          }

          if (mappedItems.length > 0) {
            const itemsWithInvoiceId = mappedItems.map(item => ({
              ...item,
              supplier_invoice_id: insertedInv.id,
            }))
            await supabase.from('supplier_invoice_items').insert(itemsWithInvoiceId)
          }

          imported++
        }

        results.supplierInvoices = { total: openInvoices.length, imported, skipped }
      } catch (err) {
        console.error('Failed to import supplier invoices:', err)
      }
    }

    emitProgress(options, { status: 'completed', progress: 100, results })
    return results
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Migration failed'
    emitProgress(options, { status: 'failed', progress: 0, error: message })
    throw error
  }
}
