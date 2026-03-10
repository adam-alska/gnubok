/**
 * TypeScript interfaces for Fortnox API v3 responses.
 * These mirror the JSON structures returned by Fortnox endpoints.
 */

// --- Pagination ---

export interface FortnoxMetaInformation {
  '@CurrentPage': number
  '@TotalPages': number
  '@TotalResources': number
}

// --- Customers ---

export interface FortnoxCustomerListItem {
  CustomerNumber: string
  Name: string
  Email: string | null
  Phone1: string | null
  OrganisationNumber: string | null
  VATNumber: string | null
  Address1: string | null
  Address2: string | null
  ZipCode: string | null
  City: string | null
  CountryCode: string | null
  Type: string | null // 'PRIVATE' | 'COMPANY'
  Active: boolean
}

export interface FortnoxCustomerDetail extends FortnoxCustomerListItem {
  DeliveryAddress1: string | null
  DeliveryAddress2: string | null
  DeliveryZipCode: string | null
  DeliveryCity: string | null
  DeliveryCountryCode: string | null
  Comments: string | null
  Currency: string
  TermsOfPayment: string | null
  Phone2: string | null
  WWW: string | null
}

// --- Suppliers ---

export interface FortnoxSupplierListItem {
  SupplierNumber: string
  Name: string
  Email: string | null
  Phone1: string | null
  OrganisationNumber: string | null
  VATNumber: string | null
  Address1: string | null
  Address2: string | null
  ZipCode: string | null
  City: string | null
  CountryCode: string | null
  Active: boolean
  BankAccountNumber: string | null
  BG: string | null
  PG: string | null
}

export interface FortnoxSupplierDetail extends FortnoxSupplierListItem {
  BIC: string | null
  IBAN: string | null
  Currency: string
  TermsOfPayment: string | null
  Comments: string | null
  PreDefinedAccount: string | null
}

// --- Invoices ---

export interface FortnoxInvoiceListItem {
  DocumentNumber: string
  CustomerNumber: string
  CustomerName: string
  InvoiceDate: string
  DueDate: string
  Total: number
  TotalVAT: number
  Balance: number
  Currency: string
  Booked: boolean
  Cancelled: boolean
  Sent: boolean
  FinalPayDate: string | null
  CreditInvoiceReference: string | null
}

export interface FortnoxInvoiceDetail extends FortnoxInvoiceListItem {
  Net: number
  YourReference: string | null
  OurReference: string | null
  ExternalInvoiceReference1: string | null
  ExternalInvoiceReference2: string | null
  InvoiceRows: FortnoxInvoiceRow[]
  VATIncluded: boolean
  RoundOff: number
  Comments: string | null
}

export interface FortnoxInvoiceRow {
  ArticleNumber: string | null
  Description: string
  DeliveredQuantity: number
  Unit: string | null
  Price: number
  Total: number
  VAT: number
  AccountNumber: number
}

// --- Supplier Invoices ---

export interface FortnoxSupplierInvoiceListItem {
  GivenNumber: number
  SupplierNumber: string
  SupplierName: string
  InvoiceNumber: string
  InvoiceDate: string
  DueDate: string
  Total: number
  Balance: number
  Currency: string
  Booked: boolean
  Cancelled: boolean
  CreditReference: number | null
}

export interface FortnoxSupplierInvoiceDetail extends FortnoxSupplierInvoiceListItem {
  VAT: number
  VATType: string | null
  SupplierInvoiceRows: FortnoxSupplierInvoiceRow[]
  Comments: string | null
  PaymentPending: boolean
}

export interface FortnoxSupplierInvoiceRow {
  ArticleNumber: string | null
  Account: number
  Code: string | null
  Debit: number
  Credit: number
  Total: number
}

// --- Invoice Payments ---

export interface FortnoxInvoicePayment {
  Number: number
  InvoiceNumber: number
  Amount: number
  AmountCurrency: number
  Currency: string
  CurrencyRate: number
  CurrencyUnit: number
  PaymentDate: string
  Source: string
  WriteOffs: FortnoxWriteOff[]
}

export interface FortnoxWriteOff {
  Amount: number
  AccountNumber: number
  TransactionInformation: string | null
}

// --- Supplier Invoice Payments ---

export interface FortnoxSupplierInvoicePayment {
  Number: number
  InvoiceNumber: number
  Amount: number
  AmountCurrency: number
  Currency: string
  CurrencyRate: number
  CurrencyUnit: number
  PaymentDate: string
  Source: string
}
