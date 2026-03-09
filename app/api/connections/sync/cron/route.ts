import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { syncProviderConnection } from '@/lib/connections/sync'
import type { AccountingProvider } from '@/types'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
const isBuildPlaceholder = url?.startsWith('__')
const safeUrl = isBuildPlaceholder ? 'https://placeholder.supabase.co' : url
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

export async function GET(request: Request) {
  // Verify cron secret
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Direct Supabase client (no cookies needed for cron)
  const adminClient = createServerClient(safeUrl, serviceKey, {
    cookies: {
      getAll() { return [] },
      setAll() {},
    },
  })

  // Fetch up to 20 active connections
  const { data: connections, error } = await adminClient
    .from('provider_connections')
    .select('id, provider')
    .eq('status', 'active')
    .limit(20)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  if (!connections || connections.length === 0) {
    return NextResponse.json({ data: { synced: 0, failed: 0 } })
  }

  let synced = 0
  let failed = 0

  for (const conn of connections) {
    const result = await syncProviderConnection(
      adminClient,
      conn.id,
      conn.provider as AccountingProvider
    )
    if (result.success) {
      synced++
    } else {
      failed++
    }
  }

  return NextResponse.json({ data: { synced, failed, total: connections.length } })
}
