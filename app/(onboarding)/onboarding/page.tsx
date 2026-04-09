import { redirect } from 'next/navigation'

// Onboarding now happens inline on the dashboard.
// This page redirects to / for backwards compatibility (bookmarks, email links).
export default function OnboardingPage() {
  redirect('/')
}
