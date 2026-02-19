# Push Notifications Extension

## Overview

The `push-notifications` extension converts system events into instant push notifications delivered via the Web Push API. It is the third first-party extension, following `receipt-ocr` and `ai-categorization`.

The extension operates in two modes:

1. **Event-driven** — Instant notifications triggered by the event bus (`period.locked`, `receipt.matched`, etc.)
2. **Cron-based** — Scheduled checks for time-dependent conditions (upcoming tax deadlines, overdue invoices)

Both modes share a single send pipeline that handles settings checks, quiet hours, duplicate prevention, delivery, logging, and subscription cleanup.

---

## Architecture

```
                         Event Bus
                            |
                  +---------+---------+
                  |                   |
          period.locked        receipt.matched
          invoice.sent         receipt.extracted
          period.year_closed
                  |                   |
                  v                   v
          +-----------------------------+
          |   Event Handlers (index.ts) |
          |   gate: check setting       |
          |   build: payload-builders   |
          +-------------+---------------+
                        |
                        v
          +-----------------------------+       +---------------------------+
          |  sendNotificationToUser()   | <---- | Cron Scheduler            |
          |  (notification-sender.ts)   |       | (notification-scheduler)  |
          |                             |       | tax deadlines, invoices   |
          |  1. push_enabled?           |       +---------------------------+
          |  2. quiet hours?            |
          |  3. duplicate?              |
          |  4. get subscriptions       |
          |  5. web-push send           |
          |  6. log to notification_log |
          |  7. disable 410 subs        |
          +-----------------------------+
```

### File Structure

```
extensions/push-notifications/
  index.ts                  # Extension object, settings, 5 event handlers
  notification-sender.ts    # Unified send pipeline, VAPID config, helpers
  payload-builders.ts       # All notification payload constructors
  notification-scheduler.ts # Cron-based tax deadline & invoice scheduling

app/api/extensions/push-notifications/
  settings/route.ts         # GET/PATCH settings API
  cron/route.ts             # Daily cron (imports from extension)
  subscribe/route.ts        # Subscription management (imports VAPID from extension)
```

---

## Event Subscriptions

| Event | Handler | Default Enabled | Notification Content |
|-------|---------|-----------------|---------------------|
| `period.locked` | `handlePeriodLocked` | Yes | "{period.name} har lasts" |
| `period.year_closed` | `handleYearClosed` | Yes | "Arsbokslut klart for {period.name}" |
| `invoice.sent` | `handleInvoiceSent` | No | "Faktura {number} skickad" |
| `receipt.extracted` | `handleReceiptExtracted` | Yes | "Kvitto analyserat: {merchant}" |
| `receipt.matched` | `handleReceiptMatched` | Yes | "Kvitto matchat mot transaktion" |

Each event handler follows the **gate pattern**:
1. Extract `userId` from event payload
2. Load extension settings from `extension_data`
3. Check if the specific notification type is enabled
4. Build the payload via `payload-builders.ts`
5. Call `sendNotificationToUser()` from the sender module

---

## Cron Scheduling

The cron endpoint (`GET /api/extensions/push-notifications/cron`) runs daily at 09:00 via Vercel Cron and handles two time-dependent notification types:

### Tax Deadlines
Queries the `deadlines` table for uncompleted tax deadlines due in 7 days, 1 day, or today. Checks the user-level `tax_deadlines_enabled` setting in `notification_settings` before sending.

### Invoice Reminders
Queries the `invoices` table for sent/overdue invoices due in 3 days, today, or overdue by 3/7 days. Checks the user-level `invoice_reminders_enabled` setting before sending.

Both call `sendNotificationToUser()` which handles the full pipeline (quiet hours, duplicate check, send, log).

---

## Settings

### Extension Settings (event-driven toggles)

Stored in the `extension_data` table under `extension_id = 'push-notifications'`, `key = 'settings'`.

```typescript
interface PushNotificationSettings {
  periodLockedEnabled: boolean      // default: true
  periodYearClosedEnabled: boolean  // default: true
  invoiceSentEnabled: boolean       // default: false
  receiptExtractedEnabled: boolean  // default: true
  receiptMatchedEnabled: boolean    // default: true
}
```

