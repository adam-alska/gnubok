import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import DashboardNav from '@/components/dashboard/DashboardNav'
import { RecaptIdentify } from '@/components/RecaptIdentify'
import { SentryIdentify } from '@/components/SentryIdentify'
import { SandboxBanner } from '@/components/dashboard/SandboxBanner'
import { getExtensionNavItems } from '@/lib/extensions/sectors'
import { LEGACY_GENERAL_EXTENSIONS } from '@/lib/extensions/toggle-check'
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

  const [{ data: settings }, { count: uncategorizedCount }, { data: enabledToggles }] = await Promise.all([
    supabase
      .from('company_settings')
      .select('company_name, onboarding_complete, entity_type, is_sandbox')
      .eq('user_id', user.id)
      .single(),
    supabase
      .from('transactions')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .is('is_business', null),
    supabase
      .from('extension_toggles')
      .select('sector_slug, extension_slug')
      .eq('user_id', user.id)
      .eq('enabled', true),
  ])

  if (!settings?.onboarding_complete) {
    redirect('/onboarding')
  }

  const entityType = (settings.entity_type as EntityType) || 'enskild_firma'

  const isSandbox = settings.is_sandbox === true

  return (
    <div className="min-h-screen bg-background">
      {/* Skip to content link for keyboard/screen reader users */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-[100] focus:px-4 focus:py-2 focus:bg-primary focus:text-primary-foreground focus:rounded-lg focus:text-sm focus:font-medium"
      >
        Hoppa till innehåll
      </a>
      {isSandbox && <SandboxBanner />}
      <DashboardNav
        companyName={settings.company_name || 'Min verksamhet'}
        entityType={entityType}
        uncategorizedTransactionCount={uncategorizedCount ?? 0}
        isSandbox={isSandbox}
        extensionNavItems={getExtensionNavItems([
          ...(enabledToggles || []),
          ...LEGACY_GENERAL_EXTENSIONS
            .filter(slug => !(enabledToggles || []).some(t => t.sector_slug === 'general' && t.extension_slug === slug))
            .map(slug => ({ sector_slug: 'general', extension_slug: slug })),
        ])}
      />
      <main id="main-content" className="safe-area-main-padding md:!pb-0 md:pl-[232px]" role="main">
        <div className="max-w-5xl mx-auto px-5 py-8 md:px-8 md:py-10">
          {children}
        </div>
      </main>
      <SentryIdentify userId={user.id} email={user.email} />
      {!isSandbox && (
        <RecaptIdentify
          userId={user.id}
          email={user.email}
          displayName={settings.company_name || undefined}
        />
      )}
    </div>
  )
}
