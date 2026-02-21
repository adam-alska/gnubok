'use client'

import { useState, useEffect, useCallback } from 'react'
import type { ExtensionToggle } from './types'

export function useEnabledExtensions() {
  const [extensions, setExtensions] = useState<ExtensionToggle[]>([])
  const [isLoading, setIsLoading] = useState(true)

  const refresh = useCallback(async () => {
    setIsLoading(true)
    try {
      const res = await fetch('/api/extensions/toggles')
      if (res.ok) {
        const { data } = await res.json()
        setExtensions(data ?? [])
      }
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  return { extensions, isLoading, refresh }
}

export function useExtensionToggle(sectorSlug: string, extensionSlug: string) {
  const [enabled, setEnabled] = useState(false)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const check = async () => {
      setIsLoading(true)
      try {
        const res = await fetch(`/api/extensions/toggles/${sectorSlug}/${extensionSlug}`)
        if (res.ok) {
          const { data } = await res.json()
          setEnabled(data?.enabled ?? false)
        }
      } finally {
        setIsLoading(false)
      }
    }
    check()
  }, [sectorSlug, extensionSlug])

  const toggle = useCallback(async () => {
    const newValue = !enabled
    setEnabled(newValue) // Optimistic update
    try {
      const res = await fetch('/api/extensions/toggles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sector_slug: sectorSlug,
          extension_slug: extensionSlug,
          enabled: newValue,
        }),
      })
      if (!res.ok) {
        setEnabled(!newValue) // Revert on error
      } else {
        // Notify other components about the toggle change
        window.dispatchEvent(new CustomEvent('extension-toggle-changed', {
          detail: { sectorSlug, extensionSlug, enabled: newValue },
        }))
      }
    } catch {
      setEnabled(!newValue) // Revert on error
    }
  }, [enabled, sectorSlug, extensionSlug])

  return { enabled, isLoading, toggle }
}
