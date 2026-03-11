/**
 * Central catalog of all Fortnox data types available for sync.
 * Each entry defines the API endpoint, required OAuth scope,
 * where the data should be stored, and UI metadata.
 */

export type FortnoxSyncTarget = 'sie_import' | 'gnubok_table' | 'raw_json'

export type FortnoxDataCategory = 'accounting' | 'sales' | 'purchase' | 'hr' | 'other'

export interface FortnoxDataType {
  id: string
  name: string // Swedish display name
  endpoint: string
  responseKey: string
  requiredScope: string
  syncTarget: FortnoxSyncTarget
  targetTable?: string // gnubok table name when syncTarget is 'gnubok_table'
  category: FortnoxDataCategory
  sortOrder: number
  requiresFinancialYear?: boolean
  singleResource?: boolean // true if endpoint returns a single object, not a paginated list
  description?: string // Swedish description for UI tooltip
}

const CATEGORY_LABELS: Record<FortnoxDataCategory, string> = {
  accounting: 'Bokföring',
  sales: 'Försäljning',
  purchase: 'Inköp',
  hr: 'Löner',
  other: 'Övrigt',
}

export function getCategoryLabel(category: FortnoxDataCategory): string {
  return CATEGORY_LABELS[category]
}

export const FORTNOX_DATA_TYPES: FortnoxDataType[] = [
  // --- Bokföring (accounting) ---
  {
    id: 'sie4',
    name: 'SIE4 (bokföringsdata)',
    endpoint: '/3/sie/4',
    responseKey: '',
    requiredScope: 'bookkeeping',
    syncTarget: 'sie_import',
    category: 'accounting',
    sortOrder: 1,
    requiresFinancialYear: true,
    description: 'Komplett bokföringsexport med kontoplan, verifikationer och balanser',
  },
  {
    id: 'accounts',
    name: 'Kontoplan',
    endpoint: '/3/accounts',
    responseKey: 'Accounts',
    requiredScope: 'bookkeeping',
    syncTarget: 'raw_json',
    category: 'accounting',
    sortOrder: 2,
    requiresFinancialYear: true,
  },
  {
    id: 'vouchers',
    name: 'Verifikationer',
    endpoint: '/3/vouchers',
    responseKey: 'Vouchers',
    requiredScope: 'bookkeeping',
    syncTarget: 'raw_json',
    category: 'accounting',
    sortOrder: 3,
    requiresFinancialYear: true,
  },
  {
    id: 'voucherseries',
    name: 'Verifikationsserier',
    endpoint: '/3/voucherseries',
    responseKey: 'VoucherSeriesCollection',
    requiredScope: 'bookkeeping',
    syncTarget: 'raw_json',
    category: 'accounting',
    sortOrder: 4,
  },
  {
    id: 'lockedperiod',
    name: 'Låst period',
    endpoint: '/3/settings/lockedperiod',
    responseKey: 'LockedPeriod',
    requiredScope: 'settings',
    syncTarget: 'raw_json',
    singleResource: true,
    category: 'accounting',
    sortOrder: 5,
  },
  {
    id: 'companyinformation',
    name: 'Företagsinformation',
    endpoint: '/3/companyinformation',
    responseKey: 'CompanyInformation',
    requiredScope: 'companyinformation',
    syncTarget: 'raw_json',
    singleResource: true,
    category: 'accounting',
    sortOrder: 6,
  },

  // --- Försäljning (sales) ---
  {
    id: 'customers',
    name: 'Kunder',
    endpoint: '/3/customers',
    responseKey: 'Customers',
    requiredScope: 'customer',
    syncTarget: 'gnubok_table',
    targetTable: 'customers',
    category: 'sales',
    sortOrder: 10,
  },
  {
    id: 'invoices',
    name: 'Kundfakturor',
    endpoint: '/3/invoices',
    responseKey: 'Invoices',
    requiredScope: 'invoice',
    syncTarget: 'gnubok_table',
    targetTable: 'invoices',
    category: 'sales',
    sortOrder: 11,
  },
  {
    id: 'invoicepayments',
    name: 'Kundbetalningar',
    endpoint: '/3/invoicepayments',
    responseKey: 'InvoicePayments',
    requiredScope: 'payment',
    syncTarget: 'gnubok_table',
    targetTable: 'invoices',
    category: 'sales',
    sortOrder: 12,
    description: 'Uppdaterar betalningsstatus på importerade kundfakturor',
  },
  {
    id: 'offers',
    name: 'Offerter',
    endpoint: '/3/offers',
    responseKey: 'Offers',
    requiredScope: 'offer',
    syncTarget: 'raw_json',
    category: 'sales',
    sortOrder: 13,
  },
  {
    id: 'orders',
    name: 'Order',
    endpoint: '/3/orders',
    responseKey: 'Orders',
    requiredScope: 'order',
    syncTarget: 'raw_json',
    category: 'sales',
    sortOrder: 14,
  },
  {
    id: 'contracts',
    name: 'Avtal',
    endpoint: '/3/contracts',
    responseKey: 'Contracts',
    requiredScope: 'invoice',
    syncTarget: 'raw_json',
    category: 'sales',
    sortOrder: 15,
  },
  {
    id: 'articles',
    name: 'Artiklar',
    endpoint: '/3/articles',
    responseKey: 'Articles',
    requiredScope: 'article',
    syncTarget: 'raw_json',
    category: 'sales',
    sortOrder: 16,
  },

  // --- Inköp (purchase) ---
  {
    id: 'suppliers',
    name: 'Leverantörer',
    endpoint: '/3/suppliers',
    responseKey: 'Suppliers',
    requiredScope: 'supplier',
    syncTarget: 'gnubok_table',
    targetTable: 'suppliers',
    category: 'purchase',
    sortOrder: 20,
  },
  {
    id: 'supplierinvoices',
    name: 'Leverantörsfakturor',
    endpoint: '/3/supplierinvoices',
    responseKey: 'SupplierInvoices',
    requiredScope: 'supplierinvoice',
    syncTarget: 'gnubok_table',
    targetTable: 'supplier_invoices',
    category: 'purchase',
    sortOrder: 21,
  },
  {
    id: 'supplierinvoicepayments',
    name: 'Leverantörsbetalningar',
    endpoint: '/3/supplierinvoicepayments',
    responseKey: 'SupplierInvoicePayments',
    requiredScope: 'payment',
    syncTarget: 'gnubok_table',
    targetTable: 'supplier_invoices',
    category: 'purchase',
    sortOrder: 22,
    description: 'Uppdaterar betalningsstatus på importerade leverantörsfakturor',
  },

  // --- Löner (hr) ---
  {
    id: 'employees',
    name: 'Anställda',
    endpoint: '/3/employees',
    responseKey: 'Employees',
    requiredScope: 'salary',
    syncTarget: 'raw_json',
    category: 'hr',
    sortOrder: 30,
  },
  {
    id: 'salarytransactions',
    name: 'Lönetransaktioner',
    endpoint: '/3/salarytransactions',
    responseKey: 'SalaryTransactions',
    requiredScope: 'salary',
    syncTarget: 'raw_json',
    category: 'hr',
    sortOrder: 31,
  },
  {
    id: 'absencetransactions',
    name: 'Frånvaro',
    endpoint: '/3/absencetransactions',
    responseKey: 'AbsenceTransactions',
    requiredScope: 'salary',
    syncTarget: 'raw_json',
    category: 'hr',
    sortOrder: 32,
  },
  {
    id: 'attendancetransactions',
    name: 'Närvaro',
    endpoint: '/3/attendancetransactions',
    responseKey: 'AttendanceTransactions',
    requiredScope: 'salary',
    syncTarget: 'raw_json',
    category: 'hr',
    sortOrder: 33,
  },

  // --- Övrigt (other) ---
  {
    id: 'costcenters',
    name: 'Kostnadsställen',
    endpoint: '/3/costcenters',
    responseKey: 'CostCenters',
    requiredScope: 'costcenter',
    syncTarget: 'raw_json',
    category: 'other',
    sortOrder: 40,
  },
  {
    id: 'projects',
    name: 'Projekt',
    endpoint: '/3/projects',
    responseKey: 'Projects',
    requiredScope: 'project',
    syncTarget: 'raw_json',
    category: 'other',
    sortOrder: 41,
  },
  {
    id: 'currencies',
    name: 'Valutor',
    endpoint: '/3/currencies',
    responseKey: 'Currencies',
    requiredScope: 'currency',
    syncTarget: 'raw_json',
    category: 'other',
    sortOrder: 42,
  },
  {
    id: 'termsofpayments',
    name: 'Betalningsvillkor',
    endpoint: '/3/termsofpayments',
    responseKey: 'TermsOfPayments',
    requiredScope: 'settings',
    syncTarget: 'raw_json',
    category: 'other',
    sortOrder: 43,
  },
  {
    id: 'termsofdeliveries',
    name: 'Leveransvillkor',
    endpoint: '/3/termsofdeliveries',
    responseKey: 'TermsOfDeliveries',
    requiredScope: 'settings',
    syncTarget: 'raw_json',
    category: 'other',
    sortOrder: 44,
  },
  {
    id: 'units',
    name: 'Enheter',
    endpoint: '/3/units',
    responseKey: 'Units',
    requiredScope: 'settings',
    syncTarget: 'raw_json',
    category: 'other',
    sortOrder: 45,
  },
  {
    id: 'prices',
    name: 'Priser',
    endpoint: '/3/prices',
    responseKey: 'Prices',
    requiredScope: 'price',
    syncTarget: 'raw_json',
    category: 'other',
    sortOrder: 46,
  },
  {
    id: 'pricelists',
    name: 'Prislistor',
    endpoint: '/3/pricelists',
    responseKey: 'PriceLists',
    requiredScope: 'price',
    syncTarget: 'raw_json',
    category: 'other',
    sortOrder: 47,
  },
  {
    id: 'assets',
    name: 'Anläggningstillgångar',
    endpoint: '/3/assets',
    responseKey: 'Assets',
    requiredScope: 'assets',
    syncTarget: 'raw_json',
    category: 'other',
    sortOrder: 48,
  },
]

