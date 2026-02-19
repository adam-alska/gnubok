import { z } from 'zod'

const dateString = z.string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be a valid date in YYYY-MM-DD format')

const timeString = z.string()
  .regex(/^\d{2}:\d{2}(:\d{2})?$/, 'Must be HH:MM or HH:MM:SS format')

const DeadlineTypeSchema = z.enum(['delivery', 'invoicing', 'report', 'tax', 'other'])
const DeadlinePrioritySchema = z.enum(['critical', 'important', 'normal'])
const DeadlineStatusSchema = z.enum([
  'upcoming',
  'action_needed',
  'in_progress',
  'submitted',
  'confirmed',
  'overdue',
])
const DeadlineSourceSchema = z.enum(['system', 'user'])

const TaxDeadlineTypeSchema = z.enum([
  'moms_monthly',
  'moms_quarterly',
  'moms_yearly',
  'f_skatt',
  'arbetsgivardeklaration',
  'inkomstdeklaration_ef',
  'inkomstdeklaration_ab',
  'arsredovisning',
  'periodisk_sammanstallning',
  'bokslut',
])

// POST /api/deadlines
export const CreateDeadlineInputSchema = z.object({
  title: z.string().min(1, 'Title is required').max(200, 'Title too long'),
  due_date: dateString,
  due_time: timeString.optional(),
  deadline_type: DeadlineTypeSchema,
  priority: DeadlinePrioritySchema.optional().default('normal'),
  customer_id: z.string().uuid('Invalid customer ID').optional(),
  notes: z.string().max(2000).optional(),
  // Tax deadline fields
  tax_deadline_type: TaxDeadlineTypeSchema.optional(),
  tax_period: z.string().max(50).optional(),
  source: DeadlineSourceSchema.optional(),
  linked_report_type: z.string().max(100).optional(),
  linked_report_period: z.record(z.string(), z.unknown()).optional(),
})

// PUT /api/deadlines/[id]
export const UpdateDeadlineInputSchema = z.object({
  title: z.string().min(1, 'Title is required').max(200, 'Title too long').optional(),
  due_date: dateString.optional(),
  due_time: timeString.nullish(),
  deadline_type: DeadlineTypeSchema.optional(),
  priority: DeadlinePrioritySchema.optional(),
  customer_id: z.string().uuid('Invalid customer ID').nullish(),
  notes: z.string().max(2000).nullish(),
})

// PATCH /api/deadlines/[id]/status
export const UpdateDeadlineStatusInputSchema = z.object({
  status: DeadlineStatusSchema,
})

export type CreateDeadlineInputZ = z.infer<typeof CreateDeadlineInputSchema>
export type UpdateDeadlineInputZ = z.infer<typeof UpdateDeadlineInputSchema>
export type UpdateDeadlineStatusInputZ = z.infer<typeof UpdateDeadlineStatusInputSchema>
