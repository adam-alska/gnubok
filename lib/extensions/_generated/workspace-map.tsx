// AUTO-GENERATED — do not edit. Run `npm run setup:extensions` to regenerate.
import dynamic from 'next/dynamic'
import type { ComponentType } from 'react'
import type { WorkspaceComponentProps } from '../workspace-registry'

export const WORKSPACES: Record<string, ComponentType<WorkspaceComponentProps>> = {
  'general/receipt-ocr': dynamic(() => import('@/components/extensions/general/ReceiptOcrWorkspace')),
  'general/ai-categorization': dynamic(() => import('@/components/extensions/general/AiCategorizationWorkspace')),
  'general/ai-chat': dynamic(() => import('@/components/extensions/general/AiChatWorkspace')),
  'general/push-notifications': dynamic(() => import('@/components/extensions/general/PushNotificationsWorkspace')),
  'general/invoice-inbox': dynamic(() => import('@/components/extensions/general/DocumentInboxWorkspace')),
  'general/calendar': dynamic(() => import('@/components/extensions/general/CalendarWorkspace')),
  'general/enable-banking': dynamic(() => import('@/components/extensions/general/EnableBankingWorkspace')),
  'general/user-description-match': dynamic(() => import('@/components/extensions/general/UserDescriptionMatchWorkspace')),
}
