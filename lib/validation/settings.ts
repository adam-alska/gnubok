import { z } from 'zod'

const EntityTypeSchema = z.enum(['enskild_firma', 'aktiebolag'])
const MomsPeriodSchema = z.enum(['monthly', 'quarterly', 'yearly'])

// PUT /api/settings — update company settings
export const UpdateSettingsInputSchema = z.object({
  // Entity info
  entity_type: EntityTypeSchema.optional(),
  company_name: z.string().max(200).nullish(),
  org_number: z.string().max(30).nullish(),

  // Address
  address_line1: z.string().max(200).nullish(),
  address_line2: z.string().max(200).nullish(),
  postal_code: z.string().max(20).nullish(),
  city: z.string().max(100).nullish(),
  country: z.string().max(100).optional(),

  // Tax registration
  f_skatt: z.boolean().optional(),
  vat_registered: z.boolean().optional(),
  vat_number: z.string().max(20).nullish(),
  moms_period: MomsPeriodSchema.nullish(),

  // Fiscal year
  fiscal_year_start_month: z.number()
    .int()
    .min(1, 'Month must be between 1 and 12')
    .max(12, 'Month must be between 1 and 12')
    .optional(),

  // Preliminary tax
  preliminary_tax_monthly: z.number()
    .min(0, 'Cannot be negative')
    .max(999999, 'Amount too large')
    .nullish(),

  // Bank details
  bank_name: z.string().max(100).nullish(),
  clearing_number: z.string().max(10).nullish(),
  account_number: z.string().max(30).nullish(),
  iban: z.string().max(34).nullish(),
  bic: z.string().max(11).nullish(),

  // Onboarding
  onboarding_step: z.number().int().min(0).max(10).optional(),
  onboarding_complete: z.boolean().optional(),

  // Salary-related (for AB)
  pays_salaries: z.boolean().optional(),

  // Schablonavdrag
  hemmakontor_enabled: z.boolean().optional(),
  hemmakontor_housing_type: z.enum(['villa', 'apartment']).optional(),
  bil_enabled: z.boolean().optional(),
}).refine(
  (data) => Object.keys(data).length > 0,
  { message: 'At least one field must be provided for update' }
)

export type UpdateSettingsInputZ = z.infer<typeof UpdateSettingsInputSchema>
