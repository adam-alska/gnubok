import { eventBus } from '@/lib/events/bus'
import type { CoreEventType } from '@/lib/events/types'
import type { Extension } from './types'

/**
 * Extension Registry — singleton that manages extension lifecycle.
 *
 * - register() stores extension and wires event handlers to the bus
 * - unregister() unhooks handlers and removes extension
 * - getAll(), get(), getByCapability() for querying
 */
class ExtensionRegistry {
  private extensions = new Map<string, Extension>()
  private unsubscribers = new Map<string, (() => void)[]>()

  /**
   * Register an extension: store it and wire its event handlers to the bus.
   */
  register(extension: Extension): void {
    if (this.extensions.has(extension.id)) {
      console.warn(`[ExtensionRegistry] Extension "${extension.id}" already registered, skipping`)
      return
    }

    this.extensions.set(extension.id, extension)

    // Wire event handlers to the bus
    const unsubs: (() => void)[] = []
    if (extension.eventHandlers) {
      for (const { eventType, handler } of extension.eventHandlers) {
        // Cast is safe: the handler is stored by eventType key, so it only receives matching payloads
        const unsub = eventBus.on(eventType as CoreEventType, handler)
        unsubs.push(unsub)
      }
    }
    this.unsubscribers.set(extension.id, unsubs)
  }

  /**
   * Unregister an extension: unhook all event handlers and remove.
   */
  unregister(extensionId: string): void {
    const unsubs = this.unsubscribers.get(extensionId)
    if (unsubs) {
      for (const unsub of unsubs) {
        unsub()
      }
      this.unsubscribers.delete(extensionId)
    }
    this.extensions.delete(extensionId)
  }

  /** Get all registered extensions. */
  getAll(): Extension[] {
    return [...this.extensions.values()]
  }

  /** Get a specific extension by ID. */
  get(id: string): Extension | undefined {
    return this.extensions.get(id)
  }

  /** Get all extensions that have a specific capability. */
  getByCapability(key: keyof Extension): Extension[] {
    return [...this.extensions.values()].filter(
      (ext) => ext[key] !== undefined && ext[key] !== null
    )
  }

  /** Clear all extensions (useful for testing). */
  clear(): void {
    for (const id of this.extensions.keys()) {
      this.unregister(id)
    }
  }
}

/** Module-level singleton */
export const extensionRegistry = new ExtensionRegistry()
