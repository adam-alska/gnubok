import crypto from 'crypto'
import { createClient } from '@supabase/supabase-js'

const KEY_PREFIX = 'gnubok_sk_'

// ── API Key Scopes ──────────────────────────────────────────

export const API_KEY_SCOPES = {
  'transactions:read':  { label: 'Transaktioner — läs',  description: 'Lista transaktioner, mallförslag, kategoriförslag (3 verktyg)' },
  'transactions:write': { label: 'Transaktioner — skriv', description: 'Kategorisera, kvittomatchning, koppling mot faktura (3 verktyg)' },
  'customers:read':     { label: 'Kunder — läs',         description: 'Lista kunder (1 verktyg)' },
  'customers:write':    { label: 'Kunder — skriv',       description: 'Skapa kunder (1 verktyg)' },
  'invoices:read':      { label: 'Fakturor — läs',       description: 'Lista fakturor (1 verktyg)' },
  'invoices:write':     { label: 'Fakturor — skriv',     description: 'Skapa, skicka, markera betald/skickad (4 verktyg)' },
  'suppliers:read':     { label: 'Leverantörer — läs',   description: 'Lista leverantörer och leverantörsfakturor (2 verktyg)' },
  'reports:read':       { label: 'Rapporter — läs',      description: 'Kontoplan, huvudbok, balansräkning, resultaträkning, moms, KPI, reskontra, perioder, bankavstämning (11 verktyg)' },
} as const

export type ApiKeyScope = keyof typeof API_KEY_SCOPES

export const ALL_SCOPES: ApiKeyScope[] = Object.keys(API_KEY_SCOPES) as ApiKeyScope[]

/** The read-only scopes assigned to keys with no explicit scopes (legacy/null). */
export const DEFAULT_SCOPES: ApiKeyScope[] = [
  'transactions:read',
  'customers:read',
  'invoices:read',
  'suppliers:read',
  'reports:read',
]

/** Scope domain groups for UI rendering */
export const SCOPE_GROUPS = [
  { domain: 'transactions', label: 'Transaktioner',  read: 'transactions:read' as const, write: 'transactions:write' as const },
  { domain: 'customers',    label: 'Kunder',         read: 'customers:read' as const,    write: 'customers:write' as const },
  { domain: 'invoices',     label: 'Fakturor',       read: 'invoices:read' as const,     write: 'invoices:write' as const },
  { domain: 'suppliers',    label: 'Leverantörer',   read: 'suppliers:read' as const,    write: null },
  { domain: 'reports',      label: 'Rapporter',      read: 'reports:read' as const,      write: null },
] as const

/** Map MCP tool name → required scope */
export const TOOL_SCOPE_MAP: Record<string, ApiKeyScope> = {
  // Transactions
  gnubok_list_uncategorized_transactions: 'transactions:read',
  gnubok_categorize_transaction:          'transactions:write',
  gnubok_receipt_matcher:                 'transactions:write',
  gnubok_get_counterparty_templates:      'transactions:read',
  gnubok_suggest_categories:              'transactions:read',
  gnubok_match_transaction_to_invoice:    'transactions:write',
  // Customers
  gnubok_list_customers:                  'customers:read',
  gnubok_create_customer:                 'customers:write',
  // Invoices
  gnubok_list_invoices:                   'invoices:read',
  gnubok_create_invoice:                  'invoices:write',
  gnubok_send_invoice:                    'invoices:write',
  gnubok_mark_invoice_as_paid:            'invoices:write',
  gnubok_mark_invoice_as_sent:            'invoices:write',
  // Suppliers
  gnubok_list_suppliers:                  'suppliers:read',
  gnubok_list_supplier_invoices:          'suppliers:read',
  // Reports
  gnubok_get_trial_balance:               'reports:read',
  gnubok_get_vat_report:                  'reports:read',
  gnubok_get_kpi_report:                  'reports:read',
  gnubok_get_income_statement:            'reports:read',
  gnubok_list_accounts:                   'reports:read',
  gnubok_get_balance_sheet:               'reports:read',
  gnubok_get_general_ledger:              'reports:read',
  gnubok_get_ar_ledger:                   'reports:read',
  gnubok_get_supplier_ledger:             'reports:read',
  gnubok_list_fiscal_periods:             'reports:read',
  gnubok_get_reconciliation_status:       'reports:read',
  // Document inbox
  gnubok_upload_document:                 'transactions:write',
  gnubok_list_inbox_items:                'transactions:read',
  gnubok_get_inbox_item:                  'transactions:read',
}

export function validateScopes(scopes: unknown): ApiKeyScope[] | null {
  if (scopes === null || scopes === undefined) return null
  if (!Array.isArray(scopes)) return null
  const valid = scopes.filter((s): s is ApiKeyScope => s in API_KEY_SCOPES)
  return valid.length > 0 ? valid : null
}

/**
 * Create a Supabase service client that doesn't require cookies.
 * Used for API key validation (MCP, webhooks) where there's no browser session.
 */
export function createServiceClientNoCookies() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export function generateApiKey(): { key: string; hash: string; prefix: string } {
  const random = crypto.randomBytes(32).toString('base64url')
  const key = `${KEY_PREFIX}${random}`
  const hash = hashApiKey(key)
  const prefix = key.slice(0, KEY_PREFIX.length + 8)
  return { key, hash, prefix }
}

export function hashApiKey(key: string): string {
  return crypto.createHash('sha256').update(key).digest('hex')
}

export function extractBearerToken(request: Request): string | null {
  const authHeader = request.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer ')) return null
  return authHeader.slice(7)
}

/**
 * Validate an API key and enforce rate limiting.
 * Uses the DB RPC for atomic check + increment.
 * Returns the user_id and effective scopes on success, or an error with HTTP status.
 * null scopes in DB → DEFAULT_SCOPES (read-only).
 */
export async function validateApiKey(
  key: string
): Promise<{ userId: string; companyId: string; scopes: ApiKeyScope[] } | { error: string; status: number }> {
  if (!key.startsWith(KEY_PREFIX)) {
    return { error: 'Invalid API key format', status: 401 }
  }

  const hash = hashApiKey(key)
  const supabase = createServiceClientNoCookies()

  const { data, error } = await supabase.rpc('validate_and_increment_api_key', {
    p_key_hash: hash,
  })

  if (error || !data || data.length === 0) {
    return { error: 'Invalid API key', status: 401 }
  }

  const row = data[0]

  if (row.rate_limited) {
    return { error: 'Rate limit exceeded', status: 429 }
  }

  return {
    userId: row.user_id,
    companyId: row.company_id,
    scopes: validateScopes(row.scopes) ?? DEFAULT_SCOPES,
  }
}

/**
 * Check if a given scope is allowed by the key's scopes.
 */
export function hasScope(keyScopes: ApiKeyScope[], required: ApiKeyScope): boolean {
  return keyScopes.includes(required)
}
