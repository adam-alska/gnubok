import { z } from 'zod'

// Cost Center schemas
export const CreateCostCenterInputSchema = z.object({
  code: z.string().min(1, 'Kod krävs').max(20, 'Kod får vara max 20 tecken'),
  name: z.string().min(1, 'Namn krävs').max(200, 'Namn får vara max 200 tecken'),
  description: z.string().max(1000).optional(),
  parent_id: z.string().uuid().optional(),
  manager_name: z.string().max(200).optional(),
  is_active: z.boolean().optional(),
  sort_order: z.number().int().min(0).optional(),
})

export const UpdateCostCenterInputSchema = z.object({
  code: z.string().min(1).max(20).optional(),
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(1000).nullish(),
  parent_id: z.string().uuid().nullish(),
  manager_name: z.string().max(200).nullish(),
  is_active: z.boolean().optional(),
  sort_order: z.number().int().min(0).optional(),
}).refine(
  (data) => Object.keys(data).length > 0,
  { message: 'At least one field must be provided for update' }
)

// Project schemas
const ProjectStatusSchema = z.enum(['planning', 'active', 'completed', 'cancelled', 'on_hold'])

export const CreateProjectInputSchema = z.object({
  project_number: z.string().min(1, 'Projektnummer krävs').max(50),
  name: z.string().min(1, 'Namn krävs').max(200),
  description: z.string().max(2000).optional(),
  customer_id: z.string().uuid().optional(),
  status: ProjectStatusSchema.optional(),
  start_date: z.string().optional(),
  end_date: z.string().optional(),
  budget_amount: z.number().min(0).optional(),
  is_active: z.boolean().optional(),
})

export const UpdateProjectInputSchema = z.object({
  project_number: z.string().min(1).max(50).optional(),
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).nullish(),
  customer_id: z.string().uuid().nullish(),
  status: ProjectStatusSchema.optional(),
  start_date: z.string().nullish(),
  end_date: z.string().nullish(),
  budget_amount: z.number().min(0).optional(),
  is_active: z.boolean().optional(),
}).refine(
  (data) => Object.keys(data).length > 0,
  { message: 'At least one field must be provided for update' }
)

// Budget schemas
const BudgetStatusSchema = z.enum(['draft', 'active', 'locked'])

export const CreateBudgetInputSchema = z.object({
  name: z.string().min(1, 'Namn krävs').max(200),
  fiscal_period_id: z.string().uuid('Räkenskapsperiod krävs'),
  status: BudgetStatusSchema.optional(),
  description: z.string().max(2000).optional(),
})

export const UpdateBudgetInputSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  status: BudgetStatusSchema.optional(),
  description: z.string().max(2000).nullish(),
}).refine(
  (data) => Object.keys(data).length > 0,
  { message: 'At least one field must be provided for update' }
)

// Budget Entry schemas
const monthField = z.number().default(0)

export const CreateBudgetEntryInputSchema = z.object({
  account_number: z.string().min(1, 'Kontonummer krävs'),
  cost_center_id: z.string().uuid().nullish(),
  project_id: z.string().uuid().nullish(),
  month_1: monthField,
  month_2: monthField,
  month_3: monthField,
  month_4: monthField,
  month_5: monthField,
  month_6: monthField,
  month_7: monthField,
  month_8: monthField,
  month_9: monthField,
  month_10: monthField,
  month_11: monthField,
  month_12: monthField,
  annual_total: z.number().default(0),
  notes: z.string().max(1000).optional(),
})

export const UpdateBudgetEntryInputSchema = z.object({
  id: z.string().uuid(),
  month_1: z.number().optional(),
  month_2: z.number().optional(),
  month_3: z.number().optional(),
  month_4: z.number().optional(),
  month_5: z.number().optional(),
  month_6: z.number().optional(),
  month_7: z.number().optional(),
  month_8: z.number().optional(),
  month_9: z.number().optional(),
  month_10: z.number().optional(),
  month_11: z.number().optional(),
  month_12: z.number().optional(),
  annual_total: z.number().optional(),
  notes: z.string().max(1000).nullish(),
})

export const BulkUpdateBudgetEntriesSchema = z.object({
  entries: z.array(UpdateBudgetEntryInputSchema).min(1).max(500),
})

export const CopyFromActualSchema = z.object({
  source_fiscal_period_id: z.string().uuid('Källperiod krävs'),
  adjustment_percent: z.number().min(-100).max(1000).default(0),
})