### First-Party Settings (existing tables)

The `notification_settings` table controls transport-level and category-level preferences:

| Column | Type | Purpose |
|--------|------|---------|
| `push_enabled` | boolean | Master push toggle |
| `tax_deadlines_enabled` | boolean | Cron: tax deadline notifications |
| `invoice_reminders_enabled` | boolean | Cron: invoice due/overdue |
| `quiet_start` | text | Quiet hours start (e.g., "21:00") |
| `quiet_end` | text | Quiet hours end (e.g., "08:00") |

Both layers are checked before sending. Extension settings gate event-driven notifications; `notification_settings` gates the transport and cron-based categories.

---

## API

### GET /api/extensions/push-notifications/settings

Returns the current user's event-driven notification toggles.

**Response 200:**
```json
{
  "data": {
    "periodLockedEnabled": true,
    "periodYearClosedEnabled": true,
    "invoiceSentEnabled": false,
    "receiptExtractedEnabled": true,
    "receiptMatchedEnabled": true
  }
}
```

**Response 401:** `{ "error": "Unauthorized" }`

### PATCH /api/extensions/push-notifications/settings

Updates one or more event-driven notification toggles. Only the provided keys are updated; others remain unchanged.

**Request:**
```json
{
  "receiptExtractedEnabled": false,
  "invoiceSentEnabled": true
}
```

**Response 200:**
```json
{
  "data": {
    "periodLockedEnabled": true,
    "periodYearClosedEnabled": true,
    "invoiceSentEnabled": true,
    "receiptExtractedEnabled": false,
    "receiptMatchedEnabled": true
  }
}
```

**Response 400:** `{ "error": "No valid settings provided" }`

**Response 401:** `{ "error": "Unauthorized" }`

**Allowed keys:** `periodLockedEnabled`, `periodYearClosedEnabled`, `invoiceSentEnabled`, `receiptExtractedEnabled`, `receiptMatchedEnabled`

---

## Notification Types

The `NotificationType` union is defined in `extensions/push-notifications/types.ts` (re-exported from `types/index.ts` for convenience):

| Type | Source | Description |
|------|--------|-------------|
| `tax_deadline` | Cron | Upcoming tax deadline |
| `invoice_due` | Cron | Invoice approaching due date |
| `invoice_overdue` | Cron | Invoice past due date |
| `period_locked` | Event | Fiscal period was locked |
| `period_year_closed` | Event | Year-end closing completed |
| `receipt_extracted` | Event | Receipt OCR completed |
| `receipt_matched` | Event | Receipt matched to transaction |
| `invoice_sent` | Event | Invoice was sent |

These are stored as text in `notification_log.notification_type` (no migration needed).

---

## Database Tables Used

No new tables or migrations were required. The extension uses existing tables:

| Table | Usage |
|-------|-------|
| `push_subscriptions` | User's active Web Push subscriptions |
| `notification_settings` | Transport-level and category-level preferences |
| `notification_log` | Sent notification history (duplicate prevention) |
| `extension_data` | Event-driven toggle settings |
| `deadlines` | Tax deadline queries (cron) |
| `invoices` | Invoice due/overdue queries (cron) |

---

## Send Pipeline

`sendNotificationToUser(supabase, userId, payload, notificationType, referenceId, daysBefore?)` executes the following steps:

1. **Settings check** — Load `notification_settings` for the user. If `push_enabled` is false, skip.
2. **Quiet hours** — Convert current time to Sweden timezone (`Europe/Stockholm`). If within the user's quiet hours window, skip.
3. **Duplicate check** — Query `notification_log` for a matching `(user_id, notification_type, reference_id, days_before)` tuple. If found, skip.
4. **Get subscriptions** — Fetch all active push subscriptions from `push_subscriptions`. If none, skip.
5. **Send** — Deliver via the `web-push` library to all subscriptions using `Promise.allSettled`.
6. **Log** — Insert a record into `notification_log` with `delivery_status: 'sent'`.
7. **Cleanup** — Any subscription returning HTTP 410 (Gone) is marked `is_active: false`.

