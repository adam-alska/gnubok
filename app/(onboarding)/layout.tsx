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
    <>
      {children}
      {user && <SentryIdentify userId={user.id} email={user.email} />}
    </>
  )
}
