/**
 * Migration orchestrator — coordinates the data migration from
 * an external accounting system via Arcim Sync into gnubok.
 *
 * Bookkeeping data (accounts, balances, vouchers) is now imported
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
import {
  fetchCompanyInfo,
  fetchCustomers,
  fetchSuppliers,
  fetchSalesInvoices,
  fetchSupplierInvoices,
} from './arcim-client'
import {
  mapCustomer,
  mapSupplier,
  mapSalesInvoice,
  mapSupplierInvoice,
  mapCompanyInfo,
} from './entity-mapper'

export interface MigrationOptions {
  consentId: string
  userId: string
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
  const { consentId, userId, supabase } = options
  const results: MigrationResults = {}

  try {
    // ── Step 1: Company information ───────────────────────────────
    if (options.importCompanyInfo !== false) {
      emitProgress(options, { status: 'fetching', currentStep: 'Hämtar företagsinformation...', progress: 5 })
      try {
        const companyInfo = await fetchCompanyInfo(consentId)
        if (companyInfo) {
          const mapped = mapCompanyInfo(companyInfo)
          const { data: existing } = await supabase
            .from('company_settings')
            .select('company_name, org_number, vat_number')
            .eq('user_id', userId)
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
            await supabase.from('company_settings').update(updates).eq('user_id', userId)
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
        const customers = await fetchCustomers(consentId)
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
              .eq('user_id', userId)
              .eq('org_number', orgNumber)
              .limit(1)

            if (existing && existing.length > 0) {
              console.log(`[migration] Customer skipped (duplicate org_number ${orgNumber}): ${customer.party.name}`)
              customerIdMap.set(customer.id, existing[0].id)
              skipped++
              continue
            }
          }

          const mapped = mapCustomer(customer, userId)
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
        const suppliers = await fetchSuppliers(consentId)
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
              .eq('user_id', userId)
              .eq('org_number', orgNumber)
              .limit(1)

            if (existing && existing.length > 0) {
              console.log(`[migration] Supplier skipped (duplicate org_number ${orgNumber}): ${supplier.party.name}`)
              supplierIdMap.set(supplier.id, existing[0].id)
              skipped++
              continue
            }
          }

          const mapped = mapSupplier(supplier, userId)
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
        const invoices = await fetchSalesInvoices(consentId)
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
              .eq('user_id', userId)
              .eq('org_number', customerOrgNumber)
              .limit(1)
            if (match?.[0]) customerId = match[0].id
          }

          if (!customerId) {
            const { data: match } = await supabase
              .from('customers')
              .select('id')
              .eq('user_id', userId)
              .eq('name', inv.customer.name)
              .limit(1)
            if (match?.[0]) customerId = match[0].id
          }

          if (!customerId) {
            const minimalCustomer = {
              user_id: userId,
              name: inv.customer.name,
              customer_type: 'swedish_business',
              default_payment_terms: 30,
              country: 'SE',
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
            .eq('user_id', userId)
            .eq('invoice_number', inv.invoiceNumber)
            .limit(1)

          if (existingInv && existingInv.length > 0) {
            console.log(`[migration] Sales invoice ${inv.invoiceNumber} skipped — already exists`)
            skipped++
            continue
          }

          const { invoice: mappedInvoice, items: mappedItems } = mapSalesInvoice(inv, userId, customerId)

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
        const invoices = await fetchSupplierInvoices(consentId)
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
              .eq('user_id', userId)
              .eq('org_number', supplierOrgNumber)
              .limit(1)
            if (match?.[0]) supplierId = match[0].id
          }

          if (!supplierId) {
            const { data: match } = await supabase
              .from('suppliers')
              .select('id')
              .eq('user_id', userId)
              .eq('name', inv.supplier.name)
              .limit(1)
            if (match?.[0]) supplierId = match[0].id
          }

          if (!supplierId) {
            const minimalSupplier = {
              user_id: userId,
              name: inv.supplier.name,
              supplier_type: 'swedish_business',
              default_payment_terms: 30,
              default_currency: 'SEK',
              country: 'SE',
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
            .eq('user_id', userId)
            .eq('supplier_invoice_number', inv.invoiceNumber)
            .eq('supplier_id', supplierId)
            .limit(1)

          if (existingInv && existingInv.length > 0) {
            console.log(`[migration] Supplier invoice ${inv.invoiceNumber} skipped — already exists for supplier "${inv.supplier.name}"`)
            skipped++
            continue
          }

          const { invoice: mappedInvoice, items: mappedItems } = mapSupplierInvoice(inv, userId, supplierId)

          // Get next arrival number (ankomstnummer) — required NOT NULL column
          const { data: arrivalNum, error: arrivalError } = await supabase
            .rpc('get_next_arrival_number', { p_user_id: userId })

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
