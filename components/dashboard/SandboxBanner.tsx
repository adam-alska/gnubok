'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { X } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

export function SandboxBanner() {
  const [dismissed, setDismissed] = useState(false)
  const router = useRouter()

  if (dismissed) return null

  async function handleCreateAccount() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/register')
  }

  return (
    <div className="relative z-50 flex items-center justify-center gap-3 bg-amber-500/90 px-4 py-2 text-sm text-amber-950">
      <span className="font-medium">
        Sandlådemiljö — dina data raderas automatiskt efter 24 timmar
      </span>
      <button
        onClick={handleCreateAccount}
        className="rounded-md bg-amber-950/15 px-3 py-0.5 text-xs font-semibold hover:bg-amber-950/25 transition-colors"
      >
        Skapa konto
      </button>
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
