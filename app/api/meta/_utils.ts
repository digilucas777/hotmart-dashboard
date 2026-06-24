import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export const META_API_VERSION = 'v20.0'

export async function createRouteSupabase() {
  const cookieStore = await cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options),
          )
        },
      },
    },
  )
}

export async function getAuthenticatedUser() {
  const supabase = await createRouteSupabase()
  const { data: { user }, error } = await supabase.auth.getUser()
  return { supabase, user, error }
}

export async function metaFetch<T>(path: string, accessToken: string): Promise<T> {
  const separator = path.includes('?') ? '&' : '?'
  const response = await fetch(`https://graph.facebook.com/${META_API_VERSION}${path}${separator}access_token=${encodeURIComponent(accessToken)}`, {
    cache: 'no-store',
  })

  if (!response.ok) {
    const message = await response.text()
    throw new Error(message || 'Meta API error')
  }

  return response.json() as Promise<T>
}
