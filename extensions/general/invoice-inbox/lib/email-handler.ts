/**
 * Email Handler - Parse Resend inbound webhook payloads
 *
 * SERVER-ONLY: Uses service role client for cross-user lookups.
 */

import 'server-only'
import type { ResendInboundPayload, ResendAttachment } from '../types'

const SUPPORTED_MIME_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
]

/**
 * Parse and validate a Resend inbound webhook payload
 */
export function parseInboundPayload(body: unknown): ResendInboundPayload | null {
  if (!body || typeof body !== 'object') return null

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data = body as any

  if (!data.from || !data.to) return null

  return {
    from: String(data.from),
    to: String(data.to),
    subject: data.subject ? String(data.subject) : '',
    html: data.html || null,
    text: data.text || null,
    attachments: Array.isArray(data.attachments) ? data.attachments : [],
    created_at: data.created_at || new Date().toISOString(),
  }
}

/**
 * Extract supported file attachments from the payload.
 * Returns only PDF and image attachments.
 */
export function extractAttachments(payload: ResendInboundPayload): ResendAttachment[] {
  return payload.attachments.filter(
    (att) => att.content_type && SUPPORTED_MIME_TYPES.includes(att.content_type) && att.content
  )
}

/**
 * Resolve user_id from the recipient email address.
 * Looks up the extension_data table where users store their inbox email setting.
 *
 * Uses a service role client (passed as parameter) since webhook requests
 * don't have user authentication.
 */
export async function resolveUserFromEmail(
  recipientEmail: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  serviceClient: any
): Promise<string | null> {
  // Extract the local part (before @) to handle address variants
  const normalizedEmail = recipientEmail.toLowerCase().trim()

  // Look up in extension_data where invoice-inbox settings store the inbox email
  const { data, error } = await serviceClient
    .from('extension_data')
    .select('user_id, value')
    .eq('extension_id', 'invoice-inbox')
    .eq('key', 'settings')

  if (error || !data) return null

  // Find the user whose inboxEmail matches the recipient
  for (const row of data) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const settings = row.value as any
    if (settings?.inboxEmail && settings.inboxEmail.toLowerCase().trim() === normalizedEmail) {
      return row.user_id
    }
  }

  return null
}
