'use server'

import { createClient } from '@/lib/supabase/server'
import { setActiveCompany } from '@/lib/company/context'
import { revalidatePath } from 'next/cache'

export async function switchCompany(companyId: string): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return { error: 'Unauthorized' }
  }

  try {
    await setActiveCompany(supabase, user.id, companyId)
    revalidatePath('/')
    return {}
  } catch {
    return { error: 'Du har inte tillgång till detta företag.' }
  }
}
