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
    <div className="relative z-50 flex items-center justify-center gap-3 bg-warning px-4 py-2 text-sm text-warning-foreground">
      <span className="font-medium">
        Sandlådemiljö — dina data raderas automatiskt efter 24 timmar
      </span>
      <button
        onClick={handleCreateAccount}
        className="rounded-md bg-warning-foreground/15 px-3 py-0.5 text-xs font-semibold hover:bg-warning-foreground/25 transition-colors"
      >
        Skapa konto
      </button>
      <button
        onClick={() => setDismissed(true)}
        className="absolute right-3 top-1/2 -translate-y-1/2 rounded p-0.5 hover:bg-warning-foreground/15 transition-colors"
        aria-label="Stäng"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}
