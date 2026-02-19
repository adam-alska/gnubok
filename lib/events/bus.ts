import type { CoreEvent, CoreEventType, EventHandler } from './types'

// Internal handler type — loose enough for the Map, but type-safe at the public API
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyHandler = (payload: any) => Promise<void> | void

/**
 * In-process event bus.
 *
 * - Handlers run concurrently via Promise.allSettled (failing handler never crashes emitter)
 * - Module-level singleton (persists across requests in same process)
 * - One-way: core services emit, extensions subscribe
 */
class EventBus {
  private handlers = new Map<string, Set<AnyHandler>>()

  /**
   * Subscribe to an event type.
   * Returns an unsubscribe function.
   */
  on<T extends CoreEventType>(
    eventType: T,
    handler: EventHandler<T>
  ): () => void {
    if (!this.handlers.has(eventType)) {
      this.handlers.set(eventType, new Set())
    }

    const handlerSet = this.handlers.get(eventType)!
    handlerSet.add(handler as AnyHandler)

    return () => {
      handlerSet.delete(handler as AnyHandler)
      if (handlerSet.size === 0) {
        this.handlers.delete(eventType)
      }
    }
  }

  /**
   * Emit an event to all registered handlers.
   * Uses Promise.allSettled so a failing handler never crashes the emitter.
   */
  async emit(event: CoreEvent): Promise<void> {
    const handlerSet = this.handlers.get(event.type)
    if (!handlerSet || handlerSet.size === 0) return

    const results = await Promise.allSettled(
      [...handlerSet].map((handler) => handler(event.payload))
    )

    for (const result of results) {
      if (result.status === 'rejected') {
        console.error(
          `[EventBus] Handler failed for "${event.type}":`,
          result.reason
        )
      }
    }
  }

  /**
   * Remove all handlers (useful for testing).
   */
  clear(): void {
    this.handlers.clear()
  }
}

/** Module-level singleton */
export const eventBus = new EventBus()
