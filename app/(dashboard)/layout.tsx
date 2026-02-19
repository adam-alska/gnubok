import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import DashboardNav from '@/components/dashboard/DashboardNav'
import { ChatWidget } from '@/components/chat'
import type { EntityType } from '@/types'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const { data: settings } = await supabase
    .from('company_settings')
    .select('company_name, onboarding_complete, entity_type')
    .eq('user_id', user.id)
    .single()

  if (!settings?.onboarding_complete) {
    redirect('/onboarding')
  }

  const entityType = (settings.entity_type as EntityType) || 'enskild_firma'

  return (
    <div className="min-h-screen bg-background">
      {/* Skip to content link for keyboard/screen reader users */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-[100] focus:px-4 focus:py-2 focus:bg-primary focus:text-primary-foreground focus:rounded-lg focus:text-sm focus:font-medium"
      >
        Hoppa till innehåll
      </a>
      <DashboardNav
        companyName={settings.company_name || 'Min verksamhet'}
        entityType={entityType}
      />
      <main id="main-content" className="pb-20 md:pb-0 md:pl-[232px]" role="main">
        <div className="max-w-5xl mx-auto px-5 py-8 md:px-8 md:py-10">
          {children}
        </div>
      </main>
      <ChatWidget />
    </div>
  )
}
