import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { notifySupabaseRecovered } from '@/lib/push'

function getServiceClient() {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceKey) return null
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

// Caso real (2026-08-20): o gateway da própria Supabase ficou degradado —
// toda consulta ficava pendurada sem nunca responder, e a Dash Speed inteira
// parecia "só fica atualizando", sem nenhum aviso. Não tem workaround pra
// isso do nosso lado (é infraestrutura de terceiro), mas dá pra detectar e
// avisar rápido em vez de só descobrir quando um usuário reclama.
//
// Aviso de QUEDA: não tem como mandar push nesse momento — pra mandar,
// precisaríamos ler push_subscriptions DA PRÓPRIA Supabase, que é exatamente
// o que está fora do ar. Por isso a checagem simplesmente falha (status
// diferente de 200) e deixa o workflow do GitHub Actions falhar também — o
// GitHub já manda e-mail automático pro dono do repositório nesse caso
// (mesmo mecanismo que já avisou de outras falhas de cron nesta sessão).
// Aviso de RECUPERAÇÃO: aqui sim dá pra mandar push pra todo mundo, porque
// se chegamos a essa resposta é porque a Supabase já está respondendo de
// novo. O workflow passa "anterior=failure" só quando a checagem anterior
// tinha falhado, pra não mandar esse push toda hora com tudo normal.
export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret) return NextResponse.json({ error: 'CRON_SECRET não configurado' }, { status: 500 })

  const auth = request.headers.get('authorization')
  if (auth !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const admin = getServiceClient()
  if (!admin) return NextResponse.json({ error: 'service key not configured' }, { status: 500 })

  const anteriorFalhou = new URL(request.url).searchParams.get('anterior') === 'failure'

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 10000)
  try {
    const { error } = await admin
      .from('vendas')
      .select('id', { head: true, count: 'exact' })
      .limit(1)
      .abortSignal(controller.signal)
    if (error) throw new Error(error.message)
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 503 },
    )
  } finally {
    clearTimeout(timeoutId)
  }

  if (anteriorFalhou) {
    await notifySupabaseRecovered()
  }

  return NextResponse.json({ ok: true, recuperado: anteriorFalhou })
}
