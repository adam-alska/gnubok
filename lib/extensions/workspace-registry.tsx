import dynamic from 'next/dynamic'
import type { ComponentType } from 'react'

export interface WorkspaceComponentProps {
  userId: string
}

type WorkspaceKey = `${string}/${string}`

const WORKSPACES: Record<WorkspaceKey, ComponentType<WorkspaceComponentProps>> = {
  // General
  'general/receipt-ocr': dynamic(() => import('@/components/extensions/general/ReceiptOcrWorkspace')),
  'general/ai-categorization': dynamic(() => import('@/components/extensions/general/AiCategorizationWorkspace')),
  'general/ai-chat': dynamic(() => import('@/components/extensions/general/AiChatWorkspace')),
  'general/push-notifications': dynamic(() => import('@/components/extensions/general/PushNotificationsWorkspace')),
  'general/invoice-inbox': dynamic(() => import('@/components/extensions/general/InvoiceInboxWorkspace')),
  'general/enable-banking': dynamic(() => import('@/components/extensions/general/EnableBankingWorkspace')),
  // Restaurant
  'restaurant/food-cost': dynamic(() => import('@/components/extensions/restaurant/FoodCostWorkspace')),
  'restaurant/earnings-per-liter': dynamic(() => import('@/components/extensions/restaurant/EarningsPerLiterWorkspace')),
  'restaurant/pos-import': dynamic(() => import('@/components/extensions/restaurant/PosImportWorkspace')),
  'restaurant/tip-tracking': dynamic(() => import('@/components/extensions/restaurant/TipTrackingWorkspace')),
  // Construction
  'construction/rot-calculator': dynamic(() => import('@/components/extensions/construction/RotCalculatorWorkspace')),
  'construction/project-cost': dynamic(() => import('@/components/extensions/construction/ProjectCostWorkspace')),
  // Hotel
  'hotel/revpar': dynamic(() => import('@/components/extensions/hotel/RevparWorkspace')),
  'hotel/occupancy': dynamic(() => import('@/components/extensions/hotel/OccupancyWorkspace')),
  // Tech
  'tech/billable-hours': dynamic(() => import('@/components/extensions/tech/BillableHoursWorkspace')),
  'tech/project-billing': dynamic(() => import('@/components/extensions/tech/ProjectBillingWorkspace')),
  // E-commerce
  'ecommerce/shopify-import': dynamic(() => import('@/components/extensions/ecommerce/ShopifyImportWorkspace')),
  'ecommerce/multichannel-revenue': dynamic(() => import('@/components/extensions/ecommerce/MultichannelRevenueWorkspace')),
  // Export
  'export/eu-sales-list': dynamic(() => import('@/components/extensions/export/EuSalesListWorkspace')),
  'export/vat-monitor': dynamic(() => import('@/components/extensions/export/VatMonitorWorkspace')),
  'export/intrastat': dynamic(() => import('@/components/extensions/export/IntrastatWorkspace')),
  'export/currency-receivables': dynamic(() => import('@/components/extensions/export/CurrencyReceivablesWorkspace')),
}

export function getWorkspaceComponent(
  sector: string,
  slug: string
): ComponentType<WorkspaceComponentProps> | null {
  return WORKSPACES[`${sector}/${slug}` as WorkspaceKey] ?? null
}
