// AUTO-GENERATED — do not edit. Run `npm run setup:extensions` to regenerate.
import type { Extension } from '../types'
import { enableBankingExtension } from '@/extensions/general/enable-banking'
import { emailExtension } from '@/extensions/general/email'

export const FIRST_PARTY_EXTENSIONS: Extension[] = [
  enableBankingExtension,
  emailExtension,
]
