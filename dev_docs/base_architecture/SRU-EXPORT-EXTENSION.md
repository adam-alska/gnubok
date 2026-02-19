# SRU Export Extension

## Overview

The SRU Export extension generates SRU (Standardiserat Räkenskapsutdrag) files for electronic tax filing with Skatteverket. It reads `sru_code` from `chart_of_accounts`, aggregates balances by SRU code, and produces downloadable `.sru` files.

Supports both:
- **NE** (Enskild firma) — field codes 7310-7350
- **INK2** (Aktiebolag) — field codes 7200-7499

The form type is determined automatically from the user's `entity_type` in `company_settings`.

## Architecture

```
extensions/sru-export/
├── index.ts              Extension definition (registered in loader)
├── sru-engine.ts         Balance aggregation by SRU code
├── sru-generator.ts      Generic SRU file generation
├── types.ts              SRU-specific type definitions (canonical source)
└── SRUExportView.tsx     UI component for the SRU-export reports tab

app/api/extensions/sru-export/
├── route.ts              GET /api/extensions/sru-export (export endpoint)
└── coverage/
    └── route.ts          GET /api/extensions/sru-export/coverage (stats)
```

### Relationship to NE-bilaga extension

The NE-bilaga extension (`extensions/ne-bilaga/`) handles the NE-specific declaration path with hard-coded R1-R11 account mappings, served via `/api/extensions/ne-bilaga`. See `dev_docs/base_architecture/NE-BILAGA-EXTENSION.md`.

The generic SRU export is an alternative path that works from raw `account → sru_code` mappings stored in `chart_of_accounts`, rather than hard-coded NE ruta mappings. The generic generator reuses `sruFileToString()` and `validateSRUFile()` from the shared module.

```
NE-bilaga path (EF only):
  extensions/ne-bilaga/ne-engine.ts → lib/reports/sru-generator.ts (NE field codes)

Generic path (NE + INK2):
  extensions/sru-export/sru-engine.ts (reads sru_code from DB) → sru-generator.ts (any form type)
```

## Database Changes

### Migration: `20240101000021_sru_codes.sql`

Applied as three remote migrations:
1. `add_sru_code_column` — `ALTER TABLE chart_of_accounts ADD COLUMN sru_code text`
2. `sru_codes_backfill` — Updates existing accounts with SRU codes based on account number ranges
3. `sru_codes_seed_function` — Updates `seed_chart_of_accounts()` to include `sru_code` for new users

The backfill only updates accounts where `sru_code IS NULL`, preserving any manual assignments.

### SRU Code Mappings

#### NE form (EF) — Revenue & Expense accounts

| Account Range | SRU Code | NE Ruta | Description |
|---|---|---|---|
| 3000-3499 (excl 3100) | 7310 | R1 | Försäljning med moms |
| 3100, 3900, 3970-3980 | 7311 | R2 | Momsfria intäkter |
| 3200-3299 | 7312 | R3 | Bil/bostadsförmån |
| 8310-8330 | 7313 | R4 | Ränteintäkter |
| 4000-4990 | 7320 | R5 | Varuinköp |
| 5000-6990, 7970 | 7321 | R6 | Övriga kostnader |
| 7000-7699 | 7322 | R7 | Lönekostnader |
| 8400-8499 | 7323 | R8 | Räntekostnader |
| 7820 | 7324 | R9 | Avskrivningar fastighet |
| 7700-7899 (excl 7820) | 7325 | R10 | Avskrivningar övrigt |

#### INK2 form (AB) — Balance Sheet accounts

| Account Range | SRU Code | Description |
|---|---|---|
| 1000-1099 | 7201 | Immateriella anläggningstillgångar |
| 1100-1299 | 7202 | Materiella anläggningstillgångar |
| 1300-1399 | 7203 | Finansiella anläggningstillgångar |
| 1400-1499 | 7210 | Varulager |
| 1500-1599 | 7211 | Kundfordringar |
| 1600-1999 | 7212 | Övriga omsättningstillgångar |
| 2081 | 7220 | Aktiekapital |
| 2085-2098 | 7221 | Övrigt eget kapital |
| 2099 | 7222 | Årets resultat |
| 2100-2499 | 7230 | Skulder |
| 2500-2999 | 7231 | Övriga skulder |

#### INK2 form (AB) — Income Statement accounts

| Account Range | SRU Code | Description |
|---|---|---|
| 3000-3999 | 7310 | Nettoomsättning |
| 4000-4999 | 7320 | Varuinköp |
| 5000-6999 | 7330 | Övriga externa kostnader |
| 7000-7699 | 7340 | Personalkostnader |
| 7700-7899 | 7350 | Avskrivningar |
| 7900-7999 | 7360 | Övriga rörelsekostnader |
| 8000-8499 | 7370 | Finansiella poster |
| 8500-8999 | 7380 | Extraordinära poster |

## API Reference

### GET /api/extensions/sru-export

Generate SRU export for a fiscal period.

**Query parameters:**
| Parameter | Required | Description |
|---|---|---|
| `period_id` | Yes | Fiscal period UUID |
| `format` | No | `json` (default) or `sru` |

