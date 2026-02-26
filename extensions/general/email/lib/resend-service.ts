/**
 * Resend Email Service Implementation
 *
 * Implements EmailService using the Resend API.
 */

import { Resend } from 'resend'
import { createLogger } from '@/lib/logger'
import type { EmailService, SendEmailOptions, SendEmailResult } from '@/lib/email/service'

const log = createLogger('email')

const DEFAULT_FROM_EMAIL = process.env.RESEND_FROM_EMAIL || 'noreply@localhost'

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

function isResendConfigured(): boolean {
  return !!process.env.RESEND_API_KEY && !!process.env.RESEND_FROM_EMAIL && process.env.RESEND_FROM_EMAIL !== 'noreply@localhost'
}

export class ResendEmailService implements EmailService {
  async sendEmail(options: SendEmailOptions): Promise<SendEmailResult> {
    const { to, subject, html, text, replyTo, fromName, attachments } = options

    if (!this.isConfigured()) {
      return { success: false, error: 'Email service is not configured' }
    }

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
          content_type: att.contentType,
        })),
      })

      if (response.error) {
        log.error('Resend error:', response.error)
        return { success: false, error: response.error.message }
      }

      return { success: true, messageId: response.data?.id }
    } catch (error) {
      log.error('Failed to send email:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      }
    }
  }

  isConfigured(): boolean {
    return isResendConfigured()
  }
}
