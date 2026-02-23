import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { ensureInitialized } from '@/lib/init'
import { extensionRegistry } from '@/lib/extensions/registry'
import { createExtensionContext } from '@/lib/extensions/context-factory'
import { isExtensionEnabled } from '@/lib/extensions/toggle-check'

ensureInitialized()

/**
 * Catch-all route for extension-declared API routes.
 *
 * URL scheme: /api/extensions/ext/{extensionId}/{...routePath}
 * Example:    /api/extensions/ext/enable-banking/banks → GET /banks
 *
 * - Looks up the extension in the registry
 * - Checks the extension toggle (disabled → 403)
 * - Matches method + path to registered apiRoutes
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

  // Toggle check — disabled extensions return 403
  const enabled = await isExtensionEnabled(user.id, 'general', extensionId)
  if (!enabled) {
    return NextResponse.json({ error: 'Extension is disabled' }, { status: 403 })
  }

  // Find matching route
  const route = extension.apiRoutes.find(
    (r) => r.method === method && r.path === routePath
  )

  if (!route) {
    return NextResponse.json({ error: 'Route not found' }, { status: 404 })
  }

  // Build context and dispatch
  const ctx = createExtensionContext(supabase, user.id, extensionId)
  return route.handler(request, ctx)
}

export const GET = handleRequest
export const POST = handleRequest
export const PUT = handleRequest
export const DELETE = handleRequest
export const PATCH = handleRequest
