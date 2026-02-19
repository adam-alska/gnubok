import { NextResponse } from 'next/server'
import { processOverdueReminders } from '@/lib/invoices/reminder-processor'
import { isResendConfigured } from '@/lib/email/resend'
import { logger } from '@/lib/logger'

// Verify cron secret for security
function verifyCronSecret(request: Request): boolean {
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET

  if (!cronSecret) {
    logger.error('invoice-reminder-cron', 'CRON_SECRET not configured')
    return false
  }

  if (!authHeader) {
    return false
  }

  // Support both "Bearer <token>" and just "<token>" formats
  const token = authHeader.startsWith('Bearer ')
    ? authHeader.substring(7)
    : authHeader

  return token === cronSecret
}

export async function GET(request: Request) {
  // Verify cron authentication
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Check if email service is configured
  if (!isResendConfigured()) {
    logger.error('invoice-reminder-cron', 'Resend not configured, skipping reminder cron')
    return NextResponse.json({
      success: false,
      error: 'Email service not configured'
    }, { status: 503 })
  }

  try {
    logger.info('invoice-reminder-cron', 'Starting invoice reminder cron job')

    const result = await processOverdueReminders()

    logger.info('invoice-reminder-cron', 'Reminder cron completed', { sent: result.sent, failed: result.failed, processed: result.processed })

    return NextResponse.json({
      success: true,
      processed: result.processed,
      sent: result.sent,
      failed: result.failed,
      results: result.results.map(r => ({
        invoiceNumber: r.invoiceNumber,
        reminderLevel: r.reminderLevel,
        success: r.success,
        error: r.error
      }))
    })
  } catch (error) {
    logger.error('invoice-reminder-cron', 'Invoice reminder cron job error', { error: error instanceof Error ? error.message : String(error) })
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Cron job failed' },
      { status: 500 }
    )
  }
}

// Also support POST for manual triggering via dashboard
export async function POST(request: Request) {
  return GET(request)
}
