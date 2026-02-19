import { z } from 'zod'

// ISO date string pattern: YYYY-MM-DD
const dateString = z.string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be a valid date in YYYY-MM-DD format')

// Account number: 4 digits per Swedish BAS
const accountNumberSchema = z.string()
  .regex(/^\d{4}$/, 'Account number must be exactly 4 digits')

// Journal entry source types
const JournalEntrySourceTypeSchema = z.enum([
  'manual',
  'bank_transaction',
  'invoice_created',
  'invoice_paid',
  'credit_note',
  'salary_payment',
  'opening_balance',
  'year_end',
])

// Journal entry line input
const CreateJournalEntryLineInputSchema = z.object({
  account_number: accountNumberSchema,
  debit_amount: z.number().min(0, 'Debit amount cannot be negative'),
  credit_amount: z.number().min(0, 'Credit amount cannot be negative'),
  line_description: z.string().max(500).optional(),
  currency: z.string().min(3).max(3).optional(),
  amount_in_currency: z.number().optional(),
  exchange_rate: z.number().positive('Exchange rate must be positive').optional(),
}).refine(
  (line) => line.debit_amount > 0 || line.credit_amount > 0,
  { message: 'Each line must have either a debit or credit amount' }
).refine(
  (line) => !(line.debit_amount > 0 && line.credit_amount > 0),
  { message: 'A line cannot have both debit and credit amounts' }
)

// Create journal entry input
export const CreateJournalEntryInputSchema = z.object({
  fiscal_period_id: z.string().uuid('Invalid fiscal period ID'),
  entry_date: dateString,
  description: z.string().min(1, 'Description is required').max(500, 'Description too long'),
  source_type: JournalEntrySourceTypeSchema,
  source_id: z.string().uuid('Invalid source ID').optional(),
  voucher_series: z.string().min(1).max(5).optional(),
  lines: z.array(CreateJournalEntryLineInputSchema)
    .min(2, 'Journal entry must have at least 2 lines')
    .max(50, 'Too many journal entry lines'),
})

// Create account input
const AccountTypeSchema = z.enum(['asset', 'equity', 'liability', 'revenue', 'expense'])
const NormalBalanceSchema = z.enum(['debit', 'credit'])
const PlanTypeSchema = z.enum(['k1', 'full_bas'])

export const CreateAccountInputSchema = z.object({
  account_number: accountNumberSchema,
  account_name: z.string().min(1, 'Account name is required').max(200, 'Account name too long'),
  account_type: AccountTypeSchema,
  normal_balance: NormalBalanceSchema,
  plan_type: PlanTypeSchema.optional().default('k1'),
  description: z.string().max(1000).nullish(),
})

// Update account input
export const UpdateAccountInputSchema = z.object({
  account_name: z.string().min(1).max(200).optional(),
  is_active: z.boolean().optional(),
  description: z.string().max(1000).nullish(),
  default_vat_code: z.string().max(20).nullish(),
})

// Create fiscal period input
export const CreateFiscalPeriodInputSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100, 'Name too long'),
  period_start: dateString,
  period_end: dateString,
}).refine(
  (data) => data.period_end > data.period_start,
  { message: 'Period end must be after period start', path: ['period_end'] }
)

// Mapping rule types
const RiskLevelSchema = z.enum(['NONE', 'LOW', 'MEDIUM', 'HIGH', 'VERY_HIGH'])
const MappingRuleTypeSchema = z.enum([
  'mcc_code',
  'merchant_name',
  'description_pattern',
  'amount_threshold',
  'combined',
])

// Create mapping rule input
export const CreateMappingRuleInputSchema = z.object({
  rule_name: z.string().min(1, 'Rule name is required').max(200, 'Rule name too long'),
  rule_type: MappingRuleTypeSchema,
  priority: z.number().int().min(0).max(1000).optional().default(10),
  mcc_codes: z.array(z.number().int().min(0).max(9999)).nullish(),
  merchant_pattern: z.string().max(500).nullish(),
  description_pattern: z.string().max(500).nullish(),
  amount_min: z.number().nullish(),
  amount_max: z.number().nullish(),
  debit_account: accountNumberSchema.optional(),
  credit_account: accountNumberSchema.optional(),
  vat_treatment: z.string().max(50).nullish(),
  risk_level: RiskLevelSchema.optional().default('NONE'),
  default_private: z.boolean().optional().default(false),
  requires_review: z.boolean().optional().default(false),
  confidence_score: z.number().min(0).max(1).optional().default(0.9),
})

// Evaluate mapping rule input
export const EvaluateMappingRuleInputSchema = z.object({
  transaction_id: z.string().uuid('Invalid transaction ID').optional(),
  // If no transaction_id, allow raw transaction fields
  id: z.string().optional(),
  description: z.string().optional(),
  amount: z.number().optional(),
  merchant_name: z.string().nullish(),
  mcc_code: z.number().int().nullish(),
}).refine(
  (data) => data.transaction_id || data.description,
  { message: 'Either transaction_id or transaction data (description) is required' }
)

export type CreateJournalEntryInputZ = z.infer<typeof CreateJournalEntryInputSchema>
export type CreateAccountInputZ = z.infer<typeof CreateAccountInputSchema>
export type UpdateAccountInputZ = z.infer<typeof UpdateAccountInputSchema>
export type CreateFiscalPeriodInputZ = z.infer<typeof CreateFiscalPeriodInputSchema>
export type CreateMappingRuleInputZ = z.infer<typeof CreateMappingRuleInputSchema>
export type EvaluateMappingRuleInputZ = z.infer<typeof EvaluateMappingRuleInputSchema>
