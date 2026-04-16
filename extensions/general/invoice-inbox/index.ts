import type { Extension, ExtensionContext } from '@/lib/extensions/types'
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { uploadDocument } from '@/lib/core/documents/document-service'
import { classifyDocument } from './lib/classify-document'
import { encryptState, decryptState, encryptToken, decryptToken } from './lib/gmail-helpers'
import { scanGmailConnection } from './lib/gmail-scanner'
import { createSupplierInvoiceRegistrationEntry } from '@/lib/bookkeeping/supplier-invoice-entries'
import { CreateSupplierInvoiceSchema } from '@/lib/api/schemas'
import type { InvoiceExtractionResult, InvoiceInboxItem, SupplierInvoice, SupplierInvoiceItem } from '@/types'

const MAX_FILE_SIZE = 10 * 1024 * 1024 // Match MAX_DOCUMENT_SIZE from document-service

const UPLOAD_ALLOWED_MIME_TYPES = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/heic',
  'image/heif',
  'image/webp',
])

const STATE_TTL_MS = 10 * 60 * 1000

// ── Shared helper: upload + classify + create inbox item ─────

async function uploadAndClassify(
  supabase: import('@supabase/supabase-js').SupabaseClient,
  userId: string,
  companyId: string,
  file: { name: string; buffer: ArrayBuffer; type: string },
  source: 'upload' | 'email',
  emailMeta?: { from?: string | null; subject?: string | null; receivedAt?: string | null; messageId?: string },
  ctx?: ExtensionContext
) {
  // Store in WORM archive
  const doc = await uploadDocument(supabase, userId, companyId, {
    name: file.name,
    buffer: file.buffer,
    type: file.type,
  }, {
    upload_source: source === 'email' ? 'email' : 'file_upload',
  })

  // Classify with AI
  let classificationResult
  let classificationError: string | null = null
  try {
    classificationResult = await classifyDocument({
      fileBuffer: Buffer.from(file.buffer),
      mimeType: file.type,
      fileName: file.name,
    })
  } catch (err) {
    classificationError = err instanceof Error ? err.message : 'Classification failed'
  }

  // Supplier matching
  let matchedSupplierId: string | null = null
  if (classificationResult?.documentType === 'supplier_invoice' && classificationResult.extractedData) {
    const extractedData = classificationResult.extractedData as InvoiceExtractionResult
    const orgNumber = extractedData.supplier?.orgNumber
    const supplierName = extractedData.supplier?.name

    if (orgNumber) {
      const normalized = orgNumber.replace(/\D/g, '')
      const { data: s } = await supabase
        .from('suppliers')
        .select('id')
        .eq('company_id', companyId)
        .eq('org_number', normalized)
        .limit(1)
        .maybeSingle()
      if (s) matchedSupplierId = s.id
    }
    if (!matchedSupplierId && supplierName) {
      const { data: s } = await supabase
        .from('suppliers')
        .select('id')
        .eq('company_id', companyId)
        .ilike('name', supplierName)
        .limit(1)
        .maybeSingle()
      if (s) matchedSupplierId = s.id
    }
  }

  // Create inbox item
  const { data: inbox, error: inboxError } = await supabase
    .from('invoice_inbox_items')
    .insert({
      company_id: companyId,
      user_id: userId,
      status: classificationError ? 'error' : 'ready',
      source,
      document_id: doc.id,
      document_type: classificationResult?.documentType || 'unknown',
      extracted_data: classificationResult?.extractedData || null,
      raw_llm_response: classificationResult?.rawResponse || null,
      confidence: classificationResult?.confidence
        ? classificationResult.confidence / 100
        : null,
      matched_supplier_id: matchedSupplierId,
      email_from: emailMeta?.from || null,
      email_subject: emailMeta?.subject || null,
      email_received_at: emailMeta?.receivedAt || null,
      raw_email_payload: emailMeta?.messageId
        ? { messageId: emailMeta.messageId, filename: file.name }
        : null,
      error_message: classificationError,
    })
    .select('id, status, document_type, confidence, matched_supplier_id, error_message')
    .single()

  if (inboxError) throw new Error(`Failed to create inbox item: ${inboxError.message}`)

  // Emit events for supplier invoices (non-blocking)
  if (ctx && inbox.document_type === 'supplier_invoice') {
    try {
      await ctx.emit({
        type: 'supplier_invoice.received',
        payload: { inboxItem: inbox as unknown as InvoiceInboxItem, userId, companyId },
      })
    } catch { /* non-blocking */ }

    if (!classificationError && classificationResult?.confidence) {
      try {
        await ctx.emit({
          type: 'supplier_invoice.extracted',
          payload: { inboxItem: inbox as unknown as InvoiceInboxItem, confidence: classificationResult.confidence / 100, userId, companyId },
        })
      } catch { /* non-blocking */ }
    }
  }

  return {
    document_id: doc.id,
    inbox_item_id: inbox.id,
    status: inbox.status,
    document_type: inbox.document_type,
    extracted_data: classificationResult?.extractedData || null,
    confidence: inbox.confidence,
    matched_supplier_id: inbox.matched_supplier_id,
    error_message: inbox.error_message,
  }
}