/**
 * Get a data type by ID
 */
export function getFortnoxDataType(id: string): FortnoxDataType | undefined {
  return FORTNOX_DATA_TYPES.find((dt) => dt.id === id)
}

/**
 * Get all unique scopes required for a set of data type IDs
 */
export function getRequiredScopes(dataTypeIds: string[]): string[] {
  const scopes = new Set<string>()
  for (const id of dataTypeIds) {
    const dt = getFortnoxDataType(id)
    if (dt) scopes.add(dt.requiredScope)
  }
  return Array.from(scopes)
}

/**
 * Get scopes that are required but not in the granted set
 */
export function getMissingScopesForTypes(
  dataTypeIds: string[],
  grantedScopes: string[]
): string[] {
  const required = getRequiredScopes(dataTypeIds)
  return required.filter((s) => !grantedScopes.includes(s))
}

/**
 * Get data types grouped by category, sorted by sortOrder
 */
export function getGroupedDataTypes(): Record<FortnoxDataCategory, FortnoxDataType[]> {
  const grouped: Record<FortnoxDataCategory, FortnoxDataType[]> = {
    accounting: [],
    sales: [],
    purchase: [],
    hr: [],
    other: [],
  }

  for (const dt of FORTNOX_DATA_TYPES) {
    grouped[dt.category].push(dt)
  }

  // Sort each group by sortOrder
  for (const category of Object.keys(grouped) as FortnoxDataCategory[]) {
    grouped[category].sort((a, b) => a.sortOrder - b.sortOrder)
  }

  return grouped
}

/**
 * Check if any selected data types require a financial year parameter
 */
export function requiresFinancialYear(dataTypeIds: string[]): boolean {
  return dataTypeIds.some((id) => {
    const dt = getFortnoxDataType(id)
    return dt?.requiresFinancialYear === true
  })
}
