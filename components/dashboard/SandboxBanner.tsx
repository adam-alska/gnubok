'use client'

import { useState } from 'react'
import Link from 'next/link'
import { X } from 'lucide-react'

export function SandboxBanner() {
  const [dismissed, setDismissed] = useState(false)

  if (dismissed) return null

  return (
    <div className="relative z-50 flex items-center justify-center gap-3 bg-amber-500/90 px-4 py-2 text-sm text-amber-950">
      <span className="font-medium">
        Sandlådemiljö — dina data raderas automatiskt efter 24 timmar
      </span>
      <Link
        href="/register"
        className="rounded-md bg-amber-950/15 px-3 py-0.5 text-xs font-semibold hover:bg-amber-950/25 transition-colors"
      >
        Skapa konto
      </Link>
      <button
        onClick={() => setDismissed(true)}
        className="absolute right-3 top-1/2 -translate-y-1/2 rounded p-0.5 hover:bg-amber-950/15 transition-colors"
        aria-label="Stäng"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}
