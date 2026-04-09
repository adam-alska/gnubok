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
      {user && <SentryIdentify userId={user.id} email={user.email} />}
    </div>
  )
}
