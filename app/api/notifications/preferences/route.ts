import { NextResponse } from 'next/server'
import { getAuthenticatedUser } from '../../meta/_utils'

type PrefInput = {
  projeto_id: string
  venda_realizada: boolean
  boleto_gerado: boolean
  pix_gerado: boolean
  vendas_pendentes: boolean
  reembolso: boolean
  venda_cancelada: boolean
}

export async function GET() {
  const { supabase, user } = await getAuthenticatedUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const { data, error } = await supabase
    .from('notification_preferences')
    .select('*')
    .eq('user_id', user.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ preferences: data ?? [] })
}

export async function POST(request: Request) {
  const { supabase, user } = await getAuthenticatedUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const { preferences } = await request.json() as { preferences?: PrefInput[] }
  if (!Array.isArray(preferences)) {
    return NextResponse.json({ error: 'preferences must be an array' }, { status: 400 })
  }

  const rows = preferences.map(p => ({ ...p, user_id: user.id }))
  const { error } = await supabase
    .from('notification_preferences')
    .upsert(rows, { onConflict: 'user_id,projeto_id' })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
