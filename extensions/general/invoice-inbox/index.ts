import type { Extension, ExtensionContext } from '@/lib/extensions/types'
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { uploadDocument } from '@/lib/core/documents/document-service'
import { classifyDocument } from './lib/classify-document'
import { encryptState, decryptState, encryptToken, decryptToken } from './lib/gmail-helpers'
import { scanGmailConnection } from './lib/gmail-scanner'
import type { InvoiceExtractionResult } from '@/types'

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
  emailMeta?: { from?: string | null; subject?: string | null; receivedAt?: string | null; messageId?: string }
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
          return NextResponse.json({ error: 'File too large (max 20 MB)' }, { status: 400 })
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
            'upload'
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
          .select('id, status, document_type, confidence, source, created_at, extracted_data, matched_supplier_id, email_from, email_subject, error_message')
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
          return NextResponse.redirect(`${appUrl}/settings/banking?error=gmail_auth_denied`)
        }
        if (!code || !stateParam) {
          return NextResponse.redirect(`${appUrl}/settings/banking?error=gmail_missing_params`)
        }
        if (!process.env.GMAIL_TOKEN_ENCRYPTION_KEY) {
          return NextResponse.redirect(`${appUrl}/settings/banking?error=gmail_config_error`)
        }

        const state = decryptState(stateParam) as { companyId: string; userId: string; exp: number } | null
        if (!state || Date.now() > state.exp) {
          return NextResponse.redirect(`${appUrl}/settings/banking?error=gmail_invalid_state`)
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
            return NextResponse.redirect(`${appUrl}/settings/banking?error=gmail_token_exchange`)
          }

          const tokens = await tokenResponse.json() as {
            access_token: string; refresh_token?: string
          }
          if (!tokens.refresh_token) {
            return NextResponse.redirect(`${appUrl}/settings/banking?error=gmail_no_refresh_token`)
          }

          // Get user email
          const profileResponse = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/profile', {
            headers: { Authorization: `Bearer ${tokens.access_token}` },
          })
          if (!profileResponse.ok) {
            return NextResponse.redirect(`${appUrl}/settings/banking?error=gmail_profile_error`)
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
            return NextResponse.redirect(`${appUrl}/settings/banking?error=gmail_db_error`)
          }

          console.log(`[gmail/callback] Gmail connected for ${profile.emailAddress} (company ${companyId})`)
          return NextResponse.redirect(`${appUrl}/settings/banking?gmail=connected`)
        } catch (err) {
          console.error('[gmail/callback] Unexpected error:', err)
          return NextResponse.redirect(`${appUrl}/settings/banking?error=gmail_unexpected`)
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
  ],
}
