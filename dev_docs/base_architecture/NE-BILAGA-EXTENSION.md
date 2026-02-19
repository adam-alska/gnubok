# NE-bilaga Extension

## Overview

The NE-bilaga extension generates the NE appendix (Näringsverksamhet) for income tax reporting of enskild firma (sole proprietorship) to Skatteverket. It maps BAS account balances to NE declaration rutor R1-R11 and optionally produces downloadable SRU files.

Only relevant for **enskild firma** (`entity_type = 'enskild_firma'`). The tab is hidden for AB users.

Previously embedded as core code in `lib/reports/ne-declaration.ts` and `app/api/reports/ne-declaration/route.ts`, the logic was extracted into a proper extension following the same pattern as `extensions/sru-export/`.

## Architecture

```
extensions/ne-bilaga/
├── index.ts              Extension definition (registered in loader)
├── ne-engine.ts          Account-to-ruta mapping and balance calculation
├── types.ts              NE-specific type definitions (canonical source)
└── NEDeclarationView.tsx UI component for the NE-bilaga reports tab

app/api/extensions/ne-bilaga/
└── route.ts              GET /api/extensions/ne-bilaga (json + sru)
```

### Relationship to SRU Export

The NE-bilaga extension and the SRU Export extension serve different purposes but share SRU file generation utilities:

```
NE-bilaga path (EF only):
  ne-engine.ts (hard-coded R1-R11 account mappings) → lib/reports/sru-generator.ts

SRU Export path (EF + AB):
  sru-engine.ts (reads sru_code from DB) → sru-generator.ts (any form type)
```

The NE-bilaga engine uses hard-coded account ranges to map balances to NE rutor. The SRU Export engine reads `sru_code` from `chart_of_accounts` for a more generic approach. Both use the shared `sruFileToString()` and `generateSRUFile()` from `lib/reports/sru-generator.ts`.

### Dead code removed

The backward-compatibility shim `lib/reports/ne-declaration.ts` (which re-exported from the extension) has been deleted. It had zero importers after the API route `app/api/reports/ne-declaration/route.ts` was removed earlier. All consumers now import directly from the extension or from `@/types`.

## NE Declaration Rutor

### Revenue (R1-R4)

| Ruta | Account Range | Description |
|---|---|---|
| R1 | 3000-3499 (excl 3100) | Forsaljning med moms (25%) |
| R2 | 3100, 3900, 3970-3980 | Momsfria intakter |
| R3 | 3200-3299 | Bil/bostadsforman |
| R4 | 8310-8330 | Ranteintakter |

### Expenses (R5-R10)

| Ruta | Account Range | Description |
|---|---|---|
| R5 | 4000-4990 | Varuinkop |
| R6 | 5000-6990, 7970 | Ovriga kostnader |
| R7 | 7000-7699 | Lonekostnader |
| R8 | 8400-8499 | Rantekostnader |
| R9 | 7820 | Avskrivningar fastighet |
| R10 | 7700-7899 (excl 7820) | Avskrivningar ovrigt |

### Result

| Ruta | Calculation | Description |
|---|---|---|
| R11 | (R1+R2+R3+R4) - (R5+R6+R7+R8+R9+R10) | Arets resultat |

### Gift handling

- Gifts **with** consideration: R1 (VAT-liable exchange transaction)
- Gifts **without** consideration: R2 via account 3900
- Deductible gifts: R6 via account 5460

## API Reference

### GET /api/extensions/ne-bilaga

Generate NE declaration for a fiscal period.

**Query parameters:**

| Parameter | Required | Description |
|---|---|---|
| `period_id` | Yes | Fiscal period UUID |
| `format` | No | `json` (default) or `sru` |

**Response (format=json):**
```json
{
  "data": {
    "fiscalYear": {
      "id": "uuid",
      "name": "2025",
      "start": "2025-01-01",
      "end": "2025-12-31",
      "isClosed": false
    },
    "rutor": {
      "R1": 150000,
      "R2": 0,
      "R3": 0,
      "R4": 500,
      "R5": 45000,
      "R6": 30000,
      "R7": 0,
      "R8": 1200,
      "R9": 0,
      "R10": 5000,
      "R11": 69300
    },
    "breakdown": {
      "R1": {
        "accounts": [
          { "accountNumber": "3001", "accountName": "Forsaljning tjanster 25%", "amount": 150000 }
        ],
        "total": 150000
      }
    },
    "companyInfo": {
      "companyName": "Mitt Foretag",
      "orgNumber": "801234-5678"
    },
    "warnings": ["Rakenskapsaret ar inte stangt. Siffrorna kan andras."]
  }
}
```

**Response (format=sru):** Downloads a `.sru` file with `Content-Disposition: attachment`.

**Error responses:**

| Status | Condition |
|---|---|
| 400 | Missing `period_id` parameter |
| 401 | Not authenticated |
| 500 | Entity type is not `enskild_firma`, period not found, or database error |

## Engine Details

