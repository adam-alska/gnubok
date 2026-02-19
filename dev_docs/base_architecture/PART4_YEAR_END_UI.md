# Part 4: Year-End Closing UI (Årsbokslut)

## Overview

Part 4 implements the **user interface for year-end closing** — a 4-step wizard that guides the user through validating, previewing, and executing the annual closing per Bokföringslagen. This is a pure frontend implementation; all backend services, API routes, and database migrations were completed in Part 2.

**Depends on Part 2:** period-service, year-end-service, fiscal period API routes (`GET`/`POST` at `/api/bookkeeping/fiscal-periods/[id]/year-end`).

---

## What Was Built

### Year-End Wizard Page

**File:** `app/(dashboard)/bookkeeping/year-end/page.tsx`

A single `'use client'` page containing a 4-step wizard at route `/bookkeeping/year-end`. The wizard maps directly to the existing API surface:

| Step | Label | API Call | Purpose |
|------|-------|----------|---------|
| 0 | Välj period | `GET /api/bookkeeping/fiscal-periods` | Select which fiscal period to close |
| 1 | Validering | `GET /api/bookkeeping/fiscal-periods/[id]/year-end` | Check readiness (errors + warnings) |
| 2 | Förhandsgranskning | *(uses data from step 1)* | Review closing entry before committing |
| 3 | Genomför | `POST /api/bookkeeping/fiscal-periods/[id]/year-end` | Execute with confirmation dialog |

#### Step 0: Period Selection

- Fetches all fiscal periods on mount
- Pre-selects the first open (non-closed) period
- Displays each period as a selectable card with:
  - Period name and date range (`period_start – period_end`)
  - Status badge: **Öppen** (default), **Låst** (outline), **Stängd** (secondary, disabled)
- Closed periods are visually dimmed and not selectable

#### Step 1: Validation

- Calls `GET /api/bookkeeping/fiscal-periods/[id]/year-end` which returns `{ validation, preview }` from parallel `validateYearEndReadiness()` + `previewYearEndClosing()`
- Displays a ready/not-ready banner:
  - Green `CheckCircle2` + "Perioden är redo för årsbokslut" when `validation.ready === true`
  - Red `AlertCircle` + "Perioden kan inte stängas ännu" when `validation.ready === false`
- **Blocking errors** (red): draft entries, unbalanced trial balance, already closed, closing entry exists
- **Warnings** (amber): voucher number gaps, no posted entries
- Detail cards showing draft count and trial balance status
- Voucher gap badges when gaps exist
- "Validera igen" button to re-run checks after fixing issues
- "Nästa" button gated on `validation.ready === true`

#### Step 2: Preview

Three cards displaying the preview data:

1. **Net result highlight** — Large centered number with color coding (green for profit, red for loss), closing account label (e.g. "2099 — Årets resultat")
2. **Result account summary** — Table of class 3–8 accounts being zeroed (account number, name, amount)
3. **Closing journal lines** — Expandable/collapsible table showing the full closing entry (account, description, debit, credit) with a totals row

#### Step 3: Execute

Pre-execution state:
- Summary of actions: closing entry creation, period lock + close, next period + opening balances
- Irreversibility warning banner (amber) referencing Bokföringslagen
- "Genomför årsbokslut" button (destructive variant) opens a confirmation dialog

Confirmation dialog (`Dialog` component):
- Repeats period name and net result
- "Avbryt" and "Stäng perioden" (destructive) buttons

Post-execution success state:
- `SuccessAnimation` overlay with celebration variant
- Summary card showing: closing entry link, closed period badge, new period name, opening balances status
- "Tillbaka till bokföring" navigation

---

### Bookkeeping Page Link

**File:** `app/(dashboard)/bookkeeping/page.tsx`

Added a header action button linking to the year-end wizard:

```tsx
<Button variant="outline" asChild>
  <Link href="/bookkeeping/year-end">
    <Lock className="mr-2 h-4 w-4" />
    Årsbokslut
  </Link>
</Button>
```

