import { NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/app/api/meta/_utils'
import { canManageTracking } from '@/app/api/track/_utils'
import { mapInstallationRow, type InstallationRow } from '@/lib/track/mapRow'

const SELECT = '*, track_pixels(*), track_domains(*), track_triggers(*)'

export async function GET() {
  const { supabase, user } = await getAuthenticatedUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  if (!(await canManageTracking(supabase, user.id))) {
    return NextResponse.json({ error: 'você não tem permissão de gerenciar rastreamento' }, { status: 403 })
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
