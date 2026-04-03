import type { SupabaseClient } from '@supabase/supabase-js'
import { uploadDocument, computeSHA256 } from '@/lib/core/documents/document-service'
import { classifyDocument } from './classify-document'
import { decryptToken, refreshAccessToken } from './gmail-helpers'
import type { InvoiceExtractionResult } from '@/types'

const MIN_ATTACHMENT_SIZE = 3_000
const MAX_MESSAGES = 30

const ALLOWED_MIME_TYPES = new Set([
  'application/pdf',
  'application/octet-stream',
  'image/jpeg',
  'image/png',
  'image/heic',
  'image/heif',
  'image/webp',
])

const SKIP_EXTENSIONS = new Set([
  'ics', 'vcf', 'html', 'htm', 'zip', 'rar', 'gz',
  'csv', 'json', 'xml', 'txt', 'eml', 'msg',
  'mp3', 'mp4', 'mov', 'avi', 'wav',
])

interface GmailMessage {
  id: string
  payload: {
    headers: { name: string; value: string }[]
    parts?: GmailPart[]
    mimeType: string
    body?: { attachmentId?: string; size?: number; data?: string }
  }
  internalDate: string
}

interface GmailPart {
  mimeType: string
  filename: string
  body: { attachmentId?: string; size?: number; data?: string }
  parts?: GmailPart[]
}

function getHeader(message: GmailMessage, name: string): string | null {
  return message.payload.headers.find(
    (h) => h.name.toLowerCase() === name.toLowerCase()
  )?.value ?? null
}

function collectAttachments(parts: GmailPart[] | undefined): GmailPart[] {
  if (!parts) return []
  const result: GmailPart[] = []
  for (const part of parts) {
    if (part.filename && part.body?.attachmentId) {
      result.push(part)
    }
    if (part.parts) {
      result.push(...collectAttachments(part.parts))
    }
  }
  return result
}

function resolveActualMimeType(mimeType: string, filename: string): string | null {
  const ext = filename.split('.').pop()?.toLowerCase()
  if (ext && SKIP_EXTENSIONS.has(ext)) return null

  if (mimeType === 'application/octet-stream') {
    const extMap: Record<string, string> = {
      pdf: 'application/pdf',
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      png: 'image/png',
      webp: 'image/webp',
    }
    return ext && extMap[ext] ? extMap[ext] : null
  }

  return mimeType
}

export interface ScanResult {
  scanned: number
  classified: number
  skipped: number
  errors: number
}

interface EmailConnection {
  id: string
  company_id: string
  encrypted_token: string
  last_sync_at: string | null
  gmail_label_id: string | null
}