### Balance calculation

1. Fetch all **posted** journal entries for the given fiscal period
2. Sum `debit_amount - credit_amount` per account number
3. Match each account to an NE ruta using `NE_ACCOUNT_MAPPINGS`
4. For revenue accounts (credit-normal): negate the balance so positive = income
5. For expense accounts (debit-normal): use as-is
6. Round each ruta to whole kronor
7. Calculate R11 as total revenue minus total expenses

### Entity type guard

The engine throws if `company_settings.entity_type !== 'enskild_firma'`. This prevents accidental NE generation for AB entities.

### Warnings

The engine emits warnings when:
- The fiscal period is not closed (balances may change)
- No revenue or expenses were found (empty period)

## UI Integration

### NEDeclarationView component

The NE-bilaga UI lives in `extensions/ne-bilaga/NEDeclarationView.tsx` and is imported by the reports page:

```typescript
import { NEDeclarationView } from '@/extensions/ne-bilaga/NEDeclarationView'
```

### Reports Page

The **NE-bilaga** tab in `/reports` is conditionally rendered based on `entity_type`:

- **Visible** when `entity_type === 'enskild_firma'`
- **Hidden** for all other entity types (e.g. `aktiebolag`)

The entity type is fetched from `GET /api/settings` on page load. The tab shows:

1. **Info card** with "Hamta NE-bilaga" and "Ladda ner SRU-fil" buttons
2. **Warnings card** (orange) if the period is open or no data was found
3. **Company info card** with company name, org number, and fiscal year badge
4. **Revenue table** (R1-R4) with expandable account-level detail
5. **Expenses table** (R5-R10) with expandable account-level detail
6. **Result card** (R11) showing net result with green/red color coding

Each ruta row is clickable to expand and show contributing accounts with individual amounts.

## Extension Registration

The extension is registered in `lib/extensions/loader.ts`:

```typescript
import { neBilagaExtension } from '@/extensions/ne-bilaga'

const FIRST_PARTY_EXTENSIONS: Extension[] = [
  receiptOcrExtension,
  aiCategorizationExtension,
  pushNotificationsExtension,
  sruExportExtension,
  neBilagaExtension,        // ← added
]
```

The extension declares a single report type (`ne-bilaga`) for discovery via `extensionRegistry.getByCapability('reportTypes')`. It has no event handlers, no settings panel, and no sidebar items.

## Type Definitions

Canonical source: `extensions/ne-bilaga/types.ts` (re-exported from `types/index.ts` for convenience):

- **`NEDeclaration`** — Top-level response shape with fiscal year, rutor, breakdown, company info, warnings
- **`NEDeclarationRutor`** — Record of R1-R11 number values
- **`NEAccountMapping`** — Mapping config: ruta, account ranges (with exclusions), isExpense flag
- **`NE_RUTA_LABELS`** — Display labels for each ruta
- **`SRURecord`** — Single SRU field code + value pair
- **`SRUFile`** — Collection of SRU records with generation timestamp

## Files Changed

### Created

| File | Purpose |
|---|---|
| `extensions/ne-bilaga/index.ts` | Extension definition with report type registration |
| `extensions/ne-bilaga/ne-engine.ts` | Account mapping + balance calculation (moved from `lib/reports/`) |
| `extensions/ne-bilaga/types.ts` | Canonical type definitions (`NEDeclaration`, `NEDeclarationRutor`, etc.) |
| `extensions/ne-bilaga/NEDeclarationView.tsx` | UI component (extracted from reports page) |
| `app/api/extensions/ne-bilaga/route.ts` | API endpoint with json/sru format support |

### Modified

| File | Change |
|---|---|
| `lib/extensions/loader.ts` | Added `neBilagaExtension` to `FIRST_PARTY_EXTENSIONS` |
| `app/(dashboard)/reports/page.tsx` | Imports `NEDeclarationView` from extension instead of inlining it |
| `types/index.ts` | NE types replaced with re-exports from `extensions/ne-bilaga/types.ts` |

### Deleted

| File | Reason |
|---|---|
| `app/api/reports/ne-declaration/route.ts` | Replaced by `app/api/extensions/ne-bilaga/route.ts` |
| `lib/reports/ne-declaration.ts` | Dead backward-compat shim with zero importers |

### Reused (not modified)

| File | What was reused |
|---|---|
| `lib/reports/sru-generator.ts` | `generateSRUFile()`, `sruFileToString()`, `getSRUFilename()` |

## Verification

- `npx tsc --noEmit` — zero errors
- `GET /api/extensions/ne-bilaga?period_id=X&format=json` returns NE declaration data
- `GET /api/extensions/ne-bilaga?period_id=X&format=sru` downloads `.sru` file
- NE-bilaga tab visible for EF users, hidden for AB users
- Reports page renders identically to before for EF users
- Extension appears in `extensionRegistry.getAll()` and `extensionRegistry.getByCapability('reportTypes')`
- `next build` succeeds with zero errors
