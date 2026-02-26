# Workspace & UI Reference

## Workspace Components

Each extension can have a workspace page at `/e/{sector}/{slug}`.

**1. Create component:**
```typescript
// components/extensions/general/MyExtensionWorkspace.tsx
'use client'
import type { WorkspaceComponentProps } from '@/lib/extensions/workspace-registry'

export default function MyExtensionWorkspace({ userId }: WorkspaceComponentProps) {
  return <div className="space-y-6">{/* Extension UI */}</div>
}
```

**2. Set in manifest:** `"workspace": "@/components/extensions/general/MyExtensionWorkspace"`

**3. Regenerate:** `npm run setup:extensions`

Render chain: `/e/general/my-extension` → auth+toggle check → `ExtensionWorkspaceShell` (breadcrumb+header) → your component.

Set `"workspace": null` for extensions without a dedicated page (event-only, service-only, etc.).

## Settings Panels

Declare in extension object:
```typescript
settingsPanel: { label: 'My Extension', path: '/settings/extensions/my-extension' },
```

Register panel in `lib/extensions/settings-panel-registry.tsx`:
```typescript
case 'my-extension':
  return dynamic(() => import('@/components/extensions/general/my-extension/MyExtSettings'))
```

Settings component fetches/saves via extension API routes (`GET/PUT /settings`).

## Sidebar

Enabled extensions auto-appear in the "Tillägg" sidebar section as links to `/e/{sector}/{slug}`. Additional nav items via:
```typescript
sidebarItems: [{ label: 'My Tool', icon: 'Wrench', path: '/tools/my-tool', order: 10 }]
```

## Toggle System

Toggle state stored in `extension_toggles` table `(user_id, sector_slug, extension_slug, enabled)`. Checked server-side via `isExtensionEnabled()`. Toggle changes dispatch `extension-toggle-changed` custom event.

## Hooks

```typescript
const { extensions, isLoading, refresh } = useEnabledExtensions()  // lib/extensions/hooks
const { enabled, isLoading, toggle } = useExtensionToggle('general', 'my-extension')
const { data, save, remove, getByKey } = useExtensionData('general', 'my-extension')
const { totals, monthly, totalNet } = useAccountTotals({ from, to, monthly: true })
```
