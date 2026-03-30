import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import DashboardNav from '@/components/dashboard/DashboardNav'
import { RecaptIdentify } from '@/components/RecaptIdentify'
import { SentryIdentify } from '@/components/SentryIdentify'
import { SandboxBanner } from '@/components/dashboard/SandboxBanner'
import { getExtensionNavItems } from '@/lib/extensions/sectors'
import { CompanyProvider } from '@/contexts/CompanyContext'
import { getActiveCompanyId } from '@/lib/company/context'
import type { EntityType, CompanyRole } from '@/types'

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

  const cookieStore = await cookies()
  const companyId = cookieStore.get('gnubok-company-id')?.value
    ?? await getActiveCompanyId(supabase, user.id)

  if (!companyId) {
    redirect('/onboarding')
  }

  // Fetch company + membership for context provider
  const [
    { data: companyRow },
    { data: memberRow },
    { data: allMemberships },
  ] = await Promise.all([
    supabase.from('companies').select('*').eq('id', companyId).single(),
    supabase.from('company_members').select('role').eq('company_id', companyId).eq('user_id', user.id).single(),
    supabase.from('company_members').select('company_id, role, companies:company_id(id, name, org_number, entity_type, created_by, archived_at, created_at, updated_at)').eq('user_id', user.id),
  ])

  if (!companyRow || !memberRow) {
    redirect('/onboarding')
  }

  const companyContextValue = {
    company: companyRow,
    role: memberRow.role as CompanyRole,
    companies: (allMemberships || []).map((m) => ({
      company: m.companies as unknown as import('@/types').Company,
      role: m.role as CompanyRole,
    })),
  }

  const [{ data: settings }, { count: uncategorizedCount }, { count: pendingOpsCount }] = await Promise.all([
    supabase
      .from('company_settings')
      .select('company_name, onboarding_complete, entity_type, is_sandbox')
      .eq('company_id', companyId)
      .single(),
    supabase
      .from('transactions')
      .select('*', { count: 'exact', head: true })
      .eq('company_id', companyId)
      .is('is_business', null),
    supabase
      .from('pending_operations')
      .select('*', { count: 'exact', head: true })
      .eq('company_id', companyId)
      .eq('status', 'pending'),
  ])

  if (!settings?.onboarding_complete) {
    redirect('/onboarding')
  }

  const entityType = (settings.entity_type as EntityType) || 'enskild_firma'

  const isSandbox = settings.is_sandbox === true

  return (
    <CompanyProvider value={companyContextValue}>
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
          pendingOperationsCount={pendingOpsCount ?? 0}
          isSandbox={isSandbox}
          extensionNavItems={getExtensionNavItems()}
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
    </CompanyProvider>
  )
}
