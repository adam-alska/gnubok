import { z } from 'zod'

// PUT /api/calendar/feed
export const UpdateCalendarFeedInputSchema = z.object({
  include_tax_deadlines: z.boolean().optional(),
  include_invoices: z.boolean().optional(),
}).refine(
  (data) => data.include_tax_deadlines !== undefined || data.include_invoices !== undefined,
  { message: 'At least one field must be provided for update' }
)

export type UpdateCalendarFeedInputZ = z.infer<typeof UpdateCalendarFeedInputSchema>
