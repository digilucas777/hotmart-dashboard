import { NextResponse } from 'next/server'
import { createRouteSupabase } from '@/app/api/meta/_utils'
import { checkAndUpdatePages, type PageRow } from '@/lib/siteCheck'

// Checagem manual sob demanda (botão "Checar agora" em /sites). Usa o cliente
// autenticado da própria sessão do usuário — o RLS de monitored_pages/
// monitored_sites já garante que só as páginas do dono são lidas/atualizadas
// aqui, então não precisa (nem pode) usar a service role key.
export async function POST(request: Request) {
  const supabase = await createRouteSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => ({}))
  const siteId = typeof body?.siteId === 'string' ? body.siteId : null

  let query = supabase
    .from('monitored_pages')
    .select('id, url, ultimo_status, monitored_sites!inner(user_id, nome)')
    .eq('ativo', true)
  if (siteId) query = query.eq('site_id', siteId)

  const { data: pages, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!pages || pages.length === 0) return NextResponse.json({ ok: true, checadas: 0 })

  const resumo = await checkAndUpdatePages(supabase, pages as unknown as PageRow[])

  return NextResponse.json({ ok: true, checadas: resumo.length, resultados: resumo })
}