The header was restructured from a plain `<div>` to a `flex items-center justify-between` layout to accommodate the button alongside the existing title and description.

---

## User Flow Diagram

```
/bookkeeping
    │
    │  Click "Årsbokslut" button
    ▼
┌─────────────────────────────────────────────────────┐
│  Step 0: Välj period                                │
│  ┌───────────────────────────────────┐              │
│  │ FY 2024  (2024-01-01 – 2024-12-31) │  [Öppen]   │
│  └───────────────────────────────────┘              │
│  ┌───────────────────────────────────┐              │
│  │ FY 2023  (2023-01-01 – 2023-12-31) │  [Stängd]  │
│  └───────────────────────────────────┘              │
│                                        [Nästa →]    │
└────────────────────────┬────────────────────────────┘
                         │
    GET /api/bookkeeping/fiscal-periods/[id]/year-end
                         │
                         ▼
┌─────────────────────────────────────────────────────┐
│  Step 1: Validering                                 │
│  ✅ Perioden är redo för årsbokslut                  │
│  ─ or ─                                             │
│  ❌ 3 draft entries must be posted                   │
│  ⚠️ Voucher gaps: 5–7                               │
│                                                     │
│  [← Tillbaka]  [Validera igen]  [Nästa →]           │
└────────────────────────┬────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────┐
│  Step 2: Förhandsgranskning                         │
│                                                     │
│           Årets resultat: 150 000,00 kr             │
│           Bokförs på 2099 — Årets resultat          │
│                                                     │
│  ┌─ Resultatkonton som nollställs ────────────────┐ │
│  │ 3001  Tjänsteintäkter         -500 000,00      │ │
│  │ 5010  Lokalhyra                200 000,00      │ │
│  │ 6570  Bankavgifter             150 000,00      │ │
│  └────────────────────────────────────────────────┘ │
│                                                     │
│  [← Tillbaka]                         [Nästa →]     │
└────────────────────────┬────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────┐
│  Step 3: Genomför                                   │
│                                                     │
│  ⚠️ Denna åtgärd kan inte ångras                     │
│                                                     │
│  [← Tillbaka]          [Genomför årsbokslut]        │
│                              │                      │
│                    ┌─────────▼──────────┐           │
│                    │ Bekräfta årsbokslut │           │
│                    │ Stäng FY 2024?      │           │
│                    │                     │           │
│                    │ [Avbryt] [Stäng]    │           │
│                    └─────────┬──────────┘           │
│                              │                      │
│            POST /api/.../year-end                    │
│                              │                      │
│                              ▼                      │
│  ✅ Årsbokslutet är genomfört                        │
│  • Bokslutsverifikation      [Visa]                  │
│  • Period stängd             [Stängd]                │
│  • Nytt räkenskapsår         FY 2025                 │
│  • Ingående balanser         [Skapade]               │
│                                                     │
│            [← Tillbaka till bokföring]               │
└─────────────────────────────────────────────────────┘
```

---

## State Management

All state is local to the page component via `useState`:

| State | Type | Purpose |
|-------|------|---------|
| `step` | `number` (0–3) | Current wizard step |
| `periods` | `FiscalPeriod[]` | All fiscal periods from API |
| `selectedPeriodId` | `string` | Currently selected period |
| `validation` | `YearEndValidation \| null` | Validation result from API |
| `preview` | `YearEndPreview \| null` | Preview result from API |
| `result` | `YearEndResult \| null` | Execution result from API |
| `loading` | `boolean` | Loading state for validation fetch |
| `loadingPeriods` | `boolean` | Loading state for periods fetch |
| `executing` | `boolean` | Loading state for POST execution |
| `error` | `string \| null` | Error message banner |
| `showConfirmDialog` | `boolean` | Confirmation dialog visibility |
| `showLinesDetail` | `boolean` | Expandable closing lines table |
| `showSuccess` | `boolean` | Success animation overlay |

