/**
 * Deadline Generator for Campaigns
 *
 * Auto-generates deadlines from deliverables and campaign events.
 */

import type {
  Deliverable,
  Campaign,
  DeadlineType,
  DeadlinePriority,
  CreateDeadlineInput,
  ContractExtractionResult,
  ReferenceEvent,
} from '@/types'

/**
 * Generate a deadline from a deliverable
 */
export function generateDeliverableDeadline(
  deliverable: Deliverable,
  campaign: Campaign
): CreateDeadlineInput | null {
  if (!deliverable.due_date) return null

  return {
    title: `Leverans: ${deliverable.title}`,
    due_date: deliverable.due_date,
    deadline_type: 'delivery',
    priority: 'important',
    customer_id: campaign.customer_id || undefined,
    notes: deliverable.description || undefined,
  }
}

/**
 * Generate multiple deadlines for a campaign
 * - Delivery deadlines from deliverables
 * - Invoicing deadline after campaign end
 * - Report deadline if required
 */
export function generateCampaignDeadlines(
  campaign: Campaign,
  deliverables: Deliverable[],
  options?: {
    generateInvoicingDeadline?: boolean
    invoicingDaysAfterEnd?: number
    generateReportDeadline?: boolean
    reportDaysAfterEnd?: number
  }
): CreateDeadlineInput[] {
  const deadlines: CreateDeadlineInput[] = []
  const {
    generateInvoicingDeadline = true,
    invoicingDaysAfterEnd = 5,
    generateReportDeadline = false,
    reportDaysAfterEnd = 14,
  } = options || {}

  // Delivery deadlines from deliverables
  for (const deliverable of deliverables) {
    const deadline = generateDeliverableDeadline(deliverable, campaign)
    if (deadline) {
      deadlines.push(deadline)
    }
  }

  // Invoicing deadline
  if (generateInvoicingDeadline && campaign.end_date) {
    const invoiceDate = addDays(campaign.end_date, invoicingDaysAfterEnd)
    deadlines.push({
      title: `Fakturera: ${campaign.name}`,
      due_date: invoiceDate,
      deadline_type: 'invoicing',
      priority: 'important',
      customer_id: campaign.customer_id || undefined,
    })
  }

  // Report deadline
  if (generateReportDeadline && campaign.end_date) {
    const reportDate = addDays(campaign.end_date, reportDaysAfterEnd)
    deadlines.push({
      title: `Rapport: ${campaign.name}`,
      due_date: reportDate,
      deadline_type: 'report',
      priority: 'normal',
      customer_id: campaign.customer_id || undefined,
    })
  }

  return deadlines
}

/**
 * Calculate deadline date based on reference event
 */
export function calculateRelativeDeadline(
  referenceDate: string,
  offsetDays: number
): string {
  return addDays(referenceDate, offsetDays)
}

/**
 * Get deadline priority based on days until due
 */
export function getDeadlinePriority(dueDate: string): DeadlinePriority {
  const today = new Date()
  const due = new Date(dueDate)
  const daysUntil = Math.ceil((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))

  if (daysUntil < 0) return 'critical' // Overdue
  if (daysUntil <= 2) return 'critical'
  if (daysUntil <= 7) return 'important'
  return 'normal'
}

/**
 * Group deadlines by date
 */
export function groupDeadlinesByDate<T extends { due_date: string }>(
  deadlines: T[]
): Map<string, T[]> {
  const grouped = new Map<string, T[]>()

  for (const deadline of deadlines) {
    const dateKey = deadline.due_date
    if (!grouped.has(dateKey)) {
      grouped.set(dateKey, [])
    }
    grouped.get(dateKey)!.push(deadline)
  }

  return grouped
}

/**
 * Generate deadlines from contract extraction result
 */
export function generateDeadlinesFromExtraction(
  extraction: ContractExtractionResult,
  campaign: Campaign,
  deliverables: Deliverable[]
): CreateDeadlineInput[] {
  const deadlines: CreateDeadlineInput[] = []

  // Generate delivery deadlines from deliverables
  for (const deliverable of deliverables) {
    const deadline = generateDeliverableDeadline(deliverable, campaign)
    if (deadline) {
      deadlines.push(deadline)
    }
  }

  // Generate deadlines from extracted deadlines
  for (const extractedDeadline of extraction.deadlines) {
    let dueDate = extractedDeadline.absoluteDate

    // Calculate relative dates if needed
    if (!dueDate && extractedDeadline.isRelative && extractedDeadline.referenceEvent && extractedDeadline.offsetDays) {
      const referenceDate = getReferenceDateFromExtraction(
        extractedDeadline.referenceEvent,
        extraction,
        campaign
      )

      if (referenceDate) {
        dueDate = addDays(referenceDate, extractedDeadline.offsetDays)
      }
    }

    // Skip if we couldn't determine a date
    if (!dueDate) continue

    deadlines.push({
      title: extractedDeadline.description,
      due_date: dueDate,
      deadline_type: extractedDeadline.type,
      priority: getDeadlinePriority(dueDate),
      customer_id: campaign.customer_id || undefined,
      notes: extractedDeadline.isRelative
        ? `Relativ: ${extractedDeadline.offsetDays} dagar från ${extractedDeadline.referenceEvent}`
        : undefined,
    })
  }

  // Generate invoicing deadline if campaign has end date
  if (campaign.end_date) {
    const invoicingDate = addDays(campaign.end_date, 5)
    deadlines.push({
      title: `Fakturera: ${campaign.name}`,
      due_date: invoicingDate,
      deadline_type: 'invoicing',
      priority: 'important',
      customer_id: campaign.customer_id || undefined,
    })
  }

  return deadlines
}

/**
 * Get reference date from extraction based on event type
 */
function getReferenceDateFromExtraction(
  event: ReferenceEvent,
  extraction: ContractExtractionResult,
  campaign: Campaign
): string | null {
  switch (event) {
    case 'publication':
      return extraction.period.publicationDate
    case 'delivery':
      return extraction.period.endDate || campaign.end_date
    case 'approval':
      // No direct mapping, use publication date as proxy
      return extraction.period.publicationDate
    case 'contract':
      return extraction.signingDate || campaign.contract_signed_at
    default:
      return null
  }
}

/**
 * Recalculate relative deadlines when reference dates change
 */
export function recalculateRelativeDeadlines(
  deadlines: Array<{
    due_date: string
    date_calculation_type: 'absolute' | 'relative' | null
    reference_event: ReferenceEvent | null
    offset_days: number | null
  }>,
  referenceDates: Partial<Record<ReferenceEvent, string>>
): Array<{ due_date: string }> {
  return deadlines.map((deadline) => {
    // Skip absolute deadlines
    if (deadline.date_calculation_type !== 'relative') {
      return { due_date: deadline.due_date }
    }

    // Skip if missing reference info
    if (!deadline.reference_event || deadline.offset_days === null) {
      return { due_date: deadline.due_date }
    }

    // Get reference date
    const referenceDate = referenceDates[deadline.reference_event]
    if (!referenceDate) {
      return { due_date: deadline.due_date }
    }

    // Calculate new date
    return {
      due_date: addDays(referenceDate, deadline.offset_days),
    }
  })
}

// Helper function
function addDays(date: string, days: number): string {
  const d = new Date(date)
  d.setDate(d.getDate() + days)
  return d.toISOString().split('T')[0]
}
