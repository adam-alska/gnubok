import type { SupabaseClient } from '@supabase/supabase-js'
import type { CoreEvent } from '@/lib/events/types'
import { eventBus } from '@/lib/events/bus'
import { ingestTransactions } from '@/lib/transactions/ingest'
import type {
  ExtensionContext,
  ExtensionLogger,
  ExtensionSettings,
  ExtensionStorage,
  ExtensionServices,
} from './types'

/**
 * Create a prefixed logger for an extension.
 */
function createLogger(extensionId: string): ExtensionLogger {
  const prefix = `[${extensionId}]`
  return {
    info: (message: string, ...args: unknown[]) => console.log(prefix, message, ...args),
    warn: (message: string, ...args: unknown[]) => console.warn(prefix, message, ...args),
    error: (message: string, ...args: unknown[]) => console.error(prefix, message, ...args),
  }
}

/**
 * Create a settings accessor scoped to a specific extension.
 */
function createSettings(
  supabase: SupabaseClient,
  userId: string,
  extensionId: string
): ExtensionSettings {
  return {
    async get<T>(key?: string): Promise<T | null> {
      const lookupKey = key ?? 'settings'
      const { data } = await supabase
        .from('extension_data')
        .select('value')
        .eq('user_id', userId)
        .eq('extension_id', extensionId)
        .eq('key', lookupKey)
        .single()

      return (data?.value as T) ?? null
    },

    async set<T>(key: string, value: T): Promise<void> {
      await supabase
        .from('extension_data')
        .upsert(
          {
            user_id: userId,
            extension_id: extensionId,
            key,
            value,
          },
          { onConflict: 'user_id,extension_id,key' }
        )
    },
  }
}

/**
 * Create a storage accessor wrapping Supabase storage.
 */
function createStorage(supabase: SupabaseClient): ExtensionStorage {
  return {
    async download(bucket: string, path: string) {
      const { data, error } = await supabase.storage
        .from(bucket)
        .download(path)
      return { data, error: error?.message }
    },

    async upload(bucket: string, path: string, data: ArrayBuffer, options?: { contentType?: string }) {
      const { error } = await supabase.storage
        .from(bucket)
        .upload(path, data, options ? { contentType: options.contentType } : undefined)
      if (error) return { path: '', error: error.message }
      return { path }
    },

    getPublicUrl(bucket: string, path: string): string {
      const { data } = supabase.storage
        .from(bucket)
        .getPublicUrl(path)
      return data.publicUrl
    },
  }
}

/**
 * Create core services exposed to extensions.
 */
function createServices(): ExtensionServices {
  return {
    ingestTransactions,
  }
}

/**
 * Build a fully populated ExtensionContext.
 *
 * The context gives extensions access to Supabase, event emission, settings,
 * storage, logging, and core services — without importing from core modules.
 */
export function createExtensionContext(
  supabase: SupabaseClient,
  userId: string,
  extensionId: string
): ExtensionContext {
  return {
    userId,
    extensionId,
    supabase,
    emit: (event: CoreEvent) => eventBus.emit(event),
    settings: createSettings(supabase, userId, extensionId),
    storage: createStorage(supabase),
    log: createLogger(extensionId),
    services: createServices(),
  }
}
