// AUTO-GENERATED — do not edit. Run `npm run setup:extensions` to regenerate.
import type { Extension } from '../types'
import { enableBankingExtension } from '@/extensions/general/enable-banking'
import { aiCategorizationExtension } from '@/extensions/general/ai-categorization'
import { aiChatExtension } from '@/extensions/general/ai-chat'

export const FIRST_PARTY_EXTENSIONS: Extension[] = [
  enableBankingExtension,
  aiCategorizationExtension,
  aiChatExtension,
]
