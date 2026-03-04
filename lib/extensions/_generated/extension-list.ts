// AUTO-GENERATED — do not edit. Run `npm run setup:extensions` to regenerate.
import type { Extension } from '../types'
import { enableBankingExtension } from '@/extensions/general/enable-banking'
import { aiChatExtension } from '@/extensions/general/ai-chat'
import { emailExtension } from '@/extensions/general/email'

export const FIRST_PARTY_EXTENSIONS: Extension[] = [
  enableBankingExtension,
  aiChatExtension,
  emailExtension,
]
