import { NextResponse } from 'next/server'
import { syncAllAccounts, refreshExpiringTokens } from '@/lib/tiktok/sync'

// Verify cron secret for security
function verifyCronSecret(request: Request): boolean {
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET

  if (!cronSecret) {
    console.error('CRON_SECRET not configured')
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

  try {
    console.log('Starting TikTok cron job...')

    // First, refresh tokens that are expiring soon
    const tokensRefreshed = await refreshExpiringTokens()
    console.log(`Refreshed ${tokensRefreshed} expiring tokens`)

    // Then sync all active accounts
    const syncResults = await syncAllAccounts()
    console.log(`Sync completed: ${syncResults.successful}/${syncResults.total} successful, ${syncResults.failed} failed`)

    return NextResponse.json({
      success: true,
      tokens_refreshed: tokensRefreshed,
      accounts_total: syncResults.total,
      accounts_successful: syncResults.successful,
      accounts_failed: syncResults.failed,
    })
  } catch (error) {
    console.error('TikTok cron job error:', error)
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