---

## Reused Components

| Component | From | Used for |
|-----------|------|----------|
| `Card`, `CardContent`, `CardHeader`, `CardTitle` | `components/ui/card.tsx` | All step containers |
| `Button` | `components/ui/button.tsx` | Navigation, actions, links |
| `Badge` | `components/ui/badge.tsx` | Period status, voucher gaps, success indicators |
| `Table`, `TableBody`, `TableCell`, `TableHead`, `TableHeader`, `TableRow` | `components/ui/table.tsx` | Result accounts + closing lines |
| `Dialog`, `DialogContent`, `DialogHeader`, `DialogTitle`, `DialogDescription`, `DialogFooter` | `components/ui/dialog.tsx` | Execution confirmation |
| `Skeleton` | `components/ui/skeleton.tsx` | Loading states |
| `SuccessAnimation` | `components/ui/success-animation.tsx` | Post-execution celebration overlay |
| `useToast` | `components/ui/use-toast.tsx` | Error notifications |
| `formatAmount()` | Inline helper (same pattern as `reports/page.tsx`) | Swedish locale number formatting |

Lucide icons used: `CheckCircle2`, `AlertCircle`, `AlertTriangle`, `ArrowLeft`, `ArrowRight`, `Loader2`, `Lock`, `BookOpen`, `ChevronDown`, `ChevronUp`.

---

## API Endpoints Used

No new API routes were created. The wizard consumes existing endpoints from Part 2:

| Method | Path | Response | Used in step |
|--------|------|----------|--------------|
| `GET` | `/api/bookkeeping/fiscal-periods` | `{ data: FiscalPeriod[] }` | 0 (period list) |
| `GET` | `/api/bookkeeping/fiscal-periods/[id]/year-end` | `{ data: { validation: YearEndValidation, preview: YearEndPreview } }` | 1 + 2 (validation + preview) |
| `POST` | `/api/bookkeeping/fiscal-periods/[id]/year-end` | `{ data: YearEndResult }` | 3 (execution) |

---

## Files Changed/Created

| File | Action |
|------|--------|
| `app/(dashboard)/bookkeeping/year-end/page.tsx` | **Created** — 4-step year-end closing wizard (700 lines) |
| `app/(dashboard)/bookkeeping/page.tsx` | **Modified** — Added "Årsbokslut" link button in header, restructured header layout |

**No new API routes.** No backend changes. No new dependencies. No database migrations.

---

## Verification Checklist

- [x] `npx tsc --noEmit` — zero TypeScript errors
- [x] `npm run build` — builds clean, `/bookkeeping/year-end` route registered
- [x] `npx vitest run` — all 78 existing tests pass
- [ ] Navigate to `/bookkeeping` → "Årsbokslut" button visible in header
- [ ] Click "Årsbokslut" → wizard loads at step 0 with period selector
- [ ] Closed periods appear dimmed and cannot be selected
- [ ] Select open period → "Nästa" → validation step loads with skeleton, then shows results
- [ ] Period with draft entries → red error "X draft journal entries must be posted or deleted"
- [ ] Period with unbalanced trial balance → red error "Trial balance is not balanced"
- [ ] Period with voucher gaps → amber warning with gap badges
- [ ] Fully valid period → green "Perioden är redo för årsbokslut", "Nästa" enabled
- [ ] Preview step → net result displayed with correct color, result accounts table, expandable closing lines
- [ ] EF entity type → closing account shows "2010 — Eget kapital"
- [ ] AB entity type → closing account shows "2099 — Årets resultat"
- [ ] Execute step → irreversibility warning shown, "Genomför årsbokslut" opens confirmation dialog
- [ ] Confirmation dialog → "Stäng perioden" triggers POST, success animation + summary displayed
- [ ] Success state → shows new period name, closing entry link, opening balances badge
