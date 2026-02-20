---
name: erp-api-route
description: "Generate Next.js 16 API routes for erp-base with correct auth guards, Supabase client usage, event emission, journal entry creation, and error handling. Use when creating new API endpoints in app/api/. Handles the Next.js 16 async params pattern, ensureInitialized() for events, non-blocking journal entry wrapping, and defense-in-depth user_id filtering."
---

# ERP API Route Generator

## Standard Route Template

```typescript
import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data, error } = await supabase
    .from('table')
    .select('*')
    .eq('user_id', user.id)  // Defense in depth alongside RLS
    .order('created_at', { ascending: false })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ data })
}
```

## Route That Emits Events

Add at module level (outside the handler):

```typescript
import { eventBus } from '@/lib/events/bus'
import { ensureInitialized } from '@/lib/init'

ensureInitialized()  // MUST be module-level — loads extensions
```

Then emit after successful operations:

```typescript
await eventBus.emit('invoice.created', { invoice: result, userId: user.id })
```

## Dynamic Route Params (Next.js 16)

Params are a Promise — must await:

```typescript
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params  // MUST await
  // ...
}
```

## Non-Blocking Journal Entry Creation

Journal entry failures must never block the business operation:

```typescript
try {
  const entry = await createXxxJournalEntry(user.id, ...)
  if (entry) {
    await supabase.from('table')
      .update({ journal_entry_id: entry.id })
      .eq('id', id)
  }
} catch (err) {
  console.error('Failed to create journal entry:', err)
  // Continue — don't fail the request
}
```

## Response Conventions

- Success: `NextResponse.json({ data: result })`
- Success with count: `NextResponse.json({ data, count })`
- Error: `NextResponse.json({ error: 'message' }, { status: N })`

## DB Query Pattern

Every query re-filters by `user_id` as defense in depth:

```typescript
const { data, error } = await supabase
  .from('table')
  .select('*')
  .eq('user_id', user.id)  // Always include
  .eq('id', id)

if (error) {
  return NextResponse.json({ error: error.message }, { status: 500 })
}
if (!data) {
  return NextResponse.json({ error: 'Not found' }, { status: 404 })
}
```

## Common Mistakes

1. Forgetting `ensureInitialized()` on routes that emit events — events silently won't fire
2. Using `params.id` instead of `(await params).id` — Next.js 16 breaking change
3. Missing `user_id` filter on queries — relies solely on RLS
4. Blocking on journal entry failure — must wrap in try/catch
5. Returning `{ message }` instead of `{ error }` on failure — inconsistent with codebase
6. Forgetting `await` on `createClient()` — it's async in server context
