import { NextResponse } from 'next/server'
import { createRouteSupabase } from '@/app/api/meta/_utils'
import { checkCloaker } from '@/lib/siteCheck'

// Checagem sob demanda da marca <!-- pagina:black --> numa URL — usada tanto
// pelo botão "Verificar marcação" quanto como pré-condição pra ativar a
// checagem de cloacker numa página (não faz sentido ativar sem a marca lá).
export async function POST(request: Request) {
  const supabase = await createRouteSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => ({}))
  const url = typeof body?.url === 'string' ? body.url : null
  if (!url) return NextResponse.json({ error: 'url obrigatória' }, { status: 400 })

  const status = await checkCloaker(url)
  return NextResponse.json({ status })
}
