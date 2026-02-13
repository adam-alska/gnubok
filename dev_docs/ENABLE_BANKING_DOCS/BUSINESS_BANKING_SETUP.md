# Business Banking Sandbox Setup Guide

## Overview

This guide explains how to configure Enable Banking to use business banking test data instead of personal banking data.

## Changes Made

### 1. Transaction Fetching Added
- ✅ Callback route now fetches transactions for each account
- ✅ Transactions are stored in `landing.transactions` table
- ✅ Error handling per account (continues if one account fails)

### 2. PSU Type Configuration
- ✅ Added `ENABLE_BANKING_PSU_TYPE` environment variable
- ✅ Code now uses this variable throughout the flow
- ✅ Defaults to `business` if not set

### 3. Sample Business Data Created
- ✅ Swedish business banking sample data in `SAMPLE_BUSINESS_BANKING_DATA.json`
- ✅ Realistic business transactions (invoices, rent, VAT, payroll, etc.)
- ✅ Swedish IBANs and business-specific patterns

## Environment Configuration

Your `.env.local` now includes:

```bash
ENABLE_BANKING_PSU_TYPE=business  # or 'personal'
```

### Switching Between Personal and Business

**For Business Banking:**
```bash
ENABLE_BANKING_PSU_TYPE=business
```

**For Personal Banking:**
```bash
ENABLE_BANKING_PSU_TYPE=personal
```

## Sample Business Banking Data

The file `dev_docs/SAMPLE_BUSINESS_BANKING_DATA.json` contains:

### Account Details
- **Account Name**: Arcim AB Företagskonto
- **IBAN**: SE4550000000058398257466
- **Currency**: SEK
- **Balance**: 847,250.50 SEK
- **Type**: Business checking account (CACC)

### Sample Transactions (10 total)

1. **Customer Payment** - 125,000 SEK (credit)
   - Faktura 2025-1045 Konsulttjänster Oktober

2. **Rent Payment** - 45,000 SEK (debit)
   - Hyra Lokaler Q4 2025

3. **Supplier Payment** - 28,500 SEK (debit)
   - Faktura KP-2025-0892 Konsulttjänster

4. **Customer Payment** - 89,000 SEK (credit)
   - Betalning Faktura 2025-3421 Projektleverans

5. **VAT Payment** - 156,700 SEK (debit)
   - Moms Q3 2025 - Organisationsnummer 556789-1234

6. **AWS Cloud** - 12,500 SEK (debit)
   - AWS Cloud Services October 2025

7. **Payroll** - 245,000 SEK (debit)
   - Löner Oktober 2025 - 5 anställda

8. **Customer Payment** - 175,000 SEK (credit)
   - Faktura 2025-2189 Utveckling SaaS Plattform

9. **Telecom** - 8,500 SEK (debit)
   - Företagsabonnemang Telefoni & Internet Oktober

10. **Insurance** - 32,000 SEK (debit)
    - Företagsförsäkring Q4 2025

## Testing the Integration

### Current Status

✅ **Working:**
- Authentication with Enable Banking
- Bank connection storage
- Account storage
- Transaction fetching and storage

### Test Flow

1. **Clear existing data** (if needed):
   ```sql
   DELETE FROM landing.transactions WHERE tenant_id = 'your_tenant_id';
   DELETE FROM landing.bank_accounts WHERE tenant_id = 'your_tenant_id';
   DELETE FROM landing.bank_connections WHERE tenant_id = 'your_tenant_id';
   ```

2. **Start dev server**:
   ```bash
   npm run dev
   ```

3. **Connect to bank**:
   - Go to `/banking/connect`
   - Select a bank
   - Click "Create Account" on mock ASPSP page
   - Set up sample data (use the business sample structure)
   - Grant consent

4. **Verify data in Snowflake**:
   ```sql
   -- Check connections
   SELECT * FROM landing.bank_connections
   WHERE tenant_id = 'your_tenant_id'
   ORDER BY created_at DESC;

   -- Check accounts
   SELECT * FROM landing.bank_accounts
   WHERE tenant_id = 'your_tenant_id'
   ORDER BY created_at DESC;

   -- Check transactions
   SELECT * FROM landing.transactions
   WHERE tenant_id = 'your_tenant_id'
   ORDER BY booking_date DESC;
   ```

5. **Check logs**:
   Look for these in your terminal:
   ```
   Fetching transactions for account acc-business-001
   Found 10 transactions for account acc-business-001
   ```

## Troubleshooting

### No Transactions Stored

**Symptoms:** Accounts are created but no transactions

**Possible Causes:**
1. The mock ASPSP didn't create transaction data
2. The account UID is wrong
3. Transaction API returned error

**Debug:**
- Check terminal logs for "Fetching transactions" messages
- Check for error messages like "Failed to fetch transactions"
- Verify the account `uid` field is correct

### Wrong Data Type (Personal vs Business)

**Symptoms:** Getting personal accounts when expecting business

**Solution:**
1. Check `.env.local` has `ENABLE_BANKING_PSU_TYPE=business`
2. Restart dev server (environment variables only load on startup)
3. Create a new test account on mock ASPSP page
4. Try selecting a different bank from the list

### Transaction Format Issues

**Symptoms:** Transactions stored but with missing/wrong data

**Check:**
- Transaction amounts are parsed correctly (converts string to number)
- Remittance info is joined properly (array to string)
- Credit/debit indicator is mapped correctly

## Using the Sample Data Structure

The `SAMPLE_BUSINESS_BANKING_DATA.json` file shows the expected structure for business banking data. While you can't directly upload this to Enable Banking's mock ASPSP, you can:

1. **Use it as reference** when creating test data on the mock ASPSP page
2. **Manually insert** test data into your Snowflake tables for testing:

```sql
-- Example: Insert test transactions directly
INSERT INTO landing.transactions (
  transaction_id, account_id, tenant_id, external_transaction_id,
  booking_date, value_date, amount, currency, description,
  counterparty_name, counterparty_account, transaction_type
) VALUES
  ('txn_test_001', 'your_account_id', 'your_tenant_id', '2025102101',
   '2025-10-18', '2025-10-18', 125000.00, 'SEK',
   'Faktura 2025-1045 Konsulttjänster Oktober',
   'KUND AB', 'SE9950000000054740013810', 'credit');
```

3. **Request Enable Banking** to pre-populate business test data for your sandbox application

## Next Steps

### For Production

When moving to production:

1. Keep `ENABLE_BANKING_PSU_TYPE=business`
2. Register production application at Enable Banking
3. Update environment variables with production credentials
4. Real bank data will automatically populate

### For Enhanced Testing

Consider:
- Creating multiple test companies with different transaction patterns
- Testing edge cases (failed transactions, pending transactions)
- Testing different currencies (if expanding beyond Sweden)
- Testing large transaction volumes

## Support

If you encounter issues:
- Check Enable Banking documentation: https://enablebanking.com/docs
- Contact Enable Banking support: info@enablebanking.com
- Review logs in your terminal and Snowflake
