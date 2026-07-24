import { NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/app/api/meta/_utils'
import { mapInstallationRow, type InstallationRow } from '@/lib/track/mapRow'

const SELECT = '*, track_pixels(*), track_domains(*), track_triggers(*)'

export async function GET() {
  const { supabase, user } = await getAuthenticatedUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const { data: profile } = await supabase.from('user_profiles').select('role').eq('id', user.id).maybeSingle()
  if (profile?.role !== 'admin') {
    return NextResponse.json({ error: 'módulo em teste — só administradores podem usar por enquanto' }, { status: 403 })
  }

  const { data, error } = await supabase
    .from('track_installations')
    .select(SELECT)
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const installations = ((data ?? []) as unknown as InstallationRow[]).map(mapInstallationRow)
  return NextResponse.json({ installations })
}
