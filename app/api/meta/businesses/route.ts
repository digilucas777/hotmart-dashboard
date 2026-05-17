import { NextResponse } from 'next/server'
import { getAuthenticatedUser } from '../_utils'

export async function GET() {
  const { supabase, user } = await getAuthenticatedUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const [{ data: connections }, { data: businesses }] = await Promise.all([
    supabase
      .from('facebook_connections')
      .select('id, facebook_user_name, status, expires_at, created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false }),
    supabase
      .from('business_managers')
      .select('id, bm_id, name, verification_status, selected')
      .eq('user_id', user.id)
      .order('name'),
  ])

  return NextResponse.json({
    connections: connections ?? [],
    businesses: businesses ?? [],
  })
}