// ── Extension definition ─────────────────────────────────────

export const invoiceInboxExtension: Extension = {
  id: 'invoice-inbox',
  name: 'Dokumentinkorg',
  version: '1.0.0',

  apiRoutes: [
    // ── Upload ──────────────────────────────────────────────
    {
      method: 'POST',
      path: '/upload',
      handler: async (request: Request, ctx?: ExtensionContext) => {
        if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

        const formData = await request.formData()
        const file = formData.get('file') as File | null

        if (!file) {
          return NextResponse.json({ error: 'No file provided' }, { status: 400 })
        }
        if (file.size > MAX_FILE_SIZE) {
          return NextResponse.json({ error: `File too large (max ${MAX_FILE_SIZE / 1024 / 1024} MB)` }, { status: 400 })
        }
        if (!UPLOAD_ALLOWED_MIME_TYPES.has(file.type)) {
          return NextResponse.json(
            { error: `Unsupported file type: ${file.type}. Allowed: PDF, JPEG, PNG, HEIC, WebP` },
            { status: 400 }
          )
        }

        try {
          const buffer = await file.arrayBuffer()
          const result = await uploadAndClassify(
            ctx.supabase,
            ctx.userId,
            ctx.companyId,
            { name: file.name, buffer, type: file.type },
            'upload',
            undefined,
            ctx
          )
          return NextResponse.json({ data: result })
        } catch (error) {
          console.error('[invoice-inbox/upload] Failed:', error)
          return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Upload failed' },
            { status: 500 }
          )
        }
      },
    },

    // ── List inbox items ────────────────────────────────────
    {
      method: 'GET',
      path: '/items',
      handler: async (request: Request, ctx?: ExtensionContext) => {
        if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

        const url = new URL(request.url)
        const status = url.searchParams.get('status')
        const documentType = url.searchParams.get('document_type')
        const limit = Math.min(Math.max(1, Number(url.searchParams.get('limit')) || 20), 50)

        let query = ctx.supabase
          .from('invoice_inbox_items')
          .select('id, status, document_type, confidence, source, created_at, extracted_data, matched_supplier_id, document_id, email_from, email_subject, error_message')
          .eq('company_id', ctx.companyId)
          .order('created_at', { ascending: false })
          .limit(limit)

        if (status) query = query.eq('status', status)
        if (documentType) query = query.eq('document_type', documentType)

        const { data, error } = await query
        if (error) return NextResponse.json({ error: error.message }, { status: 500 })

        return NextResponse.json({ data: { items: data, count: data?.length ?? 0 } })
      },
    },

    // ── Get single inbox item ───────────────────────────────
    {
      method: 'GET',
      path: '/items/:id',
      handler: async (request: Request, ctx?: ExtensionContext) => {
        if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

        const url = new URL(request.url)
        const id = url.searchParams.get('_id')
        if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

        const { data, error } = await ctx.supabase
          .from('invoice_inbox_items')
          .select('*')
          .eq('id', id)
          .eq('company_id', ctx.companyId)
          .single()

        if (error) return NextResponse.json({ error: error.message }, { status: 500 })
        if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 })

        return NextResponse.json({ data })
      },
    },

    // ── Gmail OAuth: get auth URL ───────────────────────────
    {
      method: 'GET',
      path: '/gmail/auth',
      handler: async (_request: Request, ctx?: ExtensionContext) => {
        if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

        const clientId = process.env.GOOGLE_CLIENT_ID
        if (!clientId) {
          return NextResponse.json({ error: 'Google OAuth not configured' }, { status: 500 })
        }
        if (!process.env.GMAIL_TOKEN_ENCRYPTION_KEY) {
          return NextResponse.json({ error: 'GMAIL_TOKEN_ENCRYPTION_KEY is required' }, { status: 500 })
        }

        const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
        const redirectUri = `${appUrl}/api/extensions/ext/invoice-inbox/gmail/callback`

        const state = encryptState({
          companyId: ctx.companyId,
          userId: ctx.userId,
          exp: Date.now() + STATE_TTL_MS,
        })

        const params = new URLSearchParams({
          client_id: clientId,
          redirect_uri: redirectUri,
          response_type: 'code',
          scope: 'https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/gmail.labels',
          access_type: 'offline',
          prompt: 'consent',
          state,
        })

        return NextResponse.json({ data: { authUrl: `https://accounts.google.com/o/oauth2/v2/auth?${params}` } })
      },
    },

    // ── Gmail OAuth: callback (skipAuth — redirect from Google) ─
    {
      method: 'GET',
      path: '/gmail/callback',
      skipAuth: true,
      handler: async (request: Request) => {
        const url = new URL(request.url)
        const code = url.searchParams.get('code')
        const stateParam = url.searchParams.get('state')
        const error = url.searchParams.get('error')

        const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

        if (error) {
          console.error('[gmail/callback] OAuth error:', error)
          return NextResponse.redirect(`${appUrl}/e/general/invoice-inbox?error=gmail_auth_denied`)
        }
        if (!code || !stateParam) {
          return NextResponse.redirect(`${appUrl}/e/general/invoice-inbox?error=gmail_missing_params`)
        }
        if (!process.env.GMAIL_TOKEN_ENCRYPTION_KEY) {
          return NextResponse.redirect(`${appUrl}/e/general/invoice-inbox?error=gmail_config_error`)
        }

        const state = decryptState(stateParam) as { companyId: string; userId: string; exp: number } | null
        if (!state || Date.now() > state.exp) {
          return NextResponse.redirect(`${appUrl}/e/general/invoice-inbox?error=gmail_invalid_state`)
        }

        const { companyId, userId } = state
        const redirectUri = `${appUrl}/api/extensions/ext/invoice-inbox/gmail/callback`

        try {
          // Exchange code for tokens
          const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
              code,
              client_id: process.env.GOOGLE_CLIENT_ID!,
              client_secret: process.env.GOOGLE_CLIENT_SECRET!,
              redirect_uri: redirectUri,
              grant_type: 'authorization_code',
            }),
          })

          if (!tokenResponse.ok) {
            console.error('[gmail/callback] Token exchange failed:', await tokenResponse.text())
            return NextResponse.redirect(`${appUrl}/e/general/invoice-inbox?error=gmail_token_exchange`)
          }

          const tokens = await tokenResponse.json() as {
            access_token: string; refresh_token?: string
          }
          if (!tokens.refresh_token) {
            return NextResponse.redirect(`${appUrl}/e/general/invoice-inbox?error=gmail_no_refresh_token`)
          }

          // Get user email
          const profileResponse = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/profile', {
            headers: { Authorization: `Bearer ${tokens.access_token}` },
          })
          if (!profileResponse.ok) {
            return NextResponse.redirect(`${appUrl}/e/general/invoice-inbox?error=gmail_profile_error`)
          }
          const profile = await profileResponse.json() as { emailAddress: string }

          // Create gnubok-processed label
          let gmailLabelId: string | null = null
          try {
            const labelsResponse = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/labels', {
              headers: { Authorization: `Bearer ${tokens.access_token}` },
            })
            const labelsData = await labelsResponse.json() as { labels: { id: string; name: string }[] }
            const existing = labelsData.labels?.find((l) => l.name === 'gnubok-processed')

            if (existing) {
              gmailLabelId = existing.id
            } else {
              const createLabelResponse = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/labels', {
                method: 'POST',
                headers: {
                  Authorization: `Bearer ${tokens.access_token}`,
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                  name: 'gnubok-processed',
                  labelListVisibility: 'labelShow',
                  messageListVisibility: 'show',
                }),
              })
              if (createLabelResponse.ok) {
                const label = await createLabelResponse.json() as { id: string }
                gmailLabelId = label.id
              }
            }
          } catch (err) {
            console.warn('[gmail/callback] Failed to create Gmail label:', err)
          }

          // Store connection (service-role — no auth cookie in callback)
          const supabase = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY!
          )

          const { error: dbError } = await supabase
            .from('email_connections')
            .upsert(
              {
                company_id: companyId,
                user_id: userId,
                provider: 'gmail',
                email_address: profile.emailAddress,
                encrypted_token: encryptToken(tokens.refresh_token),
                gmail_label_id: gmailLabelId,
                status: 'active',
                error_message: null,
              },
              { onConflict: 'company_id,email_address' }
            )

          if (dbError) {
            console.error('[gmail/callback] DB insert failed:', dbError)
            return NextResponse.redirect(`${appUrl}/e/general/invoice-inbox?error=gmail_db_error`)
          }

          console.log(`[gmail/callback] Gmail connected for ${profile.emailAddress} (company ${companyId})`)
          return NextResponse.redirect(`${appUrl}/e/general/invoice-inbox?gmail=connected`)
        } catch (err) {
          console.error('[gmail/callback] Unexpected error:', err)
          return NextResponse.redirect(`${appUrl}/e/general/invoice-inbox?error=gmail_unexpected`)
        }
      },
    },

    // ── Gmail: disconnect ───────────────────────────────────
    {
      method: 'POST',
      path: '/gmail/disconnect',
      handler: async (_request: Request, ctx?: ExtensionContext) => {
        if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

        const { error } = await ctx.supabase
          .from('email_connections')
          .delete()
          .eq('company_id', ctx.companyId)
          .eq('provider', 'gmail')

        if (error) return NextResponse.json({ error: error.message }, { status: 500 })
        return NextResponse.json({ data: { disconnected: true } })
      },
    },

    // ── Gmail: connection status ────────────────────────────
    {
      method: 'GET',
      path: '/gmail/status',
      handler: async (_request: Request, ctx?: ExtensionContext) => {
        if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

        const { data, error } = await ctx.supabase
          .from('email_connections')
          .select('id, email_address, status, last_sync_at, error_message, created_at')
          .eq('company_id', ctx.companyId)
          .eq('provider', 'gmail')

        if (error) return NextResponse.json({ error: error.message }, { status: 500 })
        return NextResponse.json({ data: { connections: data || [] } })
      },
    },

    // ── Gmail: manual scan trigger ──────────────────────────
    {
      method: 'POST',
      path: '/gmail/scan',
      handler: async (_request: Request, ctx?: ExtensionContext) => {
        if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

        if (!process.env.GMAIL_TOKEN_ENCRYPTION_KEY) {
          return NextResponse.json({ error: 'GMAIL_TOKEN_ENCRYPTION_KEY is required' }, { status: 500 })
        }

        const { data: connections, error: connError } = await ctx.supabase
          .from('email_connections')
          .select('*')
          .eq('company_id', ctx.companyId)
          .eq('status', 'active')

        if (connError) return NextResponse.json({ error: 'Failed to fetch connections' }, { status: 500 })
        if (!connections?.length) {
          return NextResponse.json({ data: { message: 'No active Gmail connections', scanned: 0 } })
        }

        let totalScanned = 0, totalClassified = 0, totalSkipped = 0, totalErrors = 0

        for (const connection of connections) {
          const result = await scanGmailConnection(ctx.supabase, connection, ctx.userId, ctx.companyId)
          totalScanned += result.scanned
          totalClassified += result.classified
          totalSkipped += result.skipped
          totalErrors += result.errors
        }

        return NextResponse.json({
          data: { scanned: totalScanned, classified: totalClassified, skipped: totalSkipped, errors: totalErrors },
        })
      },
    },

    // ── Reject inbox item ──────────────────────────────────
    {
      method: 'PATCH',
      path: '/items/:id/reject',
      handler: async (_request: Request, ctx?: ExtensionContext) => {
        if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

        const url = new URL(_request.url)
        const id = url.searchParams.get('_id')
        if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

        const { data: item, error: fetchError } = await ctx.supabase
          .from('invoice_inbox_items')
          .select('id, status')
          .eq('id', id)
          .eq('company_id', ctx.companyId)
          .single()

        if (fetchError || !item) return NextResponse.json({ error: 'Not found' }, { status: 404 })
        if (item.status === 'confirmed') return NextResponse.json({ error: 'Cannot reject a confirmed item' }, { status: 409 })

        const { error: updateError } = await ctx.supabase
          .from('invoice_inbox_items')
          .update({ status: 'rejected' })
          .eq('id', id)

        if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 })
        return NextResponse.json({ data: { id, status: 'rejected' } })
      },
    },

    // ── Convert inbox item to supplier invoice ─────────────
    {
      method: 'POST',
      path: '/items/:id/convert',
      handler: async (request: Request, ctx?: ExtensionContext) => {
        if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

        const url = new URL(request.url)
        const id = url.searchParams.get('_id')
        if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

        // Fetch inbox item
        const { data: item, error: fetchError } = await ctx.supabase
          .from('invoice_inbox_items')
          .select('*')
          .eq('id', id)
          .eq('company_id', ctx.companyId)
          .single()

        if (fetchError || !item) return NextResponse.json({ error: 'Inbox item not found' }, { status: 404 })
        if (item.status !== 'ready') return NextResponse.json({ error: 'Item is not in ready status' }, { status: 409 })

        // Validate request body
        let body: ReturnType<typeof CreateSupplierInvoiceSchema.parse>
        try {
          const json = await request.json()
          body = CreateSupplierInvoiceSchema.parse(json)
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Invalid request body'
          return NextResponse.json({ error: message }, { status: 400 })
        }

        // Verify supplier exists
        const { data: supplier, error: supplierError } = await ctx.supabase
          .from('suppliers')
          .select('*')
          .eq('id', body.supplier_id)
          .eq('company_id', ctx.companyId)
          .single()

        if (supplierError || !supplier) {
          return NextResponse.json({ error: 'Supplier not found' }, { status: 404 })
        }

        // Get next arrival number
        const { data: arrivalNum, error: arrivalError } = await ctx.supabase
          .rpc('get_next_arrival_number', { p_company_id: ctx.companyId })

        if (arrivalError) {
          return NextResponse.json({ error: 'Failed to get arrival number' }, { status: 500 })
        }

        // Calculate totals (same logic as app/api/supplier-invoices/route.ts)
        const items = body.items.map((bodyItem, index) => {
          const vatRate = bodyItem.vat_rate ?? 0.25
          const lineTotal = bodyItem.amount != null
            ? Math.round(bodyItem.amount * 100) / 100
            : Math.round((bodyItem.quantity ?? 1) * (bodyItem.unit_price ?? 0) * 100) / 100
          const vatAmount = Math.round(lineTotal * vatRate * 100) / 100
          return {
            sort_order: index,
            description: bodyItem.description,
            quantity: bodyItem.amount != null ? 1 : (bodyItem.quantity ?? 1),
            unit: bodyItem.amount != null ? 'st' : (bodyItem.unit || 'st'),
            unit_price: bodyItem.amount != null ? lineTotal : (bodyItem.unit_price ?? 0),
            line_total: lineTotal,
            account_number: bodyItem.account_number,
            vat_code: bodyItem.vat_code || null,
            vat_rate: vatRate,
            vat_amount: vatAmount,
          }
        })

        const subtotal = items.reduce((sum, i) => sum + i.line_total, 0)
        const totalVat = items.reduce((sum, i) => sum + i.vat_amount, 0)
        const total = Math.round((subtotal + totalVat) * 100) / 100

        const exchangeRate = body.exchange_rate || null
        const subtotalSek = exchangeRate ? Math.round(subtotal * exchangeRate * 100) / 100 : null
        const vatAmountSek = exchangeRate ? Math.round(totalVat * exchangeRate * 100) / 100 : null
        const totalSek = exchangeRate ? Math.round(total * exchangeRate * 100) / 100 : null

        // Insert supplier invoice
        const { data: invoice, error: invoiceError } = await ctx.supabase
          .from('supplier_invoices')
          .insert({
            user_id: ctx.userId,
            company_id: ctx.companyId,
            supplier_id: body.supplier_id,
            arrival_number: arrivalNum,
            supplier_invoice_number: body.supplier_invoice_number,
            invoice_date: body.invoice_date,
            due_date: body.due_date,
            delivery_date: body.delivery_date || null,
            status: 'registered',
            currency: body.currency || 'SEK',
            exchange_rate: exchangeRate,
            vat_treatment: body.vat_treatment || 'standard_25',
            reverse_charge: body.reverse_charge || false,
            payment_reference: body.payment_reference || null,
            subtotal: Math.round(subtotal * 100) / 100,
            subtotal_sek: subtotalSek,
            vat_amount: Math.round(totalVat * 100) / 100,
            vat_amount_sek: vatAmountSek,
            total: Math.round(total * 100) / 100,
            total_sek: totalSek,
            remaining_amount: Math.round(total * 100) / 100,
            document_id: item.document_id || null,
            notes: body.notes || null,
          })
          .select()
          .single()

        if (invoiceError || !invoice) {
          return NextResponse.json({ error: invoiceError?.message || 'Failed to create invoice' }, { status: 500 })
        }

        // Insert line items
        const itemInserts = items.map((lineItem) => ({
          supplier_invoice_id: invoice.id,
          ...lineItem,
        }))

        const { error: itemsError } = await ctx.supabase
          .from('supplier_invoice_items')
          .insert(itemInserts)

        if (itemsError) {
          await ctx.supabase.from('supplier_invoices').delete().eq('id', invoice.id)
          return NextResponse.json({ error: itemsError.message }, { status: 500 })
        }

        // Accrual method: create registration journal entry
        const { data: settings } = await ctx.supabase
          .from('company_settings')
          .select('accounting_method')
          .eq('company_id', ctx.companyId)
          .single()

        const accountingMethod = settings?.accounting_method || 'accrual'
        let registrationJournalEntryId: string | null = null

        if (accountingMethod === 'accrual') {
          try {
            const journalEntry = await createSupplierInvoiceRegistrationEntry(
              ctx.supabase,
              ctx.companyId,
              ctx.userId,
              invoice as SupplierInvoice,
              items as SupplierInvoiceItem[],
              supplier.supplier_type,
              supplier.name
            )
            if (journalEntry) {
              registrationJournalEntryId = journalEntry.id
              await ctx.supabase
                .from('supplier_invoices')
                .update({ registration_journal_entry_id: journalEntry.id })
                .eq('id', invoice.id)

              // Link the document to the journal entry
              if (item.document_id) {
                await ctx.supabase
                  .from('document_attachments')
                  .update({ journal_entry_id: journalEntry.id })
                  .eq('id', item.document_id)
              }
            }
          } catch (err) {
            console.error('[invoice-inbox/convert] Failed to create registration journal entry:', err)
          }
        }

        // Emit supplier_invoice.registered
        try {
          await ctx.emit({
            type: 'supplier_invoice.registered',
            payload: { supplierInvoice: invoice as SupplierInvoice, companyId: ctx.companyId, userId: ctx.userId },
          })
        } catch { /* non-blocking */ }

        // Update inbox item to confirmed
        await ctx.supabase
          .from('invoice_inbox_items')
          .update({ status: 'confirmed', created_supplier_invoice_id: invoice.id })
          .eq('id', id)

        // Emit supplier_invoice.confirmed
        try {
          await ctx.emit({
            type: 'supplier_invoice.confirmed',
            payload: {
              inboxItem: { ...item, status: 'confirmed', created_supplier_invoice_id: invoice.id } as InvoiceInboxItem,
              supplierInvoice: invoice as SupplierInvoice,
              userId: ctx.userId,
              companyId: ctx.companyId,
            },
          })
        } catch { /* non-blocking */ }

        // Suggest matching transaction (don't book — user confirms in UI)
        let suggestedTransaction: { id: string; description: string; amount: number; currency: string; date: string } | null = null
        try {
          const invoiceTotal = Math.round(total * 100) / 100
          const invoiceTotalSek = totalSek ? Math.round(totalSek * 100) / 100 : null

          const { data: candidates } = await ctx.supabase
            .from('transactions')
            .select('id, description, amount, currency, date')
            .eq('company_id', ctx.companyId)
            .is('supplier_invoice_id', null)
            .lt('amount', 0)
            .order('date', { ascending: false })
            .limit(100)

          if (candidates?.length) {
            const supplierWords = supplier.name.toLowerCase().replace(/[,.\-]/g, ' ').split(/\s+/).filter((w: string) => w.length >= 3)

            const match = candidates.find((tx) => {
              const txAmount = Math.round(Math.abs(tx.amount) * 100) / 100
              const txDesc = tx.description?.toLowerCase() || ''

              const exactMatch = txAmount === invoiceTotal
              const sekMatch = invoiceTotalSek != null && Math.abs(txAmount - invoiceTotalSek) / invoiceTotalSek < 0.05

              const nameMatch = supplierWords.some((word: string) => {
                if (txDesc.includes(word)) return true
                const txWords = txDesc.split(/\s+/)
                return txWords.some((tw: string) => {
                  if (tw.length < 3 || word.length < 3) return false
                  if (Math.abs(tw.length - word.length) > 1) return false
                  let diffs = 0
                  const longer = tw.length >= word.length ? tw : word
                  const shorter = tw.length >= word.length ? word : tw
                  let j = 0
                  for (let i = 0; i < longer.length && diffs <= 1; i++) {
                    if (longer[i] !== shorter[j]) { diffs++; if (longer.length === shorter.length) j++ }
                    else { j++ }
                  }
                  return diffs <= 1
                })
              })

              return (exactMatch || sekMatch) && nameMatch
            })

            if (match) {
              suggestedTransaction = match as unknown as typeof suggestedTransaction
            }
          }
        } catch (err) {
          console.error('[invoice-inbox/convert] Transaction suggestion failed (non-blocking):', err)
        }

        return NextResponse.json({
          data: {
            ...invoice,
            items: itemInserts,
            registration_journal_entry_id: registrationJournalEntryId,
            inbox_item_id: id,
            suggested_transaction: suggestedTransaction,
          },
        })
      },
    },
  ],
}