export async function scanGmailConnection(
  supabase: SupabaseClient,
  connection: EmailConnection,
  userId: string,
  companyId: string
): Promise<ScanResult> {
  const result: ScanResult = { scanned: 0, classified: 0, skipped: 0, errors: 0 }
  const seenFileHashes = new Set<string>()

  const refreshToken = decryptToken(connection.encrypted_token)
  if (!refreshToken) {
    await supabase
      .from('email_connections')
      .update({ status: 'error', error_message: 'Failed to decrypt refresh token' })
      .eq('id', connection.id)
    result.errors++
    return result
  }

  const accessToken = await refreshAccessToken(refreshToken)
  if (!accessToken) {
    await supabase
      .from('email_connections')
      .update({ status: 'revoked', error_message: 'Token refresh failed — user may have revoked access' })
      .eq('id', connection.id)
    result.errors++
    return result
  }

  // Build Gmail search query
  let afterDate: string
  if (connection.last_sync_at) {
    const d = new Date(connection.last_sync_at)
    afterDate = `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`
  } else {
    const d = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000)
    afterDate = `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`
  }

  let query = `has:attachment after:${afterDate}`
  if (connection.gmail_label_id) {
    query += ' -label:gnubok-processed'
  }

  const listUrl = `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(query)}&maxResults=${MAX_MESSAGES}`
  const listResponse = await fetch(listUrl, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })

  if (!listResponse.ok) {
    console.error('[gmail/scan] Failed to list messages:', await listResponse.text())
    result.errors++
    return result
  }

  const listData = await listResponse.json() as { messages?: { id: string }[] }
  const messageIds = listData.messages || []

  for (const { id: messageId } of messageIds) {
    try {
      const msgResponse = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}?format=full`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      )
      if (!msgResponse.ok) continue
      const message = await msgResponse.json() as GmailMessage

      const emailFrom = getHeader(message, 'From')
      const emailSubject = getHeader(message, 'Subject')
      const emailDate = message.internalDate
        ? new Date(parseInt(message.internalDate)).toISOString()
        : null

      const attachments = collectAttachments(message.payload.parts)

      for (const attachment of attachments) {
        if (!attachment.body.attachmentId) continue
        if ((attachment.body.size ?? 0) < MIN_ATTACHMENT_SIZE) continue
        if (!ALLOWED_MIME_TYPES.has(attachment.mimeType)) continue

        const resolvedMimeType = resolveActualMimeType(attachment.mimeType, attachment.filename)
        if (!resolvedMimeType) continue

        // Deduplicate by message ID + filename
        const { data: existing } = await supabase
          .from('invoice_inbox_items')
          .select('id')
          .eq('company_id', companyId)
          .eq('source', 'email')
          .filter('raw_email_payload->>messageId', 'eq', messageId)
          .filter('raw_email_payload->>filename', 'eq', attachment.filename)
          .limit(1)
          .maybeSingle()

        if (existing) {
          result.skipped++
          continue
        }

        // Download attachment
        const attResponse = await fetch(
          `https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}/attachments/${attachment.body.attachmentId}`,
          { headers: { Authorization: `Bearer ${accessToken}` } }
        )
        if (!attResponse.ok) {
          result.errors++
          continue
        }

        const attData = await attResponse.json() as { data: string }
        const fileBuffer = Buffer.from(attData.data, 'base64url')

        // Deduplicate by file content hash
        const fileHash = await computeSHA256(fileBuffer.buffer.slice(
          fileBuffer.byteOffset,
          fileBuffer.byteOffset + fileBuffer.byteLength
        ))
        if (seenFileHashes.has(fileHash)) {
          result.skipped++
          continue
        }
        const { data: existingByHash } = await supabase
          .from('document_attachments')
          .select('id')
          .eq('company_id', companyId)
          .eq('sha256_hash', fileHash)
          .limit(1)
          .maybeSingle()
        if (existingByHash) {
          result.skipped++
          seenFileHashes.add(fileHash)
          continue
        }
        seenFileHashes.add(fileHash)

        // Store in WORM archive
        const doc = await uploadDocument(supabase, userId, companyId, {
          name: attachment.filename,
          buffer: fileBuffer.buffer.slice(
            fileBuffer.byteOffset,
            fileBuffer.byteOffset + fileBuffer.byteLength
          ),
          type: resolvedMimeType,
        }, {
          upload_source: 'email',
        })

        // Classify
        let classificationResult
        let classificationError: string | null = null
        try {
          classificationResult = await classifyDocument({
            fileBuffer,
            mimeType: resolvedMimeType,
            fileName: attachment.filename,
          })
        } catch (err) {
          classificationError = err instanceof Error ? err.message : 'Classification failed'
          console.error('[gmail/scan] Classification failed:', err)
        }

        // Find matching supplier
        let matchedSupplierId: string | null = null
        if (classificationResult?.documentType === 'supplier_invoice' && classificationResult.extractedData) {
          const extractedData = classificationResult.extractedData as InvoiceExtractionResult
          const orgNumber = extractedData.supplier?.orgNumber
          if (orgNumber) {
            const normalized = orgNumber.replace(/\D/g, '')
            const { data: supplierByOrg } = await supabase
              .from('suppliers')
              .select('id')
              .eq('company_id', companyId)
              .eq('org_number', normalized)
              .limit(1)
              .maybeSingle()
            if (supplierByOrg) matchedSupplierId = supplierByOrg.id
          }
        }

        // Create inbox item
        await supabase.from('invoice_inbox_items').insert({
          company_id: companyId,
          user_id: userId,
          status: classificationError ? 'error' : 'ready',
          source: 'email',
          document_id: doc.id,
          document_type: classificationResult?.documentType || 'unknown',
          extracted_data: classificationResult?.extractedData || null,
          raw_llm_response: classificationResult?.rawResponse || null,
          confidence: classificationResult?.confidence
            ? classificationResult.confidence / 100
            : null,
          matched_supplier_id: matchedSupplierId,
          email_from: emailFrom,
          email_subject: emailSubject,
          email_received_at: emailDate,
          raw_email_payload: { messageId, filename: attachment.filename },
          error_message: classificationError,
        })

        if (classificationError) {
          result.errors++
        } else {
          result.classified++
        }
        result.scanned++
      }

      // Label message as processed
      if (connection.gmail_label_id) {
        try {
          await fetch(
            `https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}/modify`,
            {
              method: 'POST',
              headers: {
                Authorization: `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({ addLabelIds: [connection.gmail_label_id] }),
            }
          )
        } catch {
          // Non-blocking
        }
      }
    } catch (err) {
      console.error('[gmail/scan] Error processing message:', err)
      result.errors++
    }
  }

  // Update last_sync_at
  await supabase
    .from('email_connections')
    .update({ last_sync_at: new Date().toISOString(), error_message: null })
    .eq('id', connection.id)

  return result
}
