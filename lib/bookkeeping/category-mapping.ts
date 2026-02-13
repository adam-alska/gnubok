import type { TransactionCategory, MappingResult, VatJournalLine, Transaction, EntityType } from '@/types'

/**
 * Maps TransactionCategory to BAS accounts for journal entry creation
 *
 * Account mapping follows Swedish BAS Kontoplan:
 * - 1xxx: Assets
 * - 2xxx: Equity & Liabilities
 * - 3xxx: Revenue
 * - 4xxx: Cost of goods sold
 * - 5xxx: External expenses
 * - 6xxx: Other external expenses
 * - 7xxx: Personnel costs
 * - 8xxx: Financial items
 *
 * Key differences between entity types:
 * - Enskild Firma: Uses 2013 (Eget uttag) for private withdrawals
 * - Aktiebolag: Uses 2893 (Skuld till aktieägare) for owner transactions
 */

interface CategoryAccountMapping {
  debitAccount: string
  creditAccount: string
  vatTreatment: string | null
  vatDebitAccount: string | null
  vatCreditAccount: string | null
}

// Default bank account - typically 1930 (Företagskonto/checkkonto)
const BANK_ACCOUNT = '1930'

// Private/owner transaction accounts by entity type
const PRIVATE_ACCOUNTS: Record<EntityType, string> = {
  enskild_firma: '2013',  // Övriga egna uttag
  aktiebolag: '2893',     // Skuld till aktieägare/delägare
}

/**
 * Get account mapping for a transaction category
 *
 * For expenses: Debit expense account, Credit bank (or private for non-business)
 * For income: Debit bank, Credit revenue account
 */
export function getCategoryAccountMapping(
  category: TransactionCategory,
  amount: number,
  isBusiness: boolean,
  entityType: EntityType = 'enskild_firma'
): CategoryAccountMapping {
  // Private/owner transactions use entity-specific accounts
  if (!isBusiness) {
    const privateAccount = PRIVATE_ACCOUNTS[entityType] || PRIVATE_ACCOUNTS.enskild_firma
    return {
      debitAccount: amount < 0 ? privateAccount : BANK_ACCOUNT,
      creditAccount: amount < 0 ? BANK_ACCOUNT : privateAccount,
      vatTreatment: null,
      vatDebitAccount: null,
      vatCreditAccount: null,
    }
  }

  // Business expense categories
  const expenseMapping: Record<string, string> = {
    expense_equipment: '5410', // Förbrukningsinventarier
    expense_software: '5420', // Programvaror
    expense_travel: '5800', // Resekostnader
    expense_office: '5010', // Lokalhyra
    expense_marketing: '5910', // Annonsering
    expense_professional_services: '6530', // Redovisningstjänster
    expense_education: '6991', // Övriga avdragsgilla kostnader
    expense_bank_fees: '6570', // Bankavgifter
    expense_card_fees: '6570', // Kortavgifter
    expense_currency_exchange: '7960', // Valutakursförluster
    expense_other: '6991', // Övriga avdragsgilla kostnader
  }

  // Business income categories
  const incomeMapping: Record<string, string> = {
    income_services: '3001', // Försäljning tjänster 25%
    income_products: '3001', // Försäljning varor 25%
    income_other: '3900', // Övriga rörelseintäkter
  }

  // Check if it's an expense category
  if (category.startsWith('expense_')) {
    const expenseAccount = expenseMapping[category] || '6991'

    // Bank fees, card fees, and currency exchange are VAT-exempt in Sweden
    const vatExemptCategories = ['expense_bank_fees', 'expense_card_fees', 'expense_currency_exchange']
    const isVatExempt = vatExemptCategories.includes(category)

    return {
      debitAccount: expenseAccount,
      creditAccount: BANK_ACCOUNT,
      vatTreatment: isVatExempt ? null : 'standard_25',
      vatDebitAccount: isVatExempt ? null : '2641', // Debiterad ingående moms
      vatCreditAccount: null,
    }
  }

  // Check if it's an income category
  if (category.startsWith('income_')) {
    const incomeAccount = incomeMapping[category] || '3900'
    return {
      debitAccount: BANK_ACCOUNT,
      creditAccount: incomeAccount,
      vatTreatment: 'standard_25',
      vatDebitAccount: null,
      vatCreditAccount: '2610', // Utgående moms
    }
  }

  // Uncategorized - default to misc expense/income based on amount
  if (amount < 0) {
    return {
      debitAccount: '6991',
      creditAccount: BANK_ACCOUNT,
      vatTreatment: null,
      vatDebitAccount: null,
      vatCreditAccount: null,
    }
  } else {
    return {
      debitAccount: BANK_ACCOUNT,
      creditAccount: '3900',
      vatTreatment: null,
      vatDebitAccount: null,
      vatCreditAccount: null,
    }
  }
}