**Response (format=json):**
```json
{
  "data": {
    "formType": "NE",
    "entityType": "enskild_firma",
    "companyName": "Mitt Företag AB",
    "orgNumber": "556123-4567",
    "fiscalYear": {
      "id": "uuid",
      "name": "2025",
      "start": "2025-01-01",
      "end": "2025-12-31"
    },
    "balances": [
      {
        "sruCode": "7310",
        "description": "Försäljning med moms",
        "amount": 150000,
        "accounts": [
          { "accountNumber": "3001", "accountName": "Försäljning tjänster 25%", "amount": 150000 }
        ]
      }
    ],
    "warnings": ["Räkenskapsåret är inte stängt. Siffrorna kan ändras."]
  }
}
```

**Response (format=sru):** Downloads a `.sru` file with `Content-Disposition: attachment`.

### GET /api/extensions/sru-export/coverage

Returns SRU code coverage statistics for the authenticated user's chart of accounts.

**Response:**
```json
{
  "data": {
    "totalAccounts": 30,
    "accountsWithSRU": 28,
    "accountsWithoutSRU": 2,
    "coveragePercent": 93,
    "missingAccounts": [
      { "accountNumber": "1220", "accountName": "Inventarier" }
    ]
  }
}
```

## SRU File Format

The generated `.sru` file follows the Skatteverket standard:

```
#PRODUKT KONTROLLUPPGIFTER
#SESSION 1
#PROGRAMNAMN ERPBase
#PROGRAMVERSION 1.0
#SKAPAT 20260219
#BLANKETT NE
#IDENTITET 5561234567
#UPPGIFT 7000 20250101-20251231
#UPPGIFT 7310 150000
#UPPGIFT 7320 -45000
#UPPGIFT 7321 -30000
#BLANKETTSLUT
```

Each `#UPPGIFT` line contains an SRU field code and the rounded (whole kronor) amount. Zero-amount entries are omitted.

## UI Integration

### SRUExportView component

The SRU export UI lives in `extensions/sru-export/SRUExportView.tsx` and is imported by the reports page:

```typescript
import { SRUExportView } from '@/extensions/sru-export/SRUExportView'
```

### Reports Page

The **SRU-export** tab in `/reports` shows:

1. **Info card** with "Förhandsgranska" and "Ladda ner SRU-fil" buttons
2. **Coverage warning** if accounts lack SRU codes (fetched from `/coverage` endpoint)
3. **Company info card** showing entity type badge (NE/INK2) and fiscal year
4. **SRU balances table** with expandable rows showing per-account detail

### Chart of Accounts

A new **SRU** column is added to the accounts table in the Kontoplan view. The column is inline-editable: click a cell to type a new SRU code, press Enter to save, Escape to cancel. Updates go directly to `chart_of_accounts.sru_code` via the Supabase client.

## Extension Registration

The extension is registered in `lib/extensions/loader.ts`:

```typescript
import { sruExportExtension } from '@/extensions/sru-export'

const FIRST_PARTY_EXTENSIONS: Extension[] = [
  receiptOcrExtension,
  aiCategorizationExtension,
  pushNotificationsExtension,
  sruExportExtension,        // ← added
]
```

The extension has no event handlers, no settings panel, and no sidebar items. It only declares a report type for discovery purposes.

## Type Definitions

Canonical source: `extensions/sru-export/types.ts` (re-exported from `types/index.ts` for convenience):

- **`SRUExportResult`** — Response shape for the JSON format export endpoint
- **`SRUCoverageStats`** — Response shape for the coverage endpoint

## Files Changed

### Created
| File | Purpose |
|---|---|
| `supabase/migrations/20240101000021_sru_codes.sql` | Add column, backfill SRU codes, update seed function |
| `extensions/sru-export/index.ts` | Extension definition |
| `extensions/sru-export/sru-engine.ts` | Balance aggregation by SRU code |
| `extensions/sru-export/sru-generator.ts` | Generic SRU file generation |
| `extensions/sru-export/types.ts` | Canonical type definitions (`SRUExportResult`, `SRUCoverageStats`) |
| `extensions/sru-export/SRUExportView.tsx` | UI component (extracted from reports page) |
| `app/api/extensions/sru-export/route.ts` | Export API endpoint |
| `app/api/extensions/sru-export/coverage/route.ts` | Coverage stats endpoint |

### Modified
| File | Change |
|---|---|
| `lib/extensions/loader.ts` | Added `sruExportExtension` to `FIRST_PARTY_EXTENSIONS` |
| `app/(dashboard)/reports/page.tsx` | Imports `SRUExportView` from extension instead of inlining it |
| `types/index.ts` | SRU types replaced with re-exports from `extensions/sru-export/types.ts` |
| `components/bookkeeping/ChartOfAccounts.tsx` | Added inline-editable SRU code column |

### Reused (not modified)
| File | What was reused |
|---|---|
| `lib/reports/sru-generator.ts` | `sruFileToString()`, `validateSRUFile()` |
| `extensions/ne-bilaga/ne-engine.ts` | Balance calculation pattern |
| `lib/reports/sie-export.ts` | `calculateBalances()` pattern |
