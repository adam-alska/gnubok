import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { ensureInitialized } from '@/lib/init'
import { extensionRegistry } from '@/lib/extensions/registry'
import { createExtensionContext } from '@/lib/extensions/context-factory'
import { isExtensionEnabled } from '@/lib/extensions/toggle-check'
import { hasAiConsent, isAiExtension } from '@/lib/extensions/ai-consent'
import type { ApiRouteDefinition } from '@/lib/extensions/types'

ensureInitialized()

// Heavy extension routes (SIE import, migration) need up to 5 minutes
export const maxDuration = 300

/**
 * Match a request path against a route pattern.
 * Supports :param wildcards (e.g., /:id/confirm).
 * Returns extracted params on match, null on mismatch.
 */
function matchPath(
  pattern: string,
  requestPath: string
): Record<string, string> | null {
  const patternParts = pattern.split('/').filter(Boolean)
  const requestParts = requestPath.split('/').filter(Boolean)

  if (patternParts.length !== requestParts.length) return null

  const params: Record<string, string> = {}

  for (let i = 0; i < patternParts.length; i++) {
    if (patternParts[i].startsWith(':')) {
      params[patternParts[i].slice(1)] = requestParts[i]
    } else if (patternParts[i] !== requestParts[i]) {
      return null
    }
  }

  return params
}

/**
 * Catch-all route for extension-declared API routes.
 *
 * URL scheme: /api/extensions/ext/{extensionId}/{...routePath}
 * Example:    /api/extensions/ext/receipt-ocr/abc123/confirm → POST /:id/confirm
 *
 * - Looks up the extension in the registry
 * - Checks the extension toggle (disabled → 403)
 * - Matches method + path pattern to registered apiRoutes
 * - Extracts path params and appends them as URL search params
 * - Builds an ExtensionContext and passes it to the handler
 */
async function handleRequest(
  request: Request,
  { params }: { params: Promise<{ path: string[] }> }
): Promise<Response> {
  const segments = await params

  if (!segments.path || segments.path.length < 1) {
    return NextResponse.json({ error: 'Invalid extension route' }, { status: 400 })
  }

  const [extensionId, ...rest] = segments.path
  const routePath = '/' + rest.join('/')
  const method = request.method as 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH'

  // Look up extension
  const extension = extensionRegistry.get(extensionId)
  if (!extension || !extension.apiRoutes || extension.apiRoutes.length === 0) {
    return NextResponse.json({ error: 'Extension not found' }, { status: 404 })
  }

  // Auth check
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Toggle check — use extension's declared sector, fallback to 'general'
  const sector = extension.sector || 'general'
  const enabled = await isExtensionEnabled(user.id, sector, extensionId)
  if (!enabled) {
    return NextResponse.json({ error: 'Extension is disabled' }, { status: 403 })
  }

  // AI consent check
  if (isAiExtension(extensionId)) {
    const consented = await hasAiConsent(supabase, user.id, extensionId)
    if (!consented) {
      return NextResponse.json(
        { error: 'AI consent required', code: 'AI_CONSENT_REQUIRED' },
        { status: 403 }
      )
    }
  }

  // Find matching route (supports :param patterns)
  let matchedRoute: ApiRouteDefinition | null = null
  let extractedParams: Record<string, string> = {}

  for (const route of extension.apiRoutes) {
    if (route.method !== method) continue

    const params = matchPath(route.path, routePath)
    if (params !== null) {
      matchedRoute = route
      extractedParams = params
      break
    }
  }

  if (!matchedRoute) {
    return NextResponse.json({ error: 'Route not found' }, { status: 404 })
  }

  // If path params were extracted, create a new Request with them as search params
  let handlerRequest = request
  if (Object.keys(extractedParams).length > 0) {
    const url = new URL(request.url)
    for (const [key, value] of Object.entries(extractedParams)) {
      url.searchParams.set(`_${key}`, value)
    }
    handlerRequest = new Request(url.toString(), {
      method: request.method,
      headers: request.headers,
      body: request.body,
      // @ts-expect-error -- duplex needed for streaming body
      duplex: 'half',
    })
  }

  // Build context and dispatch
  const ctx = createExtensionContext(supabase, user.id, extensionId)
  return matchedRoute.handler(handlerRequest, ctx)
}

export const GET = handleRequest
export const POST = handleRequest
export const PUT = handleRequest
export const DELETE = handleRequest
export const PATCH = handleRequest
