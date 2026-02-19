import { describe, it, expect, beforeEach, vi } from 'vitest'
import { extensionRegistry } from '../registry'
import { eventBus } from '@/lib/events/bus'
import type { Extension } from '../types'

beforeEach(() => {
  extensionRegistry.clear()
  eventBus.clear()
})

function makeExtension(overrides: Partial<Extension> = {}): Extension {
  return {
    id: 'test-ext',
    name: 'Test Extension',
    version: '1.0.0',
    ...overrides,
  }
}

describe('ExtensionRegistry', () => {
  it('register() stores extension, queryable via get() and getAll()', () => {
    const ext = makeExtension()
    extensionRegistry.register(ext)

    expect(extensionRegistry.get('test-ext')).toBe(ext)
    expect(extensionRegistry.getAll()).toEqual([ext])
  })

  it('register() wires event handlers to the bus', async () => {
    const handler = vi.fn()
    const ext = makeExtension({
      id: 'event-ext',
      eventHandlers: [{ eventType: 'journal_entry.committed', handler }],
    })

    extensionRegistry.register(ext)

    await eventBus.emit({
      type: 'journal_entry.committed',
      payload: { entry: { id: 'e1' } as never, userId: 'u1' },
    })

    expect(handler).toHaveBeenCalledWith({ entry: { id: 'e1' }, userId: 'u1' })
  })

  it('register() skips duplicate registration (same id)', () => {
    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const ext1 = makeExtension()
    const ext2 = makeExtension({ name: 'Duplicate' })

    extensionRegistry.register(ext1)
    extensionRegistry.register(ext2)

    // Original is kept
    expect(extensionRegistry.get('test-ext')!.name).toBe('Test Extension')
    expect(extensionRegistry.getAll()).toHaveLength(1)

    consoleSpy.mockRestore()
  })

  it('unregister() removes extension and unsubscribes handlers', async () => {
    const handler = vi.fn()
    const ext = makeExtension({
      id: 'removable',
      eventHandlers: [{ eventType: 'journal_entry.committed', handler }],
    })

    extensionRegistry.register(ext)
    extensionRegistry.unregister('removable')

    expect(extensionRegistry.get('removable')).toBeUndefined()

    await eventBus.emit({
      type: 'journal_entry.committed',
      payload: { entry: { id: 'e1' } as never, userId: 'u1' },
    })

    expect(handler).not.toHaveBeenCalled()
  })

  it('getByCapability() filters correctly', () => {
    const ext1 = makeExtension({
      id: 'with-settings',
      settingsPanel: { label: 'Test', path: '/test' },
    })
    const ext2 = makeExtension({ id: 'without-settings' })

    extensionRegistry.register(ext1)
    extensionRegistry.register(ext2)

    const withSettings = extensionRegistry.getByCapability('settingsPanel')
    expect(withSettings).toHaveLength(1)
    expect(withSettings[0].id).toBe('with-settings')
  })

  it('clear() removes all extensions and unsubscribes all handlers', async () => {
    const handler1 = vi.fn()
    const handler2 = vi.fn()

    extensionRegistry.register(
      makeExtension({
        id: 'ext1',
        eventHandlers: [{ eventType: 'journal_entry.committed', handler: handler1 }],
      })
    )
    extensionRegistry.register(
      makeExtension({
        id: 'ext2',
        eventHandlers: [{ eventType: 'journal_entry.drafted', handler: handler2 }],
      })
    )

    extensionRegistry.clear()

    expect(extensionRegistry.getAll()).toHaveLength(0)

    await eventBus.emit({
      type: 'journal_entry.committed',
      payload: { entry: { id: 'e1' } as never, userId: 'u1' },
    })
    await eventBus.emit({
      type: 'journal_entry.drafted',
      payload: { entry: { id: 'e1' } as never, userId: 'u1' },
    })

    expect(handler1).not.toHaveBeenCalled()
    expect(handler2).not.toHaveBeenCalled()
  })
})
