import Link from 'next/link'
import { Settings } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { SentryIdentify } from '@/components/SentryIdentify'

export default async function OnboardingLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="w-full max-w-lg px-5">
        {children}
      </div>

      {/* Escape hatch: a user who archived their last company can still
          reach account settings (and the delete-account flow) from here. */}
      {user && (
        <Link
          href="/settings/account"
          aria-label="Kontoinställningar"
          title="Kontoinställningar"
          className="fixed bottom-5 right-5 z-50 flex h-10 w-10 items-center justify-center rounded-full border border-border bg-background/80 text-muted-foreground shadow-sm backdrop-blur transition-colors hover:border-foreground/40 hover:text-foreground"
        >
          <Settings className="h-4 w-4" />
        </Link>
      )}

      {user && <SentryIdentify userId={user.id} email={user.email} />}
    </div>
  )
}
