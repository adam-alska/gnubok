import { NextResponse } from 'next/server'
import type { ApiRouteDefinition, ExtensionContext } from '@/lib/extensions/types'
import type { CategorizationSuggestion } from './categorizer'
import { categorizeTransactions, getSettings, saveSettings } from './index'

// ============================================================
// /suggestions — GET: fetch stored suggestions
// ============================================================

async function handleGetSuggestions(
  request: Request,
  ctx?: ExtensionContext
): Promise<Response> {
  const userId = ctx!.userId
  const { createClient } = await import('@/lib/supabase/server')
  const supabase = await createClient()

  const { searchParams } = new URL(request.url)
  const idsParam = searchParams.get('transaction_ids')

  if (!idsParam) {
    return NextResponse.json({ error: 'transaction_ids is required' }, { status: 400 })
  }

  const transactionIds = idsParam.split(',').filter(Boolean).slice(0, 50)

  // Read stored suggestions from extension_data
  const keys = transactionIds.map((id) => `suggestion:${id}`)

  const { data: records } = await supabase
    .from('extension_data')
    .select('key, value')
    .eq('company_id', userId)
    .eq('extension_id', 'ai-categorization')
    .in('key', keys)

  const suggestions: Record<string, CategorizationSuggestion> = {}
  if (records) {
    for (const record of records) {
      const txId = record.key.replace('suggestion:', '')
      suggestions[txId] = record.value as unknown as CategorizationSuggestion
    }
  }

  return NextResponse.json({ suggestions })
}

// ============================================================
// /suggestions — POST: trigger on-demand categorization
// ============================================================

async function handlePostSuggestions(
  request: Request,
  ctx?: ExtensionContext
): Promise<Response> {
  const userId = ctx!.userId

  const body = await request.json()
  const { transaction_ids } = body

  if (!Array.isArray(transaction_ids) || transaction_ids.length === 0) {
    return NextResponse.json({ error: 'transaction_ids is required' }, { status: 400 })
  }

  const ids = transaction_ids.slice(0, 50)

  try {
    const suggestions = await categorizeTransactions(userId, ids)

    // Group by transaction ID
    const grouped: Record<string, CategorizationSuggestion> = {}
    for (const s of suggestions) {
      grouped[s.transactionId] = s
    }

    return NextResponse.json({ suggestions: grouped })
  } catch (error) {
    console.error('[ai-categorization] On-demand categorization failed:', error)
    return NextResponse.json(
      { error: 'AI categorization failed' },
      { status: 500 }
    )
  }
}

// ============================================================
// /settings — GET: get current settings
// ============================================================

async function handleGetSettings(
  _request: Request,
  ctx?: ExtensionContext
): Promise<Response> {
  const userId = ctx!.userId
  const settings = await getSettings(userId)
  return NextResponse.json({ data: settings })
}

// ============================================================
// /settings — PUT/PATCH: update settings
// ============================================================

async function handleUpdateSettings(
  request: Request,
  ctx?: ExtensionContext
): Promise<Response> {
  const userId = ctx!.userId
  const body = await request.json()

  // Validate setting keys
  const allowedKeys = [
    'autoSuggestEnabled',
    'confidenceThreshold',
    'providerModel',
  ]
  const filtered: Record<string, unknown> = {}
  for (const key of allowedKeys) {
    if (key in body) {
      filtered[key] = body[key]
    }
  }

  if (Object.keys(filtered).length === 0) {
    return NextResponse.json({ error: 'No valid settings provided' }, { status: 400 })
  }

  const settings = await saveSettings(userId, filtered)
  return NextResponse.json({ data: settings })
}

// ============================================================
// Route definitions
// ============================================================

export const aiCategorizationApiRoutes: ApiRouteDefinition[] = [
  {
    method: 'GET',
    path: '/suggestions',
    handler: handleGetSuggestions,
  },
  {
    method: 'POST',
    path: '/suggestions',
    handler: handlePostSuggestions,
  },
  {
    method: 'GET',
    path: '/settings',
    handler: handleGetSettings,
  },
  {
    method: 'PUT',
    path: '/settings',
    handler: handleUpdateSettings,
  },
  {
    method: 'PATCH',
    path: '/settings',
    handler: handleUpdateSettings,
  },
]
