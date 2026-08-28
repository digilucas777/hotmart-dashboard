import { NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/app/api/meta/_utils'

// Usada pro bloco "Ao vivo" do painel — contadores de hoje (meia-noite local
// até agora) e % de qualidade dos eventos capi. O cliente manda start/end em
// ISO (mesmo padrão da rota /list), calculados a partir da meia-noite local
// de quem tá olhando o painel, então essa rota não precisa saber de fuso.
export async function GET(request: Request) {
  const { supabase, user } = await getAuthenticatedUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const { data: profile } = await supabase.from('user_profiles').select('role').eq('id', user.id).maybeSingle()
  if (profile?.role !== 'admin') {
    return NextResponse.json({ error: 'módulo em teste — só administradores podem usar por enquanto' }, { status: 403 })
  }

  const { searchParams } = new URL(request.url)
  const installationId = searchParams.get('installation_id')
  const start = searchParams.get('start')
  const end = searchParams.get('end')

  if (!installationId || !start || !end) {
    return NextResponse.json({ error: 'installation_id, start e end são obrigatórios' }, { status: 400 })
  }
  const startMs = Date.parse(start)
  const endMs = Date.parse(end)
  if (Number.isNaN(startMs) || Number.isNaN(endMs) || endMs <= startMs) {
    return NextResponse.json({ error: 'start/end inválidos' }, { status: 400 })
  }

  // track_events não tem user_id direto — confirma que a instalação existe
  // (a query em track_installations já é protegida por RLS: só acha se for
  // do usuário logado ou se ele for admin).
  const { data: installation } = await supabase
    .from('track_installations')
    .select('id')
    .eq('id', installationId)
    .maybeSingle()
  if (!installation) return NextResponse.json({ error: 'instalação não encontrada' }, { status: 404 })

  // Contagem via count:'exact', head:true — não baixa nenhuma linha, só o
  // total, então não esbarra no limite padrão de 1000 linhas por resposta do
  // Supabase (era exatamente isso que truncava os contadores antes: com
  // volume alto, PageView + InitiateCheckout + Purchase somavam 1000 no dia
  // e o número parava de subir).
  function baseQuery() {
    return supabase
      .from('track_events')
      .select('*', { count: 'exact', head: true })
      .eq('installation_id', installationId)
      .gte('received_at', start)
      .lt('received_at', end)
  }

  const [
    pageView, viewContent, addToCart, initiateCheckout, purchase,
    capiTotal, withFbp, withFbc, purchaseTotal, purchaseMatched,
  ] = await Promise.all([
    baseQuery().eq('event_name', 'PageView'),
    baseQuery().eq('event_name', 'ViewContent'),
    baseQuery().eq('event_name', 'AddToCart'),
    baseQuery().eq('event_name', 'InitiateCheckout'),
    baseQuery().eq('event_name', 'Purchase'),
    baseQuery().eq('source', 'capi'),
    baseQuery().eq('source', 'capi').not('fbp', 'is', null),
    baseQuery().eq('source', 'capi').not('fbc', 'is', null),
    baseQuery().eq('source', 'capi').eq('event_name', 'Purchase'),
    baseQuery().eq('source', 'capi').eq('event_name', 'Purchase').eq('session_hit', true),
  ])

  const firstError = [pageView, viewContent, addToCart, initiateCheckout, purchase, capiTotal, withFbp, withFbc, purchaseTotal, purchaseMatched]
    .find(r => r.error)?.error
  if (firstError) return NextResponse.json({ error: firstError.message }, { status: 500 })

  const capiTotalCount = capiTotal.count ?? 0
  const purchaseTotalCount = purchaseTotal.count ?? 0

  return NextResponse.json({
    counts_today: {
      PageView: pageView.count ?? 0,
      ViewContent: viewContent.count ?? 0,
      AddToCart: addToCart.count ?? 0,
      InitiateCheckout: initiateCheckout.count ?? 0,
      Purchase: purchase.count ?? 0,
    },
    coverage_today: {
      total: capiTotalCount,
      with_fbp_pct: capiTotalCount > 0 ? Math.round(((withFbp.count ?? 0) / capiTotalCount) * 100) : null,
      with_fbc_pct: capiTotalCount > 0 ? Math.round(((withFbc.count ?? 0) / capiTotalCount) * 100) : null,
      purchase_session_matched_pct: purchaseTotalCount > 0 ? Math.round(((purchaseMatched.count ?? 0) / purchaseTotalCount) * 100) : null,
    },
  })
}
