import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

// During Docker builds, NEXT_PUBLIC_* vars are placeholder sentinels
// replaced at runtime by docker-entrypoint.sh.
const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const isBuildPlaceholder = url?.startsWith('__')
const safeUrl = isBuildPlaceholder ? 'https://placeholder.supabase.co' : url
const safeKey = isBuildPlaceholder ? 'placeholder' : key

export async function createClient() {
  const cookieStore = await cookies()

  return createServerClient(
    safeUrl,
    safeKey,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // The `setAll` method was called from a Server Component.
            // This can be ignored if you have middleware refreshing
            // user sessions.
          }
        },
      },
    }
  )
}

export async function createServiceClient() {
  const cookieStore = await cookies()

  return createServerClient(
    safeUrl,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // Ignore in Server Components
          }
        },
      },
    }
  )
}