Returns `{ sent: boolean, reason?: string }` where reason can be: `push_disabled`, `quiet_hours`, `duplicate`, `no_subscriptions`, `send_failed`, or `error`.

---

## Registration

The extension is registered in `lib/extensions/loader.ts` alongside the other first-party extensions:

```typescript
const FIRST_PARTY_EXTENSIONS: Extension[] = [
  receiptOcrExtension,
  aiCategorizationExtension,
  pushNotificationsExtension,
]
```

When `loadExtensions()` is called, the registry wires up all 5 event handlers to the event bus.

---

## Refactoring Notes

### Phase 1: Logic extraction (original)

The following files were deleted. All logic was moved into the extension:

| Deleted File | Logic Moved To |
|-------------|----------------|
| `lib/push/web-push.ts` | `extensions/push-notifications/notification-sender.ts` (VAPID config, send functions, types) + `extensions/push-notifications/payload-builders.ts` (payload constructors) |
| `lib/push/notification-scheduler.ts` | `extensions/push-notifications/notification-scheduler.ts` (cron scheduling) + `extensions/push-notifications/notification-sender.ts` (quiet hours, duplicate check, logging, subscription management) |

### Phase 2: Route relocation

The API routes were moved from `app/api/push/` into the extension namespace to enforce the architecture rule that the core never depends on extension code:

| Old Path | New Path |
|----------|----------|
| `app/api/push/cron/route.ts` | `app/api/extensions/push-notifications/cron/route.ts` |
| `app/api/push/subscribe/route.ts` | `app/api/extensions/push-notifications/subscribe/route.ts` |

Updated consumers:
- `components/push/PushPrompt.tsx` — fetch URLs updated to `/api/extensions/push-notifications/subscribe`
- `components/settings/NotificationSettings.tsx` — fetch URLs updated to `/api/extensions/push-notifications/subscribe`
- `vercel.json` — cron path updated to `/api/extensions/push-notifications/cron`

### Phase 3: Type extraction

Push notification types (`PushSubscription`, `NotificationSettings`, `NotificationType`, `NotificationLog`) were moved from `types/index.ts` to `extensions/push-notifications/types.ts`. Re-exports in `types/index.ts` preserve backward compatibility.

---

## Environment Variables

The extension requires the following environment variables (unchanged from before):

| Variable | Purpose |
|----------|---------|
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | VAPID public key for client-side subscription |
| `VAPID_PRIVATE_KEY` | VAPID private key for server-side sending |
| `VAPID_SUBJECT` | VAPID subject (defaults to `mailto:support@erp-base.se`) |
| `CRON_SECRET` | Secret for authenticating cron requests |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL (used by cron service client) |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key (used by cron service client) |

---

## Testing

### Automated
- `npx tsc --noEmit` — Zero TypeScript errors
- `npx vitest run` — All 78 existing tests pass

### Manual Verification

1. **Period locked** — Lock a period via the UI. If the user has an active push subscription and `periodLockedEnabled` is true, they receive a push notification.
2. **Receipt extracted** — Upload a receipt image. After OCR completes, the `receipt.extracted` event fires and triggers a push notification.
3. **Receipt matched** — When a receipt is auto-matched to a transaction, the `receipt.matched` event triggers a push notification.
4. **Invoice sent** — Send an invoice. If `invoiceSentEnabled` is true (default: false), a push notification is sent.
5. **Year closed** — Complete a year-end closing. The `period.year_closed` event triggers a push notification.
6. **Settings API** — `GET /api/extensions/push-notifications/settings` returns default settings. `PATCH` with `{ "receiptExtractedEnabled": false }` disables that specific notification type.
7. **Cron** — `GET /api/extensions/push-notifications/cron` (with Bearer token) runs the tax deadline and invoice reminder checks using the extension's scheduler module.
8. **Disable toggle** — Set `receiptExtractedEnabled: false` via PATCH, then upload a receipt. No push notification should be sent for the extraction event.
