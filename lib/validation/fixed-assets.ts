import { z } from 'zod'

export const CreateAssetInputSchema = z.object({
  name: z.string().min(1, 'Namn krävs'),
  description: z.string().optional(),
  category_id: z.string().uuid().optional(),
  acquisition_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Ogiltigt datumformat (YYYY-MM-DD)'),
  acquisition_cost: z.number().positive('Anskaffningsvärde måste vara positivt'),
  residual_value: z.number().min(0, 'Restvärde kan inte vara negativt').optional(),
  useful_life_months: z.number().int().positive('Nyttjandeperiod måste vara minst 1 månad'),
  depreciation_method: z.enum(['straight_line', 'declining_balance', 'units_of_production']).optional(),
  declining_balance_rate: z.number().min(1).max(100).optional(),
  location: z.string().optional(),
  serial_number: z.string().optional(),
  supplier_name: z.string().optional(),
  warranty_expires: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal('')),
  notes: z.string().optional(),
  cost_center_id: z.string().uuid().optional(),
  project_id: z.string().uuid().optional(),
})

export const UpdateAssetInputSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  category_id: z.string().uuid().optional().nullable(),
  residual_value: z.number().min(0).optional(),
  location: z.string().optional().nullable(),
  serial_number: z.string().optional().nullable(),
  supplier_name: z.string().optional().nullable(),
  warranty_expires: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  notes: z.string().optional().nullable(),
  cost_center_id: z.string().uuid().optional().nullable(),
  project_id: z.string().uuid().optional().nullable(),
})

export const AssetDisposalInputSchema = z.object({
  disposal_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Ogiltigt datumformat'),
  disposal_amount: z.number().min(0, 'Belopp kan inte vara negativt'),
  disposal_type: z.enum(['sold', 'scrapped', 'written_off']),
})

export const CreateAssetCategoryInputSchema = z.object({
  code: z.string().min(1, 'Kod krävs'),
  name: z.string().min(1, 'Namn krävs'),
  asset_account: z.string().min(4, 'Ogiltigt kontonummer'),
  depreciation_account: z.string().min(4, 'Ogiltigt kontonummer'),
  expense_account: z.string().min(4, 'Ogiltigt kontonummer'),
  default_useful_life_months: z.number().int().positive().optional(),
  default_depreciation_method: z.enum(['straight_line', 'declining_balance', 'units_of_production']).optional(),
})

export const UpdateAssetCategoryInputSchema = z.object({
  code: z.string().min(1).optional(),
  name: z.string().min(1).optional(),
  asset_account: z.string().min(4).optional(),
  depreciation_account: z.string().min(4).optional(),
  expense_account: z.string().min(4).optional(),
  default_useful_life_months: z.number().int().positive().optional().nullable(),
  default_depreciation_method: z.enum(['straight_line', 'declining_balance', 'units_of_production']).optional(),
})

export const PostMonthlyDepreciationSchema = z.object({
  year: z.number().int().min(2000).max(2100),
  month: z.number().int().min(1).max(12),
})
