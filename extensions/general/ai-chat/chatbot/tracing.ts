import { CallbackHandler } from '@langfuse/langchain'

let langfuseConfigured: boolean | null = null

function isLangfuseConfigured(): boolean {
  if (langfuseConfigured !== null) return langfuseConfigured
  langfuseConfigured = !!(
    process.env.LANGFUSE_SECRET_KEY &&
    process.env.LANGFUSE_PUBLIC_KEY
  )
  return langfuseConfigured
}

/**
 * Create a Langfuse callback handler for LangChain tracing.
 * Returns null if Langfuse is not configured (graceful degradation).
 */
export function createTraceHandler(options: {
  sessionId?: string
  userId?: string
  metadata?: Record<string, unknown>
}): CallbackHandler | null {
  if (!isLangfuseConfigured()) return null

  try {
    return new CallbackHandler({
      sessionId: options.sessionId,
      userId: options.userId,
    })
  } catch {
    console.warn('Failed to create Langfuse handler, tracing disabled')
    return null
  }
}

/**
 * Flush Langfuse handler. Safe to call with null.
 */
export async function flushTrace(handler: CallbackHandler | null): Promise<void> {
  if (!handler) return
  try {
    // Langfuse CallbackHandler may expose flush via different methods
    if ('shutdownAsync' in handler && typeof handler.shutdownAsync === 'function') {
      await handler.shutdownAsync()
    }
  } catch {
    // Non-critical — tracing failure should never block response
  }
}
