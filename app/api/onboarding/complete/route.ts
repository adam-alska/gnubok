import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { generateChecklistTasks } from '@/lib/onboarding/checklist-generator'
import type { OnboardingCompletePayload } from '@/types/onboarding'

export async function POST(request: Request) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = (await request.json()) as OnboardingCompletePayload
  const { selectedSector, selectedModules, businessProfile } = body

  if (!selectedSector || !selectedModules || selectedModules.length === 0) {
    return NextResponse.json(
      { error: 'Missing required fields: selectedSector, selectedModules' },
      { status: 400 }
    )
  }

  // 1. Update company_settings with selected sector, modules, and business profile
  const { error: settingsError } = await supabase
    .from('company_settings')
    .update({
      selected_sector: selectedSector,
      selected_modules: selectedModules,
      business_profile: businessProfile || {},
    })
    .eq('user_id', user.id)

  if (settingsError) {
    return NextResponse.json(
      { error: `Failed to update settings: ${settingsError.message}` },
      { status: 500 }
    )
  }

  // 2. Create module_toggles for selected modules
  const moduleToggles = selectedModules.map((moduleSlug: string) => ({
    user_id: user.id,
    sector_slug: selectedSector,
    module_slug: moduleSlug,
    enabled: true,
  }))

  if (moduleToggles.length > 0) {
    const { error: togglesError } = await supabase
      .from('module_toggles')
      .upsert(moduleToggles, {
        onConflict: 'user_id,sector_slug,module_slug',
      })

    if (togglesError) {
      console.error('Failed to create module toggles:', togglesError)
      // Don't fail the entire onboarding for this
    }
  }

  // 3. Generate and insert checklist tasks
  const tasks = generateChecklistTasks(selectedSector, selectedModules)

  const checklistRows = tasks.map(task => ({
    user_id: user.id,
    task_key: task.taskKey,
    title: task.title,
    description: task.description,
    sort_order: task.sortOrder,
    is_completed: false,
  }))

  if (checklistRows.length > 0) {
    const { error: checklistError } = await supabase
      .from('onboarding_checklist')
      .upsert(checklistRows, {
        onConflict: 'user_id,task_key',
      })

    if (checklistError) {
      console.error('Failed to create checklist:', checklistError)
      // Don't fail the entire onboarding for this
    }
  }

  return NextResponse.json({
    data: {
      success: true,
      modulesActivated: selectedModules.length,
      checklistTasksCreated: tasks.length,
    },
  })
}