/**
 * Build a MappingResult from a category selection
 * Used by the categorization API to create journal entries
 */
export function buildMappingResultFromCategory(
  category: TransactionCategory,
  transaction: Transaction,
  isBusiness: boolean,
  entityType: EntityType = 'enskild_firma'
): MappingResult {
  const mapping = getCategoryAccountMapping(category, transaction.amount, isBusiness, entityType)

  const vatLines: VatJournalLine[] = []

  // Calculate VAT if applicable (Swedish standard: gross amount includes 25% VAT)
  // VAT = gross * 0.25 / 1.25 = gross * 0.20
  if (isBusiness && mapping.vatTreatment === 'standard_25') {
    const grossAmount = Math.abs(transaction.amount)
    const vatAmount = Math.round((grossAmount * 0.20) * 100) / 100 // Round to öre

    if (transaction.amount < 0 && mapping.vatDebitAccount) {
      // Expense: Ingående moms (deductible VAT)
      vatLines.push({
        account_number: mapping.vatDebitAccount,
        debit_amount: vatAmount,
        credit_amount: 0,
        description: 'Ingående moms 25%',
      })
    } else if (transaction.amount > 0 && mapping.vatCreditAccount) {
      // Income: Utgående moms (output VAT)
      vatLines.push({
        account_number: mapping.vatCreditAccount,
        debit_amount: 0,
        credit_amount: vatAmount,
        description: 'Utgående moms 25%',
      })
    }
  }

  // Generate description
  const categoryLabels: Record<TransactionCategory, string> = {
    income_services: 'Tjänsteförsäljning',
    income_products: 'Varuförsäljning',
    income_other: 'Övrig intäkt',
    expense_equipment: 'Förbrukningsinventarier',
    expense_software: 'Programvara',
    expense_travel: 'Resekostnad',
    expense_office: 'Kontorskostnad',
    expense_marketing: 'Marknadsföring',
    expense_professional_services: 'Konsulttjänst',
    expense_education: 'Utbildning',
    expense_bank_fees: 'Bankavgift',
    expense_card_fees: 'Kortavgift',
    expense_currency_exchange: 'Valutaväxling',
    expense_other: 'Övrig kostnad',
    private: 'Privat',
    uncategorized: 'Okategoriserad',
  }

  const description = isBusiness
    ? `${categoryLabels[category] || category}: ${transaction.description}`
    : `Privat: ${transaction.description}`

  return {
    rule: null,
    debit_account: mapping.debitAccount,
    credit_account: mapping.creditAccount,
    risk_level: 'LOW',
    confidence: 1.0, // User explicitly categorized
    requires_review: false,
    default_private: !isBusiness,
    vat_lines: vatLines,
    description,
  }
}

/**
 * Get the expense account number for a category
 * Useful for creating mapping rules
 */
export function getExpenseAccountForCategory(category: TransactionCategory): string | null {
  const mapping: Record<string, string> = {
    expense_equipment: '5410',
    expense_software: '5420',
    expense_travel: '5800',
    expense_office: '5010',
    expense_marketing: '5910',
    expense_professional_services: '6530',
    expense_education: '6991',
    expense_bank_fees: '6570',
    expense_card_fees: '6570',
    expense_currency_exchange: '7960',
    expense_other: '6991',
  }
  return mapping[category] || null
}
