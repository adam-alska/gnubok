import { loadExtensions } from '@/lib/extensions/loader'

/**
 * Ensure the system is initialized (extensions loaded).
 * Called from API routes that emit events.
 * Idempotent — safe to call multiple times.
 */
export function ensureInitialized(): void {
  loadExtensions()
}
