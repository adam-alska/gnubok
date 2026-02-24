import { Resend } from 'resend'
import { createLogger } from '@/lib/logger'

const log = createLogger('email')

// Default sender configuration
// Using a fixed From address with dynamic Reply-To
// From: "Företagsnamn via ERP Base" <your-from@example.com>
// Reply-To: user's company email from company_settings
// Set RESEND_FROM_EMAIL in .env.local to your verified Resend domain
const DEFAULT_FROM_EMAIL = process.env.RESEND_FROM_EMAIL || 'noreply@localhost'

// Lazy initialization to avoid errors at build time
let resendClient: Resend | null = null

function getResendClient(): Resend {
  if (!resendClient) {
    if (!process.env.RESEND_API_KEY) {
      throw new Error('RESEND_API_KEY is not configured')
    }
    resendClient = new Resend(process.env.RESEND_API_KEY)
  }
  return resendClient
}

export interface SendEmailOptions {
  to: string | string[]
  subject: string
  html: string
  text?: string
  replyTo?: string
  fromName?: string
  attachments?: Array<{
    filename: string
    content: Buffer | string
    contentType?: string
  }>
}

export interface SendEmailResult {
  success: boolean
  messageId?: string
  error?: string
}

/**
 * Send an email via Resend
 *
 * @param options Email options including to, subject, html content
 * @returns Result with success status and optional error
 */
export async function sendEmail(options: SendEmailOptions): Promise<SendEmailResult> {
  const {
    to,
    subject,
    html,
    text,
    replyTo,
    fromName,
    attachments
  } = options

  // Check configuration before attempting to send
  if (!isResendConfigured()) {
    return {
      success: false,
      error: 'Email service is not configured'
    }
  }

  // Construct from address with optional name
  const from = fromName
    ? `${fromName} via ERP Base <${DEFAULT_FROM_EMAIL}>`
    : `ERP Base <${DEFAULT_FROM_EMAIL}>`

  try {
    const resend = getResendClient()
    const response = await resend.emails.send({
      from,
      to: Array.isArray(to) ? to : [to],
      subject,
      html,
      text,
      replyTo,
      attachments: attachments?.map(att => ({
        filename: att.filename,
        content: typeof att.content === 'string'
          ? Buffer.from(att.content, 'base64')
          : att.content,
        content_type: att.contentType
      }))
    })

    if (response.error) {
      log.error('Resend error:', response.error)
      return {
        success: false,
        error: response.error.message
      }
    }

    return {
      success: true,
      messageId: response.data?.id
    }
  } catch (error) {
    log.error('Failed to send email:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }
  }
}

/**
 * Check if Resend is properly configured
 */
export function isResendConfigured(): boolean {
  return !!process.env.RESEND_API_KEY && !!process.env.RESEND_FROM_EMAIL && process.env.RESEND_FROM_EMAIL !== 'noreply@localhost'
}
