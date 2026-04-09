import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import WelcomeOnboarding from '@/components/dashboard/WelcomeOnboarding'

export const dynamic = 'force-dynamic'

export default async function OnboardingPage() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    redirect('/login')
  }

  // Check if user already has companies (adding another vs first-time)
  const { data: existingMembership } = await supabase
    .from('company_members')
    .select('company_id')
    .eq('user_id', user.id)
    .limit(1)
    .maybeSingle()

  const hasCompanies = !!existingMembership

  // Fetch profile and team
  const [{ data: profile }, { data: teamMembership }] = await Promise.all([
    supabase.from('profiles').select('full_name').eq('id', user.id).single(),
    supabase.from('team_members').select('team_id').eq('user_id', user.id).limit(1).maybeSingle(),
  ])

  let teamId = teamMembership?.team_id

  // Ensure user has a team (fallback for edge cases)
  if (!teamId) {
    const { data: newTeamId } = await supabase.rpc('ensure_user_team')
    teamId = newTeamId
  }

  if (!teamId) {
    redirect('/login')
  }

  const firstName = profile?.full_name?.split(' ')[0] || null

  return <WelcomeOnboarding firstName={firstName} teamId={teamId} skipWelcome />
}
