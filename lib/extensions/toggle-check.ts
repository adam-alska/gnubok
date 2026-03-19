import { createServiceClient } from '@/lib/supabase/server'

/**
 * Check if an extension is enabled for a specific user.
 * Used by event handlers to gate execution.
 *
 * For backward compatibility during the transition period,
 * general extensions that were previously always-on default to
 * enabled when no toggle row exists.
 */
export const LEGACY_GENERAL_EXTENSIONS = [
  'receipt-ocr',
  'ai-categorization',
  'ai-chat',
  'enable-banking',
  'arcim-migration',
  'tic',
]

export async function isExtensionEnabled(
  userId: string,
  sectorSlug: string,
  extensionSlug: string
): Promise<boolean> {
  const supabase = await createServiceClient()

  const { data } = await supabase
    .from('extension_toggles')
    .select('enabled')
    .eq('user_id', userId)
    .eq('sector_slug', sectorSlug)
    .eq('extension_slug', extensionSlug)
    .single()

  // If no toggle row exists, check if this is a legacy extension
  if (!data) {
    return sectorSlug === 'general' && LEGACY_GENERAL_EXTENSIONS.includes(extensionSlug)
  }

  return data.enabled
}
