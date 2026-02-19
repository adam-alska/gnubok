import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import InsightsPageContent from '@/components/insights/InsightsPageContent'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Insikter - Finansiell overblik',
}

export default async function InsightsPage() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  // Fetch company settings
  const { data: settings } = await supabase
    .from('company_settings')
    .select('company_name, entity_type')
    .eq('user_id', user.id)
    .single()

  return (
    <InsightsPageContent
      companyName={settings?.company_name || null}
    />
  )
}
